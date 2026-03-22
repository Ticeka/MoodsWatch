const RECENT_SEARCHES_STORAGE_KEY = 'moodswatch-discover-recent-searches';
const SAVED_SEARCHES_STORAGE_KEY = 'moodswatch-discover-saved-searches';
const SAVED_SEARCHES_SEEDED_STORAGE_KEY = 'moodswatch-discover-saved-searches-seeded';

export const MAX_RECENT_SEARCHES = 6;
export const MAX_SAVED_SEARCHES = 8;

const VALID_SEARCH_SCOPES = new Set(['all', 'titles', 'posts', 'people', 'tierlists']);
const VALID_TITLE_TYPES = new Set(['all', 'anime', 'manga', 'manhwa']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function readScopedJson(baseKey, userId, fallbackValue) {
  const storage = safeLocalStorage();
  if (!storage) {
    return fallbackValue;
  }

  try {
    const primaryKey = makeScopedStorageKey(baseKey, userId);
    const raw = storage.getItem(primaryKey) ?? (userId ? storage.getItem(baseKey) : null);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeScopedJson(baseKey, userId, value) {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(makeScopedStorageKey(baseKey, userId), JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function removeScopedKey(baseKey, userId) {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(makeScopedStorageKey(baseKey, userId));
  } catch {
    // Ignore storage failures.
  }
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

export function sanitizeRecentSearch(term) {
  const normalizedTerm = String(term || '').trim();
  return normalizedTerm.length >= 2 ? normalizedTerm : '';
}

export function readRecentSearches() {
  const stored = readScopedJson(RECENT_SEARCHES_STORAGE_KEY, null, []);
  return Array.isArray(stored)
    ? stored.map(sanitizeRecentSearch).filter(Boolean).slice(0, MAX_RECENT_SEARCHES)
    : [];
}

export function writeRecentSearches(items) {
  const nextItems = (Array.isArray(items) ? items : [])
    .map(sanitizeRecentSearch)
    .filter(Boolean)
    .slice(0, MAX_RECENT_SEARCHES);
  writeScopedJson(RECENT_SEARCHES_STORAGE_KEY, null, nextItems);
  return nextItems;
}

export function removeRecentSearch(term) {
  const normalizedTerm = String(term || '').trim().toLowerCase();
  if (!normalizedTerm) return readRecentSearches();
  return writeRecentSearches(readRecentSearches().filter((entry) => entry.toLowerCase() !== normalizedTerm));
}

export function clearRecentSearches() {
  removeScopedKey(RECENT_SEARCHES_STORAGE_KEY, null);
}

export function sanitizeSavedSearch(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const query = String(entry.query || '').trim();
  const label = String(entry.label || '').trim();
  const scope = VALID_SEARCH_SCOPES.has(entry.scope) ? entry.scope : 'all';
  const supportsTitleFilters = scope === 'all' || scope === 'titles';
  const tag = supportsTitleFilters ? String(entry.tag || '').trim().toLowerCase() : '';
  const titleType = supportsTitleFilters && VALID_TITLE_TYPES.has(entry.titleType) ? entry.titleType : 'all';
  const pinned = Boolean(entry.pinned);
  const position = Number.isFinite(Number(entry.position)) ? Number(entry.position) : 0;

  if (!query && !tag && scope === 'all' && titleType === 'all') {
    return null;
  }

  return {
    id: isUuid(entry.id) ? String(entry.id).trim() : createUuid(),
    label,
    query,
    tag,
    scope,
    titleType,
    pinned,
    position,
  };
}

export function sortSavedSearches(items = []) {
  return [...items].sort((left, right) => {
    const pinDelta = Number(right.pinned) - Number(left.pinned);
    if (pinDelta !== 0) {
      return pinDelta;
    }

    const positionDelta = Number(left.position || 0) - Number(right.position || 0);
    if (positionDelta !== 0) {
      return positionDelta;
    }

    return String(left.label || left.query || left.tag).localeCompare(String(right.label || right.query || right.tag));
  });
}

export function normalizeSavedSearches(items = []) {
  return sortSavedSearches(
    (Array.isArray(items) ? items : [])
      .map(sanitizeSavedSearch)
      .filter(Boolean)
      .slice(0, MAX_SAVED_SEARCHES)
      .map((item, index) => ({
        ...item,
        position: index,
      }))
  );
}

export function readSavedSearches(userId = null) {
  return normalizeSavedSearches(readScopedJson(SAVED_SEARCHES_STORAGE_KEY, userId, []));
}

export function writeSavedSearches(userId = null, items = []) {
  const nextItems = normalizeSavedSearches(items);
  writeScopedJson(SAVED_SEARCHES_STORAGE_KEY, userId, nextItems);
  return nextItems;
}

export function clearSavedSearches(userId = null) {
  removeScopedKey(SAVED_SEARCHES_STORAGE_KEY, userId);
}

export function hasSeededSavedSearches(userId = null) {
  const storage = safeLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(makeScopedStorageKey(SAVED_SEARCHES_SEEDED_STORAGE_KEY, userId)) === '1';
  } catch {
    return false;
  }
}

export function markSavedSearchesSeeded(userId = null) {
  const storage = safeLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(makeScopedStorageKey(SAVED_SEARCHES_SEEDED_STORAGE_KEY, userId), '1');
  } catch {
    // Ignore storage failures.
  }
}

export function buildDefaultSavedSearches(t) {
  return normalizeSavedSearches([
    {
      id: 'starter-frieren',
      label: t('discover.defaultSearchSetFrieren'),
      query: 'Frieren',
      scope: 'titles',
      titleType: 'anime',
      pinned: true,
      position: 0,
    },
    {
      id: 'starter-action',
      label: t('discover.defaultSearchSetAction'),
      query: '',
      tag: 'action',
      scope: 'titles',
      titleType: 'all',
      pinned: true,
      position: 1,
    },
    {
      id: 'starter-people',
      label: t('discover.defaultSearchSetPeople'),
      query: '',
      scope: 'people',
      titleType: 'all',
      pinned: false,
      position: 2,
    },
    {
      id: 'starter-tierlists',
      label: t('discover.defaultSearchSetTierlists'),
      query: 'romance',
      scope: 'tierlists',
      titleType: 'all',
      pinned: false,
      position: 3,
    },
  ]);
}

export function areSearchPresetsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.scope === right.scope
    && left.titleType === right.titleType
    && left.tag === right.tag
    && left.query.toLowerCase() === right.query.toLowerCase();
}
