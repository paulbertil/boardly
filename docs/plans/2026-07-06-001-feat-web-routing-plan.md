# Web PWA routing — implementation plan

**Branch:** `feat/web-routing` (worktree `../board-app-web-routing`)
**Scope:** `web/` only. Introduce client-side routing (TanStack Router) so browser back/forward
works and every meaningful part of the catalog is deep-linkable.
**Status:** design locked (grilled + reviewed by frontend, architecture, and state-seam passes).

> Doc discipline (CLAUDE.md): this plan drives the change; when it lands, fold a routing
> section into [`docs/navigation-and-ui-flows.md`](../navigation-and-ui-flows.md) and update the
> `web/` row in `CONTEXT.md`. Don't leave routing behavior documented only here.

---

## 1. Goal & motivation

Today `App.tsx` holds view state (`'catalog' | 'boards'`) in `useState`; problem detail is a
`Drawer` opened by `openIndex` in `CatalogScreen`; search is a global `searchStore`; active
board + angle + filters persist in localStorage. No router. Consequences: browser back/forward
does nothing, and nothing is linkable.

"Catalog view state" — *what the catalog is showing* — is smeared across five places
(`App` state, `boardStore`, `useFilters`, `searchStore`, `CatalogScreen` local state). The
routing change concentrates it behind **one seam: the URL**.

## 2. Locked decisions

| # | Decision |
|---|----------|
| Library | **TanStack Router**, **code-based** route tree (`src/router.tsx`), no file-route codegen |
| Mode | **History** routing (clean URLs). Host needs a catch-all → `index.html` on deploy |
| Altitude | **C** — all view state is URL-addressable (filters + search in the URL, not just screens) |
| Source of truth | **URL is sole truth for every explicit route** (localStorage never consulted). localStorage seeds **only** the bare-`/` redirect |
| Board id | Path uses **`layoutId`** (immutable server partition key) |
| Problem | **Search param** `?problem=<source_catalog_id>` — modal-over-catalog, not a nested path |
| Pager history | **push on open** (Back closes drawer), **replace on swipe** (URL tracks current problem) |
| Deep-linked problem | Resolve against the **full slab**; opens even if per-user filters exclude it |
| Search field | Local input state + **debounced (~250 ms) `replace`** write to `?q`; list derives from URL |
| Grade encoding | **Ordinals** `grade=<min>-<max>` (native `FilterState.gradeRange` representation) |
| `fav` in URL | **Kept** (`?fav=1`); lists reproduce only up to per-device favorites/hold-sets (documented limitation) |
| Un-added board | **Read-only catalog preview + "Add this board" CTA** (not a bounce) |
| Scroll restoration | **Deferred** to a follow-up (hard against inner container + 30-row pagination) |
| Architecture | Router coupling at the edges; leaf components stay prop-driven. One `renderWithRouter` memory-history helper |
| PWA | `workbox.navigateFallback: '/index.html'` + denylist; `start_url` stays `/` |

## 3. Route tree

```
/                                → redirect (beforeLoad):
                                     no added boards → /boards
                                     else → last-active board's catalog, URL built from
                                            localStorage seed (board + angle + last filters)
/boards                          → MyBoards (global, not board-scoped)
/board/$layoutId/catalog         → CatalogScreen
     search: q grade bench stars method fav sort angle holds problem
```

- **Guards:** unknown `layoutId` (not in registry) → `/boards`. Registry-valid but **un-added**
  board → render **read-only preview** with an "Add this board" affordance (do *not* bounce).
- Auth (`SignInPanel`/`ProfileSetup`) stays a header modal, not a route. `BuildScreen` stays orphaned.

## 4. Search-param schema

All params **omitted at default** via `stripSearchParams` middleware (NOT `validateSearch`
alone — validation fills defaults on read, and the router would re-serialize them on the next
navigation, re-bloating the URL). Design each param with an explicit default in `validateSearch`,
then strip defaults in route search middleware. Write a **round-trip test** over the schema.

