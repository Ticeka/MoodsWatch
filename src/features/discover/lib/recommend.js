// MoodToon recommendation engine backed only by canonical_titles in Supabase
import { MOODS, isExplicitMood } from '@/shared/data/moods';
import {
  CANONICAL_TITLE_BROWSE_SELECT,
  CANONICAL_TITLE_DETAIL_SELECT,
  CANONICAL_TITLE_LIST_SELECT,
  mapCanonicalTitle,
} from '@/shared/lib/catalog';
import { supabase, isSupabaseConnected } from '@/shared/lib/supabase';
import { sortTitlesCollection } from '@/shared/lib/titleSorting';
import {
  buildRecommendationState,
  DEFAULT_PROFILE_PREFERENCES,
  filterTitlesByRecommendationPreferences,
} from '@/features/profile/lib/profileStore';

// Dynamic weights ตาม context ที่มี เพื่อไม่ให้ weight ที่ใช้งานไม่ได้ไป cap คะแนน
function resolveWeights(hasMoods, hasLikedTitles) {
  if (hasMoods && hasLikedTitles) {
    return { moodMatch: 0.35, genreTagMatch: 0.20, similarTitle: 0.20, lengthFit: 0.10, quality: 0.12, freshness: 0.03 };
  }
  if (hasMoods) {
    // ไม่มี liked titles: กระจาย similarTitle weight ให้ mood signals
    return { moodMatch: 0.48, genreTagMatch: 0.27, similarTitle: 0, lengthFit: 0.12, quality: 0.10, freshness: 0.03 };
  }
  if (hasLikedTitles) {
    // ไม่มี moods: กระจาย mood weight ให้ similarity + quality
    return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0.60, lengthFit: 0.10, quality: 0.25, freshness: 0.05 };
  }
  // ไม่มีทั้งคู่: rank ด้วย quality เป็นหลัก
  return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0, lengthFit: 0.15, quality: 0.60, freshness: 0.25 };
}

const CACHE_TTL_MS = 20 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_CATALOG_MAX_ROWS = 750;

let cachedTitles = null;
let cachedTitlesPromise = null;
let cacheTimestamp = 0;
let cacheError = null;
let cachedCatalogLimit = null;
const titleByIdCache = new Map();
const titleByIdsRequestCache = new Map();
const titleBySlugCache = new Map();
const titleBySlugRequestCache = new Map();

const moodGenres = {};
MOODS.forEach((mood) => {
  moodGenres[mood.id] = mood.tags || [];
});

function normalizeTitleType(title) {
  if (title.type === 'manga' && /manhwa/i.test(title.title_en || '')) {
    return { ...title, type: 'manhwa' };
  }

  return title;
}

function resolveRequestedRowLimit(maxRows) {
  if (Number.isFinite(maxRows) && maxRows > 0) {
    return Math.floor(maxRows);
  }

  return null;
}

async function fetchSupabaseTitles({ maxRows = DEFAULT_CATALOG_MAX_ROWS } = {}) {
  const rowLimit = resolveRequestedRowLimit(maxRows) ?? DEFAULT_CATALOG_MAX_ROWS;
  const step = 1000; // Supabase max per request
  let allData = [];
  let lastId = null;
  let hasMore = true;

  while (hasMore) {
    const remaining = Math.min(step, rowLimit - allData.length);
    if (remaining <= 0) break;

    let query = supabase
      .from('canonical_titles')
      .select(CANONICAL_TITLE_BROWSE_SELECT)
      .order('id', { ascending: true })
      .limit(remaining);

    if (lastId !== null) {
      query = query.gt('id', lastId);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (data?.length) {
      allData = allData.concat(data);
      lastId = data[data.length - 1].id;
      if (data.length < remaining) hasMore = false;
      if (allData.length >= rowLimit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allData.map((title) => normalizeTitleType(mapCanonicalTitle(title)));
}

function ensureSupabaseConnected() {
  if (!isSupabaseConnected()) {
    throw new Error('Supabase is not configured');
  }
}

function mapRecords(records) {
  return (records || []).map((title) => normalizeTitleType(mapCanonicalTitle(title)));
}

function storeTitlesInCaches(titles) {
  if (!titles?.length) {
    return;
  }

  titles.forEach((title) => {
    titleByIdCache.set(title.id, title);
  });

  if (cachedTitles?.length) {
    const nextTitlesById = new Map(cachedTitles.map((title) => [title.id, title]));
    titles.forEach((title) => {
      nextTitlesById.set(title.id, title);
    });
    cachedTitles = Array.from(nextTitlesById.values());
  }
}

function applyTypeFilter(query, type) {
  if (!type || type === 'all') {
    return query;
  }

  if (type === 'manhwa') {
    return query.eq('type', 'manga').eq('subtype', 'manhwa');
  }

  if (type === 'manga') {
    return query.eq('type', 'manga').neq('subtype', 'manhwa');
  }

  return query.eq('type', type);
}

function applySort(query, sortBy) {
  if (sortBy === 'score') {
    return query
      .order('avg_score', { ascending: false, nullsFirst: false })
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });
  }

  if (sortBy === 'year') {
    return query
      .order('release_year', { ascending: false, nullsFirst: false })
      .order('popularity_score', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true });
  }

  if (sortBy === 'title') {
    return query.order('canonical_title', { ascending: true }).order('id', { ascending: true });
  }

  return query
    .order('popularity_score', { ascending: false, nullsFirst: false })
    .order('avg_score', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true });
}

