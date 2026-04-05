import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
  isSupabaseConnected: () => true,
}), { virtual: true });

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
  mapCanonicalTitle: (record) => record,
}), { virtual: true });

vi.mock('@/shared/lib/titleSorting', () => ({
  sortTitlesCollection: (titles) => titles,
}), { virtual: true });

vi.mock('@/shared/lib/ageGate', () => ({
  filterTitlesForAgeGate: (titles) => titles,
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

import { collapseTitlesByFranchise } from '../recommend.js';

describe('collapseTitlesByFranchise', () => {
  it('keeps only one title per franchise while preserving order', () => {
    const deduped = collapseTitlesByFranchise([
      { id: 1, title_en: 'Attack on Titan', franchise_id: 10, franchise_name: 'Attack on Titan' },
      { id: 2, title_en: 'Attack on Titan Season 2', franchise_id: 10, franchise_name: 'Attack on Titan' },
      { id: 3, title_en: 'Frieren', franchise_id: 20, franchise_name: 'Frieren' },
      { id: 4, title_en: 'Solo Leveling', franchise_id: null, franchise_name: null },
      { id: 5, title_en: 'Solo Leveling Season 2', franchise_id: null, franchise_name: null },
    ]);

    expect(deduped.map((entry) => entry.id)).toEqual([1, 3, 4, 5]);
  });

  it('falls back to franchise name when franchise id is unavailable', () => {
    const deduped = collapseTitlesByFranchise([
      { id: 11, title_en: 'Haikyuu!!', franchise_name: 'Haikyuu!!' },
      { id: 12, title_en: 'Haikyuu!! To the Top', franchise_name: 'Haikyuu!!' },
      { id: 13, title_en: 'Gintama', franchise_name: 'Gintama' },
    ]);

    expect(deduped.map((entry) => entry.id)).toEqual([11, 13]);
  });
});
