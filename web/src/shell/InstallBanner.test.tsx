import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallBanner } from './InstallBanner'
import { INSTALL_DISMISSED_KEY } from '@/lib/pwa'

const region = { name: 'Install MoonBoard' }

// jsdom lacks matchMedia; isStandalone() reads it. Default to a non-standalone stub.
function stubMatchMedia(standalone = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: standalone && query.includes('standalone'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  )
}

// Dispatch a synthetic beforeinstallprompt (Chrome fires this on installable pages).
function fireBeforeInstallPrompt() {
  const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> }
  e.prompt = vi.fn().mockResolvedValue(undefined)
  const preventDefault = vi.spyOn(e, 'preventDefault')
  act(() => {
    window.dispatchEvent(e)
  })
  return { e, preventDefault }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('InstallBanner', () => {
  it('is hidden until the browser fires beforeinstallprompt', () => {
    stubMatchMedia()
    render(<InstallBanner />)
    expect(screen.queryByRole('region', region)).toBeNull()
  })

  it('appears once installable and intercepts the default mini-infobar', () => {
    stubMatchMedia()
    render(<InstallBanner />)
    const { preventDefault } = fireBeforeInstallPrompt()
    expect(preventDefault).toHaveBeenCalled()
    expect(screen.getByRole('region', region)).toBeInTheDocument()
  })

  it('triggers the native install prompt on click, then hides', () => {
    stubMatchMedia()
    render(<InstallBanner />)
    const { e } = fireBeforeInstallPrompt()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(e.prompt).toHaveBeenCalled()
    expect(screen.queryByRole('region', region)).toBeNull()
  })

  it('dismisses and remembers the choice', () => {
    stubMatchMedia()
    render(<InstallBanner />)
    fireBeforeInstallPrompt()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install banner' }))
    expect(screen.queryByRole('region', region)).toBeNull()
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1')
  })

  it('stays dismissed on a later mount', () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    stubMatchMedia()
    render(<InstallBanner />)
    fireBeforeInstallPrompt()
    expect(screen.queryByRole('region', region)).toBeNull()
  })

  it('hides after the app is installed', () => {
    stubMatchMedia()
    render(<InstallBanner />)
    fireBeforeInstallPrompt()
    expect(screen.getByRole('region', region)).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('region', region)).toBeNull()
  })
})
