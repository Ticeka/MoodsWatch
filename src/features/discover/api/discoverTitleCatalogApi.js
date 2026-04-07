import {
  fetchDiscoverCatalogTitles,
  fetchDiscoverTitleBySlug,
  fetchDiscoverTitleCharacters,
  fetchDiscoverTitlesByIds,
  fetchDiscoverTitlesPage,
} from './discoverCatalogApi.js';
import {
  CANONICAL_TITLE_BROWSE_SELECT,
  CANONICAL_TITLE_PREVIEW_SELECT,
} from '@/shared/lib/catalog';
import { isSupabaseConnected } from '@/shared/lib/supabase';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { buildCharacterCatalog } from '@/shared/lib/catalogEntities';

const CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CATALOG_MAX_ROWS = null;

let cachedTitles = null;
let cachedTitlesPromise = null;
let cacheTimestamp = 0;
let cacheError = null;
let cachedCatalogLimit = null;
let cachedDetailedTitles = null;
let cachedDetailedTitlesPromise = null;
let detailedCacheTimestamp = 0;
let detailedCacheError = null;
let cachedDetailedCatalogLimit = null;
const titleByIdCache = new Map();
const titleByIdsRequestCache = new Map();
const titleBySlugCache = new Map();
const titleBySlugRequestCache = new Map();

function resolveRequestedRowLimit(maxRows) {
  if (Number.isFinite(maxRows) && maxRows > 0) {
    return Math.floor(maxRows);
  }

  return null;
}

async function fetchSupabaseTitles({
  maxRows = DEFAULT_CATALOG_MAX_ROWS,
  select = CANONICAL_TITLE_BROWSE_SELECT,
} = {}) {
  return fetchDiscoverCatalogTitles({ maxRows, select });
}

export async function fetchTitleCharacters(titleIds = []) {
  return fetchDiscoverTitleCharacters(titleIds);
}

export function attachCharactersToTitles(titles = [], characterRows = []) {
  if (!Array.isArray(titles) || titles.length === 0) {
    return [];
  }

  const charactersByTitleId = new Map();

  (Array.isArray(characterRows) ? characterRows : []).forEach((character) => {
    const titleId = Number(character?.canonical_title_id || 0);
    if (!titleId) {
      return;
    }

    if (!charactersByTitleId.has(titleId)) {
      charactersByTitleId.set(titleId, []);
    }

    charactersByTitleId.get(titleId).push({
      anilist_id: character.anilist_id,
      name_full: character.name_full,
      name_native: character.name_native,
      image_url: character.image_url,
      role: character.role,
      voice_actor_name: character.voice_actor_name,
      voice_actor_image: character.voice_actor_image,
      sort_order: character.sort_order,
    });
  });

  return titles.map((title) => ({
    ...title,
    characters: (charactersByTitleId.get(Number(title.id)) || [])
      .slice()
      .sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)),
  }));
}

function ensureSupabaseConnected() {
  if (!isSupabaseConnected()) {
    throw new Error('Supabase is not configured');
  }
}

function mergeCachedTitleRecord(current = {}, incoming = {}) {
  const merged = { ...current };

  Object.entries(incoming).forEach(([key, value]) => {
    if (value !== undefined) {
      merged[key] = value;
    }
  });

  return merged;
}

function storeTitlesInCaches(titles) {
  if (!titles?.length) {
    return;
  }

  titles.forEach((title) => {
    titleByIdCache.set(title.id, mergeCachedTitleRecord(titleByIdCache.get(title.id), title));
  });

  if (cachedTitles?.length) {
    const nextTitlesById = new Map(cachedTitles.map((title) => [title.id, title]));
    titles.forEach((title) => {
      nextTitlesById.set(title.id, mergeCachedTitleRecord(nextTitlesById.get(title.id), title));
    });
    cachedTitles = Array.from(nextTitlesById.values());
  }
}

