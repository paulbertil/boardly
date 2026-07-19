// Queue toasts surface at the TOP of the screen, not the app-default bottom. Queue actions
// originate up top (the session bar; the problem-detail header) while the bottom edge is where the
// nav + FAB controls sit — so a bottom toast covers exactly what the user reaches for next. This
// mirrors the pull-to-refresh top-center override (same "the gesture starts at the top" rationale).
// Centralised so every queue surface (swipe-to-queue, the detail add/remove, the drawer) stays
// consistent and can't drift.

import { toast } from 'sonner'

type ToastOptions = Parameters<typeof toast>[1]

/** Shown on any failed queue write — the store has already rolled the optimistic change back. */
export const QUEUE_WRITE_ERROR = "Couldn't update the queue — check your connection"

const QUEUE_TOAST: ToastOptions = { position: 'top-center' }

/** A queue confirmation toast (top-center). Extra options (e.g. an Undo action) merge over it. */
export function queueToast(message: string, opts?: ToastOptions) {
  return toast(message, { ...QUEUE_TOAST, ...opts })
}

/** A queue error toast (top-center). */
export function queueToastError(message: string, opts?: ToastOptions) {
  return toast.error(message, { ...QUEUE_TOAST, ...opts })
}
