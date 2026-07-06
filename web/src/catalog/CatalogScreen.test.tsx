import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { addBoard } from '../board/boardStore'
import { renderWithRouter } from '../test/renderWithRouter'
import { useSlab } from './useSlab'

// Board 7 / angle 40 is the default board+angle (board 7's only angle is 40).
const LAYOUT = 7
const ANGLE = 40

function problem(
  id: string,
  name: string,
  stars: number,
  holds: CatalogProblem['holds'] = [{ c: 0, r: 1, t: 'start' }],
): CatalogProblem {
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
    holds,
  }
}

const H = (c: number, r: number): CatalogProblem['holds'][number] => ({ c, r, t: 'start' })

// Full slab: 'Visible' passes a minStars filter, the two 'Hidden' problems don't.
// Slab order (a, b, c) is deliberately different from the recents order so a test
// that pages the recents stack can't be satisfied by slab-order neighbors. Holds
// differ per problem so a ?holds filter can narrow the list.
const SLAB = [
  problem('a', 'Visible', 5, [H(0, 1), H(2, 3)]),
  problem('b', 'HiddenB', 0, [H(0, 1)]),
  problem('c', 'HiddenC', 0, [H(4, 5)]),
]

// Feed CatalogScreen a controllable slab instead of the async cache/sync layer.
vi.mock('./useSlab', () => ({ useSlab: vi.fn() }))

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
  vi.mocked(useSlab).mockReturnValue({ problems: SLAB, loading: false, degraded: false })
})

describe('CatalogScreen — recents open as their own stack', () => {
  it('opens a filtered-out recent and pages within the recents stack, not the slab', async () => {
    addBoard(LAYOUT)
    // Both hidden by the minStars filter; recents order becomes [C, B] (newest first).
    recordRecent(LAYOUT, ANGLE, 'b')
    recordRecent(LAYOUT, ANGLE, 'c')
    // The filter is URL-driven now: ?stars=1 narrows the displayed list to 'Visible'.
    renderWithRouter(`/board/${LAYOUT}/catalog?stars=1`)

    // Precondition: the filter hides both recents from the main list.
    expect(await screen.findByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('HiddenB')).toBeNull()
    expect(screen.queryByText('HiddenC')).toBeNull()

    // Open the recents sheet and tap the newest recent (C), which is filtered out.
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    fireEvent.click(await screen.findByText('HiddenC'))

    // Detail opens on C. C is first in the recents stack, so Previous is disabled and
    // Next is enabled — unlike slab paging, where C (last slab entry) would have Next
    // disabled and Previous -> the non-recent 'HiddenB'/'Visible'.
    expect(await screen.findByRole('heading', { name: 'HiddenC' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous problem/i })).toBeDisabled()
    const next = screen.getByRole('button', { name: /next problem/i })
    expect(next).toBeEnabled()

    // Next steps to the other recent (B), proving the pager traverses the recents
    // stack (newest->oldest), never the in-between slab entries.
    fireEvent.click(next)
    expect(await screen.findByRole('heading', { name: 'HiddenB' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next problem/i })).toBeDisabled()
  })

  it('resets the pager to the filtered list after Back-closing a recent (no stale stack)', async () => {
    addBoard(LAYOUT)
    recordRecent(LAYOUT, ANGLE, 'b')
    recordRecent(LAYOUT, ANGLE, 'c') // recents [C, B]
    const { router } = renderWithRouter(`/board/${LAYOUT}/catalog`) // no filter: displayed = [a, b, c]
    await screen.findByText('Visible')

    // Open recent C (pages the recents stack), then Back to close. Scope the tap to
    // the recents sheet — HiddenC is also in the unfiltered list.
    fireEvent.click(screen.getByRole('button', { name: /recently viewed/i }))
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByText('HiddenC'))
    await screen.findByRole('heading', { name: 'HiddenC' })
    router.history.back()
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('problem'))

    // Open HiddenB from the LIST now. The pager must traverse `displayed` (slab order
    // a,b,c) — B is the middle entry, so Next -> HiddenC. If the recents snapshot [C,B]
    // had leaked, B would be last and Next would be disabled.
    fireEvent.click(screen.getByText('HiddenB'))
    await screen.findByRole('heading', { name: 'HiddenB' })
    const next = screen.getByRole('button', { name: /next problem/i })
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(await screen.findByRole('heading', { name: 'HiddenC' })).toBeInTheDocument()
  })
})

describe('CatalogScreen — deep-linked problem loading', () => {
  it('shows a loading state for a deep-linked problem while its slab is still syncing', async () => {
    vi.mocked(useSlab).mockReturnValue({ problems: [], loading: true, degraded: false })
    addBoard(LAYOUT)
    renderWithRouter(`/board/${LAYOUT}/catalog?problem=782b2b3b`)
    // The slab hasn't resolved, so the drawer opens on a spinner rather than nothing.
    expect(await screen.findByTestId('problem-pending')).toBeInTheDocument()
    expect(screen.getByText('Loading problem…')).toBeInTheDocument()
  })
})

describe('CatalogScreen — hold filter over routing', () => {
  it('narrows the list to superset-matching problems from ?holds', async () => {
    addBoard(LAYOUT)
    // Only 'Visible' (a) has hold 2-3; the others do not.
    renderWithRouter(`/board/${LAYOUT}/catalog?holds=2-3`)
    expect(await screen.findByText('Visible')).toBeInTheDocument()
    expect(screen.queryByText('HiddenB')).toBeNull()
    expect(screen.queryByText('HiddenC')).toBeNull()
  })

  it('rings the highlighted hold on the detail board from a ?holds deep link', async () => {
    addBoard(LAYOUT)
    // b (HiddenB) has hold 0-1; deep-link it open with 0-1 highlighted.
    renderWithRouter(`/board/${LAYOUT}/catalog?holds=0-1&problem=b`)
    await screen.findByRole('heading', { name: 'HiddenB' })
    // The detail board (inside the drawer) rings the highlighted position b uses.
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getAllByTestId('hold-highlight')).toHaveLength(1)
  })
})
