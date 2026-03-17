create table if not exists public.battle_public_decks (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_display_name text,
  deck_key text not null,
  deck_fingerprint text not null,
  deck_label text not null,
  filters jsonb not null default '{}'::jsonb,
  title_ids bigint[] not null default '{}',
  titles_snapshot jsonb not null default '[]'::jsonb,
  title_count integer not null default 0 check (title_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_battle_public_decks_updated_at
on public.battle_public_decks(updated_at desc);

create index if not exists idx_battle_public_decks_owner_updated_at
on public.battle_public_decks(owner_user_id, updated_at desc);

create index if not exists idx_battle_public_decks_fingerprint_updated_at
on public.battle_public_decks(deck_fingerprint, updated_at desc);

drop trigger if exists trg_battle_public_decks_updated_at on public.battle_public_decks;
create trigger trg_battle_public_decks_updated_at
before update on public.battle_public_decks
for each row
execute function public.set_updated_at();

alter table if exists public.battle_public_decks enable row level security;

drop policy if exists "Public can read battle public decks" on public.battle_public_decks;
create policy "Public can read battle public decks"
on public.battle_public_decks for select
using (true);

drop policy if exists "Users can manage own battle public decks" on public.battle_public_decks;
create policy "Users can manage own battle public decks"
on public.battle_public_decks for all
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);
