-- 0009_avatars.sql
-- Profile avatars: the first user-facing image upload in the app.
--
-- `profiles.avatar_url` has existed (reserved) since 0001 but was never written. This
-- migration turns it on: a PUBLIC `avatars` bucket, owner-scoped storage RLS, an
-- account-deletion sweep, and a CHECK that pins the stored value to an in-bucket object
-- path so it can never be an off-domain tracking pixel.
--
-- SECURITY MODEL (why the pieces below exist):
--   • The bucket is PUBLIC so avatars render via `/storage/v1/object/public/avatars/…`
--     in any `<img>` (navbar, drawer, session rosters) with no signed-URL plumbing.
--   • Because it is public, the storage.objects SELECT policy is scoped to the OWNER
--     (authenticated + own folder) — NOT world/anon — so nobody can `list()`/enumerate
--     every user's `{uid}/` folder and face photo. Public *serving* of a known URL still
--     works (the public endpoint bypasses RLS); only listing is closed.
--   • `profiles.avatar_url` stores the OBJECT PATH (`{uid}/{uuid}.webp`), NOT a full URL.
--     `profiles` is world-readable and the value is rendered as `<img src>` in other
--     members' browsers, so an attacker-set external URL would be a tracking-pixel / IP
--     leak. Storing only a path — pinned by a CHECK to `{uuid}/{uuid}.webp` — makes an
--     off-domain value structurally impossible. The app derives the public URL at read
--     time via `storage.from('avatars').getPublicUrl(path)`.
--
-- Manual step: paste this whole file into the Supabase SQL Editor and Run (as 0008), OR
-- create the bucket in the dashboard (Storage → New bucket → "avatars", PUBLIC, 2 MB
-- limit, allowed MIME `image/webp`) and the insert becomes a no-op. Apply this to the
-- production project BEFORE deploying the avatar UI, or uploads fail against a missing
-- bucket. RLS is verified offline first: supabase/migrations/tests/run_rls_test.sh.

-- ─────────────────────────────────────────────────────────────────────────────
-- Public bucket. 2 MiB per-file cap (the client downscales to a ~50–150 KB WebP; this is
-- just a server-side backstop). `allowed_mime_types` = image/webp only: the client canvas
-- pipeline always emits WebP, so the allowlist governs the stored object, never the user's
-- source file (they may pick any image; it is re-encoded before upload).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- storage.objects RLS for the avatars bucket. Every object lives under `{auth.uid()}/…`;
-- the first path segment (storage.foldername(name))[1] is the owning user's id. `with
-- check` on insert/update blocks folder-spoofing (crafting `{victimUUID}/x.webp`). RLS is
-- default-deny, so scoping each policy to `bucket_id = 'avatars'` leaves every other bucket
-- (and the anon role) untouched — anon gets NO policy here, so it cannot list the bucket.
create policy "Users read own avatar objects"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "Users upload own avatar objects"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "Users update own avatar objects"
    on storage.objects for update to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
create policy "Users delete own avatar objects"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- Pin avatar_url to an in-bucket object PATH: `{uid}/{file}.webp`, two UUID-shaped
-- segments and a .webp suffix. `null` (no avatar) is always allowed. This is the control
-- that makes an off-domain / tracking-pixel value impossible — there is no host to spoof.
-- Existing rows are all NULL (avatar upload was deferred), so the constraint validates
-- clean. saveProfile mirrors this check client-side (defense in depth).
alter table public.profiles
    add constraint avatar_url_is_bucket_path
    check (
        avatar_url is null
        or avatar_url ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- GDPR erasure (App Store 5.1.1(v)): account deletion must sweep the user's uploaded
-- avatars too — storage.objects does NOT cascade on user delete (owner FK is set-null),
-- so without this a deleted user's face photo (personal data) stays publicly fetchable.
-- This REPLACES delete_user() again (0008 added the logbook-imports sweep); keep BOTH
-- sweeps here, then delete the account. SECURITY DEFINER so it can reach storage.objects.
create or replace function public.delete_user()
    returns void
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    -- Sweep the caller's uploaded logbook-import files (from 0008 — keep it).
    delete from storage.objects
    where bucket_id = 'logbook-imports'
      and (storage.foldername(name))[1] = auth.uid()::text;

    -- Sweep the caller's uploaded avatar files.
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text;

    delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
