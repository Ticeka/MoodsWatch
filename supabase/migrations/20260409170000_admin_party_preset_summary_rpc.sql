drop function if exists public.admin_get_party_preset_summaries();

create function public.admin_get_party_preset_summaries()
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
    preset_row.id,
    preset_row.slug,
    preset_row.name,
    preset_row.description,
    preset_row.status,
    preset_row.visibility,
    preset_row.updated_at,
    coalesce(item_stats.item_count, 0)::bigint as item_count
  from public.party_song_presets preset_row
  left join lateral (
    select count(*)::bigint as item_count
    from public.party_song_preset_items item_row
    where item_row.preset_id = preset_row.id
  ) item_stats on true
  order by preset_row.updated_at desc, preset_row.id desc;
end;
$$;

grant execute on function public.admin_get_party_preset_summaries() to authenticated;
