-- Store extra cover framing data so users can drag and zoom the template cover.

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_scale numeric(4,2) NOT NULL DEFAULT 1;

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_offset_x numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS preview_artwork_offset_y numeric(5,2) NOT NULL DEFAULT 0;

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

  NEW.preview_artwork_scale := GREATEST(1, LEAST(2.5, COALESCE(NEW.preview_artwork_scale, 1)));
  NEW.preview_artwork_offset_x := GREATEST(-35, LEAST(35, COALESCE(NEW.preview_artwork_offset_x, 0)));
  NEW.preview_artwork_offset_y := GREATEST(-35, LEAST(35, COALESCE(NEW.preview_artwork_offset_y, 0)));

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
