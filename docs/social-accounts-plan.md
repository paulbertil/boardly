# User accounts & login — foundation for social features

> **Saved plan — start a fresh session and say "implement docs/social-accounts-plan.md" to begin.**
> **Scope: login + user profile only.** The friends system, cloud logbook sync, and shared
> session lists are the *north star* below but are **deferred to follow-on plans** — build the
> login layer so it doesn't box those in.

## Context

The MoonBoard LED app is today a **100% local, offline, single-user** native SwiftUI + SwiftData + CoreBluetooth app (iOS 17 deployment target). `CONTEXT.md` records the offline/no-login stance as deliberate: no backend, no networking, no identity. The repo was recently split into a monorepo — the Swift app now lives under `ios/MoonBoardLED/`, alongside `web/` (a Web-Bluetooth PWA MVP) and `shared/spec/`.

The goal is to grow this into a social app: accounts → friends → shared session lists of climbing problems, where a shared list shows per-collaborator completion status so a group can focus on problems nobody has ticked yet. **This first plan builds only the entry point: signing in and having a user profile.** It introduces the backend + identity layer everything else will hang off.

## North star — full vision & locked decisions (context, not all built now)

- **Backend:** Supabase (Postgres + Auth + Realtime + Row-Level Security). One backend serves iOS now and the future PWA unchanged.
- **Auth:** Sign in with Apple (intended iOS primary) + Email magic link + Google OAuth, all via Supabase. **Sequencing note (see below): Apple is deferred; email + Google ship first.**
- **User profile:** unique `@handle` + display name, stored in a `profiles` table keyed to `auth.uid()`. **[built in this plan]**
- **Sync (later):** full logbook to cloud, offline-first; cloud is source of truth, local SwiftData is the mirror; one-time merge of existing local Ascents on first login.
- **Friends (later):** unique `@handle` + mutual friend requests; invite/QR links.
- **Visibility (later):** accepted friends can read each other's send-sets (RLS-enforced).
- **Shared session (later):** a curated, hand-picked list; all members equal (create/add/remove/invite).
- **In-list filter (later):** per-member send badges (you / friend / both) by default, with an optional "hide completed" toggle + per-member inclusion. Reuses the existing send-set logic in `ios/MoonBoardLED/Views/CatalogListView.swift` (`sentIDs` / `loggedIDs`, ~lines 224-232 — verify before relying on exact lines).
- **Realtime (later):** Supabase Realtime for live session updates.
- **Platform:** iOS-first; Supabase schema/RLS/auth designed platform-agnostic so the PWA plugs into the same backend later. A backend/data spec should eventually live in `shared/spec/` next to the existing `data-model.md`.

Why "completed" is easy to share later: already modeled as `Set<sourceCatalogID>` where `Ascent.sent == true`, and catalog problems carry stable cross-user string IDs (`CatalogProblem.id`). Future who-did-what sharing maps onto per-user sets of `(catalog_id, board_layout_id)` with no remodeling.

## Decisions resolved for this milestone (grilled)

1. **Launch gate — signed-out fully usable.** App works exactly as today with no account (BLE, catalog, local logging). Sign-in is optional, offered from Settings. Auth is purely additive; must not break the offline experience.
2. **Provider sequencing — email + Google first, Apple deferred.** Sign in with Apple *the capability* requires a **paid Apple Developer Program membership** ($99/yr); the app currently signs with a free personal team (`README.md:25-28`), so Apple is blocked until enrollment. **Email magic link + Google OAuth work on free provisioning** (Google via `ASWebAuthenticationSession`, no special entitlement). Build those two now; wire `AuthManager` provider-agnostically so Apple drops in at enrollment. ⚠️ **App Store Guideline 4.8**: once shipping with Google/email login, you must *also* offer Sign in with Apple — enroll + add it before any App Store/TestFlight release.
3. **Identity linking — one account per verified email.** Enable Supabase identity linking so Google + magic link with the same verified email resolve to one user (one profile/logbook). Caveat: Apple private-relay email differs, so an Apple login may form a separate account — revisit at enrollment.
4. **Handle rules — required at setup, changeable later.** Format: 3–20 chars, lowercase `a–z`/`0–9`/underscore, **case-insensitive unique** (use `citext` or a unique lower-index). Renameable in profile settings (uniqueness re-checked).
5. **Auth state machine — three states:** signed-out / signed-in-but-no-profile / signed-in-with-profile. In the middle state the app stays usable locally, but any profile/social surface re-presents `ProfileSetupView` until a handle is saved. The `profiles` row is created **client-side only after a valid handle is chosen** — no null-handle rows in the DB (no auto-create trigger).
6. **Account deletion — build now.** "Delete account" in profile settings removes the auth user + `profiles` row (App Store Guideline 5.1.1(v)). Trivial today; grows with data later. Sign-out included too.
7. **Entry point — Account section in `SettingsView`.** Signed-out shows sign-in buttons; signed-in shows handle/display-name, edit, sign out, delete. No new tab (tabs stay Home/Settings/Search). `ProfileSetupView` is a first-run modal.
8. **Environments — single Supabase project** for now (solo, pre-release); split dev/prod before real users. Anon key (public-safe, RLS-protected) lives in a **gitignored xcconfig** with a committed example — not hardcoded.
9. **Profile fields — minimal:** `handle` + `display_name` only. `avatar_url` column exists but avatar upload is deferred.

