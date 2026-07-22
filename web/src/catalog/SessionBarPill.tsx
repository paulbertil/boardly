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

// v2: coordinates went viewport-space → wrapper-relative (see clampPillPos). Deliberately
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
function clampPillPos(x: number, y: number, el: HTMLElement | null): PillPos {
  const wrapper = (el?.offsetParent as HTMLElement | null)?.getBoundingClientRect()
  const shell = document.querySelector('.app-shell')?.getBoundingClientRect()
  const w = el?.offsetWidth ?? 200
  const h = el?.offsetHeight ?? 32
  const ox = wrapper?.left ?? 0
  const oy = wrapper?.top ?? 0
  const minX = (shell?.left ?? 0) - ox + PILL_MARGIN
  const maxX = (shell?.right ?? window.innerWidth) - ox - w - PILL_MARGIN
  const minY = PILL_MARGIN - oy
  const maxY = window.innerHeight - oy - h - PILL_MARGIN
  return {
    x: Math.min(Math.max(x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, minY), Math.max(minY, maxY)),
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
  const posRef = useRef<PillPos | null>(null)
  posRef.current = pos

  // Re-clamp on mount and on every viewport change (rotation, resize, keyboard) so a
  // stored or parked position can never strand the pill off-screen while mounted.
  useEffect(() => {
    const reclamp = () => setPos((p) => (p ? clampPillPos(p.x, p.y, pillRef.current) : p))
    reclamp()
    window.addEventListener('resize', reclamp)
    return () => window.removeEventListener('resize', reclamp)
  }, [pillRef])

  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; active: boolean } | null>(
    null,
  )
  const suppressClick = useRef(false)

  // If the pill unmounts mid-drag (session ended remotely, route change), endDrag never
  // runs — flush the last position so the drag isn't silently discarded.
  useEffect(
    () => () => {
      if (drag.current?.active && posRef.current) persistPos(posRef.current)
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
    // the same space clampPillPos works in.
    drag.current = { startX: e.clientX, startY: e.clientY, originX: el.offsetLeft, originY: el.offsetTop, active: false }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // No button held: the press ended off-pill before we captured (capture is only
    // taken past the threshold), so this is a dead gesture surfacing on hover — drop
    // it instead of letting the pill chase a button-less cursor.
    if (e.buttons === 0) {
      drag.current = null
      return
    }
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      d.active = true
      suppressClick.current = true
      pillRef.current?.setPointerCapture(e.pointerId)
    }
    setPos(clampPillPos(d.originX + dx, d.originY + dy, pillRef.current))
  }
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return
    if (drag.current?.active && posRef.current) persistPos(posRef.current)
    drag.current = null
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
