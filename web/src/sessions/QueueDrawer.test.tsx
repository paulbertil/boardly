import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boardByLayoutId } from '../board/boards'
import type { CatalogProblem } from '../catalog/catalogSync'
import type { SenderChip } from '../catalog/useMemberSenders'
import type { QueueItem } from './queueTypes'
import type { QueueState } from './queueStore'
import { QueueDrawer } from './QueueDrawer'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// The store owns the writes; the drawer is what we exercise. Each mutation is a spy so we can
// assert the drawer calls it (and drive a rejection for the failed-write path). useSessionQueue
// returns a mutable module-level snapshot so a test can advance the queue and re-render.

let queueState: QueueState = { status: 'loaded', activeItems: [], doneItems: [], error: null }

const checkOff = vi.fn().mockResolvedValue(undefined)
const unCheck = vi.fn().mockResolvedValue('ok')
const removeItem = vi.fn().mockResolvedValue(undefined)
const reorder = vi.fn().mockResolvedValue(undefined)
const addProblem = vi.fn().mockResolvedValue('ok')

vi.mock('./queueStore', () => ({
  useSessionQueue: () => queueState,
  checkOff: (...a: unknown[]) => checkOff(...a),
  unCheck: (...a: unknown[]) => unCheck(...a),
  removeItem: (...a: unknown[]) => removeItem(...a),
  reorder: (...a: unknown[]) => reorder(...a),
  addProblem: (...a: unknown[]) => addProblem(...a),
}))

vi.mock('./sessionsStore', () => ({
  useSessions: () => ({ activeSession: { id: 's1', boardLayoutId: 7, name: 'Session' } }),
}))

let sendersMap = new Map<string, SenderChip[]>()
vi.mock('../catalog/useMemberSenders', () => ({
  useMemberSenders: () => ({ senders: sendersMap, state: 'ready' }),
}))

const PROBLEMS: Record<string, Partial<CatalogProblem>> = {
  p1: { source_catalog_id: 'p1', name: 'ALPHA', grade: '6A' },
  p2: { source_catalog_id: 'p2', name: 'BRAVO', grade: '6B' },
  p3: { source_catalog_id: 'p3', name: 'CHARLIE', grade: '7A' },
}
vi.mock('../catalog/catalogSync', () => ({
  getCatalogProblemsByIds: (ids: string[]) => {
    const m = new Map<string, Partial<CatalogProblem>>()
    for (const id of ids) if (PROBLEMS[id]) m.set(id, PROBLEMS[id])
    return Promise.resolve(m)
  },
}))

const toastFn = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastFn(...a), {
    error: (...a: unknown[]) => toastError(...a),
  }),
}))

// ── Fixtures ────────────────────────────────────────────────────────────────

const board = boardByLayoutId(7)!

function activeItem(id: string, sourceCatalogId: string, position: number): QueueItem {
  return {
    id,
    sessionId: 's1',
    sourceCatalogId,
    boardLayoutId: 7,
    addedBy: null,
    position,
    doneAt: null,
    doneBy: null,
    createdAt: `2026-01-01T00:0${position}:00Z`,
    updatedAt: `2026-01-01T00:0${position}:00Z`,
    deleted: false,
  }
}

function doneItem(id: string, sourceCatalogId: string, doneAt: string): QueueItem {
  return { ...activeItem(id, sourceCatalogId, 0), doneAt, doneBy: 'u1' }
}

const onOpenProblem = vi.fn()

function renderDrawer() {
  return render(<QueueDrawer board={board} onOpenProblem={onOpenProblem} />)
}

/** Open the drawer by clicking the entry-point trigger (its name starts with "Queue"). */
function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: /^queue/i }))
}

beforeEach(() => {
  queueState = { status: 'loaded', activeItems: [], doneItems: [], error: null }
  sendersMap = new Map()
  vi.clearAllMocks()
  checkOff.mockResolvedValue(undefined)
  unCheck.mockResolvedValue('ok')
  removeItem.mockResolvedValue(undefined)
  reorder.mockResolvedValue(undefined)
  addProblem.mockResolvedValue('ok')
})

