drop function if exists public.search_battle_theme_songs(text, boolean, bigint[], integer, integer);

create function public.search_battle_theme_songs(
  p_query      text    default '',
  p_show_adult boolean default false,
  p_hidden_title_ids bigint[] default array[]::bigint[],
  p_page       integer default 0,
  p_page_size  integer default 24
)
returns table (
  id                     bigint,
  canonical_title_id     bigint,
  theme_type             text,
  theme_sequence         integer,
  song_title             text,
  artist_name            text,
  episodes_text          text,
  video_url              text,
  is_creditless          boolean,
  is_spoiler             boolean,
  is_nsfw                boolean,
  source_id              bigint,
  source_slug            text,
  source_canonical_title text,
  source_cover_image     text,
  source_banner_image    text,
  source_is_adult        boolean,
  source_release_year    integer,
  source_avg_score       numeric,
  source_popularity_score integer,
  source_aliases         jsonb,
  total_count            bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset integer := greatest(0, p_page) * greatest(1, p_page_size);
  v_limit  integer := greatest(1, least(p_page_size, 200));
  v_query  text    := lower(trim(coalesce(p_query, '')));
begin
  return query
  with filtered as (
    select
      s.id,
      s.canonical_title_id,
      s.theme_type,
      s.theme_sequence,
      s.song_title,
      s.artist_name,
      s.episodes_text,
      s.video_url,
      s.is_creditless,
      s.is_spoiler,
      s.is_nsfw,
      ct.id as source_id,
      ct.slug as source_slug,
      ct.canonical_title as source_canonical_title,
      ct.cover_image as source_cover_image,
      ct.banner_image as source_banner_image,
      ct.is_adult as source_is_adult,
      ct.release_year as source_release_year,
      ct.avg_score as source_avg_score,
      round(coalesce(ct.popularity_score, 0))::integer as source_popularity_score,
      ct.aliases_cache as source_aliases
    from public.title_theme_songs s
    join public.canonical_titles ct on ct.id = s.canonical_title_id
    where
      (p_show_adult or coalesce(ct.is_adult, false) = false)
      and (
        coalesce(array_length(p_hidden_title_ids, 1), 0) = 0
        or ct.id <> all(p_hidden_title_ids)
      )
      and (
        v_query = ''
        or s.song_title ilike '%' || v_query || '%'
        or s.artist_name ilike '%' || v_query || '%'
        or ct.canonical_title ilike '%' || v_query || '%'
        or ct.slug ilike '%' || v_query || '%'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(ct.aliases_cache, '[]'::jsonb)) alias_entry
          where alias_entry->>'alias' ilike '%' || v_query || '%'
        )
      )
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    f.id,
    f.canonical_title_id,
    f.theme_type,
    f.theme_sequence,
    f.song_title,
    f.artist_name,
    f.episodes_text,
    f.video_url,
    f.is_creditless,
    f.is_spoiler,
    f.is_nsfw,
    f.source_id,
    f.source_slug,
    f.source_canonical_title,
    f.source_cover_image,
    f.source_banner_image,
    f.source_is_adult,
    f.source_release_year,
    f.source_avg_score,
    f.source_popularity_score,
    f.source_aliases,
    c.total as total_count
  from filtered f, counted c
  order by
    f.source_popularity_score desc nulls last,
    f.source_avg_score desc nulls last,
    f.source_canonical_title asc nulls last,
    f.theme_type asc,
    f.theme_sequence asc,
    f.id asc
  limit v_limit offset v_offset;
end;
$$;

grant execute on function public.search_battle_theme_songs(text,boolean,bigint[],integer,integer)
  to authenticated, anon;
