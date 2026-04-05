alter table if exists public.tierlist_templates
  add column if not exists custom_items jsonb not null default '[]'::jsonb;

alter table if exists public.tierlist_lists
  add column if not exists custom_items jsonb not null default '[]'::jsonb;
