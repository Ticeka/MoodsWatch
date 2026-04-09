// Battle Catalog — server-side data layer for BattleBuilderPage
// Replaces full getAllTitles() and full title_theme_songs fetch.
//
// Public API:
//   fetchBattleTitlesPage(params)      → { rows: Title[], total: number }
//   fetchBattleThemeSongsPage(params)  → { rows: ThemeSongEntity[], total: number }
//   hydrateBattleEntriesByIds(ids, entityType) → Title[]|ThemeSongEntity[]

import { supabase } from '@/shared/lib/supabase';
import { mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  buildCharacterEntity,
  buildThemeSongEntity,
  buildTrailerEntity,
} from '@/shared/lib/catalogEntities';

const DEFAULT_PAGE_SIZE = 24;
const BATTLE_CATALOG_CACHE_TTL_MS = 60 * 1000;
const EMPTY_FILTER_OPTIONS = {
  genres: [],
  tags: [],
  moods: [],
  trailerProviders: [],
};
const battleCatalogCache = new Map();
const battleCatalogRequestCache = new Map();

function normalizeNumericIdList(ids = []) {
  return [...new Set((ids || []).map(Number).filter(Boolean))];
}

function normalizeTextList(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function getCacheKey(prefix, params = {}) {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getCachedValue(cacheKey) {
  const cached = battleCatalogCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp >= BATTLE_CATALOG_CACHE_TTL_MS) {
    battleCatalogCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

async function withCatalogCache(cacheKey, loader) {
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  if (battleCatalogRequestCache.has(cacheKey)) {
    return battleCatalogRequestCache.get(cacheKey);
  }

  const request = (async () => {
    const value = await loader();
    battleCatalogCache.set(cacheKey, {
      timestamp: Date.now(),
      value,
    });
    return value;
  })();

  battleCatalogRequestCache.set(cacheKey, request);

  try {
    return await request;
  } finally {
    battleCatalogRequestCache.delete(cacheKey);
  }
}

// ---------------------------------------------------------------------------
// fetchBattleTitlesPage
// ---------------------------------------------------------------------------
// params: {
//   type           string  'all'|'anime'|'manga'|'manhwa'
//   tag            string  genre or tag name  ('' = no filter)
//   mood           string  mood_id            ('' = no filter)
//   query          string  text search        ('' = no filter)
//   trailerState   string  'all'|'has'|'none'
//   trailerProvider string 'all'|'youtube'|…
//   showAdult      boolean
//   page           number  0-based
//   pageSize       number  default 24
// }
// returns: { rows: mapped title objects, total: number }
export async function fetchBattleTitlesPage({
  type = 'all',
  tag = '',
  mood = '',
  query = '',
  trailerState = 'all',
  trailerProvider = 'all',
  showAdult = false,
  hiddenTitleIds = [],
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  return withCatalogCache(getCacheKey('battle-titles', {
    type,
    tag,
    mood,
    query,
    trailerState,
    trailerProvider,
    showAdult,
    hiddenTitleIds: normalizeNumericIdList(hiddenTitleIds),
    page: Math.max(0, page),
    pageSize: Math.max(1, pageSize),
  }), async () => {
    const { data, error } = await supabase.rpc('search_battle_titles', {
      p_type: type || 'all',
      p_tag: tag || '',
      p_mood: mood || '',
      p_query: query || '',
      p_trailer_state: trailerState || 'all',
      p_trailer_provider: trailerProvider || 'all',
      p_show_adult: Boolean(showAdult),
      p_hidden_title_ids: normalizeNumericIdList(hiddenTitleIds),
      p_page: Math.max(0, page),
      p_page_size: Math.max(1, pageSize),
    });

    if (error) throw error;

    const rows = (data || []).map((row) => {
      const total = row.total_count;
      const mapped = mapCanonicalTitle(row);
      mapped._totalCount = Number(total || 0);
      return mapped;
    });

    const total = rows.length > 0 ? (rows[0]._totalCount || 0) : 0;
    rows.forEach((row) => { delete row._totalCount; });

    return { rows, total };
  });
}

export async function fetchBattleTitleBySlug(slug) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return null;

  return withCatalogCache(getCacheKey('battle-title-by-slug', { slug: normalizedSlug }), async () => {
    const { data, error } = await supabase
      .from('canonical_titles')
      .select(`
        id, slug, canonical_title, type, subtype,
        release_year, is_adult, cover_image, banner_image,
        aliases:aliases_cache
      `)
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (error) throw error;
    return data ? mapCanonicalTitle(data) : null;
  });
}

export async function fetchBattleTitleFacets({
  showAdult = false,
  hiddenTitleIds = [],
} = {}) {
  return withCatalogCache(getCacheKey('battle-title-facets', {
    showAdult: Boolean(showAdult),
    hiddenTitleIds: normalizeNumericIdList(hiddenTitleIds),
  }), async () => {
    const { data, error } = await supabase.rpc('get_battle_title_facets', {
      p_show_adult: Boolean(showAdult),
      p_hidden_title_ids: normalizeNumericIdList(hiddenTitleIds),
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return EMPTY_FILTER_OPTIONS;
    }

    return {
      genres: normalizeTextList(row.genres),
      tags: normalizeTextList(row.tags),
      moods: normalizeTextList(row.moods),
      trailerProviders: normalizeTextList(row.trailer_providers),
    };
  });
}

// ---------------------------------------------------------------------------
// fetchBattleThemeSongsPage
// ---------------------------------------------------------------------------
// params: { query, showAdult, page, pageSize }
// returns: { rows: ThemeSongEntity[], total: number }
export async function fetchBattleThemeSongsPage({
  query = '',
  showAdult = false,
  hiddenTitleIds = [],
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  return withCatalogCache(getCacheKey('battle-theme-songs', {
    query,
    showAdult: Boolean(showAdult),
    hiddenTitleIds: normalizeNumericIdList(hiddenTitleIds),
    page: Math.max(0, page),
    pageSize: Math.max(1, pageSize),
  }), async () => {
    const { data, error } = await supabase.rpc('search_battle_theme_songs', {
      p_query: query || '',
      p_show_adult: Boolean(showAdult),
      p_hidden_title_ids: normalizeNumericIdList(hiddenTitleIds),
      p_page: Math.max(0, page),
      p_page_size: Math.max(1, pageSize),
    });

    if (error) throw error;

    const totalCount = data?.length > 0 ? Number(data[0].total_count || 0) : 0;
    const rows = (data || []).map((row) => buildThemeSongEntity(row, buildSourceTitleFromSongRow(row)));

    return { rows, total: totalCount };
  });
}

export async function fetchBattleTrailersPage({
  type = 'all',
  tag = '',
  mood = '',
  query = '',
  trailerProvider = 'all',
  showAdult = false,
  hiddenTitleIds = [],
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const result = await fetchBattleTitlesPage({
    type,
    tag,
    mood,
    query,
    trailerState: 'has',
    trailerProvider,
    showAdult,
    hiddenTitleIds,
    page,
    pageSize,
  });

  return {
    rows: (result.rows || []).map(buildTrailerEntity),
    total: Number(result.total || 0),
  };
}

export async function fetchBattleCharactersPage({
  type = 'all',
  tag = '',
  mood = '',
  query = '',
  showAdult = false,
  hiddenTitleIds = [],
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  return withCatalogCache(getCacheKey('battle-characters', {
    type,
    tag,
    mood,
    query,
    showAdult: Boolean(showAdult),
    hiddenTitleIds: normalizeNumericIdList(hiddenTitleIds),
    page: Math.max(0, page),
    pageSize: Math.max(1, pageSize),
  }), async () => {
    const { data, error } = await supabase.rpc('search_battle_characters', {
      p_type: type || 'all',
      p_tag: tag || '',
      p_mood: mood || '',
      p_query: query || '',
      p_show_adult: Boolean(showAdult),
      p_hidden_title_ids: normalizeNumericIdList(hiddenTitleIds),
      p_page: Math.max(0, page),
      p_page_size: Math.max(1, pageSize),
    });

    if (error) throw error;

    return {
      rows: (data || []).map((row) => buildCharacterEntity(
        buildSourceTitleFromCharacterRow(row),
        row,
        Number(row.character_index || 0),
      )),
      total: data?.length > 0 ? Number(data[0].total_count || 0) : 0,
    };
  });
}

function buildSourceTitleFromSongRow(row) {
  // Extract display names from aliases_cache
  const aliases = Array.isArray(row.source_aliases) ? row.source_aliases : [];
  const titleTh = aliases.find((a) => a.language_code === 'th')?.alias || '';
  const titleEn = aliases.find((a) => a.alias_type === 'english' || a.language_code === 'en')?.alias
    || row.source_canonical_title
    || '';

  return {
    id: row.source_id,
    slug: row.source_slug,
    cover: row.source_cover_image || '',
    banner: row.source_banner_image || '',
    title_en: titleEn,
    title_th: titleTh,
    title_native: '',
    is_adult: Boolean(row.source_is_adult),
    year: row.source_release_year || null,
  };
}

function buildSourceTitleFromCharacterRow(row) {
  const aliases = Array.isArray(row.source_aliases) ? row.source_aliases : [];
  const titleTh = aliases.find((alias) => alias.language_code === 'th')?.alias || '';
  const titleEn = aliases.find((alias) => alias.alias_type === 'english' || alias.language_code === 'en')?.alias
    || row.source_canonical_title
    || '';

  const genres = Array.isArray(row.source_genres)
    ? row.source_genres.map((genre) => genre?.genre_name).filter(Boolean)
    : [];
  const tags = Array.isArray(row.source_tags)
    ? row.source_tags.map((tag) => tag?.tag_name).filter(Boolean)
    : [];
  const moods = Array.isArray(row.source_moods)
    ? row.source_moods.map((mood) => mood?.mood_id).filter(Boolean)
    : [];

  return {
    id: row.source_id,
    slug: row.source_slug,
    type: row.source_subtype === 'manhwa' || row.source_subtype === 'webtoon'
      ? 'manhwa'
      : row.source_type || 'anime',
    subtype: row.source_subtype || row.source_type || 'anime',
    cover: row.source_cover_image || '',
    banner: row.source_banner_image || '',
    title_en: titleEn,
    title_th: titleTh,
    title_native: '',
    synopsis: row.source_synopsis || '',
    score: row.source_avg_score ?? null,
    popularity: row.source_popularity_score ?? 0,
    is_adult: Boolean(row.source_is_adult),
    genres,
    tags,
    moods,
    year: row.source_release_year || null,
  };
}

// ---------------------------------------------------------------------------
// hydrateBattleEntriesByIds
// Fetches full entity data by ID array. Used when loading an edit deck so
// the deck's stored title snapshots get refreshed with current DB state.
// ---------------------------------------------------------------------------
// entityType: TITLE_ENTITY_TYPE | THEME_SONG_ENTITY_TYPE
// ids: array of numeric IDs
// returns: array of mapped entities (same shape as fetchBattleTitlesPage rows)
export async function hydrateBattleEntriesByIds(ids, entityType) {
  if (!ids || ids.length === 0) return [];

  const numericIds = ids.map(Number).filter(Boolean);
  if (numericIds.length === 0) return [];

  if (entityType === THEME_SONG_ENTITY_TYPE) {
    return hydrateSongsByIds(numericIds);
  }
  if (entityType === TRAILER_ENTITY_TYPE) {
    const titles = await hydrateTitlesByIds(numericIds);
    return titles.map(buildTrailerEntity);
  }
  if (entityType === CHARACTER_ENTITY_TYPE) {
    return [];
  }
  return hydrateTitlesByIds(numericIds);
}

async function hydrateTitlesByIds(ids) {
  const { data, error } = await supabase
    .from('canonical_titles')
    .select(`
      id, slug, canonical_title, type, subtype,
      release_year, episodes, chapters, volumes, duration_minutes,
      is_adult, cover_image, banner_image, avg_score, popularity_score,
      trailer_url, trailer_site, trailer_video_id, trailer_thumbnail_url, trailer_source,
      aliases:aliases_cache, genres:genres_cache, tags:tags_cache, moods:moods_cache
    `)
    .in('id', ids);

  if (error) throw error;

  // Preserve original order from ids array
  const byId = new Map((data || []).map((row) => [Number(row.id), mapCanonicalTitle(row)]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}

async function hydrateSongsByIds(ids) {
  const { data, error } = await supabase
    .from('title_theme_songs')
    .select(`
      id, canonical_title_id, theme_type, theme_sequence,
      song_title, artist_name, episodes_text, video_url,
      is_creditless, is_spoiler, is_nsfw,
      source_title:canonical_titles!title_theme_songs_canonical_title_id_fkey (
        id, slug, canonical_title, cover_image, banner_image,
        is_adult, release_year, aliases:aliases_cache
      )
    `)
    .in('id', ids);

  if (error) throw error;

  const byId = new Map(
    (data || []).map((row) => {
      const sourceTitle = row.source_title
        ? buildSourceTitleFromSongRow({
            source_id: row.source_title.id,
            source_slug: row.source_title.slug,
            source_canonical_title: row.source_title.canonical_title,
            source_cover_image: row.source_title.cover_image,
            source_banner_image: row.source_title.banner_image,
            source_is_adult: row.source_title.is_adult,
            source_release_year: row.source_title.release_year,
            source_aliases: row.source_title.aliases,
          })
        : null;
      return [Number(row.id), buildThemeSongEntity(row, sourceTitle)];
    })
  );

  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
}
