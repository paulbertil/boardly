// The session playlist queue drawer + its entry point (U4). A bottom Drawer opened from a "Queue"
// button whose badge shows the active-item count. Default view: an "Up next" list of the active
// climbs (each a recents-style preview that opens the problem on tap) and a "Done" group below.
// Tapping a row opens the shared ?problem detail pager over the queue's order, so next/prev in the
// detail view follows the queue. An Edit toggle flips the active list into a dnd-kit reorder list
// (drag handle + remove). The store (U2/queueStore) owns the optimistic writes and rolls back on
// failure; this surfaces that rollback as a sonner error toast (KTD5) and announces reorder moves
// via an aria-live region. Lighting stays the manual lightbulb; opening the queue never lights the
// board.
//
// Rendered only when a session is active on this board: SessionBar mounts it on the board catalog
// (a same-route ?problem update); SessionPill mounts it off-catalog (navigate to the board first).

import { useEffect, useMemo, useState } from 'react'
import { ListVideo } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { getCatalogProblemsByIds, type CatalogProblem } from '../catalog/catalogSync'
import { useMemberSenders } from '../catalog/useMemberSenders'
import { removeItem, reorder, useSessionQueue } from './queueStore'
import { QUEUE_WRITE_ERROR, queueToastError } from './queueToast'
import type { QueueItem } from './queueTypes'
import { useSessions } from './sessionsStore'
import { QueueItemRow } from './QueueItemRow'
import { useShowPreviews } from '../catalog/previewsStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { Sortable, SortableContent } from '@/components/ui/sortable'
import { cn } from '@/lib/utils'

export interface QueueDrawerProps {
  board: CatalogBoardDef
  /**
   * Close-then-open the problem via the shared ?problem navigation (KTD9), paging over `stack` —
   * the queue's active items in order — so next/prev in the detail view follow the queue. Surface-
   * specific: SessionBar hands this to the CatalogScreen pager (which snapshots `stack` as the
   * paging domain); SessionPill navigates to the board first (off-catalog) and pages the catalog
   * there. QueueDrawer closes itself before calling this.
   */
  onOpenProblem: (sourceCatalogId: string, stack: CatalogProblem[]) => void
  /** Styles the entry-point trigger to match the host chrome (catalog bar vs. pill panel). */
  triggerClassName?: string
  /**
   * Render the trigger as an icon-only button (the ListVideo glyph + a corner count badge) so it
   * sits as a peer of the session bar's other ghost icon buttons. Off (default) keeps the labeled
   * "Queue" chip used in the pill panel's action list.
   */
  compact?: boolean
}

