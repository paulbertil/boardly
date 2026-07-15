// Build and parse session join URLs in one place, so the QR writer (ShareSession)
// and the readers (in-app scanner, paste-link fallback) can't drift on the URL shape.
// parseJoinUrl deliberately ignores origin: a QR generated on prod, a preview deploy, or
// localhost all carry the same token, and we only ever lift the token to navigate to our
// own /session/join/$token route — never to the scanned origin.

const JOIN_PATH = /^\/session\/join\/([^/]+)\/?$/

export function buildJoinUrl(token: string): string {
  return `${window.location.origin}/session/join/${token}`
}

/** Return the invite token for any URL whose path is `/session/join/:token` (origin ignored),
 *  or null for anything else — a bare token, an unrelated path, or non-URL garbage like a
 *  Wi-Fi QR payload. Tolerates surrounding whitespace and a trailing slash. */
export function parseJoinUrl(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  const match = JOIN_PATH.exec(url.pathname)
  return match ? match[1] : null
}
