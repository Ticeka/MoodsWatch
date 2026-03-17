create table if not exists public.user_consumption_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null references public.canonical_titles(id) on delete cascade,
  list_status text,
  consumption_type text not null check (consumption_type in ('episode', 'chapter')),
  source text not null default 'manual' check (source in ('manual', 'quick-progress', 'catch-up-target')),
  delta integer not null default 1 check (delta >= 0),
  previous_progress integer not null default 0 check (previous_progress >= 0),
  next_progress integer not null default 0 check (next_progress >= 0),
  target_progress integer,
  session_started_at timestamptz not null default now(),
  session_ended_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consumption_sessions_user_created_at
on public.user_consumption_sessions(user_id, created_at desc);

create index if not exists idx_user_consumption_sessions_title_created_at
on public.user_consumption_sessions(title_id, created_at desc);

alter table if exists public.user_consumption_sessions enable row level security;

drop policy if exists "Users can manage own consumption sessions" on public.user_consumption_sessions;
create policy "Users can manage own consumption sessions"
on public.user_consumption_sessions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
