import { create } from 'zustand';
import { supabase } from '@/shared/lib/supabase';

const PROFILE_PREFERENCES_STORAGE_KEY = 'moodtoon-profile-preferences';
const FAVORITE_TITLES_STORAGE_KEY = 'moodtoon-favorite-titles';
const HIDDEN_TITLES_STORAGE_KEY = 'moodtoon-hidden-titles';
const TITLE_HISTORY_STORAGE_KEY = 'moodtoon-title-history';
const MAX_HISTORY_ITEMS = 80;

export const TOP_TITLE_LIMIT = 5;
export const TOP_TITLE_TYPE_OPTIONS = ['anime', 'manga', 'manhwa'];
export const RECOMMENDATION_TYPE_OPTIONS = ['anime', 'manga', 'manhwa'];
export const RECOMMENDATION_SUBTYPE_OPTIONS = ['anime', 'manga', 'manhwa'];
export const RECOMMENDATION_PROGRESS_STATE_OPTIONS = ['untracked', 'planned', 'watching', 'reading', 'on-hold', 'completed', 'dropped'];
export const RECOMMENDATION_LENGTH_OPTIONS = ['any', 'short', 'long'];

export const DEFAULT_PROFILE_PREFERENCES = {
  bio: '',
  favoriteMoods: [],
  hideSeenByDefault: true,
  prioritizeUnseen: true,
  excludeCompletedFromRecs: true,
  excludeDroppedFromRecs: true,
  hideAdultContent: false,
  recommendationTypes: [...RECOMMENDATION_TYPE_OPTIONS],
  recommendationSubtypes: [...RECOMMENDATION_SUBTYPE_OPTIONS],
  recommendationProgressStates: [...RECOMMENDATION_PROGRESS_STATE_OPTIONS],
  forceUnseenOnly: false,
  minRecommendationScore: 0,
  recommendationLength: 'any',
  topTitles: {
    anime: [],
    manga: [],
    manhwa: [],
  },
};

function safeLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeScopedStorageKey(baseKey, userId = null) {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function readJson(baseKey, userId, fallbackValue) {
  const storage = safeLocalStorage();
  if (!storage) return fallbackValue;

  try {
    const primaryKey = makeScopedStorageKey(baseKey, userId);
    const fallbackKey = userId ? baseKey : null;
    const raw = storage.getItem(primaryKey) ?? (fallbackKey ? storage.getItem(fallbackKey) : null);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJson(baseKey, userId, value) {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(makeScopedStorageKey(baseKey, userId), JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeStringArray(values = [], allowedValues = null) {
  const uniqueValues = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!allowedValues) {
    return uniqueValues;
  }

  const allowedSet = new Set(allowedValues);
  return uniqueValues.filter((value) => allowedSet.has(value));
}

function normalizeNumericValue(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeTopTitles(topTitles = {}) {
  const source = topTitles && typeof topTitles === 'object' ? topTitles : {};
  return TOP_TITLE_TYPE_OPTIONS.reduce((acc, typeId) => {
    acc[typeId] = [...new Set((Array.isArray(source[typeId]) ? source[typeId] : []).map(Number).filter(Boolean))].slice(0, TOP_TITLE_LIMIT);
    return acc;
  }, {});
}

function getTitleLengthCount(title = {}) {
  const episodeCount = Number(title.episodes || 0);
  const chapterCount = Number(title.chapters || 0);
  return episodeCount > 0 ? episodeCount : chapterCount > 0 ? chapterCount : null;
}

export function getTitleDisplayName(title) {
  return title?.title_th || title?.title_en || title?.title_native || title?.name || 'Unknown title';
}

export function extractProfilePreferences(profile = null) {
  if (!profile) {
    return { ...DEFAULT_PROFILE_PREFERENCES };
  }

  return normalizeProfilePreferences({
    bio: profile.bio,
    favoriteMoods: profile.favorite_moods ?? profile.favoriteMoods,
    hideSeenByDefault: profile.hide_seen_by_default ?? profile.hideSeenByDefault,
    prioritizeUnseen: profile.prioritize_unseen ?? profile.prioritizeUnseen,
    excludeCompletedFromRecs: profile.exclude_completed_from_recs ?? profile.excludeCompletedFromRecs,
    excludeDroppedFromRecs: profile.exclude_dropped_from_recs ?? profile.excludeDroppedFromRecs,
    hideAdultContent: profile.hide_adult_content ?? profile.hideAdultContent,
    recommendationTypes: profile.recommendation_types ?? profile.recommendationTypes,
    recommendationSubtypes: profile.recommendation_subtypes ?? profile.recommendationSubtypes,
    recommendationProgressStates: profile.recommendation_progress_states ?? profile.recommendationProgressStates,
    forceUnseenOnly: profile.force_unseen_only ?? profile.forceUnseenOnly,
    minRecommendationScore: profile.min_recommendation_score ?? profile.minRecommendationScore,
    recommendationLength: profile.recommendation_length ?? profile.recommendationLength,
    topTitles: profile.top_titles ?? profile.topTitles,
  });
}

export function normalizeProfilePreferences(preferences = {}) {
  const nextPreferences = preferences && typeof preferences === 'object' ? preferences : {};
  const recommendationLength = RECOMMENDATION_LENGTH_OPTIONS.includes(nextPreferences.recommendationLength)
    ? nextPreferences.recommendationLength
    : DEFAULT_PROFILE_PREFERENCES.recommendationLength;

  return {
    bio: String(nextPreferences.bio ?? DEFAULT_PROFILE_PREFERENCES.bio).trim(),
    favoriteMoods: normalizeStringArray(nextPreferences.favoriteMoods ?? DEFAULT_PROFILE_PREFERENCES.favoriteMoods).slice(0, 5),
    hideSeenByDefault: normalizeBoolean(nextPreferences.hideSeenByDefault, DEFAULT_PROFILE_PREFERENCES.hideSeenByDefault),
    prioritizeUnseen: normalizeBoolean(nextPreferences.prioritizeUnseen, DEFAULT_PROFILE_PREFERENCES.prioritizeUnseen),
    excludeCompletedFromRecs: normalizeBoolean(nextPreferences.excludeCompletedFromRecs, DEFAULT_PROFILE_PREFERENCES.excludeCompletedFromRecs),
    excludeDroppedFromRecs: normalizeBoolean(nextPreferences.excludeDroppedFromRecs, DEFAULT_PROFILE_PREFERENCES.excludeDroppedFromRecs),
    hideAdultContent: normalizeBoolean(nextPreferences.hideAdultContent, DEFAULT_PROFILE_PREFERENCES.hideAdultContent),
    recommendationTypes: (() => {
      const values = normalizeStringArray(nextPreferences.recommendationTypes ?? DEFAULT_PROFILE_PREFERENCES.recommendationTypes, RECOMMENDATION_TYPE_OPTIONS);
      return values.length > 0 ? values : [...DEFAULT_PROFILE_PREFERENCES.recommendationTypes];
    })(),
    recommendationSubtypes: (() => {
      const values = normalizeStringArray(nextPreferences.recommendationSubtypes ?? DEFAULT_PROFILE_PREFERENCES.recommendationSubtypes, RECOMMENDATION_SUBTYPE_OPTIONS);
      return values.length > 0 ? values : [...DEFAULT_PROFILE_PREFERENCES.recommendationSubtypes];
    })(),
    recommendationProgressStates: (() => {
      const values = normalizeStringArray(
        nextPreferences.recommendationProgressStates ?? DEFAULT_PROFILE_PREFERENCES.recommendationProgressStates,
        RECOMMENDATION_PROGRESS_STATE_OPTIONS
      );
      return values.length > 0 ? values : [...DEFAULT_PROFILE_PREFERENCES.recommendationProgressStates];
    })(),
    forceUnseenOnly: normalizeBoolean(nextPreferences.forceUnseenOnly, DEFAULT_PROFILE_PREFERENCES.forceUnseenOnly),
    minRecommendationScore: Math.max(0, normalizeNumericValue(nextPreferences.minRecommendationScore, DEFAULT_PROFILE_PREFERENCES.minRecommendationScore)),
    recommendationLength,
    topTitles: normalizeTopTitles(nextPreferences.topTitles ?? DEFAULT_PROFILE_PREFERENCES.topTitles),
  };
}

export function toProfilePreferencesUpdates(preferences = DEFAULT_PROFILE_PREFERENCES) {
  const normalized = normalizeProfilePreferences(preferences);
  return {
    bio: normalized.bio,
    favorite_moods: normalized.favoriteMoods,
    hide_seen_by_default: normalized.hideSeenByDefault,
    prioritize_unseen: normalized.prioritizeUnseen,
    exclude_completed_from_recs: normalized.excludeCompletedFromRecs,
    exclude_dropped_from_recs: normalized.excludeDroppedFromRecs,
    hide_adult_content: normalized.hideAdultContent,
    recommendation_types: normalized.recommendationTypes,
    recommendation_subtypes: normalized.recommendationSubtypes,
    recommendation_progress_states: normalized.recommendationProgressStates,
    force_unseen_only: normalized.forceUnseenOnly,
    min_recommendation_score: normalized.minRecommendationScore,
    recommendation_length: normalized.recommendationLength,
    top_titles: normalized.topTitles,
  };
}

export function loadStoredProfilePreferences(userId = null) {
  const parsed = readJson(PROFILE_PREFERENCES_STORAGE_KEY, userId, DEFAULT_PROFILE_PREFERENCES);
  return normalizeProfilePreferences(parsed);
}

export function saveStoredProfilePreferences(userId = null, preferences = DEFAULT_PROFILE_PREFERENCES) {
  const normalized = normalizeProfilePreferences(preferences);
  writeJson(PROFILE_PREFERENCES_STORAGE_KEY, userId, normalized);
  return normalized;
}

export function deriveFavoriteTitleIdsFromWatchlist(watchlist = []) {
  return [...watchlist]
    .filter((item) => Number(item?.titleId))
    .sort((a, b) => {
      const scoreDiff = Number(b?.score || 0) - Number(a?.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const statusWeight = (item) => {
        if (item?.status === 'completed') return 3;
        if (item?.status === 'watching' || item?.status === 'reading') return 2;
        if (item?.status === 'planned') return 1;
        return 0;
      };
      const statusDiff = statusWeight(b) - statusWeight(a);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b?.updatedAt || b?.addedAt || 0).getTime() - new Date(a?.updatedAt || a?.addedAt || 0).getTime();
    })
    .map((item) => Number(item.titleId))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 8);
}

export function loadStoredFavoriteTitleIds(userId = null) {
  return [...new Set(readJson(FAVORITE_TITLES_STORAGE_KEY, userId, []).map(Number).filter(Boolean))].slice(0, 8);
}

export function saveStoredFavoriteTitleIds(userId = null, titleIds = []) {
  const normalized = [...new Set((titleIds || []).map(Number).filter(Boolean))].slice(0, 8);
  writeJson(FAVORITE_TITLES_STORAGE_KEY, userId, normalized);
  return normalized;
}

function normalizeHiddenEntry(entry = {}) {
  const titleId = Number(entry?.titleId ?? entry?.title_id);
  if (!titleId) {
    return null;
  }

  return {
    titleId,
    hideFromRecommendations: entry?.hideFromRecommendations ?? entry?.hide_from_recommendations ?? true,
    hideFromDiscovery: entry?.hideFromDiscovery ?? entry?.hide_from_discovery ?? true,
  };
}

export function loadStoredHiddenTitleEntries(userId = null) {
  return readJson(HIDDEN_TITLES_STORAGE_KEY, userId, [])
    .map(normalizeHiddenEntry)
    .filter(Boolean);
}

export function saveStoredHiddenTitleEntries(userId = null, entries = []) {
  const normalized = entries.map(normalizeHiddenEntry).filter(Boolean);
  writeJson(HIDDEN_TITLES_STORAGE_KEY, userId, normalized);
  return normalized;
}

function normalizeHistoryItem(item = {}) {
  return {
    id: item.id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    titleId: Number(item.titleId ?? item.title_id),
    eventType: item.eventType ?? item.event_type ?? 'status_changed',
    fromStatus: item.fromStatus ?? item.from_status ?? null,
    toStatus: item.toStatus ?? item.to_status ?? null,
    progressEpisode: item.progressEpisode ?? item.progress_episode ?? null,
    progressChapter: item.progressChapter ?? item.progress_chapter ?? null,
    score: item.score ?? null,
    note: item.note ?? '',
    metadata: item.metadata ?? {},
    createdAt: item.createdAt ?? item.created_at ?? new Date().toISOString(),
  };
}

export function loadStoredTitleHistory(userId = null) {
  return readJson(TITLE_HISTORY_STORAGE_KEY, userId, [])
    .map(normalizeHistoryItem)
    .filter((item) => item.titleId);
}

export function saveStoredTitleHistory(userId = null, items = []) {
  const normalized = items.map(normalizeHistoryItem).filter((item) => item.titleId).slice(0, MAX_HISTORY_ITEMS);
  writeJson(TITLE_HISTORY_STORAGE_KEY, userId, normalized);
  return normalized;
}

export function createHistoryEvent(payload = {}) {
  return normalizeHistoryItem(payload);
}

export function appendStoredHistoryItem(userId = null, historyItem) {
  const nextItems = [
    createHistoryEvent(historyItem),
    ...loadStoredTitleHistory(userId).filter((item) => item.id !== historyItem?.id),
  ].slice(0, MAX_HISTORY_ITEMS);

  saveStoredTitleHistory(userId, nextItems);
  return nextItems;
}

export function buildRecommendationState(watchlist = [], preferences = DEFAULT_PROFILE_PREFERENCES, hiddenTitleIds = []) {
  const normalizedPreferences = normalizeProfilePreferences(preferences);
  const trackedTitleIds = new Set();
  const hiddenTitleSet = new Set((hiddenTitleIds || []).map(Number).filter(Boolean));
  const excludedTitleIds = new Set();
  const statusByTitleId = new Map();

  watchlist.forEach((item) => {
    const titleId = Number(item?.titleId);
    if (!titleId) {
      return;
    }

    const status = item?.status || 'planned';
    trackedTitleIds.add(titleId);
    statusByTitleId.set(titleId, status);

    if (normalizedPreferences.forceUnseenOnly) {
      excludedTitleIds.add(titleId);
      return;
    }

    if (status === 'completed' && normalizedPreferences.excludeCompletedFromRecs) {
      excludedTitleIds.add(titleId);
    }

    if (status === 'dropped' && normalizedPreferences.excludeDroppedFromRecs) {
      excludedTitleIds.add(titleId);
    }
  });

  return {
    preferences: normalizedPreferences,
    trackedTitleIds,
    hiddenTitleIds: hiddenTitleSet,
    excludedTitleIds,
    statusByTitleId,
  };
}

export function filterHiddenTitles(titles = [], recommendationState) {
  const hiddenTitleIds = recommendationState?.hiddenTitleIds || new Set();
  if (hiddenTitleIds.size === 0) {
    return titles;
  }

  return titles.filter((title) => !hiddenTitleIds.has(Number(title?.id)));
}

export function filterSeenTitles(titles = [], recommendationState, hideSeen = false) {
  if (!hideSeen) {
    return titles;
  }

  const trackedTitleIds = recommendationState?.trackedTitleIds || new Set();
  if (trackedTitleIds.size === 0) {
    return titles;
  }

  return titles.filter((title) => !trackedTitleIds.has(Number(title?.id)));
}

export function prioritizeUnseenTitles(titles = [], recommendationState) {
  const trackedTitleIds = recommendationState?.trackedTitleIds || new Set();
  if (trackedTitleIds.size === 0) {
    return titles;
  }

  return [...titles].sort((a, b) => {
    const aTracked = trackedTitleIds.has(Number(a?.id)) ? 1 : 0;
    const bTracked = trackedTitleIds.has(Number(b?.id)) ? 1 : 0;
    if (aTracked !== bTracked) {
      return aTracked - bTracked;
    }
    return 0;
  });
}

export function filterTitlesByRecommendationPreferences(titles = [], recommendationState) {
  const state = recommendationState || buildRecommendationState([], DEFAULT_PROFILE_PREFERENCES, []);
  const { preferences, statusByTitleId } = state;
  const allowedTypes = new Set(preferences.recommendationTypes);
  const allowedSubtypes = new Set(preferences.recommendationSubtypes);
  const allowedProgressStates = new Set(preferences.recommendationProgressStates);

  return titles.filter((title) => {
    const titleId = Number(title?.id);
    const progressState = statusByTitleId.get(titleId) || 'untracked';
    const score = Number(title?.score || 0);
    const subtype = title?.subtype || title?.type;
    const lengthCount = getTitleLengthCount(title);

    if (!allowedTypes.has(title?.type)) {
      return false;
    }

    if (subtype && !allowedSubtypes.has(subtype)) {
      return false;
    }

    if (!allowedProgressStates.has(progressState)) {
      return false;
    }

    if (preferences.hideAdultContent && title?.is_adult) {
      return false;
    }

    if (preferences.minRecommendationScore > 0 && score < preferences.minRecommendationScore) {
      return false;
    }

    if (preferences.recommendationLength === 'short' && lengthCount && lengthCount > 13) {
      return false;
    }

    if (preferences.recommendationLength === 'long' && lengthCount && lengthCount < 24) {
      return false;
    }

    if (preferences.forceUnseenOnly && state.trackedTitleIds.has(titleId)) {
      return false;
    }

    return true;
  });
}

export const useProfileStore = create((set) => ({
  profile: null,
  loading: false,
  uploading: false,
  error: '',

  fetchProfile: async (userId) => {
    if (!userId || !supabase) {
      set({ profile: null, loading: false });
      return null;
    }

    set({ loading: true, error: '' });
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      set({ profile: data || null, loading: false });
      return data || null;
    } catch (loadError) {
      set({ loading: false, error: loadError.message || 'Failed to fetch profile' });
      return null;
    }
  },

  updateProfile: async (userId, updates) => {
    if (!userId || !supabase) {
      return { success: false, error: new Error('User is not available') };
    }

    set({ loading: true, error: '' });
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, ...updates }, { onConflict: 'id' })
        .select('*')
        .maybeSingle();

      if (error) throw error;

      set((current) => ({
        profile: { ...(current.profile || {}), ...(data || updates) },
        loading: false,
      }));

      return { success: true, data: data || updates };
    } catch (saveError) {
      set({ loading: false, error: saveError.message || 'Failed to update profile' });
      return { success: false, error: saveError };
    }
  },

  uploadAvatar: async (userId, file) => {
    if (!userId || !file || !supabase) {
      return { success: false, error: new Error('Avatar upload is not available') };
    }

    set({ uploading: true, error: '' });
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = publicUrlData?.publicUrl ? `${publicUrlData.publicUrl}?t=${Date.now()}` : '';
      if (!avatarUrl) {
        throw new Error('Could not resolve avatar URL');
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, avatar_url: avatarUrl }, { onConflict: 'id' })
        .select('*')
        .maybeSingle();

      if (error) throw error;

      set((current) => ({
        profile: { ...(current.profile || {}), ...(data || {}), avatar_url: avatarUrl },
        uploading: false,
      }));

      return { success: true, url: avatarUrl };
    } catch (uploadError) {
      set({ uploading: false, error: uploadError.message || 'Failed to upload avatar' });
      return { success: false, error: uploadError };
    }
  },
}));
