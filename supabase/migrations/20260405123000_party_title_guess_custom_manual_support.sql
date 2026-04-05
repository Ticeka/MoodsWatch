alter table if exists public.party_title_guess_questions
  add column if not exists answer_title text;

alter table if exists public.party_title_guess_questions
  add column if not exists cover_url text;

alter table if exists public.party_title_guess_questions
  alter column answer_title_id drop not null;

alter table if exists public.party_title_guess_clues
  alter column character_id drop not null;

