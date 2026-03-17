alter table if exists public.user_profiles
  add column if not exists hide_adult_content boolean not null default false,
  add column if not exists recommendation_types text[] not null default '{"anime","manga","manhwa"}',
  add column if not exists recommendation_subtypes text[] not null default '{"anime","manga","manhwa"}',
  add column if not exists recommendation_progress_states text[] not null default '{"untracked","planned","watching","reading","on-hold","completed","dropped"}',
  add column if not exists force_unseen_only boolean not null default false;
