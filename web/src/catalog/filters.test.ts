import { describe, expect, it } from 'vitest'
import type { CatalogHold, CatalogProblem } from './catalogSync'
import {
  DEFAULT_FILTERS,
  applyFilters,
  hasActiveFilters,
  resetFilters,
  type FilterContext,
  type FilterState,
} from './filters'

function p(over: Partial<CatalogProblem> & { source_catalog_id: string }): CatalogProblem {
  return {
    layout_id: 7,
    angle: 40,
    name: 'Problem',
    grade: '6A',
    user_grade: null,
    setter: 'setter',
    stars: 0,
    repeats: 0,
    is_benchmark: false,
    method: null,
    holds: [],
    ...over,
  }
}

const ctx: FilterContext = { favoriteIds: new Set(), isClimbable: () => true }
const state = (over: Partial<FilterState> = {}): FilterState => ({ ...DEFAULT_FILTERS, ...over })
const ids = (list: CatalogProblem[]) => list.map((x) => x.source_catalog_id)

describe('applyFilters — search', () => {
  const list = [
    p({ source_catalog_id: 'a', name: 'Crimpfest', setter: 'Alice' }),
    p({ source_catalog_id: 'b', name: 'Slopers', setter: 'Bob' }),
  ]
  it('matches name or setter, case-insensitive', () => {
    expect(ids(applyFilters(list, state({ search: 'crimp' }), ctx))).toEqual(['a'])
    expect(ids(applyFilters(list, state({ search: 'BOB' }), ctx))).toEqual(['b'])
    expect(ids(applyFilters(list, state({ search: '' }), ctx))).toHaveLength(2)
  })
})

describe('applyFilters — sort', () => {
  it('easiest-first by grade with a differing secondary tiebreak', () => {
    const list = [
      p({ source_catalog_id: 'hard', grade: '7A', repeats: 5 }),
      p({ source_catalog_id: 'easyA', grade: '6A', repeats: 2 }),
      p({ source_catalog_id: 'easyB', grade: '6A', repeats: 9 }),
    ]
    // primary easiest (6A before 7A), secondary repeats (desc) within the tie.
    expect(ids(applyFilters(list, state(), ctx))).toEqual(['easyB', 'easyA', 'hard'])
  })

  it('hardest-first reverses the grade order', () => {
    const list = [p({ source_catalog_id: 'e', grade: '6A' }), p({ source_catalog_id: 'h', grade: '8A' })]
    expect(ids(applyFilters(list, state({ sortPrimary: 'hardest' }), ctx))).toEqual(['h', 'e'])
  })
})

describe('applyFilters — filters', () => {
  it('grade range excludes out-of-range but keeps unknown grades (AE4)', () => {
    const list = [
      p({ source_catalog_id: 'low', grade: '5+' }),
      p({ source_catalog_id: 'mid', grade: '6B' }),
      p({ source_catalog_id: 'unknown', grade: 'PROJECT' }),
    ]
    // Range covering 6A..7C (indices 3..13); 5+ (index 0) excluded, unknown kept.
    const out = ids(applyFilters(list, state({ gradeRange: [3, 13] }), ctx))
    expect(out).toContain('mid')
    expect(out).toContain('unknown')
    expect(out).not.toContain('low')
  })

  it('benchmark, min rating, and method each narrow', () => {
    const list = [
      p({ source_catalog_id: 'a', is_benchmark: true, stars: 3, method: 'Footless' }),
      p({ source_catalog_id: 'b', is_benchmark: false, stars: 1, method: null }),
    ]
    expect(ids(applyFilters(list, state({ benchmarkOnly: true }), ctx))).toEqual(['a'])
    expect(ids(applyFilters(list, state({ minStars: 2 }), ctx))).toEqual(['a'])
    expect(ids(applyFilters(list, state({ methods: ['Footless'] }), ctx))).toEqual(['a'])
  })

  it('favorites-only uses the context favorite set', () => {
    const list = [p({ source_catalog_id: 'a' }), p({ source_catalog_id: 'b' })]
    const favCtx: FilterContext = { favoriteIds: new Set(['b']), isClimbable: () => true }
    expect(ids(applyFilters(list, state({ favoritesOnly: true }), favCtx))).toEqual(['b'])
  })

  it('holds filter requires the problem to be a superset of the drawn holds', () => {
    const hold = (c: number, r: number): CatalogHold => ({ c, r, t: 'right' })
    const list = [
      p({ source_catalog_id: 'has', holds: [hold(0, 1), hold(2, 3), hold(4, 5)] }),
      p({ source_catalog_id: 'missing', holds: [hold(0, 1)] }),
    ]
    const out = ids(applyFilters(list, state({ holdsFilter: ['0-1', '2-3'] }), ctx))
    expect(out).toEqual(['has'])
  })

  it('applies the installed-hold-set climbable filter (AE1)', () => {
    const list = [p({ source_catalog_id: 'a' }), p({ source_catalog_id: 'b' })]
    const climbCtx: FilterContext = {
      favoriteIds: new Set(),
      isClimbable: (holds) => holds === list[0].holds, // only 'a' climbable
    }
    expect(ids(applyFilters(list, state(), climbCtx))).toEqual(['a'])
  })
})

describe('reset + active', () => {
  it('hasActiveFilters ignores search and sort', () => {
    expect(hasActiveFilters(state({ search: 'x', sortPrimary: 'hardest' }))).toBe(false)
    expect(hasActiveFilters(state({ benchmarkOnly: true }))).toBe(true)
  })

  it('resetFilters clears filters but keeps sort', () => {
    const s = state({ benchmarkOnly: true, minStars: 3, sortPrimary: 'rated', sortSecondary: 'easiest' })
    const r = resetFilters(s)
    expect(hasActiveFilters(r)).toBe(false)
    expect(r.sortPrimary).toBe('rated')
    expect(r.sortSecondary).toBe('easiest')
  })
})
