// Cross-device resume: the fetch/gating/adopt shell shared by MyBoards (all boards) and
// SessionBar (this board only). Owns the on-demand list of live sessions the signed-in user
// is a member of, the visibilitychange/online self-heal, the dead-on-arrival branch, and the
// post-resume navigation via the shared navigateToSessionBoard helper.
//
// Design contract (mirrors R1 of docs/plans/2026-07-20-001-feat-web-resume-active-session-plan.md):
// resume is EXPLICIT — this hook never auto-adopts. It only surfaces the candidates; the caller
// renders them, the user taps, `onResume` runs the adopt-and-navigate.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth/AuthProvider'
import { listMyLiveSessions, resumeSession, useSessions } from './sessionsStore'
import { navigateToSessionBoard } from './sessionNav'
import type { Session } from './sessionsTypes'

export interface UseResumableSessionsOptions {
  /** When set, filter the returned list to sessions on THIS board. Omit for all boards. */
  boardLayoutId?: number
}

export interface UseResumableSessions {
  /** Live sessions the caller can resume, filtered by `boardLayoutId` when set. */
  resumable: Session[]
  /** Id of the session currently being resumed (row should render as pending), or null. */
  resumingId: string | null
  /** True once a resume tap resolved to `{ live: false }` (dead-on-arrival). Cleared when
   *  a subsequent list fetch repopulates — otherwise a later refetch could resurface the
   *  notice for a session the user never tapped. */
  endedNotice: boolean
  /** Adopt a listed session. On `{ live }` → navigate to its catalog (also activates the
   *  board); on dead → drop the row and set `endedNotice`. */
  onResume: (session: Session) => Promise<void>
}

export function useResumableSessions(opts: UseResumableSessionsOptions = {}): UseResumableSessions {
  const { boardLayoutId } = opts
  const { activeSession } = useSessions()
  const { status } = useAuth()
  const signedIn = status !== 'signedOut'
  const navigate = useNavigate()

  const [resumable, setResumable] = useState<Session[]>([])
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [endedNotice, setEndedNotice] = useState(false)
  // Mirror `resumable` so `load` can skip a no-op empty→empty dispatch entirely (not just bail on
  // re-render) — an idle fetch that finds nothing must not touch state at all.
  const resumableRef = useRef<Session[]>([])
  const setList = useCallback((next: Session[]) => {
    resumableRef.current = next
    setResumable(next)
    // A repopulated list supersedes a stale "ended" notice.
    if (next.length > 0) setEndedNotice(false)
  }, [])

  useEffect(() => {
    if (!signedIn || activeSession) {
      if (resumableRef.current.length > 0) setList([])
      return
    }
    let alive = true
    const load = async () => {
      const all = await listMyLiveSessions()
      if (!alive) return
      const filtered =
        boardLayoutId === undefined ? all : all.filter((s) => s.boardLayoutId === boardLayoutId)
      if (filtered.length === 0 && resumableRef.current.length === 0) return // idle: no state change
      setList(filtered)
    }
    void load()
    const refetch = () => void load()
    document.addEventListener('visibilitychange', refetch)
    window.addEventListener('online', refetch)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', refetch)
      window.removeEventListener('online', refetch)
    }
  }, [signedIn, activeSession, boardLayoutId, setList])

  const onResume = useCallback(
    async (s: Session) => {
      setEndedNotice(false)
      setResumingId(s.id)
      const { live } = await resumeSession(s)
      if (live) {
        navigateToSessionBoard(navigate, s)
      } else {
        setList(resumableRef.current.filter((x) => x.id !== s.id))
        setEndedNotice(true)
        setResumingId(null)
      }
    },
    [navigate, setList],
  )

  return { resumable, resumingId, endedNotice, onResume }
}
