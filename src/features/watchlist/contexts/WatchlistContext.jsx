import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { CANONICAL_TITLE_BROWSE_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  appendStoredHistoryItem,
  createHistoryEvent,
  loadStoredTitleHistory,
  saveStoredTitleHistory,
} from '@/features/profile/lib/profileStore';
import { isChapterBasedType, isEpisodeBasedType } from '@/shared/lib/titleType';

const WatchlistContext = createContext();
const WATCHLIST_STORAGE_KEY = 'moodtoon-watchlist';
const WATCHLIST_REQUEST_TIMEOUT_MS = 20000;

function scheduleWhenIdle(callback, timeout = 1500) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 400));
  return () => window.clearTimeout(handle);
}

function getWatchlistStorageKey(userId) {
  return userId ? `${WATCHLIST_STORAGE_KEY}:${userId}` : WATCHLIST_STORAGE_KEY;
}

function normalizeWatchlistItem(item = {}) {
  return {
    titleId: item.titleId,
    status: item.status || 'planned',
    progressEpisode: item.progressEpisode ?? null,
    progressChapter: item.progressChapter ?? null,
    score: item.score ?? null,
    note: item.note ?? '',
    addedAt: item.addedAt ?? item.createdAt ?? null,
    updatedAt: item.updatedAt ?? item.addedAt ?? item.createdAt ?? null,
    lastConsumedAt: item.lastConsumedAt ?? null,
    targetEpisode: item.targetEpisode ?? null,
    targetChapter: item.targetChapter ?? null,
    rewatchCount: item.rewatchCount ?? 0,
    metadata: item.metadata ?? {},
  };
}

