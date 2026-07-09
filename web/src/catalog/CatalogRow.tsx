// A single catalog problem row: name, benchmark/favorite badges, star rating,
// repeat count, method, setter (or hold count), a trailing grade pill, and an
// optional board thumbnail. Mirrors iOS CatalogListView's row. Clickable — opens
// the detail pager (U11).

import { BadgeCheck, CheckCircle2, Heart } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogProblem } from './catalogSync'
import { ProblemMeta } from './ProblemMeta'

interface CatalogRowProps {
  problem: CatalogProblem
  board: CatalogBoardDef
  isFavorite?: boolean
  /** The user has a logged send for this problem — shows the green sent check (iOS parity). */
  isSent?: boolean
  /** Show the board thumbnail (iOS "climb previews" toggle). */
  showThumbnail?: boolean
  /** "col-row" positions from the active holds filter to ring on the thumbnail. */
  highlightHolds?: Set<string>
  onSelect?: (problem: CatalogProblem) => void
}

export function CatalogRow({
  problem,
  board,
  isFavorite = false,
  isSent = false,
  showThumbnail = false,
  highlightHolds,
  onSelect,
}: CatalogRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(problem)}
      className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      {showThumbnail && (
        <div className="w-[72px] shrink-0">
          <CatalogBoard board={board} holds={problem.holds} highlightHolds={highlightHolds} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold uppercase tracking-tight">
            {problem.name}
          </span>
          {problem.is_benchmark && (
            <BadgeCheck role="img" aria-label="Benchmark" className="size-4 shrink-0 text-benchmark" />
          )}
          {isSent && (
            <CheckCircle2 role="img" aria-label="Sent" className="size-4 shrink-0 text-success" />
          )}
          {isFavorite && (
            <Heart role="img" aria-label="Favorite" className="size-3.5 shrink-0 fill-favorite text-favorite" />
          )}
        </div>
        <ProblemMeta problem={problem} />
      </div>
      <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-sm font-bold tabular-nums text-secondary-foreground">
        {problem.grade}
      </span>
    </button>
  )
}
