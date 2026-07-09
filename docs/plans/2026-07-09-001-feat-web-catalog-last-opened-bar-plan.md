---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
type: feat
title: "feat(web): catalog last-opened mini-preview bar"
date: 2026-07-09
tier: routine
---

# feat(web): catalog last-opened mini-preview bar

A slim, persistent bar on the catalog screen that shows the **last problem you
opened** so you can flip through neighbours and reopen it without the full detail
drawer. Requirements were fixed in a grill session with the user; this plan is the
HOW. Product Contract preservation: N/A (direct planning; no upstream brainstorm
doc — the grill transcript is the source of truth).

**Tier:** Routine web UI. No BLE / board-geometry / migrations. The **one**
sensitive slice is U1 (extracting the working auth-gated add-to-list flow) — treat
that unit test-first, keeping the existing characterization test green.

---

## Problem Frame

Opening a problem, glancing at the board, and closing it loses your place: to
reopen you scroll the list back to where you were. The History FAB
(`RecentsSheet`) exists but is a deliberate tap-in-tap-out surface. Users want a
**lightweight, always-there shortcut** to the thing they were just looking at, plus
a way to flip through neighbouring climbs a peek at a time.

Today the detail drawer (`ProblemDetail`) is the only place that shows a single
problem's identity + actions, and it is fully modal (driven by `?problem`). There
is no persistent single-problem surface on the catalog.

---

## Goal Capsule

Add a **last-opened bar** to `CatalogScreen`, pinned above the bottom nav, that:

- shows the last problem opened **this session** for the **current board+angle**;
- lets you scrub prev/next through the current filtered list *in place* (drawer
  stays closed, nothing persisted);
- offers inline favorite (♡) and add-to-list (➕), and opens the full drawer when
  the body is tapped;
- can be dismissed (×) and returns the next time any problem is opened;
- never appears on a cold load, and resets when the board or angle changes.

Success = a user who opens a climb, closes it, and finds it one tap away above the
nav; arrows flip the bar through the list; favorite/add-to-list work without
opening the drawer; switching board/angle or reloading clears the bar.

---

## Requirements

Traceability IDs are plan-local (`R#`). Each maps to the grilled decision it encodes.

- **R1 — Placement.** A slim bar sits directly above the bottom nav on the catalog
  screen, always fully visible (not an overlay the list scrolls behind at rest).
  Mounted sticky inside the catalog scroll region (KTD1).
- **R2 — Session-only appearance.** The bar appears only after the user opens a
  problem *this session*; it is **not** shown on a cold load even though
  `recentsStore` has persisted history.
- **R3 — Board/angle scoping + reset.** The bar reflects the last-opened problem
  for the *current* `layoutId+angle` only, and blanks when either changes.
- **R4 — Contents.** `[thumbnail] NAME · grade · setter` plus controls: `‹ ›`
  (prev/next), `♡` (favorite), `➕` (add-to-list), `×` (dismiss).
- **R5 — Body tap opens the drawer** on the shown problem (records a recent via the
  existing `ProblemDetail` effect).
- **R6 — Scrub in place.** `‹ ›` move the shown problem through the **current
  filtered list** without opening the drawer.
- **R7 — Scrub is purely local.** Scrubbing writes nothing — no `?problem` URL
  change, no `recentsStore` write. Only an actual open records a recent.
- **R8 — Keep showing when filtered out.** If the shown problem is not in the
  current filtered list, the bar keeps showing it; an arrow tap lands on the first
  (`›`) / last (`‹`) filtered entry.
- **R9 — Re-seed on close.** After the drawer closes, the bar shows the
  just-opened (or last-paged-to) problem, discarding any prior scrub position.
- **R10 — Inline favorite.** `♡` toggles `favoritesStore` for the shown problem.
- **R11 — Inline add-to-list.** `➕` opens the auth-aware add-to-list flow inline
  (including signed-out sign-in-resume), via a shared `useAddToList` hook reused by
  the drawer and the bar.
- **R12 — Dismiss + recovery.** `×` hides the bar until the user next opens any
  problem, which re-seeds and re-shows it. History FAB stays the durable
  "everything viewed" surface.

