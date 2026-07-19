// A horizontal strip of the session queue, shown inside the problem detail whenever the board's
// session queue is non-empty (independent of how the drawer was opened — the caller reads the live
// queue via useActiveQueueProblems). It gives a visual overview of what's up next and a tap-to-jump
// alongside the pager's prev/next: each resolved card pages the detail to that climb (and, where the
// host supports it, hands prev/next off to the queue's order), and the currently-shown one is
// highlighted when it happens to be queued. A queued climb not yet in the local catalog cache shows
// as a non-interactive placeholder card (can't page to a climb we can't render) so the strip's count
// stays in step with the queue badge and the drawer. Mirrors the BetaVideos strip's section styling.

import type { CatalogBoardDef } from '../board/boards'
import { CatalogBoard } from '../board/CatalogBoard'
import type { QueueStripEntry } from '../sessions/useActiveQueueProblems'
import { cn } from '@/lib/utils'

interface ProblemDetailQueueStripProps {
  /** The queue's active items in order — one card each (placeholder when not yet resolved). */
  items: QueueStripEntry[]
  /** The problem currently shown in the detail — its card is highlighted. */
  currentId: string
  board: CatalogBoardDef
  /** Follow the catalog "climb previews" toggle, as the queue/recents rows do. */
  showThumbnail?: boolean
  /** Page the detail to this problem (replace-navigates ?problem). Only fired for resolved cards. */
  onSelect: (id: string) => void
}

export function ProblemDetailQueueStrip({
  items,
  currentId,
  board,
  showThumbnail = true,
  onSelect,
}: ProblemDetailQueueStripProps) {
  return (
    <section aria-label="Queue" className="space-y-1.5">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Up next
      </h2>
      <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {items.map(({ sourceCatalogId, problem }, i) => {
          const active = sourceCatalogId === currentId
          const position = (
            <span className="shrink-0 text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
          )

          // Unresolved: a queued climb this device hasn't cached yet. Non-interactive (nothing to
          // page to) but still shown so the strip count matches the badge/drawer; it fills in once
          // the catalog syncs. Dashed border + muted label read as "loading".
          if (!problem) {
            return (
              <li key={sourceCatalogId} className="shrink-0 snap-start">
                <div
                  aria-label="Queued climb — loading"
                  className={cn(
                    'flex w-24 flex-col gap-1 rounded-lg border border-dashed p-1.5',
                    active ? 'border-primary bg-primary/10' : 'border-border',
                  )}
                >
                  {showThumbnail && <div className="aspect-[3/4] rounded bg-muted" />}
                  <div className="flex items-center gap-1">
                    {position}
                    <span className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-tight text-muted-foreground">
                      Queued
                    </span>
                  </div>
                </div>
              </li>
            )
          }

          return (
            <li key={sourceCatalogId} className="shrink-0 snap-start">
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(sourceCatalogId)}
                className={cn(
                  'flex w-24 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50',
                )}
              >
                {showThumbnail && (
                  <div className="overflow-hidden rounded">
                    <CatalogBoard board={board} holds={problem.holds} />
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {position}
                  <span className="min-w-0 flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-tight">
                    {problem.name}
                  </span>
                </div>
                <span className="w-fit rounded bg-secondary px-1 py-0.5 text-[0.65rem] font-bold tabular-nums text-secondary-foreground">
                  {problem.grade}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
