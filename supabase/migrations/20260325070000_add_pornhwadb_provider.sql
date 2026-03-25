alter table if exists public.title_source_refs
  drop constraint if exists title_source_refs_provider_check;

alter table if exists public.title_source_refs
  add constraint title_source_refs_provider_check
  check (provider in ('anilist', 'mangadex', 'kitsu', 'jikan', 'pornhwadb', 'manual'));

alter table if exists public.catalog_sync_runs
  drop constraint if exists catalog_sync_runs_provider_check;

alter table if exists public.catalog_sync_runs
  add constraint catalog_sync_runs_provider_check
  check (provider in ('anilist', 'mangadex', 'kitsu', 'jikan', 'pornhwadb', 'manual', 'all'));
