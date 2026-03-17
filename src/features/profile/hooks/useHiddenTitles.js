import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  loadStoredHiddenTitleEntries,
  saveStoredHiddenTitleEntries,
} from '@/features/profile/lib/profileStore';
import { supabase } from '@/shared/lib/supabase';

function normalizeEntry(entry) {
  const titleId = Number(entry?.titleId ?? entry?.title_id);
  return {
    titleId,
    hideFromRecommendations: entry?.hideFromRecommendations ?? entry?.hide_from_recommendations ?? true,
    hideFromDiscovery: entry?.hideFromDiscovery ?? entry?.hide_from_discovery ?? true,
  };
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(columnName.toLowerCase()) && (
    message.includes('column') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  );
}

function isNetworkLikeError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('network request failed') ||
    message.includes('cors')
  );
}

const listeners = new Set();
const hiddenTitlesStore = {
  userId: null,
  entries: [],
  isLoading: false,
  error: '',
  hasLoaded: false,
  schemaMode: 'unknown',
  request: null,
  snapshot: null,
};

function updateSnapshot() {
  hiddenTitlesStore.snapshot = {
    userId: hiddenTitlesStore.userId,
    entries: hiddenTitlesStore.entries,
    isLoading: hiddenTitlesStore.isLoading,
    error: hiddenTitlesStore.error,
  };
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setStoreState(partial) {
  Object.assign(hiddenTitlesStore, partial);
  updateSnapshot();
  emitChange();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function resetStoreForUser(userId) {
  hiddenTitlesStore.userId = userId;
  hiddenTitlesStore.entries = loadStoredHiddenTitleEntries(userId);
  hiddenTitlesStore.isLoading = false;
  hiddenTitlesStore.error = '';
  hiddenTitlesStore.hasLoaded = false;
  hiddenTitlesStore.schemaMode = 'unknown';
  hiddenTitlesStore.request = null;
  updateSnapshot();
}

function ensureStoreUser(userId) {
  if (hiddenTitlesStore.userId !== userId) {
    resetStoreForUser(userId);
    emitChange();
  }
}

updateSnapshot();

async function fetchHiddenTitlesForUser(userId) {
  ensureStoreUser(userId);

  if (!userId || !supabase) {
    return hiddenTitlesStore.entries;
  }

  if (hiddenTitlesStore.hasLoaded) {
    return hiddenTitlesStore.entries;
  }

  if (hiddenTitlesStore.request) {
    return hiddenTitlesStore.request;
  }

  setStoreState({ isLoading: true, error: '' });

  const request = (async () => {
    try {
      let data = null;

      if (hiddenTitlesStore.schemaMode !== 'legacy') {
        const { data: scopedData, error: scopedError } = await supabase
          .from('user_hidden_titles')
          .select('title_id, hide_from_recommendations, hide_from_discovery')
          .eq('user_id', userId);

        if (!scopedError) {
          hiddenTitlesStore.schemaMode = 'scoped';
          data = scopedData;
        } else if (
          isMissingColumnError(scopedError, 'hide_from_recommendations') ||
          isMissingColumnError(scopedError, 'hide_from_discovery')
        ) {
          hiddenTitlesStore.schemaMode = 'legacy';
        } else {
          throw scopedError;
        }
      }

      if (hiddenTitlesStore.schemaMode === 'legacy') {
        const { data: legacyData, error: legacyError } = await supabase
          .from('user_hidden_titles')
          .select('title_id')
          .eq('user_id', userId);

        if (legacyError) {
          throw legacyError;
        }

        data = legacyData;
      }

      const nextEntries = (data || []).map(normalizeEntry);
      saveStoredHiddenTitleEntries(userId, nextEntries);
      setStoreState({
        entries: nextEntries,
        isLoading: false,
        error: '',
        hasLoaded: true,
      });
      return nextEntries;
    } catch (loadError) {
      if (isNetworkLikeError(loadError)) {
        hiddenTitlesStore.schemaMode = 'offline';
        setStoreState({
          isLoading: false,
          error: '',
          hasLoaded: true,
        });
        return hiddenTitlesStore.entries;
      }

      setStoreState({
        isLoading: false,
        error: loadError.message || 'Failed to load hidden titles',
        hasLoaded: false,
      });
      throw loadError;
    } finally {
      hiddenTitlesStore.request = null;
    }
  })();

  hiddenTitlesStore.request = request;
  return request;
}

async function persistHiddenTitleEntry(userId, titleId, nextEntry) {
  ensureStoreUser(userId);

  const normalizedEntry = normalizeEntry({ titleId, ...nextEntry });
  const entryToPersist = hiddenTitlesStore.schemaMode === 'legacy' && (
    normalizedEntry.hideFromRecommendations || normalizedEntry.hideFromDiscovery
  )
    ? {
        ...normalizedEntry,
        hideFromRecommendations: true,
        hideFromDiscovery: true,
      }
    : normalizedEntry;

  const shouldKeep = entryToPersist.hideFromRecommendations || entryToPersist.hideFromDiscovery;
  const nextEntries = shouldKeep
    ? [...hiddenTitlesStore.entries.filter((entry) => entry.titleId !== titleId), entryToPersist]
    : hiddenTitlesStore.entries.filter((entry) => entry.titleId !== titleId);

  setStoreState({ entries: nextEntries });
  saveStoredHiddenTitleEntries(userId, nextEntries);

  if (!userId || !supabase || hiddenTitlesStore.schemaMode === 'offline') {
    return;
  }

  if (!shouldKeep) {
    const { error: deleteError } = await supabase
      .from('user_hidden_titles')
      .delete()
      .eq('user_id', userId)
      .eq('title_id', titleId);

    if (deleteError) {
      setStoreState({ error: deleteError.message || 'Failed to unhide title' });
      throw deleteError;
    }

    return;
  }

  const payload = hiddenTitlesStore.schemaMode === 'legacy'
    ? {
        user_id: userId,
        title_id: titleId,
      }
    : {
        user_id: userId,
        title_id: titleId,
        hide_from_recommendations: entryToPersist.hideFromRecommendations,
        hide_from_discovery: entryToPersist.hideFromDiscovery,
      };

  const { error: saveError } = await supabase
    .from('user_hidden_titles')
    .upsert(payload, { onConflict: 'user_id, title_id' });

  if (saveError) {
    if (isNetworkLikeError(saveError)) {
      hiddenTitlesStore.schemaMode = 'offline';
      setStoreState({ error: '' });
      return;
    }

    if (
      hiddenTitlesStore.schemaMode !== 'legacy' && (
        isMissingColumnError(saveError, 'hide_from_recommendations') ||
        isMissingColumnError(saveError, 'hide_from_discovery')
      )
    ) {
      hiddenTitlesStore.schemaMode = 'legacy';
      return persistHiddenTitleEntry(userId, titleId, nextEntry);
    }

    setStoreState({ error: saveError.message || 'Failed to save hidden title' });
    throw saveError;
  }
}

export function useHiddenTitles() {
  const { user } = useAuth();
  const userId = user?.id || null;

  const snapshot = useSyncExternalStore(
    subscribe,
    () => hiddenTitlesStore.snapshot,
    () => hiddenTitlesStore.snapshot
  );

  useEffect(() => {
    ensureStoreUser(userId);

    if (userId && supabase) {
      fetchHiddenTitlesForUser(userId).catch(() => {});
    }
  }, [userId]);

  const hiddenEntryMap = useMemo(
    () => new Map(snapshot.entries.map((entry) => [entry.titleId, entry])),
    [snapshot.entries]
  );

  const hiddenTitleIds = useMemo(
    () => snapshot.entries
      .filter((entry) => entry.hideFromRecommendations || entry.hideFromDiscovery)
      .map((entry) => entry.titleId),
    [snapshot.entries]
  );

  const hiddenFromRecommendationIds = useMemo(
    () => snapshot.entries
      .filter((entry) => entry.hideFromRecommendations)
      .map((entry) => entry.titleId),
    [snapshot.entries]
  );

  const hiddenFromDiscoveryIds = useMemo(
    () => snapshot.entries
      .filter((entry) => entry.hideFromDiscovery)
      .map((entry) => entry.titleId),
    [snapshot.entries]
  );

  const hideTitle = async (titleId, scope = 'all') => {
    const currentEntry = hiddenEntryMap.get(titleId) || {
      titleId,
      hideFromRecommendations: false,
      hideFromDiscovery: false,
    };

    await persistHiddenTitleEntry(userId, titleId, {
      hideFromRecommendations: scope === 'all' || scope === 'recommendations'
        ? true
        : currentEntry.hideFromRecommendations,
      hideFromDiscovery: scope === 'all' || scope === 'discovery'
        ? true
        : currentEntry.hideFromDiscovery,
    });
  };

  const unhideTitle = async (titleId, scope = 'all') => {
    const currentEntry = hiddenEntryMap.get(titleId);
    if (!currentEntry) {
      return;
    }

    await persistHiddenTitleEntry(userId, titleId, {
      hideFromRecommendations: scope === 'all' || scope === 'recommendations'
        ? false
        : currentEntry.hideFromRecommendations,
      hideFromDiscovery: scope === 'all' || scope === 'discovery'
        ? false
        : currentEntry.hideFromDiscovery,
    });
  };

  const setHiddenScopes = async (titleId, scopes) => {
    await persistHiddenTitleEntry(userId, titleId, scopes);
  };

  const bulkUnhideTitles = async (titleIds, scope = 'all') => {
    const uniqueIds = [...new Set((titleIds || []).map(Number).filter(Boolean))];
    for (const titleId of uniqueIds) {
      await unhideTitle(titleId, scope);
    }
  };

  const isHidden = (titleId, scope = 'any') => {
    const entry = hiddenEntryMap.get(titleId);
    if (!entry) {
      return false;
    }

    if (scope === 'recommendations') return entry.hideFromRecommendations;
    if (scope === 'discovery') return entry.hideFromDiscovery;
    return entry.hideFromRecommendations || entry.hideFromDiscovery;
  };

  return {
    hiddenEntries: snapshot.entries,
    hiddenTitleIds,
    hiddenFromRecommendationIds,
    hiddenFromDiscoveryIds,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    getHiddenEntry: (titleId) => hiddenEntryMap.get(titleId) || null,
    isHidden,
    hideTitle,
    unhideTitle,
    setHiddenScopes,
    bulkUnhideTitles,
  };
}
