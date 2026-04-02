-- Close stale lobby rooms that have not been updated in 2+ hours.
-- Run once to purge existing stale rooms.
update public.party_rooms
set status = 'closed'
where status = 'lobby'
  and updated_at < now() - interval '2 hours';

-- Reusable function for scheduled or manual cleanup.
create or replace function public.cleanup_stale_party_rooms()
returns integer
language plpgsql
security definer
as $$
declare
  affected integer;
begin
  update public.party_rooms
  set status = 'closed'
  where status = 'lobby'
    and updated_at < now() - interval '2 hours';

  get diagnostics affected = row_count;
  return affected;
end;
$$;
