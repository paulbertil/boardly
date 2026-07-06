# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Logbook

### Ascent
A single logged tick of a climbing problem by a user — either a send or an attempt. Repeats are first-class: logging the same problem again creates another Ascent, not an edit of the previous one. An Ascent records which board it was logged on and, for an official problem, a reference to the Catalog Problem.

Lifecycle note: an Ascent is either sent or an Attempt (never both), and is soft-deleted (tombstoned) rather than removed, so history and cross-device sync stay consistent.

### Sent
The status of a problem the user has topped/completed at least once — i.e. it has an Ascent recorded as a send. Distinct from merely attempted: only Sent problems earn the completion check in the UI and count toward progress (e.g. the grade pyramid).

### Attempt
An Ascent the user logged as tried but not topped. It appears in the Logbook but does not mark the problem [[Sent]] and is excluded from completion counts. In the UI a problem's row shows a Sent check or an Attempt affordance, never both.

### Logbook
The user's history of [[Ascent]]s, viewed per [[Board Layout]]. The source of truth for whether a problem is [[Sent]].

## Catalog

### Catalog Problem
An official, shared board problem identified by a stable catalog id — as opposed to a user-authored problem, which has no catalog id. An [[Ascent]] links to a Catalog Problem by that id; the link is how the [[Logbook]] knows a given official problem is [[Sent]].

### Board Layout
A specific MoonBoard configuration. [[Ascent]]s and [[Catalog Problem]]s are scoped to one Board Layout, so a send on one board does not count on another.
