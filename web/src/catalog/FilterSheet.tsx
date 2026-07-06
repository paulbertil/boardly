// Filter FAB + swipe drawer, iOS-style: a floating button with an active-filter
// count badge opens a bottom drawer holding all the filter and sort controls.
// Uses the same shadcn Drawer (swipe handle) as the board config. Search stays in
// the catalog top bar. Positioning is owned by the parent's shared FAB column
// (CatalogScreen) — this renders the trigger only, not its own sticky wrapper.

import { SlidersHorizontal } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { FilterControls } from './FilterControls'
import { activeFilterCount, type FilterState } from './filters'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

interface FilterSheetProps {
  state: FilterState
  onChange: (state: FilterState) => void
  board: CatalogBoardDef
  gradeSpan: [number, number]
  methods: string[]
}

export function FilterSheet({ state, onChange, board, gradeSpan, methods }: FilterSheetProps) {
  const count = activeFilterCount(state)
  return (
    <Drawer showSwipeHandle>
      {/* Positioned by the parent's shared FAB column (CatalogScreen). */}
      <DrawerTrigger
        aria-label="Filters"
        className="pointer-events-auto relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
      >
        <SlidersHorizontal className="size-6" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[0.7rem] font-semibold text-white">
            {count}
          </span>
        )}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <FilterControls state={state} onChange={onChange} board={board} gradeSpan={gradeSpan} methods={methods} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
