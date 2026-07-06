// Cold-launch seed for the catalog filters.
//
// The URL is the source of truth for what the catalog shows (routing, back/forward,
// shared links). This module keeps the per-(board, angle) filters in localStorage
// ONLY so a cold PWA launch on bare `/` can rebuild the last-active catalog URL —
// the redirect in router.tsx is the *sole* reader. It is write-through: CatalogScreen
// saves here on every filter change but never renders from it.
//
// The transient search query is deliberately not seeded: it does not survive a cold
// launch, and switching boards must never carry a stale query (iOS parity). The key
// scheme matches the iOS @AppStorage catalog filters.

import { DEFAULT_FILTERS, type FilterState } from './filters'

const key = (layoutId: number, angle: number) => `catalogFilters_${layoutId}_${angle}`

/** The seeded filters for a slab (search always blank), or the defaults. */
export function loadSeed(layoutId: number, angle: number): FilterState {
  try {
    const raw = localStorage.getItem(key(layoutId, angle))
    if (!raw) return DEFAULT_FILTERS
    // Merge over defaults so a stored blob missing a newer field stays valid, and
    // force search blank — a query is never resurrected from the seed.
    return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<FilterState>), search: '' }
  } catch {
    return DEFAULT_FILTERS
  }
}

/** Write-through the current filters as the slab's cold-launch seed (search dropped). */
export function saveSeed(layoutId: number, angle: number, state: FilterState): void {
  try {
    localStorage.setItem(key(layoutId, angle), JSON.stringify({ ...state, search: '' }))
  } catch {
    // Best-effort — the value simply won't survive a reload.
  }
}
