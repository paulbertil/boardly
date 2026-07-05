import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// The catalog screen pulls a slab; stub it out so App tests focus on routing.
vi.mock('./catalog/useSlab', () => ({
  useSlab: () => ({ problems: [], loading: false, degraded: false }),
}))

beforeEach(() => {
  localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage')) // reset boardStore snapshot
})

describe('App first-run routing', () => {
  it('lands on My Boards with the Catalog tab disabled when no boards are added', () => {
    render(<App />)
    expect(screen.getByText('Add your first board')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeDisabled()
  })

  it('enables the Catalog tab once a board is added', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeEnabled()
  })
})
