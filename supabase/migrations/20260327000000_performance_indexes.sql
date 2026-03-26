-- ============================================================
-- Performance Indexes - 2026-03-27
-- Fixes identified from slow query analysis
-- ============================================================

-- ---------------------------------------------------------------
-- 1. title_moods — MISSING index on canonical_title_id
--    This table is lateral-joined in EVERY canonical_titles fetch
--    (1000 rows × lateral lookup = 1000 seq scans per request)
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_title_moods_title_id
  ON public.title_moods (canonical_title_id);

-- ---------------------------------------------------------------
-- 2. canonical_titles — composite sort indexes
--    Queries use ORDER BY popularity_score DESC NULLS LAST, id ASC
--    and ORDER BY created_at DESC NULLS LAST, id ASC
--    Single-column index can't efficiently serve composite sorts
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_canonical_titles_popularity_id
  ON public.canonical_titles (popularity_score DESC NULLS LAST, id ASC);

CREATE INDEX IF NOT EXISTS idx_canonical_titles_created_at_id
  ON public.canonical_titles (created_at DESC NULLS LAST, id ASC);

-- ---------------------------------------------------------------
-- 3. title_characters — index on anilist_id
--    Tierlist fetches characters using .in('anilist_id', chunk)
--    which currently does seq scan on anilist_id
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_title_characters_anilist_id
  ON public.title_characters (anilist_id);

-- ---------------------------------------------------------------
-- 4. battle_title_stats — indexes for leaderboard sorting
--    BattleLeaderboard orders by elo_score, win_rate, total_votes
--    with .gte('total_votes', 3) filter
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_battle_title_stats_elo
  ON public.battle_title_stats (elo_score DESC NULLS LAST)
  WHERE total_votes >= 3;

CREATE INDEX IF NOT EXISTS idx_battle_title_stats_win_rate
  ON public.battle_title_stats (win_rate DESC NULLS LAST)
  WHERE total_votes >= 3;

CREATE INDEX IF NOT EXISTS idx_battle_title_stats_total_votes
  ON public.battle_title_stats (total_votes DESC NULLS LAST);

-- ---------------------------------------------------------------
-- 5. notifications — partial index for unread count
--    Header fetches: .eq('is_read', false).order('created_at', desc).limit(10)
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;
