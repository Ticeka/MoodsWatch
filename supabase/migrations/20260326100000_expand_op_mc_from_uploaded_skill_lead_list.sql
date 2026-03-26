-- Expand the curated "op-mc" bucket to cover the broader "พระเอกเก่ง"
-- interpretation requested from the uploaded list.
-- Best-effort matching uses canonical title, normalized slug, and aliases.

with requested_titles(raw_title) as (
  values
    ('I Was Reincarnated as the 7th Prince so I Can Take My Time Perfecting My Magical Ability Season 2'),
    ('SAKAMOTO DAYS'),
    ('BAKI-DOU: The Invincible Samurai'),
    ('That Time I Got Reincarnated as a Slime'),
    ('That Time I Got Reincarnated as a Slime Season 2'),
    ('That Time I Got Reincarnated as a Slime Season 2 Part 2'),
    ('That Time I Got Reincarnated as a Slime the Movie: Tears of the Azure Sea'),
    ('Solo Leveling'),
    ('Solo Leveling -ReAwakening-'),
    ('Solo Leveling Season 2 -Arise from the Shadow-'),
    ('Wistoria: Wand and Sword'),
    ('The Eminence in Shadow'),
    ('The Eminence in Shadow Season 2'),
    ('Mushoku Tensei: Jobless Reincarnation'),
    ('Mushoku Tensei: Jobless Reincarnation Cour 2'),
    ('Mushoku Tensei: Jobless Reincarnation Season 2'),
    ('Mushoku Tensei: Jobless Reincarnation Season 2 Part 2'),
    ('One-Punch Man'),
    ('Overlord IV'),
    ('Kaiju No. 8'),
    ('Kaiju No. 8 Season 2'),
    ('Mob Psycho 100'),
    ('Mob Psycho 100 II'),
    ('Mob Psycho 100 III'),
    ('Black Clover'),
    ('Black Clover: Sword of the Wizard King'),
    ('Bleach'),
    ('BLEACH: Thousand-Year Blood War'),
    ('BLEACH: Thousand-Year Blood War - The Separation'),
    ('BLEACH: Thousand-Year Blood War - The Conflict'),
    ('Naruto'),
    ('Naruto: Shippuden'),
    ('Dragon Ball'),
    ('Dragon Ball Z'),
    ('Dragon Ball Super: Broly'),
    ('Blue Exorcist -The Blue Night Saga-'),
    ('Yu Yu Hakusho: Ghostfiles'),
    ('Rurouni Kenshin'),
    ('Trigun'),
    ('TRIGUN STAMPEDE'),
    ('Berserk'),
    ('Berserk: The Golden Age Arc III - The Advent'),
    ('Dororo'),
    ('Katanagatari'),
    ('Gungrave'),
    ('WIND BREAKER Season 2'),
    ('JoJo''s Bizarre Adventure: Stardust Crusaders'),
    ('JoJo''s Bizarre Adventure: Stardust Crusaders - Battle in Egypt'),
    ('JoJo''s Bizarre Adventure: Diamond is Unbreakable'),
    ('JoJo''s Bizarre Adventure: Golden Wind'),
    ('STEEL BALL RUN JoJo''s Bizarre Adventure'),
    ('ONE PIECE'),
    ('One Piece Film: Z'),
    ('One Piece Film: Red'),
    ('One Piece: Stampede'),
    ('Kingdom Season 2'),
    ('Kingdom Season 3'),
    ('Kingdom Season 4'),
    ('Kingdom Season 5'),
    ('Death Note'),
    ('Code Geass: Lelouch of the Rebellion'),
    ('Code Geass: Lelouch of the Rebellion R2'),
    ('Code Geass: Lelouch of the Rebellion III - Glorification'),
    ('Classroom of the Elite Season 2'),
    ('Classroom of the Elite Season 3'),
    ('Dr. STONE'),
    ('Dr. STONE: STONE WARS'),
    ('Dr. STONE New World'),
    ('Dr. STONE New World Part 2'),
    ('Dr. STONE SCIENCE FUTURE'),
    ('Dr. STONE SCIENCE FUTURE Cour 2'),
    ('Moriarty the Patriot'),
    ('Moriarty the Patriot Part 2'),
    ('Kaiji - Ultimate Survivor'),
    ('Kaiji - Against All Rules'),
    ('The World God Only Knows II'),
    ('The World God Only Knows: Goddesses'),
    ('GTO: Great Teacher Onizuka'),
    ('Initial D 1st Stage'),
    ('Initial D 2nd Stage'),
    ('Initial D 3rd Stage'),
    ('Initial D 4th Stage'),
    ('Initial D Fifth Stage'),
    ('Initial D Final Stage'),
    ('Hajime no Ippo: The Fighting!'),
    ('Hajime no Ippo: The Fighting! New Challenger'),
    ('Hajime No Ippo: The Fighting! - Rising -'),
    ('Major S1'),
    ('Major S2'),
    ('Major S3'),
    ('Major S4'),
    ('Major S5'),
    ('Major S6'),
    ('Ace of the Diamond'),
    ('Ace of the Diamond Second Season'),
    ('Ace of the Diamond act II'),
    ('The King''s Avatar: For the Glory'),
    ('Shangri-La Frontier'),
    ('Shangri-La Frontier Season 2'),
    ('BLUE LOCK'),
    ('Kuroko''s Basketball'),
    ('Kuroko''s Basketball 2'),
    ('Kuroko''s Basketball 3'),
    ('Kuroko''s Basketball: Last Game'),
    ('Hikaru no Go'),
    ('One Outs'),
    ('Aoashi'),
    ('Baby Steps 2'),
    ('Yowamushi Pedal: Grande Road'),
    ('HAIKYU!!'),
    ('HAIKYU!! 2nd Season'),
    ('HAIKYU!! 3rd Season'),
    ('HAIKYU!! TO THE TOP'),
    ('HAIKYU!! TO THE TOP Part 2'),
    ('HAIKYU!! The Dumpster Battle'),
    ('Haikyuu!! the Movie: The Winner and the Loser'),
    ('Haikyu!! the Movie: The End and the Beginning'),
    ('Haikyu!! The Movie: Talent and Sense'),
    ('Haikyu!! The Movie: Battle of Concepts')
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
