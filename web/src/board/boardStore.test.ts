import { beforeEach, describe, expect, it } from 'vitest'
import { boardByLayoutId } from './boards'
import {
  activateBoard,
  addBoard,
  getActiveBoardId,
  getActiveHoldSetsCsv,
  getAddedBoardIds,
  getAngle,
  getFlipped,
  removeBoard,
  setActiveHoldSetsCsv,
  setAngle,
  setFlipped,
} from './boardStore'

const mini = boardByLayoutId(7)! // angles [40]
const masters = boardByLayoutId(5)! // angles [40, 25]

beforeEach(() => {
  localStorage.clear()
})

describe('added boards', () => {
  it('starts empty and records added boards without duplicates', () => {
    expect(getAddedBoardIds()).toEqual([])
    addBoard(7)
    addBoard(5)
    addBoard(7) // duplicate ignored
    expect(getAddedBoardIds()).toEqual([7, 5])
  })

  it('ignores unsupported layout ids', () => {
    addBoard(1) // MoonBoard 2010 — not a catalog board
    expect(getAddedBoardIds()).toEqual([])
  })

  it('activating promotes the board to the front (MRU) and sets it active', () => {
    addBoard(7)
    addBoard(5)
    addBoard(3)
    activateBoard(5)
    expect(getAddedBoardIds()).toEqual([5, 7, 3])
    expect(getActiveBoardId()).toBe(5)
  })

  it('removing drops the board from the list', () => {
    addBoard(7)
    addBoard(5)
    removeBoard(7)
    expect(getAddedBoardIds()).toEqual([5])
  })
})

describe('active board', () => {
  it('defaults to Mini 2025 when unset', () => {
    expect(getActiveBoardId()).toBe(7)
  })
})

describe('per-board settings persist and survive reload', () => {
  it('angle: stored per board, falls back to default, ignores invalid-for-board', () => {
    expect(getAngle(masters)).toBe(40) // default = first angle
    setAngle(masters.layoutId, 25)
    expect(getAngle(masters)).toBe(25) // re-read from localStorage == survives reload
    setAngle(mini.layoutId, 25) // 25 not offered by Mini
    expect(getAngle(mini)).toBe(40) // clamped to default
  })

  it('flipped: defaults false, persists per board', () => {
    expect(getFlipped(5)).toBe(false)
    setFlipped(5, true)
    expect(getFlipped(5)).toBe(true)
    expect(getFlipped(7)).toBe(false) // independent per board
  })

  it('installed hold sets: defaults empty, persists the raw string', () => {
    expect(getActiveHoldSetsCsv(5)).toBe('')
    setActiveHoldSetsCsv(5, '17|18')
    expect(getActiveHoldSetsCsv(5)).toBe('17|18')
  })
})
