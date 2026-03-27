-- Store a lightweight preview artwork URL directly on tierlist_templates
-- so browse cards can paint immediately without waiting for entity hydration.

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_url text;

CREATE OR REPLACE FUNCTION public.compute_tierlist_template_preview_artwork_url(
  template_category text,
  template_title_ids bigint[]
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF COALESCE(array_length(template_title_ids, 1), 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF COALESCE(template_category, '') LIKE 'theme_song::%' THEN
    RETURN (
      SELECT COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url)
      FROM unnest(template_title_ids) WITH ORDINALITY AS entities(entity_id, ord)
      JOIN public.title_theme_songs songs
        ON songs.id = entities.entity_id
      JOIN public.canonical_titles titles
        ON titles.id = songs.canonical_title_id
      WHERE COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url) IS NOT NULL
      ORDER BY entities.ord
      LIMIT 1
    );
  END IF;

  IF COALESCE(template_category, '') LIKE 'character::%' THEN
    RETURN COALESCE(
      (
        SELECT COALESCE(characters.image_url, titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url)
        FROM unnest(template_title_ids) WITH ORDINALITY AS entities(entity_id, ord)
        JOIN public.title_characters characters
          ON characters.anilist_id = entities.entity_id
        JOIN public.canonical_titles titles
          ON titles.id = characters.canonical_title_id
        WHERE COALESCE(characters.image_url, titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url) IS NOT NULL
        ORDER BY entities.ord
        LIMIT 1
      ),
      (
        SELECT COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url)
        FROM unnest(template_title_ids) WITH ORDINALITY AS entities(entity_id, ord)
        JOIN public.canonical_titles titles
          ON titles.id = FLOOR((entities.entity_id - 1)::numeric / 1000)::bigint
        WHERE entities.entity_id > 1000
          AND NOT EXISTS (
            SELECT 1
            FROM public.title_characters direct_chars
            WHERE direct_chars.anilist_id = entities.entity_id
          )
          AND EXISTS (
            SELECT 1
            FROM public.title_characters fallback_chars
            WHERE fallback_chars.canonical_title_id = titles.id
              AND fallback_chars.anilist_id IS NULL
          )
          AND COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url) IS NOT NULL
        ORDER BY entities.ord
        LIMIT 1
      )
    );
  END IF;

  RETURN (
    SELECT COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url)
    FROM unnest(template_title_ids) WITH ORDINALITY AS entities(entity_id, ord)
    JOIN public.canonical_titles titles
      ON titles.id = entities.entity_id
    WHERE COALESCE(titles.cover_image, titles.banner_image, titles.trailer_thumbnail_url) IS NOT NULL
    ORDER BY entities.ord
    LIMIT 1
  );
END;
$$;

UPDATE public.tierlist_templates templates
SET preview_artwork_url = public.compute_tierlist_template_preview_artwork_url(
  templates.category,
  templates.title_ids
);

CREATE OR REPLACE FUNCTION public.sync_tierlist_template_adult_content()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.title_ids IS DISTINCT FROM OLD.title_ids
    OR NEW.category IS DISTINCT FROM OLD.category
  THEN
    NEW.has_adult_content := public.compute_tierlist_template_has_adult_content(
      NEW.category,
      NEW.title_ids
    );
    NEW.preview_artwork_url := public.compute_tierlist_template_preview_artwork_url(
      NEW.category,
      NEW.title_ids
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
