// The catalog "last opened" bar: a slim, session-only strip showing the problem you
// most recently opened for this board+angle. CatalogScreen portals it into the shell's
// bottom slot (see bottomSlot), so it sits as a real layout row directly above the nav.
// Tap the body to reopen the full drawer; the ‹ › arrows scrub prev/next through the
// CURRENT filtered list in place (drawer stays closed, nothing persisted — KTD3); ♡
// favorites and 💡 lights up the holds over BLE inline; × dismisses until the next open.
// Renders nothing until a problem has been opened this session (useLastOpened is null on
// a cold load), and blanks when the board or angle changes (the store is keyed per slab).

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart, Lightbulb, X } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogProblem } from './catalogSync'
import { useFavorites } from './favoritesStore'
import { useLastOpened } from './lastOpenedStore'
import { useShowPreviews } from './previewsStore'
import { useLightUp } from '../ble/useLightUp'
import { Button } from '@/components/ui/button'

interface LastOpenedBarProps {
  board: CatalogBoardDef
  angle: number
  /** The current filtered list — the domain the ‹ › arrows scrub over. */
  displayed: CatalogProblem[]
  /** The full slab — resolves the shown problem even when the filters exclude it (R8). */
  problems: CatalogProblem[]
  /** "col-row" positions from the active holds filter to ring on the thumbnail. */
  highlightHolds?: Set<string>
  /** Open the full drawer on a problem id (records a recent — the write path). */
  onOpen: (id: string) => void
  /** Dismiss the bar for this slab. */
  onDismiss: () => void
}

export function LastOpenedBar({
  board,
  angle,
  displayed,
  problems,
  highlightHolds,
  onOpen,
  onDismiss,
}: LastOpenedBarProps) {
  const lastOpenedId = useLastOpened(board.layoutId, angle)
  // Local scrub pointer layered over the seed. Purely local — never written anywhere.
  const [scrubId, setScrubId] = useState<string | null>(null)
  // A fresh open/close re-seeds the bar and discards any scrub position (R9).
  useEffect(() => setScrubId(null), [lastOpenedId])

  const { favoriteIds, toggleFavorite } = useFavorites()
  const showThumbnail = useShowPreviews()

  const shownId = scrubId ?? lastOpenedId
  // Resolve against the filtered list first, then the full slab so a filtered-out
  // last-opened climb still renders (R8).
  const shown = shownId
    ? (displayed.find((p) => p.source_catalog_id === shownId) ??
      problems.find((p) => p.source_catalog_id === shownId))
    : undefined

  // Hooks must run unconditionally; a null shownId yields an inert action (never triggered).
  const light = useLightUp(board, shownId ?? '')

  if (!shown) return null

  // Scrub targets over the filtered list. When the shown climb is filtered out (pos < 0),
  // › lands on the first entry and ‹ on the last (R8).
  const pos = displayed.findIndex((p) => p.source_catalog_id === shown.source_catalog_id)
  const nextTarget = pos < 0 ? displayed[0] : displayed[pos + 1]
  const prevTarget = pos < 0 ? displayed[displayed.length - 1] : displayed[pos - 1]

  const isFav = favoriteIds.has(shown.source_catalog_id)
  const subtitle = shown.setter ? `by ${shown.setter}` : `${shown.holds.length} holds`

  return (
    <div className="border-t border-border bg-background px-2 py-1.5">
      <div className="flex items-center gap-1">
        {/* Body: thumbnail + identity — tap to reopen the full drawer (R5). */}
        <button
          type="button"
          aria-label={`Open ${shown.name}`}
          onClick={() => onOpen(shown.source_catalog_id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50 active:bg-accent"
        >
          {showThumbnail && (
            <div className="w-11 shrink-0">
              <CatalogBoard board={board} holds={shown.holds} highlightHolds={highlightHolds} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold uppercase tracking-tight">
                {shown.name}
              </span>
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                {shown.grade}
              </span>
            </div>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </button>

        {/* Controls: scrub ‹ ›, favorite, save-to-list, dismiss. */}
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous problem"
            disabled={!prevTarget}
            onClick={() => prevTarget && setScrubId(prevTarget.source_catalog_id)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next problem"
            disabled={!nextTarget}
            onClick={() => nextTarget && setScrubId(nextTarget.source_catalog_id)}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={isFav ? 'Unfavorite' : 'Favorite'}
            aria-pressed={isFav}
            onClick={() => toggleFavorite(shown.source_catalog_id)}
          >
            <Heart className={isFav ? 'size-4 fill-favorite text-favorite' : 'size-4'} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={light.busy ? 'Lighting up…' : light.lit ? 'Lit — send again' : 'Light up'}
            disabled={light.busy !== null}
            onClick={() => void light.lightUp(shown.holds)}
          >
            <Lightbulb className={light.lit ? 'size-4 fill-current' : 'size-4'} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Dismiss"
            onClick={() => {
              setScrubId(null)
              onDismiss()
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
