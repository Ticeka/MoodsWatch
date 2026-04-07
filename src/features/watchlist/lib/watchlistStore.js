import { supabase } from '@/shared/lib/supabase';
import { isChapterBasedType, isEpisodeBasedType } from '@/shared/lib/titleType';
import { persistRemoteWatchlistSnapshot } from '@/features/watchlist/api/watchlistApi';

export const WATCHLIST_STORAGE_KEY = 'moodtoon-watchlist';
export const WATCHLIST_REQUEST_TIMEOUT_MS = 20000;

export function scheduleWhenIdle(callback, timeout = 1500) {
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

export function getWatchlistStorageKey(userId) {
  return userId ? `${WATCHLIST_STORAGE_KEY}:${userId}` : WATCHLIST_STORAGE_KEY;
}

export function normalizeWatchlistItem(item = {}) {
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

export function getWatchlistItemTimestamp(item = {}) {
  const rawValue = item.updatedAt ?? item.addedAt ?? item.createdAt ?? null;
  if (!rawValue) {
    return 0;
  }

  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function mergeWatchlists(localItems = [], remoteItems = []) {
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

export function areWatchlistsEqual(leftItems = [], rightItems = []) {
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

export function withTimeout(promise, timeoutMs, label) {
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

export function toUserListRow(userId, item) {
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

export async function persistWatchlistSnapshot(userId, items = []) {
  if (!userId || !supabase || items.length === 0) {
    return;
  }

  const rows = items.map((item) => toUserListRow(userId, normalizeWatchlistItem(item)));
  await persistRemoteWatchlistSnapshot(userId, rows, WATCHLIST_REQUEST_TIMEOUT_MS, withTimeout);
}

export function clampProgressValue(value, total) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  if (Number.isFinite(total) && total > 0) {
    return Math.min(numericValue, total);
  }

  return numericValue;
}

export function buildProgressUpdate(title, listItem, incrementBy = 1) {
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

export function buildTargetCatchUpUpdate(title, listItem) {
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

export function buildConsumptionSessionPayload(title, previousItem, updates, timestamp) {
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

export function loadStoredWatchlist(userId = null) {
  try {
    const primaryKey = getWatchlistStorageKey(userId);
    const fallbackKey = userId ? WATCHLIST_STORAGE_KEY : null;
    const saved = localStorage.getItem(primaryKey) ?? (fallbackKey ? localStorage.getItem(fallbackKey) : null);
    return saved ? JSON.parse(saved).map(normalizeWatchlistItem) : [];
  } catch {
    return [];
  }
}

export function saveStoredWatchlist(userId = null, items = []) {
  try {
    localStorage.setItem(
      getWatchlistStorageKey(userId),
      JSON.stringify((items || []).map(normalizeWatchlistItem)),
    );
  } catch {
    // Ignore storage failures
  }
}
