import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardByLayoutId } from '../board/boards'
import { CatalogRow } from './CatalogRow'
import type { CatalogProblem } from './catalogSync'

const board = boardByLayoutId(7)!

function problem(over: Partial<CatalogProblem> = {}): CatalogProblem {
  return {
    source_catalog_id: 'p1',
    layout_id: 7,
    angle: 40,
    name: 'Test Problem',
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

describe('CatalogRow', () => {
  it('renders name, grade pill, and setter subtitle', () => {
    render(<CatalogRow problem={problem()} board={board} />)
    expect(screen.getByText('Test Problem')).toBeInTheDocument()
    expect(screen.getByText('6B')).toBeInTheDocument()
    expect(screen.getByText('by Alice')).toBeInTheDocument()
  })

  it('falls back to hold count when the setter is empty', () => {
    render(<CatalogRow problem={problem({ setter: '', holds: [{ c: 0, r: 1, t: 'start' }] })} board={board} />)
    expect(screen.getByText('1 holds')).toBeInTheDocument()
  })

  it('shows stars/repeats only when greater than zero', () => {
    const { rerender } = render(<CatalogRow problem={problem({ stars: 0, repeats: 0 })} board={board} />)
    expect(screen.queryByText('0')).toBeNull()
    rerender(<CatalogRow problem={problem({ stars: 3, repeats: 12 })} board={board} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows the method label when present', () => {
    render(<CatalogRow problem={problem({ method: 'Footless' })} board={board} />)
    expect(screen.getByText('Footless')).toBeInTheDocument()
  })

  it('shows benchmark and favorite badges conditionally', () => {
    const { rerender } = render(<CatalogRow problem={problem()} board={board} />)
    expect(screen.queryByLabelText('Benchmark')).toBeNull()
    expect(screen.queryByLabelText('Favorite')).toBeNull()
    rerender(<CatalogRow problem={problem({ is_benchmark: true })} board={board} isFavorite />)
    expect(screen.getByLabelText('Benchmark')).toBeInTheDocument()
    expect(screen.getByLabelText('Favorite')).toBeInTheDocument()
  })

  it('renders the board thumbnail only when enabled', () => {
    const { rerender, container } = render(<CatalogRow problem={problem()} board={board} />)
    expect(container.querySelector('.catalog-board')).toBeNull()
    rerender(<CatalogRow problem={problem()} board={board} showThumbnail />)
    expect(container.querySelector('.catalog-board')).not.toBeNull()
  })

  it('calls onSelect with the problem when clicked', () => {
    const onSelect = vi.fn()
    const p = problem()
    render(<CatalogRow problem={p} board={board} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(p)
  })
})
