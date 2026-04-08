import { extractProfilePreferences, DEFAULT_PROFILE_PREFERENCES } from '@/features/profile/lib/profileStore';
import { supabase } from '@/shared/lib/supabase';

const USER_SUMMARY_SELECT = 'id, name, role, favorite_moods, updated_at';
const USER_PROFILE_PREFERENCE_SELECT = [
  'id',
  'name',
  'bio',
  'favorite_moods',
  'hide_seen_by_default',
  'prioritize_unseen',
  'exclude_completed_from_recs',
  'exclude_dropped_from_recs',
  'hide_adult_content',
  'recommendation_types',
  'recommendation_subtypes',
  'recommendation_progress_states',
  'force_unseen_only',
  'min_recommendation_score',
  'recommendation_length',
  'top_titles',
].join(', ');

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

export function buildEmptyRecommendationPersona() {
  return {
    prefs: DEFAULT_PROFILE_PREFERENCES,
    watchlist: [],
    favoriteTitleIds: [],
    hiddenTitleIds: [],
    counts: { tracked: 0, favorites: 0, hidden: 0 },
  };
}

export async function fetchRecommendationPreviewUsers() {
  ensureSupabase();

  const { data, error } = await supabase
    .from('user_profiles')
    .select(USER_SUMMARY_SELECT)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function fetchRecommendationPreviewUserState(userId) {
  ensureSupabase();
  if (!userId) {
    return buildEmptyRecommendationPersona();
  }

  const [profileRes, watchlistRes, favoritesRes, hiddenRes] = await Promise.all([
    supabase.from('user_profiles').select(USER_PROFILE_PREFERENCE_SELECT).eq('id', userId).maybeSingle(),
    supabase.from('user_lists').select('title_id, list_status, progress_episode, progress_chapter').eq('user_id', userId),
    supabase.from('user_favorite_titles').select('title_id').eq('user_id', userId),
    supabase.from('user_hidden_titles').select('title_id, hide_from_recommendations').eq('user_id', userId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (watchlistRes.error) throw watchlistRes.error;
  if (favoritesRes.error) throw favoritesRes.error;
  if (hiddenRes.error) throw hiddenRes.error;

  const watchlist = (watchlistRes.data || []).map((item) => ({
    titleId: item.title_id,
    status: item.list_status,
    progressEpisode: item.progress_episode,
    progressChapter: item.progress_chapter,
  }));
  const favoriteTitleIds = (favoritesRes.data || []).map((item) => item.title_id);
  const hiddenTitleIds = (hiddenRes.data || [])
    .filter((item) => item.hide_from_recommendations !== false)
    .map((item) => item.title_id);

  return {
    prefs: extractProfilePreferences(profileRes.data),
    watchlist,
    favoriteTitleIds,
    hiddenTitleIds,
    counts: {
      tracked: watchlist.length,
      favorites: favoriteTitleIds.length,
      hidden: hiddenTitleIds.length,
    },
  };
}
