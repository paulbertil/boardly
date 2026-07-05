// The catalog filter/sort bar. Controlled: the parent owns FilterState (via
// useFilters) and passes the slab's grade span + available methods. Built on
// shadcn Input/Select/Slider/Button/Badge per web/CLAUDE.md.
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
import { Badge } from '@/components/ui/badge'
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

const SORT_KEYS: SortKey[] = ['easiest', 'hardest', 'rated', 'repeats']

interface FilterControlsProps {
  state: FilterState
  onChange: (state: FilterState) => void
  /** The slab's actual grade span as ordinal [min, max]. */
  gradeSpan: [number, number]
  /** Distinct method labels present in the slab. */
  methods: string[]
}

/** A pill that toggles a boolean filter. */
function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" onClick={onClick}>
      {children}
    </Button>
  )
}

export function FilterControls({ state, onChange, gradeSpan, methods }: FilterControlsProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...state, ...patch })
  const range = state.gradeRange ?? gradeSpan
  const secondaryOptions = SORT_KEYS.filter(
    (k) => sortDimension(k) !== sortDimension(state.sortPrimary),
  )

  return (
    <div className="space-y-3 p-3">
      <Input
        placeholder="Name or setter"
        value={state.search}
        onChange={(e) => set({ search: e.target.value })}
      />

      <div className="flex gap-2">
        <Select value={state.sortPrimary} onValueChange={(v) => set({ sortPrimary: v as SortKey })}>
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
          <span>Grade</span>
          <span>
            {FONT_GRADES[range[0]]} – {FONT_GRADES[range[1]]}
          </span>
        </div>
        <Slider
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
        <Toggle active={state.benchmarkOnly} onClick={() => set({ benchmarkOnly: !state.benchmarkOnly })}>
          Benchmarks
        </Toggle>
        <Toggle active={state.favoritesOnly} onClick={() => set({ favoritesOnly: !state.favoritesOnly })}>
          Favorites
        </Toggle>
        <Select
          value={String(state.minStars)}
          onValueChange={(v) => set({ minStars: Number(v) })}
        >
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
          {methods.map((m) => {
            const active = state.methods.includes(m)
            return (
              <Badge
                key={m}
                variant={active ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() =>
                  set({
                    methods: active
                      ? state.methods.filter((x) => x !== m)
                      : [...state.methods, m],
                  })
                }
              >
                {m}
              </Badge>
            )
          })}
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
