-- ============================================================
-- Social Posts: Instagram-style free-form posts
-- Tables: social_posts, post_likes, post_comments
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  title_id    BIGINT      REFERENCES public.canonical_titles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_user_created ON public.social_posts (user_id, created_at DESC);
CREATE INDEX idx_social_posts_created       ON public.social_posts (created_at DESC);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_posts_public_read"
  ON public.social_posts FOR SELECT USING (true);

CREATE POLICY "social_posts_insert_own"
  ON public.social_posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "social_posts_delete_own"
  ON public.social_posts FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Post Likes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id     UUID        NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX idx_post_likes_post ON public.post_likes (post_id);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_likes_public_read"
  ON public.post_likes FOR SELECT USING (true);

CREATE POLICY "post_likes_manage_own"
  ON public.post_likes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Post Comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON public.post_comments (post_id, created_at ASC);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_comments_public_read"
  ON public.post_comments FOR SELECT USING (true);

CREATE POLICY "post_comments_insert_own"
  ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_comments_delete_own"
  ON public.post_comments FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- RPC: get_posts_feed(p_user_id, p_limit, p_offset)
-- Returns posts from followed users + own posts,
-- with author info, like_count, comment_count, liked_by_me
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_posts_feed(
  p_user_id  UUID,
  p_limit    INTEGER DEFAULT 20,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  content         TEXT,
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
  GROUP BY p.id, p.content, p.title_id, p.created_at, p.user_id, up.name, up.username, up.avatar_url
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ============================================================
-- RPC: get_post_comments(p_post_id)
-- Returns comments with author profile
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_post_comments(p_post_id UUID)
RETURNS TABLE (
  id              UUID,
  content         TEXT,
  created_at      TIMESTAMPTZ,
  author_id       UUID,
  author_name     TEXT,
  author_username TEXT,
  author_avatar   TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id,
    c.content,
    c.created_at,
    c.user_id                AS author_id,
    up.name                  AS author_name,
    up.username              AS author_username,
    up.avatar_url            AS author_avatar
  FROM public.post_comments c
  LEFT JOIN public.user_profiles up ON up.id = c.user_id
  WHERE c.post_id = p_post_id
  ORDER BY c.created_at ASC;
$$;
