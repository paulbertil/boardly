// The collapsed form of the sticky session bar: once the catalog list scrolls, the
// full ActiveBar folds away and this floating rounded pill takes over, docked
// centered on the header's bottom border. Its zero-height wrapper means the header
// gives back the bar's entire row — the pill overlays the top sliver of the list
// instead (dimmed by its own backdrop).
//
// Contents: the lit problem ("on the wall") + Queue/Share actions. Tapping the lit
// problem opens its detail view (mirrors LitProblemRow); the chevron re-expands the
// full bar in place (see useScrollCollapse) — when nothing is lit the text area
// expands directly and shows session name + member count instead.
//
// The pill is draggable: press and move >6px and it follows the pointer anywhere
// inside the app shell; the spot persists across reloads. A movement threshold
// separates a tap (open/expand/button press) from a drag, and the click that
// follows a real drag is swallowed so dropping the pill never triggers an action.

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { ChevronDown, Lightbulb, Share2, Users } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import type { CatalogProblem } from './catalogSync'
import { QueueDrawer } from '../sessions/QueueDrawer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// v2: coordinates went viewport-space → wrapper-relative (see measureBounds/clampTo). Deliberately
// NOT swept by the session sign-out clear (sessionsStore.clearAllSessionState) — it's
// per-device screen ergonomics (x/y pixels), not session content.
const PILL_POS_KEY = 'boardhang.sessionPillPos.v2'
const DRAG_THRESHOLD = 6
const PILL_MARGIN = 4

type PillPos = { x: number; y: number }

// Offsets are relative to the pill's zero-height wrapper (its offsetParent), NOT the
// viewport. The pill lives inside the frosted header, whose backdrop-filter makes the
// header the containing block for positioned descendants — `position: fixed` with
// viewport coordinates would render offset by the header's own origin (visibly wrong
// on desktop, where the 480px shell is centered). Wrapper-relative `absolute` sidesteps
// the containing-block trap, and the wrapper rides the sticky header, so the pill still
// holds its on-screen spot while the list scrolls.

type PillBounds = { minX: number; maxX: number; minY: number; maxY: number }

// Measure drag bounds ONCE per gesture (and on mount/resize) — never inside the
// pointermove stream. Per-move querySelector + getBoundingClientRect forces a
// synchronous reflow on every input event, which is exactly what made dragging janky.
function measureBounds(el: HTMLElement | null): PillBounds {
  const wrapper = (el?.offsetParent as HTMLElement | null)?.getBoundingClientRect()
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect()
  const w = el?.offsetWidth ?? 200
  const h = el?.offsetHeight ?? 32
  const ox = wrapper?.left ?? 0
  const oy = wrapper?.top ?? 0
  return {
    minX: (shell?.left ?? 0) - ox + PILL_MARGIN,
    maxX: (shell?.right ?? window.innerWidth) - ox - w - PILL_MARGIN,
    minY: PILL_MARGIN - oy,
    maxY: window.innerHeight - oy - h - PILL_MARGIN,
  }
}

function clampTo(b: PillBounds, x: number, y: number): PillPos {
  return {
    x: Math.min(Math.max(x, b.minX), Math.max(b.minX, b.maxX)),
    y: Math.min(Math.max(y, b.minY), Math.max(b.minY, b.maxY)),
  }
}