async function fetchTitlesPageFromSupabase({ type = 'all', query = '', tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  ensureSupabaseConnected();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let titleQuery = supabase
    .from('canonical_titles')
    .select(CANONICAL_TITLE_BROWSE_SELECT, { count: 'planned' });

  titleQuery = applyTypeFilter(titleQuery, type);

  const normalizedQuery = query.trim();
  if (normalizedQuery.length >= 2) {
    const escapedQuery = normalizedQuery.replace(/[%_,]/g, '');
    titleQuery = titleQuery.or(`canonical_title.ilike.%${escapedQuery}%,slug.ilike.%${escapedQuery}%`);
  }

  titleQuery = applySort(titleQuery, sortBy);

  const { data, error, count } = await titleQuery.range(from, to);
  if (error) throw error;

  return {
    items: mapRecords(data),
    total: count || 0,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil((count || 0) / safePageSize)),
  };
}

export async function getAllTitles({ forceRefresh = false, maxRows = DEFAULT_CATALOG_MAX_ROWS } = {}) {
  ensureSupabaseConnected();
  const requestedLimit = resolveRequestedRowLimit(maxRows);
  const cacheSatisfiesRequest = cachedTitles && (
    cachedCatalogLimit === null ||
    (requestedLimit !== null && cachedCatalogLimit >= requestedLimit)
  );

  const canUseCachedCatalog =
    !forceRefresh &&
    cacheSatisfiesRequest &&
    (Date.now() - cacheTimestamp < CACHE_TTL_MS) &&
    (requestedLimit === null || cachedTitles.length >= requestedLimit);

  if (canUseCachedCatalog) {
    return cachedTitles;
  }

  if (!forceRefresh && cachedTitlesPromise) return cachedTitlesPromise;

  cachedTitlesPromise = (async () => {
    try {
      const titles = await fetchSupabaseTitles({ maxRows });
      cachedTitles = titles;
      cachedCatalogLimit = requestedLimit;
      cacheTimestamp = Date.now();
      cacheError = null;
      storeTitlesInCaches(titles);
      return titles;
    } catch (error) {
      cacheError = error.message;
      throw error;
    } finally {
      cachedTitlesPromise = null;
    }
  })();

  return cachedTitlesPromise;
}

export function clearTitlesCache() {
  cachedTitles = null;
  cachedTitlesPromise = null;
  cacheTimestamp = 0;
  cacheError = null;
  cachedCatalogLimit = null;
  titleByIdCache.clear();
  titleByIdsRequestCache.clear();
  titleBySlugCache.clear();
  titleBySlugRequestCache.clear();
}

export function getCacheInfo() {
  return {
    source: cachedTitles ? 'supabase' : null,
    count: cachedTitles?.length || 0,
    limit: cachedCatalogLimit,
    age: cacheTimestamp ? Date.now() - cacheTimestamp : null,
    isSupabaseConfigured: isSupabaseConnected(),
    cacheError,
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
    const nameMatch =
      (title.title_en && title.title_en.toLowerCase().includes(lower)) ||
      (title.title_th && title.title_th.toLowerCase().includes(lower)) ||
      (title.title_native && title.title_native.toLowerCase().includes(lower)) ||
      (title.slug && title.slug.toLowerCase().includes(lower));

    const typeMatch = matchedType ? title.type === matchedType : false;
    const genreMatch = (title.genres || []).some((genre) => genre.toLowerCase().includes(lower));
    const tagMatch = (title.tags || []).some((tag) => tag.toLowerCase().includes(lower));

    return nameMatch || typeMatch || genreMatch || tagMatch;
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
    const genreMatch = (title.genres || []).some((genre) => genre.toLowerCase().includes(lower));
    const tagMatch = (title.tags || []).some((item) => item.toLowerCase().includes(lower));
    const moodMatch = (title.moods || []).some((item) => String(item).toLowerCase().includes(lower));

    return typeMatch || genreMatch || tagMatch || moodMatch;
  });
}

