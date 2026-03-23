-- Fix: trg_achievements_tierlist referenced NEW.user_id but the column
-- in tierlist_lists is owner_user_id, causing a 42703 error on every insert.

CREATE OR REPLACE FUNCTION public.trg_achievements_tierlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.award_achievement(NEW.owner_user_id, 'first_tierlist');
  RETURN NEW;
END;
$$;
