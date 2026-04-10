import { supabase } from '@/shared/lib/supabase';

export async function fetchAdminDailyChallengeData(dates = []) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return { challengeMap: {}, decks: [] };
  }

  const [{ data: challengeData, error: challengeError }, { data: deckData, error: deckError }] = await Promise.all([
    supabase
      .from('daily_challenges')
      .select('id, challenge_date, theme_name_th, theme_name_en, theme_icon, deck_id')
      .gte('challenge_date', dates[0])
      .lte('challenge_date', dates[dates.length - 1]),
    supabase
      .from('battle_public_decks')
      .select('id, deck_label, updated_at')
      .order('deck_label'),
  ]);

  if (challengeError) throw challengeError;
  if (deckError) throw deckError;

  const challengeMap = {};
  dates.forEach((date) => {
    challengeMap[date] = null;
  });
  (challengeData || []).forEach((challenge) => {
    challengeMap[challenge.challenge_date] = challenge;
  });

  return {
    challengeMap,
    decks: (deckData || []).map((deck) => ({
      id: deck.id,
      name: deck.deck_label || 'Untitled deck',
      updatedAt: deck.updated_at || null,
    })),
  };
}
