// Generic left-swipe-to-act touch gesture, extracted from useSwipeToQueue so the same mechanics
// back both "swipe a catalog row left to queue" and "swipe a queue row left to remove". A hand-
// rolled touch gesture on the `usePullToRefresh` idiom — raw touchstart/touchmove/touchend
// listeners bound to the row, live math in closure vars (not state) so `touchend` reads the
// current delta, state mirrored out only to drive the reveal.
//
// It disambiguates four one-finger interactions (KTD7 / R2 / F1): a dominant LEFT-horizontal
// swipe past the trigger fires `onTrigger`; a vertical drag falls through to scroll / a drawer's
// dismiss (never preventDefault); a tap (no movement past the axis-lock) opens the row (we never
// swallow the click). The caller renders the revealed action beside the row in a translated flex
// track (see CatalogRow / QueueItemRow), driven by the returned `offset`. Touch-only; inert unless
// `enabled`. `onTrigger` owns its own toasts and error handling.

import { useEffect, useRef, useState, type RefObject } from 'react'

/** Finger travel (px) before we commit to an axis — below this a touch is still a tap. */
export const SWIPE_AXIS_LOCK = 10
/** Leftward travel (px) past which a release fires the action. */
export const SWIPE_TRIGGER = 72
/** Visual cap on how far the row slides open (px). */
export const SWIPE_MAX_REVEAL = 96

export type SwipeAxis = 'none' | 'horizontal' | 'vertical'

/**
 * Commit a gesture to an axis once it passes the axis-lock. `'none'` while still within the
 * lock (a tap). Beyond it, the axis is whichever delta dominates — the single point that keeps a
 * vertical drag (scroll / pull-to-refresh / drawer dismiss) from being mistaken for a swipe.
 */
export function resolveSwipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.abs(dx) < SWIPE_AXIS_LOCK && Math.abs(dy) < SWIPE_AXIS_LOCK) return 'none'
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
}

/** The action fires only for a horizontal-dominant, leftward gesture past the trigger. */
export function shouldFireSwipe(dx: number, dy: number): boolean {
  return resolveSwipeAxis(dx, dy) === 'horizontal' && dx <= -SWIPE_TRIGGER
}

export interface SwipeActionState {
  /** Current horizontal offset in px (negative = revealed leftward, 0 idle). */
  offset: number
  /** Past the trigger threshold — a release now would fire the action. */
  armed: boolean
  /** The action is in flight — drives the brief confirm affordance. */
  confirming: boolean
}

export interface SwipeActionOptions {
  /** Active only when the gesture applies (e.g. a touch device in the relevant context). */
  enabled: boolean
  /** Fired on a leftward release past the trigger. Owns its own toasts / error handling. */
  onTrigger: () => void | Promise<void>
}

/**
 * Bind the swipe-to-act gesture to `rowRef`. Listeners attach in an effect keyed on `enabled`; the
 * mutable options are read through a ref so a changing `onTrigger` never re-binds them. Returns the
 * reveal state for the row to render.
 */
export function useSwipeAction(
  rowRef: RefObject<HTMLElement | null>,
  opts: SwipeActionOptions,
): SwipeActionState {
  const [offset, setOffset] = useState(0)
  const [armed, setArmed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const busyRef = useRef(false)

  useEffect(() => {
    if (!opts.enabled) return
    const el = rowRef.current
    if (!el) return

    let startX: number | null = null
    let startY = 0
    let axis: SwipeAxis = 'none'
    let dxNow = 0

    const clear = (): void => {
      startX = null
      axis = 'none'
      dxNow = 0
    }

    // A real horizontal drag must not also open the row: swallow the click the browser synthesizes
    // after the touch sequence. A tap never locks horizontal, so tap-to-open is untouched. The
    // one-shot is torn down shortly after in case no click follows.
    const suppressNextClick = (): void => {
      const swallow = (ev: Event): void => {
        ev.preventDefault()
        ev.stopPropagation()
      }
      el.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => el.removeEventListener('click', swallow, true), 400)
    }

    const fire = (): void => {
      if (busyRef.current) return
      busyRef.current = true
      setConfirming(true)
      void Promise.resolve(optsRef.current.onTrigger()).finally(() => {
        busyRef.current = false
        setConfirming(false)
      })
    }

    const onStart = (e: TouchEvent): void => {
      if (busyRef.current) {
        startX = null
        return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      axis = 'none'
      dxNow = 0
    }

    const onMove = (e: TouchEvent): void => {
      if (startX === null || busyRef.current) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      dxNow = dx
      if (axis === 'none') {
        axis = resolveSwipeAxis(dx, dy)
        if (axis === 'none') return // still within the axis-lock — could yet be a tap
      }
      if (axis === 'vertical') return // fall through to scroll / drawer dismiss, untouched
      // Horizontal: we own the gesture. Only a leftward drag reveals the action.
      e.preventDefault()
      const revealed = Math.max(-SWIPE_MAX_REVEAL, Math.min(0, dx))
      setOffset(revealed)
      setArmed(dx <= -SWIPE_TRIGGER)
    }

    const onEnd = (): void => {
      if (startX === null) {
        clear()
        return
      }
      const trigger = axis === 'horizontal' && dxNow <= -SWIPE_TRIGGER
      // Swallow the synthesized tap-open ONLY when the swipe actually fires. Axis commits at just
      // SWIPE_AXIS_LOCK (10px), so a near-tap with a little horizontal drift is "horizontal" without
      // ever reaching the trigger — suppressing its click would leave it neither acting nor opening
      // (a dead gesture). A sub-trigger horizontal drift snaps back and still opens on tap.
      if (trigger) suppressNextClick()
      clear()
      setOffset(0)
      setArmed(false)
      if (trigger) fire()
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [opts.enabled, rowRef])

  return { offset, armed, confirming }
}
