-- Fix remaining multiple_permissive_policies warnings.
--
-- Issues not covered by 20260327100000:
-- 1. moods.moods_staff_write           — FOR ALL creates 2 permissive SELECT
--    (moods_public_read SELECT + moods_staff_write FOR ALL)
-- 2. achievements.achievements_staff_write — same pattern
-- 3. user_profiles legacy policy names  — "Users can insert their own profile."
--    and "Users can update own profile." (trailing dot) survive alongside the
--    canonical names, producing INSERT x2 and UPDATE x2.
--
-- battle_sessions / battle_votes are NOT touched:
--   A-corrected returned 0 rows → initplan is already correct.
--   Each table has only one policy (cmd=ALL, no separate public SELECT) so
--   multiple_permissive does not apply.

-- ============================================================
-- moods — split FOR ALL into INSERT / UPDATE / DELETE
-- (public read stays as moods_public_read FOR SELECT)
-- ============================================================
drop policy if exists "moods_staff_write" on public.moods;

create policy "moods_staff_insert"
on public.moods for insert
with check ((select public.is_staff_user()));

create policy "moods_staff_update"
on public.moods for update
using  ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "moods_staff_delete"
on public.moods for delete
using ((select public.is_staff_user()));

-- ============================================================
-- achievements — split FOR ALL into INSERT / UPDATE / DELETE
-- (achievements_public_read FOR SELECT already exists)
-- ============================================================
drop policy if exists "achievements_staff_write" on public.achievements;

create policy "achievements_staff_insert"
on public.achievements for insert
with check ((select public.is_staff_user()));

create policy "achievements_staff_update"
on public.achievements for update
using  ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

create policy "achievements_staff_delete"
on public.achievements for delete
using ((select public.is_staff_user()));

-- ============================================================
-- user_profiles — drop legacy policy names (trailing dot)
-- The canonical names without dots were created in
-- 20260315000000 and already patched to (select auth.uid())
-- in 20260327030000. The legacy names are duplicates.
-- ============================================================
drop policy if exists "Users can insert their own profile." on public.user_profiles;
drop policy if exists "Users can update own profile."       on public.user_profiles;
