-- ============================================================
-- Add owner_username to battle_public_decks
-- 2026-03-28
--
-- Problem:  fetchPublicBattleDecks does two round-trips:
--           1. SELECT from battle_public_decks
--           2. SELECT from user_profiles to get username
--           This adds ~50-150ms extra latency on every hub load.
--
-- Solution: Denormalize owner_username onto battle_public_decks
--           at write time (persistRemotePublicBattleDeck).
--           List views read owner_username directly from the row.
-- ============================================================

ALTER TABLE public.battle_public_decks
  ADD COLUMN IF NOT EXISTS owner_username text NOT NULL DEFAULT '';

-- Backfill from user_profiles where available
UPDATE public.battle_public_decks bpd
SET owner_username = LOWER(TRIM(up.username))
FROM public.user_profiles up
WHERE up.id = bpd.owner_user_id
  AND up.username IS NOT NULL
  AND up.username <> '';
