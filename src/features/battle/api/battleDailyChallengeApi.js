import { supabase } from '@/shared/lib/supabase';

const DAILY_CHALLENGE_SELECT = 'id, challenge_date, theme_name_th, theme_name_en, theme_icon, deck_id';

export async function fetchDailyChallengeByDate(challengeDate) {
  if (!supabase || !challengeDate) {
    return null;
  }

  const { data, error } = await supabase
    .from('daily_challenges')
    .select(DAILY_CHALLENGE_SELECT)
    .eq('challenge_date', challengeDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function fetchDailyChallengeCompletion(userId, challengeDate) {
  if (!supabase || !userId || !challengeDate) {
    return null;
  }

  const { data, error } = await supabase
    .from('daily_challenge_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('challenge_date', challengeDate)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function fetchDailyChallengeStreak(userId, limit = 30) {
  if (!supabase || !userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('daily_challenge_completions')
    .select('challenge_date')
    .eq('user_id', userId)
    .order('challenge_date', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}
