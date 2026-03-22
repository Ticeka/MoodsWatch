-- Fix update_battle_title_stats trigger:
-- battle_votes has left_title_id, right_title_id, result ('left'|'right'|'tie'|'skip')
-- NOT winner_id / loser_id

CREATE OR REPLACE FUNCTION public.update_battle_title_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_winner_id BIGINT;
  v_loser_id  BIGINT;
BEGIN
  -- Derive winner/loser from result field
  IF NEW.result = 'left' THEN
    v_winner_id := NEW.left_title_id;
    v_loser_id  := NEW.right_title_id;
  ELSIF NEW.result = 'right' THEN
    v_winner_id := NEW.right_title_id;
    v_loser_id  := NEW.left_title_id;
  ELSE
    -- 'tie' or 'skip' — no stats update
    RETURN NEW;
  END IF;

  -- Update winner stats
  INSERT INTO public.battle_title_stats (title_id, wins, total_votes, last_battle, updated_at)
  VALUES (v_winner_id, 1, 1, NEW.created_at, now())
  ON CONFLICT (title_id) DO UPDATE SET
    wins        = battle_title_stats.wins + 1,
    total_votes = battle_title_stats.total_votes + 1,
    elo_score   = battle_title_stats.elo_score + 16,
    last_battle = NEW.created_at,
    updated_at  = now();

  -- Update loser stats
  INSERT INTO public.battle_title_stats (title_id, losses, total_votes, last_battle, updated_at)
  VALUES (v_loser_id, 1, 1, NEW.created_at, now())
  ON CONFLICT (title_id) DO UPDATE SET
    losses      = battle_title_stats.losses + 1,
    total_votes = battle_title_stats.total_votes + 1,
    elo_score   = GREATEST(battle_title_stats.elo_score - 16, 0),
    last_battle = NEW.created_at,
    updated_at  = now();

  RETURN NEW;
END;
$$;

-- Recreate trigger (drop first in case it already exists from previous migration)
DROP TRIGGER IF EXISTS battle_vote_stats_trigger ON public.battle_votes;

CREATE TRIGGER battle_vote_stats_trigger
  AFTER INSERT ON public.battle_votes
  FOR EACH ROW EXECUTE FUNCTION public.update_battle_title_stats();
