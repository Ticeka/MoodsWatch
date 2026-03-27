-- ============================================================
-- Battle Character Catalog RPC — 2026-03-28
--
-- Problem: BattleBuilderPage still loads the full title catalog
--          to derive character entities client-side.
--
-- Solution: search_battle_characters returns a paginated,
--           filtered character catalog joined with source title
--           metadata so the builder can stay server-driven.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_title_characters_battle_title_sort
  ON public.title_characters (canonical_title_id, sort_order ASC, id ASC);

CREATE OR REPLACE FUNCTION public.search_battle_characters(
  p_type             text    DEFAULT 'all',
  p_tag              text    DEFAULT '',
  p_mood             text    DEFAULT '',
  p_query            text    DEFAULT '',
  p_show_adult       boolean DEFAULT false,
  p_hidden_title_ids bigint[] DEFAULT ARRAY[]::bigint[],
  p_page             integer DEFAULT 0,
  p_page_size        integer DEFAULT 24
)
RETURNS TABLE (
  character_row_id        bigint,
  character_index         integer,
  anilist_id              integer,
  name_full               text,
  name_native             text,
  image_url               text,
  role                    text,
  voice_actor_name        text,
  voice_actor_image       text,
  source_id               bigint,
  source_slug             text,
  source_canonical_title  text,
  source_type             text,
  source_subtype          text,
  source_release_year     integer,
  source_is_adult         boolean,
  source_cover_image      text,
  source_banner_image     text,
  source_synopsis         text,
  source_avg_score        numeric,
  source_popularity_score integer,
  source_aliases          jsonb,
  source_genres           jsonb,
  source_tags             jsonb,
  source_moods            jsonb,
  total_count             bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset  integer := GREATEST(0, p_page) * GREATEST(1, p_page_size);
  v_limit   integer := GREATEST(1, LEAST(p_page_size, 200));
  v_tag     text    := lower(trim(COALESCE(p_tag, '')));
  v_mood    text    := lower(trim(COALESCE(p_mood, '')));
  v_query   text    := lower(trim(COALESCE(p_query, '')));
  v_type    text    := lower(trim(COALESCE(p_type, 'all')));
BEGIN
  RETURN QUERY
  WITH eligible_titles AS (
    SELECT
      ct.id                   AS source_id,
      ct.slug                 AS source_slug,
      ct.canonical_title      AS source_canonical_title,
      ct.type                 AS source_type,
      ct.subtype              AS source_subtype,
      ct.release_year         AS source_release_year,
      ct.is_adult             AS source_is_adult,
      ct.cover_image          AS source_cover_image,
      ct.banner_image         AS source_banner_image,
      ct.synopsis             AS source_synopsis,
      ct.avg_score            AS source_avg_score,
      ct.popularity_score     AS source_popularity_score,
      ct.aliases_cache        AS source_aliases,
      ct.genres_cache         AS source_genres,
      ct.tags_cache           AS source_tags,
      ct.moods_cache          AS source_moods
    FROM public.canonical_titles ct
    WHERE
      (p_show_adult OR COALESCE(ct.is_adult, false) = false)
      AND (
        COALESCE(array_length(p_hidden_title_ids, 1), 0) = 0
        OR ct.id <> ALL(p_hidden_title_ids)
      )
      AND (
        v_type = 'all' OR v_type = ''
        OR (v_type = 'manhwa' AND ct.type = 'manga' AND ct.subtype IN ('manhwa', 'webtoon'))
        OR (v_type = 'manga' AND ct.type = 'manga' AND (ct.subtype IS NULL OR ct.subtype NOT IN ('manhwa', 'webtoon')))
        OR (v_type NOT IN ('manhwa', 'manga') AND ct.type = v_type)
      )
      AND (
        v_tag = ''
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(ct.genres_cache, '[]'::jsonb)) g
          WHERE lower(g->>'genre_name') = v_tag
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(ct.tags_cache, '[]'::jsonb)) tag_entry
          WHERE lower(tag_entry->>'tag_name') = v_tag
        )
      )
      AND (
        v_mood = ''
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(ct.moods_cache, '[]'::jsonb)) mood_entry
          WHERE lower(mood_entry->>'mood_id') = v_mood
        )
      )
  ),
  indexed_characters AS (
    SELECT
      tc.id AS character_row_id,
      (row_number() OVER (
        PARTITION BY tc.canonical_title_id
        ORDER BY COALESCE(tc.sort_order, 0) ASC, tc.id ASC
      ) - 1)::integer AS character_index,
      tc.anilist_id,
      tc.name_full,
      tc.name_native,
      tc.image_url,
      tc.role,
      tc.voice_actor_name,
      tc.voice_actor_image,
      tc.sort_order,
      et.source_id,
      et.source_slug,
      et.source_canonical_title,
      et.source_type,
      et.source_subtype,
      et.source_release_year,
      et.source_is_adult,
      et.source_cover_image,
      et.source_banner_image,
      et.source_synopsis,
      et.source_avg_score,
      et.source_popularity_score,
      et.source_aliases,
      et.source_genres,
      et.source_tags,
      et.source_moods
    FROM public.title_characters tc
    JOIN eligible_titles et ON et.source_id = tc.canonical_title_id
  ),
  filtered AS (
    SELECT *
    FROM indexed_characters ic
    WHERE
      v_query = ''
      OR COALESCE(ic.name_full, '') ILIKE '%' || v_query || '%'
      OR COALESCE(ic.name_native, '') ILIKE '%' || v_query || '%'
      OR COALESCE(ic.voice_actor_name, '') ILIKE '%' || v_query || '%'
      OR COALESCE(ic.source_canonical_title, '') ILIKE '%' || v_query || '%'
      OR COALESCE(ic.source_slug, '') ILIKE '%' || v_query || '%'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(ic.source_aliases, '[]'::jsonb)) alias_entry
        WHERE alias_entry->>'alias' ILIKE '%' || v_query || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total
    FROM filtered
  )
  SELECT
    f.character_row_id,
    f.character_index,
    f.anilist_id,
    f.name_full,
    f.name_native,
    f.image_url,
    f.role,
    f.voice_actor_name,
    f.voice_actor_image,
    f.source_id,
    f.source_slug,
    f.source_canonical_title,
    f.source_type,
    f.source_subtype,
    f.source_release_year,
    f.source_is_adult,
    f.source_cover_image,
    f.source_banner_image,
    f.source_synopsis,
    f.source_avg_score,
    f.source_popularity_score,
    f.source_aliases,
    f.source_genres,
    f.source_tags,
    f.source_moods,
    c.total AS total_count
  FROM filtered f, counted c
  ORDER BY
    f.source_popularity_score DESC NULLS LAST,
    f.source_avg_score DESC NULLS LAST,
    f.source_id ASC,
    COALESCE(f.sort_order, 0) ASC,
    f.character_row_id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_battle_characters(text,text,text,text,boolean,bigint[],integer,integer)
  TO authenticated, anon;
