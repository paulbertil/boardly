import { afterEach, describe, expect, it } from 'vitest'
import { dismissLastOpened, getLastOpened, recordOpened, useLastOpened } from './lastOpenedStore'
import { act, renderHook } from '@testing-library/react'

// The store is a module-level in-memory singleton; reset the slabs we touch so tests
// don't leak into each other.
afterEach(() => {
  dismissLastOpened(7, 40)
  dismissLastOpened(5, 25)
})

describe('lastOpenedStore', () => {
  it('starts empty — a cold load shows no bar', () => {
    expect(getLastOpened(7, 40)).toBeNull()
  })

  it('records the last opened id for a slab', () => {
    recordOpened(7, 40, 'a')
    expect(getLastOpened(7, 40)).toBe('a')
    recordOpened(7, 40, 'b')
    expect(getLastOpened(7, 40)).toBe('b')
  })

  it('is scoped per board+angle', () => {
    recordOpened(7, 40, 'mini')
    recordOpened(5, 25, 'masters')
    expect(getLastOpened(7, 40)).toBe('mini')
    expect(getLastOpened(5, 25)).toBe('masters')
    // A different angle on the same board is a different slab → no entry.
    expect(getLastOpened(7, 25)).toBeNull()
  })

  it('dismiss clears the entry; a later open restores it', () => {
    recordOpened(7, 40, 'a')
    dismissLastOpened(7, 40)
    expect(getLastOpened(7, 40)).toBeNull()
    recordOpened(7, 40, 'c')
    expect(getLastOpened(7, 40)).toBe('c')
  })

  it('useLastOpened re-renders subscribers on record/dismiss with a stable reference between emits', () => {
    const { result, rerender } = renderHook(() => useLastOpened(7, 40))
    expect(result.current).toBeNull()

    act(() => recordOpened(7, 40, 'a'))
    expect(result.current).toBe('a')

    // An unrelated slab's emit must not change our value's identity (no render loop).
    const before = result.current
    act(() => recordOpened(5, 25, 'x'))
    rerender()
    expect(result.current).toBe(before)

    act(() => dismissLastOpened(7, 40))
    expect(result.current).toBeNull()
  })
})
