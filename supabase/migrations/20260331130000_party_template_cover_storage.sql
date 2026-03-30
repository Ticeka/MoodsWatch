-- ============================================================
-- Party template covers: storage bucket + legacy cover backfill
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'party-template-covers',
  'party-template-covers',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'party_template_covers_public_read'
  ) THEN
    CREATE POLICY "party_template_covers_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'party-template-covers');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'party_template_covers_insert_own'
  ) THEN
    CREATE POLICY "party_template_covers_insert_own"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'party-template-covers'
        AND auth.uid() IS NOT NULL
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'party_template_covers_delete_own'
  ) THEN
    CREATE POLICY "party_template_covers_delete_own"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'party-template-covers'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

WITH first_item_cover AS (
  SELECT DISTINCT ON (template_id)
    template_id,
    cover_url
  FROM public.party_song_template_items
  WHERE NULLIF(BTRIM(cover_url), '') IS NOT NULL
  ORDER BY template_id, position ASC, id ASC
)
UPDATE public.party_song_templates AS templates
SET
  cover_url = first_item_cover.cover_url,
  updated_at = NOW()
FROM first_item_cover
WHERE templates.id = first_item_cover.template_id
  AND (
    templates.cover_url IS NULL
    OR BTRIM(templates.cover_url) = ''
    OR LOWER(templates.cover_url) LIKE 'blob:%'
    OR LOWER(templates.cover_url) LIKE 'javascript:%'
  );
