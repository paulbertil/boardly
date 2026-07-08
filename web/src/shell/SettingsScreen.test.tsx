import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { SettingsScreen } from './SettingsScreen'
import { setTheme } from './themeStore'

// SettingsScreen renders a TanStack <Link>; stub it as a plain anchor so the screen can be
// rendered in isolation (without a RouterProvider).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  // Deterministic start — jsdom has no matchMedia, so System resolves to light.
  setTheme('system')
})

describe('SettingsScreen', () => {
  it('renders the three appearance options', () => {
    render(<SettingsScreen />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    for (const name of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('applies the Dark theme when the Dark segment is clicked', () => {
    render(<SettingsScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('links to the MoonBoard import flow', () => {
    render(<SettingsScreen />)
    const link = screen.getByRole('link', { name: /import from moonboard/i })
    expect(link).toHaveAttribute('href', '/logbook/import')
  })
})
