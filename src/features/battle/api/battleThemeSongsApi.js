import { supabase } from '@/shared/lib/supabase';

export async function fetchBattleTitleThemeSongs(titleId) {
  if (!supabase || !titleId) {
    return [];
  }

  const { data, error } = await supabase
    .from('title_theme_songs')
    .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
    .eq('canonical_title_id', titleId)
    .order('display_order');

  if (error) {
    throw error;
  }

  return data || [];
}
