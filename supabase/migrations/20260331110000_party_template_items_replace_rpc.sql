-- ============================================================
-- replace_party_template_items — 2026-03-31
--
-- Atomic (single-transaction) replacement of all items in a
-- party template.  The naive two-step delete+insert in the
-- client means a failed insert leaves the template with zero
-- songs.  This RPC wraps both statements in one PG transaction
-- so either both succeed or neither do.
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
  -- Verify the caller owns the template (belt-and-suspenders on top of RLS)
  IF NOT EXISTS (
    SELECT 1 FROM public.party_song_templates
    WHERE id = p_template_id
      AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised to modify template %', p_template_id
      USING ERRCODE = '42501';
  END IF;

  -- Delete all existing items in one shot
  DELETE FROM public.party_song_template_items
  WHERE template_id = p_template_id;

  -- Re-insert from the supplied JSON array (empty array = clear only)
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.party_song_template_items (
      template_id,
      song_id,
      source_title_id,
      source_title_name,
      song_title,
      theme_type,
      artist_name,
      media_url,
      cover_url,
      position
    )
    SELECT
      p_template_id,
      (item->>'song_id')::bigint,
      NULLIF(item->>'source_title_id', '')::bigint,
      COALESCE(item->>'source_title_name', ''),
      COALESCE(item->>'song_title', ''),
      COALESCE(NULLIF(item->>'theme_type', ''), 'OP'),
      COALESCE(item->>'artist_name', ''),
      COALESCE(item->>'media_url', ''),
      COALESCE(item->>'cover_url', ''),
      (item->>'position')::integer
    FROM jsonb_array_elements(p_items) AS item
    WHERE (item->>'song_id') IS NOT NULL;
  END IF;
END;
$$;

-- Grant to authenticated users only (anon cannot own templates)
GRANT EXECUTE ON FUNCTION public.replace_party_template_items(bigint, jsonb)
  TO authenticated;