function persistPos(p: PillPos) {
  try {
    localStorage.setItem(PILL_POS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

function useDraggablePill(pillRef: RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState<PillPos | null>(() => {
    try {
      const raw = localStorage.getItem(PILL_POS_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as PillPos
      return typeof parsed?.x === 'number' && typeof parsed?.y === 'number' ? parsed : null
    } catch {
      return null
    }
  })
  // The live drag never touches React state: pointermove moves the pill via a
  // compositor-only transform written straight from the handler — browsers align
  // pointermove delivery to the frame clock, so a rAF hop here would only add a frame
  // of finger-to-pill lag. Position/bounds are measured once at drag start; the real
  // left/top (plus localStorage) commit only on release, clamped against a FRESH
  // measurement (the viewport or the pill's own width may have changed mid-gesture).
  // Anything per-move — setState, layout reads, style-prop churn — is what made the
  // drag stutter.
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    dx: number
    dy: number
    bounds: PillBounds | null
    active: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  // Re-clamp on mount, on viewport changes (rotation, resize, keyboard), and on the
  // pill's own size changes (a realtime lit-problem swap can widen a parked pill past
  // the shell edge, where overflow-x-hidden would clip its buttons untappably). Never
  // mid-drag: the gesture's base/bounds are frozen by design — shifting left/top under
  // the live transform would make the pill jump — and endDrag reconciles on release.
  useEffect(() => {
    const reclamp = () => {
      if (drag.current?.active) return
      setPos((p) => (p ? clampTo(measureBounds(pillRef.current), p.x, p.y) : p))
    }
    reclamp()
    window.addEventListener('resize', reclamp)
    const el = pillRef.current
    const ro = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reclamp) : null
    if (el && ro) ro.observe(el)
    return () => {
      window.removeEventListener('resize', reclamp)
      ro?.disconnect()
    }
  }, [pillRef])

  // If the pill unmounts mid-drag (session ended remotely, route change), endDrag never
  // runs — flush the last position so the drag isn't silently discarded.
  useEffect(
    () => () => {
      const d = drag.current
      if (d?.active && d.bounds) persistPos(clampTo(d.bounds, d.originX + d.dx, d.originY + d.dy))
    },
    [],
  )

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return
    // A stale flag from a click-less touch drag (browsers fire no click after a
    // beyond-slop drag) must not swallow this fresh tap.
    suppressClick.current = false
    const el = pillRef.current
    if (!el) return
    // offsetLeft/offsetTop are wrapper-relative for the absolutely-positioned pill —
    // the same space measureBounds works in.
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: el.offsetLeft,
      originY: el.offsetTop,
      dx: 0,
      dy: 0,
      bounds: null,
      active: false,
    }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // The gesture belongs to ONE pointer. Without this gate, a second finger's moves
    // would compute deltas from the first finger's start coords, steal the capture,
    // and — its release then being ignored — leave the gesture styles frozen.
    if (e.pointerId !== d.pointerId) return
    // No button held: the press ended off-pill before we captured (capture is only
    // taken past the threshold), so this is a dead gesture surfacing on hover — drop
    // it instead of letting the pill chase a button-less cursor.
    if (e.buttons === 0) {
      drag.current = null
      return
    }
    d.dx = e.clientX - d.startX
    d.dy = e.clientY - d.startY
    const el = pillRef.current
    if (!d.active) {
      if (Math.hypot(d.dx, d.dy) < DRAG_THRESHOLD) return
      d.active = true
      suppressClick.current = true
      if (el) {
        d.bounds = measureBounds(el) // the gesture's ONE layout read
        el.setPointerCapture(e.pointerId)
        el.style.willChange = 'transform'
        // Re-blurring the backdrop under a moving pill is the most expensive part of
        // the frame (worst on phone GPUs). The bg is already ~opaque, so suspend the
        // blur for the gesture — visually near-identical, much cheaper.
        el.style.backdropFilter = 'none'
        el.style.setProperty('-webkit-backdrop-filter', 'none')
      }
    }
    if (d.bounds && el) {
      const t = clampTo(d.bounds, d.originX + d.dx, d.originY + d.dy)
      el.style.transform = `translate3d(${t.x - d.originX}px, ${t.y - d.originY}px, 0)`
    }
  }
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    // Only the gesture's own pointer may end it (a second finger's up must not).
    if (d && e.pointerId !== d.pointerId) return
    drag.current = null
    const el = pillRef.current
    if (el) {
      el.style.willChange = ''
      el.style.transform = ''
      el.style.backdropFilter = ''
      el.style.removeProperty('-webkit-backdrop-filter')
    }
    if (d?.active && d.bounds) {
      // Clamp against FRESH bounds — the viewport may have rotated or the pill's
      // content widened since the gesture froze its snapshot; committing against the
      // stale one could persist an off-screen or edge-clipped position. One layout
      // read at release is off the hot path. Discrete-event updates flush before the
      // next paint, so clearing the transform and committing left/top in the same
      // handler can't flash the pre-drag spot.
      const bounds = el ? measureBounds(el) : d.bounds
      const final = clampTo(bounds, d.originX + d.dx, d.originY + d.dy)
      setPos(final)
      persistPos(final)
    }
  }
  // Swallow the click that follows a real drag, so dropping the pill doesn't expand it.
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return {
    pos,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture },
  }
}

export interface SessionBarPillProps {
  board: CatalogBoardDef
  sessionName: string
  rosterCount: number
  /** The lit problem id, or null when nothing is on the wall. */
  litProblemId: string | null
  /** Resolved catalog problem for litProblemId (null while unresolved). */
  litProblem: CatalogProblem | null
  onExpand: () => void
  onShare: () => void
  onOpenProblem: (id: string, stack?: CatalogProblem[]) => void
}

export function SessionBarPill({
  board,
  sessionName,
  rosterCount,
  litProblemId,
  litProblem,
  onExpand,
  onShare,
  onOpenProblem,
}: SessionBarPillProps) {
  const pillRef = useRef<HTMLDivElement>(null)
  const { pos, handlers } = useDraggablePill(pillRef)
  return (
    <div className="relative h-0">
      <div
        ref={pillRef}
        {...handlers}
        style={pos ? { left: pos.x, top: pos.y } : undefined}
        className={cn(
          'absolute z-30 flex h-8 items-center gap-1 rounded-full border border-border bg-muted/90 px-1 shadow-sm backdrop-blur-md duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none',
          // touch-action:none so dragging the pill pans the pill, not the list.
          'touch-none select-none',
          // Default dock: centered, 8px below the header's bottom border. Margin-auto
          // centering, not translate — tw-animate's enter transform would fight it.
          !pos && 'inset-x-0 top-4 mx-auto w-fit max-w-full',
        )}
      >
        <button
          type="button"
          onClick={() => (litProblemId ? onOpenProblem(litProblemId) : onExpand())}
          aria-label={litProblemId ? 'Open the problem that’s on the wall' : 'Expand session details'}
          title={litProblemId ? 'Open the problem that’s on the wall' : undefined}
          className="flex h-full min-w-0 items-center gap-1.5 pl-1.5 pr-1 text-left"
        >
          {litProblemId ? (
            <>
              <Lightbulb className="size-4 shrink-0 fill-current text-primary" aria-hidden />
              <span className="min-w-0 truncate text-sm font-medium">
                {litProblem ? litProblem.name : 'a climb'}
              </span>
              {litProblem && (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {litProblem.grade}
                </span>
              )}
            </>
          ) : (
            <>
              <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate text-sm font-medium">{sessionName}</span>
              {rosterCount > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{rosterCount}</span>
              )}
            </>
          )}
        </button>
        <div className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <QueueDrawer board={board} compact onOpenProblem={onOpenProblem} triggerClassName="size-7 rounded-full" />
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-full"
          onClick={onShare}
          aria-label="Share session"
        >
          <Share2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-full"
          onClick={onExpand}
          aria-expanded={false}
          aria-controls="session-bar-full"
          aria-label="Expand session details"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  )
}
