import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryLog, titleRows, mockFrom } = vi.hoisted(() => {
  const hoistedQueryLog = [];
  const hoistedTitleRows = new Map();
  const hoistedMockFrom = vi.fn((table) => {
    const state = {
      table,
      select: '',
      filters: {},
    };

    const builder = {
      select(value) {
        state.select = value;
        return builder;
      },
      in(column, values) {
        state.filters[column] = Array.isArray(values) ? [...values] : values;
        return builder;
      },
      eq(column, value) {
        state.filters[column] = value;
        return builder;
      },
      then(onFulfilled, onRejected) {
        hoistedQueryLog.push({
          table: state.table,
          select: state.select,
          filters: { ...state.filters },
        });

        if (state.table !== 'canonical_titles') {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }

        let rows = Array.from(hoistedTitleRows.values());

        if (Array.isArray(state.filters.id)) {
          const allowedIds = new Set(state.filters.id.map(Number));
          rows = rows.filter((row) => allowedIds.has(Number(row.id)));
        }

        if (typeof state.filters.is_adult === 'boolean') {
          rows = rows.filter((row) => Boolean(row.is_adult) === state.filters.is_adult);
        }

        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };

    return builder;
  });

  return {
    queryLog: hoistedQueryLog,
    titleRows: hoistedTitleRows,
    mockFrom: hoistedMockFrom,
  };
});

function createTitleRecord(id, overrides = {}) {
  return {
    id,
    slug: `title-${id}`,
    canonical_title: `Title ${id}`,
    type: 'anime',
    subtype: null,
    is_adult: false,
    cover_image: `https://example.com/${id}.jpg`,
    popularity_score: 1000 + id,
    genres: [],
    tags: [],
    moods: [],
    aliases: [],
    availability: [],
    ...overrides,
  };
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
  isSupabaseConnected: () => true,
}));

vi.mock('@/shared/data/moods', () => ({
  MOODS: [],
  isExplicitMood: () => false,
}), { virtual: true });

vi.mock('@/shared/lib/catalog', () => ({
  CANONICAL_TITLE_BROWSE_SELECT: 'browse_select',
  CANONICAL_TITLE_PREVIEW_SELECT: 'preview_select',
  CANONICAL_TITLE_SEARCH_SELECT: 'search_select',
  CANONICAL_TITLE_DETAIL_SELECT: 'detail_select',
  CANONICAL_TITLE_LIST_SELECT: 'list_select',
  mapCanonicalTitle: (record) => ({
    id: record.id,
    slug: record.slug,
    type: record.type,
    subtype: record.subtype,
    title_en: record.canonical_title,
    title_th: null,
    title_romaji: null,
    title_native: null,
    aliases: [],
    synopsis: record.synopsis,
    cover: record.cover_image,
    banner: record.banner_image,
    score: record.avg_score ?? null,
    popularity: record.popularity_score ?? 0,
    year: record.release_year ?? null,
    episodes: null,
    chapters: null,
    volumes: null,
    duration: null,
    status: null,
    is_adult: record.is_adult,
    origin_country: null,
    origin_language: null,
    format: null,
    season: null,
    season_year: null,
    mean_score: null,
    favorites_count: null,
    hashtag: null,
    trailer_url: null,
    trailer_site: null,
    trailer_video_id: null,
    trailer_thumbnail_url: null,
    trailer_source: null,
    trailer: null,
    start_date: null,
    end_date: null,
    genres: [],
    tags: [],
    tagDetails: [],
    moods: [],
    studios: [],
    platforms: [],
    source_refs: [],
    characters: [],
    staff: [],
  }),
}), { virtual: true });

vi.mock('@/shared/lib/titleSorting', () => ({
  sortTitlesCollection: (titles) => titles,
}), { virtual: true });

vi.mock('@/shared/lib/ageGate', () => ({
  filterTitlesForAgeGate: (titles, showAdult) => (
    (titles || []).filter((title) => Boolean(title?.is_adult) === showAdult)
  ),
}), { virtual: true });

vi.mock('@/features/profile/lib/profileStore', () => ({
  buildRecommendationState: () => ({}),
  DEFAULT_PROFILE_PREFERENCES: {},
  filterTitlesByRecommendationPreferences: (titles) => titles,
}), { virtual: true });

vi.mock('@/features/discover/lib/searchMatch', () => ({
  getSearchIntent: () => 'browse',
  sortBySearchRelevance: (titles) => titles,
  textMatchesQuery: () => true,
}), { virtual: true });

vi.mock('@/shared/lib/catalogEntities', () => ({
  buildCharacterCatalog: () => [],
}), { virtual: true });

import { clearTitlesCache, getTitlePreviewByIds, getTitlesByIds } from '../recommend.js';

describe('recommend cache reuse', () => {
  beforeEach(() => {
    clearTitlesCache();
    queryLog.length = 0;
    titleRows.clear();
    mockFrom.mockClear();

    titleRows.set(1, createTitleRecord(1));
    titleRows.set(2, createTitleRecord(2));
  });

  it('reuses cached title records for preview requests', async () => {
    await getTitlesByIds([1], { showAdult: false });
    expect(queryLog).toHaveLength(1);

    const preview = await getTitlePreviewByIds([1], { showAdult: false });

    expect(preview.map((title) => title.id)).toEqual([1]);
    expect(queryLog).toHaveLength(1);
  });

  it('fetches only missing preview ids when part of the batch is already cached', async () => {
    await getTitlesByIds([1], { showAdult: false });
    queryLog.length = 0;

    const preview = await getTitlePreviewByIds([1, 2], { showAdult: false });

    expect(preview.map((title) => title.id)).toEqual([1, 2]);
    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].filters.id).toEqual([2]);
  });

  it('returns correct titles after a mode switch without a second DB query', async () => {
    titleRows.set(3, createTitleRecord(3, { is_adult: true }));

    // safe mode: fetches and caches both titles (is_adult=false and is_adult=true)
    const safeResult = await getTitlesByIds([1, 3], { showAdult: false });
    expect(safeResult.map((t) => t.id)).toEqual([1]);
    expect(queryLog).toHaveLength(1);

    queryLog.length = 0;

    // adult mode: IDs 1 and 3 are already in cache — no second DB query
    const adultResult = await getTitlesByIds([1, 3], { showAdult: true });
    expect(adultResult.map((t) => t.id)).toEqual([3]);
    expect(queryLog).toHaveLength(0);
  });

  it('does not re-fetch preview ids already in cache when mode switches', async () => {
    titleRows.set(4, createTitleRecord(4, { is_adult: true }));

    await getTitlePreviewByIds([1, 4], { showAdult: false });
    queryLog.length = 0;

    const adultPreview = await getTitlePreviewByIds([1, 4], { showAdult: true });
    expect(adultPreview.map((t) => t.id)).toEqual([4]);
    expect(queryLog).toHaveLength(0);
  });
});
