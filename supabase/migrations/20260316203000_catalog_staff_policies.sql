create extension if not exists pgcrypto;

create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role in ('admin', 'editor')
  );
$$;

alter table if exists public.canonical_titles enable row level security;
alter table if exists public.title_aliases enable row level security;
alter table if exists public.title_genres enable row level security;
alter table if exists public.title_tags enable row level security;
alter table if exists public.title_moods enable row level security;
alter table if exists public.title_availability enable row level security;
alter table if exists public.title_source_refs enable row level security;
alter table if exists public.title_relations enable row level security;

drop policy if exists "Public can read canonical titles" on public.canonical_titles;
create policy "Public can read canonical titles"
on public.canonical_titles for select
using (true);

drop policy if exists "Staff can manage canonical titles" on public.canonical_titles;
create policy "Staff can manage canonical titles"
on public.canonical_titles for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title aliases" on public.title_aliases;
create policy "Public can read title aliases"
on public.title_aliases for select
using (true);

drop policy if exists "Staff can manage title aliases" on public.title_aliases;
create policy "Staff can manage title aliases"
on public.title_aliases for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title genres" on public.title_genres;
create policy "Public can read title genres"
on public.title_genres for select
using (true);

drop policy if exists "Staff can manage title genres" on public.title_genres;
create policy "Staff can manage title genres"
on public.title_genres for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title tags" on public.title_tags;
create policy "Public can read title tags"
on public.title_tags for select
using (true);

drop policy if exists "Staff can manage title tags" on public.title_tags;
create policy "Staff can manage title tags"
on public.title_tags for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title moods" on public.title_moods;
create policy "Public can read title moods"
on public.title_moods for select
using (true);

drop policy if exists "Staff can manage title moods" on public.title_moods;
create policy "Staff can manage title moods"
on public.title_moods for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title availability" on public.title_availability;
create policy "Public can read title availability"
on public.title_availability for select
using (true);

drop policy if exists "Staff can manage title availability" on public.title_availability;
create policy "Staff can manage title availability"
on public.title_availability for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title source refs" on public.title_source_refs;
create policy "Public can read title source refs"
on public.title_source_refs for select
using (true);

drop policy if exists "Staff can manage title source refs" on public.title_source_refs;
create policy "Staff can manage title source refs"
on public.title_source_refs for all
using (public.is_staff_user())
with check (public.is_staff_user());

drop policy if exists "Public can read title relations" on public.title_relations;
create policy "Public can read title relations"
on public.title_relations for select
using (true);

drop policy if exists "Staff can manage title relations" on public.title_relations;
create policy "Staff can manage title relations"
on public.title_relations for all
using (public.is_staff_user())
with check (public.is_staff_user());
