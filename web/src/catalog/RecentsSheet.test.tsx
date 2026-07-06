import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boardByLayoutId } from '../board/boards'
import { RecentsSheet } from './RecentsSheet'
import type { CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { toggleShowPreviews } from './previewsStore'

const board = boardByLayoutId(7)!

function problem(id: string, grade: string, name: string): CatalogProblem {
  return {
    source_catalog_id: id,
    layout_id: 7,
    angle: 40,
    name,
    grade,
    user_grade: null,
    setter: 'setter',
    stars: 0,
    repeats: 0,
    is_benchmark: false,
    method: null,
    holds: [{ c: 0, r: 1, t: 'start' }],
  }
}

function renderSheet(problems: CatalogProblem[], onSelect = vi.fn()) {
  const utils = render(
    <RecentsSheet
      board={board}
      angle={40}
      problems={problems}
      favoriteIds={new Set()}
      onSelect={onSelect}
    />,
  )
  return { ...utils, onSelect }
}

beforeEach(() => {
  localStorage.clear()
  // Reset the reactive recentsStore + previews caches (survive localStorage.clear()).
  window.dispatchEvent(new StorageEvent('storage'))
})

describe('RecentsSheet', () => {
  it('renders nothing (no FAB) when there is no history', () => {
    renderSheet([problem('a', '6A', 'Alpha')])
    expect(screen.queryByRole('button', { name: /recently viewed/i })).toBeNull()
  })

  it('shows the FAB once a view is recorded (reactive)', () => {
    renderSheet([problem('a', '6A', 'Alpha')])
    expect(screen.queryByRole('button', { name: /recently viewed/i })).toBeNull()
    act(() => recordRecent(7, 40, 'a'))
    expect(screen.getByRole('button', { name: /recently viewed/i })).toBeInTheDocument()
  })

  it('lists resolved recents most-recent-first, dropping ids absent from the slab', async () => {
    recordRecent(7, 40, 'a')
    recordRecent(7, 40, 'b')
    recordRecent(7, 40, 'gone') // not in the slab → dropped
    renderSheet([problem('a', '6A', 'Alpha'), problem('b', '6B', 'Beta')])

    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    // Titles render inside the opened drawer.
    expect(await screen.findByText('Beta')).toBeInTheDocument()
    const names = screen.getAllByText(/Alpha|Beta/).map((n) => n.textContent)
    expect(names).toEqual(['Beta', 'Alpha']) // 'b' recorded after 'a'
    expect(screen.queryByText('gone')).toBeNull()
  })

  it('shows row thumbnails by default and hides them via the previews toggle', async () => {
    recordRecent(7, 40, 'a')
    const { container } = renderSheet([problem('a', '6A', 'Alpha')])
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    await screen.findByText('Alpha')
    expect(container.ownerDocument.querySelector('.catalog-board')).not.toBeNull()
    act(() => toggleShowPreviews())
    expect(container.ownerDocument.querySelector('.catalog-board')).toBeNull()
  })

  it('clears the history and hides the FAB', async () => {
    recordRecent(7, 40, 'a')
    renderSheet([problem('a', '6A', 'Alpha')])
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    await screen.findByText('Alpha')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    })
    expect(screen.queryByRole('button', { name: /recently viewed/i })).toBeNull()
  })

  it('calls onSelect with the recents stack and the tapped index', async () => {
    recordRecent(7, 40, 'b')
    recordRecent(7, 40, 'a') // recents = [a, b]
    const { onSelect } = renderSheet([problem('a', '6A', 'Alpha'), problem('b', '6B', 'Beta')])
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    // Tap the second row (Beta, index 1) — onSelect gets the whole stack + its index.
    fireEvent.click(await screen.findByText('Beta'))
    expect(onSelect).toHaveBeenCalledWith(
      [
        expect.objectContaining({ source_catalog_id: 'a' }),
        expect.objectContaining({ source_catalog_id: 'b' }),
      ],
      1,
    )
  })
})
