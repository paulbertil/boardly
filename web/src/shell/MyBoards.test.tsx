import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveBoardId } from '../board/boardStore'
import { MyBoards } from './MyBoards'

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage')) // reset boardStore snapshot
})

describe('MyBoards', () => {
  it('shows the first-run prompt and every addable board when none are added', () => {
    render(<MyBoards onActivated={() => {}} />)
    expect(screen.getByText('Add your first board')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(5)
  })

  it('adds a non-default board, then activates it via Browse', () => {
    const onActivated = vi.fn()
    render(<MyBoards onActivated={onActivated} />)

    // Mini 2025 (7) is the default active board, so add a different one to get
    // a Browse action (an already-active board shows "Active", not "Browse").
    const addRow = screen.getByText('MoonBoard Masters 2019').closest('div')!
    fireEvent.click(within(addRow).getByRole('button', { name: 'Add' }))
    const myBoards = screen.getByText('My boards').closest('section')!
    expect(within(myBoards).getByText('MoonBoard Masters 2019')).toBeInTheDocument()

    fireEvent.click(within(myBoards).getByRole('button', { name: 'Browse' }))
    expect(onActivated).toHaveBeenCalled()
    expect(getActiveBoardId()).toBe(5)
  })

  it('configures the angle for a multi-angle board', () => {
    render(<MyBoards onActivated={() => {}} />)
    // Masters 2019 (layout 5) offers 40/25 — add it.
    const addRow = screen.getByText('MoonBoard Masters 2019').closest('div')!
    fireEvent.click(within(addRow).getByRole('button', { name: 'Add' }))

    // Its card now shows angle toggles; 40 is the default (pressed).
    expect(screen.getByRole('button', { name: '40°' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '25°' }))
    expect(screen.getByRole('button', { name: '25°' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles installed hold sets and blocks removing the last one', () => {
    render(<MyBoards onActivated={() => {}} />)
    // Add Mini 2025 (4 filterable hold sets, all installed by default).
    const addRow = screen.getByText('Mini MoonBoard 2025').closest('div')!
    fireEvent.click(within(addRow).getByRole('button', { name: 'Add' }))

    // Mini 2025 has no angle choice, so the only aria-pressed toggles are the
    // 4 installed hold sets.
    const toggles = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))
    expect(toggles()).toHaveLength(4)
    toggles().forEach((t) => expect(t).toHaveAttribute('aria-pressed', 'true'))

    // Turn three off; the last remaining one is disabled (empty = "all" is not allowed).
    fireEvent.click(toggles()[0])
    fireEvent.click(toggles()[1])
    fireEvent.click(toggles()[2])
    const stillOn = toggles().filter((t) => t.getAttribute('aria-pressed') === 'true')
    expect(stillOn).toHaveLength(1)
    expect(stillOn[0]).toBeDisabled()
  })

  it('removes an added board after a confirm click', () => {
    render(<MyBoards onActivated={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    expect(screen.getByText('My boards')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('My boards')).toBeInTheDocument() // first click just confirms
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }))
    expect(screen.queryByText('My boards')).toBeNull() // back to first-run
  })
})
