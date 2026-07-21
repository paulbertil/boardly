// A user's sends on their profile (R19) — the projection is get_user_sends (single-actor
// wrapper over the revoked _sends_for_actors core). The server applies the R6/R12 gate: a
// blocked pair or an effectively-private non-follower gets an empty set, which renders here as
// the gated empty state (indistinguishable from "no sends yet", by design — a private account
// must not leak whether it has activity).
//
// One fetch feeds three sections: the grade pyramid, the latest climbing session, and the full
// keyset-paged list. Rows are the shared logbook `AscentRow` (read-only — no edit pencil, and no
// "sent" check since every row is a send by this user), enriched from the viewer's own synced
// catalog (setter/benchmark). Tapping a resolvable row opens the same `?problem` detail drawer
// the logbook and catalog use — the pager domain is the loaded sends, and the drawer's green
// "sent" check reflects the VIEWER's own logbook (i.e. "you've also done this").

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { boardByLayoutId } from '../board/boards'
import { getCatalogProblemsByIds, type CatalogProblem } from '../catalog/catalogSync'
import { useFavorites } from '../catalog/favoritesStore'
import { useShowPreviews } from '../catalog/previewsStore'
import { ProblemDetail } from '../catalog/ProblemDetail'
import { useProblemDrawer } from '../catalog/useProblemDrawer'
import { AscentRow } from '../logbook/AscentRow'
import { useEnsureAscentsLoaded, type Ascent } from '../logbook/ascents'
import { GradePyramid } from '../logbook/GradePyramid'
import type { PyramidInput } from '../logbook/sessions'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchSendsPage, SENDS_PAGE } from './sendsPage'
import { latestSession } from './profileStats'
import type { SendItem } from './socialTypes'

const routeApi = getRouteApi('/u/$handle')

/** Map profile sends to the pyramid's minimal shape — projection sends are all `sent`. */
function toPyramidInput(sends: SendItem[]): PyramidInput[] {
  return sends.map((s) => ({
    sent: true,
    sourceCatalogId: s.sourceCatalogId,
    problemName: s.problemName,
    problemGrade: s.problemGrade,
    date: s.climbedAt,
    tries: s.tries,
  }))
}

/** A send → the Ascent shape AscentRow renders. The projection omits vote/stars/comment, so
 *  those default to "no vote arrow, no stars, no comment"; every projected row is a send. */
function toAscent(s: SendItem): Ascent {
  return {
    id: s.ascentId,
    date: s.climbedAt,
    sourceCatalogId: s.sourceCatalogId,
    userProblemId: s.userProblemId,
    problemName: s.problemName,
    problemGrade: s.problemGrade,
    votedGrade: s.problemGrade,
    tries: s.tries,
    stars: 0,
    comment: '',
    sent: true,
    boardLayoutId: s.boardLayoutId,
  }
}

type LoadState = 'loading' | 'loaded' | 'error'

const sessionDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function ProfileSends({ userId }: { userId: string }) {
  const [sends, setSends] = useState<SendItem[]>([])
  const [status, setStatus] = useState<LoadState>('loading')
  const [done, setDone] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [catalogById, setCatalogById] = useState<Map<string, CatalogProblem>>(new Map())
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

  // Enrich rows from the viewer's own cached catalog (setter/benchmark + tap-to-open), same as
  // the logbook — resolves for boards the viewer has synced; the rest fall back gracefully.
  useEffect(() => {
    const ids = sends.map((s) => s.sourceCatalogId).filter((v): v is string => v !== null)
    if (ids.length === 0) return
    let live = true
    void getCatalogProblemsByIds(ids).then((map) => {
      if (live) setCatalogById(map)
    })
    return () => {
      live = false
    }
  }, [sends])

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

  const session = useMemo(() => latestSession(sends), [sends])
  const pyramidInput = useMemo(() => toPyramidInput(sends), [sends])

  // ── Problem detail drawer (?problem) — same protocol as logbook/catalog ──────
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const openId = search.problem ?? ''
  const { pagerStack, openProblem, showProblem, closeDrawer } = useProblemDrawer({
    openId,
    pushProblem: (id) => void navigate({ search: (prev) => ({ ...prev, problem: id }) }),
    replaceProblem: (id) =>
      void navigate({ search: (prev) => ({ ...prev, problem: id }), replace: true }),
    clearProblem: () => void navigate({ search: (prev) => ({ ...prev, problem: '' }), replace: true }),
  })

  // The pager domain: the loaded sends' resolvable catalog problems, in on-screen order, deduped
  // by source_catalog_id (keep the first occurrence).
  const sendProblems = useMemo(() => {
    const seen = new Set<string>()
    const out: CatalogProblem[] = []
    for (const s of sends) {
      const id = s.sourceCatalogId
      if (!id || seen.has(id)) continue
      const problem = catalogById.get(id)
      if (!problem) continue
      seen.add(id)
      out.push(problem)
    }
    return out
  }, [sends, catalogById])

  const current = openId
    ? (pagerStack?.find((p) => p.source_catalog_id === openId) ?? catalogById.get(openId))
    : undefined
  const displayed = pagerStack ?? (current ? [current] : [])
  const currentBoard = current ? boardByLayoutId(current.layout_id) : undefined

  const { favoriteIds } = useFavorites()
  // Thumbnails honour the viewer's logbook preview toggle — same style/surface as the logbook.
  const showThumbnails = useShowPreviews('logbook')
  // The green "sent" check in the drawer = the VIEWER's own logged sends (all boards) — "you've
  // also done this" — not the profile owner's. Answers the row-level ambiguity explicitly.
  const { ascents: myAscents } = useEnsureAscentsLoaded()
  const sentIds = useMemo(
    () =>
      new Set(
        myAscents.filter((a) => a.sent && a.sourceCatalogId).map((a) => a.sourceCatalogId as string),
      ),
    [myAscents],
  )

  const openSend = useCallback(
    (s: SendItem) => {
      if (s.sourceCatalogId && catalogById.has(s.sourceCatalogId)) {
        openProblem(s.sourceCatalogId, sendProblems)
      }
    },
    [catalogById, openProblem, sendProblems],
  )

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
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="px-1 pb-2 text-sm font-semibold text-foreground">Grades</h2>
        <GradePyramid items={pyramidInput} />
      </section>

      {session && (
        <section>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <h2 className="text-sm font-semibold text-foreground">Latest session</h2>
            <span className="text-xs text-muted-foreground">
              {sessionDate.format(session.date)} · {session.sends.length} climb
              {session.sends.length === 1 ? '' : 's'}
            </span>
          </div>
          <SendRows
            sends={session.sends}
            catalogById={catalogById}
            showThumbnails={showThumbnails}
            onOpen={openSend}
          />
        </section>
      )}

      <section className="flex flex-col">
        <SendRows
          sends={sends}
          catalogById={catalogById}
          showThumbnails={showThumbnails}
          onOpen={openSend}
        />
        {!done && (
          <Button variant="ghost" className="mt-2 self-center" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </section>

      <Drawer open={current !== undefined} onOpenChange={(open) => !open && closeDrawer()} showSwipeHandle>
        <DrawerContent>
          <DrawerTitle className="sr-only">Problem details</DrawerTitle>
          <div className="max-h-[85vh] overflow-y-auto px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {current && currentBoard && (
              <ProblemDetail
                problem={current}
                displayed={displayed}
                board={currentBoard}
                angle={current.angle}
                favoriteIds={favoriteIds}
                sentIds={sentIds}
                onNavigate={showProblem}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

/** Read-only list of sends as shared AscentRows (no edit pencil, no per-row sent check).
 *  Rows whose problem resolves in the viewer's catalog are tappable → the detail drawer. */
function SendRows({
  sends,
  catalogById,
  showThumbnails,
  onOpen,
}: {
  sends: SendItem[]
  catalogById: Map<string, CatalogProblem>
  showThumbnails: boolean
  onOpen: (send: SendItem) => void
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      {sends.map((s) => {
        const resolved = s.sourceCatalogId ? catalogById.get(s.sourceCatalogId) : undefined
        return (
          <AscentRow
            key={s.ascentId}
            ascent={toAscent(s)}
            catalog={resolved}
            board={boardByLayoutId(s.boardLayoutId)}
            showThumbnail={showThumbnails}
            showSentIndicator={false}
            onSelect={resolved ? () => onOpen(s) : undefined}
          />
        )
      })}
    </div>
  )
}
