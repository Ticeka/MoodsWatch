-- Add owner_username to tierlist_lists for profile linking
alter table if exists public.tierlist_lists
  add column if not exists owner_username text not null default '';

-- ── Tierlist Comments ──────────────────────────────────────────────────────────

create table if not exists public.tierlist_comments (
  id uuid primary key default gen_random_uuid(),
  list_id text not null references public.tierlist_lists (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  parent_comment_id uuid references public.tierlist_comments (id) on delete cascade,
  comment_body text not null check (char_length(comment_body) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tierlist_comments_list_idx on public.tierlist_comments (list_id, created_at);
create index if not exists tierlist_comments_parent_idx on public.tierlist_comments (parent_comment_id);
create index if not exists tierlist_comments_author_idx on public.tierlist_comments (author_user_id);

alter table if exists public.tierlist_comments enable row level security;

-- Anyone can read comments on public lists
drop policy if exists "Public can read tierlist comments" on public.tierlist_comments;
create policy "Public can read tierlist comments"
on public.tierlist_comments
for select
using (
  exists (
    select 1 from public.tierlist_lists l
    where l.id = tierlist_comments.list_id
      and (l.is_public = true or l.owner_user_id = auth.uid())
  )
);

-- Authenticated users can post comments on public lists
drop policy if exists "Authenticated can insert tierlist comments" on public.tierlist_comments;
create policy "Authenticated can insert tierlist comments"
on public.tierlist_comments
for insert
with check (
  auth.uid() is not null
  and auth.uid() = author_user_id
  and exists (
    select 1 from public.tierlist_lists l
    where l.id = tierlist_comments.list_id
      and l.is_public = true
  )
);

-- Author or list owner can delete comments
drop policy if exists "Author or list owner can delete tierlist comments" on public.tierlist_comments;
create policy "Author or list owner can delete tierlist comments"
on public.tierlist_comments
for delete
using (
  auth.uid() = author_user_id
  or exists (
    select 1 from public.tierlist_lists l
    where l.id = tierlist_comments.list_id
      and l.owner_user_id = auth.uid()
  )
);

-- ── Notifications ──────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'tierlist_comment',
  reference_id text,
  actor_user_id uuid references auth.users (id) on delete set null,
  message text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id, is_read) where is_read = false;

alter table if exists public.notifications enable row level security;

-- Users can read their own notifications
drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
on public.notifications
for select
using (auth.uid() = user_id);

-- Authenticated users can insert notifications (for notifying others)
drop policy if exists "Authenticated can insert notifications" on public.notifications;
create policy "Authenticated can insert notifications"
on public.notifications
for insert
with check (auth.uid() is not null);

-- Users can mark their own notifications as read
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Users can delete their own notifications
drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
on public.notifications
for delete
using (auth.uid() = user_id);
