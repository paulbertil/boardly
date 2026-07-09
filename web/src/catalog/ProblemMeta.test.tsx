import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CatalogProblem } from './catalogSync'
import { ProblemMeta } from './ProblemMeta'

function problem(over: Partial<CatalogProblem> = {}): CatalogProblem {
  return {
    source_catalog_id: 'a',
    layout_id: 7,
    angle: 40,
    name: 'Alpha',
    grade: '6B',
    user_grade: null,
    setter: 'Alice',
    stars: 0,
    repeats: 0,
    is_benchmark: false,
    method: null,
    holds: [{ c: 0, r: 1, t: 'start' }],
    ...over,
  }
}

describe('ProblemMeta', () => {
  it('renders stars, repeats, method, and setter when present', () => {
    render(<ProblemMeta problem={problem({ stars: 5, repeats: 463, method: 'No kickboard' })} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('463')).toBeInTheDocument()
    expect(screen.getByText('No kickboard')).toBeInTheDocument()
    expect(screen.getByText('by Alice')).toBeInTheDocument()
  })

  it('omits stars/repeats/method when zero/absent', () => {
    render(<ProblemMeta problem={problem()} />)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText('by Alice')).toBeInTheDocument()
  })

  it('falls back to a hold count when there is no setter', () => {
    render(<ProblemMeta problem={problem({ setter: '', holds: [{ c: 0, r: 1, t: 'start' }, { c: 1, r: 2, t: 'end' }] })} />)
    expect(screen.getByText('2 holds')).toBeInTheDocument()
  })
})
