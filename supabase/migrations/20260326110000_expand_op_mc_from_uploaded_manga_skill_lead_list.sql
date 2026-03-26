-- Expand the curated "op-mc" / "พระเอกเก่ง" bucket with the uploaded manga-first list.
-- Best-effort matching uses canonical title, normalized slug, and aliases.

with requested_titles(raw_title) as (
  values
    ('One Punch Man'),
    ('Mob Psycho 100'),
    ('Sakamoto Days'),
    ('The Eminence in Shadow'),
    ('The Fable'),
    ('Kengan Ashura'),
    ('Yu Yu Hakusho'),
    ('HELLSING'),
    ('Fist of the North Star'),
    ('Rurouni Kenshin'),
    ('Trigun Maximum'),
    ('Magi: The Adventures of Sinbad'),
    ('Magi: The Labyrinth of Magic'),
    ('Wistoria: Wand and Sword'),
    ('Shangri-La Frontier'),
    ('Beelzebub'),
    ('Mushoku Tensei: Jobless Reincarnation'),
    ('That Time I Got Reincarnated as a Slime'),
    ('Naruto'),
    ('Bleach'),
    ('One Piece'),
    ('Dragon Ball'),
    ('Hunter x Hunter'),
    ('Kagurabachi'),
    ('WIND BREAKER'),
    ('Holyland'),
    ('Angel Densetsu'),
    ('Akumetsu'),
    ('Helck'),
    ('Kyou kara Ore wa!!'),
    ('Zatch Bell!'),
    ('Volundio Divergent Sword Saga'),
    ('Karakuri Circus'),
    ('Shigurui'),
    ('Out'),
    ('Hanma Baki'),
    ('JoJo''s Bizarre Adventure Part 3: Stardust Crusaders'),
    ('JoJo''s Bizarre Adventure Part 4: Diamond is Unbreakable'),
    ('JoJo''s Bizarre Adventure Part 5: Golden Wind'),
    ('JoJo''s Bizarre Adventure Part 6: Stone Ocean'),
    ('JoJo''s Bizarre Adventure Part 7: Steel Ball Run'),
    ('JoJo''s Bizarre Adventure Part 7 Steel Ball Run'),
    ('Steel Ball Run JoJo''s Bizarre Adventure'),
    ('JoJo no Kimyou na Bouken: The JOJOLands'),
    ('JoJo no Kimyou na Bouken: JoJolion'),
    ('Death Note'),
    ('Classroom of the Elite'),
    ('Classroom of the Elite: Year 2'),
    ('Classroom of the Elite: Year 3'),
    ('Tomodachi Game'),
    ('No Game No Life'),
    ('Usogui'),
    ('One Outs'),
    ('Akagi: Yami ni Oritatta Tensai'),
    ('Dr. STONE'),
    ('Moriarty the Patriot'),
    ('My Home Hero'),
    ('Case Closed'),
    ('Bottom-Tier Character Tomozaki'),
    ('Hikaru no Go'),
    ('Blue Lock'),
    ('Eyeshield 21'),
    ('Hajime no Ippo: Fighting Spirit!'),
    ('Ace of the Diamond'),
    ('Ace of the Diamond Act II'),
    ('Baby Steps'),
    ('BE BLUES!: Ao ni Nare'),
    ('Yowamushi Pedal'),
    ('Initial D'),
    ('Space Brothers'),
    ('Bartender'),
    ('Saiki Kusuo no Psi-nan'),
    ('Saiki Kusuo no Sainan'),
    ('Mushishi'),
    ('Kingdom'),
    ('Vagabond'),
    ('The Legend of the Strongest, Kurosawa!'),
    ('Welcome to Demon School! Iruma-kun'),
    ('Berserk'),
    ('Vinland Saga'),
    ('Golden Kamuy'),
    ('The Case Study of Vanitas'),
    ('The Saga of Tanya the Evil'),
    ('The Angel Next Door Spoils Me Rotten'),
    ('Mushoku Tensei: Redundant Reincarnation'),
    ('Tsuihou Sareru Tabi ni Skill wo te ni Ireta Ore ga, 100 no Isekai de 2-shuume Musou'),
    ('Make the Exorcist Fall in Love'),
    ('The Fable: The Second Contact')
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
