import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SendItem } from './socialTypes'
import type { FeedState } from './feedStore'

const h = vi.hoisted(() => ({ state: null as FeedState | null }))

vi.mock('./feedStore', () => ({
  useFeed: () => h.state,
  loadFeed: vi.fn(),
  loadMoreFeed: vi.fn(),
}))
vi.mock('./FeedItem', () => ({
  FeedItem: ({ send }: { send: { ascentId: string } }) => <div>item:{send.ascentId}</div>,
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))

const { FeedScreen } = await import('./FeedScreen')

function send(ascentId: string, arrivalMs: number): SendItem {
  return {
    ascentId,
    actorId: 'a',
    handle: 'ana',
    displayName: 'Ana',
    avatarUrl: null,
    sourceCatalogId: 'p',
    userProblemId: null,
    problemName: 'Prob',
    problemGrade: 'V5',
    boardLayoutId: 7,
    climbedAt: new Date(arrivalMs).toISOString(),
    firstSentAt: new Date(arrivalMs).toISOString(),
  }
}

function feed(partial: Partial<FeedState>): FeedState {
  return { status: 'loaded', sends: [], done: true, fetchedAt: null, ...partial }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('FeedScreen', () => {
  it('shows the empty-graph state with a discovery link', () => {
    h.state = feed({ sends: [] })
    render(<FeedScreen />)
    expect(screen.getByText('Your feed is quiet')).toBeInTheDocument()
    expect(screen.getByText('Find people')).toBeInTheDocument()
  })

  it('collapses a same-actor burst and expands it on click', () => {
    const T = 1_000_000_000_000
    h.state = feed({ sends: [send('s1', T), send('s2', T - 1000), send('s3', T - 2000), send('s4', T - 3000)] })
    render(<FeedScreen />)
    // Collapsed: one burst row, no individual items shown yet.
    expect(screen.getByText('4 sends')).toBeInTheDocument()
    expect(screen.queryByText('item:s1')).not.toBeInTheDocument()
    // Expand.
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('item:s1')).toBeInTheDocument()
    expect(screen.getByText('item:s4')).toBeInTheDocument()
  })

  it('shows the offline-stale banner when painting the cache', () => {
    h.state = feed({ status: 'stale', sends: [send('s1', Date.now())], fetchedAt: Date.now() })
    render(<FeedScreen />)
    expect(screen.getByText(/Offline — last updated/)).toBeInTheDocument()
  })

  it('renders the offline no-cache state', () => {
    h.state = feed({ status: 'offline', sends: [] })
    render(<FeedScreen />)
    expect(screen.getByText(/You're offline/)).toBeInTheDocument()
  })
})
