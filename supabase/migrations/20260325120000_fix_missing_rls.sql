-- Fix RLS: enable row level security on tables that were missing it
-- Detected by Supabase security advisor (rls_disabled_in_public)

-- ============================================================
-- public.achievements  (static lookup / seed data)
-- ============================================================
ALTER TABLE IF EXISTS public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_public_read" ON public.achievements;
CREATE POLICY "achievements_public_read"
  ON public.achievements FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "achievements_staff_write" ON public.achievements;
CREATE POLICY "achievements_staff_write"
  ON public.achievements FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- public.moods  (static lookup / seed data)
-- ============================================================
ALTER TABLE IF EXISTS public.moods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moods_public_read" ON public.moods;
CREATE POLICY "moods_public_read"
  ON public.moods FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "moods_staff_write" ON public.moods;
CREATE POLICY "moods_staff_write"
  ON public.moods FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- public.catalog_sync_runs  (internal admin table)
-- ============================================================
ALTER TABLE IF EXISTS public.catalog_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_sync_runs_staff_all" ON public.catalog_sync_runs;
CREATE POLICY "catalog_sync_runs_staff_all"
  ON public.catalog_sync_runs FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ============================================================
-- public.catalog_merge_queue  (internal admin table)
-- ============================================================
ALTER TABLE IF EXISTS public.catalog_merge_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_merge_queue_staff_all" ON public.catalog_merge_queue;
CREATE POLICY "catalog_merge_queue_staff_all"
  ON public.catalog_merge_queue FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