describe('QueueDrawer', () => {
  it('renders the active and done groups and a badge with the active count', async () => {
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1), activeItem('a2', 'p2', 2)],
      doneItems: [doneItem('d1', 'p3', '2026-01-01T01:00:00Z')],
      error: null,
    }
    renderDrawer()
    // The entry-point badge reflects the active count (2), not active + done.
    expect(screen.getByRole('button', { name: /queue, 2 active/i })).toBeInTheDocument()

    openDrawer()
    expect(await screen.findByText('ALPHA')).toBeInTheDocument()
    expect(screen.getByText('BRAVO')).toBeInTheDocument()
    expect(screen.getByText('CHARLIE')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /done/i })).toBeInTheDocument()
  })

  it('shows the add-paths prompt when the queue is empty', async () => {
    renderDrawer()
    openDrawer()
    expect(await screen.findByText(/no climbs queued yet/i)).toBeInTheDocument()
  })

  it('renders the Done group (and no empty prompt) when active is empty but done is present', async () => {
    queueState = {
      status: 'loaded',
      activeItems: [],
      doneItems: [doneItem('d1', 'p3', '2026-01-01T01:00:00Z')],
      error: null,
    }
    renderDrawer()
    openDrawer()
    expect(await screen.findByText('CHARLIE')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /done/i })).toBeInTheDocument()
    expect(screen.queryByText(/no climbs queued yet/i)).not.toBeInTheDocument()
  })

  it('shows a loading skeleton (not the empty prompt) while the queue is loading', async () => {
    queueState = { status: 'loading', activeItems: [], doneItems: [], error: null }
    renderDrawer()
    openDrawer()
    expect(await screen.findByTestId('queue-loading')).toBeInTheDocument()
    expect(screen.queryByText(/no climbs queued yet/i)).not.toBeInTheDocument()
  })

  it('checks a row off — calls the store and the row moves to the Done group', async () => {
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1)],
      doneItems: [],
      error: null,
    }
    const view = renderDrawer()
    openDrawer()
    await screen.findByText('ALPHA')

    fireEvent.click(screen.getByRole('button', { name: /mark alpha done/i }))
    expect(checkOff).toHaveBeenCalledWith('a1')

    // The store owns the move; simulate its post-write state and re-render.
    queueState = {
      status: 'loaded',
      activeItems: [],
      doneItems: [doneItem('a1', 'p1', '2026-01-01T02:00:00Z')],
      error: null,
    }
    view.rerender(<QueueDrawer board={board} onOpenProblem={onOpenProblem} />)
    // ALPHA now carries the un-check control that only Done rows have.
    expect(await screen.findByRole('button', { name: /move alpha back to the queue/i })).toBeInTheDocument()
  })

  it('surfaces an error toast when a mutation rejects', async () => {
    checkOff.mockRejectedValueOnce(new Error('offline'))
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1)],
      doneItems: [],
      error: null,
    }
    renderDrawer()
    openDrawer()
    await screen.findByText('ALPHA')

    fireEvent.click(screen.getByRole('button', { name: /mark alpha done/i }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/couldn.t update the queue/i)),
    )
  })

  it('offers an Undo affordance after a remove', async () => {
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1)],
      doneItems: [],
      error: null,
    }
    renderDrawer()
    openDrawer()
    await screen.findByText('ALPHA')

    fireEvent.click(screen.getByRole('button', { name: /remove alpha from the queue/i }))
    expect(removeItem).toHaveBeenCalledWith('a1')

    await waitFor(() => expect(toastFn).toHaveBeenCalled())
    const [, opts] = toastFn.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
    expect(opts.action.label).toBe('Undo')

    // Undo re-adds the problem (position resets — v1 accepted).
    opts.action.onClick()
    expect(addProblem).toHaveBeenCalledWith('p1', 7)
  })

  it('shows the sender indicator on a row a crew member has sent', async () => {
    sendersMap = new Map([
      ['p1', [{ userId: 'u2', isSelf: false, label: 'Bob', initials: 'BO', avatarUrl: null }]],
    ])
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1)],
      doneItems: [],
      error: null,
    }
    renderDrawer()
    openDrawer()
    // The row stays in place; the sends pill is present with its accessible summary.
    expect(await screen.findByText('ALPHA')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sent by bob/i })).toBeInTheDocument()
  })

  it('tapping a row closes the drawer and opens the problem via navigation (no board light)', async () => {
    queueState = {
      status: 'loaded',
      activeItems: [activeItem('a1', 'p1', 1)],
      doneItems: [],
      error: null,
    }
    renderDrawer()
    openDrawer()
    fireEvent.click(await screen.findByText('ALPHA'))

    // The shared ?problem navigation is invoked with the source catalog id (KTD9 / R9)...
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
    // ...and no queue mutation fired (tap is open-only; lighting stays the manual lightbulb —
    // the component imports no BLE/light path at all).
    expect(checkOff).not.toHaveBeenCalled()
    expect(reorder).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})
