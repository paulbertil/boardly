// Device-local "show climb previews" toggle for the catalog list. Mirrors iOS's
// `@AppStorage("showClimbPreviews")` (default on): when set, each list row draws a
// board thumbnail of the problem. Persisted to localStorage; exposed reactively so
// the list and the toggle button update together.

import { useSyncExternalStore } from 'react'

const KEY = 'showClimbPreviews'

function read(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    // Default ON to match iOS — only an explicit "false" hides previews.
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

function write(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'true' : 'false')
  } catch {
    // Best-effort.
  }
}

const listeners = new Set<() => void>()
let snapshot = read()

function emit(): void {
  snapshot = read()
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => emit())
}

export function getShowPreviews(): boolean {
  return snapshot
}

export function toggleShowPreviews(): void {
  write(!snapshot)
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive previews toggle for components. */
export function useShowPreviews(): boolean {
  return useSyncExternalStore(subscribe, getShowPreviews)
}
