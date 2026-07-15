// Scanner-first "filter with friends" launcher (U3). A centered dialog that opens straight to the
// camera: a session QR in frame auto-joins via the existing /session/join/$token route — the
// scanner owns only camera states (KTD-4); sign-in, consent, and the join RPC stay in JoinSession.
// Hosting is the demoted path: when `onStart` is supplied, an "or" divider + "Start your own
// session" button sit below the viewfinder.
//
// The heavy decoder (@yudiel/react-qr-scanner + ~433 kB WASM) loads only when the dialog opens,
// via a manual dynamic import that awaits both the chunk and the retryable ensureDecoder() WASM
// prep in one place and can retry per attempt. React.lazy is a poor fit here: it memoizes a
// rejected import, so its retry edge can't recover an offline first open (KTD-5). Any load failure
// routes to the paste fallback, which is never a dead end (R6).

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Camera, Loader2, Plus, ScanQrCode } from 'lucide-react'
import type { IScannerProps } from '@yudiel/react-qr-scanner'
import { parseJoinUrl } from './joinUrl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ScannerComponent = ComponentType<IScannerProps>
// 'fallback' covers both a real camera failure and the user choosing to type the link instead.
type Phase = 'scanning' | 'fallback'

/** Loads the scanner chunk + WASM on mount (and on each `attempt`), then renders the camera. A
 *  chunk or WASM failure calls `onError` so the parent shows the paste fallback; bumping `attempt`
 *  re-runs the load, which recovers because ensureDecoder retries a previously-failed WASM fetch. */
