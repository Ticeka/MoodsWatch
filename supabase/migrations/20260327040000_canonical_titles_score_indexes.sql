-- ============================================================
-- canonical_titles score & sort indexes
-- Supabase advisor: +79.86% query performance improvement
-- ============================================================

-- avg_score index — for score-based filtering and sorting
-- Supabase advisor recommended "mean_score" but the actual column is avg_score
CREATE INDEX IF NOT EXISTS idx_canonical_titles_avg_score
  ON public.canonical_titles (avg_score DESC NULLS LAST);

-- created_at single-column index — complements the existing composite
-- idx_canonical_titles_created_at_id for queries that filter on created_at alone
-- (e.g. WHERE created_at > $1 without ORDER BY id)
CREATE INDEX IF NOT EXISTS idx_canonical_titles_created_at
  ON public.canonical_titles (created_at DESC NULLS LAST);
