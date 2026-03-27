-- Fix RLS initplan performance: wrap auth.uid() in (select auth.uid())
-- to avoid per-row re-evaluation of auth functions in RLS policies.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ============================================================
-- user_profiles
-- ============================================================
ALTER POLICY "Users can read own profile" ON public.user_profiles
  USING ((select auth.uid()) = id);

ALTER POLICY "Users can update own profile" ON public.user_profiles
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "Users can insert own profile" ON public.user_profiles
  WITH CHECK ((select auth.uid()) = id);

-- Handle legacy policy names (may exist in pre-migration databases)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'Users can insert their own profile.'
  ) THEN
    ALTER POLICY "Users can insert their own profile." ON public.user_profiles
      WITH CHECK ((select auth.uid()) = id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profiles'
      AND policyname = 'Users can update own profile.'
  ) THEN
    ALTER POLICY "Users can update own profile." ON public.user_profiles
      USING ((select auth.uid()) = id)
      WITH CHECK ((select auth.uid()) = id);
  END IF;
END $$;

-- ============================================================
-- user_lists
-- ============================================================
ALTER POLICY "Users can manage own list" ON public.user_lists
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Handle legacy policy names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_lists'
      AND policyname = 'Users can view their own lists.'
  ) THEN
    ALTER POLICY "Users can view their own lists." ON public.user_lists
      USING ((select auth.uid()) = user_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_lists'
      AND policyname = 'Users can insert their own lists.'
  ) THEN
    ALTER POLICY "Users can insert their own lists." ON public.user_lists
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_lists'
      AND policyname = 'Users can update their own lists.'
  ) THEN
    ALTER POLICY "Users can update their own lists." ON public.user_lists
      USING ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_lists'
      AND policyname = 'Users can delete their own lists.'
  ) THEN
    ALTER POLICY "Users can delete their own lists." ON public.user_lists
      USING ((select auth.uid()) = user_id);
  END IF;
END $$;

-- ============================================================
-- user_favorite_titles
-- ============================================================
ALTER POLICY "Users can manage own favorite titles" ON public.user_favorite_titles
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- user_title_history
-- ============================================================
ALTER POLICY "Users can manage own title history" ON public.user_title_history
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- user_hidden_titles
-- ============================================================
ALTER POLICY "Users can manage own hidden titles" ON public.user_hidden_titles
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- user_consumption_sessions
-- ============================================================
ALTER POLICY "Users can manage own consumption sessions" ON public.user_consumption_sessions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- content_reports
-- ============================================================
ALTER POLICY "Authenticated users can submit content reports" ON public.content_reports
  WITH CHECK (
    (select auth.uid()) is not null
    and (reported_by is null or reported_by = (select auth.uid()))
  );

ALTER POLICY "Users can read own content reports" ON public.content_reports
  USING (reported_by = (select auth.uid()));

-- ============================================================
-- battle_sessions
-- ============================================================
ALTER POLICY "Users can manage own battle sessions" ON public.battle_sessions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- battle_votes
-- ============================================================
ALTER POLICY "Users can manage own battle votes" ON public.battle_votes
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- battle_public_decks
-- ============================================================
ALTER POLICY "Users can manage own battle public decks" ON public.battle_public_decks
  USING ((select auth.uid()) = owner_user_id)
  WITH CHECK ((select auth.uid()) = owner_user_id);

-- ============================================================
-- profile_comments
-- ============================================================
ALTER POLICY "Users can read own profile comments or public profile comments" ON public.profile_comments
  USING (
    (select auth.uid()) = profile_user_id
    or exists (
      select 1
      from public.user_profiles owner_profile
      where owner_profile.id = profile_user_id
        and owner_profile.is_profile_public = true
    )
  );

ALTER POLICY "Authenticated users can insert profile comments" ON public.profile_comments
  WITH CHECK (
    (select auth.uid()) = author_user_id
    and (
      (select auth.uid()) = profile_user_id
      or exists (
        select 1
        from public.user_profiles owner_profile
        where owner_profile.id = profile_user_id
          and owner_profile.is_profile_public = true
          and owner_profile.allow_profile_comments = true
      )
    )
  );

ALTER POLICY "Comment author can delete own comment" ON public.profile_comments
  USING ((select auth.uid()) = author_user_id);

