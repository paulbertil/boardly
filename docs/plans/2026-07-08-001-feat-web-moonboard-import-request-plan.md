---
title: "feat: Guided MoonBoard logbook import (GDPR data-request flow)"
date: 2026-07-08
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
depth: lightweight
---

# feat: Guided MoonBoard logbook import (GDPR data-request flow)

## Summary

Add an **"Import from MoonBoard"** feature to the web app that guides a user to obtain
their own MoonBoard logbook the only viable way — a **UK GDPR Article 15/20 data
request** to Moon Climbing — instead of a direct API import, which is impossible
(the official app is locked behind Firebase App Check / Play Integrity + cert pinning +
PairIP; see memory `moonboard-logbook-import-investigation`).

This plan covers **steps 1–2 only**: an explainer + a prefilled-`mailto:` generator.
The user types their MoonBoard account email/username into a small form; we build a
fully-populated email draft addressed to `moonboardsupport@moonclimbing.com`. **Step 3
(parsing the returned CSV/JSON into `public.ascents` and resolving problems to
`source_catalog_id`) is explicitly deferred** to a follow-up plan built against a real
sample file — see Scope Boundaries.

---

## Problem Frame

MoonBoard's official app is the only source of a user's logbook, and its API cannot be
called by anything other than the genuine, Google-attested app. A technical "connect
your MoonBoard account and import" feature is therefore not buildable. But the data is
the user's own, and Moon Climbing (a UK company) is legally obliged under UK GDPR to
provide it in a machine-readable format on request.

The product move is to **stop pretending an API import is possible** and instead make
the legitimate path frictionless: explain why, then generate the request email in one
tap. This also seeds the eventual upload/ingest feature (step 3) with a natural home.

---

## Requirements

- **R1** — A dedicated, deep-linkable screen at `/logbook/import` explains, briefly and
  honestly, that MoonBoard locks its API and that a GDPR request is the way to get your
  own logbook, with a realistic expectation (up to one month; returns CSV/JSON).
- **R2** — The screen has a form: a required **MoonBoard account email** field and an
  optional **username** field.
- **R3** — A primary action builds a `mailto:` link to `moonboardsupport@moonclimbing.com`
  with the GDPR subject and body prefilled from the form values, and opens the user's
  mail client.
- **R4** — A robust fallback: the fully-rendered email text (recipient + subject + body)
  is available to **copy to clipboard**, for environments with no `mailto:` handler.
- **R5** — An **"Import from MoonBoard"** affordance on the Logbook screen navigates to
  `/logbook/import`, shown at least in the logbook empty states (where an
  ascent-less user would look for how to get their history in).
- **R6** — The email template content mirrors the canonical text in
  `moonboard-data-request.md` (repo root): UK GDPR Art. 15 + Art. 20, requests the full
  logbook with the named per-entry fields, insists on CSV/JSON, notes the one-month
  free-of-charge deadline.

---

## Key Technical Decisions

- **KTD1 — Pure email-building logic lives in a standalone module** (`moonboardImport.ts`)
  with no React, so the template + `mailto:` assembly are unit-testable in isolation and
  the screen stays a thin view. Mirrors the repo's existing split (e.g. `attemptId.ts`,
  `sessions.ts` are pure logic beside their screens).
- **KTD2 — Dedicated route, not inline.** `/logbook/import` is registered as a sibling
  route in the code-based tree in `router.tsx` (the app has no file-route codegen). Keeps
  `LogbookScreen` uncluttered and gives step-3's uploader a home. No auth gate — the
  explainer is useful signed-out.
