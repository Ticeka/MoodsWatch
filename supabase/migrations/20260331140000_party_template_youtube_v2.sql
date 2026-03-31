-- ============================================================
-- Party Template YouTube v2 — 2026-03-31
--
-- Extends party_song_templates and party_song_template_items
-- to support YouTube video and playlist snapshot imports
-- alongside existing catalog songs.
--
-- Key changes:
--   1. party_song_templates — allow source_type = youtube | mixed
--                           + YouTube playlist snapshot metadata
--   2. party_song_template_items — song_id nullable
--                                + provider / source_kind / playback_status
--                                + provider_media_id / provider_collection_id
--                                + duration_sec, metadata_json, imported_at …
--   3. Partial unique indexes (replacing old all-columns unique constraint)
--   4. Backfill existing catalog rows
-- ============================================================

-- ----------------------------------------------------------------
-- 1. party_song_templates — relax source_type + add YT columns
-- ----------------------------------------------------------------

-- Drop v1 check (catalog-only)
ALTER TABLE public.party_song_templates
  DROP CONSTRAINT IF EXISTS party_song_templates_source_type_check;

-- v2: catalog | youtube | mixed
ALTER TABLE public.party_song_templates
  ADD CONSTRAINT party_song_templates_source_type_check
    CHECK (source_type IN ('catalog', 'youtube', 'mixed'));

-- YouTube playlist snapshot metadata
ALTER TABLE public.party_song_templates
  ADD COLUMN IF NOT EXISTS youtube_source_url    text,
  ADD COLUMN IF NOT EXISTS youtube_playlist_id   text,
  ADD COLUMN IF NOT EXISTS youtube_sync_mode     text
    DEFAULT 'snapshot'
    CHECK (youtube_sync_mode IN ('snapshot', 'snapshot_syncable')),
  ADD COLUMN IF NOT EXISTS last_synced_at        timestamptz,
  ADD COLUMN IF NOT EXISTS import_status         text
    CHECK (import_status IN ('idle', 'importing', 'done', 'partial', 'failed')),
  ADD COLUMN IF NOT EXISTS import_error          text;

CREATE INDEX IF NOT EXISTS idx_party_song_templates_youtube_playlist
  ON public.party_song_templates (youtube_playlist_id)
  WHERE youtube_playlist_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. party_song_template_items — nullable song_id + new columns
-- ----------------------------------------------------------------

-- Make song_id nullable so YouTube items (no catalog song_id) can be stored
ALTER TABLE public.party_song_template_items
  ALTER COLUMN song_id DROP NOT NULL;

-- Drop v1 catalog-only unique constraint
ALTER TABLE public.party_song_template_items
  DROP CONSTRAINT IF EXISTS party_song_template_items_template_id_song_id_key;

-- New columns
ALTER TABLE public.party_song_template_items
  ADD COLUMN IF NOT EXISTS provider               text NOT NULL DEFAULT 'catalog'
    CHECK (provider IN ('catalog', 'youtube')),
  ADD COLUMN IF NOT EXISTS provider_media_id      text,
  ADD COLUMN IF NOT EXISTS provider_collection_id text,
  ADD COLUMN IF NOT EXISTS provider_url           text,
  ADD COLUMN IF NOT EXISTS source_kind            text NOT NULL DEFAULT 'catalog'
    CHECK (source_kind IN ('catalog', 'youtube_video', 'youtube_playlist')),
  ADD COLUMN IF NOT EXISTS playback_status        text NOT NULL DEFAULT 'unknown'
    CHECK (playback_status IN ('ready', 'limited', 'blocked', 'unknown')),
  ADD COLUMN IF NOT EXISTS duration_sec           integer,
  ADD COLUMN IF NOT EXISTS metadata_json          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS imported_at            timestamptz,
  ADD COLUMN IF NOT EXISTS import_source_position integer,
  ADD COLUMN IF NOT EXISTS sync_state             text;

-- ----------------------------------------------------------------
-- 3. Partial unique indexes
-- ----------------------------------------------------------------

-- Catalog: unique per (template_id, song_id) — only when song_id is set
CREATE UNIQUE INDEX IF NOT EXISTS items_uniq_catalog
  ON public.party_song_template_items (template_id, song_id)
  WHERE song_id IS NOT NULL;

-- YouTube: unique per (template_id, provider_media_id) — only when set
CREATE UNIQUE INDEX IF NOT EXISTS items_uniq_youtube
  ON public.party_song_template_items (template_id, provider_media_id)
  WHERE provider_media_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 4. Additional indexes for query patterns
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_party_template_items_provider_media
  ON public.party_song_template_items (provider, provider_media_id);

CREATE INDEX IF NOT EXISTS idx_party_template_items_collection
  ON public.party_song_template_items (provider_collection_id, import_source_position)
  WHERE provider_collection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_party_template_items_playback_status
  ON public.party_song_template_items (playback_status);

-- ----------------------------------------------------------------
-- 5. Backfill existing catalog rows
-- ----------------------------------------------------------------
-- Set provider + source_kind; infer playback_status from media_url shape

UPDATE public.party_song_template_items
SET
  provider     = 'catalog',
  source_kind  = 'catalog',
  playback_status = CASE
    WHEN media_url IS NOT NULL
      AND media_url <> ''
      AND (
        lower(media_url) LIKE '%.mp4%'
        OR lower(media_url) LIKE '%.webm%'
        OR lower(media_url) LIKE '%.ogg%'
      )
    THEN 'ready'
    ELSE 'unknown'
  END
WHERE provider = 'catalog';
