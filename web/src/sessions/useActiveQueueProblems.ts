// The active session queue for the problem-detail queue strip — one entry per active item, in
// queue order, each carrying the resolved catalog problem when the id is in the local catalog cache
// and `null` while it isn't (a co-member may have queued a climb this device hasn't synced yet).
// Returning the unresolved entries too — rather than silently dropping them — keeps the strip's
// count in step with the queue badge (activeItems.length) and the drawer (which shows a "this climb"
// fallback row); the strip renders those as a placeholder card. Board-scoped and self-contained (the
// no-prop-drill idiom): reads the sessions + queue stores directly and returns [] when no session
// targets this board. Mirrors the QueueDrawer id→problem resolution (offline IndexedDB lookup),
// keyed on the queued id list.

import { useEffect, useMemo, useState } from 'react'
import type { CatalogBoardDef } from '../board/boards'
import { getCatalogProblemsByIds, type CatalogProblem } from '../catalog/catalogSync'
import { useSessions } from './sessionsStore'
import { useSessionQueue } from './queueStore'

/** One active queue item for the strip: its id, plus the resolved problem or null if not cached. */
export interface QueueStripEntry {
  sourceCatalogId: string
  problem: CatalogProblem | null
}

/** The active queue's entries for `board`, in queue order. Empty when no session targets it. */
export function useActiveQueueProblems(board: CatalogBoardDef): QueueStripEntry[] {
  const { activeSession } = useSessions()
  const sessionForBoard =
    activeSession && activeSession.boardLayoutId === board.layoutId ? activeSession : null
  const { activeItems } = useSessionQueue(sessionForBoard?.id ?? null)

  const [byId, setById] = useState<Map<string, CatalogProblem>>(new Map())
  const idsKey = useMemo(
    () => activeItems.map((i) => i.sourceCatalogId).join(','),
    [activeItems],
  )
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setById(new Map())
      return
    }
    let cancelled = false
    void getCatalogProblemsByIds(ids).then((m) => {
      if (!cancelled) setById(m)
    })
    return () => {
      cancelled = true
    }
  }, [idsKey])

  // One entry per active item, in queue order; problem is null while its id isn't cached locally.
  return useMemo(
    () =>
      activeItems.map((i) => ({
        sourceCatalogId: i.sourceCatalogId,
        problem: byId.get(i.sourceCatalogId) ?? null,
      })),
    [activeItems, byId],
  )
}
