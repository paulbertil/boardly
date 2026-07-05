// Top-level navigation between the app's primary surfaces. "Detail" is a
// sub-view of the catalog and has no tab.

import { Button } from '@/components/ui/button'

export type NavView = 'build' | 'boards' | 'catalog'

const TABS: { view: NavView; label: string }[] = [
  { view: 'catalog', label: 'Catalog' },
  { view: 'boards', label: 'My Boards' },
  { view: 'build', label: 'Build' },
]

interface NavigationProps {
  view: NavView
  onNavigate: (view: NavView) => void
  /** Views that can't be reached yet (e.g. Catalog before a board is added). */
  disabled?: NavView[]
}

export function Navigation({ view, onNavigate, disabled = [] }: NavigationProps) {
  return (
    <nav className="flex gap-1" aria-label="Primary">
      {TABS.map((tab) => (
        <Button
          key={tab.view}
          variant={view === tab.view ? 'default' : 'ghost'}
          size="sm"
          disabled={disabled.includes(tab.view)}
          title={disabled.includes(tab.view) ? 'Add a board first' : undefined}
          aria-current={view === tab.view ? 'page' : undefined}
          onClick={() => onNavigate(tab.view)}
        >
          {tab.label}
        </Button>
      ))}
    </nav>
  )
}
