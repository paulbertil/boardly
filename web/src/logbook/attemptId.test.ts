import { describe, expect, it } from 'vitest'
import { attemptId, utcDay } from './attemptId'

describe('utcDay', () => {
  it('buckets by UTC calendar day', () => {
    expect(utcDay(new Date('2026-07-04T23:30:00Z'))).toBe('2026-07-04')
    // 00:30 UTC on the 5th is a different bucket even if local time is the 4th.
    expect(utcDay(new Date('2026-07-05T00:30:00Z'))).toBe('2026-07-05')
  })
})

describe('attemptId', () => {
  // Golden vector, cross-checked against an independent UUIDv5 implementation. This is
  // the load-bearing cross-platform contract: iOS `AscentSyncID.attemptID` MUST produce
  // the same id for the same (problem, UTC day) so the two clients converge on one row.
  it('matches the fixed golden vector', async () => {
    const id = await attemptId('abc123', new Date('2026-07-04T12:00:00Z'))
    expect(id).toBe('baeadcdc-9923-546e-aa18-6a9a97aa63c1')
  })

  it('is a valid RFC 4122 v5 UUID', async () => {
    const id = await attemptId('abc123', new Date('2026-07-04T12:00:00Z'))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('is deterministic for the same problem + UTC day', async () => {
    const a = await attemptId('abc123', new Date('2026-07-04T08:00:00Z'))
    const b = await attemptId('abc123', new Date('2026-07-04T20:00:00Z'))
    expect(a).toBe(b)
  })

  it('differs by problem and by day', async () => {
    const base = await attemptId('abc123', new Date('2026-07-04T12:00:00Z'))
    const otherProblem = await attemptId('xyz789', new Date('2026-07-04T12:00:00Z'))
    const otherDay = await attemptId('abc123', new Date('2026-07-05T12:00:00Z'))
    expect(otherProblem).not.toBe(base)
    expect(otherDay).not.toBe(base)
  })
})
