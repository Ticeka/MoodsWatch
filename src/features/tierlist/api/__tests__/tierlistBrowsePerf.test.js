// Performance characteristics of the community / public tierlist browse layer.
//
// What we assert:
//   1. fetchTierlistThemeSongEntities dedupes ids and uses one .in() query.
//   2. fetchTierlistCharacterEntities chunks ids at CHARACTER_BATCH_SIZE so
//      huge id lists don't translate into one giant query — but also doesn't
//      fan out one query per id.
//   3. fetchTierlistBrowseVisibility chunks at ENTITY_VISIBILITY_CHUNK_SIZE
//      across each entity type independently.
//   4. Adult content gating is pushed down via .eq('canonical_titles.is_adult')
//      rather than filtered client-side.
//   5. fetchTierlistSongCountMap returns counts in linear time relative to
//      input rows (rough budget so a regression to O(N²) trips the test).
//   6. fetchTierlistSongsForTitle issues one query and short-circuits on 0/0.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  attachDefaultRecorder,
  resetMockState,
  setTableHandler,
} from '@/shared/testing/supabaseRecorderHelpers';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  ops: [],
  rpcCalls: [],
  tableHandlers: new Map(),
  rpcHandlers: new Map(),
}));

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
    rpc: mockState.rpc,
  },
}));

const browseApi = await import('../tierlistBrowseApi.js');

// Constants mirroring the source (kept in sync with tierlistBrowseApi.js).
const ENTITY_VISIBILITY_CHUNK_SIZE = 120;
const CHARACTER_BATCH_SIZE = 200;

