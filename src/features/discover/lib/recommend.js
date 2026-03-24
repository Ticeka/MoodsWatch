// MoodsWatch recommendation engine backed only by canonical_titles in Supabase
import { MOODS, isExplicitMood } from '@/shared/data/moods';
import {
  CANONICAL_TITLE_BROWSE_SELECT,
  CANONICAL_TITLE_DETAIL_SELECT,
  CANONICAL_TITLE_LIST_SELECT,
  mapCanonicalTitle,
} from '@/shared/lib/catalog';
import { supabase, isSupabaseConnected } from '@/shared/lib/supabase';
import { sortTitlesCollection } from '@/shared/lib/titleSorting';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import {
  buildRecommendationState,
  DEFAULT_PROFILE_PREFERENCES,
  filterTitlesByRecommendationPreferences,
} from '@/features/profile/lib/profileStore';
import { getSearchIntent, sortBySearchRelevance, textMatchesQuery } from '@/features/discover/lib/searchMatch';
import { buildCharacterCatalog } from '@/shared/lib/catalogEntities';

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
const DEFAULT_CATALOG_MAX_ROWS = null;
const SUPABASE_BATCH_SIZE = 1000;
const TITLE_CHARACTER_ID_CHUNK_SIZE = 200;
const TITLE_CHARACTER_SELECT = `
  id,
  canonical_title_id,
  anilist_id,
  name_full,
  name_native,
  image_url,
  role,
  voice_actor_name,
  voice_actor_image,
  sort_order
`;

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

const moodGenres = {};
MOODS.forEach((mood) => {
  moodGenres[mood.id] = mood.tags || [];
});

const EXPLICIT_MOOD_FALLBACKS = {
  'adult-ecchi': {
    tagKeywords: ['erotica', 'ecchi', 'fanservice', 'adult', 'mature'],
    textKeywords: ['erotic', 'naughty', 'sensual', 'one-night', 'heat', 'teasing', 'playful'],
  },
  'adult-flirty': {
    tagKeywords: ['romance', 'adult', 'mature', 'ecchi'],
    textKeywords: ['seductive', 'temptation', 'attraction', 'chemistry', 'desire', 'flirty', 'teasing', 'sensual'],
  },
  'adult-harem': {
    tagKeywords: ['harem', 'reverse harem'],
    textKeywords: ['harem', 'reverse harem', 'multiple lovers', 'many men', 'many women'],
  },
  'adult-romance': {
    tagKeywords: ['drama', 'romance', 'historical', 'reverse harem'],
    textKeywords: ['love', 'romance', 'romantic', 'marriage', 'married', 'wedding', 'bride', 'groom', 'husband', 'wife', 'dating', 'kiss', 'affair'],
  },
  'adult-forbidden': {
    tagKeywords: ['romance', 'drama', 'mature', 'adult'],
    textKeywords: ['forbidden', 'secret relationship', 'affair', 'scandal', 'cheat', 'cheating', 'taboo', 'hidden love'],
  },
  'adult-power-play': {
    tagKeywords: ['drama', 'romance', 'mature', 'adult'],
    textKeywords: ['ceo', 'boss', 'secretary', 'contract marriage', 'deal', 'power', 'dominant', 'workplace'],
  },
  'adult-obsession': {
    tagKeywords: ['psychological', 'romance', 'mature'],
    textKeywords: ['obsession', 'obsessed', 'possessive', 'fixated', 'clingy', 'stalker', "can't let go"],
  },
  'adult-dark': {
    tagKeywords: ['psychological', 'drama', 'thriller', 'horror'],
    textKeywords: ['revenge', 'curse', 'cursed', 'murder', 'kill', 'killer', 'obsession', 'obsessed', 'abuse', 'violent', 'violence', 'dark', 'secret', 'midnight', 'blood', 'blackmail', 'prison', 'trauma'],
  },
};

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

async function fetchSupabaseTitles({
  maxRows = DEFAULT_CATALOG_MAX_ROWS,
  select = CANONICAL_TITLE_BROWSE_SELECT,
} = {}) {
  const rowLimit = resolveRequestedRowLimit(maxRows);
  let allData = [];
  let lastId = null;
  let hasMore = true;

  while (hasMore) {
    const remaining = rowLimit === null ? SUPABASE_BATCH_SIZE : Math.min(SUPABASE_BATCH_SIZE, rowLimit - allData.length);
    if (rowLimit !== null && remaining <= 0) break;

    let query = supabase
      .from('canonical_titles')
      .select(select)
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
      if (rowLimit !== null && allData.length >= rowLimit) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  return allData.map((title) => normalizeTitleType(mapCanonicalTitle(title)));
}

function chunkIds(ids = [], chunkSize = TITLE_CHARACTER_ID_CHUNK_SIZE) {
  const chunks = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }

  return chunks;
}

