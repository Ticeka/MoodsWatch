-- Expand the curated "op-mc" / "powerful lead" bucket with the follow-up uploaded anime batch.
-- Best-effort matching uses canonical title, normalized slug, and aliases.

with requested_titles(raw_title) as (
  values
    ('BOFURI: I Don''t Want to Get Hurt, so I''ll Max Out My Defense.'),
    ('As a Reincarnated Aristocrat, I''ll Use My Appraisal Skill to Rise in the World'),
    ('Dead Mount Death Play'),
    ('GOBLIN SLAYER'),
    ('GOBLIN SLAYER -GOBLIN''S CROWN-'),
    ('Mushoku Tensei: Jobless Reincarnation'),
    ('Mushoku Tensei: Jobless Reincarnation Cour 2'),
    ('Mushoku Tensei: Jobless Reincarnation Season 2'),
    ('Mushoku Tensei: Jobless Reincarnation Season 2 Part 2'),
    ('TSUKIMICHI -Moonlit Fantasy- Season 2'),
    ('Blue Exorcist: Kyoto Saga'),
    ('Blue Exorcist -The Blue Night Saga-'),
    ('Date A Live IV'),
    ('Solo Leveling -ReAwakening-'),
    ('That Time I Got Reincarnated as a Slime the Movie: Tears of the Azure Sea'),
    ('Saga of Tanya the Evil - the Movie -'),
    ('INUYASHIKI LAST HERO'),
    ('Sentenced to Be a Hero'),
    ('AJIN: Demi-Human'),
    ('Undead Unluck'),
    ('Gate'),
    ('Gate 2'),
    ('Log Horizon 2'),
    ('Chivalry of a Failed Knight'),
    ('The Devil is a Part-Timer!'),
    ('Uncle from Another World'),
    ('Katanagatari'),
    ('Wistoria: Wand and Sword'),
    ('Dr. STONE'),
    ('Dr. STONE: STONE WARS'),
    ('Dr. STONE Special Episode - RYUSUI'),
    ('Dr. STONE Special Episode – RYUSUI'),
    ('Dr. STONE New World Part 2'),
    ('STONE SCIENCE FUTURE'),
    ('Fire Force Season 2'),
    ('Fire Force Season 3'),
    ('No Game, No Life Zero')
),
normalized_requested as (
  select
    raw_title,
    trim(both '-' from regexp_replace(lower(raw_title), '[^a-z0-9]+', '-', 'g')) as request_key
  from requested_titles
),
catalog_keys as (
  select
    ct.id,
    trim(both '-' from regexp_replace(lower(ct.canonical_title), '[^a-z0-9]+', '-', 'g')) as canonical_key,
    trim(
      both '-'
      from regexp_replace(
        regexp_replace(
          regexp_replace(lower(ct.slug), '-(mal|pwdb)-[0-9]+$', ''),
          '-[0-9]+$',
          ''
        ),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    ) as slug_key
  from public.canonical_titles ct
),
alias_keys as (
  select
    ta.canonical_title_id as id,
    trim(both '-' from regexp_replace(lower(ta.alias), '[^a-z0-9]+', '-', 'g')) as alias_key
  from public.title_aliases ta
),
matched_titles as (
  select distinct ck.id
  from normalized_requested nr
  join catalog_keys ck
    on ck.canonical_key = nr.request_key
    or ck.slug_key = nr.request_key

  union

  select distinct ak.id
  from normalized_requested nr
  join alias_keys ak
    on ak.alias_key = nr.request_key
)
insert into public.title_moods (canonical_title_id, mood_id)
select id, 'op-mc'
from matched_titles
on conflict do nothing;