| Param | Field | Encoding | Default (stripped) |
|-------|-------|----------|--------------------|
| `q` | `search` | raw string | `''` |
| `grade` | `gradeRange` | **ordinals** `min-max` into `FONT_GRADES` | full canonical span `[0, len-1]` → `null` |
| `bench` | `benchmarkOnly` | `1` | `false` |
| `stars` | `minStars` | `1`–`5` (**range is 0–5**, not 1–3) | `0` |
| `method` | `methods` | comma-joined labels | `[]` |
| `fav` | `favoritesOnly` | `1` | `false` |
| `sort` | `sortPrimary` | `easiest`/`hardest`/`rated`/`repeats` | `easiest` |
| `angle` | angle | number | **`defaultAngle(board)` — per-board, computed in the route** (see §6) |
| `holds` | `holdsFilter` | comma `col-row` | `[]` (UI coming soon; inert until then) |
| `problem` | open problem | `source_catalog_id` | closed |

- `grade`: canonicalize in the FilterSheet→URL adapter — emit `undefined` when the range equals
  the canonical `[0, FONT_GRADES.length-1]`, never a range equal to global bounds. `null`/absent
  is the sole "no grade filter" state. `sortSecondary` stays out of the URL (fixed tie-breaker).

## 5. Source-of-truth & localStorage reconciliation

- **Explicit routes** (`/board/$id/catalog?...`, shared links, back/forward, reopened tab):
  URL is truth, **verbatim**. localStorage is never consulted.
- **Bare `/` entry only** (cold PWA launch): the redirect *builds* the target URL from
  localStorage (last-active board + its last filters + angle). This is the **only** reader.
- `searchStore` is **deleted**. Per-`(board,angle)` filter localStorage is demoted to a
  cold-launch **seed** (write-through on filter change), not a render source.
- **iOS-parity note (intentional divergence):** cross-cold-launch per-slab filter memory now
  rides the seed rather than a live store; `sortSecondary` is forced to its default on shared
  links. Documented, accepted.

## 6. Load-bearing corrections (from review — must implement)

1. **`stripSearchParams` middleware** for omit-at-default (§4). The single most important
   primitive for clean/stable URLs; `validateSearch` alone does not do this.
2. **Kill in-render localStorage reads.** `CatalogScreen` currently calls `getAngle(board)` in
   render (and `getActiveHoldSetsRaw`), relying on the hook coincidentally re-rendering. Under
   routing, `angle` comes from `?angle`/the route — **not** a fresh `getAngle`. Otherwise URL and
   localStorage are two truths that drift.
