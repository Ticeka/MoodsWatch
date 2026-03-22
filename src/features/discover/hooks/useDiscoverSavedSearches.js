import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import {
  areSearchPresetsEqual,
  buildDefaultSavedSearches,
  clearSavedSearches,
  hasSeededSavedSearches,
  markSavedSearchesSeeded,
  normalizeSavedSearches,
  readSavedSearches,
  sanitizeSavedSearch,
  writeSavedSearches,
} from '@/features/discover/lib/discoverSearchState';

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

function mapRemoteSavedSearch(row) {
  return sanitizeSavedSearch({
    id: row.id,
    label: row.label,
    query: row.query,
    tag: row.tag,
    scope: row.scope,
    titleType: row.title_type,
    pinned: row.pinned,
    position: row.position,
  });
}

export function useDiscoverSavedSearches(t) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const remoteIdsRef = useRef(new Set());
  const [savedSearches, setSavedSearches] = useState(() => readSavedSearches(userId));
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');

  const persistRemoteSnapshot = useCallback(async (nextItems, removedIds = []) => {
    if (!userId || !supabase) {
      return;
    }

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_discover_saved_searches')
        .delete()
        .eq('user_id', userId)
        .in('id', removedIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    if (nextItems.length === 0) {
      remoteIdsRef.current = new Set();
      return;
    }

    const payload = nextItems.map((item, index) => ({
      id: item.id,
      user_id: userId,
      label: item.label || null,
      query: item.query,
      tag: item.tag,
      scope: item.scope,
      title_type: item.titleType,
      pinned: item.pinned,
      position: index,
    }));

    const { error: upsertError } = await supabase
      .from('user_discover_saved_searches')
      .upsert(payload, { onConflict: 'id' });

    if (upsertError) {
      throw upsertError;
    }

    remoteIdsRef.current = new Set(nextItems.map((item) => item.id));
  }, [userId]);

  useEffect(() => {
    const localSaved = readSavedSearches(userId);
    setSavedSearches(localSaved);
    setError('');
    setIsLoading(Boolean(userId && supabase));

    if (!userId || !supabase) {
      remoteIdsRef.current = new Set(localSaved.map((item) => item.id));

      if (localSaved.length === 0 && !hasSeededSavedSearches(userId)) {
        const defaults = buildDefaultSavedSearches(t);
        writeSavedSearches(userId, defaults);
        markSavedSearchesSeeded(userId);
        setSavedSearches(defaults);
        remoteIdsRef.current = new Set(defaults.map((item) => item.id));
      }

      setIsLoading(false);
      return;
    }

    let ignore = false;

    const loadRemoteSearches = async () => {
      try {
        const { data, error: loadError } = await supabase
          .from('user_discover_saved_searches')
          .select('id, label, query, tag, scope, title_type, pinned, position, updated_at')
          .eq('user_id', userId)
          .order('pinned', { ascending: false })
          .order('position', { ascending: true })
          .order('updated_at', { ascending: false });

        if (loadError) {
          throw loadError;
        }

        let nextItems = normalizeSavedSearches((data || []).map(mapRemoteSavedSearch));

        if (nextItems.length === 0) {
          if (localSaved.length > 0) {
            nextItems = localSaved;
            await persistRemoteSnapshot(nextItems);
          } else if (!hasSeededSavedSearches(userId)) {
            nextItems = buildDefaultSavedSearches(t);
            await persistRemoteSnapshot(nextItems);
            markSavedSearchesSeeded(userId);
          }
        }

        if (ignore) {
          return;
        }

        writeSavedSearches(userId, nextItems);
        setSavedSearches(nextItems);
        remoteIdsRef.current = new Set(nextItems.map((item) => item.id));
        setIsLoading(false);
        setError('');
      } catch (loadError) {
        if (ignore) {
          return;
        }

        if (isNetworkLikeError(loadError)) {
          setIsLoading(false);
          setError('');
          return;
        }

        setIsLoading(false);
        setError(loadError.message || 'Failed to load saved searches');
      }
    };

    void loadRemoteSearches();

    return () => {
      ignore = true;
    };
  }, [persistRemoteSnapshot, t, userId]);

  const syncSavedSearches = useCallback(async (updater) => {
    const previousItems = savedSearches;
    const nextItems = normalizeSavedSearches(typeof updater === 'function' ? updater(previousItems) : updater);
    const removedIds = previousItems
      .filter((item) => !nextItems.some((candidate) => candidate.id === item.id))
      .map((item) => item.id);

    setSavedSearches(nextItems);
    writeSavedSearches(userId, nextItems);

    try {
      await persistRemoteSnapshot(nextItems, removedIds);
      setError('');
    } catch (persistError) {
      if (!isNetworkLikeError(persistError)) {
        setError(persistError.message || 'Failed to save search');
      }
    }

    return nextItems;
  }, [persistRemoteSnapshot, savedSearches, userId]);

  const saveSearch = useCallback(async (entry) => {
    const nextSearch = sanitizeSavedSearch(entry);
    if (!nextSearch) {
      return savedSearches;
    }

    return syncSavedSearches((current) => {
      const existing = current.find((item) => areSearchPresetsEqual(item, nextSearch));
      const merged = {
        ...nextSearch,
        id: existing?.id || nextSearch.id,
        label: nextSearch.label || existing?.label || '',
        pinned: existing?.pinned ?? nextSearch.pinned ?? false,
      };

      return [
        merged,
        ...current.filter((item) => item.id !== merged.id && !areSearchPresetsEqual(item, merged)),
      ];
    });
  }, [savedSearches, syncSavedSearches]);

  const renameSearch = useCallback(async (searchId, label) => {
    const nextLabel = String(label || '').trim();
    return syncSavedSearches((current) => current.map((item) => (
      item.id === searchId
        ? { ...item, label: nextLabel }
        : item
    )));
  }, [syncSavedSearches]);

  const togglePinSearch = useCallback(async (searchId) => {
    return syncSavedSearches((current) => current.map((item) => (
      item.id === searchId
        ? { ...item, pinned: !item.pinned }
        : item
    )));
  }, [syncSavedSearches]);

  const deleteSearch = useCallback(async (searchId) => {
    return syncSavedSearches((current) => current.filter((item) => item.id !== searchId));
  }, [syncSavedSearches]);

  const removeByPreset = useCallback(async (presetToRemove) => {
    return syncSavedSearches((current) => current.filter((item) => !areSearchPresetsEqual(item, presetToRemove)));
  }, [syncSavedSearches]);

  const clearAllSearches = useCallback(async () => {
    markSavedSearchesSeeded(userId);
    clearSavedSearches(userId);
    setSavedSearches([]);

    if (!userId || !supabase) {
      return [];
    }

    try {
      const { error: deleteError } = await supabase
        .from('user_discover_saved_searches')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      remoteIdsRef.current = new Set();
      setError('');
      return [];
    } catch (deleteError) {
      if (!isNetworkLikeError(deleteError)) {
        setError(deleteError.message || 'Failed to clear saved searches');
      }
      return [];
    }
  }, [userId]);

  return useMemo(() => ({
    savedSearches,
    isLoading,
    error,
    saveSearch,
    renameSearch,
    togglePinSearch,
    deleteSearch,
    removeByPreset,
    clearAllSearches,
  }), [
    clearAllSearches,
    deleteSearch,
    error,
    isLoading,
    removeByPreset,
    renameSearch,
    saveSearch,
    savedSearches,
    togglePinSearch,
  ]);
}
