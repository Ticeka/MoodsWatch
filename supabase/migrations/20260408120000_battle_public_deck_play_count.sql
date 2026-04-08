alter table if exists public.battle_public_decks
  add column if not exists play_count integer not null default 0 check (play_count >= 0);

create or replace function public.increment_battle_public_deck_play_count(p_deck_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.battle_public_decks
  set play_count = play_count + 1
  where id = p_deck_id;
end;
$$;

revoke all on function public.increment_battle_public_deck_play_count(uuid) from public;
grant execute on function public.increment_battle_public_deck_play_count(uuid) to anon, authenticated, service_role;
