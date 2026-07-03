-- 0004_list_rpcs.sql
-- The two RPCs collaborative lists need on top of the tables in 0003. Both are
-- SECURITY DEFINER (run as owner), mirroring public.delete_user() (0001): they do a
-- thing the caller's own RLS grants can't, but only ever on the caller's behalf and
-- gated by an explicit membership/token check.
--
-- PostgREST maps the JSON body keys of an rpc() call to the argument names below, so
-- the iOS client calls these as:
--   client.rpc("join_list_by_token",  params: ["p_token":   token])
--   client.rpc("list_member_status",  params: ["p_list_id": listId])
-- (The p_ prefix keeps the argument names from colliding with the identically-named
-- columns referenced inside each function body.)

-- ─────────────────────────────────────────────────────────────────────────────
-- join_list_by_token: trade a share-link's invite_token for membership. A not-yet-member
-- cannot see the list under RLS (0003), so cannot INSERT their own list_members row —
-- this DEFINER function does it for them after validating the token. auth.uid() still
-- resolves to the *calling* user inside a DEFINER function (it reads the request JWT,
-- not the function owner). Idempotent: a second join is a no-op. Returns the list id so
-- the client can navigate straight to it.
create or replace function public.join_list_by_token(p_token uuid)
    returns uuid
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    target_list uuid;
begin
    select id into target_list
    from public.lists
    where invite_token = p_token and deleted = false;

    if target_list is null then
        raise exception 'invalid or expired invite token';
    end if;

    insert into public.list_members (list_id, user_id)
    values (target_list, auth.uid())
    on conflict do nothing;

    return target_list;
end;
$$;

revoke all on function public.join_list_by_token(uuid) from public;
grant execute on function public.join_list_by_token(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- list_member_status: the group-status read behind the per-person badges and the
-- group filter. Returns the MINIMAL projection — one row per (member, catalog problem
-- they've logged) with only the sent flag. Deliberately NOT the ascents row: no
-- comment, grade, date, tries — those never cross to co-members (the privacy contract).
-- No timestamp is returned either, which sidesteps the Postgres-6-digit vs
-- ISO8601-3-digit decoding trap the sync path has to handle.
--
-- Gated on membership: a non-member (or someone who left) is rejected. Scoped to the
-- list's board. The client folds these rows into, per member, tried = {catalog ids
-- present} and sent = {catalog ids with sent = true}.
--
-- Column references in the query are qualified (a./m.), so the RETURNS TABLE output
-- names (user_id/source_catalog_id/sent) do not create ambiguity.
create or replace function public.list_member_status(p_list_id uuid)
    returns table (user_id uuid, source_catalog_id text, sent boolean)
    language plpgsql
    security definer
    set search_path = public
    stable
as $$
begin
    if not public.is_list_member(p_list_id, auth.uid()) then
        raise exception 'not a member of this list';
    end if;

    return query
    select a.user_id, a.source_catalog_id, a.sent
    from public.ascents a
    join public.list_members m on m.user_id = a.user_id
    where m.list_id = p_list_id
      and a.board_layout_id = (select l.board_layout_id from public.lists l where l.id = p_list_id)
      and a.deleted = false
      and a.source_catalog_id is not null;
end;
$$;

revoke all on function public.list_member_status(uuid) from public;
grant execute on function public.list_member_status(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Manual step (no SQL equivalent): apply this migration AFTER 0003 (SQL Editor →
-- paste + Run, or `supabase db push`). See docs/social-accounts-login-SETUP.md.
--
-- Two-account verification gate (do NOT skip — "the migration applied" is not proof the
-- policies scope right): with accounts A and B, confirm B cannot select A's list,
-- cannot call list_member_status on it, and — once B joins via token — sees exactly
-- (user_id, source_catalog_id, sent) with no extra columns. See the plan's Verification
-- Contract.
-- ─────────────────────────────────────────────────────────────────────────────
