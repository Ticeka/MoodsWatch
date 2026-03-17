create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.user_profiles
  add column if not exists bio text,
  add column if not exists favorite_moods text[] not null default '{}',
  add column if not exists hide_seen_by_default boolean not null default true,
  add column if not exists prioritize_unseen boolean not null default true,
  add column if not exists exclude_completed_from_recs boolean not null default true,
  add column if not exists exclude_dropped_from_recs boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create table if not exists public.user_lists (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null references public.canonical_titles(id) on delete cascade,
  list_status text not null default 'planned',
  progress_episode integer,
  progress_chapter integer,
  score numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

alter table if exists public.user_lists
  add column if not exists progress_episode integer,
  add column if not exists progress_chapter integer,
  add column if not exists score numeric(5,2),
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_user_lists_updated_at on public.user_lists;
create trigger trg_user_lists_updated_at
before update on public.user_lists
for each row
execute function public.set_updated_at();

create table if not exists public.user_favorite_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null references public.canonical_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.user_title_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null references public.canonical_titles(id) on delete cascade,
  event_type text not null check (event_type in ('added_to_list', 'removed_from_list', 'status_changed', 'progress_updated', 'score_updated', 'note_updated')),
  from_status text,
  to_status text,
  progress_episode integer,
  progress_chapter integer,
  score numeric(5,2),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_lists_user_status on public.user_lists(user_id, list_status);
create index if not exists idx_user_favorite_titles_user_created_at on public.user_favorite_titles(user_id, created_at desc);
create index if not exists idx_user_title_history_user_created_at on public.user_title_history(user_id, created_at desc);
create index if not exists idx_user_title_history_title on public.user_title_history(title_id, created_at desc);

alter table if exists public.user_profiles enable row level security;
alter table if exists public.user_lists enable row level security;
alter table if exists public.user_favorite_titles enable row level security;
alter table if exists public.user_title_history enable row level security;

drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
on public.user_profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can manage own list" on public.user_lists;
create policy "Users can manage own list"
on public.user_lists for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own favorite titles" on public.user_favorite_titles;
create policy "Users can manage own favorite titles"
on public.user_favorite_titles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own title history" on public.user_title_history;
create policy "Users can manage own title history"
on public.user_title_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
