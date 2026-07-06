import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BleBrowserBanner } from './BleBrowserBanner'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0'

function stubEnv(opts: { ua: string; touch?: number; ble?: boolean }) {
  const { ua, touch = 0, ble = false } = opts
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
  Object.defineProperty(navigator, 'bluetooth', { value: ble ? {} : undefined, configurable: true })
}

afterEach(() => {
  delete (navigator as { userAgent?: string }).userAgent
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
  delete (navigator as { bluetooth?: unknown }).bluetooth
  vi.unstubAllGlobals()
})

describe('BleBrowserBanner', () => {
  it('shows on iOS without Web Bluetooth and names Bluefy, with no dismiss control', () => {
    stubEnv({ ua: IPHONE_UA, ble: false })
    render(<BleBrowserBanner />)
    const region = screen.getByRole('region', { name: 'Bluetooth not supported' })
    expect(region).toBeInTheDocument()
    expect(region).toHaveTextContent(/Bluefy/)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is hidden when Web Bluetooth is available (Bluefy)', () => {
    stubEnv({ ua: IPHONE_UA, ble: true })
    render(<BleBrowserBanner />)
    expect(screen.queryByRole('region', { name: 'Bluetooth not supported' })).toBeNull()
  })

  it('shows on a non-iOS browser without Web Bluetooth and names Chrome', () => {
    stubEnv({ ua: MAC_UA, touch: 0, ble: false })
    render(<BleBrowserBanner />)
    const region = screen.getByRole('region', { name: 'Bluetooth not supported' })
    expect(region).toHaveTextContent(/Chrome/)
    expect(region).not.toHaveTextContent(/Bluefy/)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is hidden when Web Bluetooth is available (desktop/Android Chrome)', () => {
    stubEnv({ ua: MAC_UA, touch: 0, ble: true })
    render(<BleBrowserBanner />)
    expect(screen.queryByRole('region', { name: 'Bluetooth not supported' })).toBeNull()
  })
})
