-- ============================================================
-- replace_party_template_items — v2 (YouTube-aware)
-- 2026-03-31
--
-- Replaces the v1 RPC that only handled catalog items
-- (required song_id IS NOT NULL).
--
-- v2 handles mixed-provider playlists:
--   • catalog items  — song_id NOT NULL, provider_media_id NULL
--   • youtube items  — song_id NULL,     provider_media_id NOT NULL
--
-- Items that have neither are silently skipped.
-- ============================================================

CREATE OR REPLACE FUNCTION public.replace_party_template_items(
  p_template_id bigint,
  p_items       jsonb        -- JSON array of item objects
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ownership check (belt-and-suspenders on top of RLS)
  IF NOT EXISTS (
    SELECT 1 FROM public.party_song_templates
    WHERE id = p_template_id
      AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised to modify template %', p_template_id
      USING ERRCODE = '42501';
  END IF;

  -- Delete all existing items atomically
  DELETE FROM public.party_song_template_items
  WHERE template_id = p_template_id;

  -- Re-insert from the supplied JSON array (empty = clear only)
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.party_song_template_items (
      template_id,
      song_id,
      source_title_id,
      source_title_name,
      resolved_source_title_id,
      resolved_source_title_name,
      source_resolution_status,
      source_match_confidence,
      source_match_method,
      song_title,
      theme_type,
      artist_name,
      media_url,
      cover_url,
      position,
      provider,
      provider_media_id,
      provider_collection_id,
      provider_url,
      source_kind,
      playback_status,
      duration_sec,
      metadata_json,
      imported_at,
      import_source_position,
      sync_state
    )
    SELECT
      p_template_id,
      NULLIF(item->>'song_id', '')::bigint,
      NULLIF(item->>'source_title_id', '')::bigint,
      COALESCE(item->>'source_title_name', ''),
      NULLIF(item->>'resolved_source_title_id', '')::bigint,
      COALESCE(item->>'resolved_source_title_name', ''),
      COALESCE(NULLIF(item->>'source_resolution_status', ''), 'unresolved'),
      COALESCE(NULLIF(item->>'source_match_confidence', ''), 'low'),
      COALESCE(NULLIF(item->>'source_match_method', ''), 'youtube_title_parse'),
      COALESCE(item->>'song_title', ''),
      COALESCE(NULLIF(item->>'theme_type', ''), 'OP'),
      COALESCE(item->>'artist_name', ''),
      COALESCE(item->>'media_url', ''),
      COALESCE(item->>'cover_url', ''),
      COALESCE((item->>'position')::integer, 0),
      COALESCE(NULLIF(item->>'provider', ''), 'catalog'),
      NULLIF(item->>'provider_media_id', ''),
      NULLIF(item->>'provider_collection_id', ''),
      NULLIF(item->>'provider_url', ''),
      COALESCE(NULLIF(item->>'source_kind', ''), 'catalog'),
      COALESCE(NULLIF(item->>'playback_status', ''), 'unknown'),
      NULLIF(item->>'duration_sec', '')::integer,
      COALESCE((item->>'metadata_json')::jsonb, '{}'::jsonb),
      NULLIF(item->>'imported_at', '')::timestamptz,
      NULLIF(item->>'import_source_position', '')::integer,
      NULLIF(item->>'sync_state', '')
    FROM jsonb_array_elements(p_items) AS item
    -- Accept catalog items (have song_id) OR youtube items (have provider_media_id)
    WHERE NULLIF(item->>'song_id', '') IS NOT NULL
       OR NULLIF(item->>'provider_media_id', '') IS NOT NULL;
  END IF;
END;
$$;

-- Grant to authenticated users only
GRANT EXECUTE ON FUNCTION public.replace_party_template_items(bigint, jsonb)
  TO authenticated;
