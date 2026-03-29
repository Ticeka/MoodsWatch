create table if not exists public.party_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'live', 'finished', 'closed')),
  host_member_token text not null,
  settings jsonb not null default '{}'::jsonb,
  current_match jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.party_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  member_token text not null,
  display_name text not null,
  avatar_key text not null default 'rose',
  is_host boolean not null default false,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, member_token)
);

create table if not exists public.party_room_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  match_id text not null,
  round_id text not null,
  member_token text not null,
  member_name text,
  answer_mode text not null check (answer_mode in ('choice', 'typing', 'dual')),
  selected_option_id text,
  typed_title text,
  typed_song text,
  title_correct boolean not null default false,
  song_correct boolean not null default false,
  points_awarded integer not null default 0,
  elapsed_ms integer not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, member_token)
);

create index if not exists idx_party_rooms_room_code on public.party_rooms(room_code);
create index if not exists idx_party_rooms_status_updated_at on public.party_rooms(status, updated_at desc);
create index if not exists idx_party_room_members_room_joined_at on public.party_room_members(room_id, joined_at asc);
create index if not exists idx_party_room_answers_room_submitted_at on public.party_room_answers(room_id, submitted_at asc);
create index if not exists idx_party_room_answers_round_member on public.party_room_answers(round_id, member_token);

drop trigger if exists trg_party_rooms_updated_at on public.party_rooms;
create trigger trg_party_rooms_updated_at
before update on public.party_rooms
for each row
execute function public.set_updated_at();

drop trigger if exists trg_party_room_members_updated_at on public.party_room_members;
create trigger trg_party_room_members_updated_at
before update on public.party_room_members
for each row
execute function public.set_updated_at();

drop trigger if exists trg_party_room_answers_updated_at on public.party_room_answers;
create trigger trg_party_room_answers_updated_at
before update on public.party_room_answers
for each row
execute function public.set_updated_at();

alter table if exists public.party_rooms enable row level security;
alter table if exists public.party_room_members enable row level security;
alter table if exists public.party_room_answers enable row level security;

drop policy if exists "Public can read party rooms" on public.party_rooms;
create policy "Public can read party rooms"
on public.party_rooms for select
using (true);

drop policy if exists "Public can insert party rooms" on public.party_rooms;
create policy "Public can insert party rooms"
on public.party_rooms for insert
with check (true);

drop policy if exists "Public can update party rooms" on public.party_rooms;
create policy "Public can update party rooms"
on public.party_rooms for update
using (true)
with check (true);

drop policy if exists "Public can read party room members" on public.party_room_members;
create policy "Public can read party room members"
on public.party_room_members for select
using (true);

drop policy if exists "Public can insert party room members" on public.party_room_members;
create policy "Public can insert party room members"
on public.party_room_members for insert
with check (true);

drop policy if exists "Public can update party room members" on public.party_room_members;
create policy "Public can update party room members"
on public.party_room_members for update
using (true)
with check (true);

drop policy if exists "Public can read party room answers" on public.party_room_answers;
create policy "Public can read party room answers"
on public.party_room_answers for select
using (true);

drop policy if exists "Public can insert party room answers" on public.party_room_answers;
create policy "Public can insert party room answers"
on public.party_room_answers for insert
with check (true);

drop policy if exists "Public can update party room answers" on public.party_room_answers;
create policy "Public can update party room answers"
on public.party_room_answers for update
using (true)
with check (true);

alter publication supabase_realtime add table public.party_rooms;
alter publication supabase_realtime add table public.party_room_members;
alter publication supabase_realtime add table public.party_room_answers;
