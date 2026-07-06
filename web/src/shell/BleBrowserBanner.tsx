// Non-dismissable notice shown when the app is opened on an iPhone/iPad in a
// browser without Web Bluetooth (Safari, in-app webviews). The board can't
// connect at all here, so we point the user at Bluefy — the free Web-Bluetooth
// browser they can install from the App Store. Stays until they switch browsers
// (at which point the condition is false); intentionally has no dismiss control.

import { Bluetooth } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { shouldShowBleBrowserPrompt } from '@/lib/pwa'

export function BleBrowserBanner() {
  // Environment doesn't change within a session — evaluate once.
  if (!shouldShowBleBrowserPrompt()) return null

  return (
    <Card
      role="region"
      aria-label="Bluetooth not supported"
      className="border-destructive/40 bg-destructive/5"
    >
      <CardContent className="flex items-start gap-3 text-sm">
        <Bluetooth className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">This browser can’t connect to Bluetooth</p>
          <p className="text-muted-foreground">
            To light up your MoonBoard on iPhone, open this page in{' '}
            <span className="font-medium text-foreground">Bluefy</span> — a free Bluetooth
            browser from the App Store. Safari can’t talk to the board.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
