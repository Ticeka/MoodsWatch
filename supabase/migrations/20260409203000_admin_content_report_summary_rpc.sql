drop function if exists public.admin_get_content_report_summary(text, text, timestamptz, timestamptz, bigint[]);

create function public.admin_get_content_report_summary(
  p_issue_type text default 'all',
  p_status text default 'all',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_title_ids bigint[] default null
)
returns table (
  total bigint,
  open bigint,
  in_review bigint,
  resolved bigint,
  dismissed bigint
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
  with filtered as (
    select report.status
    from public.content_reports report
    where
      (p_issue_type = 'all' or report.issue_type = p_issue_type)
      and (p_status = 'all' or report.status = p_status)
      and (p_date_from is null or report.created_at >= p_date_from)
      and (p_date_to is null or report.created_at <= p_date_to)
      and (
        p_title_ids is null
        or (
          cardinality(p_title_ids) > 0
          and report.title_id = any(p_title_ids)
        )
      )
  )
  select
    count(*)::bigint as total,
    count(*) filter (where status = 'open')::bigint as open,
    count(*) filter (where status = 'in_review')::bigint as in_review,
    count(*) filter (where status = 'resolved')::bigint as resolved,
    count(*) filter (where status = 'dismissed')::bigint as dismissed
  from filtered;
end;
$$;

grant execute on function public.admin_get_content_report_summary(text, text, timestamptz, timestamptz, bigint[]) to authenticated;
