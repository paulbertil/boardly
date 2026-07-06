// Environment detection for the two home-screen/BLE banners (see
// shell/BleBrowserBanner.tsx and shell/InstallBanner.tsx). Pure and
// dependency-free so it unit-tests without a DOM harness — every browser global
// is feature-detected, never assumed.

/**
 * True when the app is already running from the Home Screen (any
 * `display-mode: standalone`, or the legacy iOS `navigator.standalone`). When
 * true, neither install prompt should show.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mm = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return mm || legacy
}

/**
 * Coarse "is this an iPhone/iPad" check. iPadOS 13+ reports a desktop-Mac UA, so
 * disambiguate it with touch points. We gate the banners on this because their
 * advice (open in Bluefy / use the Share menu) is iOS-specific — desktop Chrome
 * gets a native install prompt and its own Bluetooth support.
 */
export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return iOS || iPadOS
}

/** Whether this browser exposes Web Bluetooth — same signal `getBluetooth()` guards on. */
export function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth
}

/**
 * Whether the page is currently full-screen — either via the Fullscreen API
 * (`document.fullscreenElement`) or `display-mode: fullscreen`. Best-effort:
 * iOS WKWebView browsers (Bluefy) hide their own chrome natively and may signal
 * neither, in which case this stays false and the tip relies on its dismiss button.
 */
export function isFullscreen(): boolean {
  if (typeof document !== 'undefined' && document.fullscreenElement) return true
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: fullscreen)').matches ?? false
}

/**
 * Show the "open in Bluefy" banner: on an iPhone/iPad in a browser that can't do
 * Bluetooth at all (Safari, in-app webviews). The board can't connect here.
 *
 * Suppressed once running standalone: Safari can add this app to the Home Screen
 * (our own apple-mobile-web-app-capable meta enables it), and that WKWebView also
 * lacks Web Bluetooth — but it has no browser chrome to "open in Bluefy" with, so
 * a banner there is a non-dismissable dead-end. The user sees this advice in the
 * Safari tab *before* installing; we don't strand it on-screen after.
 */
export function shouldShowBleBrowserPrompt(): boolean {
  return isIosLike() && !hasWebBluetooth() && !isStandalone()
}

/**
 * Show the "go full-screen in Bluefy" tip: on iOS, in a Bluetooth-capable
 * browser (Bluefy), that isn't already running app-like (standalone). Bluefy has
 * no "Add to Home Screen"; its menu's "Enter fullscreen" is the way to hide the
 * browser bars, so the tip points there.
 */
export function shouldOfferFullscreenTip(): boolean {
  return isIosLike() && hasWebBluetooth() && !isStandalone()
}

export const FULLSCREEN_TIP_DISMISSED_KEY = 'moonboard.fullscreenTipDismissed'

// localStorage can throw in restricted embedders like Bluefy (mirrors the
// best-effort readLS/writeLS in board/boardStore.ts). Never let a persistence
// failure crash a render or click handler.
export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore — the flag simply won't persist across reloads.
  }
}
