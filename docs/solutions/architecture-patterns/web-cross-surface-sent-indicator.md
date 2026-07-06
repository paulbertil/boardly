---
title: "Surfacing logbook 'sent' state across web screens without duplicating store lifecycle or row components"
module: "web/logbook"
date: "2026-07-06"
problem_type: "architecture_pattern"
component: "frontend_stimulus"
severity: "low"
applies_when:
  - "Adding a cross-surface status indicator (sent/logged/favorited) sourced from a global reactive store"
  - "A singleton store is fed by more than one screen and needs an auth-gated load lifecycle"
  - "The web app has two problem-row components (CatalogRow and AscentRow) that must both show the same indicator"
  - "Threading derived state (a Set of ids) from an orchestrator screen down to leaf rows"
tags:
  - "web"
  - "logbook"
  - "catalog"
  - "reactive-store"
  - "usesyncexternalstore"
  - "shared-hook"
  - "derived-state"
  - "cross-surface-parity"
related:
  - "docs/solutions/architecture-patterns/snapshot-reactive-store-array-when-opening-a-view.md"
---

## Context

The web PWA (a Web Bluetooth MoonBoard viewer) had a logbook of ascents but never surfaced, on the catalog itself, whether a problem had already been logged as a send. iOS shows a green `checkmark.circle.fill` on sent problems; web showed nothing. PR #49 added that "sent" indicator to the web surfaces for parity, driven by the ascents store that already backs the Logbook tab.

The store lives at `web/src/logbook/ascents.ts`. It is an online-first, Supabase-backed singleton exposed reactively through `useSyncExternalStore`:

```ts
export interface Ascent {
  id: string
  date: string
  sourceCatalogId: string | null
  // …
  sent: boolean
  boardLayoutId: number
}

let state: AscentsState = { status: 'idle', ascents: [], error: null }
const listeners = new Set<() => void>()

export function useAscents(): AscentsState {
  return useSyncExternalStore(subscribe, getSnapshot)
}
```

The feature looks like a one-liner ("show a green check when sent") but touched four durable patterns worth writing down: where a shared store's load lifecycle belongs, how "sent" is scoped, how to be sure a cross-cutting indicator reaches *every* surface, and how to thread the derived state so review is trivial.

## Guidance

**1. A reactive singleton store and its load/reset lifecycle travel together.** Before this change, only the Logbook tab read the store, and it owned an auth-gated effect: load the user's ascents on sign-in, clear them on sign-out. When the catalog became a *second* reader, the naive move was to copy that effect into `CatalogScreen`. That duplication was flagged in review. The fix was to extract the lifecycle into a hook co-located with the store, so both consumers share one policy:

```ts
// web/src/logbook/ascents.ts
/**
 * Reactive ascents, with the auth-gated load lifecycle attached: loads on sign-in
 * (after the initial session restore, so an established user doesn't flash signed-out)
 * and clears on sign-out. Any screen that surfaces sent/logged state uses this so the
 * "load-if-signed-in / reset-if-not" policy lives in one place, not copied per screen.
 */
export function useEnsureAscentsLoaded(): AscentsState {
  const { status, isRestoring } = useAuth()
  const signedIn = status !== 'signedOut'
  useEffect(() => {
    if (isRestoring) return
    if (signedIn) void loadAscents()
    else resetAscents()
  }, [signedIn, isRestoring])
  return useAscents()
}
```

Both the Logbook tab and `CatalogScreen` now call `useEnsureAscentsLoaded()` instead of reimplementing the effect. The rule: **when a singleton store gains a second consumer, its auth-gated load/reset belongs in a shared hook beside the store, not copied per screen.**

**2. Define "sent" precisely and scope it to the board.** A problem is sent iff there is a non-deleted ascent with `sent === true`, a matching `sourceCatalogId`, and `boardLayoutId === board.layoutId`. Attempts (`sent === false`) are deliberately excluded — they get their own "Attempt" affordance in the logbook. The derivation lives once in the orchestrator screen:

```ts
// web/src/catalog/CatalogScreen.tsx
const { ascents } = useEnsureAscentsLoaded()
// Board-scoped, mirroring the Logbook tab: a send counts for this board's catalog
// only. `sent === false` rows (attempts) are excluded — only true sends get the check.
const sentIds = useMemo(
  () =>
    new Set(
      ascents
        .filter((a) => a.sent && a.boardLayoutId === board.layoutId && a.sourceCatalogId)
        .map((a) => a.sourceCatalogId as string),
    ),
  [ascents, board.layoutId],
)
```

Two details matter. `sourceCatalogId` is `string | null` (a user-authored problem has no catalog id), so the filter includes a truthiness guard on it; that guard is what makes the `as string` cast in the `.map` sound — anything reaching `.map` has already been proven non-null. And scoping by `boardLayoutId` keeps one board's sends from marking another board's catalog.

