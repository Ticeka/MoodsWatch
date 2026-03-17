create or replace function public.get_public_profile_watch_stats(p_profile_user_id uuid)
returns table (
  total bigint,
  seen bigint,
  watching bigint,
  reading bigint,
  completed bigint
)
language sql
security definer
set search_path = public
as $$
  with target_profile as (
    select id
    from public.user_profiles
    where id = p_profile_user_id
      and is_profile_public = true
    limit 1
  ),
  list_rows as (
    select ul.*
    from public.user_lists ul
    join target_profile tp on tp.id = ul.user_id
  )
  select
    count(*)::bigint as total,
    count(*) filter (where list_status in ('completed', 'dropped'))::bigint as seen,
    count(*) filter (where list_status = 'watching')::bigint as watching,
    count(*) filter (where list_status = 'reading')::bigint as reading,
    count(*) filter (where list_status = 'completed')::bigint as completed
  from list_rows;
$$;

grant execute on function public.get_public_profile_watch_stats(uuid) to anon;
grant execute on function public.get_public_profile_watch_stats(uuid) to authenticated;
