-- ============================================================
-- Battle Catalog RPCs — 2026-03-28
--
-- Problem:  BattleBuilderPage loads getAllTitles (full table) and
--           all title_theme_songs on every builder load.
--           At 50k+ titles this blocks the builder for 2-5 seconds.
--
-- Solution: Two server-side paginated RPCs:
--           search_battle_titles   — paginated, filtered title catalog
--           search_battle_theme_songs — paginated song catalog with join
--
--           Both use existing cache columns (genres_cache, tags_cache,
--           moods_cache, aliases_cache) from 20260327010000.
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Composite indexes for battle query patterns
-- ---------------------------------------------------------------

-- Main battle query: is_adult gate + popularity sort
CREATE INDEX IF NOT EXISTS idx_canonical_titles_battle_adult_pop
  ON public.canonical_titles (is_adult, popularity_score DESC NULLS LAST, avg_score DESC NULLS LAST, id ASC);

-- Type-filtered battle query
CREATE INDEX IF NOT EXISTS idx_canonical_titles_battle_type_pop
  ON public.canonical_titles (is_adult, type, popularity_score DESC NULLS LAST, id ASC);

-- Song join: title_theme_songs.canonical_title_id already has idx_title_theme_songs_title_id

-- ---------------------------------------------------------------
-- 2. search_battle_titles
--    Returns a paginated, filtered slice of canonical_titles.
--    Each row includes total_count (count of all matching rows).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_battle_titles(
  p_type             text    DEFAULT 'all',
  p_tag              text    DEFAULT '',
  p_mood             text    DEFAULT '',
  p_query            text    DEFAULT '',
  p_trailer_state    text    DEFAULT 'all',
  p_trailer_provider text    DEFAULT 'all',
  p_show_adult       boolean DEFAULT false,
  p_hidden_title_ids bigint[] DEFAULT ARRAY[]::bigint[],
  p_page             integer DEFAULT 0,
  p_page_size        integer DEFAULT 24
)
RETURNS TABLE (
  id                   bigint,
  slug                 text,
  canonical_title      text,
  type                 text,
  subtype              text,
  release_year         integer,
  episodes             integer,
  chapters             integer,
  volumes              integer,
  duration_minutes     integer,
  is_adult             boolean,
  cover_image          text,
  banner_image         text,
  avg_score            numeric,
  popularity_score     integer,
  trailer_url          text,
  trailer_site         text,
  trailer_video_id     text,
  trailer_thumbnail_url text,
  trailer_source       text,
  aliases              jsonb,
  genres               jsonb,
  tags                 jsonb,
  moods                jsonb,
  total_count          bigint
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
  v_prov    text    := lower(trim(COALESCE(p_trailer_provider, 'all')));
  v_tstate  text    := lower(trim(COALESCE(p_trailer_state, 'all')));
  v_type    text    := lower(trim(COALESCE(p_type, 'all')));
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT ct.*
    FROM public.canonical_titles ct
    WHERE
      -- adult gate: adult users can see everything; non-adult users only see safe titles
      (p_show_adult OR COALESCE(ct.is_adult, false) = false)

      AND (
        COALESCE(array_length(p_hidden_title_ids, 1), 0) = 0
        OR ct.id <> ALL(p_hidden_title_ids)
      )

      -- type filter (display type: manga subtype='manhwa' maps to 'manhwa')
      AND (
        v_type = 'all' OR v_type = ''
        OR (v_type = 'manhwa' AND ct.type = 'manga' AND ct.subtype IN ('manhwa', 'webtoon'))
        OR (v_type = 'manga'  AND ct.type = 'manga' AND (ct.subtype IS NULL OR ct.subtype NOT IN ('manhwa', 'webtoon')))
        OR (v_type NOT IN ('manhwa', 'manga') AND ct.type = v_type)
      )

      -- tag / genre filter (checks both caches)
      AND (
        v_tag = ''
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(ct.genres_cache) g
          WHERE lower(g->>'genre_name') = v_tag
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(ct.tags_cache) t
          WHERE lower(t->>'tag_name') = v_tag
        )
      )

      -- mood filter
      AND (
        v_mood = ''
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(ct.moods_cache) m
          WHERE lower(m->>'mood_id') = v_mood
        )
      )

      -- text search (canonical_title, slug, aliases)
      AND (
        v_query = ''
        OR ct.canonical_title ILIKE '%' || v_query || '%'
        OR ct.slug            ILIKE '%' || v_query || '%'
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(ct.aliases_cache) a
          WHERE a->>'alias' ILIKE '%' || v_query || '%'
        )
      )

      -- trailer state filter
      AND (
        v_tstate = 'all'
        OR (v_tstate = 'has'  AND ct.trailer_url IS NOT NULL)
        OR (v_tstate = 'none' AND ct.trailer_url IS NULL)
      )

      -- trailer provider filter
      AND (
        v_prov = 'all' OR v_prov = ''
        OR lower(COALESCE(ct.trailer_source, ct.trailer_site, '')) = v_prov
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered
  )
  SELECT
    f.id,
    f.slug,
    f.canonical_title,
    f.type,
    f.subtype,
    f.release_year,
    f.episodes,
    f.chapters,
    f.volumes,
    f.duration_minutes,
    f.is_adult,
    f.cover_image,
    f.banner_image,
    f.avg_score,
    f.popularity_score,
    f.trailer_url,
    f.trailer_site,
    f.trailer_video_id,
    f.trailer_thumbnail_url,
    f.trailer_source,
    f.aliases_cache  AS aliases,
    f.genres_cache   AS genres,
    f.tags_cache     AS tags,
    f.moods_cache    AS moods,
    c.total          AS total_count
  FROM filtered f, counted c
  ORDER BY f.popularity_score DESC NULLS LAST, f.avg_score DESC NULLS LAST, f.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_battle_titles(text,text,text,text,text,text,boolean,bigint[],integer,integer)
  TO authenticated, anon;