---

## Key Technical Decisions

### KTD1 — Sticky bar in `CatalogScreen`, not a grid row in `AppLayout`
The `.app-shell` grid lives in `AppLayout`, which has none of the data the bar
needs (`displayed`, `openDrawer`, board/angle, favorites). Rather than funnel all
that up via a store or portal, render the bar **inside `CatalogScreen`**, pinned
with `sticky bottom-0 z-30` — the exact idiom the catalog FAB column already uses
(`CatalogScreen.tsx:221`). Add a list-end spacer equal to the bar's height so the
last row never hides under it, giving the "distinct row above the nav" look the
user chose. *Considered and rejected:* a literal third grid row in `AppLayout`
(matches the original wording but needs a cross-component data funnel — more
surface, more risk, no visual difference). *(User-confirmed.)*

### KTD2 — Session-only, board-scoped state via a new in-memory `lastOpenedStore`
Introduce `lastOpenedStore.ts`, a `useSyncExternalStore` singleton keyed per
`layoutId+angle`, **in-memory only (not persisted)**. This single choice satisfies
three requirements at once:
- **R2** (session-only): in-memory ⇒ empty on cold load ⇒ no bar.
- **R3** (reset on board/angle): a different key returns no entry ⇒ bar hidden.
- **R12** (dismiss/recovery): `dismiss()` clears the entry; the next open re-records.

It mirrors the established store pattern (`recentsStore`, `favoritesStore`:
`listeners` set + `emit()`), minus the `localStorage` read/write and the `storage`
event listener. `recordOpened(layoutId, angle, id)` is called from the same seam
that already records recents (the `ProblemDetail` effect), so the bar tracks
whatever is currently open in the drawer — after paging then closing, it shows the
last-paged climb (R9).

### KTD3 — Scrub is local pointer state layered over the store seed
The bar's shown id = `scrubId ?? lastOpenedId`. Arrow taps set `scrubId` to a
neighbour in `displayed`; nothing else is written (R6, R7). An effect clears
`scrubId` whenever `lastOpenedId` changes, so a fresh open/close re-seeds the bar
and discards the scrub position (R9). Out-of-list handling reuses
`ProblemDetail`'s existing `findIndex`/`atFirst`/`atLast` logic: `pos === -1` ⇒
`›` → `displayed[0]`, `‹` → `displayed[displayed.length - 1]` (R8).

### KTD4 — Extract `useAddToList` to share the auth-gated flow (the one real refactor)
The add-to-list flow (sheet open state, `resumeAddToList`, the signed-out
sign-in-resume effect, `AddToListSheet` render) currently lives inline in
`ProblemDetail` (`ProblemDetail.tsx:71,74,215-231,374-379`). Extract it into a
self-contained `useAddToList({ sourceCatalogId, board })` hook that owns its **own**
`AddToListSheet` + `SignInDialog` (titled "Sign in to save to a list"), so the bar
can reuse it without duplicating the resume dance. After extraction,
`ProblemDetail`'s remaining `SignInDialog` serves only `addTry`/`logAscent`
(constant title "Sign in to log ascents" — the dynamic-title branch drops out).
This is behavior-preserving; the existing `ProblemDetailAddToList.test.tsx`
characterization test must stay green (Execution note on U1).

---

## High-Level Technical Design

Bar state resolution and the write/no-write boundary:

```mermaid
flowchart TD
  open["Open drawer (list tap, History, bar body)"] -->|recordOpened + recordRecent| store["lastOpenedStore[layoutId+angle]"]
  store -->|useLastOpened| shown{"scrubId ?? lastOpenedId"}
  arrows["Bar ‹ › arrows"] -->|set scrubId (local only)| shown
  shown -->|null → hidden| hidden["Bar not rendered"]
  shown -->|id → render| bar["LastOpenedBar"]
  bar -->|body tap| open
  bar -->|♡| fav["favoritesStore.toggle (write)"]
  bar -->|➕| addlist["useAddToList (auth-aware)"]
  bar -->|×| dismiss["lastOpenedStore.dismiss + clear scrubId"]
  dismiss --> hidden
  boardAngleChange["board/angle change"] -->|different key ⇒ no entry| hidden
  coldLoad["cold load"] -->|in-memory empty| hidden
```

