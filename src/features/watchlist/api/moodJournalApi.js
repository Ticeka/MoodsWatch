import { supabase } from '@/shared/lib/supabase';

export async function fetchMoodJournalEntries(userId, fromDate) {
  if (!userId || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('mood_journal')
    .select('id, mood_id, note, logged_at')
    .eq('user_id', userId)
    .gte('logged_at', fromDate)
    .order('logged_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function saveMoodJournalEntry({ userId, moodId, note, loggedAt }) {
  if (!userId || !moodId || !supabase) {
    throw new Error('Mood journal save is not available');
  }

  const { error } = await supabase
    .from('mood_journal')
    .upsert(
      { user_id: userId, mood_id: moodId, note: note || null, logged_at: loggedAt },
      { onConflict: 'user_id, logged_at' }
    );

  if (error) {
    throw error;
  }
}