-- ---------------------------------------------------------------
-- 3. get_battle_title_facets
--    Returns global filter options for the visible title catalog.
--    Mirrors the old client-side collectBattleFilters() behavior,
--    but without loading every title row into the browser.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_battle_title_facets(
  p_show_adult boolean DEFAULT false,
  p_hidden_title_ids bigint[] DEFAULT ARRAY[]::bigint[]
)
RETURNS TABLE (
  genres text[],
  tags text[],
  moods text[],
  trailer_providers text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible_titles AS (
    SELECT
      ct.id,
      lower(trim(COALESCE(ct.trailer_source, ct.trailer_site, ''))) AS trailer_provider
    FROM public.canonical_titles ct
    WHERE
      (p_show_adult OR COALESCE(ct.is_adult, false) = false)
      AND (
        COALESCE(array_length(p_hidden_title_ids, 1), 0) = 0
        OR ct.id <> ALL(p_hidden_title_ids)
      )
  )
  SELECT
    COALESCE((
      SELECT array_agg(value ORDER BY value)
      FROM (
        SELECT DISTINCT tg.genre_name AS value
        FROM public.title_genres tg
        JOIN visible_titles vt ON vt.id = tg.canonical_title_id
        WHERE tg.genre_name IS NOT NULL AND btrim(tg.genre_name) <> ''
      ) genre_values
    ), ARRAY[]::text[]) AS genres,
    COALESCE((
      SELECT array_agg(value ORDER BY value)
      FROM (
        SELECT DISTINCT tt.tag_name AS value
        FROM public.title_tags tt
        JOIN visible_titles vt ON vt.id = tt.canonical_title_id
        WHERE tt.tag_name IS NOT NULL AND btrim(tt.tag_name) <> ''
      ) tag_values
    ), ARRAY[]::text[]) AS tags,
    COALESCE((
      SELECT array_agg(value ORDER BY value)
      FROM (
        SELECT DISTINCT tm.mood_id AS value
        FROM public.title_moods tm
        JOIN visible_titles vt ON vt.id = tm.canonical_title_id
        WHERE tm.mood_id IS NOT NULL AND btrim(tm.mood_id) <> ''
      ) mood_values
    ), ARRAY[]::text[]) AS moods,
    COALESCE((
      SELECT array_agg(value ORDER BY value)
      FROM (
        SELECT DISTINCT vt.trailer_provider AS value
        FROM visible_titles vt
        WHERE vt.trailer_provider <> ''
      ) provider_values
    ), ARRAY[]::text[]) AS trailer_providers;
$$;

GRANT EXECUTE ON FUNCTION public.get_battle_title_facets(boolean,bigint[])
  TO authenticated, anon;

-- ---------------------------------------------------------------
-- 4. search_battle_theme_songs
--    Returns paginated theme songs joined with source title data.
--    Source title fields are prefixed source_ for clarity.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_battle_theme_songs(
  p_query      text    DEFAULT '',
  p_show_adult boolean DEFAULT false,
  p_hidden_title_ids bigint[] DEFAULT ARRAY[]::bigint[],
  p_page       integer DEFAULT 0,
  p_page_size  integer DEFAULT 24
)
RETURNS TABLE (
  id                   bigint,
  canonical_title_id   bigint,
  theme_type           text,
  theme_sequence       integer,
  song_title           text,
  artist_name          text,
  episodes_text        text,
  video_url            text,
  is_creditless        boolean,
  is_spoiler           boolean,
  is_nsfw              boolean,
  -- source title fields (enough for buildThemeSongEntity)
  source_id            bigint,
  source_slug          text,
  source_canonical_title text,
  source_cover_image   text,
  source_banner_image  text,
  source_is_adult      boolean,
  source_release_year  integer,
  source_aliases       jsonb,
  total_count          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset integer := GREATEST(0, p_page) * GREATEST(1, p_page_size);
  v_limit  integer := GREATEST(1, LEAST(p_page_size, 200));
  v_query  text    := lower(trim(COALESCE(p_query, '')));
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.canonical_title_id,
      s.theme_type,
      s.theme_sequence,
      s.song_title,
      s.artist_name,
      s.episodes_text,
      s.video_url,
      s.is_creditless,
      s.is_spoiler,
      s.is_nsfw,
      ct.id            AS source_id,
      ct.slug          AS source_slug,
      ct.canonical_title AS source_canonical_title,
      ct.cover_image   AS source_cover_image,
      ct.banner_image  AS source_banner_image,
      ct.is_adult      AS source_is_adult,
      ct.release_year  AS source_release_year,
      ct.aliases_cache AS source_aliases
    FROM public.title_theme_songs s
    JOIN public.canonical_titles ct ON ct.id = s.canonical_title_id
    WHERE
      (p_show_adult OR COALESCE(ct.is_adult, false) = false)
      AND (
        COALESCE(array_length(p_hidden_title_ids, 1), 0) = 0
        OR ct.id <> ALL(p_hidden_title_ids)
      )
      AND (
        v_query = ''
        OR s.song_title  ILIKE '%' || v_query || '%'
        OR s.artist_name ILIKE '%' || v_query || '%'
        OR ct.canonical_title ILIKE '%' || v_query || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS total FROM filtered
  )
  SELECT
    f.id,
    f.canonical_title_id,
    f.theme_type,
    f.theme_sequence,
    f.song_title,
    f.artist_name,
    f.episodes_text,
    f.video_url,
    f.is_creditless,
    f.is_spoiler,
    f.is_nsfw,
    f.source_id,
    f.source_slug,
    f.source_canonical_title,
    f.source_cover_image,
    f.source_banner_image,
    f.source_is_adult,
    f.source_release_year,
    f.source_aliases,
    c.total AS total_count
  FROM filtered f, counted c
  ORDER BY f.source_canonical_title ASC NULLS LAST, f.theme_type ASC, f.theme_sequence ASC, f.id ASC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_battle_theme_songs(text,boolean,bigint[],integer,integer)
  TO authenticated, anon;
