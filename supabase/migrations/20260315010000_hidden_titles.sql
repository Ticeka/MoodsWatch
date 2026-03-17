create table if not exists public.user_hidden_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id bigint not null references public.canonical_titles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create index if not exists idx_user_hidden_titles_user_created_at
on public.user_hidden_titles(user_id, created_at desc);

alter table if exists public.user_hidden_titles enable row level security;

drop policy if exists "Users can manage own hidden titles" on public.user_hidden_titles;
create policy "Users can manage own hidden titles"
on public.user_hidden_titles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
