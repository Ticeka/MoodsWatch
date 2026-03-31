-- ============================================================
-- Party template source resolution / canonical linking
-- 2026-04-01
-- ============================================================

ALTER TABLE public.party_song_template_items
  ADD COLUMN IF NOT EXISTS resolved_source_title_id bigint,
  ADD COLUMN IF NOT EXISTS resolved_source_title_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_resolution_status text NOT NULL DEFAULT 'unresolved',
  ADD COLUMN IF NOT EXISTS source_match_confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS source_match_method text NOT NULL DEFAULT 'youtube_title_parse';

ALTER TABLE public.party_song_template_items
  DROP CONSTRAINT IF EXISTS party_song_template_items_source_resolution_status_check;

ALTER TABLE public.party_song_template_items
  ADD CONSTRAINT party_song_template_items_source_resolution_status_check
    CHECK (source_resolution_status IN ('linked', 'suggested', 'unresolved'));

ALTER TABLE public.party_song_template_items
  DROP CONSTRAINT IF EXISTS party_song_template_items_source_match_confidence_check;

ALTER TABLE public.party_song_template_items
  ADD CONSTRAINT party_song_template_items_source_match_confidence_check
    CHECK (source_match_confidence IN ('exact', 'high', 'medium', 'low'));

ALTER TABLE public.party_song_template_items
  DROP CONSTRAINT IF EXISTS party_song_template_items_source_match_method_check;

ALTER TABLE public.party_song_template_items
  ADD CONSTRAINT party_song_template_items_source_match_method_check
    CHECK (source_match_method IN ('catalog_exact', 'alias_match', 'youtube_title_parse', 'manual'));

CREATE INDEX IF NOT EXISTS idx_party_template_items_resolution_status
  ON public.party_song_template_items (source_resolution_status);

CREATE INDEX IF NOT EXISTS idx_party_template_items_resolved_source
  ON public.party_song_template_items (resolved_source_title_id)
  WHERE resolved_source_title_id IS NOT NULL;

-- Catalog rows are canonically linked by definition.
UPDATE public.party_song_template_items
SET
  resolved_source_title_id = COALESCE(resolved_source_title_id, source_title_id),
  resolved_source_title_name = CASE
    WHEN COALESCE(resolved_source_title_name, '') <> '' THEN resolved_source_title_name
    ELSE COALESCE(source_title_name, '')
  END,
  source_resolution_status = 'linked',
  source_match_confidence = 'exact',
  source_match_method = 'catalog_exact'
WHERE provider = 'catalog';

-- Legacy YouTube rows start unresolved until an owner confirms a canonical match.
UPDATE public.party_song_template_items
SET
  resolved_source_title_id = NULL,
  resolved_source_title_name = '',
  source_resolution_status = 'unresolved',
  source_match_confidence = 'low',
  source_match_method = 'youtube_title_parse'
WHERE provider = 'youtube';
