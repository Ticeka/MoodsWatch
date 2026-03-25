-- Add has_adult_content flag to tierlist_templates for DB-level age filtering
ALTER TABLE public.tierlist_templates
  ADD COLUMN IF NOT EXISTS has_adult_content boolean NOT NULL DEFAULT false;

-- Backfill existing rows
UPDATE public.tierlist_templates t
SET has_adult_content = EXISTS (
  SELECT 1 FROM public.canonical_titles c
  WHERE c.id = ANY(t.title_ids)
  AND c.is_adult = true
);

-- Composite index covers the common browse query: is_public=true + has_adult_content=? ORDER BY plays DESC
CREATE INDEX IF NOT EXISTS tierlist_templates_browse_adult_idx
  ON public.tierlist_templates (is_public, has_adult_content, plays DESC, updated_at DESC);

-- Trigger function: recalculate has_adult_content on INSERT or when title_ids changes
CREATE OR REPLACE FUNCTION public.sync_tierlist_template_adult_content()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.title_ids IS DISTINCT FROM OLD.title_ids) THEN
    NEW.has_adult_content := EXISTS (
      SELECT 1 FROM public.canonical_titles c
      WHERE c.id = ANY(NEW.title_ids)
      AND c.is_adult = true
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tierlist_template_adult_content_sync ON public.tierlist_templates;
CREATE TRIGGER tierlist_template_adult_content_sync
  BEFORE INSERT OR UPDATE ON public.tierlist_templates
  FOR EACH ROW EXECUTE FUNCTION public.sync_tierlist_template_adult_content();
