-- Fix Supabase security linter warnings:
-- 1. catalog_titles_view: security_definer_view → recreate with security_invoker
-- 2. user_preferences: rls_disabled_in_public → enable RLS + policies
-- 3. title_studios: rls_disabled_in_public → enable RLS + policies

-- ============================================================
-- 1. catalog_titles_view — security invoker
-- ============================================================
drop view if exists public.catalog_titles_view;

create or replace view public.catalog_titles_view
with (security_invoker = true)
as
select
  ct.id,
  ct.slug,
  ct.canonical_title,
  ct.type,
  ct.subtype,
  ct.origin_country,
  ct.origin_language,
  ct.status,
  ct.release_year,
  ct.episodes,
  ct.chapters,
  ct.volumes,
  ct.duration_minutes,
  ct.is_adult,
  ct.cover_image,
  ct.banner_image,
  ct.synopsis,
  ct.avg_score,
  ct.popularity_score,
  ct.editorial_score,
  ct.last_synced_at,
  array_remove(array_agg(distinct tg.genre_name), null) as genres,
  array_remove(array_agg(distinct tt.tag_name), null) as tags,
  ct.trailer_url,
  ct.trailer_site,
  ct.trailer_video_id,
  ct.trailer_thumbnail_url,
  ct.trailer_source
from public.canonical_titles ct
left join public.title_genres tg on tg.canonical_title_id = ct.id
left join public.title_tags tt on tt.canonical_title_id = ct.id
group by ct.id;

-- ============================================================
-- 2. user_preferences — enable RLS + policies
-- ============================================================
alter table public.user_preferences enable row level security;

drop policy if exists "Users can read own preferences" on public.user_preferences;
create policy "Users can read own preferences"
on public.user_preferences for select
using (
  auth.uid() = user_id
  or public.is_staff_user()
);

drop policy if exists "Users can insert own preferences" on public.user_preferences;
create policy "Users can insert own preferences"
on public.user_preferences for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own preferences" on public.user_preferences;
create policy "Users can update own preferences"
on public.user_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own preferences" on public.user_preferences;
create policy "Users can delete own preferences"
on public.user_preferences for delete
using (auth.uid() = user_id);

-- ============================================================
-- 3. title_studios — enable RLS + policies
-- ============================================================
alter table public.title_studios enable row level security;

drop policy if exists "Public can read title studios" on public.title_studios;
create policy "Public can read title studios"
on public.title_studios for select
using (true);

drop policy if exists "Staff can manage title studios" on public.title_studios;
create policy "Staff can manage title studios"
on public.title_studios for all
using (public.is_staff_user())
with check (public.is_staff_user());
