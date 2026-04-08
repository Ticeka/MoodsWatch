drop function if exists public.admin_get_title_links(text, text, integer, integer);
drop function if exists public.admin_get_titles_without_links(text, text, integer, integer);

create function public.admin_get_title_links(
  p_search_title text default '',
  p_platform text default 'all',
  p_page integer default 1,
  p_page_size integer default 30
)
returns table (
  id bigint,
  platform_name text,
  url text,
  region_code text,
  is_official boolean,
  canonical_title_id bigint,
  canonical_title text,
  slug text,
  title_type text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset integer := greatest(0, p_page - 1) * greatest(1, p_page_size);
  v_limit integer := greatest(1, least(p_page_size, 100));
  v_query text := trim(coalesce(p_search_title, ''));
begin
  if not public.is_staff_user() then
    raise exception 'not_authorized';
  end if;

  return query
  with filtered as (
    select
      availability.id,
      availability.platform_name,
      availability.url,
      availability.region_code,
      availability.is_official,
      availability.canonical_title_id,
      titles.canonical_title,
      titles.slug,
      coalesce(nullif(titles.subtype, ''), titles.type) as title_type
    from public.title_availability availability
    join public.canonical_titles titles on titles.id = availability.canonical_title_id
    where
      (p_platform = 'all' or availability.platform_name = p_platform)
      and (
        v_query = ''
        or titles.canonical_title ilike '%' || v_query || '%'
        or titles.slug ilike '%' || v_query || '%'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(titles.aliases_cache, '[]'::jsonb)) alias_entry
          where alias_entry->>'alias' ilike '%' || v_query || '%'
        )
      )
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    filtered.id,
    filtered.platform_name,
    filtered.url,
    filtered.region_code,
    filtered.is_official,
    filtered.canonical_title_id,
    filtered.canonical_title,
    filtered.slug,
    filtered.title_type,
    counted.total
  from filtered, counted
  order by filtered.platform_name asc, filtered.canonical_title asc, filtered.id asc
  limit v_limit offset v_offset;
end;
$$;

create function public.admin_get_titles_without_links(
  p_search_title text default '',
  p_title_type text default 'all',
  p_page integer default 1,
  p_page_size integer default 30
)
returns table (
  id bigint,
  canonical_title text,
  slug text,
  title_type text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offset integer := greatest(0, p_page - 1) * greatest(1, p_page_size);
  v_limit integer := greatest(1, least(p_page_size, 100));
  v_query text := trim(coalesce(p_search_title, ''));
begin
  if not public.is_staff_user() then
    raise exception 'not_authorized';
  end if;

  return query
  with filtered as (
    select
      titles.id,
      titles.canonical_title,
      titles.slug,
      coalesce(nullif(titles.subtype, ''), titles.type) as title_type
    from public.canonical_titles titles
    where
      not exists (
        select 1
        from public.title_availability availability
        where availability.canonical_title_id = titles.id
      )
      and (
        p_title_type = 'all'
        or coalesce(nullif(titles.subtype, ''), titles.type) = p_title_type
      )
      and (
        v_query = ''
        or titles.canonical_title ilike '%' || v_query || '%'
        or titles.slug ilike '%' || v_query || '%'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(titles.aliases_cache, '[]'::jsonb)) alias_entry
          where alias_entry->>'alias' ilike '%' || v_query || '%'
        )
      )
  ),
  counted as (
    select count(*) as total from filtered
  )
  select
    filtered.id,
    filtered.canonical_title,
    filtered.slug,
    filtered.title_type,
    counted.total
  from filtered, counted
  order by filtered.canonical_title asc, filtered.id asc
  limit v_limit offset v_offset;
end;
$$;

grant execute on function public.admin_get_title_links(text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_titles_without_links(text, text, integer, integer) to authenticated;
