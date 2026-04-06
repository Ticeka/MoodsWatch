-- Allow tierlist templates to keep a user-selected cover image plus
-- presentation settings for how that cover should be framed.

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS manual_preview_artwork_url text;

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_fit text NOT NULL DEFAULT 'cover';

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_position text NOT NULL DEFAULT 'center';

UPDATE public.tierlist_templates templates
SET preview_artwork_url = COALESCE(
  NULLIF(BTRIM(templates.manual_preview_artwork_url), ''),
  public.compute_tierlist_template_preview_artwork_url(
    templates.category,
    templates.title_ids
  )
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

  NEW.preview_artwork_fit := CASE LOWER(COALESCE(BTRIM(NEW.preview_artwork_fit), 'cover'))
    WHEN 'contain' THEN 'contain'
    ELSE 'cover'
  END;

  NEW.preview_artwork_position := CASE LOWER(COALESCE(BTRIM(NEW.preview_artwork_position), 'center'))
    WHEN 'top' THEN 'top'
    WHEN 'bottom' THEN 'bottom'
    ELSE 'center'
  END;

  IF TG_OP = 'INSERT'
    OR NEW.title_ids IS DISTINCT FROM OLD.title_ids
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.manual_preview_artwork_url IS DISTINCT FROM OLD.manual_preview_artwork_url
  THEN
    NEW.preview_artwork_url := COALESCE(
      NULLIF(BTRIM(NEW.manual_preview_artwork_url), ''),
      public.compute_tierlist_template_preview_artwork_url(
        NEW.category,
        NEW.title_ids
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.sync_tierlist_template_adult_content()
  SET search_path = public;