export async function listTitles({ type = 'all', query = '', tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!tag.trim()) {
    return fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize });
  }

  // tag filter requires client-side — genres/tags/moods are in separate joined tables
  const titles = await getAllTitles();
  const filtered = sortTitlesCollection(sortTitles(
    filterTitlesByQuery(
      filterTitlesByTag(filterByDisplayType(titles, type), tag),
      query
    )
  ), sortBy);
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    items: filtered.slice(start, start + safePageSize),
    total,
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalPages,
  };
}

function scoreMoodMatch(title, moods) {
  if (!moods || moods.length === 0) return 0;
  const titleMoods = title.moods || [];
  const matched = moods.filter((m) => titleMoods.includes(m)).length;
  return matched / moods.length;
}

function splitRequestedMoods(moods = []) {
  return moods.reduce((acc, moodId) => {
    if (isExplicitMood(moodId)) {
      acc.explicit.push(moodId);
    } else {
      acc.fuzzy.push(moodId);
    }

    return acc;
  }, { explicit: [], fuzzy: [] });
}

function matchesRequestedMoods(title, moods) {
  if (!moods || moods.length === 0) return true;

  const titleMoodIds = new Set(title.moods || []);
  const { explicit, fuzzy } = splitRequestedMoods(moods);

  if (explicit.some((mood) => titleMoodIds.has(mood))) {
    return true;
  }

  if (fuzzy.some((mood) => titleMoodIds.has(mood))) {
    return true;
  }

  const wantedTags = fuzzy.flatMap((mood) => moodGenres[mood] || []).map((tag) => tag.toLowerCase());
  if (wantedTags.length === 0) return false;

  const titleTags = [...(title.genres || []), ...(title.tags || [])].map((tag) => tag.toLowerCase());
  const matchCount = wantedTags.filter((tag) => titleTags.includes(tag)).length;

  // pool เล็ก (≤3 tags) ต้องตรง 1 ก็พอ, pool ใหญ่ต้องตรงอย่างน้อย 2 เพื่อลด noise
  const minMatch = wantedTags.length <= 3 ? 1 : 2;
  return matchCount >= minMatch;
}

function scoreGenreTagMatch(title, moods) {
  if (!moods || moods.length === 0) return 0;
  const titleTags = [...(title.genres || []), ...(title.tags || [])].map((t) => t.toLowerCase());
  const { fuzzy } = splitRequestedMoods(moods);

  if (fuzzy.length === 0) return 0;

  const moodScores = fuzzy.map((m) => {
    const tags = (moodGenres[m] || []).map((t) => t.toLowerCase());
    if (tags.length === 0) return 0;
    const matched = tags.filter((t) => titleTags.includes(t)).length;
    return Math.min(matched / tags.length, 1);
  });

  return moodScores.reduce((a, b) => a + b, 0) / moodScores.length;
}

function scoreLengthFit(title, timeOption) {
  if (!timeOption) return 0.5;
  const id = timeOption.id || timeOption;
  if (id === 'completed') return 0.5;

  const eps = title.episodes || title.chapters || 0;

  const ranges = {
    '20min': [0, 1],
    '30min': [1, 1],
    '1hour': [1, 3],
    tonight: [1, 13],
    short: [1, 13],
    long: [24, 9999],
    '10ch': [1, 10],
    'few-vol': [1, 50],
  };

  const durationBased = {
    '20min': title.duration ? title.duration <= 24 : null,
    '30min': title.duration ? title.duration <= 30 : null,
    '1hour': title.duration ? title.duration <= 60 : null,
  };

  const durResult = durationBased[id];
  if (durResult !== null && durResult !== undefined) {
    return durResult ? 1 : 0.3;
  }

  const [min, max] = ranges[id] || [0, 9999];
  if (eps >= min && eps <= max) return 1;
  if (eps < min) return Math.max(0, 1 - (min - eps) / min);
  return Math.max(0, 1 - (eps - max) / max);
}

