// Dismissable nudge to add the app to the Home Screen. Shown on iOS in a
// Bluetooth-capable browser (Bluefy) that isn't yet running from the Home
// Screen. A Home-Screen launch from Bluefy keeps Web Bluetooth working, so this
// is the path we steer people onto. Dismissal is remembered (best-effort).

import { useState } from 'react'
import { Plus, Share, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { INSTALL_DISMISSED_KEY, safeGetItem, safeSetItem, shouldOfferInstall } from '@/lib/pwa'

export function InstallBanner() {
  // Both evaluated once at mount: the environment can't change within a session.
  const [offer] = useState(shouldOfferInstall)
  const [dismissed, setDismissed] = useState(() => safeGetItem(INSTALL_DISMISSED_KEY) === '1')

  if (!offer || dismissed) return null

  const dismiss = () => {
    safeSetItem(INSTALL_DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <Card role="region" aria-label="Add to Home Screen" className="border-primary/30">
      <CardContent className="flex items-start gap-3 text-sm">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">Add MoonBoard to your Home Screen</p>
          <p className="text-muted-foreground">
            Tap the <Share aria-hidden className="inline size-4 align-text-bottom" /> Share menu,
            then{' '}
            <span className="whitespace-nowrap">
              <Plus aria-hidden className="inline size-4 align-text-bottom" /> Add to Home Screen
            </span>{' '}
            — you’ll get a full-screen app that still connects to your board.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss Add to Home Screen banner"
          onClick={dismiss}
          className="-mr-1 shrink-0"
        >
          <X />
        </Button>
      </CardContent>
    </Card>
  )
}
