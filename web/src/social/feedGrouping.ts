// Collapse same-arrival bursts in the feed (the resolved bulk-import decision). The feed is
// ordered by arrival (first_sent_at desc), so a bulk logbook import — every row stamped at
// ~the same instant — arrives as a consecutive run of one actor's sends. Left raw, that run
// buries every other friend's activity. We collapse a consecutive same-actor run whose adjacent
// arrival gaps are all within BURST_WINDOW_MS into a single "Ana logged N sends" entry, but only
// when the run is at least BURST_MIN long — so ordinary session logging (a few sends) still
// renders as individual items. Pure + deterministic (no Date.now); unit-tested.

import type { SendItem } from './socialTypes'

/** Adjacent sends within this arrival gap are considered part of the same burst. */
export const BURST_WINDOW_MS = 5 * 60_000
/** A run must be at least this long to collapse; shorter runs render individually. */
export const BURST_MIN = 3

export interface SingleEntry {
  kind: 'single'
  send: SendItem
}

export interface BurstEntry {
  kind: 'burst'
  actorId: string
  handle: string
  displayName: string
  avatarUrl: string | null
  /** The run's sends, newest arrival first (same order as the feed). */
  sends: SendItem[]
  /** Newest arrival in the run — the entry's key + sort anchor. */
  firstSentAt: string
}

export type FeedEntry = SingleEntry | BurstEntry

function gapMs(a: SendItem, b: SendItem): number {
  return Math.abs(new Date(a.firstSentAt).getTime() - new Date(b.firstSentAt).getTime())
}

/**
 * Group a feed page (already ordered newest-arrival-first) into single + burst entries.
 * A run is extended while the next send is the same actor AND within BURST_WINDOW_MS of the
 * previous one; a run of >= BURST_MIN collapses to a BurstEntry, else expands to singles.
 */
export function groupFeed(sends: SendItem[]): FeedEntry[] {
  const entries: FeedEntry[] = []
  let i = 0
  while (i < sends.length) {
    let j = i + 1
    while (
      j < sends.length &&
      sends[j].actorId === sends[i].actorId &&
      gapMs(sends[j - 1], sends[j]) <= BURST_WINDOW_MS
    ) {
      j++
    }
    const run = sends.slice(i, j)
    if (run.length >= BURST_MIN) {
      entries.push({
        kind: 'burst',
        actorId: run[0].actorId,
        handle: run[0].handle,
        displayName: run[0].displayName,
        avatarUrl: run[0].avatarUrl,
        sends: run,
        firstSentAt: run[0].firstSentAt,
      })
    } else {
      for (const s of run) entries.push({ kind: 'single', send: s })
    }
    i = j
  }
  return entries
}
