-- ============================================================
-- Social Posts: add image_url column + post-images bucket
-- ============================================================

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Update content check to allow empty content when image_url is present
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_content_check;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_content_check
  CHECK (
    (char_length(content) BETWEEN 1 AND 1000)
    OR (image_url IS NOT NULL AND char_length(content) BETWEEN 0 AND 1000)
  );

-- ============================================================
-- Storage bucket: post-images (public)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "post_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

CREATE POLICY "post_images_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "post_images_delete_own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Update RPC: get_posts_feed — include image_url
-- ============================================================
DROP FUNCTION IF EXISTS public.get_posts_feed(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_posts_feed(
  p_user_id  UUID,
  p_limit    INTEGER DEFAULT 20,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  content         TEXT,
  image_url       TEXT,
  title_id        BIGINT,
  created_at      TIMESTAMPTZ,
  author_id       UUID,
  author_name     TEXT,
  author_username TEXT,
  author_avatar   TEXT,
  like_count      BIGINT,
  comment_count   BIGINT,
  liked_by_me     BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.content,
    p.image_url,
    p.title_id,
    p.created_at,
    p.user_id                               AS author_id,
    up.name                                 AS author_name,
    up.username                             AS author_username,
    up.avatar_url                           AS author_avatar,
    COUNT(DISTINCT pl.user_id)              AS like_count,
    COUNT(DISTINCT pc.id)                   AS comment_count,
    BOOL_OR(pl.user_id = p_user_id)         AS liked_by_me
  FROM public.social_posts p
  LEFT JOIN public.user_profiles up   ON up.id = p.user_id
  LEFT JOIN public.post_likes    pl   ON pl.post_id = p.id
  LEFT JOIN public.post_comments pc   ON pc.post_id = p.id
  WHERE
    p.user_id = p_user_id
    OR p.user_id IN (
      SELECT following_id FROM public.user_follows WHERE follower_id = p_user_id
    )
  GROUP BY p.id, p.content, p.image_url, p.title_id, p.created_at, p.user_id,
           up.name, up.username, up.avatar_url
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