- **KTD3 — `mailto:` with a copy fallback, not a backend send.** We never transmit the
  email ourselves (no server, no access to the user's mail identity). We hand off to the
  user's mail client; the copy affordance covers desktops/PWAs with no `mailto:` handler.
- **KTD4 — Template as a single source string with typed interpolation.** One template
  constant, filled via a `buildGdprEmail({ email, username })` function returning
  `{ subject, body, recipient, mailtoHref }`. The screen renders from that one result for
  both the mailto and the copy path, so they can never drift.
- **KTD5 — shadcn components only** (`Button`, `Input`, `Label`) per `web/CLAUDE.md`; no
  hand-rolled form controls. Inputs follow the repo's `text-base md:text-sm` idiom to
  avoid iOS zoom-on-focus (memory `web-input-font-size-idiom`).

---

## Implementation Units

### U1. Email-building module (pure logic)

**Goal:** A React-free module that owns the GDPR email template and assembles a
prefilled draft from user input.

**Requirements:** R3, R4, R6.

**Dependencies:** none.

**Files:**
- `web/src/logbook/moonboardImport.ts` (new)
- `web/src/logbook/moonboardImport.test.ts` (new)

**Approach:**
- Export a `RECIPIENT` constant (`moonboardsupport@moonclimbing.com`) and a
  `buildGdprEmail(input: { email: string; username?: string })` function returning
  `{ recipient, subject, body, mailtoHref }`.
- `subject` includes the account email (mirrors the template's subject line). `body`
  is the Art. 15/20 request text with the named per-entry fields, CSV/JSON insistence,
  and the one-month note; interpolate email + username (omit the username clause cleanly
  when absent — no dangling "username: ").
- `mailtoHref` = `mailto:<recipient>?subject=<enc>&body=<enc>` using
  `encodeURIComponent`. Keep the body as `\n`-joined lines (mail clients render CRLF/LF
  fine); do not HTML-encode.
- Keep the template text as one module-level string/const so U2 can also render it for
  the copy path via the same `body`.

**Patterns to follow:** pure-logic-beside-screen modules `web/src/logbook/attemptId.ts`,
`web/src/logbook/sessions.ts`.

**Test scenarios:**
- Happy path: `buildGdprEmail({ email, username })` → `recipient` equals the constant;
  `subject` and `body` contain the email; `body` contains the username.
- Edge: omitted/empty `username` → `body` is still valid prose with no leftover label or
  placeholder token, and no `undefined`/`[...]` fragments.
- `mailtoHref` begins with `mailto:moonboardsupport@moonclimbing.com?`, contains
  `subject=` and `body=`, and round-trips: `decodeURIComponent` of the body param equals
  `body`.
- Encoding: an email containing `+` (e.g. `me+moon@x.com`) and body newlines/ampersands
  are percent-encoded such that the href has no raw spaces or unencoded `&` inside the
  values.
- Template fidelity: `body` mentions "Article 15", "Article 20", "CSV or JSON", and "one
  calendar month" (guards against silent template drift from R6).

---

### U2. Import screen + route

**Goal:** The `/logbook/import` screen: explainer, input form, open-mail action, and
copy fallback.

**Requirements:** R1, R2, R3, R4.

**Dependencies:** U1.

**Files:**
- `web/src/logbook/ImportFromMoonBoardScreen.tsx` (new)
- `web/src/logbook/ImportFromMoonBoardScreen.test.tsx` (new)
- `web/src/router.tsx` (add `/logbook/import` route + update the route-map header comment)

**Approach:**
- Register a sibling route `path: '/logbook/import'`, `component: ImportFromMoonBoardScreen`,
  added to `rootRoute.addChildren([...])`. No `validateSearch` needed. Add it to the
  header comment's route list.
- Screen layout (shadcn + Tailwind tokens): a back-affordance/header ("Import from
  MoonBoard"), a short explainer section (why direct import isn't possible; GDPR is the
  route; expect up to a month; you'll get CSV/JSON), then the form.
- Form: `Input` for MoonBoard account email (required, `type="email"`), optional `Input`
  for username, with `Label`s. Local `useState` for both. Follow the
  `text-base md:text-sm` input idiom.
- Primary `Button` "Open email request": disabled until the email field is non-empty and
  loosely valid; on click, compute `buildGdprEmail(...)` and set
  `window.location.href = result.mailtoHref` (standard PWA mailto handoff).
- Secondary `Button` (variant `outline`/`ghost`) "Copy email text": writes a plain-text
  rendering (`To: <recipient>\nSubject: <subject>\n\n<body>`) via
  `navigator.clipboard.writeText`, with a transient "Copied" confirmation. Also render
  the `recipient` visibly so a user can always send manually.
- Deferred-step note: a small, honest line that once Moon sends the file back, importing
  it into the app is coming — do **not** build an uploader here (see Scope Boundaries).

**Patterns to follow:** screen composition + empty/section cards in
`web/src/logbook/LogbookScreen.tsx`; shadcn usage rules in `web/CLAUDE.md`; route
registration in `web/src/router.tsx`.

**Execution note:** if `Input`/`Label` aren't already in `src/components/ui/`, add them
with `npx shadcn@latest add input label` before composing — do not hand-roll.

**Test scenarios:**
- Renders the explainer heading and the recipient address `moonboardsupport@moonclimbing.com`.
- Primary button is disabled with an empty email field and enabled once a valid-looking
  email is typed.
- Typing an email then clicking "Open email request" sets `window.location.href` to a
  `mailto:` string that includes the typed email (assert via a stubbed
  `window.location`/`href` setter or `jsdom` navigation spy).
- "Copy email text" calls `navigator.clipboard.writeText` (mocked) with text containing
  the recipient, the subject, and the GDPR body; shows the "Copied" confirmation.
- Optional username field: leaving it blank still produces a valid draft (no placeholder
  leakage) — integration with U1's omitted-username path.

---

### U3. Logbook entry affordance

**Goal:** A discoverable way into `/logbook/import` from the Logbook screen.

**Requirements:** R5.

**Dependencies:** U2 (route must exist to navigate to).

**Files:**
- `web/src/logbook/LogbookScreen.tsx` (modify)
- `web/src/logbook/LogbookScreen.test.tsx` (modify)

**Approach:**
- Add an "Import from MoonBoard" `Button` that navigates via the screen's existing
  `navigate({ to: '/logbook/import' })` (route-typed nav is already in use here).
- Placement: the **empty states** are the priority surface — a user with no ascents on
  this board ("No logged ascents yet" and "No ascents on {board}") is exactly who wants
  to import history. Add the button as the `action` of those `EmptyState`s. Optionally
  add a low-emphasis link in the populated view's header area; keep it secondary so it
  doesn't compete with logging.
- Do not alter the signed-out gate's primary sign-in call to action; if included there,
  keep it clearly secondary.

**Patterns to follow:** existing `EmptyState` `action` usage in the same file (the "Add a
board" button pattern at the `!activeBoardAdded` branch).

**Test scenarios:**
- In the "No logged ascents yet" empty state, an "Import from MoonBoard" control is
  present and navigates to `/logbook/import` when activated (assert with the router test
  harness `web/src/test/renderWithRouter.tsx`).
- The affordance does not appear as a primary action that would obscure the normal
  logging flow in the populated logbook (guards against over-prominence) — assert it's
  absent or secondary in the populated render.

---

## Scope Boundaries

**In scope:** the explainer screen, the input-driven prefilled `mailto:` generator with
copy fallback, and the Logbook entry point (steps 1–2).

### Deferred to Follow-Up Work
- **Step 3 — ingest the returned data.** Parsing Moon's CSV/JSON export, mapping fields
  onto `public.ascents` (name/grade snapshot, `sent`, tries, stars, comment, date), and
  resolving each MoonBoard problem to a `catalog_problems.source_catalog_id`. Blocked on
  having a **real sample file** — building the parser blind would be guesswork. A separate
  plan owns this once a GDPR response arrives. The U2 screen leaves a natural seam (a
  place to add an uploader) but implements none of it.

### Non-goals
- Any direct MoonBoard API/account integration or credential handling (impossible /
  out of the app's identity — see memory `moonboard-logbook-import-investigation`).
- Sending the email server-side or storing the user's MoonBoard email.
- iOS parity — this is a `web/`-only feature for now.

---

## Risks & Dependencies

- **`mailto:` with a long body may be truncated or rejected** by some mail clients
  (practical limits vary; the GDPR body is ~1 KB, generally safe, but not guaranteed).
  *Mitigation:* the copy-to-clipboard fallback (R4) always yields the complete text, and
  the recipient is shown on-screen for fully manual sending.
- **`navigator.clipboard` needs a secure context** (HTTPS/localhost). The app is served
  over HTTPS on Vercel, so this holds in production; guard the call and degrade to
  selectable text if the API is unavailable.
- **Template drift** between `moonboardImport.ts` and the repo-root
  `moonboard-data-request.md`. *Mitigation:* U1's template-fidelity test asserts the key
  legal phrases; treat the module as the runtime source of truth and the md file as the
  human reference.

---

## Verification

- `web/` typecheck + tests pass; new unit/component tests from U1–U3 green.
- Manual: visit `/logbook/import`, type an email, click "Open email request" → mail
  client opens with recipient/subject/body populated; "Copy email text" copies the full
  message; the Logbook empty state links here.

## Definition of Done

- R1–R6 satisfied; U1–U3 landed with their test scenarios.
- Step 3 remains explicitly deferred and unbuilt.
- No new hand-rolled UI (shadcn per `web/CLAUDE.md`); inputs use the iOS-safe font idiom.
- Built on a separate git worktree/branch (per user request), not on `main`.
