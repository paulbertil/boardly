// A user's sends on their profile (R19) — the same projection as the feed, filtered to one
// actor via get_user_sends (single-actor wrapper over the revoked _sends_for_actors core). The
// server applies the R6/R12 gate: a blocked pair or an effectively-private non-follower gets an
// empty set, which renders here as the gated empty state (indistinguishable from "no sends yet",
// by design — a private account must not leak whether it has activity).
//
// Keyset-paged on (first_sent_at, id): "Load more" passes the last row's cursor. Read-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import { boardByLayoutId } from '../board/boards'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { relativeTime } from './relativeTime'
import { fetchSendsPage, SENDS_PAGE } from './sendsPage'
import type { SendItem } from './socialTypes'

type LoadState = 'loading' | 'loaded' | 'error'

export function UserSendsList({ userId }: { userId: string }) {
  const [sends, setSends] = useState<SendItem[]>([])
  const [status, setStatus] = useState<LoadState>('loading')
  const [done, setDone] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Guards against a stale response overwriting a newer userId's list.
  const reqId = useRef(0)

  const fetchPage = useCallback(
    (cursor: SendItem | null) => fetchSendsPage('get_user_sends', cursor, { p_target: userId }),
    [userId],
  )

  useEffect(() => {
    const id = ++reqId.current
    setSends([])
    setStatus('loading')
    setDone(false)
    void fetchPage(null).then((rows) => {
      if (id !== reqId.current) return
      if (rows === null) {
        setStatus('error')
        return
      }
      setSends(rows)
      setStatus('loaded')
      setDone(rows.length < SENDS_PAGE)
    })
  }, [fetchPage])

  async function loadMore() {
    const cursor = sends[sends.length - 1]
    if (!cursor) return
    const id = reqId.current
    setLoadingMore(true)
    const rows = await fetchPage(cursor)
    setLoadingMore(false)
    if (id !== reqId.current || rows === null) return
    setSends((prev) => [...prev, ...rows])
    setDone(rows.length < SENDS_PAGE)
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return <p className="py-8 text-center text-sm text-muted-foreground">Couldn't load sends.</p>
  }

  if (sends.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No sends to show.</p>
  }

  return (
    <div className="flex flex-col">
      <p className="px-1 pb-2 text-sm font-medium text-muted-foreground">
        {sends.length}
        {done ? '' : '+'} send{sends.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {sends.map((s) => {
          const board = boardByLayoutId(s.boardLayoutId)
          return (
            <li key={s.ascentId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{s.problemName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {s.problemGrade}
                  {board ? ` · ${board.name}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(s.climbedAt)}</span>
            </li>
          )
        })}
      </ul>
      {!done && (
        <Button variant="ghost" className="mt-2 self-center" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
