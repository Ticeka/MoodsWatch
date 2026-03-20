-- Staff write policies for title_characters and title_staff
-- Mirrors the pattern in 20260316203000_catalog_staff_policies.sql

drop policy if exists "Public can read title_characters" on public.title_characters;
create policy "Public can read title_characters"
  on public.title_characters for select
  using (true);

drop policy if exists "Staff can manage title_characters" on public.title_characters;
create policy "Staff can manage title_characters"
  on public.title_characters for all
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "Public can read title_staff" on public.title_staff;
create policy "Public can read title_staff"
  on public.title_staff for select
  using (true);

drop policy if exists "Staff can manage title_staff" on public.title_staff;
create policy "Staff can manage title_staff"
  on public.title_staff for all
  using (public.is_staff_user())
  with check (public.is_staff_user());
