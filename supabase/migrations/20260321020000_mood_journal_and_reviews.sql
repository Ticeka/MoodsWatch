-- ============================================================
-- Mood Journal: one mood entry per user per day
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mood_journal (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood_id     TEXT        NOT NULL,
  note        TEXT,
  logged_at   DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, logged_at)
);

ALTER TABLE public.mood_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mood_journal_self_all"
  ON public.mood_journal
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_mood_journal_user_date
  ON public.mood_journal (user_id, logged_at DESC);

-- ============================================================
-- Title Reviews: one short review per user per title
-- ============================================================
CREATE TABLE IF NOT EXISTS public.title_reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id    BIGINT      NOT NULL REFERENCES public.canonical_titles(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 10 AND 500),
  spoiler     BOOLEAN     NOT NULL DEFAULT false,
  score       NUMERIC(5,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (title_id, user_id)
);

ALTER TABLE public.title_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "title_reviews_public_read"
  ON public.title_reviews FOR SELECT USING (true);

CREATE POLICY "title_reviews_insert_own"
  ON public.title_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "title_reviews_update_own"
  ON public.title_reviews FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "title_reviews_delete_own"
  ON public.title_reviews FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_title_reviews_title
  ON public.title_reviews (title_id, created_at DESC);

CREATE INDEX idx_title_reviews_user
  ON public.title_reviews (user_id, created_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER title_reviews_updated_at
  BEFORE UPDATE ON public.title_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
