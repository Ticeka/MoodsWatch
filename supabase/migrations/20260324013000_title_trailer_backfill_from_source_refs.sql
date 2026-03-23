with latest_anilist_trailers as (
  select distinct on (tsr.canonical_title_id)
    tsr.canonical_title_id,
    nullif(lower(tsr.raw_payload -> 'trailer' ->> 'site'), '') as trailer_site,
    nullif(tsr.raw_payload -> 'trailer' ->> 'id', '') as trailer_video_id,
    nullif(tsr.raw_payload -> 'trailer' ->> 'thumbnail', '') as trailer_thumbnail_url
  from public.title_source_refs tsr
  where tsr.provider = 'anilist'
    and tsr.raw_payload is not null
    and coalesce(tsr.raw_payload -> 'trailer' ->> 'id', '') <> ''
  order by
    tsr.canonical_title_id,
    coalesce(tsr.last_synced_at, tsr.fetched_at) desc nulls last,
    tsr.id desc
)
update public.canonical_titles ct
set
  trailer_site = coalesce(nullif(lower(ct.trailer_site), ''), latest_anilist_trailers.trailer_site),
  trailer_video_id = coalesce(nullif(ct.trailer_video_id, ''), latest_anilist_trailers.trailer_video_id),
  trailer_url = coalesce(
    nullif(ct.trailer_url, ''),
    case
      when latest_anilist_trailers.trailer_site = 'youtube' then format(
        'https://www.youtube.com/watch?v=%s',
        latest_anilist_trailers.trailer_video_id
      )
      when latest_anilist_trailers.trailer_site = 'dailymotion' then format(
        'https://www.dailymotion.com/video/%s',
        latest_anilist_trailers.trailer_video_id
      )
      else null
    end
  ),
  trailer_thumbnail_url = coalesce(
    nullif(ct.trailer_thumbnail_url, ''),
    latest_anilist_trailers.trailer_thumbnail_url,
    case
      when latest_anilist_trailers.trailer_site = 'youtube' then format(
        'https://i.ytimg.com/vi/%s/hqdefault.jpg',
        latest_anilist_trailers.trailer_video_id
      )
      else null
    end
  ),
  trailer_source = coalesce(nullif(ct.trailer_source, ''), 'anilist')
from latest_anilist_trailers
where ct.id = latest_anilist_trailers.canonical_title_id
  and (
    ct.trailer_url is null
    or ct.trailer_site is null
    or ct.trailer_video_id is null
    or ct.trailer_thumbnail_url is null
    or ct.trailer_source is null
  );
