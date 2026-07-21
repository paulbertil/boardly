// The sticky header's filter-pill row (catalog only). One horizontally-scrolling line:
// the always-on Benchmark toggle pinned first (a pure toggle — no ✕, amber when on),
// then one removable pill per active filter (tap anywhere on the pill to remove; the ✕
// is a cue, not a separate hit target). Portaled into the frosted header by CatalogScreen
// (see headerFilterSlot); it renders inside CatalogScreen so it reads the same `filters`
// and writes through the same seed-writing `setFilters`.
//
// Pills come from the pure describeActiveFilters(); this component just renders them and
// applies each pill's `patch` on tap. Benchmark is NOT a pill from that list — it's the
// pinned toggle rendered here.

import { useState } from 'react'
import { ChevronDown, ListFilter, X } from 'lucide-react'
import { describeActiveFilters } from './activeFilterChips'
import { GradeRangeSlider } from './GradeRangeSlider'
import { ListFilterSheet } from './ListFilterSheet'
import { BENCHMARK_LABEL, FAVORITES_LABEL, type FilterState } from './filters'
import { FONT_GRADES } from '../board/grades'
import type { SavedList } from '../lists/listsTypes'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toggle } from '@/components/ui/toggle'

interface FilterPillBarProps {
  filters: FilterState
  onChange: (next: FilterState) => void
  /** A collab session targets this board → status is per-member; status pills suppressed. */
  inSession: boolean
  /** Signed in AND ascents loaded → status actually filters; gates status pills. */
  statusReady: boolean
  /** This board's live lists — drives the "Lists" opener (hidden when empty, R4). */
  boardLists: SavedList[]
  /** The slab's grade span [min, max] — the dropdown slider's bounds. */
  gradeSpan: [number, number]
  /** Whether the slab has a real range to narrow (hidden while cold / single-grade). */
  showGrade: boolean
}

export function FilterPillBar({
  filters,
  onChange,
  inSession,
  statusReady,
  boardLists,
  gradeSpan,
  showGrade,
}: FilterPillBarProps) {
  const chips = describeActiveFilters(filters, { inSession, statusReady })
  const [listSheetOpen, setListSheetOpen] = useState(false)
  const gradeLabel = filters.gradeRange
    ? `${FONT_GRADES[filters.gradeRange[0]]}–${FONT_GRADES[filters.gradeRange[1]]}`
    : 'Grade'

  return (
    // -mx-4 + px-4: cancel the header's 1rem side padding so the scroll track spans the
    // full frosted column, while px-4 insets the first/last pill back onto the 1rem grid.
    // flex-nowrap + overflow-x-auto: one line that scrolls (never wraps) → predictable
    // single-row header height. Scrollbar hidden; horizontal pan for touch.
    <div
      // A labelled group, not a toolbar: every toggle/chip is its own native Tab stop, so
      // the widget has no roving-tabindex / arrow-key contract — `role="toolbar"` would
      // advertise navigation it doesn't implement.
      role="group"
      aria-label="Filters"
      className="-mx-4 flex touch-pan-x flex-nowrap items-center gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Toggle
        variant="outline"
        size="sm"
        pressed={filters.benchmarkOnly}
        onPressedChange={(v) => onChange({ ...filters, benchmarkOnly: v })}
        // Accessible name comes from the visible text (BENCHMARK_LABEL) — no aria-label,
        // matching FilterControls' toggles. On-state uses the Toggle's default accent fill
        // (same as the removable pills); just the smaller sizing here.
        className="h-6 shrink-0 px-2 text-xs"
      >
        {BENCHMARK_LABEL}
      </Toggle>

      <Toggle
        variant="outline"
        size="sm"
        pressed={filters.favoritesOnly}
        onPressedChange={(v) => onChange({ ...filters, favoritesOnly: v })}
        // Pinned always-on toggle like Benchmark (not a removable pill); accessible name
        // from the visible text, same neutral accent on-fill and smaller sizing.
        className="h-6 shrink-0 px-2 text-xs"
      >
        {FAVORITES_LABEL}
      </Toggle>

      {/* "Lists" opener — a pinned control (like the toggles) that opens the multi-select
          sheet rather than toggling a boolean. Rendered only when this board has ≥1 list
          (R4): with none to pick, the control would be dead weight. */}
      {boardLists.length > 0 && (
        <Toggle
          variant="outline"
          size="sm"
          pressed={filters.listFilter.length > 0}
          onPressedChange={() => setListSheetOpen(true)}
          aria-label="Filter by list"
          className="h-6 shrink-0 gap-1 px-2 text-xs"
        >
          <ListFilter aria-hidden className="size-3.5" />
          Lists
        </Toggle>
      )}

      {/* Grade: a pinned control (like "Lists") that opens a dropdown slider rather than
          toggling — so the band is set without the filter sheet. Pressed (accent fill) when
          a sub-range is active; the label shows that range ("6A–7C"), else "Grade". Hidden
          when the slab has no real range to narrow (showGrade). */}
      {showGrade && (
        <Popover>
          <PopoverTrigger
            render={
              <Toggle
                variant="outline"
                size="sm"
                pressed={filters.gradeRange !== null}
                aria-label="Filter by grade"
                className="h-6 shrink-0 gap-1 px-2 text-xs"
              >
                {gradeLabel}
                <ChevronDown aria-hidden className="size-3.5" />
              </Toggle>
            }
          />
          <PopoverContent align="start" className="w-64">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Grade</span>
              <button
                type="button"
                disabled={filters.gradeRange === null}
                onClick={() => onChange({ ...filters, gradeRange: null })}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Reset
              </button>
            </div>
            <GradeRangeSlider
              value={filters.gradeRange}
              span={gradeSpan}
              onCommit={(gradeRange) => onChange({ ...filters, gradeRange })}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Divider between the pinned toggles (controls) and the removable active-filter
          tags. Only when there are tags — a trailing divider with nothing after reads as
          a mistake. */}
      {chips.length > 0 && <div aria-hidden className="h-4 w-px shrink-0 bg-border" />}

      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange({ ...filters, ...chip.patch })}
          aria-label={`Remove ${chip.label} filter`}
          // Outlined gray tag: the border defines the shape (a muted FILL would vanish
          // into the near-white frosted header in light mode, where --muted ≈
          // --background). Reads as secondary to the accent-FILLED pinned toggles, and
          // the trailing ✕ carries the "removable" signal. Works in both themes.
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span>{chip.label}</span>
          <X aria-hidden className="size-3 text-muted-foreground" />
        </button>
      ))}

      {boardLists.length > 0 && (
        <ListFilterSheet
          open={listSheetOpen}
          onOpenChange={setListSheetOpen}
          boardLists={boardLists}
          selected={filters.listFilter}
          onChange={(listFilter) => onChange({ ...filters, listFilter })}
        />
      )}
    </div>
  )
}
