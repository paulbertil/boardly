// Swipe-left-to-queue on a catalog row (U7): a thin wrapper over the generic useSwipeAction
// gesture (see there for the touch mechanics and the tap/scroll/swipe disambiguation). This one
// binds the action to `addProblem` + its toasts. The row renders the "Queue" reveal beside itself
// in a translated flex track (see CatalogRow), driven by the returned `offset`.

import { type RefObject } from 'react'
import { addProblem } from '../sessions/queueStore'
import { queueToastError } from '../sessions/queueToast'
import {
  resolveSwipeAxis,
  shouldFireSwipe,
  SWIPE_AXIS_LOCK,
  SWIPE_MAX_REVEAL,
  SWIPE_TRIGGER,
  useSwipeAction,
  type SwipeActionState,
  type SwipeAxis,
} from './useSwipeAction'

// Re-exported so existing callers/tests keep importing the gesture constants + helpers from here.
export {
  resolveSwipeAxis,
  SWIPE_AXIS_LOCK,
  SWIPE_MAX_REVEAL,
  SWIPE_TRIGGER,
  type SwipeActionState as SwipeToQueueState,
  type SwipeAxis,
}

/** A queue-add fires only for a horizontal-dominant, leftward gesture past the trigger. */
export const shouldQueueSwipe = shouldFireSwipe

export interface SwipeToQueueOptions {
  sourceCatalogId: string
  boardLayoutId: number
  /** Active only when there is an active session on this board. */
  enabled: boolean
}

/** Bind swipe-left-to-queue to `rowRef`. Fires `addProblem` on a leftward release past the trigger. */
export function useSwipeToQueue(
  rowRef: RefObject<HTMLElement | null>,
  opts: SwipeToQueueOptions,
): SwipeActionState {
  return useSwipeAction(rowRef, {
    enabled: opts.enabled,
    // No success toast: the row's in-queue marker (and the drawer count) confirm the add, so a
    // toast would be redundant — only a failure needs surfacing. Return the write promise (don't
    // fire-and-forget) so useSwipeAction holds its busy guard for the whole round-trip — otherwise
    // a second swipe during the in-flight add double-inserts and the confirm affordance never shows.
    onTrigger: () =>
      addProblem(opts.sourceCatalogId, opts.boardLayoutId)
        .then(() => {})
        .catch(() => {
          queueToastError('Couldn’t add to the queue — check your connection')
        }),
  })
}
