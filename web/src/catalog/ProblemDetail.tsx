// The read-only detail pager: a full board render + metadata for one problem,
// prev/next across the current filtered list, favorite toggle, and Light up over
// Web Bluetooth. Records the view into recents. Mirrors iOS CatalogProblemPager.
//
// The shown problem is tracked by id (not a live array index), so if it leaves
// the filtered set while open (e.g. unfavorited under a favorites-only filter),
// the pager stays on it rather than jumping — prev/next just disable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Heart, Lightbulb, Repeat, Star } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { SignInDialog } from '../auth/SignInDialog'
import { addAttemptTries } from '../logbook/ascents'
import { TryStepper } from '../logbook/TryStepper'
import { bleClient, connectBoard, isConnected, setBleError, useBle } from '../ble/useBle'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogBoardDef } from '../board/boards'
import { getActiveHoldSetsRaw, getFlipped } from '../board/boardStore'
import { holdSetContext } from '../board/holdSetMembership'
import type { CatalogHold, CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { useFavorites } from './favoritesStore'
import type { HoldAssignment } from '../types'
import { LogAscentSheet, type LogTarget } from '../logbook/LogAscentSheet'
import { Button } from '@/components/ui/button'

interface ProblemDetailProps {
  problems: CatalogProblem[]
  initialIndex: number
  board: CatalogBoardDef
  angle: number
  favoriteIds: Set<string>
  onClose: () => void
}

function toHoldAssignments(holds: CatalogHold[]): HoldAssignment[] {
  return holds.map((h) => ({ col: h.c, row: h.r, type: h.t }))
}

export function ProblemDetail({
  problems,
  initialIndex,
  board,
  angle,
  favoriteIds,
  onClose,
}: ProblemDetailProps) {
  const [current, setCurrent] = useState<CatalogProblem | undefined>(() => problems[initialIndex])
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const { state } = useBle()
  const { toggleFavorite } = useFavorites()
  const [lit, setLit] = useState(false)
  const [lightError, setLightError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connecting' | 'sending' | null>(null)
  const { status } = useAuth()
  const signedIn = status !== 'signedOut'
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  // Inline "Log try" stepper state: session-local pending tries for the shown problem,
  // written (merged) to the unsent-attempt row only when leaving the problem (iOS parity).
  const [pendingProblemId, setPendingProblemId] = useState<string | null>(null)
  const [pendingTries, setPendingTries] = useState(0)

  const currentId = current?.source_catalog_id

  // Record the view (move-to-front recents) whenever the shown problem changes.
  useEffect(() => {
    if (currentId) recordRecent(board.layoutId, angle, currentId)
  }, [currentId, board.layoutId, angle])

  // A newly-shown problem isn't lit yet; disconnecting clears the lit state.
  useEffect(() => setLit(false), [currentId])
  useEffect(() => {
    if (state !== 'connected') setLit(false)
  }, [state])

  // If there's nothing to show (the pager was opened on an empty list), close.
  useEffect(() => {
    if (!current) onClose()
  }, [current, onClose])

  // ── Deferred flush of the inline "Log try" stepper (iOS parity) ──────────────
  // Write/merge the unsent-attempt row only when the user leaves the problem: paging
  // to another problem, or closing the pager (unmount). Same-day tries accumulate.
  const flush = useCallback(
    (problemId: string | null, tries: number) => {
      if (!problemId || tries <= 0) return
      const p = problems.find((x) => x.source_catalog_id === problemId)
      if (!p) return
      void addAttemptTries({
        sourceCatalogId: p.source_catalog_id,
        problemName: p.name,
        problemGrade: p.grade,
        boardLayoutId: board.layoutId,
        date: new Date().toISOString(),
        addTries: tries,
      })
    },
    [problems, board.layoutId],
  )

  // Mirror pending state into refs so the navigation/unmount flushes read fresh values
  // without re-subscribing.
  const pendingRef = useRef<{ problemId: string | null; tries: number }>({
    problemId: null,
    tries: 0,
  })
  useEffect(() => {
    pendingRef.current = { problemId: pendingProblemId, tries: pendingTries }
  }, [pendingProblemId, pendingTries])
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Flush the previous problem's pending tries when the shown problem changes (paging).
  const shownIdRef = useRef(currentId)
  useEffect(() => {
    if (shownIdRef.current !== currentId) {
      const prev = pendingRef.current
      if (prev.problemId && prev.problemId !== currentId) {
        flush(prev.problemId, prev.tries)
        setPendingProblemId(null)
        setPendingTries(0)
      }
      shownIdRef.current = currentId
    }
  }, [currentId, flush])

  // Flush on close/unmount (drawer dismissed → ProblemDetail unmounts).
  useEffect(
    () => () => {
      const { problemId, tries } = pendingRef.current
      flushRef.current(problemId, tries)
    },
    [],
  )

  if (!current) return null

  const pos = problems.findIndex((p) => p.source_catalog_id === current.source_catalog_id)
  const { visible } = holdSetContext(board.membershipResource, getActiveHoldSetsRaw(board.layoutId))
  const isFav = favoriteIds.has(current.source_catalog_id)

  async function lightUp() {
    if (busy) return
    setLightError(null)
    setBleError(null)
    if (!isConnected()) {
      setBusy('connecting')
      await connectBoard()
      if (!isConnected()) {
        setBusy(null)
        return // cancelled or failed
      }
    }
    setBusy('sending')
    try {
      await bleClient.send(toHoldAssignments(current!.holds), {
        rows: board.geometry.numRows,
        flipped: getFlipped(board.layoutId),
        showBeta: true,
      })
      setLit(true)
    } catch (err) {
      setLightError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const lightLabel = busy === 'connecting'
    ? 'Connecting…'
    : busy === 'sending'
      ? 'Sending…'
      : state === 'connected'
        ? lit
          ? 'Lit — send again'
          : 'Light up'
        : 'Connect & light up'

  const atFirst = pos <= 0
  const atLast = pos < 0 || pos >= problems.length - 1

  // The count shown in the stepper — session-local pending tries for THIS problem only
  // (starts at 0 each time a problem is shown; not hydrated from existing logs, per iOS).
  const currentTries = pendingProblemId === current.source_catalog_id ? pendingTries : 0

  function addTry() {
    if (!signedIn) {
      setSignInOpen(true)
      return
    }
    if (pendingProblemId !== current!.source_catalog_id) {
      setPendingProblemId(current!.source_catalog_id)
      setPendingTries(1)
    } else {
      setPendingTries((t) => t + 1)
    }
  }

  function removeTry() {
    if (currentTries <= 0) return
    setPendingTries((t) => {
      const next = t - 1
      if (next === 0) setPendingProblemId(null)
      return next
    })
  }

  // "Log ascent" opens the full sheet as a SEND, pre-seeding tries from the stepper.
  function logAscent() {
    if (!signedIn) {
      setSignInOpen(true)
      return
    }
    setLogTarget({
      kind: 'create',
      sourceCatalogId: current!.source_catalog_id,
      problemName: current!.name,
      problemGrade: current!.grade,
      boardLayoutId: board.layoutId,
      sent: true,
      tries: Math.max(currentTries, 1),
    })
    setLogOpen(true)
  }

  // Side-swipe the board to page prev/next (vertical drags fall through to the
  // drawer's swipe-to-dismiss).
  function onSwipeStart(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  function onSwipeEnd(e: React.PointerEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return // not a clear horizontal swipe
    if (dx < 0 && !atLast) setCurrent(problems[pos + 1])
    else if (dx > 0 && !atFirst) setCurrent(problems[pos - 1])
  }

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <h1 className="min-w-0 break-words text-sm font-bold uppercase leading-tight tracking-tight">
              {current.name}
            </h1>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
              {current.grade}
            </span>
            {current.is_benchmark && (
              <BadgeCheck className="size-3.5 shrink-0 text-benchmark" aria-label="Benchmark" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="break-words">
              {current.setter ? `by ${current.setter}` : `${current.holds.length} holds`}
            </span>
            {current.stars > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5" /> {current.stars}
              </span>
            )}
            {current.repeats > 0 && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3.5" /> {current.repeats}
              </span>
            )}
            {current.method && <span className="text-foreground/70">{current.method}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={isFav ? 'Unfavorite' : 'Favorite'}
            aria-pressed={isFav}
            onClick={() => toggleFavorite(current.source_catalog_id)}
          >
            <Heart className={isFav ? 'size-5 fill-favorite text-favorite' : 'size-5'} />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Previous problem" disabled={atFirst} onClick={() => setCurrent(problems[pos - 1])}>
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next problem" disabled={atLast} onClick={() => setCurrent(problems[pos + 1])}>
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[17rem] touch-pan-y select-none"
        onPointerDown={onSwipeStart}
        onPointerUp={onSwipeEnd}
      >
        <CatalogBoard board={board} holds={current.holds} visibleHoldSetIds={visible} showBeta />
      </div>

      <div className="space-y-1">
        <Button size="lg" className="w-full" onClick={lightUp} disabled={busy !== null}>
          <Lightbulb className={lit ? 'size-5 fill-current' : 'size-5'} />
          {lightLabel}
        </Button>
        {lightError && <p className="text-center text-sm text-destructive">{lightError}</p>}
      </div>

      <div className="flex items-center gap-3">
        <TryStepper count={currentTries} onRemove={removeTry} onAdd={addTry} />
        <Button size="lg" className="flex-1" onClick={logAscent}>
          <CheckCircle2 className="size-5" />
          Log ascent
        </Button>
      </div>

      <LogAscentSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        target={logTarget}
        onSaved={() => {
          // The send consumed the pending tries — clear them so they aren't ALSO
          // flushed as a separate unsent-attempt row.
          setPendingProblemId(null)
          setPendingTries(0)
        }}
      />
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  )
}
