// One-tap PWA install banner for browsers that support it (Chrome/Edge/Samsung
// Internet on Android, and desktop Chromium). Unlike iOS, these fire the
// `beforeinstallprompt` event and install a real standalone app where Web
// Bluetooth keeps working. We stash the event and drive the install ourselves.
// (iOS never fires this event, so the banner is naturally absent there — the
// FullscreenTipBanner covers iOS instead.)

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { INSTALL_DISMISSED_KEY, isStandalone, safeGetItem, safeSetItem } from '@/lib/pwa'

// Not in lib.dom yet — the minimal shape we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => safeGetItem(INSTALL_DISMISSED_KEY) === '1')
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar; we surface our own affordance.
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!promptEvent || dismissed || installed) return null

  const install = () => {
    // The event can only be consumed once; drop it either way. `appinstalled`
    // handles the success path (hides via `installed`).
    void promptEvent.prompt()
    setPromptEvent(null)
  }
  const dismiss = () => {
    safeSetItem(INSTALL_DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <Card role="region" aria-label="Install Boardhang" className="shrink-0 border-primary/30">
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 font-medium">Install Boardhang</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss install banner"
            onClick={dismiss}
            className="-mt-1 -mr-1 shrink-0"
          >
            <X />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Add it to your device — a full-screen app that still connects to your board.
          </p>
          <Button size="sm" onClick={install} className="shrink-0">
            <Download aria-hidden /> Install
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