3. **Angle write-through.** `angle` is plumbed through `useFilters`, `useSlab`, `recordRecent`,
   `useRecents`, and read by `MyBoards`. On catalog navigation, mirror the resolved `?angle` back
   into `boardStore` (`setAngle`) so `/boards` (which can't read the catalog route) stays coherent
   with a deep-linked `?angle`. Default angle is **per-board** (`defaultAngle(board)`), computed in
   the route (which has `$layoutId`) — not a static constant in `validateSearch`.
4. **`Navigation` is not a leaf.** The search `<input>` lives in the persistent shell, outside the
   routes. Introduce a thin router-aware **`AppShell`** between `RouterProvider` and `Navigation`
   that owns: the debounced local-state → `navigate({ replace })` writer, the **URL→input resync**
   (effect syncing local value when `?q` changes via Back/board-switch/deep-link; guard against
   clobbering in-flight typing), and **reset-on-board-switch** (key the field on `layoutId`,
   replicating today's `App.tsx:16-22` clear). `Navigation` itself becomes fully prop-driven
   (`query`, `onQueryChange`, `onClear`, `onNavigateBoards`). Migrate its hand-rolled input to the
   shadcn `Input` (web/CLAUDE.md rule — we're editing it).
5. **Drawer history semantics.** Track whether the drawer was push-opened this session.
   Gesture/backdrop close → `router.history.back()` if push-opened; else (cold deep-link entry)
   `navigate({ search: { problem: undefined }, replace: true })`. Prevents "Back re-opens the
   drawer" and "Back exits the app on a deep link."
6. **`ProblemDetail` → id-based.** Change from `initialIndex` to accept an **id (or resolved
   problem)** plus both the paging list (`displayed`, filtered) and the **full slab** for fallback
   resolution. Pager domain is the **filtered `displayed` list**; a deep-linked-but-excluded
   problem opens standalone with prev/next disabled (already the component's documented behavior).
7. **Provider order:** `StrictMode > AuthProvider > RouterProvider` in `main.tsx` (auth does async
   session work; must sit above the router). Confirm the bare-`/` redirect is side-effect-free
   (StrictMode double-invokes).
8. **Selector reads:** use `useSearch({ select })` at consumers — list keys off filter/sort/`q`;
   drawer keys off `problem` — so a pager swipe (high-frequency) doesn't re-render the list.
9. **PWA:** add `navigateFallbackDenylist` for hashed assets; verify the Google-OAuth return path
   (`detectSessionInUrl`) is served `index.html` and the token fragment survives; sanity-check the
   `autoUpdate` precache doesn't serve a stale `index.html` on deep links.
10. **Bundle/version:** pin `@tanstack/react-router`; run `tsc -b` against the schema-heavy route
    file early (repo is on TS ~6.0 / Vite 8). Acknowledge the router's ~25–40 KB gz footprint
    against the perf budget.

## 7. Test impact

- **Rewrite:** `App.test.tsx` (needs RouterProvider; decide whether "Add" auto-navigates),
  `Navigation.test.tsx` (new props, no `searchStore`), delete `searchStore.test.ts`,
  `FilterControls.test.tsx` (if it `renderHook`s `useFilters`).
- **Add:** `renderWithRouter(memoryHistory)` helper; route-level tests — `/` redirect, no-boards
  guard, unknown vs un-added board, **search-param round-trip** (state→URL→state incl. grade
  ordinals + `+`-free encoding), deep-link angle → `MyBoards` subtitle coherence, drawer
  open→swipe→swipe→Back, `ProblemDetail` id + full-slab fallback.
- **Untouched:** leaf tests (`CatalogList`, `ProblemDetail` minus prop change, `MyBoards`) and pure
  logic (`filters`, `grades`, `boardStore`, stores). `CatalogScreen` has no test today → the router
  seam is net-new coverage.

## 8. Deferred / follow-up (explicitly out of scope for this PR)

- **Scroll restoration** — needs a spike: `useElementScrollRestoration` wired to `app-scroll` AND
  either persist `CatalogList.visibleCount` (page/count) or move to `@tanstack/react-virtual` so a
  restored offset lands on real content. Accept jump-to-top on Back for v1.
- **`createPersistedStore` factory** — favorites/recents/previews copy-paste the same
  singleton+`useSyncExternalStore`+storage scaffold; routing removes the worst offender
  (`useFilters`) for free. Optional consolidation PR after routing is green.
- **`holds` UI** — the param is reserved; the "find problems using these holds" UI lands separately.

## 9. Rollout

1. Add + pin `@tanstack/react-router`; `router.tsx` + `AppShell`; `main.tsx` provider nesting.
2. Route tree + guards + bare-`/` redirect; PWA fallback config.
3. `validateSearch` + `stripSearchParams` schema (§4) with round-trip test.
4. Migrate `CatalogScreen`/`Navigation`/`ProblemDetail` to URL-driven (§6); delete `searchStore`.
5. Angle write-through + kill in-render getters (§6.2–6.3).
6. Rewrite/added tests (§7). `npm run lint && npm run build && npm test` green.
7. Update `docs/navigation-and-ui-flows.md` + `CONTEXT.md`; open PR from `feat/web-routing`.
