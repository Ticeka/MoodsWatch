-- Add reply support to profile_comments
alter table if exists public.profile_comments
  add column if not exists parent_comment_id uuid references public.profile_comments (id) on delete cascade;

create index if not exists profile_comments_parent_idx on public.profile_comments (parent_comment_id);

-- Change default ordering: top-level first, then by created_at asc for threading
create index if not exists profile_comments_thread_idx on public.profile_comments (profile_user_id, created_at asc);
