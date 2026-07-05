// Multi-board state, persisted to localStorage with the same key scheme as the
// iOS app's @AppStorage (ios/MoonBoardLED/Board/Board.swift), so per-board angle,
// installed hold sets, and flip calibration stay traceable across apps.
//
// This module owns the RAW persisted values: added-board list (MRU order), the
// active board, per-board angle / flipped / installed-hold-set string. The
// hold-set string is interpreted against membership data by holdSetMembership.ts
// (U5) — this module does not know which sets are filterable.

import { useSyncExternalStore } from 'react'
import { boardByLayoutId, defaultAngle, type CatalogBoardDef } from './boards'

const ADDED_KEY = 'addedBoards'
const ACTIVE_KEY = 'activeBoardId'
const angleKey = (id: number) => `angle_${id}`
const flippedKey = (id: number) => `flipped_${id}`
const activeHoldSetsKey = (id: number) => `activeHoldSets_${id}`

/** Default active board when none is stored — the Mini 2025 this app centers on. */
const DEFAULT_ACTIVE = 7

// ─── Raw persisted accessors (pure; safe to unit-test directly) ───────────────

/** Added board layout ids, in most-recently-used order (front = most recent). */
export function getAddedBoardIds(): number[] {
  const raw = localStorage.getItem(ADDED_KEY)
  if (!raw) return []
  return raw
    .split('|')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && boardByLayoutId(n) !== undefined)
}

function writeAddedBoardIds(ids: number[]): void {
  localStorage.setItem(ADDED_KEY, ids.join('|'))
}

/** Add a board to the owned list (no-op if already added). Appended, not fronted. */
export function addBoard(layoutId: number): void {
  if (boardByLayoutId(layoutId) === undefined) return
  const ids = getAddedBoardIds()
  if (!ids.includes(layoutId)) writeAddedBoardIds([...ids, layoutId])
  emit()
}

/** Remove a board from the owned list. */
export function removeBoard(layoutId: number): void {
  writeAddedBoardIds(getAddedBoardIds().filter((id) => id !== layoutId))
  emit()
}

/** The active board id (defaults to Mini 2025). */
export function getActiveBoardId(): number {
  const raw = localStorage.getItem(ACTIVE_KEY)
  const id = raw === null ? DEFAULT_ACTIVE : Number(raw)
  return boardByLayoutId(id) !== undefined ? id : DEFAULT_ACTIVE
}

/** Make a board active and promote it to the front of the MRU list. */
export function activateBoard(layoutId: number): void {
  if (boardByLayoutId(layoutId) === undefined) return
  localStorage.setItem(ACTIVE_KEY, String(layoutId))
  const rest = getAddedBoardIds().filter((id) => id !== layoutId)
  writeAddedBoardIds([layoutId, ...rest])
  emit()
}

/** The board's chosen angle, or its default when unset or invalid for the board. */
export function getAngle(board: CatalogBoardDef): number {
  const raw = localStorage.getItem(angleKey(board.layoutId))
  const angle = raw === null ? NaN : Number(raw)
  return board.angles.includes(angle) ? angle : defaultAngle(board)
}

export function setAngle(layoutId: number, angle: number): void {
  localStorage.setItem(angleKey(layoutId), String(angle))
  emit()
}

/** Whether the board's LED strip is reverse-wired (feeds MoonBoardClient.send). */
export function getFlipped(layoutId: number): boolean {
  return localStorage.getItem(flippedKey(layoutId)) === 'true'
}

export function setFlipped(layoutId: number, flipped: boolean): void {
  localStorage.setItem(flippedKey(layoutId), String(flipped))
  emit()
}

/** The raw installed-hold-set string ("" = all installed / filter off). */
export function getActiveHoldSetsCsv(layoutId: number): string {
  return localStorage.getItem(activeHoldSetsKey(layoutId)) ?? ''
}

export function setActiveHoldSetsCsv(layoutId: number, csv: string): void {
  localStorage.setItem(activeHoldSetsKey(layoutId), csv)
  emit()
}

// ─── React binding ────────────────────────────────────────────────────────────

interface StoreSnapshot {
  addedBoards: CatalogBoardDef[]
  activeBoard: CatalogBoardDef
}

const listeners = new Set<() => void>()
let snapshot: StoreSnapshot = computeSnapshot()

function computeSnapshot(): StoreSnapshot {
  const addedBoards = getAddedBoardIds()
    .map((id) => boardByLayoutId(id))
    .filter((b): b is CatalogBoardDef => b !== undefined)
  const activeBoard = boardByLayoutId(getActiveBoardId()) ?? boardByLayoutId(DEFAULT_ACTIVE)!
  return { addedBoards, activeBoard }
}

/** Rebuild the cached snapshot and notify subscribers. Called after every write. */
function emit(): void {
  snapshot = computeSnapshot()
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): StoreSnapshot {
  return snapshot
}

/** Reactive view of the added boards and active board, with the mutating actions. */
export function useBoardStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot)
  return {
    ...snap,
    addBoard,
    removeBoard,
    activateBoard,
    setAngle,
    setFlipped,
    setActiveHoldSetsCsv,
  }
}
