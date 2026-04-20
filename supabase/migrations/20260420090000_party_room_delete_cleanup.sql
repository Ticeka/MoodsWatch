-- Let party rooms clean themselves up when the last member leaves.
-- Member/answer rows already cascade from party_rooms.

drop policy if exists "Public can delete party room members" on public.party_room_members;
create policy "Public can delete party room members"
on public.party_room_members for delete
using (
  nullif(btrim(member_token), '') is not null
  and exists (
    select 1
    from public.party_rooms rooms
    where rooms.id = party_room_members.room_id
      and rooms.status in ('lobby', 'live', 'finished')
  )
);

drop policy if exists "Public can delete party rooms" on public.party_rooms;
create policy "Public can delete party rooms"
on public.party_rooms for delete
using (
  nullif(btrim(room_code), '') is not null
  and nullif(btrim(host_member_token), '') is not null
  and status in ('lobby', 'live', 'finished', 'closed')
);

create or replace function public.cleanup_stale_party_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  delete from public.party_rooms rooms
  where (
    rooms.status = 'closed'
    or rooms.updated_at < now() - interval '2 hours'
    or not exists (
      select 1
      from public.party_room_members members
      where members.room_id = rooms.id
    )
  );

  get diagnostics affected = row_count;
  return affected;
end;
$$;
