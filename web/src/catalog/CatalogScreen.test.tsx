import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { DEFAULT_FILTERS } from './filters'
import { CatalogScreen } from './CatalogScreen'
import { AuthProvider } from '../auth/AuthProvider'

// Board 7 / angle 40 is the default board+angle with a clean localStorage
// (DEFAULT_ACTIVE = 7, board 7's only angle is 40), so CatalogScreen resolves
// to that slab without any seeding.
const LAYOUT = 7
const ANGLE = 40

function problem(id: string, name: string, stars: number): CatalogProblem {
  return {
    source_catalog_id: id,
    layout_id: LAYOUT,
    angle: ANGLE,
    name,
    grade: '6B',
    user_grade: null,
    setter: 'Alice',
    stars,
    repeats: 0,
    is_benchmark: false,
    method: null,
    holds: [{ c: 0, r: 1, t: 'start' }],
  }
}

// Full slab: 'Visible' passes a minStars filter, the two 'Hidden' problems don't.
// Slab order (a, b, c) is deliberately different from the recents order so a test
// that pages the recents stack can't be satisfied by slab-order neighbors.
const SLAB = [
  problem('a', 'Visible', 5),
  problem('b', 'HiddenB', 0),
  problem('c', 'HiddenC', 0),
]

// Feed CatalogScreen a fixed slab instead of the async cache/sync layer.
vi.mock('./useSlab', () => ({
  useSlab: () => ({ problems: SLAB, loading: false, degraded: false }),
}))

// ProblemDetail (opened by tapping a recent) reaches for Web Bluetooth.
vi.mock('../ble/useBle', () => ({
  useBle: vi.fn(() => ({ state: 'disconnected', deviceName: null, error: null })),
  connectBoard: vi.fn(),
  isConnected: vi.fn(() => false),
  setBleError: vi.fn(),
  bleClient: { send: vi.fn(), state: 'disconnected' },
}))

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage'))
  vi.clearAllMocks()
  // Active grade/stars filter that narrows the displayed list to 'Visible'.
  localStorage.setItem(
    `catalogFilters_${LAYOUT}_${ANGLE}`,
    JSON.stringify({ ...DEFAULT_FILTERS, minStars: 1 }),
  )
})

describe('CatalogScreen — recents open as their own stack', () => {
  it('opens a filtered-out recent and pages within the recents stack, not the slab', () => {
    // Both hidden by the minStars filter; recents order becomes [C, B] (newest first).
    recordRecent(LAYOUT, ANGLE, 'b')
    recordRecent(LAYOUT, ANGLE, 'c')
    render(
      <AuthProvider>
        <CatalogScreen />
      </AuthProvider>,
    )

    // Precondition: the filter hides both recents from the main list.
    expect(screen.getByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('HiddenB')).toBeNull()
    expect(screen.queryByText('HiddenC')).toBeNull()

    // Open the sheet and tap the newest recent (C), which is filtered out.
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    fireEvent.click(screen.getByText('HiddenC'))

    // Detail opens on C. C is first in the recents stack, so Previous is disabled
    // and Next is enabled — unlike slab paging, where C (last slab entry) would
    // have Next disabled and Previous -> the non-recent 'HiddenB'/'Visible'.
    expect(screen.getByText('HiddenC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous problem/i })).toBeDisabled()
    const next = screen.getByRole('button', { name: /next problem/i })
    expect(next).toBeEnabled()

    // Next steps to the other recent (B), proving the pager traverses the recents
    // stack (newest->oldest), never the in-between slab entries.
    fireEvent.click(next)
    expect(screen.getByText('HiddenB')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next problem/i })).toBeDisabled()
  })
})