function getWatchlistItemTimestamp(item = {}) {
  const rawValue = item.updatedAt ?? item.addedAt ?? item.createdAt ?? null;
  if (!rawValue) {
    return 0;
  }

  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeWatchlists(localItems = [], remoteItems = []) {
  const mergedByTitleId = new Map();

  [...remoteItems, ...localItems].forEach((item) => {
    const normalizedItem = normalizeWatchlistItem(item);
    if (!normalizedItem.titleId) {
      return;
    }

    const existingItem = mergedByTitleId.get(normalizedItem.titleId);
    if (!existingItem || getWatchlistItemTimestamp(normalizedItem) >= getWatchlistItemTimestamp(existingItem)) {
      mergedByTitleId.set(normalizedItem.titleId, normalizedItem);
    }
  });

  return [...mergedByTitleId.values()];
}

function areWatchlistsEqual(leftItems = [], rightItems = []) {
  if (leftItems.length !== rightItems.length) {
    return false;
  }

  const leftMap = new Map(leftItems.map((item) => [item.titleId, normalizeWatchlistItem(item)]));
  const rightMap = new Map(rightItems.map((item) => [item.titleId, normalizeWatchlistItem(item)]));

  if (leftMap.size !== rightMap.size) {
    return false;
  }

  for (const [titleId, leftItem] of leftMap.entries()) {
    const rightItem = rightMap.get(titleId);
    if (!rightItem) {
      return false;
    }

    if (JSON.stringify(leftItem) !== JSON.stringify(rightItem)) {
      return false;
    }
  }

  return true;
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timeout`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

function toUserListRow(userId, item) {
  return {
    user_id: userId,
    title_id: item.titleId,
    list_status: item.status,
    progress_episode: item.progressEpisode,
    progress_chapter: item.progressChapter,
    score: item.score,
    note: item.note,
    created_at: item.addedAt || item.updatedAt || new Date().toISOString(),
    updated_at: item.updatedAt || item.addedAt || new Date().toISOString(),
    last_consumed_at: item.lastConsumedAt,
    target_episode: item.targetEpisode,
    target_chapter: item.targetChapter,
    rewatch_count: item.rewatchCount,
    metadata: item.metadata || {},
  };
}

async function persistWatchlistSnapshot(userId, items = []) {
  if (!userId || !supabase || items.length === 0) {
    return;
  }

  const rows = items.map((item) => toUserListRow(userId, normalizeWatchlistItem(item)));

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await withTimeout(
      supabase.from('user_lists').upsert(chunk, { onConflict: 'user_id, title_id' }),
      WATCHLIST_REQUEST_TIMEOUT_MS,
      'Watchlist sync'
    );

    if (error) {
      throw error;
    }
  }
}

function clampProgressValue(value, total) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  if (Number.isFinite(total) && total > 0) {
    return Math.min(numericValue, total);
  }

  return numericValue;
}

function buildProgressUpdate(title, listItem, incrementBy = 1) {
  if (!title || !listItem) {
    return null;
  }

  const currentStatus = listItem.status;
  const nextStep = Math.max(1, Number(incrementBy) || 1);

  if (isEpisodeBasedType(title.type)) {
    const nextProgressEpisode = clampProgressValue((listItem.progressEpisode || 0) + nextStep, title.episodes);
    return {
      progressEpisode: nextProgressEpisode,
      lastConsumedAt: new Date().toISOString(),
      metadata: {
        ...(listItem.metadata || {}),
        sessionSource: 'quick-progress',
      },
      status: title.episodes && nextProgressEpisode >= title.episodes
        ? 'completed'
        : currentStatus === 'planned' || currentStatus === 'on-hold'
          ? 'watching'
          : currentStatus,
    };
  }

  if (isChapterBasedType(title.type)) {
    const nextProgressChapter = clampProgressValue((listItem.progressChapter || 0) + nextStep, title.chapters);
    return {
      progressChapter: nextProgressChapter,
      lastConsumedAt: new Date().toISOString(),
      metadata: {
        ...(listItem.metadata || {}),
        sessionSource: 'quick-progress',
      },
      status: title.chapters && nextProgressChapter >= title.chapters
        ? 'completed'
        : currentStatus === 'planned' || currentStatus === 'on-hold'
          ? 'reading'
          : currentStatus,
    };
  }

  return null;
}

function buildTargetCatchUpUpdate(title, listItem) {
  if (!title || !listItem) {
    return null;
  }

  if (isEpisodeBasedType(title.type)) {
    const targetEpisode = Number(listItem.targetEpisode || 0);
    if (targetEpisode <= Number(listItem.progressEpisode || 0)) {
      return null;
    }

    return {
      progressEpisode: clampProgressValue(targetEpisode, title.episodes),
      lastConsumedAt: new Date().toISOString(),
      metadata: {
        ...(listItem.metadata || {}),
        sessionSource: 'catch-up-target',
      },
      status: title.episodes && targetEpisode >= title.episodes ? 'completed' : 'watching',
    };
  }

  if (isChapterBasedType(title.type)) {
    const targetChapter = Number(listItem.targetChapter || 0);
    if (targetChapter <= Number(listItem.progressChapter || 0)) {
      return null;
    }

    return {
      progressChapter: clampProgressValue(targetChapter, title.chapters),
      lastConsumedAt: new Date().toISOString(),
      metadata: {
        ...(listItem.metadata || {}),
        sessionSource: 'catch-up-target',
      },
      status: title.chapters && targetChapter >= title.chapters ? 'completed' : 'reading',
    };
  }

  return null;
}

function buildConsumptionSessionPayload(title, previousItem, updates, timestamp) {
  if (!title || !previousItem) {
    return null;
  }

  if (updates.progressEpisode !== undefined) {
    const previousProgress = Number(previousItem.progressEpisode || 0);
    const nextProgress = Number(updates.progressEpisode || 0);
    const delta = Math.max(0, nextProgress - previousProgress);

    if (delta <= 0) {
      return null;
    }

    return {
      title_id: title.id,
      list_status: updates.status ?? previousItem.status,
      consumption_type: 'episode',
      source: updates.metadata?.sessionSource || 'manual',
      delta,
      previous_progress: previousProgress,
      next_progress: nextProgress,
      target_progress: previousItem.targetEpisode ?? null,
      session_started_at: updates.lastConsumedAt || timestamp,
      session_ended_at: updates.lastConsumedAt || timestamp,
      metadata: {
        title_type: title.type,
        title_slug: title.slug,
        ...updates.metadata,
      },
      created_at: updates.lastConsumedAt || timestamp,
    };
  }

  if (updates.progressChapter !== undefined) {
    const previousProgress = Number(previousItem.progressChapter || 0);
    const nextProgress = Number(updates.progressChapter || 0);
    const delta = Math.max(0, nextProgress - previousProgress);

    if (delta <= 0) {
      return null;
    }

    return {
      title_id: title.id,
      list_status: updates.status ?? previousItem.status,
      consumption_type: 'chapter',
      source: updates.metadata?.sessionSource || 'manual',
      delta,
      previous_progress: previousProgress,
      next_progress: nextProgress,
      target_progress: previousItem.targetChapter ?? null,
      session_started_at: updates.lastConsumedAt || timestamp,
      session_ended_at: updates.lastConsumedAt || timestamp,
      metadata: {
        title_type: title.type,
        title_slug: title.slug,
        ...updates.metadata,
      },
      created_at: updates.lastConsumedAt || timestamp,
    };
  }

  return null;
}
function loadStoredWatchlist(userId = null) {
  try {
    const primaryKey = getWatchlistStorageKey(userId);
    const fallbackKey = userId ? WATCHLIST_STORAGE_KEY : null;
    const saved = localStorage.getItem(primaryKey) ?? (fallbackKey ? localStorage.getItem(fallbackKey) : null);
    return saved ? JSON.parse(saved).map(normalizeWatchlistItem) : [];
  } catch {
    return [];
  }
}

function saveStoredWatchlist(userId = null, items = []) {
  try {
    localStorage.setItem(
      getWatchlistStorageKey(userId),
      JSON.stringify((items || []).map(normalizeWatchlistItem))
    );
  } catch {
    // Ignore storage failures
  }
}

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
      const { error } = await withTimeout(
        supabase.from('user_title_history').insert({
          user_id: userId,
          title_id: historyItem.titleId,
          event_type: historyItem.eventType,
          from_status: historyItem.fromStatus,
          to_status: historyItem.toStatus,
          progress_episode: historyItem.progressEpisode,
          progress_chapter: historyItem.progressChapter,
          score: historyItem.score,
          note: historyItem.note,
          metadata: historyItem.metadata,
          created_at: historyItem.createdAt,
        }),
        WATCHLIST_REQUEST_TIMEOUT_MS,
        'History insert'
      );

      if (error) {
        throw error;
      }
    } catch (error) {
      console.warn('Failed to persist title history:', error.message);
    }
  }, [userId]);

  const recordActivity = useCallback(async (actionType, titleId, metadata = {}) => {
    if (!userId || !supabase || !titleId) return;
    try {
      await supabase.from('user_activity').insert({
        user_id: userId,
        action_type: actionType,
        title_id: titleId,
        metadata,
      });
    } catch (err) {
      console.warn('Failed to record activity:', err.message);
    }
  }, [userId]);

  const recordConsumptionSession = useCallback(async (payload) => {
    if (!payload || !userId || !supabase) {
      return;
    }

    try {
      const { error } = await withTimeout(
        supabase.from('user_consumption_sessions').insert({
          user_id: userId,
          ...payload,
        }),
        WATCHLIST_REQUEST_TIMEOUT_MS,
        'Consumption session insert'
      );

      if (error) {
        throw error;
      }
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

        const { data, error } = await withTimeout(
          supabase
            .from('user_lists')
            .select(`
              title_id,
              list_status,
              progress_episode,
              progress_chapter,
              score,
              note,
              created_at,
              updated_at,
              last_consumed_at,
              target_episode,
              target_chapter,
              rewatch_count,
              metadata
            `)
            .eq('user_id', userId),
          WATCHLIST_REQUEST_TIMEOUT_MS,
          'Watchlist fetch'
        );

        if (error) {
          throw error;
        }

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
                  const { data: titlesData, error: titlesError } = await withTimeout(
                    supabase
                      .from('canonical_titles')
                      .select(CANONICAL_TITLE_BROWSE_SELECT)
                      .in('id', titleIds),
                    WATCHLIST_REQUEST_TIMEOUT_MS,
                    'Watchlist titles fetch'
                  );
                  if (titlesError) {
                    throw titlesError;
                  }
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
        const { data, error } = await supabase
          .from('user_title_history')
          .select('id, title_id, event_type, from_status, to_status, progress_episode, progress_chapter, score, note, metadata, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          throw error;
        }

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
        // Update Database
        const { error } = await withTimeout(
          supabase.from('user_lists').upsert({
            user_id: userId,
            title_id: titleId,
            list_status: status,
            updated_at: timestamp,
            metadata: previousItem?.metadata || {},
          }, { onConflict: 'user_id, title_id' }),
          WATCHLIST_REQUEST_TIMEOUT_MS,
          'Watchlist add'
        );

        if (error) {
          throw error;
        }
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
        const { error } = await withTimeout(
          supabase
            .from('user_lists')
            .delete()
            .eq('user_id', userId)
            .eq('title_id', titleId),
          WATCHLIST_REQUEST_TIMEOUT_MS,
          'Watchlist delete'
        );

        if (error) {
          throw error;
        }
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
        
        const { error } = await withTimeout(
          supabase
            .from('user_lists')
            .update(dbUpdates)
            .eq('user_id', userId)
            .eq('title_id', titleId),
          WATCHLIST_REQUEST_TIMEOUT_MS,
          'Watchlist update'
        );

        if (error) {
          throw error;
        }
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
