import { describe, expect, it } from 'vitest'
import { buildMessage, describeBleError } from './moonboard'

describe('buildMessage', () => {
  const opts = { rows: 12, flipped: false, showBeta: true }

  it('encodes in-range holds as an l#…# token string', () => {
    expect(buildMessage([{ col: 0, row: 1, type: 'start' }], opts)).toBe('l#S0#')
  })

  it('throws a readable RangeError for an out-of-range hold (surfaces, not silent)', () => {
    // A finish hold at row 18 on a 12-row Mini board used to silently mis-light.
    const holds = [{ col: 9, row: 18, type: 'end' as const }]
    expect(() => buildMessage(holds, opts)).toThrow(RangeError)
    // The message reaches the user via describeBleError → must stay readable.
    try {
      buildMessage(holds, opts)
    } catch (err) {
      expect(describeBleError(err)).toMatch(/row 18/i)
    }
  })
})

describe('describeBleError', () => {
  it('passes through a readable Error message', () => {
    expect(describeBleError(new Error('GATT Server is disconnected'))).toBe(
      'GATT Server is disconnected',
    )
  })

  it('reads .message off a non-Error object (DOMException-like)', () => {
    expect(describeBleError({ name: 'NetworkError', message: 'Write failed' })).toBe('Write failed')
  })

  it('passes through a readable string rejection', () => {
    expect(describeBleError('Bluetooth is off')).toBe('Bluetooth is off')
  })

  it('falls back for a bare numeric code (the iOS Bluefy "2" case)', () => {
    // A rejection that String()s to "2" carries no letters → unactionable.
    expect(describeBleError(2)).toContain("Couldn't reach the board")
    expect(describeBleError(new Error('2'))).toContain("Couldn't reach the board")
    expect(describeBleError({ message: 2 })).toContain("Couldn't reach the board")
  })

  it('falls back for empty/nullish rejections', () => {
    expect(describeBleError(new Error(''))).toContain("Couldn't reach the board")
    expect(describeBleError(null)).toContain("Couldn't reach the board")
    expect(describeBleError(undefined)).toContain("Couldn't reach the board")
  })
})