export async function fetchTitlesPageFromSupabase({ type = 'all', query = '', tag: _tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = {}) {
  return fetchDiscoverTitlesPage({ type, query, sortBy, page, pageSize, showAdult });
}

export async function getAllTitles({
  forceRefresh = false,
  maxRows = DEFAULT_CATALOG_MAX_ROWS,
  includeCharacters = false,
} = {}) {
  ensureSupabaseConnected();
  const requestedLimit = resolveRequestedRowLimit(maxRows);
  const cachedCollection = includeCharacters ? cachedDetailedTitles : cachedTitles;
  const cachedLimit = includeCharacters ? cachedDetailedCatalogLimit : cachedCatalogLimit;
  const lastCacheTimestamp = includeCharacters ? detailedCacheTimestamp : cacheTimestamp;
  const inFlightRequest = includeCharacters ? cachedDetailedTitlesPromise : cachedTitlesPromise;
  const cacheSatisfiesRequest = cachedCollection && (
    cachedLimit === null ||
    (requestedLimit !== null && cachedLimit >= requestedLimit)
  );

  const canUseCachedCatalog =
    !forceRefresh &&
    cacheSatisfiesRequest &&
    (Date.now() - lastCacheTimestamp < CACHE_TTL_MS) &&
    (requestedLimit === null || cachedCollection.length >= requestedLimit);

  if (canUseCachedCatalog) {
    return cachedCollection;
  }

  if (!forceRefresh && inFlightRequest) {
    return inFlightRequest;
  }

  const request = (async () => {
    try {
      const titles = await fetchSupabaseTitles({
        maxRows,
        select: CANONICAL_TITLE_BROWSE_SELECT,
      });
      const hydratedTitles = includeCharacters
        ? attachCharactersToTitles(titles, await fetchTitleCharacters(titles.map((title) => title.id)))
        : titles;

      storeTitlesInCaches(hydratedTitles);

      if (includeCharacters) {
        cachedDetailedTitles = hydratedTitles;
        cachedDetailedCatalogLimit = requestedLimit;
        detailedCacheTimestamp = Date.now();
        detailedCacheError = null;
      } else {
        cachedTitles = hydratedTitles;
        cachedCatalogLimit = requestedLimit;
        cacheTimestamp = Date.now();
        cacheError = null;
      }

      return hydratedTitles;
    } catch (error) {
      if (includeCharacters) {
        detailedCacheError = error.message;
      } else {
        cacheError = error.message;
      }
      throw error;
    } finally {
      if (includeCharacters) {
        cachedDetailedTitlesPromise = null;
      } else {
        cachedTitlesPromise = null;
      }
    }
  })();

  if (includeCharacters) {
    cachedDetailedTitlesPromise = request;
  } else {
    cachedTitlesPromise = request;
  }

  return request;
}

export function clearTitlesCache() {
  cachedTitles = null;
  cachedTitlesPromise = null;
  cacheTimestamp = 0;
  cacheError = null;
  cachedCatalogLimit = null;
  cachedDetailedTitles = null;
  cachedDetailedTitlesPromise = null;
  detailedCacheTimestamp = 0;
  detailedCacheError = null;
  cachedDetailedCatalogLimit = null;
  titleByIdCache.clear();
  titleByIdsRequestCache.clear();
  titleBySlugCache.clear();
  titleBySlugRequestCache.clear();
}

export function isCatalogCacheWarm() {
  return (
    !!cachedTitles &&
    cachedTitles.length > 0 &&
    Date.now() - cacheTimestamp < CACHE_TTL_MS
  );
}

export function getCachedTitlesSnapshot() {
  return [...(cachedTitles || cachedDetailedTitles || [])];
}

export function getCacheInfo() {
  return {
    source: cachedTitles || cachedDetailedTitles ? 'supabase' : null,
    count: cachedTitles?.length || 0,
    limit: cachedCatalogLimit,
    age: cacheTimestamp ? Date.now() - cacheTimestamp : null,
    detailedCount: cachedDetailedTitles?.length || 0,
    detailedLimit: cachedDetailedCatalogLimit,
    detailedAge: detailedCacheTimestamp ? Date.now() - detailedCacheTimestamp : null,
    isSupabaseConfigured: isSupabaseConnected(),
    cacheError,
    detailedCacheError,
  };
}

export async function getTitleBySlug(slug) {
  if (!slug) return null;

  ensureSupabaseConnected();

  if (titleBySlugCache.has(slug)) {
    return titleBySlugCache.get(slug);
  }

  if (titleBySlugRequestCache.has(slug)) {
    return titleBySlugRequestCache.get(slug);
  }

  const request = (async () => {
    const mapped = await fetchDiscoverTitleBySlug(slug);
    titleBySlugCache.set(slug, mapped);
    return mapped;
  })();

  titleBySlugRequestCache.set(slug, request);

  try {
    return await request;
  } finally {
    titleBySlugRequestCache.delete(slug);
  }
}

export async function getTrendingTitles(limit = 8, { showAdult = true } = {}) {
  const response = await fetchTitlesPageFromSupabase({ page: 1, pageSize: limit, showAdult });
  return response.items;
}

export async function getTitlesPage({ type = 'all', query = '', sortBy = 'popularity', page = 1, pageSize = 30, showAdult = true } = {}) {
  return fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize, showAdult });
}