function scoreQuality(title) {
  const s = Number(title.score || 0);
  const pop = Number(title.popularity || 0);
  // คะแนน < 60 ถือว่าต่ำ, 95+ คือสูงสุด
  const qualityScore = s > 0 ? Math.max(0, Math.min((s - 60) / 35, 1)) : 0.25;
  const popularityScore = pop > 0 ? Math.min(Math.log10(pop + 1) / 6, 1) : 0;
  return qualityScore * 0.6 + popularityScore * 0.4;
}

function scoreFreshness(title) {
  const year = Number(title.year || 0);
  if (!year) return 0.35;

  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - year);
  // Exponential decay: ปีล่าสุดได้ ~1.0, เก่า 10 ปีได้ ~0.43, เก่ามากแค่ไหนก็ไม่ต่ำกว่า 0.2
  return Math.max(0.2, Math.exp(-age / 12));
}

function scoreSimilarityAgainstLiked(title, liked) {
  if (!liked) return 0;

  const sharedGenres = (title.genres || []).filter((genre) => (liked.genres || []).includes(genre)).length;
  const genreScore = sharedGenres / Math.max((liked.genres || []).length, 1);

  const sharedTags = (title.tags || []).filter((tag) => (liked.tags || []).includes(tag)).length;
  const tagScore = sharedTags / Math.max((liked.tags || []).length, 1);

  const sharedMoods = (title.moods || []).filter((mood) => (liked.moods || []).includes(mood)).length;
  const moodScore = sharedMoods / Math.max((liked.moods || []).length, 1);

  const typeBonus = title.type === liked.type ? 0.05 : 0;

  return Math.min(genreScore * 0.45 + tagScore * 0.30 + moodScore * 0.20 + typeBonus, 1);
}

function scoreSimilarity(title, likedTitleIds, allTitles) {
  if (!likedTitleIds?.length) return 0;

  const similarities = likedTitleIds
    .map((likedTitleId) => {
      const liked = allTitles.find((entry) => entry.id === likedTitleId);
      return scoreSimilarityAgainstLiked(title, liked);
    })
    .filter((value) => value > 0)
    .sort((a, b) => b - a);

  if (similarities.length === 0) return 0;

  // Weighted avg: title ที่ใกล้เคียงที่สุดมีน้ำหนักมากที่สุด (1, 0.5, 0.33, ...)
  let weightedSum = 0;
  let weightTotal = 0;
  similarities.forEach((sim, i) => {
    const w = 1 / (i + 1);
    weightedSum += sim * w;
    weightTotal += w;
  });

  return weightedSum / weightTotal;
}

function resolveLikedTitleIds(likedTitleId, likedTitleIds = []) {
  return [...new Set([likedTitleId, ...(likedTitleIds || [])].map(Number).filter(Boolean))];
}

function buildReason(title, moods, timeOption, likedTitleId, allTitles) {
  const parts = [];

  if (moods?.length) {
    const matchedMoodNames = moods
      .filter((m) => (title.moods || []).includes(m))
      .map((m) => MOODS.find((mood) => mood.id === m)?.name_th)
      .filter(Boolean);
    if (matchedMoodNames.length > 0) parts.push(`ตรงกับโหมด ${matchedMoodNames.join(', ')}`);
  }

  const eps = title.episodes || title.chapters || 0;
  if (eps > 0 && eps <= 13) parts.push(`เรื่องสั้น ${eps} ตอน/ตอนอ่าน`);

  if (likedTitleId) {
    const liked = allTitles.find((t) => t.id === likedTitleId);
    if (liked) {
      const sharedGenres = (title.genres || []).filter((genre) => (liked.genres || []).includes(genre));
      if (sharedGenres.length) parts.push(`คล้าย ${liked.title_en || liked.title_th} ด้าน ${sharedGenres.join(', ')}`);
    }
  }

  if (title.status === 'completed') parts.push('จบแล้ว');
  if (title.score >= 85) parts.push(`คะแนนสูง ${title.score}/100`);

  return parts.join(' | ') || null;
}

