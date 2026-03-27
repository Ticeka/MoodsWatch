-- Fix has_adult_content for non-title tierlist templates.
-- theme_song templates store song IDs in title_ids, and character templates store anilist_id values,
-- so the original canonical_titles-only lookup can mark adult templates as safe.

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
    RETURN EXISTS (
      SELECT 1
      FROM public.title_characters characters
      JOIN public.canonical_titles titles
        ON titles.id = characters.canonical_title_id
      WHERE characters.anilist_id = ANY(template_title_ids)
        AND titles.is_adult = true
    );
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
