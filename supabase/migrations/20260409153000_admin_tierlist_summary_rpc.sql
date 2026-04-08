drop function if exists public.admin_get_tierlist_overview();
drop function if exists public.admin_get_tierlist_template_summaries();
drop function if exists public.admin_get_tierlist_list_summaries();

create function public.admin_get_tierlist_overview()
returns table (
  template_count bigint,
  public_template_count bigint,
  template_issue_count bigint,
  list_count bigint,
  public_list_count bigint,
  broken_public_list_count bigint,
  comment_count bigint
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
  with template_stats as (
    select
      template.id,
      template.is_public,
      (
        case
          when cardinality(coalesce(template.title_ids, '{}'::bigint[])) = 0 then 1
          when not template.is_system and template.owner_user_id is null then 1
          else 0
        end
      ) as issue_count
    from public.tierlist_templates template
  ),
  list_stats as (
    select
      list_row.id,
      list_row.is_public,
      (
        case
          when list_row.is_public and coalesce(row_stats.ranked_count, 0) = 0 then 1
          when coalesce(row_stats.ranked_count, 0) + coalesce(pool_stats.pool_count, 0) = 0 then 1
          when list_row.template_id is not null and template.id is null then 1
          else 0
        end
      ) as issue_count
    from public.tierlist_lists list_row
    left join public.tierlist_templates template on template.id = list_row.template_id
    left join lateral (
      select coalesce(sum(cardinality(coalesce(row_item.title_ids, '{}'::bigint[]))), 0)::integer as ranked_count
      from public.tierlist_list_rows row_item
      where row_item.list_id = list_row.id
    ) row_stats on true
    left join lateral (
      select count(*)::integer as pool_count
      from public.tierlist_list_pool_items pool_item
      where pool_item.list_id = list_row.id
    ) pool_stats on true
  ),
  comment_stats as (
    select count(*)::bigint as total_comments
    from public.tierlist_comments
  )
  select
    (select count(*)::bigint from template_stats),
    (select count(*)::bigint from template_stats where is_public),
    (select coalesce(sum(issue_count), 0)::bigint from template_stats),
    (select count(*)::bigint from list_stats),
    (select count(*)::bigint from list_stats where is_public),
    (select coalesce(sum(issue_count), 0)::bigint from list_stats where is_public),
    (select total_comments from comment_stats);
end;
$$;

create function public.admin_get_tierlist_template_summaries()
returns table (
  id text,
  owner_user_id uuid,
  owner_name text,
  owner_username text,
  title text,
  description text,
  category text,
  is_public boolean,
  is_system boolean,
  plays integer,
  item_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  linked_list_count bigint,
  linked_public_list_count bigint,
  issue_count integer
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
    template.id,
    template.owner_user_id,
    profile.name as owner_name,
    profile.username as owner_username,
    template.title,
    template.description,
    template.category,
    template.is_public,
    template.is_system,
    template.plays,
    cardinality(coalesce(template.title_ids, '{}'::bigint[]))::integer as item_count,
    template.created_at,
    template.updated_at,
    coalesce(linked_stats.linked_list_count, 0)::bigint as linked_list_count,
    coalesce(linked_stats.linked_public_list_count, 0)::bigint as linked_public_list_count,
    (
      case
        when cardinality(coalesce(template.title_ids, '{}'::bigint[])) = 0 then 1
        when not template.is_system and template.owner_user_id is null then 1
        else 0
      end
    )::integer as issue_count
  from public.tierlist_templates template
  left join public.user_profiles profile on profile.id = template.owner_user_id
  left join lateral (
    select
      count(*)::bigint as linked_list_count,
      count(*) filter (where list_row.is_public)::bigint as linked_public_list_count
    from public.tierlist_lists list_row
    where list_row.template_id = template.id
  ) linked_stats on true
  order by template.updated_at desc, template.id asc;
end;
$$;

create function public.admin_get_tierlist_list_summaries()
returns table (
  id text,
  owner_user_id uuid,
  owner_name text,
  owner_username text,
  title text,
  description text,
  template_id text,
  template_title text,
  template_category text,
  has_template boolean,
  is_public boolean,
  play_count integer,
  ranked_count integer,
  pool_count integer,
  total_item_count integer,
  tier_count integer,
  comment_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  issue_count integer
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
    list_row.id,
    list_row.owner_user_id,
    coalesce(profile.name, list_row.owner_name) as owner_name,
    profile.username as owner_username,
    list_row.title,
    list_row.description,
    list_row.template_id,
    template.title as template_title,
    template.category as template_category,
    (template.id is not null) as has_template,
    list_row.is_public,
    list_row.play_count,
    coalesce(row_stats.ranked_count, 0)::integer as ranked_count,
    coalesce(pool_stats.pool_count, 0)::integer as pool_count,
    (coalesce(row_stats.ranked_count, 0) + coalesce(pool_stats.pool_count, 0))::integer as total_item_count,
    coalesce(row_stats.tier_count, 0)::integer as tier_count,
    coalesce(comment_stats.comment_count, 0)::integer as comment_count,
    list_row.created_at,
    list_row.updated_at,
    (
      case
        when list_row.is_public and coalesce(row_stats.ranked_count, 0) = 0 then 1
        when coalesce(row_stats.ranked_count, 0) + coalesce(pool_stats.pool_count, 0) = 0 then 1
        when list_row.template_id is not null and template.id is null then 1
        else 0
      end
    )::integer as issue_count
  from public.tierlist_lists list_row
  left join public.user_profiles profile on profile.id = list_row.owner_user_id
  left join public.tierlist_templates template on template.id = list_row.template_id
  left join lateral (
    select
      count(*)::integer as tier_count,
      coalesce(sum(cardinality(coalesce(row_item.title_ids, '{}'::bigint[]))), 0)::integer as ranked_count
    from public.tierlist_list_rows row_item
    where row_item.list_id = list_row.id
  ) row_stats on true
  left join lateral (
    select count(*)::integer as pool_count
    from public.tierlist_list_pool_items pool_item
    where pool_item.list_id = list_row.id
  ) pool_stats on true
  left join lateral (
    select count(*)::integer as comment_count
    from public.tierlist_comments comment_row
    where comment_row.list_id = list_row.id
  ) comment_stats on true
  order by list_row.updated_at desc, list_row.id asc;
end;
$$;

grant execute on function public.admin_get_tierlist_overview() to authenticated;
grant execute on function public.admin_get_tierlist_template_summaries() to authenticated;
grant execute on function public.admin_get_tierlist_list_summaries() to authenticated;