function ScannerStage({
  attempt,
  paused,
  onDecode,
  onError,
}: {
  attempt: number
  paused: boolean
  onDecode: (raw: string) => void
  onError: () => void
}) {
  const [Scanner, setScanner] = useState<ScannerComponent | null>(null)

  useEffect(() => {
    let cancelled = false
    setScanner(null)
    void (async () => {
      try {
        const mod = await import('./qrDecoder')
        await mod.ensureDecoder()
        if (!cancelled) setScanner(() => mod.default)
      } catch {
        if (!cancelled) onError()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attempt, onError])

  if (!Scanner) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg [&_video]:aspect-square [&_video]:w-full [&_video]:object-cover">
      <Scanner
        onScan={(codes) => {
          // Prefer the first code that is actually a session link — a stray non-session QR in
          // frame shouldn't shadow the one the user is aiming at.
          const raw = (codes.find((c) => parseJoinUrl(c.rawValue)) ?? codes[0])?.rawValue
          if (raw) onDecode(raw)
        }}
        onError={onError}
        paused={paused}
        constraints={{ facingMode: 'environment' }}
        formats={['qr_code']}
        components={{ finder: true }}
      />
    </div>
  )
}

/**
 * Scanner-first session launcher. Camera-only by default; pass `onStart` (+ `starting`/`canStart`)
 * to surface the "Start your own session" host path below the viewfinder.
 *
 * The visible branch is chosen by `phase` (not `open`) so the dialog's close animation never
 * flashes the fallback card; only the live camera (`ScannerStage`) is gated on `open`, so closing
 * tears the stream down (R9).
 */
export function ScanToJoin({
  open,
  onOpenChange,
  onStart,
  starting = false,
  canStart = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided, renders the "Start your own session" host action below the scanner. */
  onStart?: () => void
  starting?: boolean
  /** Whether the host action is enabled (signed in). Ignored when `onStart` is absent. */
  canStart?: boolean
}) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('scanning')
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [pasteValue, setPasteValue] = useState('')
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashHint = useCallback(() => {
    setHint('Not a session code')
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(null), 2500)
  }, [])

  const goToJoin = useCallback(
    (token: string) => {
      onOpenChange(false)
      void navigate({ to: '/session/join/$token', params: { token } })
    },
    [navigate, onOpenChange],
  )

  // Reset when the dialog closes, so the next open always starts on the camera (scanner-first) and
  // never paints a stale fallback frame. Runs on close so the reset hides behind the animation.
  useEffect(() => {
    if (!open) {
      setPhase('scanning')
      setPaused(false)
      setHint(null)
      setPasteValue('')
    }
  }, [open])

  useEffect(() => () => void (hintTimer.current && clearTimeout(hintTimer.current)), [])

  // iOS standalone PWAs freeze the stream on backgrounding; pause while hidden and re-acquire a
  // fresh stream (not just unpause) on return, since the old one is dead. Only bump the attempt
  // while actually scanning — in the fallback phase there is no ScannerStage to re-acquire.
  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPaused(true)
      } else {
        setPaused(false)
        if (phase === 'scanning') setAttempt((a) => a + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open, phase])

  const onDecode = useCallback(
    (raw: string) => {
      const token = parseJoinUrl(raw)
      if (token) goToJoin(token)
      else flashHint()
    },
    [goToJoin, flashHint],
  )

  // Entering the fallback (camera error or user choice) clears any transient scan hint so the
  // paste view doesn't open showing a stale red "Not a session code".
  const enterFallback = useCallback(() => {
    setHint(null)
    setPhase('fallback')
  }, [])

  const retry = useCallback(() => {
    setHint(null)
    setPhase('scanning')
    setAttempt((a) => a + 1)
  }, [])

  const submitPaste = useCallback(() => {
    const token = parseJoinUrl(pasteValue)
    if (token) goToJoin(token)
    else flashHint()
  }, [pasteValue, goToJoin, flashHint])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5">
        <DialogHeader className="text-left">
          <DialogTitle>Filter with friends</DialogTitle>
          <DialogDescription>
            {phase === 'scanning'
              ? 'Point at a friend’s session QR code to join.'
              : 'Camera unavailable — paste the link a friend sent you.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'scanning' ? (
          <div className="flex flex-col gap-3">
            {open ? (
              <ScannerStage
                attempt={attempt}
                paused={paused}
                onDecode={onDecode}
                onError={enterFallback}
              />
            ) : (
              // Closing: keep the scanner's footprint while the dialog animates out, no live camera.
              <div className="aspect-square w-full rounded-lg bg-muted" />
            )}
            <p aria-live="polite" className="text-center text-sm text-muted-foreground">
              {hint ?? 'Scanning…'}
            </p>
            <Button variant="ghost" size="sm" onClick={enterFallback}>
              Enter the link instead
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              <Camera className="size-4 shrink-0" />
              <span>Ask your friend to send the link, then paste it here.</span>
            </div>
            <Input
              value={pasteValue}
              onChange={(e) => {
                setPasteValue(e.target.value)
                if (hint) setHint(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPaste()
              }}
              placeholder="Paste session link"
              aria-label="Session link"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {hint && <p className="text-center text-sm text-destructive">{hint}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={retry}>
                <ScanQrCode className="size-4" />
                Try camera
              </Button>
              <Button className="flex-1" disabled={!pasteValue.trim()} onClick={submitPaste}>
                Join
              </Button>
            </div>
          </div>
        )}

        {onStart && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={!canStart || starting}
              title={canStart ? undefined : 'Sign in to start a session'}
              onClick={onStart}
            >
              {starting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {starting ? 'Creating session…' : 'Start your own session'}
            </Button>
            {!canStart && (
              <p className="text-center text-xs text-muted-foreground">
                Sign in to start — joining a friend’s doesn’t need an account.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Reusable trigger for a camera-only join (no host action) — used by the boards overview, which
 *  has no board context to start a session in. Owns the dialog's open state. Spreads through
 *  `Button`'s props so callers can style it. */
export function ScanToJoinButton({
  variant = 'outline',
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant={variant} {...props} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ScanToJoin open={open} onOpenChange={setOpen} />
    </>
  )
}
