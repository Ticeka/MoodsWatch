drop function if exists public.get_party_vote_summary(uuid, text, text, text, text);

create function public.get_party_vote_summary(
  p_room_id uuid,
  p_match_id text,
  p_round_id text,
  p_song_a text,
  p_song_b text
)
returns table (
  song_a_votes bigint,
  song_b_votes bigint,
  total_votes bigint,
  is_tie boolean,
  winning_song_id text
)
language sql
security definer
set search_path = public
as $$
  with vote_counts as (
    select
      count(*) filter (where selected_option_id = p_song_a) as song_a_votes,
      count(*) filter (where selected_option_id = p_song_b) as song_b_votes,
      count(*) as total_votes
    from public.party_room_answers
    where room_id = p_room_id
      and match_id = p_match_id
      and round_id = p_round_id
  ),
  tie_hash as (
    select coalesce(sum(ascii(substr(p_round_id, idx, 1))), 0) as checksum
    from generate_series(1, char_length(coalesce(p_round_id, ''))) as idx
  )
  select
    vote_counts.song_a_votes,
    vote_counts.song_b_votes,
    vote_counts.total_votes,
    vote_counts.song_a_votes = vote_counts.song_b_votes as is_tie,
    case
      when vote_counts.song_a_votes > vote_counts.song_b_votes then p_song_a
      when vote_counts.song_b_votes > vote_counts.song_a_votes then p_song_b
      when tie_hash.checksum % 2 = 0 then p_song_a
      else p_song_b
    end as winning_song_id
  from vote_counts
  cross join tie_hash;
$$;

grant execute on function public.get_party_vote_summary(uuid, text, text, text, text) to anon;
grant execute on function public.get_party_vote_summary(uuid, text, text, text, text) to authenticated;
