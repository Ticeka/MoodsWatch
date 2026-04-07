// MoodsWatch recommendation engine backed only by canonical_titles in Supabase
import {
  fetchDiscoverSearchResults,
  fetchDiscoverSimilarCandidates,
  fetchDiscoverTitleById,
} from '../api/discoverCatalogApi.js';
import {
  attachCharactersToTitles as attachCharactersToTitlesApi,
  clearTitlesCache as clearTitlesCacheApi,
  fetchTitleCharacters as fetchTitleCharactersApi,
  fetchTitlesPageFromSupabase,
  getAllTitles as getAllTitlesApi,
  getCachedTitlesSnapshot as getCachedTitlesSnapshotApi,
  getCacheInfo as getCacheInfoApi,
  getCharactersPage as getCharactersPageApi,
  getTitleBySlug as getTitleBySlugApi,
  getTitlePreviewByIds as getTitlePreviewByIdsApi,
  getTitlesByIds as getTitlesByIdsApi,
  getTitlesPage as getTitlesPageApi,
  getTrendingTitles as getTrendingTitlesApi,
  isCatalogCacheWarm as isCatalogCacheWarmApi,
} from '../api/discoverTitleCatalogApi.js';
import {
  buildReason,
  buildRecommendationBreakdown,
  buildTitleSearchCandidates,
  collapseTitlesByFranchise,
  filterTitlesForRecommendationPool,
  resolveWeights,
  scoreFreshness,
  scoreQuality,
  scoreSimilarityAgainstLiked,
} from './recommendationEngine.js';
import { sortTitlesCollection } from '@/shared/lib/titleSorting';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import {
  buildRecommendationState,
  DEFAULT_PROFILE_PREFERENCES,
  filterTitlesByRecommendationPreferences,
} from '@/features/profile/lib/profileStore';
import { getSearchIntent, sortBySearchRelevance, textMatchesQuery } from '@/features/discover/lib/searchMatch';

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CATALOG_MAX_ROWS = null;

// Fast DB-side search for autocomplete when the catalog cache is cold.
// Uses the lightweight SEARCH_SELECT (no trailers/banner/tags) and pushes
// filtering to PostgreSQL so the first search doesn't block on a full
// catalog download.
async function fetchSearchResultsFromDB({ query = '', type = 'all', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = false } = {}) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const chunkSize = Math.max(120, safePageSize * 4);
  const allRecords = await fetchDiscoverSearchResults({ query, type, chunkSize, showAdult });

  const dedupedItems = collapseTitlesByFranchise(allRecords);
  const start = (safePage - 1) * safePageSize;

  return {
    items: dedupedItems.slice(start, start + safePageSize),
    total: dedupedItems.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(dedupedItems.length / safePageSize)),
  };
}


function sortTitles(titles) {
  return [...titles].sort((a, b) => {
    const popularityDiff = (b.popularity || 0) - (a.popularity || 0);
    if (popularityDiff !== 0) return popularityDiff;

    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;

    return String(a.title_en || '').localeCompare(String(b.title_en || ''));
  });
}

function filterByDisplayType(titles, type) {
  if (!type || type === 'all') return titles;
  return titles.filter((title) => title.type === type);
}

function filterTitlesByQuery(titles, query) {
  if (!query || query.trim().length < 2) return titles;

  const lower = query.toLowerCase().trim();
  const intent = getSearchIntent(lower);
  const typeKeywords = {
    manhwa: 'manhwa',
    'มันฮวา': 'manhwa',
    manga: 'manga',
    'มังงะ': 'manga',
    anime: 'anime',
    'อนิเมะ': 'anime',
  };
  const matchedType = typeKeywords[lower];

  return titles.filter((title) => {
    const typeMatch = matchedType ? title.type === matchedType : false;
    const titleMatch = [
      title.title_en,
      title.title_th,
      title.title_romaji,
      title.title_native,
      title.slug,
      ...(title.aliases || []),
    ].some((value) => textMatchesQuery(value, query, { allowTypo: true }));
    const genreMatch = (title.genres || []).some((genre) => textMatchesQuery(genre, query));
    const tagMatch = (title.tags || []).some((tag) => textMatchesQuery(tag, query));
    const moodMatch = (title.moods || []).some((mood) => textMatchesQuery(mood, query));
    const synopsisMatch = !intent.isBroad && textMatchesQuery(title.synopsis, query);

    return titleMatch || typeMatch || genreMatch || tagMatch || moodMatch || synopsisMatch;
  });
}

