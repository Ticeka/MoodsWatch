-- Expand the curated "op-mc" / "พระเอกเก่ง" bucket with the second uploaded list.
-- Best-effort matching uses canonical title, normalized slug, and aliases.

with requested_titles(raw_title) as (
  values
    ('The Divine Twilight''s Return'),
    ('Ranker''s Return'),
    ('The Reincarnated Assassin Is a Swordmaster'),
    ('QUESTISM'),
    ('Hardcore Leveling Warrior'),
    ('Legend of an Asura - The Poison Dragon'),
    ('Existence'),
    ('Reality Quest'),
    ('The Lone Necromancer'),
    ('The Second Coming of Gluttony'),
    ('Demon Devourer'),
    ('The Tutorial Is Too Tough!'),
    ('Time-Limited Genius Dark Knight'),
    ('Descent of the Demon Master'),
    ('God of Blackfield'),
    ('Absolute Reign'),
    ('Chronicles of a Doomed Prodigy'),
    ('Best Teacher Baek'),
    ('The Superhuman Era'),
    ('Barbarian Quest'),
    ('Infinite Leveling: Murim'),
    ('Killer Peter'),
    ('Return of the War God'),
    ('Chronicles of the Demon Faction'),
    ('Becoming the Monarch'),
    ('Medical Hwansaeng'),
    ('Father, Unrivaled'),
    ('Absolute Regression'),
    ('GOSU'),
    ('The Player Hides His Past'),
    ('Absolute Sword Sense'),
    ('Myst, Might, Mayhem'),
    ('Blink Master of the Magic Academy'),
    ('Surviving the Game as a Barbarian'),
    ('Dungeon Odyssey'),
    ('The Regressed Mercenary Has a Plan'),
    ('Heavenly Demon Reborn!'),
    ('Her Summon'),
    ('Leviathan'),
    ('The 100th Regression of the Max-Level Player'),
    ('The Knight Only Lives Today'),
    ('The Reaper'),
    ('The Academy''s Undercover Professor'),
    ('Log-in Murim'),
    ('The Stellar Swordmaster'),
    ('Return of the Mad Demon'),
    ('Level Up with the Gods'),
    ('After Ten Millennia in Hell'),
    ('Solo Leveling: Ragnarok'),
    ('The Lazy Lord Masters the Sword'),
    ('My Blasted Reincarnated Life'),
    ('Latna Saga: Survival of a Sword King'),
    ('Noblesse'),
    ('The Infinite Mage'),
    ('The Return of the Disaster-Class Hero'),
    ('Overgeared'),
    ('The Archmage Returns After 4000 Years'),
    ('Doom Breaker'),
    ('Return of the Blossoming Blade'),
    ('Revenge of the Baskerville Bloodhound'),
    ('The Swordmaster''s Son'),
    ('The World After the Fall'),
    ('The Legend of the Northern Blade'),
    ('Second Life Ranker'),
    ('Nano Machine'),
    ('I''m the Max-Level Newbie'),
    ('A Returner''s Magic Should Be Special'),
    ('The God of High School'),
    ('Teenage Mercenary'),
    ('SSS-Class Revival Hunter'),
    ('Tower of God'),
    ('Omniscient Reader'),
    ('Solo Leveling'),
    ('The Lord of Coins'),
    ('The Otherworldly Genius Method Actor'),
    ('Cheolsu Saves the World'),
    ('To Be an Actor'),
    ('Reborn Rich'),
    ('Ctrl+Alt+Resign'),
    ('A Man''s Man'),
    ('Debut or Die!'),
    ('Nebula''s Civilization'),
    ('The Villain''s Survival Route'),
    ('The Top Dungeon Farmer'),
    ('Tyrant of the Tower Defense Game'),
    ('Player'),
    ('The Extra''s Academy Survival Guide'),
    ('The Novel''s Extra'),
    ('Pick Me Up'),
    ('The Boxer'),
    ('Lout of Count''s Family'),
    ('The Greatest Estate Developer'),
    ('Burning Effect'),
    ('Murimseobu'),
    ('The Hunter''s Gonna Lay Low'),
    ('Dark Mortal'),
    ('The Ember Knight'),
    ('Weak Hero'),
    ('How to Use a Returner'),
    ('Viral Hit'),
    ('Eleceed'),
    ('Lookism')
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