export async function getCharactersPage({ type = 'all', query = '', sortBy = 'popularity', page = 1, pageSize = 30, showAdult = true } = {}) {
  const titleWindowSize = Math.max(pageSize * 4, 120);
  const result = await fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize: titleWindowSize, showAdult });
  const titleIds = result.items.map((t) => t.id);
  const characters = await fetchTitleCharacters(titleIds);
  const titlesWithChars = attachCharactersToTitles(result.items, characters);
  const characterItems = buildCharacterCatalog(titlesWithChars);
  return {
    items: characterItems.slice(0, pageSize),
    total: Math.max(characterItems.length, result.total),
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

export async function getTitlesByIds(ids, options = {}) {
  if (!ids?.length) return [];

  const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return [];
  }

  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const applyAgeGateFilter = (titles = []) => (
    showAdult === null ? titles : filterTitlesForAgeGate(titles, showAdult)
  );

  const cachedMatches = normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean);
  if (cachedMatches.length === normalizedIds.length) {
    const idMap = new Map(cachedMatches.map((title) => [title.id, title]));
    return applyAgeGateFilter(normalizedIds.map((id) => idMap.get(id)).filter(Boolean));
  }

  const missingIds = normalizedIds.filter((id) => !titleByIdCache.has(id));
  const requestKey = missingIds.slice().sort((a, b) => a - b).join(',');

  ensureSupabaseConnected();

  if (!titleByIdsRequestCache.has(requestKey)) {
    const request = (async () => {
      const mapped = await fetchDiscoverTitlesByIds(missingIds, {
        select: CANONICAL_TITLE_BROWSE_SELECT,
      });
      storeTitlesInCaches(mapped);
      return mapped;
    })();

    titleByIdsRequestCache.set(requestKey, request);
  }

  try {
    await titleByIdsRequestCache.get(requestKey);
  } finally {
    titleByIdsRequestCache.delete(requestKey);
  }

  return applyAgeGateFilter(normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean));
}

export async function getTitlePreviewByIds(ids, options = {}) {
  if (!ids?.length) return [];

  const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return [];
  }

  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const applyAgeGateFilter = (titles = []) => (
    showAdult === null ? titles : filterTitlesForAgeGate(titles, showAdult)
  );
  const cachedMatches = normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean);

  if (cachedMatches.length === normalizedIds.length) {
    const idMap = new Map(cachedMatches.map((title) => [title.id, title]));
    return applyAgeGateFilter(normalizedIds.map((id) => idMap.get(id)).filter(Boolean));
  }

  const missingIds = normalizedIds.filter((id) => !titleByIdCache.has(id));
  if (missingIds.length === 0) {
    return applyAgeGateFilter(normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean));
  }

  const requestKey = `preview::${missingIds.slice().sort((a, b) => a - b).join(',')}`;

  ensureSupabaseConnected();

  if (!titleByIdsRequestCache.has(requestKey)) {
    const request = (async () => {
      const mapped = await fetchDiscoverTitlesByIds(missingIds, {
        select: CANONICAL_TITLE_PREVIEW_SELECT,
      });
      storeTitlesInCaches(mapped);
      return mapped;
    })();

    titleByIdsRequestCache.set(requestKey, request);
  }

  try {
    await titleByIdsRequestCache.get(requestKey);
  } finally {
    titleByIdsRequestCache.delete(requestKey);
  }

  return applyAgeGateFilter(normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean));
}