Key invariant: **only the `open` path writes** (URL `?problem`, `recentsStore`,
`lastOpenedStore`). Arrows and render never write.

---

## Output Structure

New files (2) and touched files, relative to `web/`:

```
web/src/catalog/
  lastOpenedStore.ts          (new) in-memory session store, per layoutId+angle
  lastOpenedStore.test.ts     (new)
  LastOpenedBar.tsx           (new) the bar component
  LastOpenedBar.test.tsx      (new)
  CatalogScreen.tsx           (mod) render bar + spacer; call recordOpened on open
  ProblemDetail.tsx           (mod) consume useAddToList; call recordOpened
web/src/lists/
  useAddToList.ts             (new) extracted auth-gated add-to-list hook
  useAddToList.test.ts        (new)
```

---

## Implementation Units

### U1. Extract `useAddToList` hook (refactor, behavior-preserving)

- **Goal:** Move the add-to-list + signed-out sign-in-resume flow out of
  `ProblemDetail` into a reusable hook, with no user-visible change to the drawer.
- **Requirements:** R11 (enables inline ➕ reuse), KTD4.
- **Dependencies:** none.
- **Files:**
  - `web/src/lists/useAddToList.ts` (new)
  - `web/src/lists/useAddToList.test.ts` (new)
  - `web/src/catalog/ProblemDetail.tsx` (modify — consume the hook)
  - `web/src/catalog/ProblemDetailAddToList.test.tsx` (existing — must stay green)
- **Approach:** `useAddToList({ sourceCatalogId, board })` returns `{ saveToList,
  element }` (or `{ saveToList, sheet, signInDialog }`). It owns `addToListOpen`,
  `resumeAddToList`, its own `signInOpen`, the resume `useEffect`
  (`ProblemDetail.tsx:226-231`), and renders `AddToListSheet` + a `SignInDialog`
  titled "Sign in to save to a list". `saveToList()` replicates
  `ProblemDetail.tsx:215-222`: signed-out ⇒ set resume + open sign-in; signed-in ⇒
  open sheet. In `ProblemDetail`, replace the inline state/handlers/renders with
  the hook; the remaining `SignInDialog` (addTry/logAscent) loses its dynamic title
  (constant "Sign in to log ascents") and its `resumeAddToList`-based dismiss reset
  (now owned by the hook).
- **Execution note:** Test-first. Write `useAddToList.test.ts` first, then extract;
  run `ProblemDetailAddToList.test.tsx` after each step to prove the drawer's flow
  is unchanged. This is the sensitive slice — auth-gated, working code.
- **Patterns to follow:** the existing inline flow in `ProblemDetail.tsx`; sheet
  props shape from `AddToListSheet.tsx`; existing hook style in `web/src/catalog/`
  (`useSlab.ts`, `useProblemDrawer.ts`).