**3. "Show it everywhere" means auditing every row component, not just the shared one.** iOS unifies problem rows into a single `ProblemRow`; web does not. The entity renders through *two* components: `CatalogRow` (catalog list + recents sheet) and `AscentRow` (the logbook). The first implementation wired the check into `CatalogRow` and the detail header and stopped — the logbook's `AscentRow` was missed, and the user had to point it out (commit "show the sent check on logbook ascent rows too"). The rule: **before calling a cross-cutting indicator done, enumerate every component that renders the entity (grep the entity's name/id field) and confirm each is covered.**

**4. Thread derived state the way sibling state already flows.** `sentIds: Set<string>` follows `favoriteIds` exactly — same prop, same optionality, same `.has(id)` at the leaf, same derive-inside-the-detail-view. In `ProblemDetail`, `isSent` sits right next to `isFav`:

```ts
const isFav = favoriteIds.has(currentId)
const isSent = sentIds.has(currentId)
```

Matching the established pattern made the change consistent and easy to review.

**Visual/token detail.** The indicator is lucide `CheckCircle2` with the `text-success` theme token, matching iOS's green `checkmark.circle.fill`, rendered next to the benchmark badge. Accessibility is uniform across all three surfaces — `role="img" aria-label="Sent"`:

```tsx
// CatalogRow.tsx and AscentRow.tsx
<CheckCircle2 role="img" aria-label="Sent" className="size-4 shrink-0 text-success" />
```

In `AscentRow` the check and the "Attempt" badge are mutually exclusive (`ascent.sent ? <CheckCircle2 …/> : <span…>Attempt</span>`), so the two states stay legible.

## Why This Matters

Each of these is a place where the obvious implementation quietly incurs a maintenance cost:

- **Copied lifecycle effects drift.** Two screens with their own copy of "load on sign-in, reset on sign-out" will eventually disagree — one gets an `isRestoring` guard, the other flashes signed-out. Co-locating the effect with the store makes correctness a property of the store, not of each caller's discipline.
- **Loose "sent" semantics leak across boards or count attempts.** Without the board scope and the `sent === true` filter, the check would appear on the wrong board or on problems the user only attempted, silently misreporting progress.
- **A missed row component ships a half-done feature.** "Show a check everywhere" that skips the logbook is exactly the kind of gap a user notices immediately, and trust erodes on.
- **Off-pattern threading makes review expensive.** Passing a pre-derived boolean where the sibling passes a Set forces a reviewer to reason about why they differ; mirroring `favoriteIds` makes the diff self-evidently correct.

## When to Apply

- You are adding a **second consumer** to an existing `useSyncExternalStore` (or similar) singleton that has an auth-gated or session-gated load. Extract the lifecycle into a shared hook beside the store before wiring the new screen.
- You are adding a **status indicator** (badge, check, dot) that should appear wherever an entity is rendered. Enumerate every renderer of that entity first — especially in a codebase where a platform (here, iOS) has one unified row but another (web) has several.
- You are introducing **derived state** (a `Set`, a lookup map) that flows from an orchestrator screen down to leaf rows. Find the nearest sibling that already flows the same shape and copy its prop plumbing exactly.
- You have a nullable id you want to collect into a `Set<string>`. Guard the null in the `.filter` so the `as string` in the `.map` is provably safe, rather than casting blind.

## Examples

**Sharing the lifecycle (the fix that landed).** Both screens now read the store through the same hook:

```ts
// Logbook tab AND CatalogScreen:
const { ascents } = useEnsureAscentsLoaded()
```

Neither owns a copy of the sign-in/sign-out effect; the hook in `ascents.ts` does.

**Board-scoped, sends-only derivation.** See the `sentIds` `useMemo` above — `a.sent && a.boardLayoutId === board.layoutId && a.sourceCatalogId`, then `.map((a) => a.sourceCatalogId as string)`.

**Every renderer covered.** The check appears in three places, all with identical a11y:

- `web/src/catalog/CatalogRow.tsx` — catalog list + recents sheet
- `web/src/logbook/AscentRow.tsx` — the logbook (the one initially missed)
- `web/src/catalog/ProblemDetail.tsx` — the detail header, with `isSent` derived beside `isFav`

**Sibling-consistent threading.** `sentIds` is passed to `CatalogList`, `RecentsSheet`, and `ProblemDetail` alongside `favoriteIds`, and resolved at the leaf with `sentIds.has(id)` exactly as `favoriteIds.has(id)`.

## Related

- [snapshot-reactive-store-array-when-opening-a-view](./snapshot-reactive-store-array-when-opening-a-view.md) — the sibling reactive-store pattern for this same web catalog subsystem. That one is about snapshotting a store's array when opening a view to avoid a consume-and-mutate feedback loop while paging; this one is about *where a shared store's load lifecycle lives* and *cross-surface indicator consistency*. Together they form the reactive-store pattern pair for `web/`.
