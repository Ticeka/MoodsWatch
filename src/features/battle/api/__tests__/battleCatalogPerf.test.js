// Performance characteristics of the battle catalog query layer.
//
// What we assert (perf properties, not raw timings):
//   1. Each public API issues exactly one server roundtrip per logical fetch.
//   2. Pagination params are forwarded verbatim — no client-side over-fetch.
//   3. The TTL cache returns a hit on a repeated identical call (0 extra RPCs).
//   4. The in-flight dedup cache collapses N parallel identical calls to 1 RPC.
//   5. Distinct param sets do NOT collide on the same cache key.
//   6. Hydrate-by-ids uses a single .in(id, [...]) batch (no N+1 fan-out).
//   7. Hot transform paths stay under a generous wall-clock budget.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  attachDefaultRecorder,
  countOps,
  findOp,
  resetMockState,
  setRpcHandler,
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

const battleCatalogApi = await import('../battleCatalogApi.js');
const { THEME_SONG_ENTITY_TYPE, TRAILER_ENTITY_TYPE } = await import('@/shared/lib/catalogEntities');

function uniqueQuery(prefix) {
  // Each test uses a fresh query string so the module-level cache can't bleed
  // between tests (the cache key is JSON.stringify(params)).
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('battle catalog — query performance', () => {
  beforeEach(() => {
    resetMockState(mockState);
    attachDefaultRecorder(mockState);
  });

  describe('fetchBattleTitlesPage', () => {
    it('issues exactly one search_battle_titles RPC per call', async () => {
      setRpcHandler(mockState, 'search_battle_titles', () => ({
        data: [
          { id: 1, slug: 'a', canonical_title: 'A', total_count: 42 },
          { id: 2, slug: 'b', canonical_title: 'B', total_count: 42 },
        ],
        error: null,
      }));

      const result = await battleCatalogApi.fetchBattleTitlesPage({
        query: uniqueQuery('one'),
        page: 0,
        pageSize: 24,
      });

      expect(mockState.rpcCalls.filter((c) => c.name === 'search_battle_titles')).toHaveLength(1);
      expect(result.total).toBe(42);
      expect(result.rows).toHaveLength(2);
    });

    it('forwards pagination params verbatim to the RPC', async () => {
      setRpcHandler(mockState, 'search_battle_titles', () => ({ data: [], error: null }));

      await battleCatalogApi.fetchBattleTitlesPage({
        query: uniqueQuery('paging'),
        page: 5,
        pageSize: 48,
        showAdult: true,
        type: 'manga',
        tag: 'action',
      });

      const call = mockState.rpcCalls.find((c) => c.name === 'search_battle_titles');
      expect(call.params.p_page).toBe(5);
      expect(call.params.p_page_size).toBe(48);
      expect(call.params.p_show_adult).toBe(true);
      expect(call.params.p_type).toBe('manga');
      expect(call.params.p_tag).toBe('action');
    });

    it('clamps negative page and zero pageSize so the server never sees nonsense', async () => {
      setRpcHandler(mockState, 'search_battle_titles', () => ({ data: [], error: null }));

      await battleCatalogApi.fetchBattleTitlesPage({
        query: uniqueQuery('clamp'),
        page: -10,
        pageSize: 0,
      });

      const call = mockState.rpcCalls.find((c) => c.name === 'search_battle_titles');
      expect(call.params.p_page).toBe(0);
      expect(call.params.p_page_size).toBe(1);
    });

    it('serves a repeated identical call from the TTL cache (0 extra RPCs)', async () => {
      const query = uniqueQuery('ttl');
      setRpcHandler(mockState, 'search_battle_titles', () => ({
        data: [{ id: 7, slug: 's', canonical_title: 'S', total_count: 1 }],
        error: null,
      }));

      await battleCatalogApi.fetchBattleTitlesPage({ query, page: 0, pageSize: 24 });
      const beforeSecond = mockState.rpcCalls.length;
      await battleCatalogApi.fetchBattleTitlesPage({ query, page: 0, pageSize: 24 });
      const afterSecond = mockState.rpcCalls.length;

      expect(afterSecond - beforeSecond).toBe(0);
    });

    it('collapses N parallel identical calls into a single RPC via in-flight dedup', async () => {
      const query = uniqueQuery('dedup');
      setRpcHandler(mockState, 'search_battle_titles', async () => {
        // Force the promise to actually be in flight while parallel callers attach.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          data: [{ id: 9, slug: 'x', canonical_title: 'X', total_count: 1 }],
          error: null,
        };
      });

      const callers = Array.from({ length: 6 }, () =>
        battleCatalogApi.fetchBattleTitlesPage({ query, page: 0, pageSize: 24 })
      );
      const results = await Promise.all(callers);

      expect(mockState.rpcCalls.filter((c) => c.name === 'search_battle_titles')).toHaveLength(1);
      results.forEach((result) => {
        expect(result.total).toBe(1);
      });
    });

    it('uses distinct cache keys when only the page differs', async () => {
      const query = uniqueQuery('pages');
      setRpcHandler(mockState, 'search_battle_titles', ({ params }) => ({
        data: [{ id: params.p_page + 100, slug: `p${params.p_page}`, canonical_title: `P${params.p_page}`, total_count: 200 }],
        error: null,
      }));

      await battleCatalogApi.fetchBattleTitlesPage({ query, page: 0, pageSize: 24 });
      await battleCatalogApi.fetchBattleTitlesPage({ query, page: 1, pageSize: 24 });
      await battleCatalogApi.fetchBattleTitlesPage({ query, page: 2, pageSize: 24 });

      const titleCalls = mockState.rpcCalls.filter((c) => c.name === 'search_battle_titles');
      expect(titleCalls).toHaveLength(3);
      expect(titleCalls.map((c) => c.params.p_page)).toEqual([0, 1, 2]);
    });

    it('normalizes hiddenTitleIds (numeric, deduped) before sending', async () => {
      setRpcHandler(mockState, 'search_battle_titles', () => ({ data: [], error: null }));

      await battleCatalogApi.fetchBattleTitlesPage({
        query: uniqueQuery('hide'),
        hiddenTitleIds: [3, '3', 5, 0, null, undefined, '7'],
      });

      const call = mockState.rpcCalls.find((c) => c.name === 'search_battle_titles');
      expect(call.params.p_hidden_title_ids.sort((a, b) => a - b)).toEqual([3, 5, 7]);
    });
  });

  describe('fetchBattleThemeSongsPage / fetchBattleCharactersPage', () => {
    it('theme songs: single RPC, params honored, total derived from first row', async () => {
      setRpcHandler(mockState, 'search_battle_theme_songs', () => ({
        data: [
          {
            id: 11,
            song_title: 'Idol',
            artist_name: 'YOASOBI',
            total_count: 99,
            source_id: 1,
            source_slug: 'oshi',
            source_canonical_title: 'Oshi no Ko',
            source_aliases: [],
          },
        ],
        error: null,
      }));

      const result = await battleCatalogApi.fetchBattleThemeSongsPage({
        query: uniqueQuery('songs'),
        page: 2,
        pageSize: 12,
      });

      const songCalls = mockState.rpcCalls.filter((c) => c.name === 'search_battle_theme_songs');
      expect(songCalls).toHaveLength(1);
      expect(songCalls[0].params.p_page).toBe(2);
      expect(songCalls[0].params.p_page_size).toBe(12);
      expect(result.total).toBe(99);
      expect(result.rows).toHaveLength(1);
    });

    it('characters: single RPC and params forwarded', async () => {
      setRpcHandler(mockState, 'search_battle_characters', () => ({ data: [], error: null }));

      await battleCatalogApi.fetchBattleCharactersPage({
        query: uniqueQuery('chars'),
        type: 'anime',
        tag: 'shonen',
        mood: 'epic',
        page: 1,
        pageSize: 16,
      });

      const calls = mockState.rpcCalls.filter((c) => c.name === 'search_battle_characters');
      expect(calls).toHaveLength(1);
      expect(calls[0].params.p_type).toBe('anime');
      expect(calls[0].params.p_tag).toBe('shonen');
      expect(calls[0].params.p_mood).toBe('epic');
      expect(calls[0].params.p_page).toBe(1);
      expect(calls[0].params.p_page_size).toBe(16);
    });

    it('trailers piggyback on titles RPC and add no extra roundtrip', async () => {
      setRpcHandler(mockState, 'search_battle_titles', () => ({ data: [], error: null }));

      await battleCatalogApi.fetchBattleTrailersPage({
        query: uniqueQuery('trailers'),
        trailerProvider: 'youtube',
      });

      const titleCalls = mockState.rpcCalls.filter((c) => c.name === 'search_battle_titles');
      expect(titleCalls).toHaveLength(1);
      expect(titleCalls[0].params.p_trailer_state).toBe('has');
      expect(titleCalls[0].params.p_trailer_provider).toBe('youtube');
    });
  });

  describe('fetchBattleTitleFacets', () => {
    it('caches facet RPC across repeated calls with the same arguments', async () => {
      setRpcHandler(mockState, 'get_battle_title_facets', () => ({
        data: [{ genres: ['action'], tags: [], moods: ['epic'], trailer_providers: ['youtube'] }],
        error: null,
      }));

      const args = { showAdult: false, hiddenTitleIds: [Date.now()] };
      await battleCatalogApi.fetchBattleTitleFacets(args);
      await battleCatalogApi.fetchBattleTitleFacets(args);
      await battleCatalogApi.fetchBattleTitleFacets(args);

      const facetCalls = mockState.rpcCalls.filter((c) => c.name === 'get_battle_title_facets');
      expect(facetCalls).toHaveLength(1);
    });
  });

  describe('hydrateBattleEntriesByIds', () => {
    it('hydrates 25 title ids in exactly one .in(id, [...]) query', async () => {
      const ids = Array.from({ length: 25 }, (_, i) => i + 1);
      setTableHandler(mockState, 'canonical_titles', () => ({
        data: ids.map((id) => ({
          id,
          slug: `slug-${id}`,
          canonical_title: `Title ${id}`,
          aliases: [],
        })),
        error: null,
      }));

      const result = await battleCatalogApi.hydrateBattleEntriesByIds(ids, 'title');

      const selects = mockState.ops.filter((op) => op.table === 'canonical_titles' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].filters).toEqual(
        expect.arrayContaining([{ kind: 'in', col: 'id', vals: ids }])
      );
      expect(result).toHaveLength(25);
    });

    it('hydrates theme songs with one batched select even for many ids', async () => {
      const ids = Array.from({ length: 40 }, (_, i) => 1000 + i);
      setTableHandler(mockState, 'title_theme_songs', () => ({
        data: ids.map((id) => ({
          id,
          song_title: `Song ${id}`,
          artist_name: 'Artist',
          canonical_title_id: id - 1000,
          source_title: {
            id: id - 1000,
            slug: `s-${id}`,
            canonical_title: `Source ${id}`,
            cover_image: '',
            banner_image: '',
            is_adult: false,
            release_year: 2020,
            aliases: [],
          },
        })),
        error: null,
      }));

      const result = await battleCatalogApi.hydrateBattleEntriesByIds(ids, THEME_SONG_ENTITY_TYPE);

      const selects = mockState.ops.filter((op) => op.table === 'title_theme_songs' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(result).toHaveLength(40);
    });

    it('returns immediately for an empty id list (no roundtrip)', async () => {
      const before = mockState.ops.length;
      const empty = await battleCatalogApi.hydrateBattleEntriesByIds([], 'title');
      expect(empty).toEqual([]);
      expect(mockState.ops.length - before).toBe(0);
    });

    it('trailer hydration adds no DB roundtrip beyond the title fetch', async () => {
      const ids = [10, 20, 30];
      setTableHandler(mockState, 'canonical_titles', () => ({
        data: ids.map((id) => ({ id, slug: `t-${id}`, canonical_title: `T${id}`, aliases: [] })),
        error: null,
      }));

      const result = await battleCatalogApi.hydrateBattleEntriesByIds(ids, TRAILER_ENTITY_TYPE);

      const selects = mockState.ops.filter((op) => op.table === 'canonical_titles' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(result).toHaveLength(3);
    });
  });

  describe('hot-path transform budgets', () => {
    it('mapping a 200-row page completes well under 250ms', async () => {
      const rows = Array.from({ length: 200 }, (_, i) => ({
        id: i + 1,
        slug: `slug-${i}`,
        canonical_title: `Title ${i}`,
        type: 'anime',
        subtype: 'tv',
        release_year: 2020 + (i % 5),
        is_adult: false,
        cover_image: `https://cdn.example.com/${i}.webp`,
        banner_image: `https://cdn.example.com/${i}-banner.webp`,
        aliases: [
          { alias: `Title ${i}`, language_code: 'en', alias_type: 'english' },
          { alias: `タイトル ${i}`, language_code: 'ja' },
        ],
        genres: [{ genre_name: 'action' }],
        tags: [{ tag_name: 'epic' }],
        moods: [{ mood_id: 'epic' }],
        total_count: 200,
      }));
      setRpcHandler(mockState, 'search_battle_titles', () => ({ data: rows, error: null }));

      const startedAt = performance.now();
      const result = await battleCatalogApi.fetchBattleTitlesPage({
        query: uniqueQuery('budget'),
        page: 0,
        pageSize: 200,
      });
      const elapsed = performance.now() - startedAt;

      expect(result.rows).toHaveLength(200);
      expect(elapsed).toBeLessThan(250);
    });
  });
});
