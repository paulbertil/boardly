# User accounts & login — foundation for social features

> **Saved plan — start a fresh session and say "implement docs/social-accounts-plan.md" to begin.**
> **Scope: login + user profile only.** The friends system, cloud logbook sync, and shared
> session lists are the *north star* below but are **deferred to follow-on plans** — build the
> login layer so it doesn't box those in.

## Context

The MoonBoard LED app is today a **100% local, offline, single-user** native SwiftUI + SwiftData + CoreBluetooth app. `CONTEXT.md` (see the "no login... Multiplatform and auth were explicitly dropped" note) records this as deliberate: there is no backend, no networking, and no identity of any kind. The repo was recently split into a monorepo — the Swift app now lives under `ios/MoonBoardLED/`, alongside `web/` (a Web-Bluetooth PWA MVP) and `shared/spec/`.

The goal is to grow this into a social app: accounts → friends → shared session lists of climbing problems, where a shared list shows per-collaborator completion status so a group can focus on problems nobody has ticked yet. **This first plan builds only the entry point: signing in and having a user profile.** It is a deliberate reversal of the offline-only stance and introduces the backend + identity layer everything else will hang off.

## North star — full vision & locked decisions (context, not all built now)

These were resolved with the product owner and constrain how we build the login layer:

- **Backend:** Supabase (Postgres + Auth + Realtime + Row-Level Security). One backend serves iOS now and the future PWA unchanged.
- **Auth:** Sign in with Apple (iOS primary) + Email magic link (cross-platform baseline) + Google OAuth — all via Supabase providers. **[built in this plan]**
- **User profile:** unique `@handle` + display name, stored in a `profiles` table keyed to `auth.uid()`. **[built in this plan]**
- **Sync (later):** full logbook to cloud, offline-first; cloud is source of truth, local SwiftData is the mirror; one-time merge of existing local Ascents on first login.
- **Friends (later):** unique `@handle` + mutual friend requests; invite/QR links.
- **Visibility (later):** accepted friends can read each other's send-sets (RLS-enforced).
- **Shared session (later):** a curated, hand-picked list; all members equal (create/add/remove/invite).
- **In-list filter (later):** per-member send badges (you / friend / both) by default, with an optional "hide completed" toggle + per-member inclusion. Reuses the existing send-set logic in `ios/MoonBoardLED/Views/CatalogListView.swift` (`sentIDs` / `loggedIDs`, ~lines 224-232 — verify before relying on exact lines).
- **Realtime (later):** Supabase Realtime for live session updates.
- **Platform:** iOS-first; Supabase schema/RLS/auth designed platform-agnostic so the PWA plugs into the same backend later with no redesign. A backend/data spec should eventually live in `shared/spec/` next to the existing `data-model.md`.

Why "completed" is easy to share later: it is already cleanly modeled as `Set<sourceCatalogID>` where `Ascent.sent == true`, and catalog problems carry stable cross-user string IDs (`CatalogProblem.id`, from boardsesh). So "who has done what" maps naturally onto per-user sets of `(catalog_id, board_layout_id)` — no remodeling needed when sync/friends land.

## This plan — auth + user profile

### Backend (Supabase)

- Create a Supabase project (record the project URL + anon key; **keep secrets out of the repo** — use an untracked config / xcconfig, gitignored).
- Configure auth providers in the dashboard: **Apple**, **Email (magic link)**, **Google**. (Apple requires an App ID with Sign in with Apple enabled + a Services ID / key; Google requires an OAuth client. Document the redirect URLs Supabase expects.)
- **`profiles` table:** `id uuid PK` (= `auth.uid()`), `handle text unique` (validated, case-insensitive — use a `citext` or a unique lower-index), `display_name text`, `avatar_url text null`, `created_at timestamptz default now()`. RLS: any authenticated user may `SELECT` (needed later for handle search); `INSERT`/`UPDATE` only own row (`id = auth.uid()`). Create the row via client-side upsert on first sign-in (or a `handle_new_user` trigger on `auth.users`).
- **Do NOT create `ascents` / `friendships` / `session_*` tables yet** — those belong to later plans. But design `profiles` so they can reference it (it is the anchor for all future FKs).

### iOS

- **Add `supabase-swift`** via SPM to the `ios/MoonBoardLED.xcodeproj` target.
- **Add `ios/MoonBoardLED/MoonBoardLED.entitlements`** with the *Sign in with Apple* capability and wire it into the Xcode target (no entitlements file exists today — this is the first capability).
- **`ios/MoonBoardLED/Services/Supabase/`** (new):
  - `SupabaseClientProvider` — builds the client from URL/anon key read from config (not hardcoded).
  - `AuthManager: ObservableObject` — holds session state + the current `profiles` row; exposes sign-in (Apple / magic link / Google), sign-out, and session restore on launch.
- **`ios/MoonBoardLED/MoonBoardApp.swift`**: inject `AuthManager` as a `@StateObject`; **keep the existing SwiftData container untouched.** Launch gate: recommend the app stays fully usable **signed-out** (it's a local BLE tool), with sign-in offered from Settings/Home; profile features light up once authenticated. (Confirm this gate with the product owner during implementation.)
- **New Views** (mirror existing SwiftUI patterns under `ios/MoonBoardLED/Views/`):
  - `SignInView` — provider buttons (Apple / email / Google).
  - `ProfileSetupView` — first-run handle + display-name capture, with a uniqueness check against `profiles`.
  - `ProfileView` (or a `SettingsView` row) — show current profile, sign out, edit display name.
  - Add an entry point in `ios/MoonBoardLED/Views/RootTabView.swift` or `SettingsView`.

### Explicitly out of scope for this plan (next plans, in order)

1. **Cloud logbook sync** — add ownership to `Ascent`, a `SyncRepository`, first-login local→cloud merge, offline upsert queue.
2. **Friends** — `friendships` table + handle search + request/accept + friend-visibility RLS.
3. **Shared lists** — `session_lists` / `session_list_members` / `session_list_problems` tables, list UI, invites.
4. **Per-member badges + optional filter**, then **Realtime** subscriptions.

## Verification (of the built login/profile feature)

- Sign in via **each** provider on a device/simulator; confirm a `profiles` row is created and `handle` uniqueness is enforced (a second user cannot claim a taken handle).
- Kill and relaunch the app → session restores without re-auth; sign out clears it.
- Confirm the app still works fully **signed-out** (BLE connect, browse catalog, log ascents locally) — the login layer must not break the existing offline experience.
- Re-run existing catalog/logbook flows to confirm no regression from adding the auth stack.
