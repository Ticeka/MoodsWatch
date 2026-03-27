-- Fix: function_search_path_mutable
-- Add SET search_path = public to all flagged functions.
-- Using ALTER FUNCTION is cleaner than rewriting full bodies.

-- ── Social / Follow ──────────────────────────────────────────
ALTER FUNCTION public.get_follow_counts(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_social_feed(uuid, int)
  SET search_path = public;

ALTER FUNCTION public.get_watchlist_overlap(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION public.get_follow_notifications(uuid, int)
  SET search_path = public;

-- ── Social Posts ─────────────────────────────────────────────
ALTER FUNCTION public.get_posts_feed(uuid, integer, integer)
  SET search_path = public;

ALTER FUNCTION public.get_post_comments(uuid)
  SET search_path = public;

-- ── Battle ───────────────────────────────────────────────────
ALTER FUNCTION public.update_battle_title_stats()
  SET search_path = public;

ALTER FUNCTION public.handle_battle_rollup_refresh()
  SET search_path = public;

-- ── Achievements ─────────────────────────────────────────────
ALTER FUNCTION public.award_achievement(uuid, text)
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_user_lists()
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_title_reviews()
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_battle_votes()
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_daily_challenge()
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_mood_journal()
  SET search_path = public;

ALTER FUNCTION public.trg_achievements_tierlist()
  SET search_path = public;

ALTER FUNCTION public.backfill_achievements()
  SET search_path = public;

-- ── TierList ─────────────────────────────────────────────────
ALTER FUNCTION public.sync_tierlist_template_adult_content()
  SET search_path = public;

-- ── Meta cache triggers ──────────────────────────────────────
ALTER FUNCTION public.refresh_aliases_cache()
  SET search_path = public;

ALTER FUNCTION public.refresh_genres_cache()
  SET search_path = public;

ALTER FUNCTION public.refresh_tags_cache()
  SET search_path = public;

ALTER FUNCTION public.refresh_moods_cache()
  SET search_path = public;

-- ── Shared utility ───────────────────────────────────────────
ALTER FUNCTION public.set_updated_at()
  SET search_path = public;

ALTER FUNCTION public.normalize_profile_username()
  SET search_path = public;

ALTER FUNCTION public.replace_title_ids_in_jsonb_array(jsonb, bigint, bigint)
  SET search_path = public;

ALTER FUNCTION public.replace_top_titles_payload(jsonb, bigint, bigint)
  SET search_path = public;

-- ── Auth trigger (created outside migrations) ────────────────
ALTER FUNCTION public.handle_new_user()
  SET search_path = public;