ALTER POLICY "Profile owner can moderate comments" ON public.profile_comments
  USING ((select auth.uid()) = profile_user_id);

-- ============================================================
-- title_reviews
-- ============================================================
ALTER POLICY "title_reviews_insert_own" ON public.title_reviews
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "title_reviews_update_own" ON public.title_reviews
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "title_reviews_delete_own" ON public.title_reviews
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- tierlist_templates
-- ============================================================
ALTER POLICY "Public can read public tierlist templates" ON public.tierlist_templates
  USING (
    is_public = true
    or owner_user_id = (select auth.uid())
  );

ALTER POLICY "Users can manage own tierlist templates" ON public.tierlist_templates
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

-- ============================================================
-- tierlist_lists
-- ============================================================
ALTER POLICY "Public can read public tierlist lists" ON public.tierlist_lists
  USING (
    is_public = true
    or owner_user_id = (select auth.uid())
  );

ALTER POLICY "Users can manage own tierlist lists" ON public.tierlist_lists
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

-- ============================================================
-- tierlist_list_rows
-- ============================================================
ALTER POLICY "Public can read visible tierlist rows" ON public.tierlist_list_rows
  USING (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_rows.list_id
        and (lists.is_public = true or lists.owner_user_id = (select auth.uid()))
    )
  );

ALTER POLICY "Users can manage own tierlist rows" ON public.tierlist_list_rows
  USING (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_rows.list_id
        and lists.owner_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_rows.list_id
        and lists.owner_user_id = (select auth.uid())
    )
  );

-- ============================================================
-- tierlist_list_pool_items
-- ============================================================
ALTER POLICY "Public can read visible tierlist pool items" ON public.tierlist_list_pool_items
  USING (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_pool_items.list_id
        and (lists.is_public = true or lists.owner_user_id = (select auth.uid()))
    )
  );

ALTER POLICY "Users can manage own tierlist pool items" ON public.tierlist_list_pool_items
  USING (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_pool_items.list_id
        and lists.owner_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    exists (
      select 1
      from public.tierlist_lists lists
      where lists.id = tierlist_list_pool_items.list_id
        and lists.owner_user_id = (select auth.uid())
    )
  );

-- ============================================================
-- tierlist_comments
-- ============================================================
ALTER POLICY "Public can read tierlist comments" ON public.tierlist_comments
  USING (
    exists (
      select 1 from public.tierlist_lists l
      where l.id = tierlist_comments.list_id
        and (l.is_public = true or l.owner_user_id = (select auth.uid()))
    )
  );

ALTER POLICY "Authenticated can insert tierlist comments" ON public.tierlist_comments
  WITH CHECK (
    (select auth.uid()) is not null
    and (select auth.uid()) = author_user_id
    and exists (
      select 1 from public.tierlist_lists l
      where l.id = tierlist_comments.list_id
        and l.is_public = true
    )
  );

ALTER POLICY "Author or list owner can delete tierlist comments" ON public.tierlist_comments
  USING (
    (select auth.uid()) = author_user_id
    or exists (
      select 1 from public.tierlist_lists l
      where l.id = tierlist_comments.list_id
        and l.owner_user_id = (select auth.uid())
    )
  );

-- ============================================================
-- notifications
-- ============================================================
ALTER POLICY "Users can read own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Authenticated can insert notifications" ON public.notifications
  WITH CHECK ((select auth.uid()) is not null);

ALTER POLICY "Users can update own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can delete own notifications" ON public.notifications
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- mood_journal
-- ============================================================
ALTER POLICY "mood_journal_self_all" ON public.mood_journal
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- daily_challenges
-- ============================================================
ALTER POLICY "daily_challenges_admin_write" ON public.daily_challenges
  USING (
    exists (
      select 1 from public.user_profiles
      where id = (select auth.uid())
        and role in ('admin', 'editor')
    )
  );

-- ============================================================
-- daily_challenge_completions
-- ============================================================
ALTER POLICY "daily_completions_self_all" ON public.daily_challenge_completions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- user_follows
-- ============================================================
ALTER POLICY "follows_insert_own" ON public.user_follows
  WITH CHECK ((select auth.uid()) = follower_id);
