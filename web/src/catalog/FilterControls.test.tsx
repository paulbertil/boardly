import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { boardByLayoutId } from '../board/boards'
import { DEFAULT_FILTERS, type FilterState } from './filters'
import { FilterControls } from './FilterControls'

const gradeSpan: [number, number] = [3, 15]
const board = boardByLayoutId(7)!

function setup(over: Partial<FilterState> = {}) {
  const state = { ...DEFAULT_FILTERS, ...over }
  const onChange = vi.fn()
  render(
    <FilterControls
      state={state}
      onChange={onChange}
      board={board}
      gradeSpan={gradeSpan}
      methods={['Footless', 'No kickboard']}
    />,
  )
  return { onChange }
}

describe('FilterControls', () => {
  it('toggles the benchmark filter', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Benchmarks' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ benchmarkOnly: true }))
  })

  it('toggles a method chip', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByText('Footless'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ methods: ['Footless'] }))
  })

  it('shows Reset only when a filter is active, and resets on click', () => {
    setup() // no active filters
    expect(screen.queryByRole('button', { name: /reset filters/i })).toBeNull()

    const { onChange } = setup({ benchmarkOnly: true })
    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ benchmarkOnly: false }))
  })
})
