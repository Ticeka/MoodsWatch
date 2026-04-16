alter table if exists public.franchises enable row level security;
alter table if exists public.title_franchise_memberships enable row level security;

drop policy if exists "Public can read franchises" on public.franchises;
create policy "Public can read franchises"
on public.franchises for select
using (true);

drop policy if exists "Staff can manage franchises" on public.franchises;
create policy "Staff can manage franchises"
on public.franchises for insert
with check ((select public.is_staff_user()));

drop policy if exists "Staff can update franchises" on public.franchises;
create policy "Staff can update franchises"
on public.franchises for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

drop policy if exists "Staff can delete franchises" on public.franchises;
create policy "Staff can delete franchises"
on public.franchises for delete
using ((select public.is_staff_user()));

drop policy if exists "Public can read title franchise memberships" on public.title_franchise_memberships;
create policy "Public can read title franchise memberships"
on public.title_franchise_memberships for select
using (true);

drop policy if exists "Staff can manage title franchise memberships" on public.title_franchise_memberships;
create policy "Staff can manage title franchise memberships"
on public.title_franchise_memberships for insert
with check ((select public.is_staff_user()));

drop policy if exists "Staff can update title franchise memberships" on public.title_franchise_memberships;
create policy "Staff can update title franchise memberships"
on public.title_franchise_memberships for update
using ((select public.is_staff_user()))
with check ((select public.is_staff_user()));

drop policy if exists "Staff can delete title franchise memberships" on public.title_franchise_memberships;
create policy "Staff can delete title franchise memberships"
on public.title_franchise_memberships for delete
using ((select public.is_staff_user()));
