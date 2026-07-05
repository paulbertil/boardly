// The "Recently viewed" section pinned above the catalog list, per board+angle.
// Shows the most-recent problems (2 by default, expandable) and a Clear action.
// Ignores active filters — it's raw view history.

import { useState } from 'react'
import type { CatalogBoardDef } from '../board/boards'
import { CatalogRow } from './CatalogRow'
import type { CatalogProblem } from './catalogSync'
import { Button } from '@/components/ui/button'

const COLLAPSED_COUNT = 2

interface RecentlyViewedProps {
  problems: CatalogProblem[]
  board: CatalogBoardDef
  favoriteIds: Set<string>
  showThumbnails?: boolean
  onSelect: (problem: CatalogProblem) => void
  onClear: () => void
}

export function RecentlyViewed({
  problems,
  board,
  favoriteIds,
  showThumbnails = false,
  onSelect,
  onClear,
}: RecentlyViewedProps) {
  const [expanded, setExpanded] = useState(false)
  if (problems.length === 0) return null

  const shown = expanded ? problems : problems.slice(0, COLLAPSED_COUNT)
  const hiddenCount = problems.length - shown.length

  return (
    <section className="mb-2">
      <div className="flex items-center justify-between px-3 py-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recently viewed
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      {shown.map((p) => (
        <CatalogRow
          key={p.source_catalog_id}
          problem={p}
          board={board}
          isFavorite={favoriteIds.has(p.source_catalog_id)}
          showThumbnail={showThumbnails}
          onSelect={onSelect}
        />
      ))}
      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" className="mx-3" onClick={() => setExpanded(true)}>
          Show {hiddenCount} more
        </Button>
      )}
    </section>
  )
}
