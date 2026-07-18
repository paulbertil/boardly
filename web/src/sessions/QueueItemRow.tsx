// One row of the session queue drawer (U4). Presentational: the parent QueueDrawer owns the store
// mutations, toasts, and aria-live announcements. Two layouts:
//   • default — a recents-style preview row (board thumbnail, name + benchmark badge, the shared
//     ProblemMeta line, a trailing grade pill, and the sends pill) that opens the problem on tap.
//     There's no manual check-off: a sent climb reads as done from the sends pill / sent marker.
//   • editing — while the drawer is in Edit mode, a compact reorder row: a drag handle and a
//     remove control. Active rows are wrapped as a dnd-kit SortableItem (the drawer provides the
//     Sortable context); the handle is a SortableItemHandle. Done rows aren't reorderable.
// The sends pill (a green check + sender avatars, keyed on source_catalog_id — KTD6) mirrors
// CatalogRow so the queue reads identically to the catalog/recents list.

import { BadgeCheck, CheckCircle2, GripVertical, X } from 'lucide-react'
import type { CatalogBoardDef } from '../board/boards'
import { CatalogBoard } from '../board/CatalogBoard'
import type { CatalogProblem } from '../catalog/catalogSync'
import { ProblemMeta } from '../catalog/ProblemMeta'
import type { SenderChip } from '../catalog/useMemberSenders'
import type { QueueItem } from './queueTypes'
import { MemberAvatar } from './MemberAvatar'
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { SortableItem, SortableItemHandle } from '@/components/ui/sortable'
import { cn } from '@/lib/utils'

/** Max sender avatars in the pill before the +K overflow count (mirrors CatalogRow). */
const SENDER_CAP = 3

/** "Sent by You, Bob, +2" — the accessible summary for the sends pill (role=img). */
function sendersAriaLabel(senders: SenderChip[]): string {
  const shown = senders.slice(0, SENDER_CAP).map((s) => s.label)
  const extra = senders.length - shown.length
  return `Sent by ${[...shown, ...(extra > 0 ? [`+${extra}`] : [])].join(', ')}`
}

export interface QueueItemRowProps {
  item: QueueItem
  /** Resolved catalog problem (title, grade, meta, holds), or undefined until the id lookup lands. */
  problem?: CatalogProblem
  /** The board — geometry for the thumbnail render. */
  board: CatalogBoardDef
  /** Crew members (self first) who have sent this problem — the sends pill (KTD6). */
  senders?: SenderChip[]
  variant: 'active' | 'done'
  /** Drawer is in Edit mode: show the compact reorder row (drag handle + remove) instead. */
  editing?: boolean
  /** Show the board thumbnail (follows the catalog "climb previews" toggle, as recents does). */
  showThumbnail?: boolean
  /** Close the drawer + open this problem via the shared ?problem navigation (KTD9). */
  onOpen: () => void
  onRemove?: () => void
}

export function QueueItemRow({
  item,
  problem,
  board,
  senders,
  variant,
  editing = false,
  showThumbnail = false,
  onOpen,
  onRemove,
}: QueueItemRowProps) {
  const name = problem?.name ?? 'this climb'
  const isDone = variant === 'done'

  const sendsPill =
    senders && senders.length > 0 ? (
      <span
        role="img"
        aria-label={sendersAriaLabel(senders)}
        className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary py-0.5 pr-2 pl-1.5"
      >
        <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-success" />
        <AvatarGroup className="-space-x-1.5">
          {senders.slice(0, SENDER_CAP).map((s) => (
            <MemberAvatar
              key={s.userId}
              initials={s.initials}
              avatarUrl={s.avatarUrl}
              isSelf={s.isSelf}
              title={s.label}
              size="xxs"
              opaque
            />
          ))}
          {senders.length > SENDER_CAP && <AvatarGroupCount>+{senders.length - SENDER_CAP}</AvatarGroupCount>}
        </AvatarGroup>
      </span>
    ) : null

  const gradePill = problem ? (
    <span className="shrink-0 rounded-md bg-secondary px-2.5 py-1 text-sm font-bold tabular-nums text-secondary-foreground">
      {problem.grade}
    </span>
  ) : null

  // Edit mode: a compact reorder row. The name + grade + remove are shared; an active row also
  // carries the drag handle (and is a dnd-kit SortableItem), a done row is not reorderable.
  if (editing) {
    const compactBody = (
      <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
        <span className={cn('truncate text-sm font-semibold uppercase tracking-tight', isDone && 'line-through')}>
          {name}
        </span>
        {gradePill}
      </span>
    )
    const removeButton = (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label={`Remove ${name} from the queue`}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    )

    if (variant === 'active') {
      return (
        <SortableItem value={item.id} asChild>
          {/* Transparent so rows blend into the drawer; only the lifted (dragging) row gets an
              opaque background so it reads above the others. */}
          <li className="flex items-center gap-1 border-b border-border/50 py-1.5 data-dragging:relative data-dragging:z-10 data-dragging:rounded-md data-dragging:bg-popover data-dragging:shadow-lg">
            {/* `data-base-ui-swipe-ignore` opts the handle out of the Base UI Drawer's
                swipe-to-dismiss (both share the vertical axis); `touch-none` blocks scroll so the
                touch sensor owns the gesture. dnd-kit's drag listeners are merged in via asChild. */}
            <SortableItemHandle asChild>
              <button
                data-base-ui-swipe-ignore
                aria-label={`Reorder ${name}`}
                className="flex size-7 shrink-0 touch-none items-center justify-center text-muted-foreground"
              >
                <GripVertical className="size-4" />
              </button>
            </SortableItemHandle>
            {compactBody}
            {removeButton}
          </li>
        </SortableItem>
      )
    }

    return (
      <li className="flex items-center gap-1 border-b border-border/50 py-1.5 opacity-70">
        <span aria-hidden className="size-7 shrink-0" />
        {compactBody}
        {removeButton}
      </li>
    )
  }

  // Default: a recents-style preview row (mirrors CatalogRow), tap to open the problem.
  return (
    <li className={cn('border-b border-border/50', isDone && 'opacity-70')}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-accent/50 active:bg-accent"
      >
        {showThumbnail && problem && (
          <div className="w-[72px] shrink-0">
            <CatalogBoard board={board} holds={problem.holds} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate text-sm font-semibold uppercase tracking-tight', isDone && 'line-through')}>
              {name}
            </span>
            {problem?.is_benchmark && (
              <BadgeCheck role="img" aria-label="Benchmark" className="size-4 shrink-0 text-benchmark" />
            )}
          </div>
          {problem && <ProblemMeta problem={problem} />}
          {sendsPill}
        </div>
        {gradePill}
      </button>
    </li>
  )
}
