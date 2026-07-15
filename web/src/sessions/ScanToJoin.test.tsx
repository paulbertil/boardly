import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  ensureDecoder: vi.fn(() => Promise.resolve<unknown>(undefined)),
  onScanRef: { current: null as null | ((codes: { rawValue: string }[]) => void) },
  onErrorRef: { current: null as null | (() => void) },
  onOpenChange: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, useNavigate: () => h.navigate }
})

// The lazy decoder chunk is mocked so tests never touch getUserMedia or the WASM. The fake Scanner
// captures its onScan/onError props so tests can drive a decode or a camera failure.
vi.mock('./qrDecoder', () => ({
  default: (props: { onScan: (c: { rawValue: string }[]) => void; onError: () => void }) => {
    h.onScanRef.current = props.onScan
    h.onErrorRef.current = props.onError
    return <div data-testid="fake-scanner" />
  },
  ensureDecoder: () => h.ensureDecoder(),
}))

// Lightweight drawer stand-in. It keeps content mounted regardless of `open` — mirroring base-ui,
// which holds the popup through its ~450ms close animation. That's deliberate: the component must
// not flash the fallback branch while closing, and a mock that unmounted on close would hide it.
vi.mock('@/components/ui/drawer', () => {
  type Kids = { children?: React.ReactNode }
  return {
    Drawer: ({ children }: Kids) => <div>{children}</div>,
    DrawerContent: ({ children }: Kids) => <div>{children}</div>,
    DrawerHeader: ({ children }: Kids) => <div>{children}</div>,
    DrawerTitle: ({ children }: Kids) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: Kids) => <p>{children}</p>,
  }
})

import { ScanToJoin } from './ScanToJoin'

function Harness({ initialOpen = true }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <ScanToJoin
      open={open}
      onOpenChange={(o) => {
        h.onOpenChange(o)
        setOpen(o)
      }}
    />
  )
}

const JOIN_URL = 'https://boardhang.app/session/join/tok-xyz'

beforeEach(() => {
  h.navigate.mockClear()
  h.ensureDecoder.mockReset().mockResolvedValue(undefined)
  h.onOpenChange.mockClear()
  h.onScanRef.current = null
  h.onErrorRef.current = null
})
afterEach(() => vi.restoreAllMocks())

describe('ScanToJoin', () => {
  it('navigates to the join route and closes the drawer on a valid scanned QR', async () => {
    render(<Harness />)
    await screen.findByTestId('fake-scanner')

    act(() => h.onScanRef.current?.([{ rawValue: JOIN_URL }]))

    expect(h.navigate).toHaveBeenCalledWith({
      to: '/session/join/$token',
      params: { token: 'tok-xyz' },
    })
    expect(h.onOpenChange).toHaveBeenCalledWith(false)
    // drawer closed → scanner torn down
    expect(screen.queryByTestId('fake-scanner')).not.toBeInTheDocument()
    // ...and the fallback card must NOT flash while the drawer animates out
    expect(screen.queryByText(/camera unavailable/i)).not.toBeInTheDocument()
  })

  it('keeps scanning and shows a transient hint for a non-session QR', async () => {
    render(<Harness />)
    await screen.findByTestId('fake-scanner')

    act(() => h.onScanRef.current?.([{ rawValue: 'WIFI:S:Gym;T:WPA;P:secret;;' }]))

    expect(screen.getByText('Not a session code')).toBeInTheDocument()
    expect(h.navigate).not.toHaveBeenCalled()
    // still scanning
    expect(screen.getByTestId('fake-scanner')).toBeInTheDocument()
  })

  it('navigates when a valid link is pasted in the fallback', async () => {
    render(<Harness />)
    await screen.findByTestId('fake-scanner')
    fireEvent.click(screen.getByRole('button', { name: /enter the link instead/i }))

    fireEvent.change(screen.getByLabelText('Session link'), { target: { value: `  ${JOIN_URL} ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(h.navigate).toHaveBeenCalledWith({
      to: '/session/join/$token',
      params: { token: 'tok-xyz' },
    })
  })

  it('shows an inline hint for an invalid pasted value, without navigating', async () => {
    render(<Harness />)
    await screen.findByTestId('fake-scanner')
    fireEvent.click(screen.getByRole('button', { name: /enter the link instead/i }))

    fireEvent.change(screen.getByLabelText('Session link'), { target: { value: 'not-a-link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))

    expect(screen.getByText('Not a session code')).toBeInTheDocument()
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('falls back to paste when the decoder chunk/WASM fails to load (offline)', async () => {
    h.ensureDecoder.mockRejectedValue(new Error('offline'))
    render(<Harness />)

    expect(await screen.findByLabelText('Session link')).toBeInTheDocument()
    expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument()
    expect(screen.queryByTestId('fake-scanner')).not.toBeInTheDocument()
  })

  it('falls back to paste when the camera reports an error mid-scan', async () => {
    render(<Harness />)
    await screen.findByTestId('fake-scanner')

    act(() => h.onErrorRef.current?.())

    expect(await screen.findByLabelText('Session link')).toBeInTheDocument()
  })

  it('recovers the scanner on retry after a first failed load', async () => {
    h.ensureDecoder.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    render(<Harness />)

    // first load failed → fallback
    await screen.findByLabelText('Session link')
    fireEvent.click(screen.getByRole('button', { name: /try camera/i }))

    // fresh load succeeds (proves a per-attempt loader, not a memoized rejection)
    await waitFor(() => expect(screen.getByTestId('fake-scanner')).toBeInTheDocument())
  })
})