function filterTitlesByTag(titles, tag) {
  if (!tag || !tag.trim()) return titles;

  const lower = tag.toLowerCase().trim();
  const typeKeywords = {
    manhwa: 'manhwa',
    'มันฮวา': 'manhwa',
    manga: 'manga',
    'มังงะ': 'manga',
    anime: 'anime',
    'อนิเมะ': 'anime',
  };
  const matchedType = typeKeywords[lower];

  return titles.filter((title) => {
    const typeMatch = matchedType ? title.type === matchedType : false;
    const genreMatch = (title.genres || []).some((genre) => textMatchesQuery(genre, lower));
    const tagMatch = (title.tags || []).some((item) => textMatchesQuery(item, lower));
    const moodMatch = (title.moods || []).some((item) => textMatchesQuery(item, lower));

    return typeMatch || genreMatch || tagMatch || moodMatch;
  });
}

export async function listTitles({ type = 'all', query = '', tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = {}) {
  const normalizedQuery = query.trim();
  const shouldUseCatalogSearch = tag.trim() || normalizedQuery.length >= 2;

  if (!shouldUseCatalogSearch) {
    return fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize, showAdult });
  }

  // Fast path: when the catalog cache is cold and we only have a text query
  // (no tag filter), keep the search DB-side. Do not kick off a background
  // full-catalog download from a simple query.
  if (!isCatalogCacheWarmApi() && !tag.trim() && normalizedQuery.length >= 2) {
    return fetchSearchResultsFromDB({ query: normalizedQuery, type, page, pageSize, showAdult });
  }

  // Rich path: client-side matching with genres/tags/moods (requires cached catalog)
  let titles = await getAllTitlesApi();
  titles = filterTitlesForAgeGate(titles, showAdult);
  const filtered = sortTitlesCollection(sortTitles(
    filterTitlesByQuery(
      filterTitlesByTag(filterByDisplayType(titles, type), tag),
      normalizedQuery
    )
  ), sortBy);
  const searchIntent = getSearchIntent(normalizedQuery);
  const ranked = normalizedQuery.length >= 2
    ? sortBySearchRelevance(filtered, normalizedQuery, (title) => buildTitleSearchCandidates(title, searchIntent), (left, right) => (
      Number(right.popularity || 0) - Number(left.popularity || 0)
    ))
    : filtered;
  const collapsedRanked = normalizedQuery.length >= 2
    ? collapseTitlesByFranchise(ranked)
    : ranked;
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const total = collapsedRanked.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    items: collapsedRanked.slice(start, start + safePageSize),
    total,
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalPages,
  };
}

function resolveLikedTitleIds(likedTitleId, likedTitleIds = []) {
  return [...new Set([likedTitleId, ...(likedTitleIds || [])].map(Number).filter(Boolean))];
}

export async function recommend({
  type = 'all',
  moods = [],
  timeOption = null,
  likedTitleId = null,
  likedTitleIds = [],
  limit = null,
  watchlist = [],
  preferences = DEFAULT_PROFILE_PREFERENCES,
  hiddenTitleIds = [],
  debug = false,
  showAdult = true,
} = {}) {
  const allTitles = await getAllTitlesApi({ maxRows: DEFAULT_CATALOG_MAX_ROWS });
  const recommendationState = buildRecommendationState(watchlist, preferences, hiddenTitleIds);
  const resolvedLikedTitleIds = resolveLikedTitleIds(likedTitleId, likedTitleIds);

  let pool = [...allTitles];
  pool = filterTitlesForAgeGate(pool, showAdult);

  if (type && type !== 'all') {
    pool = pool.filter((title) => title.type === type);
  }

  if (resolvedLikedTitleIds.length > 0) {
    pool = pool.filter((title) => !resolvedLikedTitleIds.includes(title.id));
  }

  if (recommendationState.excludedTitleIds.size > 0) {
    pool = pool.filter((title) => !recommendationState.excludedTitleIds.has(title.id));
  }

  if (recommendationState.hiddenTitleIds.size > 0) {
    pool = pool.filter((title) => !recommendationState.hiddenTitleIds.has(title.id));
  }

  pool = filterTitlesByRecommendationPreferences(pool, recommendationState);

  pool = filterTitlesForRecommendationPool(pool, moods, timeOption);

  const weights = resolveWeights(moods.length > 0, resolvedLikedTitleIds.length > 0);

  // Pre-resolve liked titles once — avoids O(pool × liked × allTitles) find() inside the map
  const allTitlesMap = new Map(allTitles.map((t) => [t.id, t]));
  const likedTitles = resolvedLikedTitleIds.map((id) => allTitlesMap.get(id)).filter(Boolean);
  const primaryLikedTitle = likedTitles[0] || null;

  const scored = pool.map((title) => {
    const breakdown = buildRecommendationBreakdown(
      title,
      moods,
      timeOption,
      likedTitles,
      primaryLikedTitle,
      recommendationState,
      weights
    );

    return {
      ...title,
      _score: breakdown.total,
      _reason: buildReason(title, moods, primaryLikedTitle),
      ...(debug ? { _debug: breakdown } : {}),
    };
  });

  scored.sort((a, b) => {
    if (recommendationState.preferences.prioritizeUnseen) {
      const aTracked = recommendationState.trackedTitleIds.has(a.id) ? 1 : 0;
      const bTracked = recommendationState.trackedTitleIds.has(b.id) ? 1 : 0;
      if (aTracked !== bTracked) {
        return aTracked - bTracked;
      }
    }

    return b._score - a._score;
  });
  if (typeof limit === 'number') {
    return scored.slice(0, limit);
  }
  return scored;
}

