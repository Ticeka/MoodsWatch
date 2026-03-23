create table if not exists public.title_theme_songs (
  id bigint primary key generated always as identity,
  canonical_title_id bigint not null references public.canonical_titles(id) on delete cascade,
  source_provider text not null default 'animethemes' check (source_provider in ('animethemes', 'jikan', 'manual')),
  theme_key text not null,
  source_anime_id text,
  source_theme_id text,
  source_song_id text,
  source_entry_id text,
  source_video_id text,
  theme_slug text,
  theme_type text not null check (theme_type in ('OP', 'ED', 'INSERT', 'OTHER')),
  theme_sequence integer,
  entry_version integer,
  display_order integer not null default 0,
  song_title text not null,
  artist_name text,
  episodes_text text,
  notes text,
  video_url text,
  video_resolution integer,
  video_source text,
  is_creditless boolean not null default false,
  is_nsfw boolean not null default false,
  is_spoiler boolean not null default false,
  is_subbed boolean not null default false,
  metadata jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (canonical_title_id, source_provider, theme_key)
);

create index if not exists idx_title_theme_songs_title_id
  on public.title_theme_songs(canonical_title_id, display_order);

create index if not exists idx_title_theme_songs_type
  on public.title_theme_songs(theme_type, canonical_title_id);

alter table if exists public.title_theme_songs enable row level security;

drop policy if exists "Public can read title theme songs" on public.title_theme_songs;
create policy "Public can read title theme songs"
  on public.title_theme_songs for select
  using (true);

drop policy if exists "Staff can manage title theme songs" on public.title_theme_songs;
create policy "Staff can manage title theme songs"
  on public.title_theme_songs for all
  using (public.is_staff_user())
  with check (public.is_staff_user());
