import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  appendStoredHistoryItem,
  createHistoryEvent,
  loadStoredTitleHistory,
  saveStoredTitleHistory,
} from '@/features/profile/lib/profileStore';
import { isChapterBasedType, isEpisodeBasedType } from '@/shared/lib/titleType';
import {
  deleteRemoteWatchlistItem,
  fetchRemoteWatchlist,
  fetchRemoteWatchlistHistory,
  fetchRemoteWatchlistTitles,
  insertRemoteConsumptionSession,
  insertRemoteUserActivity,
  insertRemoteWatchlistHistory,
  updateRemoteWatchlistItem,
  upsertRemoteWatchlistItem,
} from '@/features/watchlist/api/watchlistApi';
import {
  areWatchlistsEqual,
  buildConsumptionSessionPayload,
  buildProgressUpdate,
  buildTargetCatchUpUpdate,
  loadStoredWatchlist,
  mergeWatchlists,
  normalizeWatchlistItem,
  persistWatchlistSnapshot,
  saveStoredWatchlist,
  scheduleWhenIdle,
  WATCHLIST_REQUEST_TIMEOUT_MS,
  withTimeout,
} from '@/features/watchlist/lib/watchlistStore';

const WatchlistContext = createContext();
const loadGuestWatchlist = () => loadStoredWatchlist();

