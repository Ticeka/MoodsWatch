alter table if exists public.battle_sessions
  add column if not exists deck_fingerprint text;

alter table if exists public.battle_sessions
  alter column deck_fingerprint set default '';

update public.battle_sessions
set deck_fingerprint = coalesce(
  nullif(deck_fingerprint, ''),
  array_to_string(
    array(
      select value::text
      from unnest(coalesce(title_ids, '{}'::bigint[])) as value
      order by value
    ),
    ':'
  ),
  ''
)
where coalesce(deck_fingerprint, '') = '';

create table if not exists public.battle_deck_rollups (
  deck_fingerprint text primary key,
  deck_key text not null,
  deck_label text not null,
  title_ids bigint[] not null default '{}',
  title_count integer not null default 0,
  completed_session_count integer not null default 0,
  total_vote_count integer not null default 0,
  community_winner_title_id bigint references public.canonical_titles(id) on delete set null,
  community_ranking jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_battle_sessions_deck_fingerprint_completed_at
on public.battle_sessions(deck_fingerprint, completed_at desc);

create or replace function public.refresh_battle_deck_rollup(p_deck_fingerprint text)
returns void
language plpgsql
as $$
declare
  v_session_count integer := 0;
  v_vote_count integer := 0;
  v_rollup record;
begin
  if p_deck_fingerprint is null or length(trim(p_deck_fingerprint)) = 0 then
    return;
  end if;

  select count(*), coalesce(sum(comparison_count), 0)
  into v_session_count, v_vote_count
  from public.battle_sessions
  where deck_fingerprint = p_deck_fingerprint
    and status = 'completed';

  if v_session_count = 0 then
    delete from public.battle_deck_rollups
    where deck_fingerprint = p_deck_fingerprint;
    return;
  end if;

  with matching_sessions as (
    select *
    from public.battle_sessions
    where deck_fingerprint = p_deck_fingerprint
      and status = 'completed'
  ),
  ranked_titles as (
    select
      (ranking_item.value ->> 'id')::bigint as title_id,
      avg(ranking_item.ordinality) as avg_rank,
      avg(coalesce((ranking_item.value ->> 'score')::numeric, 0)) as avg_score,
      count(*) filter (where ranking_item.ordinality = 1) as first_place_count
    from matching_sessions session_row
    cross join lateral jsonb_array_elements(session_row.ranking) with ordinality as ranking_item(value, ordinality)
    group by (ranking_item.value ->> 'id')::bigint
  ),
  ordered_ranking as (
    select jsonb_agg(
      jsonb_build_object(
        'id', title.id,
        'slug', title.slug,
        'title_en', title.title_en,
        'title_th', title.title_th,
        'title_native', title.title_native,
        'cover', title.cover,
        'type', title.type,
        'avg_rank', round(ranked.avg_rank::numeric, 3),
        'avg_score', round(ranked.avg_score::numeric, 3),
        'first_place_count', ranked.first_place_count
      )
      order by ranked.avg_rank asc, ranked.first_place_count desc, ranked.avg_score desc, title.id asc
    ) as ranking_json
    from ranked_titles ranked
    join public.canonical_titles title on title.id = ranked.title_id
  )
  select
    session_row.deck_key,
    session_row.deck_label,
    session_row.title_ids,
    coalesce(array_length(session_row.title_ids, 1), 0) as title_count,
    ordered_ranking.ranking_json,
    ((ordered_ranking.ranking_json -> 0) ->> 'id')::bigint as community_winner_title_id
  into v_rollup
  from (
    select deck_key, deck_label, title_ids
    from public.battle_sessions
    where deck_fingerprint = p_deck_fingerprint
      and status = 'completed'
    order by completed_at desc nulls last, updated_at desc
    limit 1
  ) session_row
  cross join ordered_ranking;

  insert into public.battle_deck_rollups (
    deck_fingerprint,
    deck_key,
    deck_label,
    title_ids,
    title_count,
    completed_session_count,
    total_vote_count,
    community_winner_title_id,
    community_ranking,
    updated_at
  )
  values (
    p_deck_fingerprint,
    v_rollup.deck_key,
    v_rollup.deck_label,
    v_rollup.title_ids,
    v_rollup.title_count,
    v_session_count,
    v_vote_count,
    v_rollup.community_winner_title_id,
    coalesce(v_rollup.ranking_json, '[]'::jsonb),
    now()
  )
  on conflict (deck_fingerprint) do update
  set deck_key = excluded.deck_key,
      deck_label = excluded.deck_label,
      title_ids = excluded.title_ids,
      title_count = excluded.title_count,
      completed_session_count = excluded.completed_session_count,
      total_vote_count = excluded.total_vote_count,
      community_winner_title_id = excluded.community_winner_title_id,
      community_ranking = excluded.community_ranking,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.handle_battle_rollup_refresh()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_battle_deck_rollup(old.deck_fingerprint);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_battle_deck_rollup(new.deck_fingerprint);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_battle_sessions_rollup_refresh on public.battle_sessions;
create trigger trg_battle_sessions_rollup_refresh
after insert or update or delete on public.battle_sessions
for each row
execute function public.handle_battle_rollup_refresh();

alter table if exists public.battle_sessions enable row level security;
alter table if exists public.battle_votes enable row level security;
alter table if exists public.battle_deck_rollups enable row level security;

drop policy if exists "Users can manage own battle sessions" on public.battle_sessions;
create policy "Users can manage own battle sessions"
on public.battle_sessions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own battle votes" on public.battle_votes;
create policy "Users can manage own battle votes"
on public.battle_votes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Public can read battle deck rollups" on public.battle_deck_rollups;
create policy "Public can read battle deck rollups"
on public.battle_deck_rollups for select
using (true);

do $$
declare
  v_deck_fingerprint text;
begin
  for v_deck_fingerprint in
    select distinct deck_fingerprint
    from public.battle_sessions
    where status = 'completed'
      and coalesce(deck_fingerprint, '') <> ''
  loop
    perform public.refresh_battle_deck_rollup(v_deck_fingerprint);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
