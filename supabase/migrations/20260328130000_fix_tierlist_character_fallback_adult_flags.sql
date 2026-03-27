-- Fix adult flag computation for tierlist character entities that use
-- fallback IDs (sourceTitleId * 1000 + index) instead of anilist_id.

CREATE OR REPLACE FUNCTION public.compute_tierlist_character_entity_has_adult_content(
  character_entity_ids bigint[]
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH entity_ids AS (
    SELECT DISTINCT unnest(COALESCE(character_entity_ids, ARRAY[]::bigint[])) AS entity_id
  ),
  direct_matches AS (
    SELECT DISTINCT characters.canonical_title_id
    FROM entity_ids entities
    JOIN public.title_characters characters
      ON characters.anilist_id = entities.entity_id
  ),
  fallback_matches AS (
    SELECT DISTINCT fallback_candidates.derived_source_id AS canonical_title_id
    FROM (
      SELECT
        entities.entity_id,
        FLOOR((entities.entity_id - 1)::numeric / 1000)::bigint AS derived_source_id
      FROM entity_ids entities
      WHERE entities.entity_id > 1000
        AND NOT EXISTS (
          SELECT 1
          FROM public.title_characters direct_chars
          WHERE direct_chars.anilist_id = entities.entity_id
        )
    ) fallback_candidates
    JOIN public.title_characters fallback_chars
      ON fallback_chars.canonical_title_id = fallback_candidates.derived_source_id
     AND fallback_chars.anilist_id IS NULL
  ),
  candidate_titles AS (
    SELECT canonical_title_id FROM direct_matches
    UNION
    SELECT canonical_title_id FROM fallback_matches
  )
  SELECT EXISTS (
    SELECT 1
    FROM candidate_titles
    JOIN public.canonical_titles titles
      ON titles.id = candidate_titles.canonical_title_id
    WHERE titles.is_adult = true
  );
$$;

CREATE OR REPLACE FUNCTION public.compute_tierlist_template_has_adult_content(
  template_category text,
  template_title_ids bigint[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(array_length(template_title_ids, 1), 0) = 0 THEN
    RETURN false;
  END IF;

  IF COALESCE(template_category, '') LIKE 'theme_song::%' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.title_theme_songs songs
      JOIN public.canonical_titles titles
        ON titles.id = songs.canonical_title_id
      WHERE songs.id = ANY(template_title_ids)
        AND titles.is_adult = true
    );
  END IF;

  IF COALESCE(template_category, '') LIKE 'character::%' THEN
    RETURN public.compute_tierlist_character_entity_has_adult_content(template_title_ids);
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.canonical_titles titles
    WHERE titles.id = ANY(template_title_ids)
      AND titles.is_adult = true
  );
END;
$$;

UPDATE public.tierlist_templates templates
SET has_adult_content = public.compute_tierlist_template_has_adult_content(
  templates.category,
  templates.title_ids
);

CREATE OR REPLACE FUNCTION public.compute_tierlist_list_has_adult_content(
  target_list_id text,
  target_description text,
  target_template_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  template_category text := '';
  is_song_list boolean := false;
  is_character_list boolean := false;
BEGIN
  SELECT COALESCE(category, '')
    INTO template_category
  FROM public.tierlist_templates
  WHERE id = target_template_id;

  is_song_list := COALESCE(target_description, '') LIKE 'song-source:%'
    OR template_category LIKE 'theme_song::%';
  is_character_list := template_category LIKE 'character::%';

  IF is_song_list THEN
    RETURN EXISTS (
      SELECT 1
      FROM (
        SELECT unnest(rows.title_ids) AS entity_id
        FROM public.tierlist_list_rows rows
        WHERE rows.list_id = target_list_id
        UNION
        SELECT pool.title_id AS entity_id
        FROM public.tierlist_list_pool_items pool
        WHERE pool.list_id = target_list_id
      ) entities
      JOIN public.title_theme_songs songs
        ON songs.id = entities.entity_id
      JOIN public.canonical_titles titles
        ON titles.id = songs.canonical_title_id
      WHERE titles.is_adult = true
    );
  END IF;

  IF is_character_list THEN
    RETURN public.compute_tierlist_character_entity_has_adult_content(
      ARRAY(
        SELECT DISTINCT entity_id
        FROM (
          SELECT unnest(rows.title_ids) AS entity_id
          FROM public.tierlist_list_rows rows
          WHERE rows.list_id = target_list_id
          UNION
          SELECT pool.title_id AS entity_id
          FROM public.tierlist_list_pool_items pool
          WHERE pool.list_id = target_list_id
        ) character_entities
      )
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM (
      SELECT unnest(rows.title_ids) AS entity_id
      FROM public.tierlist_list_rows rows
      WHERE rows.list_id = target_list_id
      UNION
      SELECT pool.title_id AS entity_id
      FROM public.tierlist_list_pool_items pool
      WHERE pool.list_id = target_list_id
    ) entities
    JOIN public.canonical_titles titles
      ON titles.id = entities.entity_id
    WHERE titles.is_adult = true
  );
END;
$$;

UPDATE public.tierlist_lists lists
SET has_adult_content = public.compute_tierlist_list_has_adult_content(
  lists.id,
  lists.description,
  lists.template_id
);
