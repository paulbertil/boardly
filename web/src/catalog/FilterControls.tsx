// The catalog filter/sort bar. Controlled: the parent owns FilterState (via
// useFilters) and passes the slab's grade span + available methods. Built on
// shadcn Input/Select/Slider/Toggle/Button per web/CLAUDE.md.
//
// The drawn holds-filter picker (tap positions on the board) is intentionally
// deferred — applyFilters supports the predicate, but its UI lands with the
// detail/board interaction work.

import { FONT_GRADES } from '../board/grades'
import {
  SORT_LABELS,
  hasActiveFilters,
  resetFilters,
  sortDimension,
  type FilterState,
  type SortKey,
} from './filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'

const SORT_KEYS: SortKey[] = ['easiest', 'hardest', 'rated', 'repeats']

interface FilterControlsProps {
  state: FilterState
  onChange: (state: FilterState) => void
  /** The slab's actual grade span as ordinal [min, max]. */
  gradeSpan: [number, number]
  /** Distinct method labels present in the slab. */
  methods: string[]
}

export function FilterControls({ state, onChange, gradeSpan, methods }: FilterControlsProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...state, ...patch })
  const range = state.gradeRange ?? gradeSpan
  const secondaryOptions = SORT_KEYS.filter(
    (k) => sortDimension(k) !== sortDimension(state.sortPrimary),
  )

  function changePrimary(primary: SortKey) {
    // Drop a secondary that now shares the primary's dimension, so the Select
    // never shows an orphaned value that isn't in its option list.
    const keepSecondary =
      state.sortSecondary && sortDimension(state.sortSecondary) !== sortDimension(primary)
    set({ sortPrimary: primary, sortSecondary: keepSecondary ? state.sortSecondary : null })
  }

  return (
    <div className="space-y-3 p-3">
      <Input
        placeholder="Name or setter"
        value={state.search}
        onChange={(e) => set({ search: e.target.value })}
      />

      <div className="flex gap-2">
        <Select value={state.sortPrimary} onValueChange={(v) => changePrimary(v as SortKey)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.sortSecondary ?? 'none'}
          onValueChange={(v) => set({ sortSecondary: v === 'none' ? null : (v as SortKey) })}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="then by…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No tiebreak</SelectItem>
            {secondaryOptions.map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span id="grade-range-label">Grade</span>
          <span>
            {FONT_GRADES[range[0]]} – {FONT_GRADES[range[1]]}
          </span>
        </div>
        <Slider
          aria-labelledby="grade-range-label"
          min={gradeSpan[0]}
          max={gradeSpan[1]}
          step={1}
          value={[range[0], range[1]]}
          onValueChange={(value) => {
            const [lo, hi] = value as number[]
            set({ gradeRange: lo === gradeSpan[0] && hi === gradeSpan[1] ? null : [lo, hi] })
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          variant="outline"
          size="sm"
          pressed={state.benchmarkOnly}
          onPressedChange={(v) => set({ benchmarkOnly: v })}
        >
          Benchmarks
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={state.favoritesOnly}
          onPressedChange={(v) => set({ favoritesOnly: v })}
        >
          Favorites
        </Toggle>
        <Select value={String(state.minStars)} onValueChange={(v) => set({ minStars: Number(v) })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any rating</SelectItem>
            {[1, 2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}★ and up
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {methods.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {methods.map((m) => (
            <Toggle
              key={m}
              variant="outline"
              size="sm"
              pressed={state.methods.includes(m)}
              onPressedChange={(active) =>
                set({
                  methods: active ? [...state.methods, m] : state.methods.filter((x) => x !== m),
                })
              }
            >
              {m}
            </Toggle>
          ))}
        </div>
      )}

      {hasActiveFilters(state) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(resetFilters(state))}>
          Reset filters
        </Button>
      )}
    </div>
  )
}
