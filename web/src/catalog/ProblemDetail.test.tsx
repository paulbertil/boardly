import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boardByLayoutId } from '../board/boards'
import type { CatalogProblem } from './catalogSync'
import { isFavorite } from './favoritesStore'
import { getRecentIds } from './recentsStore'
import { ProblemDetail } from './ProblemDetail'
import * as ble from '../ble/useBle'

vi.mock('../ble/useBle', () => ({
  useBle: vi.fn(() => ({ state: 'disconnected', deviceName: null, error: null })),
  connectBoard: vi.fn(),
  isConnected: vi.fn(() => false),
  setBleError: vi.fn(),
  bleClient: { send: vi.fn(), state: 'disconnected' },
}))

const board = boardByLayoutId(7)!

function problem(id: string, name: string): CatalogProblem {
  return {
    source_catalog_id: id,
    layout_id: 7,
    angle: 40,
    name,
    grade: '6B',
    user_grade: null,
    setter: 'Alice',
    stars: 0,
    repeats: 0,
    is_benchmark: false,
    method: null,
    holds: [{ c: 0, r: 1, t: 'start' }],
  }
}

const list = [problem('a', 'First'), problem('b', 'Middle'), problem('c', 'Last')]

function renderDetail(initialIndex: number, problems = list) {
  return render(
    <ProblemDetail
      problems={problems}
      initialIndex={initialIndex}
      board={board}
      angle={40}
      favoriteIds={new Set()}
      onClose={vi.fn()}
    />,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage'))
  vi.clearAllMocks()
  vi.mocked(ble.useBle).mockReturnValue({ state: 'disconnected', deviceName: null, error: null })
  vi.mocked(ble.isConnected).mockReturnValue(false)
})

describe('ProblemDetail', () => {
  it('renders the current problem metadata', () => {
    renderDetail(1)
    expect(screen.getByText('Middle')).toBeInTheDocument()
    expect(screen.getByText('by Alice')).toBeInTheDocument()
    expect(screen.getByText('6B')).toBeInTheDocument()
  })

  it('disables prev at the first and next at the last (no wrap)', () => {
    renderDetail(0)
    expect(screen.getByRole('button', { name: 'Previous problem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next problem' })).toBeEnabled()
  })

  it('pages forward through the list', () => {
    renderDetail(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next problem' }))
    expect(screen.getByText('Last')).toBeInTheDocument()
  })

  it('stays on the current problem if it leaves the filtered set', () => {
    const { rerender } = renderDetail(1) // showing "Middle"
    // Parent recomputes the list and drops "Middle" (e.g. unfavorited under a filter).
    rerender(
      <ProblemDetail
        problems={[list[0], list[2]]}
        initialIndex={1}
        board={board}
        angle={40}
        favoriteIds={new Set()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Middle')).toBeInTheDocument() // did not jump
    expect(screen.getByRole('button', { name: 'Previous problem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next problem' })).toBeDisabled()
  })

  it('records the viewed problem into recents', () => {
    renderDetail(1)
    expect(getRecentIds(7, 40)).toEqual(['b'])
  })

  it('toggles the favorite', () => {
    renderDetail(1)
    expect(isFavorite('b')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(isFavorite('b')).toBe(true)
  })

  it('connects before sending when disconnected, and does not send if connect fails', async () => {
    vi.mocked(ble.isConnected).mockReturnValue(false) // stays disconnected
    renderDetail(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /connect & light up/i }))
    })
    expect(ble.connectBoard).toHaveBeenCalled()
    expect(ble.bleClient.send).not.toHaveBeenCalled()
  })

  it('sends the mapped holds when already connected', async () => {
    vi.mocked(ble.useBle).mockReturnValue({ state: 'connected', deviceName: 'MB', error: null })
    vi.mocked(ble.isConnected).mockReturnValue(true)
    renderDetail(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /light up/i }))
    })
    expect(ble.bleClient.send).toHaveBeenCalledWith(
      [{ col: 0, row: 1, type: 'start' }],
      expect.objectContaining({ rows: 12, showBeta: true }),
    )
  })

  it('surfaces a send error', async () => {
    vi.mocked(ble.useBle).mockReturnValue({ state: 'connected', deviceName: 'MB', error: null })
    vi.mocked(ble.isConnected).mockReturnValue(true)
    vi.mocked(ble.bleClient.send).mockRejectedValueOnce(new Error('write failed'))
    renderDetail(1)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /light up/i }))
    })
    expect(screen.getByText('write failed')).toBeInTheDocument()
  })
})
