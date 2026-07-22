// Scroll-collapse signal for the sticky session bar. The bar lives portaled inside the
// sticky header, which sits inside the shell's single scroll container (.app-scroll), so
// the host element can find its scroller via closest() — no AppLayout plumbing needed.
//
// Hysteresis keeps the bar from flickering near the boundary. The gap between the two
// thresholds must exceed the folded bar's height (~72px): the header is in the scroll
// flow, so folding it shrinks scrollHeight and scroll anchoring compensates scrollTop
// by the same delta — a smaller gap would let that compensation cross back under
// EXPAND_AT and oscillate open/closed. The same height-feedback is why short lists
// (range barely past the threshold) never collapse at all: the post-fold clamp would
// land under EXPAND_AT and bounce.
//
// `expand()` is the tap-to-expand override while scrolled: it pins the bar open until
// the next real scroll gesture. Gesture detection is wheel/touchmove — never scrollTop
// deltas (expanding grows the header and anchoring shifts scrollTop, which would
// self-cancel the expansion) — with a grace window plus a small wheel-delta budget so
// macOS trackpad momentum still coasting from the previous scroll can't instantly snap
// a just-opened bar shut.

import { useEffect, useRef, useState, type RefObject } from 'react'

const COLLAPSE_AT = 120
const EXPAND_AT = 16
// Scroll range the fold hands back (bar + lit row + borders), padded.
const FOLDED_HEIGHT_BUDGET = 80
// Ignore gestures this soon after a tap-expand (trackpad momentum tail)...
const MANUAL_GRACE_MS = 600
// ...and after the grace, require this much accumulated wheel travel.
const WHEEL_CLEAR_DELTA = 20

export function useScrollCollapse(
  hostRef: RefObject<HTMLElement | null>,
): { collapsed: boolean; expand: () => void } {
  const [collapsed, setCollapsed] = useState(false)
  const [manual, setManual] = useState(false)
  const manualRef = useRef(false)
  manualRef.current = manual

  useEffect(() => {
    const scroller = hostRef.current?.closest('.app-scroll')
    if (!scroller) return

    let raf = 0
    const measure = () => {
      raf = 0
      // While tap-expanded, ignore position changes entirely: expanding grows the
      // header, scroll anchoring nudges scrollTop to compensate, and treating that
      // nudge as a user scroll would instantly re-collapse the bar. Real gestures
      // are detected separately (wheel/touchmove below).
      if (manualRef.current) return
      const top = scroller.scrollTop
      // Short-list guard: only collapse when there's comfortably more scroll range
      // than the fold gives back (see header comment).
      const range = scroller.scrollHeight - scroller.clientHeight
      setCollapsed((prev) =>
        prev ? top > EXPAND_AT : top > COLLAPSE_AT && range > COLLAPSE_AT + FOLDED_HEIGHT_BUDGET,
      )
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [hostRef])

  // A tap-expanded bar re-collapses on the next real scroll gesture — wheel or touch
  // drag on the scroller — never on programmatic/anchoring scrollTop shifts. The grace
  // window + wheel budget filter out the inertial wheel tail a trackpad keeps emitting
  // after the fingers lift, so the chevron doesn't appear broken mid-coast.
  useEffect(() => {
    if (!manual) return
    const scroller = hostRef.current?.closest('.app-scroll')
    if (!scroller) return
    const openedAt = performance.now()
    let wheelBudget = 0
    const onWheel = (e: Event) => {
      if (performance.now() - openedAt < MANUAL_GRACE_MS) return
      wheelBudget += Math.abs((e as WheelEvent).deltaY)
      if (wheelBudget > WHEEL_CLEAR_DELTA) setManual(false)
    }
    const onTouchMove = () => {
      if (performance.now() - openedAt < MANUAL_GRACE_MS) return
      setManual(false)
    }
    scroller.addEventListener('wheel', onWheel, { passive: true })
    scroller.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('touchmove', onTouchMove)
    }
  }, [manual, hostRef])

  const expand = () => setManual(true)

  return { collapsed: collapsed && !manual, expand }
}
