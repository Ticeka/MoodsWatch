alter table if exists public.user_hidden_titles
  add column if not exists hide_from_recommendations boolean not null default true,
  add column if not exists hide_from_discovery boolean not null default true;
