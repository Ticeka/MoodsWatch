-- ============================================================
-- Add default quiz preset to party templates
-- ============================================================

ALTER TABLE public.party_song_templates
ADD COLUMN IF NOT EXISTS default_preset_id text NOT NULL DEFAULT 'party-classic'
  CHECK (default_preset_id IN ('party-classic', 'song-typing', 'full-recall'));