function buildDebugBreakdown(title, moods, timeOption, resolvedLikedTitleIds, allTitles, recommendationState, weights) {
  const moodScore = scoreMoodMatch(title, moods);
  const genreScore = scoreGenreTagMatch(title, moods);
  const lengthScore = scoreLengthFit(title, timeOption);
  const qualityScore = scoreQuality(title);
  const simScore = scoreSimilarity(title, resolvedLikedTitleIds, allTitles);
  const freshnessScore = scoreFreshness(title);
  const matchedMoods = (moods || []).filter((mood) => (title.moods || []).includes(mood));
  const primaryLikedTitleId = resolvedLikedTitleIds[0] || null;
  const likedTitle = primaryLikedTitleId
    ? allTitles.find((entry) => entry.id === primaryLikedTitleId) || null
    : null;
  const sharedGenres = likedTitle
    ? (title.genres || []).filter((genre) => (likedTitle.genres || []).includes(genre))
    : [];
  const sharedTags = likedTitle
    ? (title.tags || []).filter((tag) => (likedTitle.tags || []).includes(tag))
    : [];

  return {
    total:
      weights.moodMatch * moodScore +
      weights.genreTagMatch * genreScore +
      weights.lengthFit * lengthScore +
      weights.quality * qualityScore +
      weights.similarTitle * simScore +
      weights.freshness * freshnessScore,
    scores: {
      moodMatch: moodScore,
      genreTagMatch: genreScore,
      lengthFit: lengthScore,
      quality: qualityScore,
      similarTitle: simScore,
      freshness: freshnessScore,
    },
    weights,
    matchedMoods,
    sharedGenres,
    sharedTags,
    progressState: recommendationState.statusByTitleId.get(title.id) || 'untracked',
    isTracked: recommendationState.trackedTitleIds.has(title.id),
    isExcluded: recommendationState.excludedTitleIds.has(title.id),
  };
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
} = {}) {
  const allTitles = await getAllTitles({ maxRows: DEFAULT_CATALOG_MAX_ROWS });
  const recommendationState = buildRecommendationState(watchlist, preferences, hiddenTitleIds);
  const resolvedLikedTitleIds = resolveLikedTitleIds(likedTitleId, likedTitleIds);

  let pool = [...allTitles];

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

  if (moods.length > 0) {
    pool = pool.filter((title) => matchesRequestedMoods(title, moods));
  }

  const timeId = timeOption?.id || timeOption;
  if (timeId === 'completed') {
    pool = pool.filter((title) => title.status === 'completed');
  } else if (timeId === 'ongoing') {
    pool = pool.filter((title) => title.status !== 'completed');
  }

  const weights = resolveWeights(moods.length > 0, resolvedLikedTitleIds.length > 0);

  const scored = pool.map((title) => {
    const breakdown = buildDebugBreakdown(
      title,
      moods,
      timeOption,
      resolvedLikedTitleIds,
      allTitles,
      recommendationState,
      weights
    );

    return {
      ...title,
      _score: breakdown.total,
      _reason: buildReason(title, moods, timeOption, resolvedLikedTitleIds[0] || null, allTitles),
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
  const { type = 'all', page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;
  return listTitles({ type, query, page, pageSize });
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
    const { data, error } = await supabase
      .from('canonical_titles')
      .select(CANONICAL_TITLE_DETAIL_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;

    const mapped = data ? normalizeTitleType(mapCanonicalTitle(data)) : null;
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

export async function getSimilarTitles(titleId, limit = 6, options = {}) {
  const titles = await getAllTitles({ maxRows: DEFAULT_CATALOG_MAX_ROWS });
  const base = titles.find((title) => title.id === titleId);
  if (!base) return [];
  return recommend({ likedTitleId: titleId, limit, ...options });
}

export async function getTrendingTitles(limit = 8) {
  const response = await fetchTitlesPageFromSupabase({ page: 1, pageSize: limit });
  return response.items;
}

export async function getTitlesByIds(ids) {
  if (!ids?.length) return [];

  const normalizedIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return [];
  }

  const cachedMatches = normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean);
  if (cachedMatches.length === normalizedIds.length) {
    const idMap = new Map(cachedMatches.map((title) => [title.id, title]));
    return normalizedIds.map((id) => idMap.get(id)).filter(Boolean);
  }

  const missingIds = normalizedIds.filter((id) => !titleByIdCache.has(id));
  const requestKey = missingIds.slice().sort((a, b) => a - b).join(',');

  ensureSupabaseConnected();

  if (!titleByIdsRequestCache.has(requestKey)) {
    const request = (async () => {
      const { data, error } = await supabase
        .from('canonical_titles')
        .select(CANONICAL_TITLE_BROWSE_SELECT)
        .in('id', missingIds);

      if (error) throw error;

      const mapped = mapRecords(data);
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

  return normalizedIds.map((id) => titleByIdCache.get(id)).filter(Boolean);
}
