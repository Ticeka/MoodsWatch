alter table if exists public.user_profiles
  add column if not exists min_recommendation_score numeric(5,2) not null default 0,
  add column if not exists recommendation_length text not null default 'any'
    check (recommendation_length in ('any', 'short', 'long')),
  add column if not exists last_rebuilt_at timestamptz
;

alter table if exists public.user_lists
  add column if not exists last_consumed_at timestamptz,
  add column if not exists target_episode integer,
  add column if not exists target_chapter integer,
  add column if not exists rewatch_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_user_lists_user_last_consumed
on public.user_lists(user_id, last_consumed_at desc nulls last);
