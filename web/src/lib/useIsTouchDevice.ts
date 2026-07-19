// Whether the primary pointer is touch (a phone/tablet), used to gate touch-only affordances like
// the catalog's swipe-to-queue so they never surface on a desktop with a mouse. `(hover: none) and
// (pointer: coarse)` is the standard "touch-primary" heuristic: a desktop (mouse can hover, fine
// pointer) is false; a hybrid touchscreen laptop whose primary pointer is the trackpad is also
// false — deliberately, since those users expect desktop behaviour.
//
// One shared matchMedia listener backs every caller via useSyncExternalStore, so a long virtualized
// list of rows doesn't each register their own listener. The query is live: plugging in a mouse or
// flipping the primary pointer re-renders subscribers.

import { useSyncExternalStore } from 'react'

const QUERY = '(hover: none) and (pointer: coarse)'

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(QUERY)
}

function subscribe(onChange: () => void): () => void {
  const mql = getMediaQueryList()
  if (!mql) return () => {}
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return getMediaQueryList()?.matches ?? false
}

/** True when the primary pointer is coarse and can't hover (a touch device). SSR-safe (false). */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
