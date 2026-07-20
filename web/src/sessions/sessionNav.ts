// The single canonical "session → board catalog" navigation, shared by JoinSession (post-join)
// and MyBoards (post-resume) so the two landing paths can't drift. Lives here (not in either
// caller) for the same reason joinUrl.ts owns the join-URL shape.

import { useNavigate } from '@tanstack/react-router'
import { activateBoard } from '../board/boardStore'
import { boardByLayoutId } from '../board/boards'
import { catalogNavTarget } from '../catalog/catalogNav'
import type { Session } from './sessionsTypes'

/** The navigate function returned by TanStack Router's useNavigate. */
type NavigateFn = ReturnType<typeof useNavigate>

/**
 * Land in a session's board catalog. Resolves the board from the STATIC catalog by layout id —
 * it does not require the board to be in the user's added boards — so a joiner/resumer lands
 * regardless of local board state. A session whose board this build doesn't ship falls back to
 * `/boards` rather than a dead no-op (never route a session tap through a fallback-less handler
 * like the board-browse `onActivated`).
 *
 * Also promotes the session's board to the device's active board (MRU + persisted pointer) so a
 * subsequent cold-launch or MyBoards visit reflects where the user actually is — otherwise the
 * URL-scoped catalog and the device's `activeBoard` silently disagree. activateBoard is a no-op
 * when the layout id isn't in this build's static catalog, so the /boards fallback stays honest.
 */
export function navigateToSessionBoard(navigate: NavigateFn, session: Session): void {
  const board = boardByLayoutId(session.boardLayoutId)
  if (board) {
    activateBoard(board.layoutId)
    void navigate(catalogNavTarget(board))
  } else {
    void navigate({ to: '/boards' })
  }
}
