-- Add more curated OP MC titles found in the current catalog.
-- These are explicit inserts only; no broad auto-tagging.

insert into public.title_moods (canonical_title_id, mood_id)
select ct.id, 'op-mc'
from public.canonical_titles ct
where ct.slug in (
  'saga-of-tanya-the-evil-the-movie-100878',
  'the-saga-of-tanya-the-evil-94846',
  'noblesse-59983',
  'eleceed-106929',
  'sakamoto-days-125828',
  'kaiju-no-8-153288',
  'kaiju-no-8-season-2-178754',
  'the-player-hides-his-past-166154',
  'sss-class-revival-hunter-128067',
  'return-of-the-mad-demon-137304',
  'chronicles-of-the-demon-faction-164222',
  'absolute-regression-180891'
)
on conflict do nothing;
