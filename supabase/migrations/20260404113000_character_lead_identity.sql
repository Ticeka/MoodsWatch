-- ============================================================
-- Character lead identity metadata
-- 2026-04-04
--
-- Goal:
-- - support protagonist / heroine filtering without guessing in the UI
-- - keep uncertain cases nullable/unknown instead of forcing bad labels
-- ============================================================

alter table public.title_characters
  add column if not exists is_primary_heroine boolean not null default false,
  add column if not exists lead_type text not null default 'unknown',
  add column if not exists presentation_gender text not null default 'unknown';

alter table public.title_characters
  drop constraint if exists title_characters_lead_type_check;

alter table public.title_characters
  add constraint title_characters_lead_type_check
  check (lead_type in ('protagonist', 'heroine', 'deuteragonist', 'rival', 'ensemble', 'unknown'));

alter table public.title_characters
  drop constraint if exists title_characters_presentation_gender_check;

alter table public.title_characters
  add constraint title_characters_presentation_gender_check
  check (presentation_gender in ('male', 'female', 'nonbinary', 'unknown'));

create index if not exists idx_title_characters_identity_flags
  on public.title_characters (
    canonical_title_id,
    is_primary_protagonist,
    is_primary_heroine,
    lead_type,
    presentation_gender,
    sort_order asc,
    id asc
  );

update public.title_characters tc
set
  lead_type = case
    when coalesce(tc.is_primary_protagonist, false) then 'protagonist'
    when upper(coalesce(tc.role, '')) = 'MAIN' and coalesce(tc.sort_order, 9999) <= 1 then 'deuteragonist'
    when upper(coalesce(tc.role, '')) = 'MAIN' then 'ensemble'
    else 'unknown'
  end,
  presentation_gender = coalesce(nullif(tc.presentation_gender, ''), 'unknown'),
  is_primary_heroine = coalesce(tc.is_primary_heroine, false)
where
  coalesce(tc.lead_type, '') = ''
  or coalesce(tc.presentation_gender, '') = '';