- **Test scenarios:**
  - `useAddToList.test.ts` — Covers R11.
    - Signed-in: `saveToList()` opens the add-to-list sheet immediately.
    - Signed-out: `saveToList()` opens the sign-in dialog (title "Sign in to save
      to a list") and does **not** open the sheet.
    - Signed-out resume: after `saveToList()` opens sign-in, transitioning to
      signed-in opens the sheet on the same `sourceCatalogId`.
    - Sign-in dismissed without success: pending resume is dropped (a later
      unrelated sign-in does not auto-open the sheet).
    - `element` renders `AddToListSheet` with the passed `sourceCatalogId` + `board`.
  - `ProblemDetailAddToList.test.tsx` (existing) — must pass unchanged: the "Save
    to list" button, signed-out sign-in, and resume-on-sign-in still work in the
    drawer.
- **Verification:** `npm run build` (tsc -b) clean; `vitest run src/lists
  src/catalog/ProblemDetail` green; the existing add-to-list characterization test
  passes with no edits to its assertions.

### U2. `lastOpenedStore` — in-memory, session-only, board/angle-scoped

- **Goal:** A reactive singleton holding the last-opened problem id per
  `layoutId+angle`, in memory only, with record / dismiss / hook access.
- **Requirements:** R2, R3, R9, R12; KTD2.
- **Dependencies:** none.
- **Files:**
  - `web/src/catalog/lastOpenedStore.ts` (new)
  - `web/src/catalog/lastOpenedStore.test.ts` (new)
- **Approach:** Mirror `recentsStore.ts`/`favoritesStore.ts` (`listeners` set +
  `emit()` + `useSyncExternalStore`) but back it with an in-memory
  `Map<string, string>` keyed `` `${layoutId}_${angle}` ``, **no `localStorage`,
  no `storage` listener**. Exports:
  - `recordOpened(layoutId, angle, id)` — set the entry, emit.
  - `dismissLastOpened(layoutId, angle)` — delete the entry, emit.
  - `getLastOpened(layoutId, angle): string | null`.
  - `useLastOpened(layoutId, angle): string | null` — reactive, with a cached
    per-key snapshot so `useSyncExternalStore` gets a stable value between emits
    (mirror `recentsStore`'s cache pattern to avoid an infinite re-render).
- **Patterns to follow:** `web/src/catalog/recentsStore.ts` (cache-per-key +
  `snapshotFor`), `web/src/catalog/favoritesStore.ts` (subscribe shape).
- **Test scenarios:** Covers R2, R3, R12.
  - Fresh store: `getLastOpened` / `useLastOpened` returns `null` (cold-load ⇒ no bar).
  - `recordOpened` then read returns the id for that key.
  - Different `layoutId` or `angle` key returns `null` while another key is set
    (board/angle scoping).
  - `dismissLastOpened` clears the entry; a subsequent `recordOpened` restores it.
  - `useLastOpened` re-renders subscribers on record/dismiss and returns a stable
    reference between unrelated emits (no render loop).
- **Verification:** `vitest run src/catalog/lastOpenedStore` green; store is not
  imported by any persistence path (grep shows no `localStorage`).

### U3. `LastOpenedBar` component

- **Goal:** The bar UI — thumbnail + identity + `‹ › ♡ ➕ ×`, with scrub-in-place
  and body-tap-to-open — driven by props from `CatalogScreen`.
- **Requirements:** R1, R4, R5, R6, R7, R8, R10, R11; KTD1, KTD3, KTD4.
- **Dependencies:** U1 (`useAddToList`), U2 (`useLastOpened`).
- **Files:**
  - `web/src/catalog/LastOpenedBar.tsx` (new)
  - `web/src/catalog/LastOpenedBar.test.tsx` (new)
- **Approach:** Props: `{ board, angle, displayed, favoriteIds, highlightHolds,
  onOpen(id), onDismiss() }`. Internally:
  - `const lastOpenedId = useLastOpened(board.layoutId, angle)`.
  - `const [scrubId, setScrubId] = useState<string | null>(null)`;
    `useEffect(() => setScrubId(null), [lastOpenedId])` (R9).
  - `const shownId = scrubId ?? lastOpenedId`; resolve to a `CatalogProblem` from
    `displayed`, falling back to the full slab via a passed resolver **or** accept a
    `resolveProblem(id)` prop so a filtered-out climb still renders (R8). *(Simplest:
    pass a `byId` map or `problems` alongside `displayed`; see U4 wiring.)*
  - Return `null` when `shownId` is null or unresolved (bar hidden).
  - Arrows: `pos = displayed.findIndex(...)`; `next = pos < 0 ? displayed[0] :
    displayed[pos+1]`; `prev = pos < 0 ? displayed.at(-1) : displayed[pos-1]`;
    disable when the target is undefined; on tap `setScrubId(target.id)` (R6, R7, R8).
  - Body button → `onOpen(shownId)` (R5). ♡ → `toggleFavorite(shownId)` via
    `useFavorites` (R10). ➕ → `useAddToList({ sourceCatalogId: shownId, board })`
    `saveToList()` + render its `element` (R11). × → `onDismiss()` (R12).
  - Thumbnail: `<CatalogBoard>` in a small fixed-width wrapper (mirror
    `CatalogRow`'s `w-[72px]` thumbnail), gated by `useShowPreviews()` for
    consistency with rows.
- **Patterns to follow:** `CatalogRow.tsx` (thumbnail wrapper + row layout),
  `ProblemDetail.tsx:302-326` (icon-button cluster, favorite toggle, prev/next
  disable logic, lucide icons `ChevronLeft/Right`, `Heart`, `ListPlus`, an `X` for
  dismiss), `FabTrigger.tsx` (theme tokens for a quiet elevated surface).
- **Styling:** slim, secondary (`bg-background`/`bg-card`, `border-t border-border`,
  `pb-[env(safe-area-inset-bottom)]` not needed — nav owns the safe area); dimmer
  than the drawer; single row height. Use shadcn `Button` `variant="ghost"
  size="icon"` for controls (web/ CLAUDE.md: shadcn-first).
- **Test scenarios:**
  - Renders nothing when `useLastOpened` is null (R2 surface).
  - Renders thumbnail + name + grade + setter for the last-opened problem (R4).
  - Body tap calls `onOpen(shownId)` (R5).
  - `›` sets the shown problem to the next in `displayed` without calling `onOpen`
    and without any store/URL write (R6, R7); `‹` to the previous.
  - Shown problem filtered out of `displayed`: still rendered; `›` lands on
    `displayed[0]`, `‹` on the last entry (R8).
  - `‹` disabled at list start, `›` disabled at list end (mirror `atFirst`/`atLast`).
  - New `lastOpenedId` (simulated store change) clears an active scrub — bar shows
    the new id (R9).
  - ♡ toggles favorite for the shown id (assert `favoritesStore`) (R10).
  - ➕ opens the add-to-list flow for the shown id (R11).
  - × calls `onDismiss` (R12).
- **Verification:** `vitest run src/catalog/LastOpenedBar` green; `npm run build`
  clean.

### U4. Wire the bar into `CatalogScreen` + record opens + list spacer

- **Goal:** Render the bar above the nav, feed it the filtered list and callbacks,
  record every real open into `lastOpenedStore`, and stop the last row hiding.
- **Requirements:** R1, R3, R5, R9, R12; KTD1, KTD2.
- **Dependencies:** U2, U3.
- **Files:**
  - `web/src/catalog/CatalogScreen.tsx` (modify)
  - `web/src/catalog/ProblemDetail.tsx` (modify — record open on shown-problem change)
  - `web/src/catalog/CatalogScreen.test.tsx` (existing — extend)
- **Approach:**
  - **Record opens.** Add `recordOpened(layoutId, angle, id)` at the same seam that
    records recents. Preferred: alongside `recordRecent` in `ProblemDetail`'s
    effect (`ProblemDetail.tsx:84-86`) so drawer paging updates the last-opened too
    (R9). (Both stores then move in lockstep; keep the single effect.)
  - **Render.** Below `CatalogList`, inside `CatalogScreen`'s
    `flex flex-1 flex-col`, add `<LastOpenedBar board angle displayed
    favoriteIds highlightHolds onOpen={openDrawer} onDismiss={...} />` as a
    `sticky bottom-0 z-30` element (above the existing FAB column's z-index
    considerations — FABs are `z-30`; keep the bar visually below the FABs or
    reposition FABs above the bar). `onOpen` = `openDrawer` (from
    `useProblemDrawer`); pass `problems` (full slab) so the bar can resolve a
    filtered-out `shownId` (R8).
  - **Dismiss.** `onDismiss = () => dismissLastOpened(board.layoutId, angle)`.
  - **Spacer.** Ensure the last `CatalogList` row clears the sticky bar: add a
    bottom spacer (or bottom padding on the scroll region) equal to the bar height
    when the bar is shown. Simplest: a conditional spacer `<div>` after the list, or
    padding on `CatalogList`'s container. Verify visually that the last row is fully
    tappable with the bar present.
- **Approach note (layering):** the FAB column (`CatalogScreen.tsx:221`,
  `sticky bottom-4 z-30`) and the new bar both pin to the bottom. Position the bar
  full-width at `bottom-0` and lift the FAB column's `bottom-*` so the History /
  Filter FABs float clear above the bar. Confirm both remain tappable.
- **Patterns to follow:** the FAB column block in `CatalogScreen.tsx:218-224`
  (sticky/mt-auto/pointer-events idiom).
- **Test scenarios:**
  - Opening a problem then closing the drawer shows the bar with that problem
    (integration: list tap → close → bar visible, R5+R9). Covers the core flow.
  - Cold render (no open yet) shows no bar (R2).
  - Switching `angle` (re-render with a different `angle` prop/search) hides the bar
    (R3). Board switch is analogous (different route) — assert store keying if a
    full remount is impractical in the test.
  - `×` hides the bar; opening another problem brings it back seeded to that problem
    (R12).
  - The last catalog row is not obscured by the bar (spacer present) — assert the
    spacer/padding renders when the bar is shown.
- **Verification:** `vitest run src/catalog` green; `npm run build` clean; manual
  `/ce-test-browser` smoke on the catalog: open→close shows the bar, arrows scrub,
  ♡/➕ work, × hides, board/angle switch and reload clear it.

---

## Scope Boundaries

**In scope:** the catalog last-opened bar and its supporting store + hook
extraction, as specified in R1–R12.

### Deferred to Follow-Up Work
- **Logbook parity.** `useProblemDrawer` is shared with the logbook; a last-opened
  bar there is out of scope for this PR.
- **iOS parity.** This is web-only; no `ios/` changes.
- **Persisting the bar across reloads.** Explicitly rejected in the grill
  (session-only). Not a future item unless the product decision changes.

### Out of scope (non-goals)
- Changing `recentsStore` behavior, the History FAB, or the drawer's own prev/next.
- Any new inline action beyond ♡ / ➕ (e.g. BLE "light up" or log-ascent stay
  drawer-only).

---

## System-Wide Impact

- **`ProblemDetail`** is edited twice: U1 (add-to-list extraction) and U4
  (`recordOpened`). Both are behavior-preserving for the drawer; the existing
  `ProblemDetail.test.tsx` and `ProblemDetailAddToList.test.tsx` are the guardrails.
- **New in-memory store** adds no persistence and no cross-tab `storage` coupling —
  intentionally, so it stays session-scoped.
- **Layout:** a new sticky element at the bottom of the catalog scroll region;
  verify it doesn't fight the FAB column or the drawer (the drawer overlays
  everything when open, so the bar is only visible when the drawer is closed —
  confirm no double-surface fl​icker on close).

---

## Risks & Dependencies

- **R-risk: `useAddToList` extraction regresses the drawer's auth flow.**
  Mitigation: test-first U1, existing characterization test must stay green, extract
  in small steps.
- **R-risk: sticky bar overlaps the last row or the FAB column.** Mitigation: list
  spacer (U4) + FAB reposition; browser smoke check.
- **R-risk: `useSyncExternalStore` render loop from an unstable snapshot.**
  Mitigation: copy `recentsStore`'s cache-per-key `snapshotFor` pattern exactly
  (U2 test asserts stable reference).
- **Dependency order:** U1 and U2 are independent and can land first (either
  order); U3 needs both; U4 needs U2+U3.

---

## Verification Contract

- `cd web && npm run build` (tsc -b, per repo convention — **not** `tsc --noEmit`)
  passes clean.
- `cd web && npm run test` (`vitest run`) green, including the new
  `lastOpenedStore.test.ts`, `useAddToList.test.ts`, `LastOpenedBar.test.tsx`, and
  the unchanged `ProblemDetailAddToList.test.tsx`.
- Browser smoke (`/ce-test-browser` on the catalog route): open a climb → close →
  bar appears with it; `‹ ›` scrub the bar without opening the drawer; body tap
  reopens; ♡ and ➕ act on the shown climb; × hides the bar; opening another climb
  restores it; switching angle/board and reloading both clear it.

## Definition of Done

All of R1–R12 satisfied and covered by tests or the browser smoke; the Verification
Contract passes; the drawer's existing add-to-list + sign-in behavior is unchanged
(characterization test green); no new `localStorage` key introduced; docs updated if
the catalog subsystem doc describes the surface (check `docs/` for a catalog page).
