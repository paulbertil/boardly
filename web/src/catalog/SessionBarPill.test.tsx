import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogBoardDef } from '../board/boards'
import { SessionBarPill } from './SessionBarPill'

// The queue drawer drags in stores/drawer plumbing irrelevant to the pill's own
// behavior under test (tap vs drag, persistence, fallbacks).
vi.mock('../sessions/QueueDrawer', () => ({
  QueueDrawer: () => <button aria-label="Queue" />,
}))

// jsdom has no pointer capture.
beforeEach(() => {
  localStorage.clear()
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {}
  }
})

const board = { layoutId: 1, name: 'Test Board' } as CatalogBoardDef

function renderPill(overrides: Partial<Parameters<typeof SessionBarPill>[0]> = {}) {
  const onExpand = vi.fn()
  const onShare = vi.fn()
  const onOpenProblem = vi.fn()
  const utils = render(
    <SessionBarPill
      board={board}
      sessionName="Mini · Jul 22"
      rosterCount={3}
      litProblemId="p1"
      litProblem={{ id: 'p1', name: 'Carafes', grade: '6A+' } as never}
      onExpand={onExpand}
      onShare={onShare}
      onOpenProblem={onOpenProblem}
      {...overrides}
    />,
  )
  const mainButton = (
    overrides.litProblemId === null
      ? // Unlit: the text area shows the session name (the chevron shares its aria-label).
        (screen.getByText('Mini · Jul 22').closest('button') as HTMLElement)
      : screen.getByRole('button', { name: 'Open the problem that’s on the wall' })
  ) as HTMLElement
  // The drag handlers live on the pill container — the main button's parent.
  const pill = mainButton.parentElement as HTMLElement
  return { ...utils, pill, mainButton, onExpand, onShare, onOpenProblem }
}

// jsdom lacks a constructable PointerEvent (and fireEvent's fallback drops isPrimary);
// fake one carrying just what the drag hook reads — mirrors usePullToRefresh.test.tsx.
function pointer(
  type: string,
  props: { clientX: number; clientY: number; buttons: number; pointerId?: number; isPrimary?: boolean },
): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { isPrimary: true, pointerId: 1, ...props })
  return e
}
const down = (el: HTMLElement, x: number, y: number) =>
  fireEvent(el, pointer('pointerdown', { clientX: x, clientY: y, buttons: 1 }))
const move = (el: HTMLElement, x: number, y: number, buttons = 1) =>
  fireEvent(el, pointer('pointermove', { clientX: x, clientY: y, buttons }))
const up = (el: HTMLElement, x: number, y: number) =>
  fireEvent(el, pointer('pointerup', { clientX: x, clientY: y, buttons: 0 }))

describe('SessionBarPill', () => {
  it('opens the lit problem on tap', () => {
    const { mainButton, onOpenProblem } = renderPill()
    fireEvent.click(mainButton)
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
  })

  it('expands on tap when nothing is lit', () => {
    const { mainButton, onExpand } = renderPill({ litProblemId: null, litProblem: null })
    fireEvent.click(mainButton)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('a sub-threshold wiggle still counts as a tap', () => {
    const { pill, mainButton, onOpenProblem } = renderPill()
    down(pill, 0, 0)
    move(pill, 3, 3)
    up(pill, 3, 3)
    fireEvent.click(mainButton)
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
  })

  it('a real drag moves the pill, persists the spot, and swallows only the trailing click', () => {
    const { pill, mainButton, onOpenProblem } = renderPill()
    down(pill, 0, 0)
    move(pill, 25, 25)

    // Live path: the gesture rides a compositor transform with the blur suspended —
    // NOT React state — so assert the imperative styles mid-drag...
    expect(pill.style.transform).toMatch(/translate3d/)
    expect(pill.style.willChange).toBe('transform')
    expect(pill.style.backdropFilter).toBe('none')

    up(pill, 25, 25)

    // ...and that release clears every gesture-scoped style before committing.
    expect(pill.style.transform).toBe('')
    expect(pill.style.willChange).toBe('')
    expect(pill.style.backdropFilter).toBe('')
    expect(pill.style.left).not.toBe('')
    const stored = localStorage.getItem('boardhang.sessionPillPos.v2')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored as string)).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })

    // The click that follows the drop is swallowed...
    fireEvent.click(mainButton)
    expect(onOpenProblem).not.toHaveBeenCalled()
    // ...but the NEXT tap works.
    fireEvent.click(mainButton)
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
  })

  it('a touch drag (no trailing click) does not swallow the next tap', () => {
    const { pill, mainButton, onOpenProblem } = renderPill()
    // Touch drags beyond the slop fire no click at all — the flag must not latch.
    down(pill, 0, 0)
    move(pill, 30, 0)
    up(pill, 30, 0)

    // Next interaction is a clean tap: pointerdown resets the stale flag.
    down(pill, 30, 0)
    up(pill, 30, 0)
    fireEvent.click(mainButton)
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
  })

  it('a second finger can neither hijack nor end the primary drag', () => {
    const { pill } = renderPill()
    down(pill, 0, 0) // finger A (pointerId 1)

    // Finger B (pointerId 2) moves far — must not activate A's gesture with B's coords.
    fireEvent(pill, pointer('pointermove', { clientX: 60, clientY: 60, buttons: 1, pointerId: 2, isPrimary: false }))
    expect(pill.style.transform).toBe('')

    move(pill, 25, 25) // finger A activates for real
    expect(pill.style.transform).toMatch(/translate3d/)

    // B's release must not end (and half-clean) A's gesture...
    fireEvent(pill, pointer('pointerup', { clientX: 60, clientY: 60, buttons: 0, pointerId: 2, isPrimary: false }))
    expect(pill.style.transform).toMatch(/translate3d/)

    // ...only A's release does, restoring styles and committing.
    up(pill, 25, 25)
    expect(pill.style.transform).toBe('')
    expect(pill.style.willChange).toBe('')
    expect(localStorage.getItem('boardhang.sessionPillPos.v2')).not.toBeNull()
  })

  it('a button-less hover move after an aborted press never starts a drag', () => {
    const { pill, mainButton, onOpenProblem } = renderPill()
    // Press, wiggle under the threshold, and release OFF the pill (no pointerup here).
    down(pill, 0, 0)
    move(pill, 3, 0)
    // Later the bare cursor crosses the pill: buttons === 0 → the dead gesture is dropped.
    move(pill, 100, 100, 0)
    move(pill, 150, 150, 0)

    expect(pill.style.left).toBe('')
    fireEvent.click(mainButton)
    expect(onOpenProblem).toHaveBeenCalledWith('p1')
  })
})
