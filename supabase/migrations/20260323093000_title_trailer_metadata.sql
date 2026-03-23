alter table if exists public.canonical_titles
  add column if not exists trailer_url text,
  add column if not exists trailer_site text,
  add column if not exists trailer_video_id text,
  add column if not exists trailer_thumbnail_url text,
  add column if not exists trailer_source text;

update public.canonical_titles
set
  trailer_site = coalesce(
    nullif(lower(trailer_site), ''),
    nullif(lower(raw_payload -> 'trailer' ->> 'site'), '')
  ),
  trailer_video_id = coalesce(
    nullif(trailer_video_id, ''),
    nullif(raw_payload -> 'trailer' ->> 'id', '')
  )
where raw_payload is not null;

update public.canonical_titles
set trailer_url = case
  when coalesce(trailer_site, '') = 'youtube' and coalesce(trailer_video_id, '') <> ''
    then format('https://www.youtube.com/watch?v=%s', trailer_video_id)
  when coalesce(trailer_site, '') = 'dailymotion' and coalesce(trailer_video_id, '') <> ''
    then format('https://www.dailymotion.com/video/%s', trailer_video_id)
  else trailer_url
end
where trailer_url is null
  and coalesce(trailer_video_id, '') <> '';

update public.canonical_titles
set trailer_thumbnail_url = format('https://i.ytimg.com/vi/%s/hqdefault.jpg', trailer_video_id)
where trailer_thumbnail_url is null
  and coalesce(trailer_site, '') = 'youtube'
  and coalesce(trailer_video_id, '') <> '';

update public.canonical_titles
set trailer_source = coalesce(
  nullif(trailer_source, ''),
  case
    when coalesce(trailer_video_id, '') <> '' or coalesce(trailer_url, '') <> '' then 'anilist'
    else null
  end
)
where trailer_source is null;

create index if not exists idx_canonical_titles_trailer_site
  on public.canonical_titles(trailer_site)
  where trailer_site is not null;

create or replace view public.catalog_titles_view as
select
  ct.id,
  ct.slug,
  ct.canonical_title,
  ct.type,
  ct.subtype,
  ct.origin_country,
  ct.origin_language,
  ct.status,
  ct.release_year,
  ct.episodes,
  ct.chapters,
  ct.volumes,
  ct.duration_minutes,
  ct.is_adult,
  ct.cover_image,
  ct.banner_image,
  ct.synopsis,
  ct.avg_score,
  ct.popularity_score,
  ct.editorial_score,
  ct.last_synced_at,
  array_remove(array_agg(distinct tg.genre_name), null) as genres,
  array_remove(array_agg(distinct tt.tag_name), null) as tags,
  ct.trailer_url,
  ct.trailer_site,
  ct.trailer_video_id,
  ct.trailer_thumbnail_url,
  ct.trailer_source
from public.canonical_titles ct
left join public.title_genres tg on tg.canonical_title_id = ct.id
left join public.title_tags tt on tt.canonical_title_id = ct.id
group by ct.id;
