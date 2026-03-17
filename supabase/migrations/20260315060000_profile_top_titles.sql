alter table if exists public.user_profiles
  add column if not exists top_titles jsonb not null default '{"anime":[],"manga":[],"manhwa":[]}'::jsonb;
