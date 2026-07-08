// The import route's URL search-param schema. The screen has one addressable bit of UI
// state: which tab is active, encoded as `?tab=request|upload` so a link can target the
// Upload tab and Back returns to Request. Mirrors logbookSearch.ts at minimal scope — the
// strip middleware on the route removes `tab` at its default (`request`) so the common
// case keeps a clean URL.

export type ImportTab = 'request' | 'upload'

/** The typed import search. `tab` is optional so `/logbook/import` (the default entry)
 *  needn't pass search — only the Upload tab sets it. */
export interface ImportSearch {
  tab?: ImportTab
}

/** Default (stripped) value. `Required<…>` forces every schema key to appear so a future
 *  param can't be silently omitted from the strip middleware. */
export const IMPORT_SEARCH_DEFAULTS: Required<ImportSearch> = {
  tab: 'request',
}

/** Coerce a raw parsed search object into the typed schema. The route's `validateSearch`.
 *  Anything but the literal `'upload'` falls back to the default `'request'`. */
export function validateImportSearch(raw: Record<string, unknown>): ImportSearch {
  return {
    tab: raw.tab === 'upload' ? 'upload' : 'request',
  }
}
