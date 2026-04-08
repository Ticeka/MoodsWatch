drop function if exists public.admin_get_collection_summaries();

create function public.admin_get_collection_summaries()
returns table (
  id bigint,
  slug text,
  name text,
  description text,
  status text,
  visibility text,
  updated_at timestamptz,
  item_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff_user() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    collection_row.id,
    collection_row.slug,
    collection_row.name,
    collection_row.description,
    collection_row.status,
    collection_row.visibility,
    collection_row.updated_at,
    coalesce(item_stats.item_count, 0)::bigint as item_count
  from public.editor_collections collection_row
  left join lateral (
    select count(*)::bigint as item_count
    from public.editor_collection_items item_row
    where item_row.collection_id = collection_row.id
  ) item_stats on true
  order by collection_row.updated_at desc, collection_row.id desc;
end;
$$;

grant execute on function public.admin_get_collection_summaries() to authenticated;
