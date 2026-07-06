// Wires the active board's slab into the browsing UI: the filter bar, the list,
// and the detail pager. Owns the single useSlab and derives the filter context
// (favorites + installed-hold-set climbable check) that applyFilters needs.

import { useCallback, useMemo, useState } from 'react'
import { FONT_GRADES, gradeIndex } from '../board/grades'
import { getActiveHoldSetsRaw, getAngle, useBoardStore } from '../board/boardStore'
import { holdSetContext, isClimbable } from '../board/holdSetMembership'
import { CatalogList } from './CatalogList'
import { FilterSheet } from './FilterSheet'
import { RecentsSheet } from './RecentsSheet'
import { ProblemDetail } from './ProblemDetail'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { applyFilters, type FilterContext } from './filters'
import { useFavorites } from './favoritesStore'
import { useFilters } from './useFilters'
import { useSearchQuery } from './searchStore'
import { useSlab } from './useSlab'
import type { CatalogProblem } from './catalogSync'

export function CatalogScreen() {
  const { activeBoard } = useBoardStore()
  const board = activeBoard
  // getAngle reads localStorage; the store re-renders this component on angle
  // change (useBoardStore), so reading it in render stays current.
  const angle = getAngle(board)

  const { problems, loading, degraded } = useSlab(board.layoutId, angle)
  const [filters, setFilters] = useFilters(board.layoutId, angle)
  const searchQuery = useSearchQuery()
  const { favoriteIds } = useFavorites()
  // The detail pager's source list + starting index. List taps page over the
  // filtered `displayed`; recent taps page over the full unfiltered `problems`
  // slab, so a recent opens regardless of the active filters (iOS parity).
  const [openTarget, setOpenTarget] = useState<{ list: CatalogProblem[]; index: number } | null>(null)

  // The slab's actual grade span (ordinal) for the slider, and its methods.
  const gradeSpan = useMemo<[number, number]>(() => {
    const idx = problems.map((p) => gradeIndex(p.grade)).filter((i) => i < FONT_GRADES.length)
    return idx.length ? [Math.min(...idx), Math.max(...idx)] : [0, FONT_GRADES.length - 1]
  }, [problems])
  const methods = useMemo(
    () => [...new Set(problems.map((p) => p.method).filter((m): m is string => !!m))].sort(),
    [problems],
  )

  // Installed-hold-set climbable check for the active board.
  const context = useMemo<FilterContext>(() => {
    const { membership, active } = holdSetContext(board.membershipResource, getActiveHoldSetsRaw(board.layoutId))
    return { favoriteIds, isClimbable: (holds) => isClimbable(membership, holds, active) }
  }, [board, favoriteIds])

  // Search is transient (bottom-nav field), so inject it into the filter call
  // rather than persisting it in FilterState.
  const transform = useCallback(
    (list: CatalogProblem[]) => applyFilters(list, { ...filters, search: searchQuery }, context),
    [filters, searchQuery, context],
  )
  const displayed = useMemo(() => transform(problems), [transform, problems])

  // Ring the actively-filtered holds on thumbnails + the detail board (iOS parity).
  const highlightHolds = useMemo(() => new Set(filters.holdsFilter), [filters.holdsFilter])

  // List taps: page over the filtered list.
  const openProblem = (problem: CatalogProblem) => {
    const i = displayed.findIndex((p) => p.source_catalog_id === problem.source_catalog_id)
    if (i >= 0) setOpenTarget({ list: displayed, index: i })
  }

  // Recent taps: page over the recents stack itself (the snapshot RecentsSheet
  // hands over), so swiping stays within your recents and never surfaces the
  // in-between slab entries. Filter-independent — the stack is the resolved recents.
  const openRecent = (stack: CatalogProblem[], index: number) => {
    setOpenTarget({ list: stack, index })
  }

  return (
    <div className="flex flex-1 flex-col">
      <CatalogList
        board={board}
        angle={angle}
        problems={problems}
        loading={loading}
        degraded={degraded}
        favoriteIds={favoriteIds}
        transform={transform}
        searchActive={searchQuery.trim().length > 0}
        highlightHolds={highlightHolds}
        onSelect={openProblem}
      />
      {/* Shared FAB column: recents on top, filter below (mirrors iOS's VStack).
          mt-auto pins it to the bottom of the flex-column scroll region; sticky
          keeps it there as a long list scrolls; pointer-events fall through. */}
      <div className="pointer-events-none sticky bottom-4 z-30 mt-auto flex flex-col items-end gap-3">
        <RecentsSheet board={board} angle={angle} problems={problems} favoriteIds={favoriteIds} onSelect={openRecent} />
        <FilterSheet state={filters} onChange={setFilters} board={board} gradeSpan={gradeSpan} methods={methods} />
      </div>

      <Drawer open={openTarget !== null} onOpenChange={(open) => !open && setOpenTarget(null)} showSwipeHandle>
        <DrawerContent>
          <DrawerTitle className="sr-only">Problem details</DrawerTitle>
          {openTarget !== null && (
            <div className="max-h-[85vh] overflow-y-auto px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <ProblemDetail
                problems={openTarget.list}
                initialIndex={openTarget.index}
                board={board}
                angle={angle}
                favoriteIds={favoriteIds}
                highlightHolds={highlightHolds}
                onClose={() => setOpenTarget(null)}
              />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
