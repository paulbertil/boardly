// The Logbook tab: the signed-in user's climbing history for the active board —
// a grade pyramid on top, then every day-session below with its ascent rows. Mirrors
// the iOS Home logbook section + full LogbookView combined onto one screen. Data comes
// straight from the shared Supabase `ascents` table (online-first; see ascents.ts).

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { SignInPanel } from '../auth/SignInPanel'
import { useBoardStore } from '../board/boardStore'
import { getCatalogProblemsByIds, type CatalogProblem } from '../catalog/catalogSync'
import { Skeleton } from '@/components/ui/skeleton'
import { loadAscents, resetAscents, useAscents, type Ascent } from './ascents'
import { AscentRow } from './AscentRow'
import { GradePyramid } from './GradePyramid'
import { LogAscentSheet, type LogTarget } from './LogAscentSheet'
import { sessions } from './sessions'

export function LogbookScreen() {
  const { status, isRestoring } = useAuth()
  const { activeBoard } = useBoardStore()
  const { status: dataStatus, ascents, error } = useAscents()
  const signedIn = status !== 'signedOut'

  const [target, setTarget] = useState<LogTarget | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [catalogById, setCatalogById] = useState<Map<string, CatalogProblem>>(new Map())

  // Load on sign-in, clear on sign-out. Waits out the initial session restore so we
  // don't flash the signed-out state for an established user.
  useEffect(() => {
    if (isRestoring) return
    if (signedIn) void loadAscents()
    else resetAscents()
  }, [signedIn, isRestoring])

  // Enrich rows with cached catalog entries (setter / benchmark / thumbnail).
  useEffect(() => {
    const ids = ascents.map((a) => a.sourceCatalogId).filter((x): x is string => x !== null)
    if (ids.length === 0) {
      setCatalogById(new Map())
      return
    }
    let cancelled = false
    getCatalogProblemsByIds(ids)
      .then((m) => {
        if (!cancelled) setCatalogById(m)
      })
      .catch(() => {
        /* enrichment is best-effort — rows fall back to ascent-only data */
      })
    return () => {
      cancelled = true
    }
  }, [ascents])

  // Board-scoped view, mirroring iOS (the pyramid + list follow the active board).
  const boardAscents = useMemo(
    () => ascents.filter((a) => a.boardLayoutId === activeBoard.layoutId),
    [ascents, activeBoard.layoutId],
  )
  const daySessions = useMemo(() => sessions(boardAscents), [boardAscents])
  const hasSends = boardAscents.some((a) => a.sent)

  function openEdit(ascent: Ascent) {
    setTarget({ kind: 'edit', ascent })
    setSheetOpen(true)
  }

  const header = (
    <div className="mb-3 px-1">
      <h1 className="text-lg font-bold tracking-tight">Logbook</h1>
      <p className="text-xs text-muted-foreground">{activeBoard.name}</p>
    </div>
  )

  // ── Signed out ──────────────────────────────────────────────────────────────
  if (!isRestoring && !signedIn) {
    return (
      <div className="flex flex-1 flex-col px-3">
        {header}
        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">Sign in to see your logbook</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Your logged ascents sync with the MoonBoard app across your devices.
          </p>
          <SignInPanel />
        </div>
      </div>
    )
  }

  // ── Loading (initial) ───────────────────────────────────────────────────────
  if (isRestoring || (dataStatus === 'loading' && ascents.length === 0)) {
    return (
      <div className="flex flex-1 flex-col px-3">
        {header}
        <Skeleton className="h-[220px] w-full rounded-lg" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  // ── Empty: nothing logged anywhere ─────────────────────────────────────────
  if (ascents.length === 0) {
    return (
      <div className="flex flex-1 flex-col px-3">
        {header}
        <EmptyState
          title="No logged ascents yet"
          body="When you log tries or an ascent, it'll show up in your logbook."
        />
        {error && <ErrorNote error={error} />}
      </div>
    )
  }

  // ── Empty: logged, but nothing on the active board ──────────────────────────
  if (boardAscents.length === 0) {
    return (
      <div className="flex flex-1 flex-col px-3">
        {header}
        <EmptyState
          title={`No ascents on ${activeBoard.name}`}
          body="Switch boards to see ascents logged elsewhere."
        />
      </div>
    )
  }

  // ── Logbook ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col px-3">
      {header}

      {hasSends && (
        <section className="mb-4 rounded-lg border border-border p-3">
          <GradePyramid ascents={boardAscents} />
        </section>
      )}

      <div className="space-y-4">
        {daySessions.map((session) => (
          <section key={session.dayKey}>
            <h2 className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {session.title}
            </h2>
            <div className="overflow-hidden rounded-lg border border-border">
              {session.ascents.map((ascent) => (
                <AscentRow
                  key={ascent.id}
                  ascent={ascent}
                  catalog={ascent.sourceCatalogId ? catalogById.get(ascent.sourceCatalogId) : undefined}
                  board={activeBoard}
                  showThumbnail
                  onEdit={openEdit}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {error && <ErrorNote error={error} />}

      <LogAscentSheet open={sheetOpen} onOpenChange={setSheetOpen} target={target} />
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-center">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function ErrorNote({ error }: { error: string }) {
  return (
    <p className="mt-4 text-center text-xs text-destructive" role="alert">
      Couldn’t load your logbook: {error}
    </p>
  )
}
