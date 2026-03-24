create or replace function public.refresh_battle_deck_rollup(p_deck_fingerprint text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
      max(nullif(ranking_item.value ->> 'slug', '')) as slug,
      max(nullif(ranking_item.value ->> 'title_en', '')) as title_en,
      max(nullif(ranking_item.value ->> 'title_th', '')) as title_th,
      max(nullif(ranking_item.value ->> 'title_native', '')) as title_native,
      max(nullif(ranking_item.value ->> 'cover', '')) as cover,
      max(nullif(ranking_item.value ->> 'type', '')) as type,
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
        'id', ranked.title_id,
        'slug', ranked.slug,
        'title_en', ranked.title_en,
        'title_th', ranked.title_th,
        'title_native', ranked.title_native,
        'cover', ranked.cover,
        'type', ranked.type,
        'avg_rank', round(ranked.avg_rank::numeric, 3),
        'avg_score', round(ranked.avg_score::numeric, 3),
        'first_place_count', ranked.first_place_count
      )
      order by ranked.avg_rank asc, ranked.first_place_count desc, ranked.avg_score desc, ranked.title_id asc
    ) as ranking_json
    from ranked_titles ranked
  ),
  latest_session as (
    select deck_key, deck_label, title_ids
    from public.battle_sessions
    where deck_fingerprint = p_deck_fingerprint
      and status = 'completed'
    order by completed_at desc nulls last, updated_at desc
    limit 1
  ),
  winner_lookup as (
    select case
      when ordered_ranking.ranking_json is null then null::bigint
      when not exists (
        select 1
        from public.canonical_titles title
        where title.id = ((ordered_ranking.ranking_json -> 0) ->> 'id')::bigint
      ) then null::bigint
      else ((ordered_ranking.ranking_json -> 0) ->> 'id')::bigint
    end as community_winner_title_id
    from ordered_ranking
  )
  select
    latest_session.deck_key,
    latest_session.deck_label,
    latest_session.title_ids,
    coalesce(array_length(latest_session.title_ids, 1), 0) as title_count,
    ordered_ranking.ranking_json,
    winner_lookup.community_winner_title_id
  into v_rollup
  from latest_session
  cross join ordered_ranking
  cross join winner_lookup;

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

revoke all on function public.refresh_battle_deck_rollup(text) from public;
grant execute on function public.refresh_battle_deck_rollup(text) to anon, authenticated, service_role;

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
