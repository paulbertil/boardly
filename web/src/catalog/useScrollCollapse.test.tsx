import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScrollCollapse } from './useScrollCollapse'

// jsdom only ships requestAnimationFrame with pretendToBeVisual; the hook throttles
// its scroll handler through it, so polyfill deterministically when absent.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

// Host mounts the hook with an anchor inside a `.app-scroll` scroller — the same
// structure AppLayout provides (mirrors usePullToRefresh.test.tsx).
function Host() {
  const ref = useRef<HTMLDivElement>(null)
  const { collapsed, expand } = useScrollCollapse(ref)
  return (
    <div className="app-scroll">
      <div ref={ref} data-testid="anchor" data-collapsed={String(collapsed)}>
        <button data-testid="expand" onClick={expand} />
      </div>
    </div>
  )
}

function scrollerOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.app-scroll') as HTMLElement
  // A long list by default: plenty of scroll range so the short-list guard passes.
  Object.defineProperty(el, 'scrollHeight', { value: 3000, configurable: true, writable: true })
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true, writable: true })
  return el
}

async function scrollTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top
  await act(async () => {
    scroller.dispatchEvent(new Event('scroll'))
    // The hook measures on the next animation frame; queue behind it.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  })
}

function wheel(deltaY: number): Event {
  const e = new Event('wheel', { bubbles: true })
  Object.defineProperty(e, 'deltaY', { value: deltaY })
  return e
}

const collapsed = () => screen.getByTestId('anchor').dataset.collapsed

describe('useScrollCollapse', () => {
  let nowSpy: ReturnType<typeof vi.spyOn> | undefined
  beforeEach(() => {
    nowSpy = undefined
  })
  afterEach(() => {
    nowSpy?.mockRestore()
  })

  it('collapses past the collapse threshold and stays collapsed inside the hysteresis band', async () => {
    const { container } = render(<Host />)
    const scroller = scrollerOf(container)

    expect(collapsed()).toBe('false')
    await scrollTo(scroller, 200)
    expect(collapsed()).toBe('true')

    // Inside the dead band (16 < top < 120): holds the collapsed state.
    await scrollTo(scroller, 60)
    expect(collapsed()).toBe('true')

    // Back near the top: re-expands.
    await scrollTo(scroller, 10)
    expect(collapsed()).toBe('false')

    // And below the collapse threshold from expanded: stays expanded.
    await scrollTo(scroller, 60)
    expect(collapsed()).toBe('false')
  })

  it('never collapses a barely-scrollable list (short-list guard)', async () => {
    const { container } = render(<Host />)
    const scroller = scrollerOf(container)
    // Scroll range of 150px — more than COLLAPSE_AT but less than the fold budget.
    Object.defineProperty(scroller, 'scrollHeight', { value: 750, configurable: true })

    await scrollTo(scroller, 140)
    expect(collapsed()).toBe('false')
  })

  it('expand() pins the bar open; position changes alone never re-collapse it', async () => {
    const { container } = render(<Host />)
    const scroller = scrollerOf(container)

    await scrollTo(scroller, 300)
    expect(collapsed()).toBe('true')

    act(() => {
      screen.getByTestId('expand').click()
    })
    expect(collapsed()).toBe('false')

    // Scroll-anchoring style scrollTop shift: ignored while manually expanded.
    await scrollTo(scroller, 500)
    expect(collapsed()).toBe('false')
  })

  it('a wheel gesture after the grace window re-collapses a tap-expanded bar; momentum inside the grace does not', async () => {
    let now = 0
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)

    const { container } = render(<Host />)
    const scroller = scrollerOf(container)

    await scrollTo(scroller, 300)
    act(() => {
      screen.getByTestId('expand').click()
    })
    expect(collapsed()).toBe('false')

    // Momentum tail right after the tap (inside the grace window): ignored.
    now = 100
    await act(async () => {
      scroller.dispatchEvent(wheel(120))
    })
    expect(collapsed()).toBe('false')

    // A real wheel gesture past the grace window clears the pin → collapsed again.
    now = 2000
    await act(async () => {
      scroller.dispatchEvent(wheel(30))
    })
    expect(collapsed()).toBe('true')
  })

  it('a touch drag past the grace window re-collapses a tap-expanded bar', async () => {
    let now = 0
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now)

    const { container } = render(<Host />)
    const scroller = scrollerOf(container)

    await scrollTo(scroller, 300)
    act(() => {
      screen.getByTestId('expand').click()
    })
    expect(collapsed()).toBe('false')

    now = 2000
    await act(async () => {
      scroller.dispatchEvent(new Event('touchmove', { bubbles: true }))
    })
    expect(collapsed()).toBe('true')
  })
})
