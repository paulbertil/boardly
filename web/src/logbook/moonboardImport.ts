// The official MoonBoard app locks its API behind Firebase App Check / Play Integrity +
// cert pinning + PairIP, so there is no way to import a user's logbook programmatically.
// The legitimate route to your own data is a UK GDPR Article 15/20 request to Moon
// Climbing. This module owns that request email — the canonical wording lives here (the
// repo-root `moonboard-data-request.md` is the human-readable reference copy); the screen
// renders from `buildGdprEmail` so the mailto: draft and the copy-to-clipboard text can
// never drift apart.

/** Moon Climbing's support inbox — where a data request is sent. */
export const RECIPIENT = 'moonboardsupport@moonclimbing.com'

export interface GdprEmailInput {
  /** The user's MoonBoard *account* email — a separate service from this app, so it must
   *  be entered by hand; we can't derive it. */
  email: string
  /** Optional MoonBoard username; helps Moon locate the account. */
  username?: string
}

export interface GdprEmail {
  recipient: string
  subject: string
  body: string
  /** `mailto:` href with subject + body percent-encoded, ready to assign to
   *  `window.location.href` to open the user's mail client with the draft prefilled. */
  mailtoHref: string
}

/** Assemble the GDPR data-request email from the user's MoonBoard identity.
 *  The wording is a UK GDPR Article 15 (access) + Article 20 (portability) request; Art.
 *  20 is what compels a machine-readable CSV/JSON export rather than a PDF. */
export function buildGdprEmail(input: GdprEmailInput): GdprEmail {
  const email = input.email.trim()
  const username = input.username?.trim()

  // Identify the account: always the email, and the username too when supplied. Built as
  // one clause so an omitted username leaves no dangling "username:" fragment.
  const identity = username
    ? `account email: ${email}, username: ${username}`
    : `account email: ${email}`

  const subject = `Data Subject Access & Data Portability Request — ${email}`

  const body = [
    'Hello,',
    '',
    `I am a MoonBoard app user (${identity}). Under the UK GDPR, I am exercising:`,
    '',
    '1. My right of access (Article 15), and',
    '2. My right to data portability (Article 20).',
    '',
    'Please provide all personal data you hold associated with my account, and in ' +
      'particular my complete MoonBoard logbook — every logged ascent and attempt. For ' +
      'each entry, please include:',
    '',
    '- the problem name and setter',
    '- the board configuration / hold-set version (e.g. 2016, 2017, 2019, 2024, or Mini) ' +
      'and the angle (25° or 40°)',
    '- the official grade and my own logged/suggested grade',
    '- the date and time I logged it, including the time zone',
    '- the number of attempts, and whether it was a completed ascent or just an attempt',
    '- any star rating and comment I left',
    '',
    'Where you hold it, please also include, for each entry, the problem’s unique ' +
      'identifier as stored against my account and the problem’s hold/move layout — this ' +
      'helps me identify exactly which problem each entry refers to.',
    '',
    'Please provide this in a structured, commonly used, machine-readable format (CSV ' +
      'or JSON) as required by Article 20, rather than screenshots or PDF.',
    '',
    'I understand you must respond within one calendar month and that this request is ' +
      'free of charge. If you need to verify my identity, let me know what you require.',
    '',
    'Thank you,',
  ].join('\n')

  const mailtoHref =
    `mailto:${RECIPIENT}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`

  return { recipient: RECIPIENT, subject, body, mailtoHref }
}

/** Plain-text rendering for the copy-to-clipboard fallback (environments with no
 *  `mailto:` handler): recipient + subject + body as one block the user can paste. */
export function renderGdprEmailText(email: GdprEmail): string {
  return `To: ${email.recipient}\nSubject: ${email.subject}\n\n${email.body}`
}
