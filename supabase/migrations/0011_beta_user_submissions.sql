-- 0011_beta_user_submissions.sql
-- Phase 2 of the beta-videos feature: open the ONE write seam 0010 deliberately left closed —
-- let a signed-in user submit a *pending user* clip, and nothing else. Approval/rejection stay
-- service-role / dashboard only (no client UPDATE/DELETE policy), so the moderation boundary is
-- unbreakable from the client. (See docs/plans/2026-07-10-001-feat-web-beta-videos-plan.md, U1/U2.)
--
-- Four pieces:
--   1. INSERT policy — a full WITH CHECK clamp. Pins EVERY field the client must leave to the
--      server, not just the trust fields: a user row is source='user', status='pending',
--      provider='youtube', added_by=auth.uid(), not deleted, AND all metadata empty
--      (title/channel/views/is_short/duration_s). So "the client submits only a video_id" is a
--      DB-enforced invariant — a user cannot self-approve, impersonate, forge a seed row,
--      pre-tombstone, or forge attribution/views. Metadata can ONLY come from the trusted
--      server-side enrich pass (scripts/seed_beta_videos.py --enrich-pending, U6), which backfills
--      empty fields.
--   2. video_id format CHECK — defense-in-depth so a direct REST-API insert can't store a
--      malformed id even though the client extractor (U3) already validates it. Scoped to
--      provider='youtube' so a future Instagram row (different id shape) isn't blocked.
--   3. Per-user pending cap (BEFORE INSERT trigger) — at most 10 pending submissions per user, so
--      a scripted account can't flood the table or the notification channel. Counts *pending*
--      only, so it self-heals as the owner moderates. SECURITY DEFINER because the count must see
--      pending rows the RLS read-gate hides from the calling user.
--   4. Submission notification (AFTER INSERT trigger, WHEN source='user') — pings the owner via
--      pg_net. Source-filtered in the trigger because a dashboard Database Webhook cannot filter
--      by row and would fire on every seed insert too. Treated as a convenience nudge; the
--      authoritative "what's pending" list is the U6 enrich pass, which selects every pending row.
--
-- ⚠️ pg_net is a PROJECT PREREQUISITE, enabled once via the Supabase dashboard — NOT a
--    `create extension` line here (the extension isn't installed on the throwaway test Postgres,
--    which would break the RLS harness). The harness stubs net.http_post as a no-op logger.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INSERT policy: a signed-in user may add exactly one shape of row — a pending user clip with
--    server-owned metadata left empty. Mirrors 0003's list_problems insert policy (added_by =
--    auth.uid() in the WITH CHECK).
create policy "Signed-in users submit a pending beta"
    on public.problem_beta_videos for insert to authenticated
    with check (
        source     = 'user'
        and status = 'pending'
        and provider = 'youtube'
        and added_by = auth.uid()
        and not deleted
        -- metadata MUST originate from the trusted enrich pass (U6), never the client:
        and title = ''
        and channel = ''
        and views = 0
        and is_short = false
        and duration_s is null
    );
-- No UPDATE/DELETE policy for users — moderation (approve/reject/soft-delete) is service-role only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. video_id format CHECK (YouTube-scoped). All existing 0010 rows are youtube with real 11-char
--    ids, so the constraint applies cleanly; instagram (reserved for later) is left unconstrained.
alter table public.problem_beta_videos
    add constraint problem_beta_videos_video_id_fmt
    check (provider <> 'youtube' or video_id ~ '^[A-Za-z0-9_-]{11}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-user pending-submission cap. SECURITY DEFINER so the count sees pending rows the
--    read-gate would otherwise hide from the calling user (else the cap would always read 0).
create or replace function public.enforce_beta_pending_cap()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_catalog
as $$
declare _pending int;
begin
    select count(*) into _pending
    from public.problem_beta_videos
    where added_by = new.added_by and status = 'pending' and not deleted;
    if _pending >= 10 then
        raise exception
            'Beta submission limit reached: % pending (max 10). Wait for review before adding more.',
            _pending;
    end if;
    return new;
end $$;

drop trigger if exists beta_pending_cap on public.problem_beta_videos;
create trigger beta_pending_cap
    before insert on public.problem_beta_videos
    for each row when (new.source = 'user')
    execute function public.enforce_beta_pending_cap();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Submission notification. Reads the owner's webhook URL from a DB setting; a no-op when the
--    setting is unset (so it's inert until configured). Fire-and-forget via pg_net — a failed
--    or dropped notification never blocks the insert, and the U6 enrich pass is the reconciliation
--    backstop. WHEN (new.source='user') so seed inserts never notify.
create or replace function public.notify_beta_submission()
    returns trigger
    language plpgsql
as $$
declare _url text := current_setting('app.beta_webhook_url', true);
begin
    if _url is null or _url = '' then
        return null;  -- notifications not configured — inert
    end if;
    perform net.http_post(
        url     := _url,
        body    := jsonb_build_object(
            'event',             'beta_submission',
            'source_catalog_id', new.source_catalog_id,
            'video_id',          new.video_id,
            'added_by',          new.added_by
        ),
        headers := jsonb_build_object('Content-Type', 'application/json')
    );
    return null;  -- AFTER trigger; return value ignored
end $$;

drop trigger if exists beta_submission_notify on public.problem_beta_videos;
create trigger beta_submission_notify
    after insert on public.problem_beta_videos
    for each row when (new.source = 'user')
    execute function public.notify_beta_submission();

-- ─────────────────────────────────────────────────────────────────────────────
-- Manual steps (no SQL equivalent):
--   1. Enable pg_net once on the project: Dashboard → Database → Extensions → enable `pg_net`.
--   2. Set the notification target so the trigger fires (empty = inert):
--        alter database postgres set app.beta_webhook_url = 'https://<owner-channel-webhook>';
--      (a Slack/Discord incoming webhook or an email relay). Never commit the URL.
--   3. Apply this migration (SQL Editor → paste + Run, or `supabase db push`).
--
-- Moderation runbook (dashboard — Table Editor or a saved SQL snippet):
--   • First enrich pending metadata:  python scripts/seed_beta_videos.py --enrich-pending
--     (fills title/channel/views/duration_s/is_short; also prints the pending queue — U6.)
--   • APPROVE a clip:
--        update public.problem_beta_videos set status = 'approved' where id = '<id>';
--   • REJECT a clip — MUST soft-delete too, not status alone (the dedupe index is
--     `where not deleted`; a status-only reject strands the tuple and the clip can never be
--     re-added):
--        update public.problem_beta_videos set status = 'rejected', deleted = true where id = '<id>';
-- ─────────────────────────────────────────────────────────────────────────────
