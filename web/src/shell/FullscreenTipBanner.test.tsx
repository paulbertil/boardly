import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullscreenTipBanner } from './FullscreenTipBanner'
import { FULLSCREEN_TIP_DISMISSED_KEY } from '@/lib/pwa'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0'

function stubEnv(opts: {
  ua: string
  touch?: number
  ble?: boolean
  standalone?: boolean
  fullscreen?: boolean
}) {
  const { ua, touch = 0, ble = false, standalone = false, fullscreen = false } = opts
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
  Object.defineProperty(navigator, 'bluetooth', { value: ble ? {} : undefined, configurable: true })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        (standalone && query.includes('standalone')) ||
        (fullscreen && query.includes('fullscreen')),
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

const name = { name: 'Go full screen' }

afterEach(() => {
  delete (navigator as { userAgent?: string }).userAgent
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
  delete (navigator as { bluetooth?: unknown }).bluetooth
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('FullscreenTipBanner', () => {
  it('shows on iOS + Bluetooth + browser tab', () => {
    stubEnv({ ua: IPHONE_UA, ble: true })
    render(<FullscreenTipBanner />)
    expect(screen.getByRole('region', name)).toHaveTextContent(/Enter fullscreen/)
  })

  it('is hidden once running from the Home Screen', () => {
    stubEnv({ ua: IPHONE_UA, ble: true, standalone: true })
    render(<FullscreenTipBanner />)
    expect(screen.queryByRole('region', name)).toBeNull()
  })

  it('is hidden when already in fullscreen', () => {
    stubEnv({ ua: IPHONE_UA, ble: true, fullscreen: true })
    render(<FullscreenTipBanner />)
    expect(screen.queryByRole('region', name)).toBeNull()
  })

  it('is hidden without Web Bluetooth', () => {
    stubEnv({ ua: IPHONE_UA, ble: false })
    render(<FullscreenTipBanner />)
    expect(screen.queryByRole('region', name)).toBeNull()
  })

  it('is hidden on desktop', () => {
    stubEnv({ ua: MAC_UA, touch: 0, ble: true })
    render(<FullscreenTipBanner />)
    expect(screen.queryByRole('region', name)).toBeNull()
  })

  it('dismisses and remembers the choice', () => {
    stubEnv({ ua: IPHONE_UA, ble: true })
    render(<FullscreenTipBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss full-screen tip' }))
    expect(screen.queryByRole('region', name)).toBeNull()
    expect(localStorage.getItem(FULLSCREEN_TIP_DISMISSED_KEY)).toBe('1')
  })

  it('stays dismissed on a later mount', () => {
    localStorage.setItem(FULLSCREEN_TIP_DISMISSED_KEY, '1')
    stubEnv({ ua: IPHONE_UA, ble: true })
    render(<FullscreenTipBanner />)
    expect(screen.queryByRole('region', name)).toBeNull()
  })
})
