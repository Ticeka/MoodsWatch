-- Add room_name and visibility to party_rooms
alter table public.party_rooms
  add column if not exists room_name text not null default '',
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private'));

-- Index for public room discovery
create index if not exists idx_party_rooms_visibility_status
  on public.party_rooms(visibility, status, updated_at desc);

-- Join requests table
create table if not exists public.party_room_join_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  requester_token text not null,
  requester_name text not null,
  requester_avatar_key text not null default 'rose',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, requester_token)
);

create index if not exists idx_party_room_join_requests_room_status
  on public.party_room_join_requests(room_id, status, created_at asc);

-- updated_at trigger
drop trigger if exists trg_party_room_join_requests_updated_at on public.party_room_join_requests;
create trigger trg_party_room_join_requests_updated_at
before update on public.party_room_join_requests
for each row
execute function public.set_updated_at();

-- RLS
alter table public.party_room_join_requests enable row level security;

drop policy if exists "Public can read party room join requests" on public.party_room_join_requests;
create policy "Public can read party room join requests"
  on public.party_room_join_requests for select using (true);

drop policy if exists "Public can insert party room join requests" on public.party_room_join_requests;
create policy "Public can insert party room join requests"
  on public.party_room_join_requests for insert with check (true);

drop policy if exists "Public can update party room join requests" on public.party_room_join_requests;
create policy "Public can update party room join requests"
  on public.party_room_join_requests for update using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table public.party_room_join_requests;
