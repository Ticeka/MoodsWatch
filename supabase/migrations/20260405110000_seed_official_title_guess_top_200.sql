-- ============================================================
-- Seed official top 200 anime title-guess set
-- 2026-04-05
--
-- Goal:
-- - add a second official set focused on the 200 most popular anime
-- - keep the existing full anime catalog set
-- - use the same clue ordering logic as the official catalog generator
-- - never touch user-created sets
-- ============================================================

delete from public.party_title_guess_sets
where is_official = true
  and owner_user_id is null
  and lower(name) = lower('Guess the Title: Top 200 Anime');

do $$
declare
  v_set_id bigint;
begin
  create temporary table tmp_top_200_title_guess_candidates (
    answer_title_id bigint not null,
    seed_cover_url text,
    franchise_name text,
    franchise_aliases jsonb not null,
    clue_1_character_id bigint not null,
    clue_1_name text not null,
    clue_1_name_native text,
    clue_1_image_url text,
    clue_1_role_bucket text not null,
    clue_2_character_id bigint not null,
    clue_2_name text not null,
    clue_2_name_native text,
    clue_2_image_url text,
    clue_2_role_bucket text not null,
    clue_3_character_id bigint not null,
    clue_3_name text not null,
    clue_3_name_native text,
    clue_3_image_url text,
    clue_3_role_bucket text not null,
    clue_4_character_id bigint not null,
    clue_4_name text not null,
    clue_4_name_native text,
    clue_4_image_url text,
    clue_4_role_bucket text not null,
    answer_aliases jsonb not null,
    difficulty_tier smallint not null,
    sort_order integer not null
  ) on commit drop;

  insert into public.party_title_guess_sets (
    owner_user_id,
    creator_name,
    name,
    description,
    visibility,
    is_official
  )
  values (
    null,
    'MoodToon',
    'Guess the Title: Top 200 Anime',
    'Official auto-generated question set for the 200 most popular anime in the catalog.',
    'public',
    true
  )
  returning id into v_set_id;

  insert into tmp_top_200_title_guess_candidates (
    answer_title_id,
    seed_cover_url,
    franchise_name,
    franchise_aliases,
    clue_1_character_id,
    clue_1_name,
    clue_1_name_native,
    clue_1_image_url,
    clue_1_role_bucket,
    clue_2_character_id,
    clue_2_name,
    clue_2_name_native,
    clue_2_image_url,
    clue_2_role_bucket,
    clue_3_character_id,
    clue_3_name,
    clue_3_name_native,
    clue_3_image_url,
    clue_3_role_bucket,
    clue_4_character_id,
    clue_4_name,
    clue_4_name_native,
    clue_4_image_url,
    clue_4_role_bucket,
    answer_aliases,
    difficulty_tier,
    sort_order
  )
  with eligible_titles as (
    select
      t.id,
      t.canonical_title,
      t.cover_image,
      t.banner_image,
      t.avg_score,
      t.popularity_score,
      t.franchise_name,
      t.franchise_aliases
    from public.canonical_titles t
    where t.type = 'anime'
      and coalesce(t.is_adult, false) = false
      and nullif(btrim(coalesce(t.canonical_title, '')), '') is not null
  ),
  eligible_characters as (
    select
      c.id as character_id,
      c.canonical_title_id as title_id,
      btrim(c.name_full) as character_name,
      nullif(btrim(coalesce(c.name_native, '')), '') as character_name_native,
      btrim(c.image_url) as character_image_url,
      upper(coalesce(c.role, 'SUPPORTING')) as role,
      coalesce(c.sort_order, 9999) as sort_order,
      coalesce(c.guess_priority, 0) as guess_priority,
      coalesce(c.is_primary_protagonist, false) as is_primary_protagonist,
      coalesce(c.is_primary_heroine, false) as is_primary_heroine,
      lower(coalesce(c.lead_type, 'unknown')) as lead_type
    from public.title_characters c
    join eligible_titles t on t.id = c.canonical_title_id
    where coalesce(c.is_guess_disabled, false) = false
      and nullif(btrim(coalesce(c.name_full, '')), '') is not null
      and nullif(btrim(coalesce(c.image_url, '')), '') is not null
  ),
  non_lead_candidates as (
    select *
    from eligible_characters c
    where not (
      c.is_primary_protagonist = true
      or c.is_primary_heroine = true
      or c.lead_type in ('protagonist', 'heroine')
    )
  ),
  final_card_candidates as (
    select *
    from eligible_characters c
    where c.role = 'MAIN'
       or c.is_primary_protagonist = true
       or c.is_primary_heroine = true
       or c.lead_type in ('protagonist', 'heroine')
  ),
  generated_candidates as (
    select
      t.id as answer_title_id,
      coalesce(nullif(t.cover_image, ''), nullif(t.banner_image, ''), '') as seed_cover_url,
      t.franchise_name,
      coalesce(t.franchise_aliases, '[]'::jsonb) as franchise_aliases,
      c1.character_id as clue_1_character_id,
      c1.character_name as clue_1_name,
      c1.character_name_native as clue_1_name_native,
      c1.character_image_url as clue_1_image_url,
      case
        when c1.role = 'BACKGROUND' then 'background'
        when c1.role = 'MAIN' then 'main-side'
        else 'supporting'
      end as clue_1_role_bucket,
      c2.character_id as clue_2_character_id,
      c2.character_name as clue_2_name,
      c2.character_name_native as clue_2_name_native,
      c2.character_image_url as clue_2_image_url,
      case
        when c2.role = 'BACKGROUND' then 'background'
        when c2.role = 'MAIN' then 'main-side'
        else 'supporting'
      end as clue_2_role_bucket,
      c3.character_id as clue_3_character_id,
      c3.character_name as clue_3_name,
      c3.character_name_native as clue_3_name_native,
      c3.character_image_url as clue_3_image_url,
      case
        when c3.role = 'BACKGROUND' then 'background'
        when c3.role = 'MAIN' then 'main-side'
        else 'supporting'
      end as clue_3_role_bucket,
      c4.character_id as clue_4_character_id,
      c4.character_name as clue_4_name,
      c4.character_name_native as clue_4_name_native,
      c4.character_image_url as clue_4_image_url,
      'main-side' as clue_4_role_bucket,
      coalesce(
        (
          select jsonb_agg(alias_rows.alias_text order by alias_rows.alias_rank, alias_rows.alias_text)
          from (
            select distinct on (lower(seed_alias.alias_text))
              seed_alias.alias_text,
              seed_alias.alias_rank
            from (
              select btrim(t.canonical_title) as alias_text, 0 as alias_rank
              union all
              select
                btrim(a.alias) as alias_text,
                case
                  when a.is_primary then 1
                  when a.alias_type = 'english' then 2
                  when a.alias_type = 'romaji' then 3
                  when a.alias_type = 'native' then 4
                  else 5
                end as alias_rank
              from public.title_aliases a
              where a.canonical_title_id = t.id
                and nullif(btrim(coalesce(a.alias, '')), '') is not null
            ) seed_alias
            where nullif(btrim(coalesce(seed_alias.alias_text, '')), '') is not null
            order by lower(seed_alias.alias_text), seed_alias.alias_rank, seed_alias.alias_text
          ) alias_rows
        ),
        jsonb_build_array(t.canonical_title)
      ) as answer_aliases,
      case
        when c1.role = 'BACKGROUND' and c2.role in ('BACKGROUND', 'SUPPORTING') then 5
        when c1.role = 'SUPPORTING' and c2.role = 'SUPPORTING' then 4
        else 3
      end as difficulty_tier,
      row_number() over (
        order by
          coalesce(t.popularity_score, 0) desc,
          coalesce(t.avg_score, 0) desc,
          t.id asc
      ) - 1 as sort_order
    from eligible_titles t
    join lateral (
      select ec.*
      from non_lead_candidates ec
      where ec.title_id = t.id
      order by
        case
          when ec.role = 'BACKGROUND' then 0
          when ec.role = 'SUPPORTING' then 1
          when ec.role = 'MAIN' then 2
          else 3
        end,
        ec.sort_order desc,
        ec.guess_priority asc,
        ec.character_id desc
      limit 1
    ) c1 on true
    join lateral (
      select ec.*
      from non_lead_candidates ec
      where ec.title_id = t.id
        and ec.character_id <> c1.character_id
      order by
        case
          when ec.role = 'SUPPORTING' then 0
          when ec.role = 'BACKGROUND' then 1
          when ec.role = 'MAIN' then 2
          else 3
        end,
        ec.sort_order desc,
        ec.guess_priority asc,
        ec.character_id desc
      limit 1
    ) c2 on true
    join lateral (
      select ec.*
      from non_lead_candidates ec
      where ec.title_id = t.id
        and ec.character_id not in (c1.character_id, c2.character_id)
      order by
        case
          when ec.role = 'MAIN' then 0
          when ec.role = 'SUPPORTING' then 1
          when ec.role = 'BACKGROUND' then 2
          else 3
        end,
        ec.sort_order asc,
        ec.guess_priority desc,
        ec.character_id asc
      limit 1
    ) c3 on true
    join lateral (
      select ec.*
      from final_card_candidates ec
      where ec.title_id = t.id
        and ec.character_id not in (c1.character_id, c2.character_id, c3.character_id)
      order by
        case
          when ec.is_primary_protagonist then 0
          when ec.lead_type = 'protagonist' then 1
          when ec.is_primary_heroine then 2
          when ec.lead_type = 'heroine' then 3
          when ec.role = 'MAIN' then 4
          else 5
        end,
        ec.sort_order asc,
        ec.guess_priority desc,
        ec.character_id asc
      limit 1
    ) c4 on true
    where c1.character_id <> c2.character_id
      and c1.character_id <> c3.character_id
      and c1.character_id <> c4.character_id
      and c2.character_id <> c3.character_id
      and c2.character_id <> c4.character_id
      and c3.character_id <> c4.character_id
    order by
      coalesce(t.popularity_score, 0) desc,
      coalesce(t.avg_score, 0) desc,
      t.id asc
    limit 200
  )
  select
    candidate.answer_title_id,
    candidate.seed_cover_url,
    candidate.franchise_name,
    candidate.franchise_aliases,
    candidate.clue_1_character_id,
    candidate.clue_1_name,
    candidate.clue_1_name_native,
    candidate.clue_1_image_url,
    candidate.clue_1_role_bucket,
    candidate.clue_2_character_id,
    candidate.clue_2_name,
    candidate.clue_2_name_native,
    candidate.clue_2_image_url,
    candidate.clue_2_role_bucket,
    candidate.clue_3_character_id,
    candidate.clue_3_name,
    candidate.clue_3_name_native,
    candidate.clue_3_image_url,
    candidate.clue_3_role_bucket,
    candidate.clue_4_character_id,
    candidate.clue_4_name,
    candidate.clue_4_name_native,
    candidate.clue_4_image_url,
    candidate.clue_4_role_bucket,
    candidate.answer_aliases,
    candidate.difficulty_tier,
    candidate.sort_order
  from generated_candidates candidate;

  insert into public.party_title_guess_questions (
    set_id,
    answer_title_id,
    answer_aliases,
    franchise_id,
    franchise_name,
    franchise_aliases,
    difficulty_tier,
    status,
    sort_order,
    source_strategy,
    note
  )
  select
    v_set_id,
    candidate.answer_title_id,
    candidate.answer_aliases,
    null,
    candidate.franchise_name,
    candidate.franchise_aliases,
    candidate.difficulty_tier,
    'ready',
    candidate.sort_order,
    'auto',
    'Auto-generated official top 200 anime set'
  from tmp_top_200_title_guess_candidates candidate;

  with seeded_questions as (
    select
      q.id as question_id,
      c.clue_1_character_id,
      c.clue_1_name,
      c.clue_1_name_native,
      c.clue_1_image_url,
      c.clue_1_role_bucket,
      c.clue_2_character_id,
      c.clue_2_name,
      c.clue_2_name_native,
      c.clue_2_image_url,
      c.clue_2_role_bucket,
      c.clue_3_character_id,
      c.clue_3_name,
      c.clue_3_name_native,
      c.clue_3_image_url,
      c.clue_3_role_bucket,
      c.clue_4_character_id,
      c.clue_4_name,
      c.clue_4_name_native,
      c.clue_4_image_url,
      c.clue_4_role_bucket
    from public.party_title_guess_questions q
    join tmp_top_200_title_guess_candidates c on c.answer_title_id = q.answer_title_id
    where q.set_id = v_set_id
  ),
  clue_seed_rows as (
    select question_id, 1 as clue_order, clue_1_character_id as character_id, clue_1_role_bucket as clue_role_bucket, clue_1_name as character_name_snapshot, clue_1_name_native as character_name_native_snapshot, clue_1_image_url as character_image_url_snapshot from seeded_questions
    union all
    select question_id, 2, clue_2_character_id, clue_2_role_bucket, clue_2_name, clue_2_name_native, clue_2_image_url from seeded_questions
    union all
    select question_id, 3, clue_3_character_id, clue_3_role_bucket, clue_3_name, clue_3_name_native, clue_3_image_url from seeded_questions
    union all
    select question_id, 4, clue_4_character_id, clue_4_role_bucket, clue_4_name, clue_4_name_native, clue_4_image_url from seeded_questions
  )
  insert into public.party_title_guess_clues (
    question_id,
    character_id,
    clue_order,
    clue_role_bucket,
    character_name_snapshot,
    character_name_native_snapshot,
    character_image_url_snapshot,
    is_manual_override
  )
  select
    clue.question_id,
    clue.character_id,
    clue.clue_order,
    clue.clue_role_bucket,
    clue.character_name_snapshot,
    clue.character_name_native_snapshot,
    clue.character_image_url_snapshot,
    false
  from clue_seed_rows clue;

  update public.party_title_guess_sets s
  set cover_url = (
    select coalesce(nullif(t.cover_image, ''), nullif(t.banner_image, ''), '')
    from public.party_title_guess_questions q
    join public.canonical_titles t on t.id = q.answer_title_id
    where q.set_id = v_set_id
      and nullif(coalesce(t.cover_image, t.banner_image, ''), '') is not null
    order by q.sort_order asc, q.id asc
    limit 1
  )
  where s.id = v_set_id;
end;
$$;
