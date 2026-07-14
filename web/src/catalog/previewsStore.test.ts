import { beforeEach, describe, expect, it } from 'vitest'
import { getShowPreviews, setShowPreviews, toggleShowPreviews, PREVIEW_SURFACES } from './previewsStore'

beforeEach(() => {
  localStorage.clear()
  // Reset the reactive snapshot (survives localStorage.clear()).
  window.dispatchEvent(new StorageEvent('storage'))
})

describe('previewsStore', () => {
  it('defaults every surface to on', () => {
    for (const surface of PREVIEW_SURFACES) {
      expect(getShowPreviews(surface)).toBe(true)
    }
  })

  it('toggles and persists to a per-surface localStorage key', () => {
    toggleShowPreviews('catalog')
    expect(getShowPreviews('catalog')).toBe(false)
    expect(localStorage.getItem('showClimbPreviews.catalog')).toBe('false')
    toggleShowPreviews('catalog')
    expect(getShowPreviews('catalog')).toBe(true)
    expect(localStorage.getItem('showClimbPreviews.catalog')).toBe('true')
  })

  it('keeps surfaces independent', () => {
    setShowPreviews('logbook', false)
    expect(getShowPreviews('logbook')).toBe(false)
    expect(getShowPreviews('catalog')).toBe(true)
    expect(getShowPreviews('lists')).toBe(true)
    expect(getShowPreviews('lastOpened')).toBe(true)
  })

  it('reads a persisted "off" on the next storage sync', () => {
    localStorage.setItem('showClimbPreviews.lists', 'false')
    window.dispatchEvent(new StorageEvent('storage'))
    expect(getShowPreviews('lists')).toBe(false)
  })

  it('ignores the legacy global showClimbPreviews key', () => {
    localStorage.setItem('showClimbPreviews', 'false')
    window.dispatchEvent(new StorageEvent('storage'))
    for (const surface of PREVIEW_SURFACES) {
      expect(getShowPreviews(surface)).toBe(true)
    }
  })
})
