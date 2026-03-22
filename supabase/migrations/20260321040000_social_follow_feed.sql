-- ============================================================
-- Sprint 4: Social Graph — Follow System + Activity Feed
-- ============================================================

-- ── Follow relationships ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows_select_all"
  ON public.user_follows FOR SELECT
  USING (true);

CREATE POLICY "follows_insert_own"
  ON public.user_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own"
  ON public.user_follows FOR DELETE
  USING (auth.uid() = follower_id);

-- ── Activity feed ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_activity (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT        NOT NULL CHECK (action_type IN ('added', 'completed', 'dropped', 'rated', 'reviewed')),
  title_id    INTEGER     REFERENCES public.titles(id) ON DELETE CASCADE,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_user_id_idx ON public.user_activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_created_idx ON public.user_activity (created_at DESC);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_select_all"
  ON public.user_activity FOR SELECT
  USING (true);

CREATE POLICY "activity_insert_own"
  ON public.user_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activity_delete_own"
  ON public.user_activity FOR DELETE
  USING (auth.uid() = user_id);

-- ── Helper: follow counts for a user ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_follow_counts(p_user_id uuid)
RETURNS TABLE(followers_count bigint, following_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT count(*) FROM public.user_follows WHERE following_id = p_user_id) AS followers_count,
    (SELECT count(*) FROM public.user_follows WHERE follower_id  = p_user_id) AS following_count;
$$;

-- ── Helper: activity feed for a user (from people they follow) ──
CREATE OR REPLACE FUNCTION public.get_social_feed(p_user_id uuid, p_limit int DEFAULT 40)
RETURNS TABLE(
  id          uuid,
  user_id     uuid,
  action_type text,
  title_id    integer,
  metadata    jsonb,
  created_at  timestamptz,
  actor_name      text,
  actor_username  text,
  actor_avatar_url text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ua.id,
    ua.user_id,
    ua.action_type,
    ua.title_id,
    ua.metadata,
    ua.created_at,
    up.name         AS actor_name,
    up.username     AS actor_username,
    up.avatar_url   AS actor_avatar_url
  FROM public.user_activity ua
  JOIN public.user_follows  uf ON ua.user_id = uf.following_id AND uf.follower_id = p_user_id
  LEFT JOIN public.user_profiles up ON ua.user_id = up.id
  ORDER BY ua.created_at DESC
  LIMIT p_limit;
$$;

-- ── Helper: watchlist overlap between two users ───────────────
CREATE OR REPLACE FUNCTION public.get_watchlist_overlap(p_user_a uuid, p_user_b uuid)
RETURNS TABLE(title_id integer, status_a text, status_b text, score_a numeric, score_b numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    a.title_id,
    a.list_status AS status_a,
    b.list_status AS status_b,
    a.score       AS score_a,
    b.score       AS score_b
  FROM public.user_lists a
  JOIN public.user_lists b ON a.title_id = b.title_id AND b.user_id = p_user_b
  WHERE a.user_id = p_user_a
  ORDER BY a.title_id;
$$;
