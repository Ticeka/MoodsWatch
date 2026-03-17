drop policy if exists "Public can read comments on public profiles" on public.profile_comments;
create policy "Users can read own profile comments or public profile comments"
on public.profile_comments for select
using (
  auth.uid() = profile_user_id
  or exists (
    select 1
    from public.user_profiles owner_profile
    where owner_profile.id = profile_user_id
      and owner_profile.is_profile_public = true
  )
);

drop policy if exists "Authenticated users can insert profile comments" on public.profile_comments;
create policy "Authenticated users can insert profile comments"
on public.profile_comments for insert
with check (
  auth.uid() = author_user_id
  and (
    auth.uid() = profile_user_id
    or exists (
      select 1
      from public.user_profiles owner_profile
      where owner_profile.id = profile_user_id
        and owner_profile.is_profile_public = true
        and owner_profile.allow_profile_comments = true
    )
  )
);
