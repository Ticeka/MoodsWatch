-- ============================================================
-- Party Title Guess franchise fields
-- 2026-04-04
--
-- Goal:
-- - support series/franchise-level matching for title guess questions
-- - allow "correct series, wrong season/entry" answers to still count
-- - keep question-level manual overrides possible
-- ============================================================

alter table if exists public.party_title_guess_questions
  add column if not exists franchise_id bigint
    references public.canonical_titles(id) on delete set null,
  add column if not exists franchise_name text,
  add column if not exists franchise_aliases jsonb not null default '[]'::jsonb;

alter table if exists public.party_title_guess_questions
  drop constraint if exists party_title_guess_questions_franchise_aliases_array_check;

alter table if exists public.party_title_guess_questions
  add constraint party_title_guess_questions_franchise_aliases_array_check
  check (jsonb_typeof(franchise_aliases) = 'array');

create index if not exists idx_party_title_guess_questions_franchise_id
  on public.party_title_guess_questions (franchise_id);

