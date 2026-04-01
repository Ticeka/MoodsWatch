-- Expand the curated "op-mc" / "powerful lead" bucket with the latest uploaded anime batch.
-- Best-effort matching uses canonical title, normalized slug, and aliases.

with requested_titles(raw_title) as (
  values
    ('Soul Land 2: The Peerless Tang Clan'),
    ('Douluo Dalu: Jingying Sai'),
    ('Tunshi Xingkong 2'),
    ('Dou Po Cangqiong: Nian Fan 2'),
    ('Douluo Dalu: Xiaowu Juebie'),
    ('Douluo Dalu: Xingdou Xianji'),
    ('Douluo Dalu: Hanhai Qiankun'),
    ('Douluo Dalu: Haishen Zhi Guang'),
    ('Dou Po Cangqiong 4'),
    ('Scissor Seven Season 2'),
    ('The Master of Diabolism Q'),
    ('Scissor Seven Season 4'),
    ('Dou Po Cangqiong: Nian Fan'),
    ('Dou Po Cangqiong: San Nian Zhi Yue'),
    ('Scissor Seven Season 3'),
    ('The Founder of Diabolism 2'),
    ('The Founder of Diabolism: Final Season'),
    ('DEMON LORD 2099'),
    ('FAIRY TAIL 100 YEARS QUEST'),
    ('Pokemon Origins'),
    ('Pokémon Origins'),
    ('Date A Live Mayuri Judgement'),
    ('Blue Exorcist: The Movie'),
    ('Scissor Seven'),
    ('Date A Live: Date to Date'),
    ('Dragon Ball DAIMA'),
    ('The Legend of the Legendary Heroes'),
    ('Sword Art Online the Movie -Progressive- Scherzo of Deep Night'),
    ('Kuma Kuma Kuma Bear'),
    ('Baki Hanma'),
    ('Blue Exorcist -Shimane Illuminati Saga-'),
    ('Shaman King'),
    ('OVERLORD: The Sacred Kingdom'),
    ('May I Ask for One Final Thing?'),
    ('The Rising of the Shield Hero Season 4'),
    ('The Daily Life of the Immortal King Season 2'),
    ('Arifureta: From Commonplace to World''s Strongest Season 3'),
    ('An Archdemon''s Dilemma: How to Love Your Elf Bride'),
    ('The Founder of Diabolism'),
    ('The Ossan Newbie Adventurer, Trained to Death by the Most Powerful Party, Became Invincible'),
    ('Villainess Level 99: I May Be the Hidden Boss but I''m Not the Demon Lord'),
    ('A Certain Scientific Accelerator'),
    ('The Unwanted Undead Adventurer'),
    ('Dragon Ball Z: Battle of Gods'),
    ('The Saint''s Magic Power is Omnipotent'),
    ('The Water Magician'),
    ('One-Punch Man OVA'),
    ('Parallel World Pharmacy'),
    ('That Time I Got Reincarnated as a Slime OAD'),
    ('How a Realist Hero Rebuilt the Kingdom Part 2'),
    ('BOFURI: I Don''t Want to Get Hurt, so I''ll Max Out My Defense. Season 2'),
    ('Afro Samurai'),
    ('The Reincarnation of the Strongest Exorcist in Another World'),
    ('The King''s Avatar'),
    ('The Disastrous Life of Saiki K. Season 3'),
    ('I Was Reincarnated as the 7th Prince so I Can Take My Time Perfecting My Magical Ability'),
    ('One-Punch Man: Road to Hero'),
    ('Farming Life in Another World'),
    ('Dragon Ball Z Kai'),
    ('The Disastrous Life of Saiki K.: Reawakened'),
    ('The Slime Diaries'),
    ('That Time I Got Reincarnated as a Slime the Movie: Scarlet Bond'),
    ('Ragna Crimson'),
    ('The Genius Prince''s Guide to Raising a Nation Out of Debt'),
    ('Skeleton Knight in Another World'),
    ('Reincarnated as a Sword'),
    ('Beelzebub'),
    ('Campfire Cooking in Another World with my Absurd Skill'),
    ('Date A Live III'),
    ('Trapped in a Dating Sim: The World of Otome Games Is Tough for Mobs'),
    ('The Wrong Way to Use Healing Magic'),
    ('The Irregular at Magic High School: Visitor Arc'),
    ('GOBLIN SLAYER II'),
    ('Magi: Adventure of Sinbad'),
    ('Problem Children Are Coming From Another World, Aren''t They?'),
    ('Arifureta: From Commonplace to World''s Strongest Season 2'),
    ('How a Realist Hero Rebuilt the Kingdom'),
    ('The Daily Life of the Immortal King'),
    ('BAKI'),
    ('Hellsing'),
    ('The Rising of the Shield Hero Season 3'),
    ('Saga of Tanya the Evil'),
    ('No Game, No Life'),
    ('TSUKIMICHI -Moonlit Fantasy-'),
    ('That Time I Got Reincarnated as a Slime Season 3'),
    ('WIND BREAKER'),
    ('Hellsing Ultimate'),
    ('The World''s Finest Assassin Gets Reincarnated in Another World as an Aristocrat'),
    ('Haven''t You Heard? I''m Sakamoto'),
    ('Sword Art Online: Alicization - War of Underworld Part 2'),
    ('Cautious Hero: The Hero Is Overpowered but Overly Cautious'),
    ('Sword Art Online the Movie: Ordinal Scale'),
    ('Sword Art Online: Alicization - War of Underworld'),
    ('Dragon Ball Super'),
    ('Sword Art Online: Alicization'),
    ('Overlord III'),
    ('The Irregular at Magic High School'),
    ('The Misfit of Demon King Academy: History''s Strongest Demon King Reincarnates and Goes to School with His Descendants'),
    ('Overlord II'),
    ('MASHLE: MAGIC AND MUSCLES'),
    ('The Disastrous Life of Saiki K.'),
    ('Overlord'),
    ('Classroom of the Elite'),
    ('The Rising of the Shield Hero'),
    ('Blue Exorcist'),
    ('One-Punch Man Season 2'),
    ('Renegade Immortal'),
    ('Tunshi Xingkong 4'),
    ('Dou Po Cangqiong: Nian Fan 3'),
    ('Scissor Seven Season 5'),
    ('To Be Hero X'),
    ('Lord of Mysteries'),
    ('Campfire Cooking in Another World with my Absurd Skill Season 2'),
    ('Fate/strange Fake'),
    ('I Was Reincarnated as the 7th Prince so I Can Take My Time Perfecting My Magical Ability Season 2'),
    ('The King''s Avatar: For the Glory'),
    ('The Legend of Hei'),
    ('The Irresponsible Captain Tylor'),
    ('SAKAMOTO DAYS'),
    ('Dragon Ball Super: Broly'),
    ('Classroom of the Elite Season 3'),
    ('MASHLE: MAGIC AND MUSCLES Season 2'),
    ('Overlord IV'),
    ('The Eminence in Shadow Season 2'),
    ('The Disastrous Life of Saiki K. Season 2'),
    ('Dragon Ball'),
    ('No Game, No Life Zero'),
    ('Classroom of the Elite Season 2'),
    ('Mob Psycho 100 III'),
    ('That Time I Got Reincarnated as a Slime Season 2 Part 2'),
    ('Dragon Ball Z'),
    ('Solo Leveling Season 2 -Arise from the Shadow-'),
    ('The Eminence in Shadow'),
    ('That Time I Got Reincarnated as a Slime Season 2'),
    ('Solo Leveling'),
    ('That Time I Got Reincarnated as a Slime'),
    ('Mob Psycho 100 II'),
    ('Mob Psycho 100'),
    ('One-Punch Man')
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
