// The read-only detail pager: a full board render + metadata for one problem,
// prev/next across the current filtered list, favorite toggle, and Light up over
// Web Bluetooth. Records the view into recents. Mirrors iOS CatalogProblemPager.
//
// The shown problem is tracked by id (not a live array index), so if it leaves
// the filtered set while open (e.g. unfavorited under a favorites-only filter),
// the pager stays on it rather than jumping — prev/next just disable.

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, Lightbulb, X } from 'lucide-react'
import { bleClient, connectBoard, isConnected, setBleError, useBle } from '../ble/useBle'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogBoardDef } from '../board/boards'
import { getActiveHoldSetsRaw, getFlipped } from '../board/boardStore'
import { holdSetContext } from '../board/holdSetMembership'
import type { CatalogHold, CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { useFavorites } from './favoritesStore'
import type { HoldAssignment } from '../types'
import { Badge } from '@/components/ui/badge'
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
  const { state } = useBle()
  const { toggleFavorite } = useFavorites()
  const [lit, setLit] = useState(false)
  const [lightError, setLightError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connecting' | 'sending' | null>(null)

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" /> Back
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous problem"
            disabled={pos <= 0}
            onClick={() => setCurrent(problems[pos - 1])}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next problem"
            disabled={pos < 0 || pos >= problems.length - 1}
            onClick={() => setCurrent(problems[pos + 1])}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold uppercase">{current.name}</h1>
          <p className="text-sm text-muted-foreground">
            {current.setter ? `by ${current.setter}` : `${current.holds.length} holds`}
            {current.stars > 0 && ` · ★ ${current.stars}`}
            {current.repeats > 0 && ` · ⟳ ${current.repeats}`}
            {current.method && ` · ${current.method}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {current.is_benchmark && <Badge variant="secondary">Benchmark</Badge>}
          <Badge variant="secondary">{current.grade}</Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isFav ? 'Unfavorite' : 'Favorite'}
            aria-pressed={isFav}
            onClick={() => toggleFavorite(current.source_catalog_id)}
          >
            <Heart className={isFav ? 'size-5 fill-favorite text-favorite' : 'size-5'} />
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-xs">
        <CatalogBoard board={board} holds={current.holds} visibleHoldSetIds={visible} showBeta />
      </div>

      <div className="space-y-1">
        <Button className="w-full" onClick={lightUp} disabled={busy !== null}>
          <Lightbulb className="size-4" />
          {lightLabel}
        </Button>
        {lightError && <p className="text-center text-sm text-destructive">{lightError}</p>}
      </div>
    </div>
  )
}
