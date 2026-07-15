// In-app QR scanner for joining a session (U3). A bottom drawer opens the camera, decodes a
// session QR, and navigates to the existing /session/join/$token route — the scanner owns only
// camera states (KTD-4); sign-in, consent, and the join RPC stay in JoinSession.
//
// The heavy decoder (@yudiel/react-qr-scanner + ~433 kB WASM) loads only when the drawer opens,
// via a manual dynamic import rather than React.lazy: React.lazy memoizes a rejected import, so
// its retry edge is unrecoverable, and we need retry to work after an offline open (KTD-5). The
// loader awaits both the chunk and the retryable ensureDecoder() WASM prep; any failure routes to
// the paste fallback, which is never a dead end (R6).

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Camera, Loader2, ScanQrCode } from 'lucide-react'
import type { IScannerProps } from '@yudiel/react-qr-scanner'
import { parseJoinUrl } from './joinUrl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

type ScannerComponent = ComponentType<IScannerProps>

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
          const raw = codes[0]?.rawValue
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

/** Controlled scanner drawer. Mount the scanner subtree only while open + scanning so closing the
 *  drawer unmounts it and tears down the camera stream (R9). */
export function ScanToJoin({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'scanning' | 'unavailable'>('scanning')
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

  // Fresh drawer open → back to a clean scanning state.
  useEffect(() => {
    if (open) {
      setPhase('scanning')
      setPaused(false)
      setHint(null)
      setPasteValue('')
    }
  }, [open])

  useEffect(() => () => void (hintTimer.current && clearTimeout(hintTimer.current)), [])

  // iOS standalone PWAs freeze the stream on backgrounding; pause while hidden and re-acquire a
  // fresh stream (not just unpause) on return, since the old one is dead.
  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPaused(true)
      } else {
        setPaused(false)
        setAttempt((a) => a + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open])

  const onDecode = useCallback(
    (raw: string) => {
      const token = parseJoinUrl(raw)
      if (token) goToJoin(token)
      else flashHint()
    },
    [goToJoin, flashHint],
  )

  const onScannerError = useCallback(() => setPhase('unavailable'), [])

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
    <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Scan to join</DrawerTitle>
          <DrawerDescription>
            Point your camera at a friend’s session QR code.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {open && phase === 'scanning' ? (
            <>
              <ScannerStage
                attempt={attempt}
                paused={paused}
                onDecode={onDecode}
                onError={onScannerError}
              />
              <p
                aria-live="polite"
                className="min-h-5 text-center text-sm text-muted-foreground"
              >
                {hint}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPhase('unavailable')}>
                Enter the link instead
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
                <Camera className="size-4 shrink-0" />
                <span>
                  Camera unavailable. Ask your friend to send the link, then paste it here.
                </span>
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
              <p aria-live="polite" className="min-h-5 text-center text-sm text-destructive">
                {hint}
              </p>
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
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** Reusable trigger: a button (styled by the caller) that owns the drawer's open state. Both entry
 *  points — StartBar and the boards overview — render this. */
export function ScanToJoinButton({
  children,
  className,
  variant = 'outline',
  size,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <ScanToJoin open={open} onOpenChange={setOpen} />
    </>
  )
}
