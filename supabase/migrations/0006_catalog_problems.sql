-- 0006_catalog_problems.sql
-- (Numbered 0006, not 0003: 0003-0005 are reserved for the in-flight collaborative-lists
--  branch so the two don't collide when they merge.)
-- The official MoonBoard problem catalog, promoted from bundled read-only JSON to a
-- server-distributed table so every client (iOS, PWA, future Android) stays in sync
-- instead of drifting on divergent bundles. This retires the previous arrangement in
-- 0002's header ("catalog problems are NOT synced — they ship as bundled read-only
-- JSON"): ascents still store an opaque source_catalog_id, but that id now resolves
-- against a synced client cache of THIS table rather than the app bundle. (Future
-- consumers like collaborative lists' list_problems resolve the same way.)
--
-- Scope: the CURATED catalog only. User-generated custom boards / spraywalls (private,
-- or shared with specific people/groups) are DEFERRED and will land as SEPARATE tables
-- (custom_boards + membership/ACL + custom_board_problems) — their access model is
-- owner/ACL-scoped, unlike this world-readable table, so they must NOT be folded in here.
--
-- Distribution model (see the plan): download-and-cache, lazy per board. A client caches
-- each (layout_id, angle) "slab" locally and pulls deltas WHERE updated_at > cursor,
-- reusing the high-water-mark spine from 0002 (server-authoritative updated_at trigger +
-- `deleted` tombstone). Nothing syncs on cold start; a slab syncs when the user needs it
-- (adds/activates its board, or opens a collaborative list scoped to it).
--
-- Identity: source_catalog_id is a UUIDv5 string, globally unique across every board and
-- angle (verified against catalog-data/: 11,915 rows, zero collisions) — a valid natural
-- primary key, and already what ascents.source_catalog_id stores. So no surrogate key or
-- (id, angle) composite is needed.
--
-- RLS: PUBLIC read. Catalog browsing works logged-out and offline (after one sync), so
-- this is the FIRST `to anon` policy in the schema — every other table is owner- or
-- member-scoped. There are no client writes: the import runs with the service-role key,
-- which bypasses RLS entirely.

-- ─────────────────────────────────────────────────────────────────────────────
-- catalog_problems: mirrors the shape of public.user_problems (0002) — same holds jsonb
-- payload of {c,r,t} objects — plus the (layout_id, angle) slab dimensions the catalog
-- needs and the isBenchmark/setter/stars/repeats metadata the browser shows. Reuses the
-- server-authoritative public.set_updated_at() from 0002 (do NOT redefine it here).
create table if not exists public.catalog_problems (
    source_catalog_id text        primary key,
    layout_id         int         not null,
    angle             int         not null,
    name              text        not null default '',
    grade             text        not null default '',
    user_grade        text,
    setter            text        not null default '',
    stars             int         not null default 0,
    repeats           int         not null default 0,
    is_benchmark      boolean     not null default false,
    method            text,
    holds             jsonb       not null default '[]'::jsonb,
    updated_at        timestamptz not null default now(),
    deleted           boolean     not null default false
);

comment on table public.catalog_problems is
    'Official MoonBoard catalog, server-distributed and client-cached per (layout_id, angle) slab. Public read; soft-deleted via `deleted`. Curated only — custom boards are separate tables (deferred).';

-- Lazy per-board pulls filter by slab, then scan by the sync cursor.
create index if not exists catalog_problems_slab_idx
    on public.catalog_problems (layout_id, angle);
create index if not exists catalog_problems_updated_idx
    on public.catalog_problems (updated_at);

-- Reuse the server-authoritative updated_at trigger from 0002. Clients never set
-- updated_at; they read it back to advance their per-slab pull cursor.
create trigger catalog_problems_set_updated_at
    before insert or update on public.catalog_problems
    for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: world-readable, no client writes. The `to anon, authenticated` select is
-- deliberate — browsing must work before sign-in. Imports use the service-role key.
alter table public.catalog_problems enable row level security;

create policy "Anyone reads the catalog"
    on public.catalog_problems for select to anon, authenticated
    using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Manual step (no SQL equivalent): apply this migration to the Supabase project
-- (SQL Editor → paste + Run, or `supabase db push`), then seed it with
-- `scripts/import_catalog.py --all`. See docs/social-accounts-login-SETUP.md and
-- docs/catalog-data-pipeline.md.
-- ─────────────────────────────────────────────────────────────────────────────
