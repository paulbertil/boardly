// Device-local "show climb previews" toggles, one per surface: the catalog list
// (which also governs the recents sheet), the logbook, list detail screens, and the
// last-opened bar above the bottom nav. Each surface persists to its own localStorage
// key and defaults ON; all are exposed reactively so Settings, the catalog's inline
// toggle button, and the rows they control stay in sync.

import { useSyncExternalStore } from 'react'

export type PreviewSurface = 'catalog' | 'logbook' | 'lists' | 'lastOpened'

export const PREVIEW_SURFACES: PreviewSurface[] = ['catalog', 'logbook', 'lists', 'lastOpened']

function keyFor(surface: PreviewSurface): string {
  return `showClimbPreviews.${surface}`
}

function read(surface: PreviewSurface): boolean {
  try {
    const raw = localStorage.getItem(keyFor(surface))
    // Default ON — only an explicit "false" hides previews.
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

function write(surface: PreviewSurface, on: boolean): void {
  try {
    localStorage.setItem(keyFor(surface), on ? 'true' : 'false')
  } catch {
    // Best-effort.
  }
}

const listeners = new Set<() => void>()

function readAll(): Record<PreviewSurface, boolean> {
  return {
    catalog: read('catalog'),
    logbook: read('logbook'),
    lists: read('lists'),
    lastOpened: read('lastOpened'),
  }
}

let snapshot = readAll()

function emit(): void {
  snapshot = readAll()
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => emit())
}

export function getShowPreviews(surface: PreviewSurface): boolean {
  return snapshot[surface]
}

export function setShowPreviews(surface: PreviewSurface, on: boolean): void {
  write(surface, on)
  emit()
}

export function toggleShowPreviews(surface: PreviewSurface): void {
  setShowPreviews(surface, !snapshot[surface])
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive previews toggle for components. */
export function useShowPreviews(surface: PreviewSurface): boolean {
  return useSyncExternalStore(subscribe, () => snapshot[surface])
}
