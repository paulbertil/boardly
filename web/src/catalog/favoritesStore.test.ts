import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getFavoriteIds, isFavorite, toggleFavorite, useFavorites } from './favoritesStore'

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage')) // refresh the module snapshot
})

describe('favoritesStore', () => {
  it('toggles membership and persists', () => {
    expect(isFavorite('a')).toBe(false)
    toggleFavorite('a')
    expect(isFavorite('a')).toBe(true)
    expect(getFavoriteIds().has('a')).toBe(true)
    toggleFavorite('a')
    expect(isFavorite('a')).toBe(false)
  })

  it('re-renders subscribers via useFavorites', () => {
    const { result } = renderHook(() => useFavorites())
    expect(result.current.favoriteIds.size).toBe(0)
    act(() => result.current.toggleFavorite('x'))
    expect(result.current.favoriteIds.has('x')).toBe(true)
  })
})
