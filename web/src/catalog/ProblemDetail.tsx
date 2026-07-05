// The read-only detail pager: a full board render + metadata for one problem,
// prev/next across the current filtered list, favorite toggle, and Light up over
// Web Bluetooth. Records the view into recents. Mirrors iOS CatalogProblemPager.

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, Lightbulb, X } from 'lucide-react'
import { bleClient, connectBoard, isConnected, setBleError, useBle } from '../ble/useBle'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogBoardDef } from '../board/boards'
import { getActiveHoldSetsRaw, getFlipped } from '../board/boardStore'
import { activeSetIds, membershipFor, visibleSetIds } from '../board/holdSetMembership'
import type { CatalogHold, CatalogProblem } from './catalogSync'
import { recordRecent } from './recentsStore'
import { useFavorites } from './favoritesStore'
import type { HoldAssignment } from '../types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ProblemDetailProps {
  problems: CatalogProblem[]
  index: number
  board: CatalogBoardDef
  angle: number
  favoriteIds: Set<string>
  onIndexChange: (index: number) => void
  onClose: () => void
}

function toHoldAssignments(holds: CatalogHold[]): HoldAssignment[] {
  return holds.map((h) => ({ col: h.c, row: h.r, type: h.t }))
}

export function ProblemDetail({
  problems,
  index,
  board,
  angle,
  favoriteIds,
  onIndexChange,
  onClose,
}: ProblemDetailProps) {
  const problem = problems[index]
  const { state } = useBle()
  const { toggleFavorite } = useFavorites()
  const [lit, setLit] = useState(false)
  const [lightError, setLightError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Record the view (move-to-front recents) whenever the shown problem changes.
  useEffect(() => {
    if (problem) recordRecent(board.layoutId, angle, problem.source_catalog_id)
  }, [problem, board.layoutId, angle])

  // A newly-shown problem isn't lit yet; disconnecting clears the lit state.
  useEffect(() => setLit(false), [problem])
  useEffect(() => {
    if (state !== 'connected') setLit(false)
  }, [state])

  if (!problem) {
    onClose()
    return null
  }

  const membership = membershipFor(board.membershipResource)
  const active = activeSetIds(getActiveHoldSetsRaw(board.layoutId), membership)
  const visible = visibleSetIds(active, membership)
  const isFav = favoriteIds.has(problem.source_catalog_id)

  async function lightUp() {
    setLightError(null)
    setBleError(null)
    if (!isConnected()) {
      setConnecting(true)
      await connectBoard()
      setConnecting(false)
      if (!isConnected()) return // cancelled or failed
    }
    try {
      await bleClient.send(toHoldAssignments(problem.holds), {
        rows: board.geometry.numRows,
        flipped: getFlipped(board.layoutId),
        showBeta: true,
      })
      setLit(true)
    } catch (err) {
      setLightError(err instanceof Error ? err.message : String(err))
    }
  }

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
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next problem"
            disabled={index >= problems.length - 1}
            onClick={() => onIndexChange(index + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold uppercase">{problem.name}</h1>
          <p className="text-sm text-muted-foreground">
            {problem.setter ? `by ${problem.setter}` : `${problem.holds.length} holds`}
            {problem.stars > 0 && ` · ★ ${problem.stars}`}
            {problem.repeats > 0 && ` · ⟳ ${problem.repeats}`}
            {problem.method && ` · ${problem.method}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {problem.is_benchmark && <Badge variant="secondary">Benchmark</Badge>}
          <Badge variant="secondary">{problem.grade}</Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isFav ? 'Unfavorite' : 'Favorite'}
            aria-pressed={isFav}
            onClick={() => toggleFavorite(problem.source_catalog_id)}
          >
            <Heart className={isFav ? 'size-5 fill-favorite text-favorite' : 'size-5'} />
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-xs rounded-lg bg-neutral-100 p-2">
        <CatalogBoard board={board} holds={problem.holds} visibleHoldSetIds={visible} showBeta />
      </div>

      <div className="space-y-1">
        <Button className="w-full" onClick={lightUp} disabled={connecting}>
          <Lightbulb className="size-4" />
          {connecting
            ? 'Connecting…'
            : state === 'connected'
              ? lit
                ? 'Lit — send again'
                : 'Light up'
              : 'Connect & light up'}
        </Button>
        {lightError && <p className="text-center text-sm text-destructive">{lightError}</p>}
      </div>
    </div>
  )
}
