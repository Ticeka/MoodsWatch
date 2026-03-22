-- ============================================================
-- Fix: user_achievements RLS + backfill existing users
-- ============================================================

-- ── 1. Fix SELECT policy ──────────────────────────────────
-- Old policy only allowed users to see their own achievements,
-- which broke public profile pages viewing others' badges.
DROP POLICY IF EXISTS "user_achievements_self_read" ON public.user_achievements;

CREATE POLICY "user_achievements_public_read"
  ON public.user_achievements FOR SELECT
  USING (true);   -- achievements are public info (profile badges)

-- ── 2. Fix INSERT policy ──────────────────────────────────
-- Old policy: WITH CHECK (auth.uid() = user_id)
-- Problem: SECURITY DEFINER triggers run without a JWT session,
-- so auth.uid() = NULL → NULL = user_id = FALSE → INSERT blocked.
DROP POLICY IF EXISTS "user_achievements_service_insert" ON public.user_achievements;

CREATE POLICY "user_achievements_insert"
  ON public.user_achievements FOR INSERT
  WITH CHECK (
    auth.uid() = user_id          -- authenticated user (direct call)
    OR current_user = 'postgres'  -- SECURITY DEFINER trigger (owned by postgres)
  );

-- ── 3. Backfill function ──────────────────────────────────
-- Awards missing achievements to all existing users based on
-- their current data. Safe to run multiple times (idempotent).
CREATE OR REPLACE FUNCTION public.backfill_achievements()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r           RECORD;
  v_dates     DATE[];
  v_streak    INTEGER;
  i           INTEGER;
  v_awarded   INTEGER := 0;
BEGIN
  -- ── watchlist achievements ──────────────────────────────
  FOR r IN
    SELECT
      ul.user_id,
      COUNT(*)                                                AS total,
      COUNT(*) FILTER (WHERE ul.list_status = 'completed')   AS completed,
      COUNT(*) FILTER (WHERE ul.score IS NOT NULL)            AS rated
    FROM public.user_lists ul
    GROUP BY ul.user_id
  LOOP
    IF r.total     >= 1  THEN PERFORM public.award_achievement(r.user_id, 'first_entry');     END IF;
    IF r.total     >= 10 THEN PERFORM public.award_achievement(r.user_id, 'ten_titles');      END IF;
    IF r.total     >= 50 THEN PERFORM public.award_achievement(r.user_id, 'fifty_titles');    END IF;
    IF r.completed >= 1  THEN PERFORM public.award_achievement(r.user_id, 'first_completed'); END IF;
    IF r.completed >= 10 THEN PERFORM public.award_achievement(r.user_id, 'ten_completed');   END IF;
    IF r.rated     >= 1  THEN PERFORM public.award_achievement(r.user_id, 'first_rating');    END IF;
  END LOOP;

  -- ── reviews ────────────────────────────────────────────
  FOR r IN
    SELECT DISTINCT user_id FROM public.title_reviews
  LOOP
    PERFORM public.award_achievement(r.user_id, 'first_review');
  END LOOP;

  -- ── battle votes ───────────────────────────────────────
  FOR r IN
    SELECT user_id, COUNT(*) AS vote_count
    FROM public.battle_votes
    GROUP BY user_id
  LOOP
    IF r.vote_count >= 1   THEN PERFORM public.award_achievement(r.user_id, 'first_battle');   END IF;
    IF r.vote_count >= 100 THEN PERFORM public.award_achievement(r.user_id, 'battle_veteran'); END IF;
  END LOOP;

  -- ── daily challenge completions ────────────────────────
  FOR r IN
    SELECT DISTINCT user_id FROM public.daily_challenge_completions
  LOOP
    PERFORM public.award_achievement(r.user_id, 'daily_challenger');
  END LOOP;

  -- ── tierlist ────────────────────────────────────────────
  FOR r IN
    SELECT DISTINCT owner_user_id AS user_id
    FROM public.tierlist_lists
    WHERE owner_user_id IS NOT NULL
  LOOP
    PERFORM public.award_achievement(r.user_id, 'first_tierlist');
  END LOOP;

  -- ── mood streak (7 consecutive days) ───────────────────
  FOR r IN
    SELECT DISTINCT user_id FROM public.mood_journal
  LOOP
    -- Fetch all logged dates for this user, sorted newest-first
    SELECT ARRAY_AGG(logged_at ORDER BY logged_at DESC)
      INTO v_dates
      FROM public.mood_journal
     WHERE user_id = r.user_id;

    v_streak := 1;
    FOR i IN 2 .. COALESCE(array_length(v_dates, 1), 1) LOOP
      -- Sorted DESC: v_dates[i-1] is more recent, v_dates[i] is older
      IF v_dates[i] = v_dates[i - 1] - INTERVAL '1 day' THEN
        v_streak := v_streak + 1;
        IF v_streak >= 7 THEN
          PERFORM public.award_achievement(r.user_id, 'mood_streak_7');
          EXIT;
        END IF;
      ELSE
        v_streak := 1;  -- streak broken, reset
      END IF;
    END LOOP;
  END LOOP;

  -- Return count of achievements now in the table
  SELECT COUNT(*) INTO v_awarded FROM public.user_achievements;
  RETURN v_awarded;
END;
$$;

-- ── 4. Run backfill immediately on migration ──────────────
SELECT public.backfill_achievements();
