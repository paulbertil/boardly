-- RLS assertions for 0010_problem_beta_videos.sql. Run after stub_supabase.sql + the 0010
-- migration + the "Supabase default grants" step (see run_rls_test.sh). Every negative test
-- wraps the denied operation in a block and RAISES if it was wrongly allowed; psql runs with
-- ON_ERROR_STOP so any raise fails the whole run.
\set ON_ERROR_STOP on
\set U '11111111-1111-1111-1111-111111111111'

-- A signed-in user (added_by FK target / auth.uid() for the authenticated-role tests).
insert into auth.users (id) values (:'U');

-- Seed rows as superuser (the service-role equivalent — bypasses RLS): one approved-live
-- row plus a pending, a rejected, and an approved-but-soft-deleted row that must all be
-- hidden from public reads.
insert into public.problem_beta_videos (source_catalog_id, video_id, source, status) values
    ('prob-A', 'vid-approved', 'seed', 'approved'),
    ('prob-A', 'vid-pending',  'seed', 'pending'),
    ('prob-A', 'vid-rejected', 'seed', 'rejected');
insert into public.problem_beta_videos (source_catalog_id, video_id, source, status, deleted)
    values ('prob-A', 'vid-approved-del', 'seed', 'approved', true);

-- ── Anonymous read: approved + not-deleted ONLY ──────────────────────────────
set role anon;
do $$
begin
    assert (select count(*) from public.problem_beta_videos) = 1,
        'FAIL: anon sees more than the 1 approved live row';
    assert (select video_id from public.problem_beta_videos) = 'vid-approved',
        'FAIL: anon sees the wrong row (pending/rejected/deleted leaked)';
    raise notice 'PASS: anon reads approved+live only (pending/rejected/soft-deleted hidden)';
end $$;

-- anon cannot write (no policy → RLS default-deny on INSERT).
do $$
begin
    begin
        insert into public.problem_beta_videos (source_catalog_id, video_id, source, status)
        values ('prob-A', 'vid-anon', 'user', 'approved');
        raise exception 'FAIL: anon inserted a beta video';
    exception when insufficient_privilege then
        raise notice 'PASS: anon insert denied';
    end;
end $$;

-- ── Authenticated read: same approved-only gate (no pending/rejected leak) ─────
reset role;
set role authenticated;
select set_config('test.uid', :'U', false);
do $$
begin
    assert (select count(*) from public.problem_beta_videos) = 1,
        'FAIL: authenticated sees more than approved live rows';
    assert (select video_id from public.problem_beta_videos) = 'vid-approved',
        'FAIL: authenticated sees the wrong row (pending/rejected/deleted leaked)';
    raise notice 'PASS: authenticated reads approved+live only';
end $$;

-- Phase 1: no client write policy — a signed-in user cannot INSERT (even a pending row).
do $$
begin
    begin
        insert into public.problem_beta_videos (source_catalog_id, video_id, source, status, added_by)
        values ('prob-A', 'vid-user', 'user', 'pending', auth.uid());
        raise exception 'FAIL: authenticated inserted a beta video (Phase 1 has no write policy)';
    exception when insufficient_privilege then
        raise notice 'PASS: authenticated insert denied (Phase 1 write-closed)';
    end;
end $$;

-- No UPDATE/DELETE policy → those commands match zero rows (RLS filters everything out),
-- so a signed-in user cannot mutate or soft-delete a seeded beta.
do $$
declare _n int;
begin
    update public.problem_beta_videos set title = 'hacked' where source_catalog_id = 'prob-A';
    get diagnostics _n = row_count;
    assert _n = 0, 'FAIL: authenticated updated ' || _n || ' beta row(s) (Phase 1 write-closed)';
    delete from public.problem_beta_videos where source_catalog_id = 'prob-A';
    get diagnostics _n = row_count;
    assert _n = 0, 'FAIL: authenticated deleted beta row(s) (Phase 1 write-closed)';
    raise notice 'PASS: authenticated update/delete affect zero rows (no write policy)';
end $$;

-- ── Partial dedupe index: blocks duplicate LIVE clip, allows re-add after removal ──
reset role;  -- back to superuser (service-role equivalent) for seed-side integrity checks
do $$
begin
    begin
        insert into public.problem_beta_videos (source_catalog_id, video_id, source, status)
        values ('prob-A', 'vid-approved', 'seed', 'approved');  -- dup of a live row
        raise exception 'FAIL: duplicate live (problem, provider, video) allowed';
    exception when unique_violation then
        raise notice 'PASS: partial unique index blocks a duplicate live clip';
    end;
end $$;

do $$
begin
    -- Soft-remove the live clip, then the same key inserts fine (re-add works — the exact
    -- case a full table constraint would have permanently blocked).
    update public.problem_beta_videos set deleted = true
        where source_catalog_id = 'prob-A' and video_id = 'vid-approved';
    insert into public.problem_beta_videos (source_catalog_id, video_id, source, status)
        values ('prob-A', 'vid-approved', 'seed', 'approved');
    raise notice 'PASS: a soft-deleted clip can be re-added (partial index, not table constraint)';
end $$;

do $$
begin
    -- provider is part of the dedupe key: the SAME (problem, video) on a different provider is
    -- a distinct clip and must be allowed (guards against the index dropping the provider col).
    insert into public.problem_beta_videos (source_catalog_id, provider, video_id, source, status)
        values ('prob-A', 'instagram', 'vid-approved', 'seed', 'approved');
    raise notice 'PASS: same (problem, video) on a different provider is allowed (provider in dedupe key)';
end $$;

\echo 'ALL 0010 RLS ASSERTIONS PASSED'
