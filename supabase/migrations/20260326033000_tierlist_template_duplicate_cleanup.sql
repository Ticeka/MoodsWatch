-- Re-run public template identity cleanup after a client sync bug re-created
-- duplicate public templates with new IDs on repeated page loads.

with ranked_templates as (
  select
    id,
    first_value(id) over (
      partition by lower(trim(coalesce(title, ''))),
                   lower(trim(coalesce(description, ''))),
                   lower(trim(coalesce(category, ''))),
                   coalesce(array_to_string(title_ids, ','), ''),
                   coalesce(array_to_string(default_rows, '|'), '')
      order by plays desc, updated_at desc nulls last, created_at desc nulls last, id desc
    ) as keep_id,
    row_number() over (
      partition by lower(trim(coalesce(title, ''))),
                   lower(trim(coalesce(description, ''))),
                   lower(trim(coalesce(category, ''))),
                   coalesce(array_to_string(title_ids, ','), ''),
                   coalesce(array_to_string(default_rows, '|'), '')
      order by plays desc, updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_num
  from public.tierlist_templates
  where is_public = true
)
update public.tierlist_lists as list_row
set template_id = ranked.keep_id
from ranked_templates as ranked
where list_row.template_id = ranked.id
  and ranked.row_num > 1;

with ranked_templates as (
  select
    id,
    row_number() over (
      partition by lower(trim(coalesce(title, ''))),
                   lower(trim(coalesce(description, ''))),
                   lower(trim(coalesce(category, ''))),
                   coalesce(array_to_string(title_ids, ','), ''),
                   coalesce(array_to_string(default_rows, '|'), '')
      order by plays desc, updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_num
  from public.tierlist_templates
  where is_public = true
)
delete from public.tierlist_templates as template_row
using ranked_templates as ranked
where template_row.id = ranked.id
  and ranked.row_num > 1;
