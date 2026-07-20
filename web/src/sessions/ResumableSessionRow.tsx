// Presentational one-row button for a resumable session. Shared by MyBoards (default
// card chrome) and SessionBar (passes a className override for the slim in-bar chrome
// via `cn` + tailwind-merge).

import { boardByLayoutId } from '../board/boards'
import type { Session } from './sessionsTypes'
import { cn } from '@/lib/utils'

export interface ResumableSessionRowProps {
  session: Session
  disabled: boolean
  onResume: (session: Session) => void
  /** Extends/overrides the outer button styling (twMerge-resolved). */
  className?: string
}

export function ResumableSessionRow({ session, disabled, onResume, className }: ResumableSessionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onResume(session)}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition hover:bg-accent disabled:opacity-60',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{session.name || 'Session'}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {boardByLayoutId(session.boardLayoutId)?.name ?? 'Session'}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium text-primary">
        {disabled ? 'Resuming…' : 'Resume'}
      </span>
    </button>
  )
}
