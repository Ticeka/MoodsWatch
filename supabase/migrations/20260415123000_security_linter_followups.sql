-- Follow-up fixes for Supabase security linter warnings:
-- - function_search_path_mutable
-- - rls_policy_always_true
-- - public_bucket_allows_listing

-- ============================================================
-- Function search_path hardening
-- ============================================================

alter function public.cleanup_stale_party_rooms()
  set search_path = public;

alter function public.refresh_title_franchise_cache_for_title(bigint)
  set search_path = public;

alter function public.refresh_title_franchise_cache()
  set search_path = public;

alter function public.compute_tierlist_list_has_adult_content(text, text, text)
  set search_path = public;

alter function public.refresh_title_franchise_cache_on_franchise_update()
  set search_path = public;

alter function public.compute_tierlist_template_preview_artwork_url(text, bigint[])
  set search_path = public;

alter function public.update_donate_updated_at()
  set search_path = public;

alter function public.compute_tierlist_template_has_adult_content(text, bigint[])
  set search_path = public;

alter function public.sync_tierlist_list_adult_content()
  set search_path = public;

alter function public.refresh_tierlist_list_adult_content_from_children()
  set search_path = public;

alter function public.refresh_tierlist_list_adult_content_from_template()
  set search_path = public;

alter function public.compute_tierlist_character_entity_has_adult_content(bigint[])
  set search_path = public;

-- ============================================================
-- Tighten RLS policies that previously used literal true
-- ============================================================

-- donate_sessions
drop policy if exists "donate_sessions_insert" on public.donate_sessions;

create policy "donate_sessions_insert" on public.donate_sessions
  for insert
  with check (
    mode in ('fixed', 'open')
    and status = 'qr_generated'
    and paid_at is null
    and coalesce(reference_id, '') = ''
    and coalesce(qr_payload, '') = ''
    and expires_at > created_at
    and (
      (mode = 'fixed' and amount is not null and amount > 0)
      or (mode = 'open' and amount is null)
    )
  );

-- party_rooms
drop policy if exists "Public can insert party rooms" on public.party_rooms;
create policy "Public can insert party rooms"
on public.party_rooms for insert
with check (
  nullif(btrim(room_code), '') is not null
  and nullif(btrim(host_member_token), '') is not null
  and status = 'lobby'
  and current_match is null
  and visibility in ('public', 'private')
);

drop policy if exists "Public can update party rooms" on public.party_rooms;
create policy "Public can update party rooms"
on public.party_rooms for update
using (
  status in ('lobby', 'live', 'finished')
)
with check (
  nullif(btrim(room_code), '') is not null
  and nullif(btrim(host_member_token), '') is not null
  and status in ('lobby', 'live', 'finished', 'closed')
  and visibility in ('public', 'private')
);

-- party_room_members
drop policy if exists "Public can insert party room members" on public.party_room_members;
create policy "Public can insert party room members"
on public.party_room_members for insert
with check (
  nullif(btrim(member_token), '') is not null
  and nullif(btrim(display_name), '') is not null
  and exists (
    select 1
    from public.party_rooms rooms
    where rooms.id = party_room_members.room_id
      and rooms.status in ('lobby', 'live', 'finished')
  )
);

drop policy if exists "Public can update party room members" on public.party_room_members;
create policy "Public can update party room members"
on public.party_room_members for update
using (
  exists (
    select 1
    from public.party_rooms rooms
    where rooms.id = party_room_members.room_id
      and rooms.status in ('lobby', 'live', 'finished')
  )
)
with check (
  nullif(btrim(member_token), '') is not null
  and nullif(btrim(display_name), '') is not null
  and exists (
    select 1
    from public.party_rooms rooms
    where rooms.id = party_room_members.room_id
      and rooms.status in ('lobby', 'live', 'finished')
  )
);

-- party_room_answers
drop policy if exists "Public can insert party room answers" on public.party_room_answers;
create policy "Public can insert party room answers"
on public.party_room_answers for insert
with check (
  nullif(btrim(match_id), '') is not null
  and nullif(btrim(round_id), '') is not null
  and nullif(btrim(member_token), '') is not null
  and answer_mode in ('choice', 'typing', 'dual')
  and exists (
    select 1
    from public.party_room_members members
    where members.room_id = party_room_answers.room_id
      and members.member_token = party_room_answers.member_token
  )
);

drop policy if exists "Public can update party room answers" on public.party_room_answers;
create policy "Public can update party room answers"
on public.party_room_answers for update
using (
  exists (
    select 1
    from public.party_room_members members
    where members.room_id = party_room_answers.room_id
      and members.member_token = party_room_answers.member_token
  )
)
with check (
  nullif(btrim(match_id), '') is not null
  and nullif(btrim(round_id), '') is not null
  and nullif(btrim(member_token), '') is not null
  and answer_mode in ('choice', 'typing', 'dual')
  and exists (
    select 1
    from public.party_room_members members
    where members.room_id = party_room_answers.room_id
      and members.member_token = party_room_answers.member_token
  )
);

-- party_room_join_requests
drop policy if exists "Public can insert party room join requests" on public.party_room_join_requests;
create policy "Public can insert party room join requests"
  on public.party_room_join_requests for insert
  with check (
    nullif(btrim(requester_token), '') is not null
    and nullif(btrim(requester_name), '') is not null
    and status = 'pending'
    and exists (
      select 1
      from public.party_rooms rooms
      where rooms.id = party_room_join_requests.room_id
        and rooms.visibility = 'private'
        and rooms.status = 'lobby'
    )
  );

drop policy if exists "Public can update party room join requests" on public.party_room_join_requests;
create policy "Public can update party room join requests"
  on public.party_room_join_requests for update
  using (
    exists (
      select 1
      from public.party_rooms rooms
      where rooms.id = party_room_join_requests.room_id
        and rooms.visibility = 'private'
        and rooms.status = 'lobby'
    )
  )
  with check (
    nullif(btrim(requester_token), '') is not null
    and nullif(btrim(requester_name), '') is not null
    and status in ('pending', 'approved', 'rejected')
    and exists (
      select 1
      from public.party_rooms rooms
      where rooms.id = party_room_join_requests.room_id
        and rooms.visibility = 'private'
        and rooms.status = 'lobby'
    )
  );

-- ============================================================
-- Public buckets do not need broad SELECT on storage.objects
-- ============================================================

drop policy if exists "party_template_covers_public_read" on storage.objects;
drop policy if exists "post_images_public_read" on storage.objects;
drop policy if exists "tierlist_images_public_read" on storage.objects;
