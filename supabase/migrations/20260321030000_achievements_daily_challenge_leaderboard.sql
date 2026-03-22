-- ============================================================
-- Achievement System
-- ============================================================
CREATE TABLE IF NOT EXISTS public.achievements (
  id          TEXT        PRIMARY KEY,
  name_th     TEXT        NOT NULL,
  name_en     TEXT        NOT NULL,
  description_th TEXT,
  description_en TEXT,
  icon        TEXT        NOT NULL DEFAULT '🏆',
  category    TEXT        NOT NULL DEFAULT 'general',
  threshold   INTEGER     NOT NULL DEFAULT 1,
  sort_order  INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id  TEXT        NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements_self_read"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_achievements_service_insert"
  ON public.user_achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_achievements_user
  ON public.user_achievements (user_id, earned_at DESC);

-- Seed default achievements
INSERT INTO public.achievements (id, name_th, name_en, description_th, description_en, icon, category, threshold, sort_order) VALUES
  ('first_entry',       'เริ่มต้นแล้ว',        'First Entry',          'เพิ่มเรื่องแรกเข้าลิสต์',               'Added first title to list',              '📖', 'watchlist',  1,  10),
  ('ten_titles',        'นักสะสม',             'Collector',            'มี 10 เรื่องในลิสต์',                   'Have 10 titles in list',                 '📚', 'watchlist',  10, 20),
  ('fifty_titles',      'นักอ่านตัวยง',         'Avid Reader',          'มี 50 เรื่องในลิสต์',                   'Have 50 titles in list',                 '🗂️', 'watchlist',  50, 30),
  ('first_completed',   'ปิดตำนาน',            'First Finish',         'จบเรื่องแรก',                           'Completed first title',                  '✅', 'watchlist',  1,  40),
  ('ten_completed',     'นักดูอย่างจริงจัง',    'Devoted Watcher',      'จบ 10 เรื่อง',                          'Completed 10 titles',                    '🎯', 'watchlist',  10, 50),
  ('first_rating',      'นักวิจารณ์',           'Critic',               'ให้คะแนนเรื่องแรก',                     'Rated first title',                      '⭐', 'rating',     1,  60),
  ('first_review',      'นักเขียน',             'Reviewer',             'เขียนรีวิวครั้งแรก',                    'Wrote first review',                     '✍️', 'reviews',    1,  70),
  ('first_battle',      'นักรบ',               'Fighter',              'เล่น Battle ครั้งแรก',                   'Played first Battle session',            '⚔️', 'battle',     1,  80),
  ('battle_veteran',    'ทหารผ่านศึก',          'Battle Veteran',       'เล่น Battle 100 ครั้ง',                  'Played 100 Battle votes',                '🛡️', 'battle',     100, 90),
  ('mood_streak_7',     'อารมณ์ดีทุกวัน',       '7-Day Mood Streak',    'บันทึก Mood Journal 7 วันติดต่อกัน',     'Logged mood for 7 consecutive days',     '🌟', 'journal',    7,  100),
  ('first_tierlist',    'นักจัดอันดับ',          'Ranker',               'สร้าง Tier List แรก',                   'Created first Tier List',                '🎖️', 'tierlist',   1,  110),
  ('daily_challenger',  'ผู้ท้าทายประจำวัน',    'Daily Challenger',     'เล่น Daily Challenge ครั้งแรก',          'Played first Daily Challenge',           '📅', 'daily',      1,  120)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Daily Challenge: curated daily battle deck
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_date  DATE        NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  deck_id         UUID,
  theme_name_th   TEXT,
  theme_name_en   TEXT,
  theme_icon      TEXT        DEFAULT '📅',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_challenges_public_read"
  ON public.daily_challenges FOR SELECT USING (true);

CREATE POLICY "daily_challenges_admin_write"
  ON public.daily_challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

CREATE TABLE IF NOT EXISTS public.daily_challenge_completions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_date  DATE        NOT NULL,
  session_id      UUID,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_date)
);

ALTER TABLE public.daily_challenge_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_completions_self_all"
  ON public.daily_challenge_completions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_daily_completions_user
  ON public.daily_challenge_completions (user_id, challenge_date DESC);

CREATE INDEX idx_daily_completions_date
  ON public.daily_challenge_completions (challenge_date DESC);

-- ============================================================
-- Battle Leaderboard: materialized title rankings from votes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.battle_title_stats (
  title_id    BIGINT      PRIMARY KEY REFERENCES public.canonical_titles(id) ON DELETE CASCADE,
  wins        INTEGER     NOT NULL DEFAULT 0,
  losses      INTEGER     NOT NULL DEFAULT 0,
  total_votes INTEGER     NOT NULL DEFAULT 0,
  win_rate    NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE WHEN wins + losses > 0 THEN wins::numeric / (wins + losses) ELSE 0 END
  ) STORED,
  elo_score   NUMERIC(8,2) NOT NULL DEFAULT 1000,
  last_battle TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.battle_title_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_stats_public_read"
  ON public.battle_title_stats FOR SELECT USING (true);

CREATE INDEX idx_battle_stats_elo
  ON public.battle_title_stats (elo_score DESC);

CREATE INDEX idx_battle_stats_wins
  ON public.battle_title_stats (wins DESC);

-- Function to update stats when a battle vote is cast
CREATE OR REPLACE FUNCTION public.update_battle_title_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Insert or update winner stats
  INSERT INTO public.battle_title_stats (title_id, wins, total_votes, last_battle, updated_at)
  VALUES (NEW.winner_id, 1, 1, NEW.created_at, now())
  ON CONFLICT (title_id) DO UPDATE SET
    wins        = battle_title_stats.wins + 1,
    total_votes = battle_title_stats.total_votes + 1,
    elo_score   = battle_title_stats.elo_score + 16,
    last_battle = NEW.created_at,
    updated_at  = now();

  -- Insert or update loser stats (loser_id may be null for byes)
  IF NEW.loser_id IS NOT NULL THEN
    INSERT INTO public.battle_title_stats (title_id, losses, total_votes, last_battle, updated_at)
    VALUES (NEW.loser_id, 1, 1, NEW.created_at, now())
    ON CONFLICT (title_id) DO UPDATE SET
      losses      = battle_title_stats.losses + 1,
      total_votes = battle_title_stats.total_votes + 1,
      elo_score   = GREATEST(battle_title_stats.elo_score - 16, 0),
      last_battle = NEW.created_at,
      updated_at  = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Check if battle_votes table exists before creating trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'battle_votes') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'battle_vote_stats_trigger'
        AND event_object_table = 'battle_votes'
    ) THEN
      EXECUTE 'CREATE TRIGGER battle_vote_stats_trigger
        AFTER INSERT ON public.battle_votes
        FOR EACH ROW EXECUTE FUNCTION public.update_battle_title_stats()';
    END IF;
  END IF;
END;
$$;
