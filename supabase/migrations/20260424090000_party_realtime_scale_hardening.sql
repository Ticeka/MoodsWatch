-- Reduce Supabase Realtime WAL fan-out for party rooms.
-- The app now sends explicit Broadcast events for room/member/answer changes,
-- so these high-churn tables do not need Postgres Changes subscriptions.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['party_rooms', 'party_room_members', 'party_room_answers'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end $$;

-- Answer identity must be scoped to the room and match. The old
-- (round_id, member_token) constraint can collide across different rooms.
alter table if exists public.party_room_answers
  drop constraint if exists party_room_answers_round_id_member_token_key;

create unique index if not exists idx_party_room_answers_unique_room_match_round_member
  on public.party_room_answers(room_id, match_id, round_id, member_token);

create index if not exists idx_party_room_answers_room_match_round
  on public.party_room_answers(room_id, match_id, round_id);

create index if not exists idx_party_room_members_room_member
  on public.party_room_members(room_id, member_token);

-- Aggregate answer progress in one DB call instead of every client fetching all
-- members and all answers after each vote.
drop function if exists public.get_party_answer_progress(uuid, text, text);
drop function if exists public.get_party_answer_progress(uuid, text, text, text);

create function public.get_party_answer_progress(
  p_room_id uuid,
  p_match_id text,
  p_round_id text,
  p_member_token text
)
returns table (
  member_count bigint,
  answer_count bigint,
  all_answered boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_member_token), '');
  v_authorized boolean := false;
begin
  if v_token is not null then
    select exists (
      select 1 from public.party_room_members
      where room_id = p_room_id and member_token = v_token
    ) or exists (
      select 1 from public.party_rooms
      where id = p_room_id and host_member_token = v_token
    ) into v_authorized;
  end if;

  if not v_authorized then
    if not exists (
      select 1 from public.party_rooms
      where id = p_room_id and visibility = 'public'
    ) then
      raise exception 'Access denied.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return query
  with active_members as (
    select count(distinct member_token) as member_count
    from public.party_room_members
    where room_id = p_room_id
  ),
  submitted_answers as (
    select count(distinct member_token) as answer_count
    from public.party_room_answers
    where room_id = p_room_id
      and match_id = p_match_id
      and round_id = p_round_id
  )
  select
    active_members.member_count,
    submitted_answers.answer_count,
    active_members.member_count > 0
      and submitted_answers.answer_count >= active_members.member_count as all_answered
  from active_members
  cross join submitted_answers;
end;
$$;

grant execute on function public.get_party_answer_progress(uuid, text, text, text) to anon, authenticated;

-- Make stale-room cleanup actually remove long-dead rows as well as close
-- inactive lobbies. Deletes cascade to members, answers, and join requests.
create or replace function public.cleanup_stale_party_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  closed_count integer := 0;
  deleted_count integer := 0;
begin
  update public.party_rooms
  set status = 'closed'
  where status = 'lobby'
    and updated_at < now() - interval '2 hours';

  get diagnostics closed_count = row_count;

  delete from public.party_rooms
  where (
      status = 'closed'
      and updated_at < now() - interval '24 hours'
    )
    or (
      status in ('finished', 'live')
      and updated_at < now() - interval '12 hours'
    );

  get diagnostics deleted_count = row_count;
  affected := closed_count + deleted_count;
  return affected;
end;
$$;

-- Schedule cleanup when pg_cron is available. Supabase projects normally expose
-- it through the extensions schema; this block is idempotent for repeated pushes.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_cleanup_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if to_regclass('cron.job') is not null then
      select jobid
      into v_cleanup_job_id
      from cron.job
      where jobname = 'cleanup-stale-party-rooms'
      limit 1;
    end if;

    if v_cleanup_job_id is not null then
      execute 'select cron.unschedule($1)' using v_cleanup_job_id;
    end if;

    execute 'select cron.schedule($1, $2, $3)'
      using
        'cleanup-stale-party-rooms',
        '*/15 * * * *',
        'select public.cleanup_stale_party_rooms();';
  end if;
exception
  when undefined_function or invalid_schema_name or insufficient_privilege then
    null;
end $$;
