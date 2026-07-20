import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendRow } from './socialTypes'

// Controllable feed RPC + identity. `pages` is a queue of responses get_follow_feed returns in
// order; `fail` forces a null (network) error to exercise the offline/stale/error paths.
const h = vi.hoisted(() => ({
  userId: 'me' as string | null,
  pages: [] as (SendRow[] | 'error')[],
  online: true,
}))

vi.mock('../supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: h.userId ? { user: { id: h.userId } } : null } }) },
    rpc: async (name: string) => {
      if (name !== 'get_follow_feed') return { data: [], error: null }
      const next = h.pages.shift()
      if (next === undefined || next === 'error') return { data: null, error: { message: 'net' } }
      return { data: next, error: null }
    },
  },
}))

const { loadFeed, loadMoreFeed, getFeedSnapshot, resetFeedForTest } = await import('./feedStore')

function row(id: string, arrivalMs: number): SendRow {
  return {
    ascent_id: id,
    actor_id: 'a',
    handle: 'a',
    display_name: 'A',
    avatar_url: null,
    source_catalog_id: 'p',
    user_problem_id: null,
    problem_name: 'Prob',
    problem_grade: 'V5',
    board_layout_id: 7,
    climbed_at: new Date(arrivalMs).toISOString(),
    first_sent_at: new Date(arrivalMs).toISOString(),
  }
}

// A full page (30 rows) so `done` stays false; a short page marks done.
function fullPage(seed: number): SendRow[] {
  return Array.from({ length: 30 }, (_, i) => row(`s${seed}-${i}`, 2_000_000_000_000 - seed * 1000 - i))
}

beforeEach(() => {
  h.userId = 'me'
  h.pages = []
  h.online = true
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  resetFeedForTest()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('feedStore', () => {
  it('loads the first page and caches it', async () => {
    h.pages = [[row('x', 1000)]]
    await loadFeed()
    const s = getFeedSnapshot()
    expect(s.status).toBe('loaded')
    expect(s.sends).toHaveLength(1)
    expect(s.done).toBe(true)
    expect(localStorage.getItem('feedCacheV1')).toContain('"userId":"me"')
  })

  it('reports a loaded empty set when you follow no one', async () => {
    h.pages = [[]]
    await loadFeed()
    expect(getFeedSnapshot().status).toBe('loaded')
    expect(getFeedSnapshot().sends).toHaveLength(0)
  })

  it('goes offline when the first fetch fails and there is no cache', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    h.pages = ['error']
    await loadFeed()
    expect(getFeedSnapshot().status).toBe('offline')
  })

  it('paints the cache as stale when a refresh fails after a prior success', async () => {
    // First successful load populates the cache.
    h.pages = [[row('c', 5000)]]
    await loadFeed()
    resetFeedForTest()
    // Second load: fetch fails, but the user-keyed cache is painted stale.
    h.pages = ['error']
    await loadFeed()
    const s = getFeedSnapshot()
    expect(s.status).toBe('stale')
    expect(s.sends).toHaveLength(1)
  })

  it('keyset-paginates: loadMore appends the next page', async () => {
    h.pages = [fullPage(0), [row('more', 1)]]
    await loadFeed()
    expect(getFeedSnapshot().sends).toHaveLength(30)
    expect(getFeedSnapshot().done).toBe(false)
    await loadMoreFeed()
    expect(getFeedSnapshot().sends).toHaveLength(31)
    expect(getFeedSnapshot().done).toBe(true)
  })

  it('ignores a cache written under a different user id', async () => {
    localStorage.setItem(
      'feedCacheV1',
      JSON.stringify({ userId: 'other', sends: [row('leak', 9)], fetchedAt: Date.now() }),
    )
    h.pages = [[]]
    await loadFeed()
    // The other user's cache is never painted; we land on our own (empty) loaded set.
    expect(getFeedSnapshot().sends).toHaveLength(0)
  })
})
