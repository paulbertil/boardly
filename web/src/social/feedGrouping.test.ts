import { describe, expect, it } from 'vitest'
import { BURST_WINDOW_MS, groupFeed } from './feedGrouping'
import type { SendItem } from './socialTypes'

// Build a send with a controllable actor + arrival time (ms since epoch → ISO).
function send(actorId: string, ascentId: string, arrivalMs: number): SendItem {
  return {
    ascentId,
    actorId,
    handle: actorId,
    displayName: actorId,
    avatarUrl: null,
    sourceCatalogId: 'p',
    userProblemId: null,
    problemName: 'Prob',
    problemGrade: 'V5',
    boardLayoutId: 7,
    climbedAt: new Date(arrivalMs).toISOString(),
    firstSentAt: new Date(arrivalMs).toISOString(),
  }
}

const T = 1_000_000_000_000 // a fixed base arrival time

describe('groupFeed', () => {
  it('leaves solo and pairs of sends as individual entries', () => {
    // Two of A (a pair, below BURST_MIN) then one of B.
    const entries = groupFeed([send('A', 'a1', T), send('A', 'a2', T - 1000), send('B', 'b1', T - 2000)])
    expect(entries.every((e) => e.kind === 'single')).toBe(true)
    expect(entries).toHaveLength(3)
  })

  it('collapses a same-actor burst of 3+ within the window', () => {
    const entries = groupFeed([
      send('A', 'a1', T),
      send('A', 'a2', T - 1000),
      send('A', 'a3', T - 2000),
      send('A', 'a4', T - 3000),
      send('B', 'b1', T - 4000),
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0].kind).toBe('burst')
    if (entries[0].kind === 'burst') expect(entries[0].sends).toHaveLength(4)
    expect(entries[1].kind).toBe('single')
  })

  it('splits a run when the arrival gap exceeds the window', () => {
    // Three A's, but the third is far past the window → not part of the burst.
    const entries = groupFeed([
      send('A', 'a1', T),
      send('A', 'a2', T - 1000),
      send('A', 'a3', T - BURST_WINDOW_MS - 5000),
    ])
    // a1+a2 is a pair (2 < BURST_MIN) → two singles; a3 → one single.
    expect(entries).toHaveLength(3)
    expect(entries.every((e) => e.kind === 'single')).toBe(true)
  })

  it('does not merge different actors even at the same arrival time', () => {
    const entries = groupFeed([send('A', 'a1', T), send('B', 'b1', T), send('A', 'a2', T)])
    expect(entries).toHaveLength(3)
    expect(entries.every((e) => e.kind === 'single')).toBe(true)
  })
})
