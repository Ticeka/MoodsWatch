-- ============================================================
-- Achievement Auto-Award System
-- Grants achievements automatically via DB triggers.
-- Tables watched: user_lists, title_reviews, battle_votes,
--                 daily_challenge_completions, tierlist_lists,
--                 mood_journal
-- ============================================================

-- Helper: silently insert achievement (idempotent)
CREATE OR REPLACE FUNCTION public.award_achievement(
  p_user_id      UUID,
  p_achievement  TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_achievements (user_id, achievement_id)
  VALUES (p_user_id, p_achievement)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;

-- ============================================================
-- Trigger: user_lists (INSERT + UPDATE)
-- Covers: first_entry, ten_titles, fifty_titles,
--         first_completed, ten_completed, first_rating
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_user_lists()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total     INTEGER;
  v_completed INTEGER;
  v_rated     INTEGER;
BEGIN
  -- Count total titles in list for this user
  SELECT COUNT(*) INTO v_total
  FROM public.user_lists WHERE user_id = NEW.user_id;

  IF v_total >= 1  THEN PERFORM public.award_achievement(NEW.user_id, 'first_entry');  END IF;
  IF v_total >= 10 THEN PERFORM public.award_achievement(NEW.user_id, 'ten_titles');   END IF;
  IF v_total >= 50 THEN PERFORM public.award_achievement(NEW.user_id, 'fifty_titles'); END IF;

  -- Count completed titles
  SELECT COUNT(*) INTO v_completed
  FROM public.user_lists
  WHERE user_id = NEW.user_id AND list_status = 'completed';

  IF v_completed >= 1  THEN PERFORM public.award_achievement(NEW.user_id, 'first_completed'); END IF;
  IF v_completed >= 10 THEN PERFORM public.award_achievement(NEW.user_id, 'ten_completed');   END IF;

  -- Count titles with a score
  SELECT COUNT(*) INTO v_rated
  FROM public.user_lists
  WHERE user_id = NEW.user_id AND score IS NOT NULL;

  IF v_rated >= 1 THEN PERFORM public.award_achievement(NEW.user_id, 'first_rating'); END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_user_lists_insert ON public.user_lists;
CREATE TRIGGER trg_achievements_user_lists_insert
  AFTER INSERT ON public.user_lists
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_user_lists();

DROP TRIGGER IF EXISTS trg_achievements_user_lists_update ON public.user_lists;
CREATE TRIGGER trg_achievements_user_lists_update
  AFTER UPDATE OF list_status, score ON public.user_lists
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_user_lists();

-- ============================================================
-- Trigger: title_reviews (INSERT)
-- Covers: first_review
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_title_reviews()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.award_achievement(NEW.user_id, 'first_review');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_title_reviews ON public.title_reviews;
CREATE TRIGGER trg_achievements_title_reviews
  AFTER INSERT ON public.title_reviews
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_title_reviews();

-- ============================================================
-- Trigger: battle_votes (INSERT)
-- Covers: first_battle, battle_veteran
-- NOTE: battle_vote_stats_trigger already exists on this table
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_battle_votes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.battle_votes WHERE user_id = NEW.user_id;

  IF v_count >= 1   THEN PERFORM public.award_achievement(NEW.user_id, 'first_battle');    END IF;
  IF v_count >= 100 THEN PERFORM public.award_achievement(NEW.user_id, 'battle_veteran');  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_battle_votes ON public.battle_votes;
CREATE TRIGGER trg_achievements_battle_votes
  AFTER INSERT ON public.battle_votes
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_battle_votes();

-- ============================================================
-- Trigger: daily_challenge_completions (INSERT)
-- Covers: daily_challenger
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_daily_challenge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.award_achievement(NEW.user_id, 'daily_challenger');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_daily_challenge ON public.daily_challenge_completions;
CREATE TRIGGER trg_achievements_daily_challenge
  AFTER INSERT ON public.daily_challenge_completions
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_daily_challenge();

-- ============================================================
-- Trigger: tierlist_lists (INSERT)
-- Covers: first_tierlist
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_tierlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.award_achievement(NEW.user_id, 'first_tierlist');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_tierlist ON public.tierlist_lists;
CREATE TRIGGER trg_achievements_tierlist
  AFTER INSERT ON public.tierlist_lists
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_tierlist();

-- ============================================================
-- Trigger: mood_journal (INSERT)
-- Covers: mood_streak_7 (7 consecutive calendar days)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_achievements_mood_journal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_streak  INTEGER := 0;
  v_check   DATE;
BEGIN
  -- Walk backwards from today counting consecutive days
  v_check := NEW.logged_at;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.mood_journal
      WHERE user_id = NEW.user_id AND logged_at = v_check
    );
    v_streak := v_streak + 1;
    EXIT WHEN v_streak >= 7;
    v_check := v_check - INTERVAL '1 day';
  END LOOP;

  IF v_streak >= 7 THEN
    PERFORM public.award_achievement(NEW.user_id, 'mood_streak_7');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_achievements_mood_journal ON public.mood_journal;
CREATE TRIGGER trg_achievements_mood_journal
  AFTER INSERT ON public.mood_journal
  FOR EACH ROW EXECUTE FUNCTION public.trg_achievements_mood_journal();
