// Per-slab filter/sort state with localStorage persistence (iOS persists the
// catalog filters across launches). Reloads when the active slab changes.

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_FILTERS, type FilterState } from './filters'

const key = (layoutId: number, angle: number) => `catalogFilters_${layoutId}_${angle}`

function load(layoutId: number, angle: number): FilterState {
  try {
    const raw = localStorage.getItem(key(layoutId, angle))
    if (!raw) return DEFAULT_FILTERS
    // Merge over defaults so a stored blob missing a newer field stays valid.
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<FilterState>) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function save(layoutId: number, angle: number, state: FilterState): void {
  try {
    localStorage.setItem(key(layoutId, angle), JSON.stringify(state))
  } catch {
    // Best-effort.
  }
}

/** Filter state for a slab plus a persisting setter. */
export function useFilters(layoutId: number, angle: number): [FilterState, (s: FilterState) => void] {
  const [state, setStateRaw] = useState<FilterState>(() => load(layoutId, angle))

  useEffect(() => {
    setStateRaw(load(layoutId, angle))
  }, [layoutId, angle])

  const setState = useCallback(
    (s: FilterState) => {
      setStateRaw(s)
      save(layoutId, angle, s)
    },
    [layoutId, angle],
  )

  return [state, setState]
}
