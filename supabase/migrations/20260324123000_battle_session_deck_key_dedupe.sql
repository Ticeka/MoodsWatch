create index if not exists idx_battle_sessions_user_deck_key
on public.battle_sessions(user_id, deck_key);

with ranked_sessions as (
  select
    id,
    row_number() over (
      partition by user_id, deck_key
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_num
  from public.battle_sessions
)
delete from public.battle_sessions session_row
using ranked_sessions ranked
where session_row.id = ranked.id
  and ranked.row_num > 1;
