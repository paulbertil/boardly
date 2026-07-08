import { describe, expect, it, vi } from 'vitest'
import { fetchCatalogDeltas } from './catalogSync'

// A minimal chainable stand-in for the supabase query builder: every filter/order
// method returns the builder; range() resolves the next queued page. We only assert on
// pagination behaviour, so page rows can be opaque.
function makeClient(pages: unknown[][], opts: { error?: unknown } = {}) {
  const rangeCalls: Array<[number, number]> = []
  const gteArgs: string[] = []
  let i = 0
  const builder: Record<string, unknown> = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn((_col: string, val: string) => {
      gteArgs.push(val)
      return builder
    }),
    order: vi.fn(() => builder),
    range: vi.fn((from: number, to: number) => {
      rangeCalls.push([from, to])
      if (opts.error) return Promise.resolve({ data: null, error: opts.error })
      return Promise.resolve({ data: pages[i++] ?? [], error: null })
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: builder as any, rangeCalls, gteArgs }
}

const row = (id: string) => ({ source_catalog_id: id })

describe('fetchCatalogDeltas', () => {
  it('accumulates every page and stops on the first empty page', async () => {
    const { client, rangeCalls } = makeClient([
      [row('a'), row('b')],
      [row('c')],
      [], // empty -> terminate
    ])
    const rows = await fetchCatalogDeltas(client, 7, 40, '1970-01-01T00:00:00+00:00')
    expect(rows.map((r) => (r as { source_catalog_id: string }).source_catalog_id)).toEqual(['a', 'b', 'c'])
    // Advances by the rows actually returned, not a fixed stride: 0 -> 2 -> 3.
    expect(rangeCalls.map(([from]) => from)).toEqual([0, 2, 3])
  })

  it('keeps paging when the server caps pages BELOW the requested size (the truncation bug)', async () => {
    // Every page is shorter than PAGE_SIZE (1000) yet non-empty: the old `length < PAGE_SIZE`
    // break would have stopped after page 1 and silently truncated the slab.
    const { client } = makeClient([[row('a'), row('b')], [row('c'), row('d')], []])
    const rows = await fetchCatalogDeltas(client, 7, 40, '1970-01-01T00:00:00+00:00')
    expect(rows).toHaveLength(4)
  })

  it('filters with >= cursor so a row sharing the cursor timestamp is not skipped', async () => {
    const { client, gteArgs } = makeClient([[]])
    await fetchCatalogDeltas(client, 7, 40, '2026-01-01T00:00:00+00:00')
    expect(gteArgs).toEqual(['2026-01-01T00:00:00+00:00'])
  })

  it('propagates a query error instead of returning a partial slab', async () => {
    const { client } = makeClient([], { error: { message: 'boom' } })
    await expect(fetchCatalogDeltas(client, 7, 40, '1970-01-01T00:00:00+00:00')).rejects.toBeDefined()
  })
})
