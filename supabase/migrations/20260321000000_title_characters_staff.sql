-- title_characters: stores character entries per canonical title
create table if not exists title_characters (
  id                  bigint primary key generated always as identity,
  canonical_title_id  bigint not null references canonical_titles(id) on delete cascade,
  anilist_id          integer,
  name_full           text,
  name_native         text,
  image_url           text,
  role                text,            -- MAIN | SUPPORTING | BACKGROUND
  voice_actor_name    text,
  voice_actor_image   text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists title_characters_title_id_idx on title_characters(canonical_title_id);

-- title_staff: stores staff entries per canonical title
create table if not exists title_staff (
  id                  bigint primary key generated always as identity,
  canonical_title_id  bigint not null references canonical_titles(id) on delete cascade,
  anilist_id          integer,
  name_full           text,
  name_native         text,
  image_url           text,
  role                text,            -- Director | Music | Original Creator | etc.
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists title_staff_title_id_idx on title_staff(canonical_title_id);

-- RLS: public read, service-role write (same pattern as other catalog tables)
alter table title_characters enable row level security;
alter table title_staff      enable row level security;

create policy "Public can read title_characters"
  on title_characters for select using (true);

create policy "Public can read title_staff"
  on title_staff for select using (true);
