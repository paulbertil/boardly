---
title: Snapshot a reactive store's array when a view both pages over it and writes back to it
date: 2026-07-06
category: docs/solutions/architecture-patterns
module: web catalog (recently-viewed pager)
problem_type: architecture_pattern
component: frontend_stimulus
severity: medium
applies_when:
  - A detail/pager/carousel is sourced from a reactive store (e.g. useSyncExternalStore)
  - Navigating that view records an action back into the same store (view history, recency, LRU)
  - The store mutation reorders or removes the items the user is currently browsing
tags:
  - reactive-store
  - usesyncexternalstore
  - snapshot
  - pager
  - react
  - ui-state
  - recently-viewed
---

# Snapshot a reactive store's array when a view both pages over it and writes back to it

## Context

The catalog's "recently viewed" is backed by a reactive store — `recentsStore.ts` exposes
`useRecents` via `useSyncExternalStore`, and `recordRecent` moves a problem to the front of
the list (dedup + cap). Tapping a recent opens the shared detail pager (`ProblemDetail`),
which does two things at once: it **pages across a source list** (prev/next), and it
**records every shown problem as "viewed"** — which writes back into that same store.

If the pager had paged over the recents list read *live* from the store, each swipe would
call `recordRecent`, move the shown problem to the front, and reshuffle the very list the
user was swiping through — mid-interaction.

## Guidance

When a paging/detail view is fed by an array **derived from a reactive store**, and
interacting with that view **writes back** to the store, capture the source array **at open
time** and page over that snapshot. Do not re-read the store live on each render of the view.

In this codebase the boundary is the open-target:

```tsx
// RecentsSheet.tsx — resolve the store into an array, hand it over at tap time
const recentProblems = useMemo(() => resolve(recentIds, problems), [problems, recentIds])
onSelect(recentProblems, tappedIndex)   // pass the snapshot + index

// CatalogScreen.tsx — capture it; the pager pages over THIS array, not a live read
const openRecent = (stack, index) => setOpenTarget({ list: stack, index })
// <ProblemDetail problems={openTarget.list} initialIndex={openTarget.index} />
```

`ProblemDetail` records views via `recordRecent` as the shown problem changes, but that only
mutates the store — it never touches `openTarget.list`. So the stack the user swipes stays
exactly as it was when they tapped, even as the store reorders underneath for the *next* open.

## Why This Matters

A component that both **consumes** and **mutates** the same external store creates a feedback
loop: its own writes flow back into its own reads. Without an explicit snapshot boundary the
symptoms are subtle and hard to reproduce — the list reorders under the user's finger,
prev/next boundaries shift, and an item can vanish from the sequence you're paging through.
Snapshotting makes the interaction deterministic for the duration it's open, while still
letting the store record history honestly for the next open.

## When to Apply

- A detail/pager/carousel sourced from a store you also write to during navigation.
- Move-to-front / recency / LRU / "recently viewed" stores feeding a list the user browses.
- Any `useSyncExternalStore`-backed list where acting on an item reorders or removes items.

The dual test: **does navigating the view mutate the store the view is derived from?** If yes,
snapshot at open. If the view only reads (no write-back), a live read is fine.

## Examples

**Recents (needs the snapshot):** paging records views → snapshot the recents array at tap.

**Contrast — list taps (no snapshot concern):** opening a problem from the main catalog list
pages over `displayed` (a filtered derivation of the slab). The pager doesn't mutate
`displayed`, so there's no feedback loop — though it happens to be captured the same way
(`{ list: displayed, index }`), which is what let a single open-target serve both paths.

## Related

- Plan: `docs/plans/2026-07-06-001-feat-web-recents-plan.md` (KTD5, U5)
- Files: `web/src/catalog/RecentsSheet.tsx`, `web/src/catalog/CatalogScreen.tsx`,
  `web/src/catalog/ProblemDetail.tsx`, `web/src/catalog/recentsStore.ts`