export function WatchlistProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Local state for immediate UI updates
  const [watchlist, setWatchlist] = useState(loadGuestWatchlist);
  const [watchlistTitles, setWatchlistTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState(() => loadStoredTitleHistory(userId));
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Refs so callbacks don't need to close over watchlist/watchlistMap
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const watchlistMapRef = useRef(new Map());
  const syncRequestRef = useRef(Promise.resolve());

  useEffect(() => {
    setHistory(loadStoredTitleHistory(userId));
  }, [userId]);

  const recordHistory = useCallback(async (historyItem) => {
    const nextHistory = appendStoredHistoryItem(userId, historyItem);
    setHistory(nextHistory);

    if (!userId || !supabase) {
      return;
    }

    try {
      await insertRemoteWatchlistHistory(userId, historyItem, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
    } catch (error) {
      console.warn('Failed to persist title history:', error.message);
    }
  }, [userId]);

  const recordActivity = useCallback(async (actionType, titleId, metadata = {}) => {
    if (!userId || !supabase || !titleId) return;
    try {
      await insertRemoteUserActivity(userId, actionType, titleId, metadata);
    } catch (err) {
      console.warn('Failed to record activity:', err.message);
    }
  }, [userId]);

  const recordConsumptionSession = useCallback(async (payload) => {
    if (!payload || !userId || !supabase) {
      return;
    }

    try {
      await insertRemoteConsumptionSession(userId, payload, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
    } catch (error) {
      console.warn('Failed to persist consumption session:', error.message);
    }
  }, [userId]);

  // Fetch watchlist from Supabase when user logs in
  useEffect(() => {
    if (!userId || !supabase) {
      Promise.resolve().then(() => {
        setWatchlist(loadStoredWatchlist());
        setWatchlistTitles([]);
      });
      return;
    }

    let cancelled = false;
    let cancelIdleWork = null;

    const fetchWatchlist = async () => {
      setIsLoading(true);
      try {
        const localWatchlist = loadStoredWatchlist(userId);
        if (localWatchlist.length > 0) {
          setWatchlist(localWatchlist);
        }

        const data = await fetchRemoteWatchlist(userId, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);

        if (data && !cancelled) {
          const remoteWatchlist = data.map(item => normalizeWatchlistItem({
            titleId: item.title_id,
            status: item.list_status,
            progressEpisode: item.progress_episode,
            progressChapter: item.progress_chapter,
            score: item.score,
            note: item.note,
            addedAt: item.created_at,
            updatedAt: item.updated_at || item.created_at,
            lastConsumedAt: item.last_consumed_at,
            targetEpisode: item.target_episode,
            targetChapter: item.target_chapter,
            rewatchCount: item.rewatch_count,
            metadata: item.metadata,
          }));
          const mergedWatchlist = mergeWatchlists(localWatchlist, remoteWatchlist);
          setWatchlist(mergedWatchlist);
          saveStoredWatchlist(userId, mergedWatchlist);

          if (!areWatchlistsEqual(mergedWatchlist, remoteWatchlist)) {
            syncRequestRef.current = syncRequestRef.current
              .catch(() => {})
              .then(() => persistWatchlistSnapshot(userId, mergedWatchlist))
              .catch((syncError) => {
                console.warn('Failed to sync merged watchlist:', syncError.message);
              });
          }

          const titleIds = mergedWatchlist.map((item) => item.titleId).filter(Boolean);
          if (!cancelled) {
            if (titleIds.length === 0) {
              setWatchlistTitles([]);
            } else {
              cancelIdleWork?.();
              cancelIdleWork = scheduleWhenIdle(async () => {
                try {
                  const titlesData = await fetchRemoteWatchlistTitles(titleIds, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
                  if (!cancelled && titlesData) {
                    setWatchlistTitles(titlesData.map(mapCanonicalTitle));
                  }
                } catch (titlesLoadError) {
                  if (!cancelled) {
                    console.warn('Failed to load watchlist titles:', titlesLoadError.message);
                    setWatchlistTitles([]);
                  }
                }
              }, 2500);
            }
          }
        }
    } catch (error) {
      console.warn('Failed to load watchlist from Supabase:', error.message);
      if (!cancelled) {
        setWatchlistTitles([]);
        const fallback = loadStoredWatchlist(userId);
        if (fallback.length > 0) {
          setWatchlist(fallback);
        }
      }
    } finally {
      if (!cancelled) {
        setIsLoading(false);
      }
    }
  };

    fetchWatchlist();

    return () => {
      cancelled = true;
      cancelIdleWork?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase) {
      setHistory(loadStoredTitleHistory(userId));
      return;
    }

    let cancelled = false;
    let cancelIdleWork = null;

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const data = await fetchRemoteWatchlistHistory(userId);

        if (!cancelled) {
          const formatted = (data || []).map((item) => ({
            id: item.id,
            titleId: item.title_id,
            eventType: item.event_type,
            fromStatus: item.from_status,
            toStatus: item.to_status,
            progressEpisode: item.progress_episode,
            progressChapter: item.progress_chapter,
            score: item.score,
            note: item.note,
            metadata: item.metadata || {},
            createdAt: item.created_at,
          }));
          setHistory(formatted);
          saveStoredTitleHistory(userId, formatted);
        }
      } catch (error) {
        console.warn('Failed to load title history:', error.message);
        if (!cancelled) {
          setHistory(loadStoredTitleHistory(userId));
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    };

    cancelIdleWork = scheduleWhenIdle(() => {
      void fetchHistory();
    }, 3000);

    return () => {
      cancelled = true;
      cancelIdleWork?.();
    };
  }, [userId]);

  // Sync to local storage for all sessions (used as a fallback cache)
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      saveStoredWatchlist(userId, watchlist);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [userId, watchlist]);

  const addToList = useCallback(async (titleId, status = 'planned') => {
    const previousItem = watchlistRef.current.find((item) => item.titleId === titleId) || null;
    const previousWatchlist = watchlistRef.current;
    const timestamp = new Date().toISOString();

    // Optimistic UI update
    setWatchlist(prev => {
      const exists = prev.find(item => item.titleId === titleId);
      if (exists) {
        return prev.map(item => item.titleId === titleId ? normalizeWatchlistItem({ ...item, status, updatedAt: timestamp }) : item);
      }
      return [...prev, normalizeWatchlistItem({
        titleId,
        status,
        addedAt: timestamp,
        updatedAt: timestamp,
        score: null,
        note: '',
        progressEpisode: null,
        progressChapter: null,
        lastConsumedAt: null,
        targetEpisode: null,
        targetChapter: null,
        rewatchCount: 0,
        metadata: {},
      })];
    });

    try {
      if (userId && supabase) {
        await upsertRemoteWatchlistItem(userId, {
          user_id: userId,
          title_id: titleId,
          list_status: status,
          updated_at: timestamp,
          metadata: previousItem?.metadata || {},
        }, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
      }

      const historyItem = previousItem
        ? createHistoryEvent({
            titleId,
            eventType: 'status_changed',
            fromStatus: previousItem.status,
            toStatus: status,
            createdAt: timestamp,
          })
        : createHistoryEvent({
            titleId,
            eventType: 'added_to_list',
            toStatus: status,
            createdAt: timestamp,
          });

      void recordHistory(historyItem);

      if (previousItem) {
        if (status === 'completed') void recordActivity('completed', titleId);
        else if (status === 'dropped') void recordActivity('dropped', titleId);
      } else {
        void recordActivity('added', titleId);
      }
    } catch (error) {
      setWatchlist(previousWatchlist);
      throw error;
    }
  }, [recordActivity, recordHistory, userId]);

  const removeFromList = useCallback(async (titleId) => {
    const previousItem = watchlistRef.current.find((item) => item.titleId === titleId) || null;
    const previousWatchlist = watchlistRef.current;
    setWatchlist(prev => prev.filter(item => item.titleId !== titleId));

    try {
      if (userId && supabase) {
        await deleteRemoteWatchlistItem(userId, titleId, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
      }

      void recordHistory(createHistoryEvent({
        titleId,
        eventType: 'removed_from_list',
        fromStatus: previousItem?.status || null,
      }));
    } catch (error) {
      setWatchlist(previousWatchlist);
      throw error;
    }
  }, [recordHistory, userId]);

  const updateItem = useCallback(async (titleId, updates, options = {}) => {
    const previousItem = watchlistRef.current.find((item) => item.titleId === titleId) || null;
    const previousWatchlist = watchlistRef.current;
    const title = options.title || null;
    const timestamp = new Date().toISOString();
    setWatchlist((prev) => prev.map((item) => item.titleId === titleId
      ? normalizeWatchlistItem({ ...item, ...updates, updatedAt: timestamp })
      : item));

    try {
      if (userId && supabase) {
        const dbUpdates = {};
        if (updates.status) dbUpdates.list_status = updates.status;
        if (updates.score !== undefined) dbUpdates.score = updates.score;
        if (updates.note !== undefined) dbUpdates.note = updates.note;
        if (updates.progressEpisode !== undefined) dbUpdates.progress_episode = updates.progressEpisode;
        if (updates.progressChapter !== undefined) dbUpdates.progress_chapter = updates.progressChapter;
        if (updates.lastConsumedAt !== undefined) dbUpdates.last_consumed_at = updates.lastConsumedAt;
        if (updates.targetEpisode !== undefined) dbUpdates.target_episode = updates.targetEpisode;
        if (updates.targetChapter !== undefined) dbUpdates.target_chapter = updates.targetChapter;
        if (updates.rewatchCount !== undefined) dbUpdates.rewatch_count = updates.rewatchCount;
        if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
        dbUpdates.updated_at = timestamp;

        await updateRemoteWatchlistItem(userId, titleId, dbUpdates, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
      }

      if (!previousItem) {
        return;
      }

      const consumptionSessionPayload = buildConsumptionSessionPayload(title, previousItem, updates, timestamp);
      if (consumptionSessionPayload) {
        void recordConsumptionSession(consumptionSessionPayload);
      }

      if (updates.progressEpisode !== undefined || updates.progressChapter !== undefined) {
        void recordHistory(createHistoryEvent({
          titleId,
          eventType: 'progress_updated',
          fromStatus: previousItem.status,
          toStatus: updates.status ?? previousItem.status,
          progressEpisode: updates.progressEpisode ?? previousItem.progressEpisode ?? null,
          progressChapter: updates.progressChapter ?? previousItem.progressChapter ?? null,
          createdAt: timestamp,
        }));
      }

      if (updates.status && updates.status !== previousItem.status) {
        void recordHistory(createHistoryEvent({
          titleId,
          eventType: 'status_changed',
          fromStatus: previousItem.status,
          toStatus: updates.status,
          createdAt: timestamp,
        }));
        if (updates.status === 'completed') void recordActivity('completed', titleId);
        else if (updates.status === 'dropped') void recordActivity('dropped', titleId);
      } else if (updates.score !== undefined) {
        void recordHistory(createHistoryEvent({
          titleId,
          eventType: 'score_updated',
          fromStatus: previousItem.status,
          toStatus: previousItem.status,
          score: updates.score,
          createdAt: timestamp,
        }));
        if (updates.score != null) void recordActivity('rated', titleId, { score: updates.score });
      } else if (updates.note !== undefined) {
        void recordHistory(createHistoryEvent({
          titleId,
          eventType: 'note_updated',
          fromStatus: previousItem.status,
          toStatus: previousItem.status,
          note: updates.note,
          createdAt: timestamp,
        }));
      }
    } catch (error) {
      setWatchlist(previousWatchlist);
      throw error;
    }
  }, [recordActivity, recordConsumptionSession, recordHistory, userId]);

  const watchlistMap = useMemo(
    () => new Map(watchlist.map((item) => [item.titleId, item])),
    [watchlist]
  );
  watchlistMapRef.current = watchlistMap;

  const isInList = useCallback((titleId) => watchlistMapRef.current.has(titleId), []);
  const getItem = useCallback((titleId) => watchlistMapRef.current.get(titleId) || null, []);
  const getStatus = useCallback((titleId) => watchlistMapRef.current.get(titleId)?.status || null, []);
  const getByStatus = useCallback((status) => watchlistRef.current.filter(item => item.status === status), []);
  const advanceProgress = useCallback(async (title, incrementBy = 1) => {
    const listItem = watchlistMapRef.current.get(title?.id) || null;
    if (!title || !listItem) {
      return;
    }

    const updates = buildProgressUpdate(title, listItem, incrementBy);
    if (!updates) {
      return;
    }

    await updateItem(title.id, updates, { title });
  }, [updateItem]);

  const setConsumptionTarget = useCallback(async (title, value) => {
    if (!title) {
      return;
    }

    if (isEpisodeBasedType(title.type)) {
      await updateItem(title.id, { targetEpisode: value }, { title });
      return;
    }

    if (isChapterBasedType(title.type)) {
      await updateItem(title.id, { targetChapter: value }, { title });
    }
  }, [updateItem]);

  const catchUpToTarget = useCallback(async (title) => {
    const listItem = watchlistMapRef.current.get(title?.id) || null;
    if (!title || !listItem) {
      return;
    }

    const updates = buildTargetCatchUpUpdate(title, listItem);
    if (!updates) {
      return;
    }

    await updateItem(title.id, updates, { title });
  }, [updateItem]);

  const contextValue = useMemo(() => ({
    watchlist,
    watchlistTitles,
    history,
    addToList,
    removeFromList,
    updateItem,
    isInList,
    getItem,
    getStatus,
    getByStatus,
    advanceProgress,
    setConsumptionTarget,
    catchUpToTarget,
    isLoading,
    isHistoryLoading,
  }), [
    watchlist,
    watchlistTitles,
    history,
    isLoading,
    isHistoryLoading,
    // action callbacks are now stable refs — excluded from deps intentionally
    addToList,
    removeFromList,
    updateItem,
    isInList,
    getItem,
    getStatus,
    getByStatus,
    advanceProgress,
    setConsumptionTarget,
    catchUpToTarget,
  ]);

  return (
    <WatchlistContext.Provider value={contextValue}>
      {children}
    </WatchlistContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWatchlist = () => useContext(WatchlistContext);
