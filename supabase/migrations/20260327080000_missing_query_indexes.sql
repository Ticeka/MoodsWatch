-- Missing indexes identified from slow query advisor
--
-- 1. title_tags(tag_name)
--    Query: WHERE tag_name = ANY($1) AND canonical_title_id <> $2
--    Cost: 214 → 80 (62% reduction)
--    Used by: recommend.js getSimilarTitles tag matching
--
-- 2. duplicate_candidates(created_at DESC)
--    Query: ORDER BY created_at DESC (no status filter)
--    Existing (status, confidence, created_at) composite doesn't help here
--    Cost: 2102 → 445 (78% reduction)
--    Used by: AdminDuplicates default sort, AdminAnalytics recent duplicates

CREATE INDEX IF NOT EXISTS idx_title_tags_tag_name
  ON public.title_tags (tag_name);

CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_created_at
  ON public.duplicate_candidates (created_at DESC);
