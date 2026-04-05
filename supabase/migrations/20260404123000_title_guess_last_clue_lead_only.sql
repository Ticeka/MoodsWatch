-- ============================================================
-- Enforce lead-only final clue for official Title Guess presets
-- 2026-04-04
-- ============================================================

do $$
begin
  with official_questions as (
    select
      q.id as question_id,
      q.answer_title_id
    from public.party_title_guess_questions q
    join public.party_title_guess_sets s
      on s.id = q.set_id
    where s.is_official = true
  ),
  existing_early_clues as (
    select
      oq.question_id,
      array_agg(c.character_id) as used_character_ids
    from official_questions oq
    join public.party_title_guess_clues c
      on c.question_id = oq.question_id
    where c.clue_order between 1 and 3
    group by oq.question_id
  ),
  final_lead_candidates as (
    select distinct on (oq.question_id)
      oq.question_id,
      tc.id as character_id,
      coalesce(nullif(btrim(tc.name_full), ''), 'Unknown') as character_name_snapshot,
      nullif(btrim(coalesce(tc.name_native, '')), '') as character_name_native_snapshot,
      nullif(btrim(coalesce(tc.image_url, '')), '') as character_image_url_snapshot
    from official_questions oq
    join existing_early_clues ec
      on ec.question_id = oq.question_id
    join public.title_characters tc
      on tc.canonical_title_id = oq.answer_title_id
    where coalesce(tc.is_guess_disabled, false) = false
      and nullif(btrim(coalesce(tc.image_url, '')), '') is not null
      and (
        coalesce(tc.is_primary_protagonist, false) = true
        or coalesce(tc.is_primary_heroine, false) = true
        or lower(coalesce(tc.lead_type, '')) in ('protagonist', 'heroine')
      )
      and not (tc.id = any(ec.used_character_ids))
    order by
      oq.question_id,
      case
        when coalesce(tc.is_primary_protagonist, false) then 0
        when coalesce(tc.is_primary_heroine, false) then 1
        when lower(coalesce(tc.lead_type, '')) = 'protagonist' then 2
        when lower(coalesce(tc.lead_type, '')) = 'heroine' then 3
        else 4
      end,
      coalesce(tc.sort_order, 9999) asc,
      tc.id asc
  )
  update public.party_title_guess_clues clues
  set
    character_id = candidate.character_id,
    clue_role_bucket = 'main-side',
    character_name_snapshot = candidate.character_name_snapshot,
    character_name_native_snapshot = candidate.character_name_native_snapshot,
    character_image_url_snapshot = candidate.character_image_url_snapshot,
    updated_at = now()
  from final_lead_candidates candidate
  where clues.question_id = candidate.question_id
    and clues.clue_order = 4;
end $$;
