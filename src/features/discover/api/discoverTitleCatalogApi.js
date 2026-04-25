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
  mapCanonicalTitle,
} from '@/shared/lib/catalog';
import { isSupabaseConnected, supabase } from '@/shared/lib/supabase';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { buildCharacterEntity } from '@/shared/lib/catalogEntities';

const CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CATALOG_MAX_ROWS = null;
const CATALOG_STORAGE_KEY = 'moodtoon.catalog.browse.v1';
const CATALOG_STORAGE_TTL_MS = 30 * 60 * 1000;

let cachedTitles = null;
let cachedTitlesPromise = null;
let cacheTimestamp = 0;
let cacheError = null;
let cachedCatalogLimit = null;
let persistenceDisabled = false;
let cachedDetailedTitles = null;
let cachedDetailedTitlesPromise = null;
let detailedCacheTimestamp = 0;
let detailedCacheError = null;
let cachedDetailedCatalogLimit = null;
const characterPageCache = new Map();
const characterPageRequestCache = new Map();
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

function getCharacterPageCacheKey({
  type = 'all',
  query = '',
  sortBy = 'popularity',
  page = 1,
  pageSize = 30,
  showAdult = true,
} = {}) {
  return JSON.stringify({
    type: String(type || 'all'),
    query: String(query || '').trim().toLowerCase(),
    sortBy: String(sortBy || 'popularity'),
    page: Math.max(1, Number(page) || 1),
    pageSize: Math.max(1, Number(pageSize) || 30),
    showAdult: Boolean(showAdult),
  });
}

function getCachedCharacterPage(cacheKey) {
  const cached = characterPageCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    characterPageCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function storeCharacterPage(cacheKey, value) {
  characterPageCache.set(cacheKey, {
    timestamp: Date.now(),
    value,
  });
}

function normalizeJoinedTitleRecord(record) {
  const rawTitle = Array.isArray(record) ? record[0] : record;
  return rawTitle ? mapCanonicalTitle(rawTitle) : null;
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

function getCatalogStorage() {
  if (persistenceDisabled || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    persistenceDisabled = true;
    return null;
  }
}

function hydrateCatalogFromStorage() {
  const storage = getCatalogStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.titles) || !parsed.timestamp) return;
    if (Date.now() - parsed.timestamp >= CATALOG_STORAGE_TTL_MS) {
      storage.removeItem(CATALOG_STORAGE_KEY);
      return;
    }
    cachedTitles = parsed.titles;
    cacheTimestamp = parsed.timestamp;
    cachedCatalogLimit = parsed.limit ?? null;
    parsed.titles.forEach((title) => {
      if (title?.id != null) titleByIdCache.set(title.id, title);
    });
  } catch {
    try { storage.removeItem(CATALOG_STORAGE_KEY); } catch { /* noop */ }
  }
}

function persistCatalogToStorage() {
  const storage = getCatalogStorage();
  if (!storage) return;
  if (!cachedTitles?.length) return;
  try {
    storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify({
      titles: cachedTitles,
      timestamp: cacheTimestamp,
      limit: cachedCatalogLimit,
    }));
  } catch {
    persistenceDisabled = true;
    try { storage.removeItem(CATALOG_STORAGE_KEY); } catch { /* noop */ }
  }
}

function clearCatalogStorage() {
  const storage = getCatalogStorage();
  if (!storage) return;
  try { storage.removeItem(CATALOG_STORAGE_KEY); } catch { /* noop */ }
}

