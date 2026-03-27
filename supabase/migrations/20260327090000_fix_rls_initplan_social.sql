-- Fix remaining auth_rls_initplan warnings: wrap bare auth.uid() calls in
-- (select auth.uid()) to prevent per-row re-evaluation of the auth function.
-- Covers all policies not already fixed in 20260327030000.
--
-- Tables: user_follows, user_activity, social_posts, post_likes,
--         post_comments, user_achievements, user_discover_saved_searches,
--         discover_search_events, user_preferences.

-- ============================================================
-- user_follows
-- ============================================================
alter policy "follows_delete_own" on public.user_follows
  using ((select auth.uid()) = follower_id);

-- ============================================================
-- user_activity
-- ============================================================
alter policy "activity_insert_own" on public.user_activity
  with check ((select auth.uid()) = user_id);

alter policy "activity_delete_own" on public.user_activity
  using ((select auth.uid()) = user_id);

-- ============================================================
-- social_posts
-- ============================================================
alter policy "social_posts_insert_own" on public.social_posts
  with check ((select auth.uid()) = user_id);

alter policy "social_posts_delete_own" on public.social_posts
  using ((select auth.uid()) = user_id);

-- ============================================================
-- post_likes
-- ============================================================
alter policy "post_likes_manage_own" on public.post_likes
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- post_comments
-- ============================================================
alter policy "post_comments_insert_own" on public.post_comments
  with check ((select auth.uid()) = user_id);

alter policy "post_comments_delete_own" on public.post_comments
  using ((select auth.uid()) = user_id);

-- ============================================================
-- user_achievements
-- Keep the SECURITY DEFINER trigger path (current_user = 'postgres').
-- ============================================================
alter policy "user_achievements_insert" on public.user_achievements
  with check (
    (select auth.uid()) = user_id
    or current_user = 'postgres'
  );

-- ============================================================
-- user_discover_saved_searches
-- ============================================================
alter policy "Users can manage own discover saved searches"
  on public.user_discover_saved_searches
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- discover_search_events
-- ============================================================
alter policy "Anyone can insert discover search events"
  on public.discover_search_events
  with check (
    user_id is null or user_id = (select auth.uid())
  );

-- ============================================================
-- user_preferences
-- Also wrap is_staff_user() in (select ...) to avoid per-row evaluation.
-- ============================================================
alter policy "Users can read own preferences" on public.user_preferences
  using (
    (select auth.uid()) = user_id
    or (select public.is_staff_user())
  );

alter policy "Users can insert own preferences" on public.user_preferences
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own preferences" on public.user_preferences
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own preferences" on public.user_preferences
  using ((select auth.uid()) = user_id);
