import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasWebBluetooth,
  isIosLike,
  isStandalone,
  shouldOfferInstall,
  shouldShowBleBrowserPrompt,
} from './pwa'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// Stub the browser globals the detection helpers read. Values are defined as own
// properties on the navigator instance (shadowing the prototype getters) and
// removed in afterEach, so jsdom's defaults are restored between tests.
function stubEnv(opts: { ua: string; touch?: number; ble?: boolean; standalone?: boolean }) {
  const { ua, touch = 0, ble = false, standalone = false } = opts
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
  Object.defineProperty(navigator, 'bluetooth', { value: ble ? {} : undefined, configurable: true })
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

afterEach(() => {
  delete (navigator as { userAgent?: string }).userAgent
  delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
  delete (navigator as { bluetooth?: unknown }).bluetooth
  vi.unstubAllGlobals()
})

describe('isStandalone', () => {
  it('is true when display-mode: standalone matches', () => {
    stubEnv({ ua: IPHONE_UA, standalone: true })
    expect(isStandalone()).toBe(true)
  })

  it('is true via the legacy navigator.standalone flag', () => {
    stubEnv({ ua: IPHONE_UA })
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isStandalone()).toBe(true)
    delete (navigator as { standalone?: boolean }).standalone
  })

  it('is false in a normal browser tab', () => {
    stubEnv({ ua: IPHONE_UA })
    expect(isStandalone()).toBe(false)
  })
})

describe('isIosLike', () => {
  it('is true for an iPhone', () => {
    stubEnv({ ua: IPHONE_UA })
    expect(isIosLike()).toBe(true)
  })

  it('is true for iPadOS reporting a Mac UA with touch points', () => {
    stubEnv({ ua: MAC_UA, touch: 5 })
    expect(isIosLike()).toBe(true)
  })

  it('is false for desktop (Mac UA, no touch)', () => {
    stubEnv({ ua: MAC_UA, touch: 0 })
    expect(isIosLike()).toBe(false)
  })
})

describe('hasWebBluetooth', () => {
  it('reflects navigator.bluetooth presence', () => {
    stubEnv({ ua: IPHONE_UA, ble: true })
    expect(hasWebBluetooth()).toBe(true)
    stubEnv({ ua: IPHONE_UA, ble: false })
    expect(hasWebBluetooth()).toBe(false)
  })
})

describe('shouldShowBleBrowserPrompt', () => {
  it('true on iOS without Web Bluetooth (Safari)', () => {
    stubEnv({ ua: IPHONE_UA, ble: false })
    expect(shouldShowBleBrowserPrompt()).toBe(true)
  })

  it('false on iOS with Web Bluetooth (Bluefy)', () => {
    stubEnv({ ua: IPHONE_UA, ble: true })
    expect(shouldShowBleBrowserPrompt()).toBe(false)
  })

  it('false on desktop', () => {
    stubEnv({ ua: MAC_UA, touch: 0, ble: false })
    expect(shouldShowBleBrowserPrompt()).toBe(false)
  })
})

describe('shouldOfferInstall', () => {
  it('true on iOS + Bluetooth + browser tab', () => {
    stubEnv({ ua: IPHONE_UA, ble: true, standalone: false })
    expect(shouldOfferInstall()).toBe(true)
  })

  it('false once running from the Home Screen', () => {
    stubEnv({ ua: IPHONE_UA, ble: true, standalone: true })
    expect(shouldOfferInstall()).toBe(false)
  })

  it('false without Web Bluetooth (the BLE-browser prompt owns that case)', () => {
    stubEnv({ ua: IPHONE_UA, ble: false })
    expect(shouldOfferInstall()).toBe(false)
  })

  it('false on desktop', () => {
    stubEnv({ ua: MAC_UA, touch: 0, ble: true })
    expect(shouldOfferInstall()).toBe(false)
  })
})
