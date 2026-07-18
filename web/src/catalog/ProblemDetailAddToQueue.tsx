// The "Add to queue" action shown in the problem detail (U6 — the primary add entry
// point for the Session Playlist Queue, R2/F1). It is visible ONLY while there is an
// active collaboration session bound to the board being viewed; otherwise it renders
// nothing (an off-board or session-less detail view has no queue to add to). Mirrors the
// add-to-list ghost icon button placement in ProblemDetail's actions region.
//
// Two-part so the queue hook is never driven with a null session (which would clear the
// shared queue store out from under the drawer): the outer gate reads the active session
// and only mounts the inner button — which unconditionally subscribes to that session's
// queue — when a same-board session exists.

import { useState } from 'react'
import { ListVideo } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSessions } from '../sessions/sessionsStore'
import { addProblem, useSessionQueue } from '../sessions/queueStore'

interface ProblemDetailAddToQueueProps {
  /** The catalog problem shown in the detail view. */
  sourceCatalogId: string
  /** The board the detail view is rendering — must match the session's board to add. */
  boardLayoutId: number
}

export function ProblemDetailAddToQueue({
  sourceCatalogId,
  boardLayoutId,
}: ProblemDetailAddToQueueProps) {
  const { activeSession } = useSessions()
  // Gate: only offer the action for an active session on the board being viewed.
  if (!activeSession || activeSession.boardLayoutId !== boardLayoutId) return null
  return (
    <AddToQueueButton
      sessionId={activeSession.id}
      sourceCatalogId={sourceCatalogId}
      boardLayoutId={boardLayoutId}
    />
  )
}

interface AddToQueueButtonProps {
  sessionId: string
  sourceCatalogId: string
  boardLayoutId: number
}

function AddToQueueButton({ sessionId, sourceCatalogId, boardLayoutId }: AddToQueueButtonProps) {
  const { activeItems } = useSessionQueue(sessionId)
  const [busy, setBusy] = useState(false)
  // Already in the active queue → reflect a done/"In queue" state instead of a live add.
  const queued = activeItems.some((i) => i.sourceCatalogId === sourceCatalogId)

  async function onAdd() {
    if (busy) return
    setBusy(true)
    try {
      const result = await addProblem(sourceCatalogId, boardLayoutId)
      if (result === 'already-active') toast('Already in the queue')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t add to the queue.')
    } finally {
      setBusy(false)
    }
  }

  if (queued) {
    // Already queued: keep the same list icon (not a checkmark), tinted blue to read as "in queue".
    return (
      <Button variant="ghost" size="icon" aria-label="In queue" disabled>
        <ListVideo className="size-5 text-primary" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Add to queue"
      disabled={busy}
      onClick={() => void onAdd()}
    >
      <ListVideo className="size-5" />
    </Button>
  )
}
