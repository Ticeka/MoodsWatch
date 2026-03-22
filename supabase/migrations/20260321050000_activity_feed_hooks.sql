-- ============================================================
-- Sprint 5: Activity Feed Hooks — wire real events into feed
-- ============================================================

-- Add 'followed' as a valid action_type
-- (drop and recreate the CHECK constraint)
ALTER TABLE public.user_activity
  DROP CONSTRAINT IF EXISTS user_activity_action_type_check;

ALTER TABLE public.user_activity
  ADD CONSTRAINT user_activity_action_type_check
  CHECK (action_type IN ('added', 'completed', 'dropped', 'rated', 'reviewed', 'followed'));

-- Fix user_activity.title_id FK: Sprint 4 migration pointed to public.titles
-- but the app uses public.canonical_titles
ALTER TABLE public.user_activity
  DROP CONSTRAINT IF EXISTS user_activity_title_id_fkey;

ALTER TABLE public.user_activity
  ADD CONSTRAINT user_activity_title_id_fkey
  FOREIGN KEY (title_id) REFERENCES public.canonical_titles(id) ON DELETE CASCADE;


-- Notification helper: activities where the current user was followed
CREATE OR REPLACE FUNCTION public.get_follow_notifications(p_user_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE(
  id           uuid,
  actor_name      text,
  actor_username  text,
  actor_avatar_url text,
  created_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    ua.id,
    up.name         AS actor_name,
    up.username     AS actor_username,
    up.avatar_url   AS actor_avatar_url,
    ua.created_at
  FROM public.user_activity ua
  LEFT JOIN public.user_profiles up ON ua.user_id = up.id
  WHERE ua.action_type = 'followed'
    AND (ua.metadata->>'followed_user_id')::uuid = p_user_id
  ORDER BY ua.created_at DESC
  LIMIT p_limit;
$$;
