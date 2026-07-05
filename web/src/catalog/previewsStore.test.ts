import { beforeEach, describe, expect, it } from 'vitest'
import { getShowPreviews, toggleShowPreviews } from './previewsStore'

beforeEach(() => {
  localStorage.clear()
  // Reset the reactive snapshot (survives localStorage.clear()).
  window.dispatchEvent(new StorageEvent('storage'))
})

describe('previewsStore', () => {
  it('defaults to on (matches iOS showClimbPreviews)', () => {
    expect(getShowPreviews()).toBe(true)
  })

  it('toggles and persists to localStorage', () => {
    toggleShowPreviews()
    expect(getShowPreviews()).toBe(false)
    expect(localStorage.getItem('showClimbPreviews')).toBe('false')
    toggleShowPreviews()
    expect(getShowPreviews()).toBe(true)
    expect(localStorage.getItem('showClimbPreviews')).toBe('true')
  })

  it('reads a persisted "off" on the next storage sync', () => {
    localStorage.setItem('showClimbPreviews', 'false')
    window.dispatchEvent(new StorageEvent('storage'))
    expect(getShowPreviews()).toBe(false)
  })
})
