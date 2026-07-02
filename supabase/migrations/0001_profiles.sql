-- 0001_profiles.sql
-- User profiles: the identity anchor everything social hangs off.
--
-- One row per authenticated user, keyed to auth.uid(). Created client-side via
-- upsert ONLY after the user picks a valid handle — there is deliberately no
-- auto-create trigger, so the table never holds null-handle rows.
--
-- Later plans (cloud logbook sync, friends, shared session lists) add their own
-- tables with FKs back to profiles.id; nothing here should box those in.

-- citext gives us case-insensitive handle uniqueness ("Alex" == "alex") without a
-- separate lower() index. Ships with Supabase/Postgres; just needs enabling. Installed
-- into the `extensions` schema (Supabase convention — avoids the "extension in public"
-- linter warning). The `extensions` schema is on the default search_path, so the
-- `citext` type below still resolves unqualified.
create extension if not exists citext with schema extensions;

create table if not exists public.profiles (
    id           uuid        primary key references auth.users (id) on delete cascade,
    handle       citext      not null unique,
    display_name text        not null default '',
    avatar_url   text,        -- column reserved; avatar upload is deferred
    created_at   timestamptz not null default now(),

    -- 3–20 chars, lowercase a–z / 0–9 / underscore. citext makes the unique index
    -- case-insensitive; this check also pins the stored casing to lowercase so the
    -- client and DB agree on the canonical form.
    constraint handle_format check (handle ~ '^[a-z0-9_]{3,20}$')
);

comment on table public.profiles is
    'Public-facing user profile (handle + display name). One row per auth user, created after handle selection.';

-- Row-Level Security: profiles are world-readable to any signed-in user (so future
-- handle search / friend lookup works), but a user may only insert or mutate their
-- own row.
alter table public.profiles enable row level security;

create policy "Profiles are readable by authenticated users"
    on public.profiles
    for select
    to authenticated
    using (true);

create policy "Users can insert their own profile"
    on public.profiles
    for insert
    to authenticated
    with check (id = auth.uid());

create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

create policy "Users can delete their own profile"
    on public.profiles
    for delete
    to authenticated
    using (id = auth.uid());

-- Account deletion (App Store Guideline 5.1.1(v)).
--
-- The anon/authenticated client key cannot touch auth.users directly, and we do NOT
-- want to ship a service-role key in the app. This SECURITY DEFINER function runs as
-- its owner (postgres) and deletes the *calling* user only (auth.uid()). Deleting the
-- auth user cascades to public.profiles via the FK above. As later plans add
-- user-owned tables, give them `on delete cascade` FKs to auth.users (or profiles) so
-- they're swept up here too.
create or replace function public.delete_user()
    returns void
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Manual dashboard steps that have NO SQL equivalent (do these in the Supabase UI):
--
--   • Authentication → Providers → enable **Email** (magic link) and **Google**
--     (paste the Google OAuth client id + secret). Sign in with Apple is deferred
--     until paid Apple Developer enrollment.
--   • Authentication → URL Configuration → add the app's redirect URL
--     `com.boardly://auth-callback` to the allow-list.
--   • Authentication → set **"Link a new identity to an existing user" / account
--     linking = ON** so Google + magic link at the same verified email resolve to a
--     single user (one profile). Not settable from SQL.
--
-- See docs/social-accounts-login-SETUP.md for the full, ordered checklist.
-- ─────────────────────────────────────────────────────────────────────────────