async function fetchTitleCharacters(titleIds = []) {
  const normalizedTitleIds = [...new Set(
    (Array.isArray(titleIds) ? titleIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];

  if (Array.isArray(titleIds) && titleIds.length > 0 && normalizedTitleIds.length === 0) {
    return [];
  }

  const idChunks = normalizedTitleIds.length > 0
    ? chunkIds(normalizedTitleIds)
    : [null];
  const allCharacters = [];

  for (const titleIdChunk of idChunks) {
    let lastRowId = null;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('title_characters')
        .select(TITLE_CHARACTER_SELECT)
        .order('id', { ascending: true })
        .limit(SUPABASE_BATCH_SIZE);

      if (titleIdChunk) {
        query = query.in('canonical_title_id', titleIdChunk);
      }

      if (lastRowId !== null) {
        query = query.gt('id', lastRowId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data?.length) {
        allCharacters.push(...data);
        lastRowId = data[data.length - 1].id;
        hasMore = data.length === SUPABASE_BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  return allCharacters;
}

function attachCharactersToTitles(titles = [], characterRows = []) {
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

function mapRecords(records) {
  return (records || []).map((title) => normalizeTitleType(mapCanonicalTitle(title)));
}

function getTitleSignalBag(title = {}) {
  const tags = [...(title.genres || []), ...(title.tags || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const text = [
    title.title_en,
    title.title_th,
    title.title_romaji,
    title.title_native,
    title.synopsis,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  return { tags, text };
}

function matchesExplicitMoodFallback(title, moodId) {
  if (!title?.is_adult) {
    return false;
  }

  if ((title.moods || []).includes(moodId)) {
    return true;
  }

  const fallback = EXPLICIT_MOOD_FALLBACKS[moodId];
  if (!fallback) {
    return false;
  }

  const { tags, text } = getTitleSignalBag(title);
  const hasTagMatch = fallback.tagKeywords.some((keyword) => tags.includes(keyword));
  const hasTextMatch = fallback.textKeywords.some((keyword) => text.includes(keyword));

  if (moodId === 'adult-ecchi') {
    return hasTagMatch || hasTextMatch;
  }

  return hasTagMatch || hasTextMatch;
}

export function matchesMoodSelection(title, moodId) {
  if (!moodId) {
    return false;
  }

  return isExplicitMood(moodId)
    ? matchesExplicitMoodFallback(title, moodId)
    : (title?.moods || []).includes(moodId);
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

async function fetchTitlesPageFromSupabase({ type = 'all', query = '', tag: _tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = {}) {
  ensureSupabaseConnected();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let titleQuery = supabase
    .from('canonical_titles')
    .select(CANONICAL_TITLE_BROWSE_SELECT, { count: 'planned' });

  titleQuery = applyTypeFilter(titleQuery, type);

  if (showAdult) {
    titleQuery = titleQuery.eq('is_adult', true);
  } else {
    titleQuery = titleQuery.eq('is_adult', false);
  }

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

export function buildTitleSearchCandidates(title, intent = getSearchIntent('')) {
  return [
    {
      weight: 5.3,
      texts: [title.title_en, title.title_th, title.title_native],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 328,
        prefixPhrase: 202,
        containsPhrase: 112,
        exactToken: 102,
        wordBoundary: 66,
        prefixToken: 44,
        containsToken: 18,
        typoToken: 18,
      },
    },
    {
      weight: 4.8,
      texts: [title.title_romaji, ...(title.aliases || [])],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 304,
        prefixPhrase: 188,
        containsPhrase: 104,
        exactToken: 94,
        wordBoundary: 60,
        prefixToken: 40,
        containsToken: 16,
        typoToken: 16,
      },
    },
    {
      weight: 4.6,
      texts: [title.slug],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 292,
        prefixPhrase: 184,
        containsPhrase: 98,
        exactToken: 94,
        wordBoundary: 58,
        prefixToken: 38,
        containsToken: 16,
        typoToken: 16,
      },
    },
    {
      weight: intent.isBroad ? 1.9 : 1.3,
      texts: [title.type, title.subtype, title.format],
      matchWeights: {
        exactPhrase: 204,
        prefixPhrase: 132,
        containsPhrase: 74,
        exactToken: 58,
        wordBoundary: 36,
        prefixToken: 22,
        containsToken: 10,
      },
    },
    {
      weight: intent.isBroad ? 2.8 : 1.8,
      texts: title.genres || [],
      matchWeights: {
        exactPhrase: 224,
        prefixPhrase: 138,
        containsPhrase: 80,
        exactToken: 66,
        wordBoundary: 44,
        prefixToken: 24,
        containsToken: 12,
      },
    },
    {
      weight: intent.isBroad ? 2.5 : 1.5,
      texts: title.tags || [],
      matchWeights: {
        exactPhrase: 214,
        prefixPhrase: 132,
        containsPhrase: 76,
        exactToken: 62,
        wordBoundary: 40,
        prefixToken: 22,
        containsToken: 10,
      },
    },
    {
      weight: intent.isBroad ? 2.2 : 1.35,
      texts: title.moods || [],
      matchWeights: {
        exactPhrase: 196,
        prefixPhrase: 124,
        containsPhrase: 72,
        exactToken: 58,
        wordBoundary: 36,
        prefixToken: 20,
        containsToken: 10,
      },
    },
    {
      weight: 0.55,
      texts: [title.synopsis],
      longTextPenalty: {
        threshold: 96,
        floor: 0.22,
      },
      matchWeights: {
        containsPhrase: 54,
        exactToken: 40,
        wordBoundary: 24,
        prefixToken: 14,
        containsToken: 7,
      },
    },
  ];
}

export async function listTitles({ type = 'all', query = '', tag = '', sortBy = 'popularity', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = {}) {
  const normalizedQuery = query.trim();
  const shouldUseCatalogSearch = tag.trim() || normalizedQuery.length >= 2;

  if (!shouldUseCatalogSearch) {
    return fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize, showAdult });
  }

  // Query/tag discovery requires client-side matching because genres/tags/moods are joined data.
  let titles = await getAllTitles();
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
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const start = (safePage - 1) * safePageSize;

  return {
    items: ranked.slice(start, start + safePageSize),
    total,
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalPages,
  };
}

function scoreMoodMatch(title, moods) {
  if (!moods || moods.length === 0) return 0;
  const matched = moods.filter((moodId) => matchesMoodSelection(title, moodId)).length;
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

  if (explicit.some((mood) => matchesMoodSelection(title, mood))) {
    return true;
  }

  if (fuzzy.some((mood) => titleMoodIds.has(mood) || matchesMoodSelection(title, mood))) {
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
      .filter((m) => matchesMoodSelection(title, m))
      .map((m) => MOODS.find((mood) => mood.id === m)?.name_th)
      .filter(Boolean);
    if (matchedMoodNames.length > 0) parts.push(`ตรงกับโทนเรื่อง ${matchedMoodNames.join(', ')}`);
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
  const matchedMoods = (moods || []).filter((mood) => matchesMoodSelection(title, mood));
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
  showAdult = true,
} = {}) {
  const allTitles = await getAllTitles({ maxRows: DEFAULT_CATALOG_MAX_ROWS });
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
  const { type = 'all', page = 1, pageSize = DEFAULT_PAGE_SIZE, showAdult = true } = options;
  return listTitles({ type, query, page, pageSize, showAdult });
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

async function fetchSimilarCandidates(baseTitleId, { genres = [], tags = [], moods = [], showAdult = true, maxCandidates = 150 } = {}) {
  if (genres.length === 0 && tags.length === 0 && moods.length === 0) return [];

  const [genreRows, tagRows, moodRows] = await Promise.all([
    genres.length > 0
      ? supabase.from('title_genres').select('canonical_title_id').in('genre_name', genres).neq('canonical_title_id', baseTitleId)
      : { data: [] },
    tags.length > 0
      ? supabase.from('title_tags').select('canonical_title_id').in('tag_name', tags.slice(0, 20)).neq('canonical_title_id', baseTitleId)
      : { data: [] },
    moods.length > 0
      ? supabase.from('title_moods').select('canonical_title_id').in('mood_id', moods).neq('canonical_title_id', baseTitleId)
      : { data: [] },
  ]);

  const idSet = new Set([
    ...(genreRows.data || []).map((r) => r.canonical_title_id),
    ...(tagRows.data || []).map((r) => r.canonical_title_id),
    ...(moodRows.data || []).map((r) => r.canonical_title_id),
  ]);

  const candidateIds = [...idSet].slice(0, maxCandidates);
  if (candidateIds.length === 0) return [];

  const allFetched = [];
  for (const chunk of chunkIds(candidateIds, 200)) {
    let query = supabase.from('canonical_titles').select(CANONICAL_TITLE_BROWSE_SELECT).in('id', chunk);
    if (!showAdult) query = query.eq('is_adult', false);
    const { data, error } = await query;
    if (error) throw error;
    if (data) allFetched.push(...data.map((t) => normalizeTitleType(mapCanonicalTitle(t))));
  }
  return allFetched;
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

  // Use passed-in base title data, or look up from ID cache, or fetch individually
  let base = baseTitleData || titleByIdCache.get(titleId);
  if (!base) {
    const { data } = await supabase.from('canonical_titles').select(CANONICAL_TITLE_BROWSE_SELECT).eq('id', titleId).maybeSingle();
    if (!data) return [];
    base = normalizeTitleType(mapCanonicalTitle(data));
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

export async function getTrendingTitles(limit = 8, { showAdult = true } = {}) {
  const response = await fetchTitlesPageFromSupabase({ page: 1, pageSize: limit, showAdult });
  return response.items;
}

export async function getTitlesPage({ type = 'all', query = '', sortBy = 'popularity', page = 1, pageSize = 30, showAdult = true } = {}) {
  return fetchTitlesPageFromSupabase({ type, query, sortBy, page, pageSize, showAdult });
}

export async function getCharactersPage({ type = 'all', query = '', page = 1, pageSize = 30, showAdult = true } = {}) {
  const result = await fetchTitlesPageFromSupabase({ type, query, page, pageSize, showAdult });
  const titleIds = result.items.map((t) => t.id);
  const characters = await fetchTitleCharacters(titleIds);
  const titlesWithChars = attachCharactersToTitles(result.items, characters);
  return {
    items: buildCharacterCatalog(titlesWithChars),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
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
