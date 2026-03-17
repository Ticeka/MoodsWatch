create or replace function public.admin_merge_duplicate_titles(
  p_candidate_id bigint,
  p_primary_title_id bigint,
  p_duplicate_title_id bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary canonical_titles%rowtype;
  v_duplicate canonical_titles%rowtype;
  v_action_id bigint;
  v_candidate duplicate_candidates%rowtype;
begin
  if not public.is_staff_user() then
    raise exception 'Only staff users can merge duplicate titles';
  end if;

  if p_primary_title_id is null or p_duplicate_title_id is null or p_primary_title_id = p_duplicate_title_id then
    raise exception 'Primary and duplicate title ids must be different';
  end if;

  select *
  into v_candidate
  from public.duplicate_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'Duplicate candidate % not found', p_candidate_id;
  end if;

  if v_candidate.status not in ('approved', 'merged') then
    raise exception 'Duplicate candidate % must be approved before merge', p_candidate_id;
  end if;

  if not (
    (v_candidate.title_a_id = p_primary_title_id and v_candidate.title_b_id = p_duplicate_title_id)
    or
    (v_candidate.title_a_id = p_duplicate_title_id and v_candidate.title_b_id = p_primary_title_id)
  ) then
    raise exception 'Candidate % does not match the supplied title ids', p_candidate_id;
  end if;

  select * into v_primary
  from public.canonical_titles
  where id = p_primary_title_id;

  if not found then
    raise exception 'Primary title % not found', p_primary_title_id;
  end if;

  select * into v_duplicate
  from public.canonical_titles
  where id = p_duplicate_title_id;

  if not found then
    raise exception 'Duplicate title % not found', p_duplicate_title_id;
  end if;

  insert into public.title_aliases (canonical_title_id, alias, language_code, alias_type, is_primary, source_provider)
  select p_primary_title_id, alias, language_code, alias_type, is_primary, source_provider
  from public.title_aliases
  where canonical_title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.title_aliases
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_genres (canonical_title_id, genre_name)
  select p_primary_title_id, genre_name
  from public.title_genres
  where canonical_title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.title_genres
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_tags (canonical_title_id, tag_name, weight, source_provider)
  select p_primary_title_id, tag_name, weight, source_provider
  from public.title_tags
  where canonical_title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.title_tags
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_moods (canonical_title_id, mood_id)
  select p_primary_title_id, mood_id
  from public.title_moods
  where canonical_title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.title_moods
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_availability (canonical_title_id, platform_name, region_code, url, is_official, created_at)
  select p_primary_title_id, platform_name, region_code, url, is_official, created_at
  from public.title_availability
  where canonical_title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.title_availability
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_source_refs (
    canonical_title_id,
    provider,
    external_id,
    external_url,
    source_priority,
    raw_payload,
    fetched_at,
    last_synced_at
  )
  select
    p_primary_title_id,
    provider,
    external_id,
    external_url,
    source_priority,
    raw_payload,
    fetched_at,
    last_synced_at
  from public.title_source_refs
  where canonical_title_id = p_duplicate_title_id
  on conflict (provider, external_id) do update
  set
    canonical_title_id = excluded.canonical_title_id,
    external_url = coalesce(public.title_source_refs.external_url, excluded.external_url),
    source_priority = least(public.title_source_refs.source_priority, excluded.source_priority),
    raw_payload = coalesce(public.title_source_refs.raw_payload, excluded.raw_payload),
    last_synced_at = greatest(public.title_source_refs.last_synced_at, excluded.last_synced_at);

  delete from public.title_source_refs
  where canonical_title_id = p_duplicate_title_id;

  insert into public.title_relations (source_title_id, target_title_id, relation_type, source_provider)
  select
    case when source_title_id = p_duplicate_title_id then p_primary_title_id else source_title_id end,
    case when target_title_id = p_duplicate_title_id then p_primary_title_id else target_title_id end,
    relation_type,
    source_provider
  from public.title_relations
  where (source_title_id = p_duplicate_title_id or target_title_id = p_duplicate_title_id)
    and (
      case when source_title_id = p_duplicate_title_id then p_primary_title_id else source_title_id end
      <>
      case when target_title_id = p_duplicate_title_id then p_primary_title_id else target_title_id end
    )
  on conflict do nothing;

  delete from public.title_relations
  where source_title_id = p_duplicate_title_id or target_title_id = p_duplicate_title_id;

  insert into public.user_lists (
    user_id,
    title_id,
    list_status,
    progress_episode,
    progress_chapter,
    score,
    note,
    created_at,
    updated_at
  )
  select
    user_id,
    p_primary_title_id,
    list_status,
    progress_episode,
    progress_chapter,
    score,
    note,
    created_at,
    updated_at
  from public.user_lists
  where title_id = p_duplicate_title_id
  on conflict (user_id, title_id) do update
  set
    progress_episode = greatest(coalesce(public.user_lists.progress_episode, 0), coalesce(excluded.progress_episode, 0)),
    progress_chapter = greatest(coalesce(public.user_lists.progress_chapter, 0), coalesce(excluded.progress_chapter, 0)),
    score = greatest(coalesce(public.user_lists.score, 0), coalesce(excluded.score, 0)),
    note = coalesce(nullif(public.user_lists.note, ''), excluded.note),
    updated_at = greatest(public.user_lists.updated_at, excluded.updated_at);

  delete from public.user_lists
  where title_id = p_duplicate_title_id;

  insert into public.user_favorite_titles (user_id, title_id, created_at)
  select user_id, p_primary_title_id, created_at
  from public.user_favorite_titles
  where title_id = p_duplicate_title_id
  on conflict do nothing;

  delete from public.user_favorite_titles
  where title_id = p_duplicate_title_id;

  insert into public.user_hidden_titles (user_id, title_id, created_at, hide_from_recommendations, hide_from_discovery)
  select user_id, p_primary_title_id, created_at, hide_from_recommendations, hide_from_discovery
  from public.user_hidden_titles
  where title_id = p_duplicate_title_id
  on conflict (user_id, title_id) do update
  set
    hide_from_recommendations = public.user_hidden_titles.hide_from_recommendations or excluded.hide_from_recommendations,
    hide_from_discovery = public.user_hidden_titles.hide_from_discovery or excluded.hide_from_discovery;

  delete from public.user_hidden_titles
  where title_id = p_duplicate_title_id;

  update public.user_title_history
  set title_id = p_primary_title_id
  where title_id = p_duplicate_title_id;

  update public.user_consumption_sessions
  set title_id = p_primary_title_id
  where title_id = p_duplicate_title_id;

  update public.content_reports
  set title_id = p_primary_title_id
  where title_id = p_duplicate_title_id;

  insert into public.editor_collection_items (collection_id, title_id, position, note, created_at)
  select collection_id, p_primary_title_id, position, note, created_at
  from public.editor_collection_items
  where title_id = p_duplicate_title_id
  on conflict (collection_id, title_id) do nothing;

  delete from public.editor_collection_items
  where title_id = p_duplicate_title_id;

  update public.catalog_merge_queue
  set
    source_title_id = case when source_title_id = p_duplicate_title_id then p_primary_title_id else source_title_id end,
    candidate_title_id = case when candidate_title_id = p_duplicate_title_id then p_primary_title_id else candidate_title_id end
  where source_title_id = p_duplicate_title_id or candidate_title_id = p_duplicate_title_id;

  update public.duplicate_candidates
  set
    title_a_id = least(
      case when title_a_id = p_duplicate_title_id then p_primary_title_id else title_a_id end,
      case when title_b_id = p_duplicate_title_id then p_primary_title_id else title_b_id end
    ),
    title_b_id = greatest(
      case when title_a_id = p_duplicate_title_id then p_primary_title_id else title_a_id end,
      case when title_b_id = p_duplicate_title_id then p_primary_title_id else title_b_id end
    ),
    suggested_primary_title_id = case when suggested_primary_title_id = p_duplicate_title_id then p_primary_title_id else suggested_primary_title_id end
  where title_a_id = p_duplicate_title_id
     or title_b_id = p_duplicate_title_id
     or suggested_primary_title_id = p_duplicate_title_id;

  delete from public.duplicate_candidates
  where title_a_id = title_b_id;

  update public.user_profiles
  set top_titles = public.replace_top_titles_payload(top_titles, p_primary_title_id, p_duplicate_title_id)
  where top_titles is not null;

  insert into public.duplicate_merge_actions (
    candidate_id,
    primary_title_id,
    duplicate_title_id,
    merged_by,
    note,
    snapshot
  )
  values (
    p_candidate_id,
    p_primary_title_id,
    p_duplicate_title_id,
    auth.uid(),
    p_note,
    jsonb_build_object(
      'primary_title', to_jsonb(v_primary),
      'duplicate_title', to_jsonb(v_duplicate)
    )
  )
  returning id into v_action_id;

  update public.duplicate_candidates
  set
    status = 'merged',
    review_note = coalesce(review_note, p_note),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_candidate_id;

  delete from public.canonical_titles
  where id = p_duplicate_title_id;

  return jsonb_build_object(
    'ok', true,
    'action_id', v_action_id,
    'primary_title_id', p_primary_title_id,
    'duplicate_title_id', p_duplicate_title_id
  );
end;
$$;

revoke all on function public.admin_merge_duplicate_titles(bigint, bigint, bigint, text) from public;
grant execute on function public.admin_merge_duplicate_titles(bigint, bigint, bigint, text) to authenticated;
