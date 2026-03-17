alter table if exists public.user_profiles
  add column if not exists allow_profile_comments boolean not null default true;

create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null
    constraint profile_comments_profile_user_id_fkey
    references public.user_profiles(id) on delete cascade,
  author_user_id uuid not null
    constraint profile_comments_author_user_id_fkey
    references public.user_profiles(id) on delete cascade,
  comment_body text not null
    constraint profile_comments_body_len_chk
    check (char_length(trim(comment_body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profile_comments_profile_created
on public.profile_comments(profile_user_id, created_at desc);

drop trigger if exists trg_profile_comments_updated_at on public.profile_comments;
create trigger trg_profile_comments_updated_at
before update on public.profile_comments
for each row
execute function public.set_updated_at();

alter table if exists public.profile_comments enable row level security;

drop policy if exists "Public can read comments on public profiles" on public.profile_comments;
create policy "Public can read comments on public profiles"
on public.profile_comments for select
using (
  exists (
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
  and exists (
    select 1
    from public.user_profiles owner_profile
    where owner_profile.id = profile_user_id
      and owner_profile.is_profile_public = true
      and owner_profile.allow_profile_comments = true
  )
);

drop policy if exists "Comment author can delete own comment" on public.profile_comments;
create policy "Comment author can delete own comment"
on public.profile_comments for delete
using (auth.uid() = author_user_id);

drop policy if exists "Profile owner can moderate comments" on public.profile_comments;
create policy "Profile owner can moderate comments"
on public.profile_comments for delete
using (auth.uid() = profile_user_id);
