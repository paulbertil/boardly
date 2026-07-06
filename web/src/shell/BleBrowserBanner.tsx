// Non-dismissable notice shown when the current browser has no Web Bluetooth, so
// the board can't connect at all. The recommendation is platform-aware: on iOS
// only Bluefy can do Web Bluetooth; everywhere else (Android Firefox, desktop
// Safari/Firefox) Chrome can. Stays until the user switches browsers (at which
// point the condition is false); intentionally has no dismiss control.

import { Bluetooth } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { isIosLike, shouldShowBleBrowserPrompt } from '@/lib/pwa'

export function BleBrowserBanner() {
  // Environment doesn't change within a session — evaluate once.
  if (!shouldShowBleBrowserPrompt()) return null

  return (
    <Card
      role="region"
      aria-label="Bluetooth not supported"
      className="shrink-0 border-destructive/40 bg-destructive/5"
    >
      <CardContent className="flex items-start gap-3 text-sm">
        <Bluetooth aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">This browser can’t connect to Bluetooth</p>
          {isIosLike() ? (
            <p className="text-muted-foreground">
              To light up your MoonBoard on iPhone, open this page in{' '}
              <span className="font-medium text-foreground">Bluefy</span> — a free Bluetooth
              browser from the App Store. Safari can’t talk to the board.
            </p>
          ) : (
            <p className="text-muted-foreground">
              To light up your MoonBoard, open this page in{' '}
              <span className="font-medium text-foreground">Google Chrome</span>, which supports
              Web Bluetooth. This browser can’t talk to the board.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
