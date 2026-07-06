// One logged-ascent row in the logbook. Shows the ascent's own data (name, grade pill
// + grade-vote arrow, stars, tries, sent/attempt, comment) enriched — where the catalog
// entry is cached — with setter, benchmark flag and a board thumbnail. Mirrors iOS
// `AscentRow`.
//
// Rows are not yet tappable-into-detail (the web app has no problem route yet): the
// `onSelect` hook is here so wiring row → problem detail is a one-liner once the router
// lands. The pencil opens the edit sheet.

import { ArrowDown, ArrowUp, BadgeCheck, Pencil, Star } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { CatalogBoard } from '../board/CatalogBoard'
import { gradeIndex } from '../board/grades'
import type { CatalogProblem } from '../catalog/catalogSync'
import { Button } from '@/components/ui/button'
import type { Ascent } from './ascents'
import { triesLabel } from './tryBucket'

interface AscentRowProps {
  ascent: Ascent
  /** Cached catalog entry for setter/benchmark/thumbnail; absent → graceful fallback. */
  catalog?: CatalogProblem
  board: CatalogBoardDef
  showThumbnail?: boolean
  onEdit: (ascent: Ascent) => void
  /** Future: navigate to problem detail. Unwired until the router lands. */
  onSelect?: (ascent: Ascent) => void
}

/** +1 harder / -1 softer / 0 same, comparing voted vs official grade. */
function voteDirection(votedGrade: string, problemGrade: string): number {
  const voted = gradeIndex(votedGrade)
  const official = gradeIndex(problemGrade)
  if (voted > official) return 1
  if (voted < official) return -1
  return 0
}

export function AscentRow({
  ascent,
  catalog,
  board,
  showThumbnail = false,
  onEdit,
  onSelect,
}: AscentRowProps) {
  const setter = catalog?.setter
  const holds = catalog?.holds
  const direction = ascent.sent ? voteDirection(ascent.votedGrade, ascent.problemGrade) : 0

  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-3 py-2.5">
      {showThumbnail && holds && (
        <button
          type="button"
          onClick={() => onSelect?.(ascent)}
          className="w-[64px] shrink-0"
          aria-label={`Open ${ascent.problemName}`}
        >
          <CatalogBoard board={board} holds={holds} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold uppercase tracking-tight">
            {ascent.problemName}
          </span>
          {catalog?.is_benchmark && (
            <BadgeCheck role="img" aria-label="Benchmark" className="size-4 shrink-0 text-benchmark" />
          )}
          {!ascent.sent && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
              Attempt
            </span>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
          {ascent.stars > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Star className="size-3" /> {ascent.stars}
            </span>
          )}
          <span className="shrink-0">{triesLabel(ascent.tries)}</span>
          {setter && <span className="truncate">by {setter}</span>}
        </div>
        {ascent.comment && (
          <p className="mt-0.5 line-clamp-2 text-xs text-foreground/70">{ascent.comment}</p>
        )}
      </div>

      {/* Grade pill + vote arrow (arrow only when the vote differs from the grade). */}
      <div className="flex shrink-0 items-center gap-1">
        {direction !== 0 && (
          <span
            className={`inline-flex items-center rounded px-1 py-0.5 text-[0.7rem] font-semibold tabular-nums ${
              direction > 0 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            }`}
          >
            {direction > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {ascent.votedGrade}
          </span>
        )}
        <span className="rounded-md bg-secondary px-2 py-1 text-sm font-bold tabular-nums text-secondary-foreground">
          {ascent.problemGrade}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit log for ${ascent.problemName}`}
        onClick={() => onEdit(ascent)}
      >
        <Pencil className="size-4" />
      </Button>
    </div>
  )
}
