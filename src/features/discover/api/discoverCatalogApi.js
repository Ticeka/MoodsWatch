import {
  CANONICAL_TITLE_BROWSE_SELECT,
  CANONICAL_TITLE_DETAIL_SELECT,
  CANONICAL_TITLE_PREVIEW_SELECT,
  CANONICAL_TITLE_SEARCH_SELECT,
  mapCanonicalTitle,
} from '@/shared/lib/catalog';
import { isSupabaseConnected, supabase } from '@/shared/lib/supabase';

const SUPABASE_BATCH_SIZE = 1000;
const TITLE_CHARACTER_ID_CHUNK_SIZE = 200;

function ensureSupabaseConnected() {
  if (!isSupabaseConnected()) {
    throw new Error('Supabase is not configured');
  }
}

function normalizeTitleType(title) {
  if (title.type === 'manga' && /manhwa/i.test(title.title_en || '')) {
    return { ...title, type: 'manhwa' };
  }

  return title;
}

function mapRecords(records) {
  return (records || []).map((title) => normalizeTitleType(mapCanonicalTitle(title)));
}

function chunkIds(ids = [], chunkSize = TITLE_CHARACTER_ID_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(ids.slice(index, index + chunkSize));
  }
  return chunks;
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

export async function fetchDiscoverCatalogTitles({
  maxRows = null,
  select = CANONICAL_TITLE_BROWSE_SELECT,
} = {}) {
  ensureSupabaseConnected();

  const rowLimit = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : null;
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

  return mapRecords(allData);
}

export async function fetchDiscoverTitleCharacters(titleIds = []) {
  ensureSupabaseConnected();

  const normalizedTitleIds = [...new Set(
    (Array.isArray(titleIds) ? titleIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];

  if (Array.isArray(titleIds) && titleIds.length > 0 && normalizedTitleIds.length === 0) {
    return [];
  }

  const idChunks = normalizedTitleIds.length > 0 ? chunkIds(normalizedTitleIds) : [null];

  const chunkResults = await Promise.all(idChunks.map(async (titleIdChunk) => {
    const rows = [];
    let lastRowId = null;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('title_characters')
        .select(`
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
          sort_order
        `)
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
        rows.push(...data);
        lastRowId = data[data.length - 1].id;
        hasMore = data.length === SUPABASE_BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    return rows;
  }));

  return chunkResults.flat();
}

export async function fetchDiscoverTitlesPage({
  type = 'all',
  query = '',
  sortBy = 'popularity',
  page = 1,
  pageSize = 20,
  showAdult = true,
} = {}) {
  ensureSupabaseConnected();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let titleQuery = supabase
    .from('canonical_titles')
    .select(CANONICAL_TITLE_BROWSE_SELECT, { count: 'planned' });

  titleQuery = applyTypeFilter(titleQuery, type);
  titleQuery = titleQuery.eq('is_adult', Boolean(showAdult));

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

export async function fetchDiscoverSearchResults({
  query = '',
  type = 'all',
  chunkSize = 120,
  showAdult = false,
} = {}) {
  ensureSupabaseConnected();

  const normalizedQuery = query.trim();
  let from = 0;
  let allRecords = [];
  let totalCount = 0;

  while (true) {
    const to = from + chunkSize - 1;
    let titleQuery = supabase
      .from('canonical_titles')
      .select(CANONICAL_TITLE_SEARCH_SELECT, { count: from === 0 ? 'planned' : undefined });

    titleQuery = applyTypeFilter(titleQuery, type);
    titleQuery = titleQuery.eq('is_adult', Boolean(showAdult));

    if (normalizedQuery.length >= 2) {
      const escapedQuery = normalizedQuery.replace(/[%_,]/g, '');
      titleQuery = titleQuery.or(`canonical_title.ilike.%${escapedQuery}%,slug.ilike.%${escapedQuery}%`);
    }

    titleQuery = applySort(titleQuery, 'popularity');

    const { data, error, count } = await titleQuery.range(from, to);
    if (error) throw error;

    if (from === 0) {
      totalCount = count || 0;
    }

    if (!data?.length) {
      break;
    }

    allRecords = allRecords.concat(mapRecords(data));
    if (data.length < chunkSize || allRecords.length >= totalCount) {
      break;
    }
    from += chunkSize;
  }

  return allRecords;
}

export async function fetchDiscoverTitleBySlug(slug) {
  ensureSupabaseConnected();
  const { data, error } = await supabase
    .from('canonical_titles')
    .select(CANONICAL_TITLE_DETAIL_SELECT)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeTitleType(mapCanonicalTitle(data)) : null;
}

export async function fetchDiscoverTitlesByIds(ids = [], { select = CANONICAL_TITLE_BROWSE_SELECT, showAdult = null } = {}) {
  ensureSupabaseConnected();
  const normalizedIds = [...new Set((ids || []).map((id) => Number(id)).filter(Boolean))];
  if (normalizedIds.length === 0) return [];

  const allFetched = [];
  for (const chunk of chunkIds(normalizedIds, 200)) {
    let query = supabase.from('canonical_titles').select(select).in('id', chunk);
    if (typeof showAdult === 'boolean') {
      query = query.eq('is_adult', showAdult);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data) allFetched.push(...mapRecords(data));
  }
  return allFetched;
}

export async function fetchDiscoverTitleById(titleId) {
  ensureSupabaseConnected();
  const { data } = await supabase
    .from('canonical_titles')
    .select(CANONICAL_TITLE_BROWSE_SELECT)
    .eq('id', titleId)
    .maybeSingle();
  return data ? normalizeTitleType(mapCanonicalTitle(data)) : null;
}

export async function fetchDiscoverSimilarCandidates(baseTitleId, { genres = [], tags = [], moods = [], showAdult = true, maxCandidates = 150 } = {}) {
  ensureSupabaseConnected();
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

  return fetchDiscoverTitlesByIds(candidateIds, {
    select: CANONICAL_TITLE_BROWSE_SELECT,
    showAdult: showAdult ? true : false,
  });
}
