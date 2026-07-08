// Settings — global, non-board-scoped app configuration. Reached from the bottom
// nav's Settings tab (`/settings`). Today it holds only Appearance (theme); it's
// laid out as labeled Card rows so more settings can slot in later.

import { ChevronRight, Download, Monitor, Moon, Sun } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setTheme, useTheme, type Theme } from './themeStore'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsScreen() {
  const theme = useTheme()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Appearance</h2>
            <p className="text-sm text-muted-foreground">
              Choose a light or dark theme, or follow your device setting.
            </p>
          </div>
          <ToggleGroup
            aria-label="Appearance"
            variant="outline"
            spacing={0}
            value={[theme]}
            // Single-select base-ui group returns a one-item array; ignore an empty
            // array so the active theme can't be toggled off (one is always chosen).
            onValueChange={(value) => {
              const next = value[0] as Theme | undefined
              if (next) setTheme(next)
            }}
            className="w-full"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
                <Icon className="size-4" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Link
            to="/logbook/import"
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
          >
            <Download className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Import from MoonBoard</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Bring your logbook over from the official MoonBoard app.
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