export async function searchTitles(query, options = {}) {
  const { type = 'all', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = options;
  return listTitles({ type, query, page, pageSize, showAdult });
}

async function fetchSimilarCandidates(baseTitleId, { genres = [], tags = [], moods = [], showAdult = true, maxCandidates = 150 } = {}) {
  if (genres.length === 0 && tags.length === 0 && moods.length === 0) return [];
  return fetchDiscoverSimilarCandidates(baseTitleId, { genres, tags, moods, showAdult, maxCandidates });
}

function scoreAndRankSimilar(candidates, baseTitle, limit, { showAdult = true, watchlist = [], preferences = DEFAULT_PROFILE_PREFERENCES, hiddenTitleIds = [] } = {}) {
  const recommendationState = buildRecommendationState(watchlist, preferences, hiddenTitleIds);
  const weights = resolveWeights(false, true);

  let pool = filterTitlesForAgeGate(candidates, showAdult);
  pool = pool.filter((t) => t.id !== baseTitle.id);
  if (recommendationState.excludedTitleIds.size > 0) {
    pool = pool.filter((t) => !recommendationState.excludedTitleIds.has(t.id));
  }
  if (recommendationState.hiddenTitleIds.size > 0) {
    pool = pool.filter((t) => !recommendationState.hiddenTitleIds.has(t.id));
  }
  pool = filterTitlesByRecommendationPreferences(pool, recommendationState);

  const scored = pool.map((title) => {
    const simScore = scoreSimilarityAgainstLiked(title, baseTitle);
    const qualityScore = scoreQuality(title);
    const freshnessScore = scoreFreshness(title);
    const sharedGenres = (title.genres || []).filter((g) => (baseTitle.genres || []).includes(g));
    return {
      ...title,
      _score: weights.similarTitle * simScore + weights.quality * qualityScore + weights.freshness * freshnessScore,
      _reason: sharedGenres.length
        ? `คล้าย ${baseTitle.title_en || baseTitle.title_th} ด้าน ${sharedGenres.join(', ')}`
        : null,
    };
  });

  scored.sort((a, b) => {
    if (recommendationState.preferences.prioritizeUnseen) {
      const aTracked = recommendationState.trackedTitleIds.has(a.id) ? 1 : 0;
      const bTracked = recommendationState.trackedTitleIds.has(b.id) ? 1 : 0;
      if (aTracked !== bTracked) return aTracked - bTracked;
    }
    return b._score - a._score;
  });

  return scored.slice(0, limit);
}

export async function getSimilarTitles(titleId, limit = 6, options = {}) {
  const { showAdult = true, baseTitleData = null, watchlist = [], preferences = DEFAULT_PROFILE_PREFERENCES, hiddenTitleIds = [] } = options;

  // Use passed-in base title data, or hydrate one title through the catalog API.
  let base = baseTitleData || (await getTitlesByIdsApi([titleId], { showAdult: true }))[0] || null;
  if (!base) {
    base = await fetchDiscoverTitleById(titleId);
    if (!base) return [];
  }

  const candidates = await fetchSimilarCandidates(titleId, {
    genres: base.genres || [],
    tags: base.tags || [],
    moods: base.moods || [],
    showAdult,
    maxCandidates: 150,
  });

  if (candidates.length === 0) return [];

  return scoreAndRankSimilar(candidates, base, limit, { showAdult, watchlist, preferences, hiddenTitleIds });
}

export const getAllTitles = getAllTitlesApi;
export const clearTitlesCache = clearTitlesCacheApi;
export const isCatalogCacheWarm = isCatalogCacheWarmApi;
export const getCachedTitlesSnapshot = getCachedTitlesSnapshotApi;
export const getCacheInfo = getCacheInfoApi;
export { buildTitleSearchCandidates, collapseTitlesByFranchise, matchesMoodSelection } from './recommendationEngine.js';
export const fetchTitleCharacters = fetchTitleCharactersApi;
export const attachCharactersToTitles = attachCharactersToTitlesApi;
export const getTitleBySlug = getTitleBySlugApi;
export const getTrendingTitles = getTrendingTitlesApi;
export const getTitlesPage = getTitlesPageApi;
export const getCharactersPage = getCharactersPageApi;
export const getTitlesByIds = getTitlesByIdsApi;
export const getTitlePreviewByIds = getTitlePreviewByIdsApi;