export function QueueDrawer({ board, onOpenProblem, triggerClassName, compact }: QueueDrawerProps) {
  const { activeSession } = useSessions()
  const sessionForBoard =
    activeSession && activeSession.boardLayoutId === board.layoutId ? activeSession : null
  const { status, activeItems, doneItems } = useSessionQueue(sessionForBoard?.id ?? null)
  const memberSenders = useMemberSenders(board)
  const senders = memberSenders?.senders

  const [open, setOpen] = useState(false)
  // Edit mode flips the active list from recents-style preview rows into compact reorder rows
  // (drag handle + remove). Reorder and removal live here so the default view stays a clean
  // tap-to-open playlist. Reset whenever the drawer closes.
  const [editing, setEditing] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [problemsById, setProblemsById] = useState<Map<string, CatalogProblem>>(new Map())
  // The queue's preview rows follow the same "climb previews" toggle as the catalog/recents list.
  const showThumbnails = useShowPreviews('catalog')

  // Resolve queued ids → catalog titles/grades (board-agnostic, offline IndexedDB lookup). Keyed
  // on the joined id list so it refetches only when the set of queued problems actually changes.
  const idsKey = useMemo(
    () => [...activeItems, ...doneItems].map((i) => i.sourceCatalogId).join(','),
    [activeItems, doneItems],
  )
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setProblemsById(new Map())
      return
    }
    let cancelled = false
    void getCatalogProblemsByIds(ids).then((m) => {
      if (!cancelled) setProblemsById(m)
    })
    return () => {
      cancelled = true
    }
  }, [idsKey])

  const nameOf = (id: string) => problemsById.get(id)?.name ?? 'this climb'

  if (!sessionForBoard) return null

  const count = activeItems.length

  // The ordered paging domain the detail pager follows when a queue row (or Play) opens a problem:
  // the active items resolved to catalog problems, in queue order. Ids whose lookup is still pending
  // are skipped (they page in once resolved).
  const queueStack = activeItems
    .map((i) => problemsById.get(i.sourceCatalogId))
    .filter((p): p is CatalogProblem => Boolean(p))

  const openRow = (item: QueueItem) => {
    setOpen(false) // one drawer at a time (KTD9): close before the problem drawer opens
    onOpenProblem(item.sourceCatalogId, queueStack)
  }

  const handleRemove = (item: QueueItem): Promise<void> =>
    // No success toast: the row leaves the list and the count drops, so the removal is already
    // visible — only a failed write (rolled back by the store) needs surfacing. Returned (not
    // fire-and-forget) so a swipe-to-remove holds the row's busy guard for the whole round-trip.
    removeItem(item.id).catch(() => {
      queueToastError(QUEUE_WRITE_ERROR)
    })

  // Reorder submit: optimistic RPC in the store, rollback-to-server-order on failure surfaced as
  // the same error toast as every other write.
  const submitReorder = (nextIds: string[], name: string, position: number) => {
    void reorder(nextIds)
      .then(() => setLiveMessage(`${name} moved to position ${position}`))
      .catch(() => queueToastError(QUEUE_WRITE_ERROR))
  }

  // The dnd-kit Sortable hands back the fully reordered active list on drop. Persist the new id
  // order and announce the moved climb's new position (the first slot whose occupant changed).
  const handleSortReorder = (next: QueueItem[]) => {
    const before = activeItems.map((i) => i.id)
    const after = next.map((i) => i.id)
    const movedIdx = after.findIndex((id, i) => id !== before[i])
    if (movedIdx < 0) return // no change
    submitReorder(after, nameOf(next[movedIdx].sourceCatalogId), movedIdx + 1)
  }

  // A non-editing active row (recents-style, tap-to-open). Shared by the Next up + Up next groups.
  const activeRow = (item: QueueItem) => (
    <QueueItemRow
      key={item.id}
      item={item}
      board={board}
      problem={problemsById.get(item.sourceCatalogId)}
      senders={senders?.get(item.sourceCatalogId)}
      variant="active"
      showThumbnail={showThumbnails}
      onOpen={() => openRow(item)}
      onRemove={() => handleRemove(item)}
    />
  )

  const isEmpty = activeItems.length === 0 && doneItems.length === 0

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setEditing(false) // leave Edit mode behind when the drawer closes
      }}
      showSwipeHandle
    >
      {compact ? (
        // Session-bar chrome: an icon-only button matching the neighbouring ghost icon buttons,
        // with the active count as a small neutral corner badge (not the loud blue chip).
        <DrawerTrigger
          aria-label={count > 0 ? `Queue, ${count} active` : 'Queue'}
          className={cn(
            'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors',
            // Highlighted blue only when the queue has something; otherwise a plain white icon
            // button matching its ghost neighbours.
            count > 0 ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-accent hover:text-accent-foreground',
            triggerClassName,
          )}
        >
          <ListVideo className={cn('size-4 shrink-0', count > 0 && 'text-primary')} />
          {count > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.625rem] leading-none tabular-nums">
              {count}
            </Badge>
          )}
        </DrawerTrigger>
      ) : (
        <DrawerTrigger
          aria-label={count > 0 ? `Queue, ${count} active` : 'Queue'}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-border bg-primary/10 px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-primary/15',
            triggerClassName,
          )}
        >
          <ListVideo className="size-4 shrink-0 text-primary" />
          <span>Queue</span>
          {count > 0 && (
            <Badge className="ml-0.5 min-w-5 justify-center px-1.5 tabular-nums">{count}</Badge>
          )}
        </DrawerTrigger>
      )}
      <DrawerContent>
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>Queue</DrawerTitle>
          {activeItems.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit'}
            </Button>
          )}
        </DrawerHeader>
        {/* Announces reorder position changes (including a co-member's refetched reorder). */}
        <div aria-live="polite" className="sr-only" data-testid="queue-live">
          {liveMessage}
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 pt-1 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {status === 'loading' ? (
            <div className="space-y-2 py-2" data-testid="queue-loading">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : isEmpty ? (
            <p className="px-1 py-8 text-center text-sm text-balance text-muted-foreground">
              No climbs queued yet — add one from a problem, or swipe a catalog row left.
            </p>
          ) : (
            <>
              {activeItems.length > 0 &&
                (editing ? (
                  // Edit mode: dnd-kit Sortable owns the reorder. Each active row is a SortableItem
                  // (see QueueItemRow); the drop hands back the reordered list to persist.
                  <Sortable
                    value={activeItems}
                    onValueChange={handleSortReorder}
                    getItemValue={(item) => item.id}
                    orientation="vertical"
                  >
                    <SortableContent asChild>
                      <ul className="mb-1">
                        {activeItems.map((item) => (
                          <QueueItemRow
                            key={item.id}
                            item={item}
                            board={board}
                            problem={problemsById.get(item.sourceCatalogId)}
                            senders={senders?.get(item.sourceCatalogId)}
                            variant="active"
                            editing
                            showThumbnail={showThumbnails}
                            onOpen={() => openRow(item)}
                            onRemove={() => handleRemove(item)}
                          />
                        ))}
                      </ul>
                    </SortableContent>
                  </Sortable>
                ) : (
                  <>
                    <h3 className="px-1 pt-1 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Up next
                    </h3>
                    <ul className="mb-1">{activeItems.map(activeRow)}</ul>
                  </>
                ))}
              {doneItems.length > 0 && (
                <section>
                  <h3 className="px-1 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Done
                  </h3>
                  <ul>
                    {doneItems.map((item) => (
                      <QueueItemRow
                        key={item.id}
                        item={item}
                        board={board}
                        problem={problemsById.get(item.sourceCatalogId)}
                        senders={senders?.get(item.sourceCatalogId)}
                        variant="done"
                        editing={editing}
                        showThumbnail={showThumbnails}
                        onOpen={() => openRow(item)}
                        onRemove={() => handleRemove(item)}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
