-- Add has_adult_content flag to tierlist_lists so community queries can split
-- 18+ and non-18+ at the database level instead of hydrating everything first.

ALTER TABLE public.tierlist_lists
  ADD COLUMN IF NOT EXISTS has_adult_content boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tierlist_lists_browse_adult_idx
  ON public.tierlist_lists (is_public, has_adult_content, updated_at DESC, play_count DESC);

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
      JOIN public.title_characters characters
        ON characters.anilist_id = entities.entity_id
      JOIN public.canonical_titles titles
        ON titles.id = characters.canonical_title_id
      WHERE titles.is_adult = true
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

CREATE OR REPLACE FUNCTION public.sync_tierlist_list_adult_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.description IS DISTINCT FROM OLD.description
  THEN
    NEW.has_adult_content := public.compute_tierlist_list_has_adult_content(
      NEW.id,
      NEW.description,
      NEW.template_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tierlist_list_adult_content_sync ON public.tierlist_lists;
CREATE TRIGGER tierlist_list_adult_content_sync
  BEFORE INSERT OR UPDATE ON public.tierlist_lists
  FOR EACH ROW EXECUTE FUNCTION public.sync_tierlist_list_adult_content();

CREATE OR REPLACE FUNCTION public.refresh_tierlist_list_adult_content_from_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_list_id text := COALESCE(NEW.list_id, NULL);
  old_list_id text := COALESCE(OLD.list_id, NULL);
BEGIN
  IF new_list_id IS NULL AND old_list_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.tierlist_lists lists
  SET has_adult_content = public.compute_tierlist_list_has_adult_content(
    lists.id,
    lists.description,
    lists.template_id
  )
  WHERE lists.id IN (new_list_id, old_list_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_tierlist_list_adult_content_from_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tierlist_lists lists
  SET has_adult_content = public.compute_tierlist_list_has_adult_content(
    lists.id,
    lists.description,
    lists.template_id
  )
  WHERE lists.template_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tierlist_list_rows_adult_content_refresh ON public.tierlist_list_rows;
CREATE TRIGGER tierlist_list_rows_adult_content_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.tierlist_list_rows
  FOR EACH ROW EXECUTE FUNCTION public.refresh_tierlist_list_adult_content_from_children();

DROP TRIGGER IF EXISTS tierlist_list_pool_items_adult_content_refresh ON public.tierlist_list_pool_items;
CREATE TRIGGER tierlist_list_pool_items_adult_content_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.tierlist_list_pool_items
  FOR EACH ROW EXECUTE FUNCTION public.refresh_tierlist_list_adult_content_from_children();

DROP TRIGGER IF EXISTS tierlist_template_category_adult_content_refresh ON public.tierlist_templates;
CREATE TRIGGER tierlist_template_category_adult_content_refresh
  AFTER UPDATE OF category ON public.tierlist_templates
  FOR EACH ROW EXECUTE FUNCTION public.refresh_tierlist_list_adult_content_from_template();

UPDATE public.tierlist_lists lists
SET has_adult_content = public.compute_tierlist_list_has_adult_content(
  lists.id,
  lists.description,
  lists.template_id
);