hydrateCatalogFromStorage();

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
        persistCatalogToStorage();
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
  characterPageCache.clear();
  characterPageRequestCache.clear();
  titleByIdCache.clear();
  titleByIdsRequestCache.clear();
  titleBySlugCache.clear();
  titleBySlugRequestCache.clear();
  clearCatalogStorage();
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
  ensureSupabaseConnected();

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 30);
  const cacheKey = getCharacterPageCacheKey({
    type,
    query,
    sortBy,
    page: safePage,
    pageSize: safePageSize,
    showAdult,
  });
  const cached = getCachedCharacterPage(cacheKey);
  if (cached) {
    return cached;
  }

  if (characterPageRequestCache.has(cacheKey)) {
    return characterPageRequestCache.get(cacheKey);
  }

  const request = (async () => {
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;
    const normalizedQuery = String(query || '').trim();
    const escapedQuery = normalizedQuery.replace(/[%_,]/g, '');
    const hasSearchQuery = escapedQuery.length >= 2;

    const applyCharacterBaseFilters = (builder) => {
      let nextQuery = builder.eq('canonical_titles.is_adult', Boolean(showAdult));

      if (type === 'manhwa') {
        nextQuery = nextQuery.eq('canonical_titles.type', 'manga').eq('canonical_titles.subtype', 'manhwa');
      } else if (type === 'manga') {
        nextQuery = nextQuery.eq('canonical_titles.type', 'manga').neq('canonical_titles.subtype', 'manhwa');
      } else if (type && type !== 'all') {
        nextQuery = nextQuery.eq('canonical_titles.type', type);
      }

      return nextQuery;
    };

    const applyCharacterSort = (builder) => {
      let nextQuery = builder;

      if (sortBy === 'score') {
        nextQuery = nextQuery
          .order('avg_score', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false })
          .order('popularity_score', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false });
      } else if (sortBy === 'year') {
        nextQuery = nextQuery
          .order('release_year', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false })
          .order('popularity_score', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false });
      } else if (sortBy === 'title') {
        nextQuery = nextQuery
          .order('canonical_title', { foreignTable: 'canonical_titles', ascending: true })
          .order('name_full', { ascending: true });
      } else {
        nextQuery = nextQuery
          .order('popularity_score', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false })
          .order('avg_score', { foreignTable: 'canonical_titles', ascending: false, nullsFirst: false });
      }

      return nextQuery
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });
    };

    const selectClause = `
      id,
      canonical_title_id,
      anilist_id,
      name_full,
      name_native,
      image_url,
      role,
      is_primary_protagonist,
      is_primary_heroine,
      lead_type,
      presentation_gender,
      voice_actor_name,
      voice_actor_image,
      sort_order,
      canonical_titles!inner(${CANONICAL_TITLE_BROWSE_SELECT})
    `;

    let rows = [];
    let total = 0;

    if (hasSearchQuery) {
      const CHARACTER_SEARCH_FETCH_LIMIT = 400;

      let titleQueryBuilder = supabase
        .from('canonical_titles')
        .select('id');

      titleQueryBuilder = titleQueryBuilder.eq('is_adult', Boolean(showAdult));
      if (type === 'manhwa') {
        titleQueryBuilder = titleQueryBuilder.eq('type', 'manga').eq('subtype', 'manhwa');
      } else if (type === 'manga') {
        titleQueryBuilder = titleQueryBuilder.eq('type', 'manga').neq('subtype', 'manhwa');
      } else if (type && type !== 'all') {
        titleQueryBuilder = titleQueryBuilder.eq('type', type);
      }

      titleQueryBuilder = titleQueryBuilder
        .or(`canonical_title.ilike.%${escapedQuery}%,slug.ilike.%${escapedQuery}%`)
        .limit(120);

      const [{ data: titleRows, error: titleError }, { data: localCharacterRows, error: localCharacterError }] = await Promise.all([
        titleQueryBuilder,
        applyCharacterSort(
          applyCharacterBaseFilters(
            supabase
              .from('title_characters')
              .select(selectClause)
              .or(`name_full.ilike.%${escapedQuery}%,name_native.ilike.%${escapedQuery}%,voice_actor_name.ilike.%${escapedQuery}%`)
          )
        ).range(0, CHARACTER_SEARCH_FETCH_LIMIT - 1),
      ]);

      if (titleError) {
        throw titleError;
      }
      if (localCharacterError) {
        throw localCharacterError;
      }

      const matchingTitleIds = [...new Set((titleRows || []).map((row) => Number(row.id)).filter((id) => id > 0))];
      let sourceCharacterRows = [];

      if (matchingTitleIds.length > 0) {
        const { data: sourceRows, error: sourceError } = await applyCharacterSort(
          applyCharacterBaseFilters(
            supabase
              .from('title_characters')
              .select(selectClause)
              .in('canonical_title_id', matchingTitleIds)
          )
        ).range(0, CHARACTER_SEARCH_FETCH_LIMIT - 1);

        if (sourceError) {
          throw sourceError;
        }

        sourceCharacterRows = sourceRows || [];
      }

      const mergedById = new Map();
      [...(localCharacterRows || []), ...sourceCharacterRows].forEach((row) => {
        const rowId = Number(row?.id || 0);
        if (rowId > 0 && !mergedById.has(rowId)) {
          mergedById.set(rowId, row);
        }
      });

      rows = [...mergedById.values()];
      total = rows.length;
      rows = rows.slice(from, to + 1);
    } else {
      const characterQuery = applyCharacterSort(
        applyCharacterBaseFilters(
          supabase
            .from('title_characters')
            .select(selectClause, { count: 'planned' })
        )
      ).range(from, to);

      const { data, error, count } = await characterQuery;
      if (error) {
        throw error;
      }

      rows = data || [];
      total = Number(count || 0);
    }

    const items = rows.map((row, index) => (
      buildCharacterEntity(normalizeJoinedTitleRecord(row.canonical_titles), row, from + index, {
        preferRowId: true,
      })
    ));
    const response = {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };

    storeCharacterPage(cacheKey, response);
    return response;
  })();

  characterPageRequestCache.set(cacheKey, request);

  try {
    return await request;
  } finally {
    characterPageRequestCache.delete(cacheKey);
  }
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
