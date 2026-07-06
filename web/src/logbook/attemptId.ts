// Deterministic identity for **unsent same-day attempt** ascent rows — the exact
// TS mirror of iOS `AscentSyncID` (ios/MoonBoardLED/Models/AscentSyncID.swift).
//
// The same-day attempt counter (`sent === false`) is a mergeable aggregate, not an
// immutable event: logging another attempt on the same problem/day bumps one row's
// `tries`. Two devices (or iOS + web) can create it independently, so instead of a
// random UUID we derive its id from its natural key — both compute the SAME id for
// the same (problem, day), so there is structurally only one row. This also matches
// the server's partial unique index `ascents_unsent_attempt_key`.
//
// Sends (`sent === true`) keep a random UUID — repeats are first-class events and
// must not collapse. Use crypto.randomUUID() for those.
//
// The id is a UUID **version 5** (namespaced, SHA-1), identical across platforms.

// App-specific namespace UUID — a fixed constant shared with iOS. Do NOT change it;
// changing it would fork every device's deterministic ids.
const NAMESPACE = '6F9B4C2A-1E7D-5A83-9C40-B0E2D1F3A6C7'

/** The 16 raw bytes of a canonical UUID string (hyphens ignored). */
function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

/** Format 16 bytes as a canonical lowercase UUID string. */
function bytesToUuid(b: Uint8Array): string {
  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push(b[i].toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}

/** RFC 4122 §4.3 UUIDv5: SHA-1 over (namespace bytes ++ name), first 16 bytes. */
async function uuidV5(namespace: string, name: string): Promise<string> {
  const ns = uuidBytes(namespace)
  const nameBytes = new TextEncoder().encode(name)
  const input = new Uint8Array(ns.length + nameBytes.length)
  input.set(ns, 0)
  input.set(nameBytes, ns.length)

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', input))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  return bytesToUuid(bytes)
}

/** The UTC calendar day (yyyy-MM-dd) a date falls in — the bucket the deterministic
 *  id and the server's partial unique index both key on. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Deterministic id for the unsent attempt row of `problemIdentity` on `date`.
 *
 * Deliberately excludes the user id (the row is already user-scoped by RLS and the
 * `user_id` column), so a pre-sign-in and signed-in attempt map to the same row.
 *
 * `problemIdentity` is the stable problem key — `source_catalog_id` for catalog
 * problems or the user-problem id for user problems. Never the editable name.
 */
export async function attemptId(problemIdentity: string, date: Date): Promise<string> {
  const name = `${problemIdentity}|${utcDay(date)}|unsent`
  return uuidV5(NAMESPACE, name)
}
