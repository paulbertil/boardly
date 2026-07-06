import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AccountMenu } from './auth/AccountMenu'
import { useBoardStore } from './board/boardStore'
import { CatalogScreen } from './catalog/CatalogScreen'
import { clearSearch } from './catalog/searchStore'
import { LogbookScreen } from './logbook/LogbookScreen'
import { MyBoards } from './shell/MyBoards'
import { Navigation, type NavView } from './shell/Navigation'

function App() {
  const { addedBoards, activeBoard } = useBoardStore()
  const [view, setView] = useState<NavView>('catalog')
  // The last home screen (Boards / Logbook) visited before entering the catalog — the
  // one tab the collapsed catalog nav shows on the left.
  const [origin, setOrigin] = useState<'boards' | 'logbook'>('boards')

  const navigate = (next: NavView) => {
    if (next === 'boards' || next === 'logbook') setOrigin(next)
    setView(next)
  }

  // Search is transient per board — switching the active board must not carry a
  // stale query onto a different board's catalog.
  const lastBoardId = useRef(activeBoard.layoutId)
  useEffect(() => {
    if (lastBoardId.current !== activeBoard.layoutId) {
      clearSearch()
      lastBoardId.current = activeBoard.layoutId
    }
  }, [activeBoard.layoutId])

  // First-run / no active board: the catalog has no slab to browse, so route to
  // My Boards to add one rather than showing an empty catalog.
  const effectiveView: NavView = addedBoards.length === 0 && view === 'catalog' ? 'boards' : view

  const noBoards = addedBoards.length === 0

  return (
    <div className="app-shell">
      <main className="app-scroll overflow-x-hidden">
        <header className="mb-3 flex items-center justify-end gap-2">
          <AccountMenu />
        </header>
        {effectiveView === 'catalog' && <CatalogScreen />}
        {effectiveView === 'boards' && <MyBoards onActivated={() => setView('catalog')} />}
        {effectiveView === 'logbook' && <LogbookScreen />}
      </main>
      <Navigation
        view={effectiveView}
        onNavigate={navigate}
        origin={origin}
        disabled={noBoards ? ['catalog'] : []}
      />
    </div>
  )
}

export default App