describe('tierlist browse — query performance', () => {
  beforeEach(() => {
    resetMockState(mockState);
    attachDefaultRecorder(mockState);
  });

  describe('fetchTierlistThemeSongEntities', () => {
    it('issues a single .in(id, [...]) query for many song ids', async () => {
      const ids = Array.from({ length: 75 }, (_, i) => 1000 + i);
      setTableHandler(mockState, 'title_theme_songs', () => ({
        data: ids.map((id) => ({
          id,
          theme_type: 'opening',
          theme_sequence: 1,
          song_title: `Song ${id}`,
          artist_name: 'Artist',
          canonical_title_id: id,
          canonical_titles: {
            id,
            slug: `t-${id}`,
            canonical_title: `T${id}`,
            is_adult: false,
            aliases: [],
          },
        })),
        error: null,
      }));

      const result = await browseApi.fetchTierlistThemeSongEntities(ids);

      const selects = mockState.ops.filter((op) => op.table === 'title_theme_songs' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].filters.find((f) => f.kind === 'in' && f.col === 'id')?.vals).toHaveLength(75);
      expect(result).toHaveLength(75);
    });

    it('dedupes duplicate ids before sending to the server', async () => {
      setTableHandler(mockState, 'title_theme_songs', () => ({ data: [], error: null }));

      await browseApi.fetchTierlistThemeSongEntities([5, 5, 5, 7, 7, 9, '5']);

      const select = mockState.ops.find((op) => op.table === 'title_theme_songs' && op.action === 'select');
      const inFilter = select?.filters.find((f) => f.kind === 'in' && f.col === 'id');
      expect(inFilter?.vals.sort((a, b) => a - b)).toEqual([5, 7, 9]);
    });

    it('pushes the adult flag into the query (eq on canonical_titles.is_adult)', async () => {
      setTableHandler(mockState, 'title_theme_songs', () => ({ data: [], error: null }));

      await browseApi.fetchTierlistThemeSongEntities([1, 2], { showAdult: false });

      const select = mockState.ops.find((op) => op.table === 'title_theme_songs' && op.action === 'select');
      expect(
        select?.filters.some((f) => f.kind === 'eq' && f.col === 'canonical_titles.is_adult' && f.val === false)
      ).toBe(true);
    });

    it('returns immediately for an empty input (no roundtrip)', async () => {
      const before = mockState.ops.length;
      const result = await browseApi.fetchTierlistThemeSongEntities([]);
      expect(result).toEqual([]);
      expect(mockState.ops.length).toBe(before);
    });
  });

  describe('fetchTierlistCharacterEntities', () => {
    it(`chunks at ${CHARACTER_BATCH_SIZE} ids per request, not one-per-id`, async () => {
      const idCount = CHARACTER_BATCH_SIZE * 2 + 50; // 450 ids → 3 chunks
      const ids = Array.from({ length: idCount }, (_, i) => i + 1);

      setTableHandler(mockState, 'title_characters', () => ({ data: [], error: null }));

      await browseApi.fetchTierlistCharacterEntities(ids);

      const characterSelects = mockState.ops.filter(
        (op) => op.table === 'title_characters' && op.action === 'select'
      );
      // At most 3 chunks for the first id.in pass + 3 chunks for the anilist
      // fallback pass = 6 selects. Critically: well below `idCount`.
      expect(characterSelects.length).toBeLessThanOrEqual(6);
      expect(characterSelects.length).toBeGreaterThanOrEqual(3);
      expect(characterSelects.length).toBeLessThan(idCount);
    });

    it('a tiny id list fits in one chunk', async () => {
      setTableHandler(mockState, 'title_characters', () => ({ data: [], error: null }));

      await browseApi.fetchTierlistCharacterEntities([1, 2, 3]);

      const initialIdSelects = mockState.ops.filter(
        (op) => op.table === 'title_characters'
          && op.action === 'select'
          && op.filters.some((f) => f.kind === 'in' && f.col === 'id')
      );
      expect(initialIdSelects).toHaveLength(1);
    });

    it('returns immediately for an empty input (no roundtrip)', async () => {
      const before = mockState.ops.length;
      const result = await browseApi.fetchTierlistCharacterEntities([]);
      expect(result).toEqual([]);
      expect(mockState.ops.length).toBe(before);
    });
  });

  describe('fetchTierlistBrowseVisibility', () => {
    it(`chunks each entity type independently at ${ENTITY_VISIBILITY_CHUNK_SIZE}`, async () => {
      const titleIds = Array.from({ length: ENTITY_VISIBILITY_CHUNK_SIZE * 2 + 1 }, (_, i) => i + 1);
      const songIds = Array.from({ length: ENTITY_VISIBILITY_CHUNK_SIZE + 1 }, (_, i) => 10_000 + i);

      setTableHandler(mockState, 'canonical_titles', () => ({ data: [], error: null }));
      setTableHandler(mockState, 'title_theme_songs', () => ({ data: [], error: null }));

      // Skip characterIds here — the implementation runs a fallback
      // canonical_titles lookup for unresolved characters, which would
      // contaminate the title-chunk count we are measuring.
      await browseApi.fetchTierlistBrowseVisibility({ titleIds, songIds }, false);

      const titleSelects = mockState.ops.filter((op) => op.table === 'canonical_titles' && op.action === 'select');
      const songSelects = mockState.ops.filter((op) => op.table === 'title_theme_songs' && op.action === 'select');

      // 241 title ids → 3 chunks
      expect(titleSelects).toHaveLength(3);
      // Each title chunk should be ≤ ENTITY_VISIBILITY_CHUNK_SIZE
      titleSelects.forEach((op) => {
        const inFilter = op.filters.find((f) => f.kind === 'in' && f.col === 'id');
        expect(inFilter?.vals.length).toBeLessThanOrEqual(ENTITY_VISIBILITY_CHUNK_SIZE);
      });
      // 121 song ids → 2 chunks
      expect(songSelects).toHaveLength(2);

      // Lightweight selects only — never `*`.
      titleSelects.forEach((op) => expect(op.select).toBe('id, is_adult'));
    });

    it('runs a single chunked character pass for character ids without fanning out per-id', async () => {
      const characterIds = Array.from({ length: 50 }, (_, i) => 100_000 + i);
      setTableHandler(mockState, 'title_characters', () => ({ data: [], error: null }));
      setTableHandler(mockState, 'canonical_titles', () => ({ data: [], error: null }));

      await browseApi.fetchTierlistBrowseVisibility({ characterIds }, false);

      const charSelects = mockState.ops.filter((op) => op.table === 'title_characters' && op.action === 'select');
      // 50 character ids → 1 chunk for the primary lookup; the implementation
      // may add a small fallback canonical_titles pass for unresolved ids.
      expect(charSelects).toHaveLength(1);
      expect(charSelects.length).toBeLessThan(characterIds.length);
    });

    it('returns the empty-visibility shape with no work when all id lists are empty', async () => {
      const before = mockState.ops.length;
      const visibility = await browseApi.fetchTierlistBrowseVisibility({}, false);

      expect(mockState.ops.length).toBe(before);
      expect(visibility.allowedByType).toBeDefined();
      expect(visibility.blockedByType).toBeDefined();
    });
  });

  describe('fetchTierlistSongsForTitle', () => {
    it('issues exactly one ordered select for a given title', async () => {
      setTableHandler(mockState, 'title_theme_songs', () => ({
        data: [
          { id: 1, song_title: 'Song A', artist_name: 'X' },
          { id: 2, song_title: 'Song B', artist_name: 'Y' },
        ],
        error: null,
      }));

      const songs = await browseApi.fetchTierlistSongsForTitle({ id: 42 });

      const selects = mockState.ops.filter((op) => op.table === 'title_theme_songs' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'canonical_title_id' && f.val === 42)
      ).toBe(true);
      expect(selects[0].orders.find((o) => o.col === 'display_order')).toBeDefined();
      expect(songs).toHaveLength(2);
    });

    it('short-circuits when title id is missing', async () => {
      const before = mockState.ops.length;
      expect(await browseApi.fetchTierlistSongsForTitle(null)).toEqual([]);
      expect(await browseApi.fetchTierlistSongsForTitle({ id: 0 })).toEqual([]);
      expect(mockState.ops.length).toBe(before);
    });
  });

  describe('fetchTierlistSongCountMap (transform budget)', () => {
    it('builds the count map in well under 250ms even with 5k rows (linear scan)', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) => ({ canonical_title_id: (i % 250) + 1 }));
      setTableHandler(mockState, 'title_theme_songs', () => ({ data: rows, error: null }));

      const startedAt = performance.now();
      const map = await browseApi.fetchTierlistSongCountMap();
      const elapsed = performance.now() - startedAt;

      expect(map.size).toBe(250);
      expect(map.get(1)).toBe(20);
      expect(elapsed).toBeLessThan(250);
    });
  });
});