## This plan — auth + user profile

### Backend (Supabase)

- Create one Supabase project (record URL + anon key into a gitignored xcconfig; commit an example).
- Configure auth providers: **Email (magic link)** and **Google** now (set up a Google Cloud OAuth client + Supabase redirect URL). **Apple deferred** to paid-program enrollment. Enable **identity linking** by verified email.
- **`profiles` table:** `id uuid PK` (= `auth.uid()`), `handle citext unique` (3–20, `[a-z0-9_]`, lowercased), `display_name text`, `avatar_url text null`, `created_at timestamptz default now()`. RLS: any authenticated user may `SELECT` (for future handle search); `INSERT`/`UPDATE` only own row (`id = auth.uid()`). Row created via client upsert after handle chosen.
- **Do NOT create `ascents` / `friendships` / `session_*` tables yet** — later plans. Design `profiles` as the anchor for their future FKs.

### iOS

- **Add `supabase-swift`** via SPM (iOS 17 target is fully compatible).
- **`ios/MoonBoardLED/Services/Supabase/`** (new):
  - `SupabaseClientProvider` — client from URL/anon key read from xcconfig (not hardcoded).
  - `AuthManager: ObservableObject` — **provider-agnostic**; exposes magic-link + Google sign-in now (Apple method stubbed for enrollment), sign-out, delete-account, session restore on launch, and the current `profiles` row. Publishes the three-state auth status.
- **`ios/MoonBoardLED/MoonBoardApp.swift`**: inject `AuthManager` as `@StateObject`; **keep the SwiftData container untouched.**
- **Views** under `ios/MoonBoardLED/Views/`:
  - Extend `SettingsView` with an **Account** section (sign-in buttons when signed-out; profile summary + edit / sign out / delete when signed-in).
  - `SignInView` — Email magic link + Google buttons (Apple button added at enrollment).
  - `ProfileSetupView` — first-run modal: handle (with live uniqueness check) + display name; blocks completion until a valid handle is saved.
  - `ProfileView` — view/edit handle + display name.
- **OAuth/magic-link return:** register a custom URL scheme (or universal link) for the Supabase redirect so Google/magic-link return to the app; handle the callback in `AuthManager`.
- **Deferred to enrollment:** add `ios/MoonBoardLED/MoonBoardLED.entitlements` with Sign in with Apple, configure the Apple Services ID, and enable the Apple provider in Supabase.

### Explicitly out of scope (next plans, in order)

1. **Cloud logbook sync** — ownership on `Ascent`, `SyncRepository`, first-login local→cloud merge, offline upsert queue.
2. **Friends** — `friendships` table + handle search + request/accept + friend-visibility RLS.
3. **Shared lists** — `session_lists` / `session_list_members` / `session_list_problems`, list UI, invites.
4. **Per-member badges + optional filter**, then **Realtime**.

## Verification (of the built login/profile feature)

- Sign in via **magic link** and **Google**; confirm a `profiles` row is created and `handle` uniqueness is enforced (a second user cannot claim a taken handle; case-insensitively).
- Sign in with Google, then a magic link at the **same email** → resolves to **one** account (identity linking), one profile.
- Quit during `ProfileSetupView` (no handle) → relaunch re-presents setup; app still usable locally; no null-handle row in the DB.
- Kill/relaunch → session restores without re-auth; sign out clears it; **delete account** removes the auth user + `profiles` row.
- Confirm the app works fully **signed-out** (BLE connect, browse catalog, log ascents locally) and existing catalog/logbook flows show no regression.
