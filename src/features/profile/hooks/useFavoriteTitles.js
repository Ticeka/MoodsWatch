import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import {
  deriveFavoriteTitleIdsFromWatchlist,
  loadStoredFavoriteTitleIds,
  saveStoredFavoriteTitleIds,
} from '@/features/profile/lib/profileStore';
import { supabase } from '@/shared/lib/supabase';

export const FAVORITES_LIMIT = 8;

const listeners = new Set();
const favoritesStore = {
  userId: null,
  titleIds: [],
  isLoading: false,
  isSaving: false,
  error: '',
  hasLoaded: false,
  request: null,
  snapshot: null,
};

function updateSnapshot() {
  favoritesStore.snapshot = {
    userId: favoritesStore.userId,
    titleIds: favoritesStore.titleIds,
    isLoading: favoritesStore.isLoading,
    isSaving: favoritesStore.isSaving,
    error: favoritesStore.error,
  };
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setStoreState(partial) {
  Object.assign(favoritesStore, partial);
  updateSnapshot();
  emitChange();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function normalizeFavoriteIds(titleIds = []) {
  return [...new Set((titleIds || []).map(Number).filter(Boolean))].slice(0, FAVORITES_LIMIT);
}

function resetStoreForUser(userId, fallbackTitleIds = []) {
  const storedIds = loadStoredFavoriteTitleIds(userId);
  favoritesStore.userId = userId;
  favoritesStore.titleIds = storedIds.length > 0 ? storedIds : normalizeFavoriteIds(fallbackTitleIds);
  favoritesStore.isLoading = false;
  favoritesStore.isSaving = false;
  favoritesStore.error = '';
  favoritesStore.hasLoaded = false;
  favoritesStore.request = null;
  updateSnapshot();
}

function ensureStoreUser(userId, fallbackTitleIds = []) {
  if (favoritesStore.userId !== userId) {
    resetStoreForUser(userId, fallbackTitleIds);
    emitChange();
    return;
  }

  if (favoritesStore.titleIds.length === 0 && fallbackTitleIds.length > 0) {
    const nextIds = normalizeFavoriteIds(fallbackTitleIds);
    favoritesStore.titleIds = nextIds;
    saveStoredFavoriteTitleIds(userId, nextIds);
    updateSnapshot();
    emitChange();
  }
}

updateSnapshot();

async function fetchFavoriteTitlesForUser(userId, fallbackTitleIds = []) {
  ensureStoreUser(userId, fallbackTitleIds);

  if (!userId || !supabase) {
    return favoritesStore.titleIds;
  }

  if (favoritesStore.hasLoaded) {
    return favoritesStore.titleIds;
  }

  if (favoritesStore.request) {
    return favoritesStore.request;
  }

  setStoreState({ isLoading: true, error: '' });

  const request = (async () => {
    try {
      const { data, error } = await supabase
        .from('user_favorite_titles')
        .select('title_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const remoteIds = normalizeFavoriteIds((data || []).map((item) => item.title_id));
      const nextIds = remoteIds.length > 0 ? remoteIds : normalizeFavoriteIds(fallbackTitleIds);
      saveStoredFavoriteTitleIds(userId, nextIds);
      setStoreState({
        titleIds: nextIds,
        isLoading: false,
        error: '',
        hasLoaded: true,
      });
      return nextIds;
    } catch (loadError) {
      setStoreState({
        isLoading: false,
        error: loadError.message || 'Failed to load favorite titles',
        hasLoaded: false,
      });
      throw loadError;
    } finally {
      favoritesStore.request = null;
    }
  })();

  favoritesStore.request = request;
  return request;
}

async function persistFavoriteIds(userId, nextIds, previousIds, changedTitleId) {
  setStoreState({
    titleIds: nextIds,
    isSaving: !!userId && !!supabase,
    error: '',
  });
  saveStoredFavoriteTitleIds(userId, nextIds);

  if (!userId || !supabase) {
    return nextIds;
  }

  const wasFavorite = previousIds.includes(changedTitleId);
  const removedIds = previousIds.filter((id) => !nextIds.includes(id));

  try {
    if (wasFavorite) {
      const { error } = await supabase
        .from('user_favorite_titles')
        .delete()
        .eq('user_id', userId)
        .eq('title_id', changedTitleId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('user_favorite_titles')
        .upsert({
          user_id: userId,
          title_id: changedTitleId,
        }, { onConflict: 'user_id, title_id' });

      if (error) throw error;
    }

    if (!wasFavorite && removedIds.length > 0) {
      const { error } = await supabase
        .from('user_favorite_titles')
        .delete()
        .eq('user_id', userId)
        .in('title_id', removedIds);

      if (error) throw error;
    }

    setStoreState({ isSaving: false });
    return nextIds;
  } catch (saveError) {
    saveStoredFavoriteTitleIds(userId, previousIds);
    setStoreState({
      titleIds: previousIds,
      isSaving: false,
      error: saveError.message || 'Failed to save favorite titles',
    });
    throw saveError;
  }
}

export function useFavoriteTitles() {
  const { user } = useAuth();
  const { watchlist } = useWatchlist();
  const userId = user?.id || null;
  const derivedFavoriteIds = useMemo(
    () => deriveFavoriteTitleIdsFromWatchlist(watchlist),
    [watchlist]
  );
  const derivedFavoriteIdsKey = useMemo(
    () => derivedFavoriteIds.join(','),
    [derivedFavoriteIds]
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => favoritesStore.snapshot,
    () => favoritesStore.snapshot
  );

  useEffect(() => {
    const fallbackIds = derivedFavoriteIdsKey
      ? derivedFavoriteIdsKey.split(',').map((value) => Number(value)).filter(Boolean)
      : [];
    ensureStoreUser(userId, fallbackIds);
  }, [derivedFavoriteIdsKey, userId]);

  useEffect(() => {
    const fallbackIds = derivedFavoriteIdsKey
      ? derivedFavoriteIdsKey.split(',').map((value) => Number(value)).filter(Boolean)
      : [];
    fetchFavoriteTitlesForUser(userId, fallbackIds).catch(() => {});
  }, [derivedFavoriteIdsKey, userId]);

  const toggleFavorite = async (titleId) => {
    const normalizedTitleId = Number(titleId);
    if (!normalizedTitleId) {
      return { isFavorite: false };
    }

    const previousIds = favoritesStore.titleIds;
    const exists = previousIds.includes(normalizedTitleId);
    const nextIds = exists
      ? previousIds.filter((id) => id !== normalizedTitleId)
      : [normalizedTitleId, ...previousIds].slice(0, FAVORITES_LIMIT);

    await persistFavoriteIds(userId, nextIds, previousIds, normalizedTitleId);
    return { isFavorite: !exists };
  };

  return {
    favoriteTitleIds: snapshot.titleIds,
    isLoading: snapshot.isLoading,
    isSaving: snapshot.isSaving,
    error: snapshot.error,
    isFavorite: (titleId) => snapshot.titleIds.includes(Number(titleId)),
    toggleFavorite,
    limit: FAVORITES_LIMIT,
  };
}
