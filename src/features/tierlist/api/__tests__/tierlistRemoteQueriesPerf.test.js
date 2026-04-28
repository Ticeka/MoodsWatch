// Performance characteristics of the personal tierlist query layer.
//
// What we assert:
//   1. fetchRemoteTemplates fans out to public + owned in parallel with one
//      query each — no extra hidden requests.
//   2. The select column list matches REMOTE_TEMPLATE_SELECT (no `*`).
//   3. Result-cache: a repeated identical call within TTL is fully served
//      from cache (zero new DB roundtrips).
//   4. In-flight cache: parallel identical calls collapse to one set of DB
//      queries.
//   5. fetchRemoteLists honors skipRows/skipPoolItems so callers that don't
//      need rows pay only one query, not three.
//   6. Limits/ranges (publicLimit, ownedLimit, ownedOffset) make it onto the
//      query unchanged.
//   7. Owner-stats query only selects `template_id, is_public` — never the
//      full row.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  attachDefaultRecorder,
  countOps,
  findOp,
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

const queriesApi = await import('../tierlistRemoteQueriesApi.js');
const supportApi = await import('../tierlistRemoteSupportApi.js');

function makeTemplateRow(overrides = {}) {
  return {
    id: `tpl-${Math.random().toString(36).slice(2, 8)}`,
    owner_user_id: null,
    title: 'Best of 2026',
    description: '',
    category: 'anime',
    title_ids: [1, 2, 3],
    default_rows: [],
    is_public: true,
    is_system: false,
    plays: 0,
    has_adult_content: false,
    preview_artwork_url: null,
    custom_items: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    manual_preview_artwork_url: null,
    preview_artwork_fit: 'cover',
    preview_artwork_position: 'center',
    preview_artwork_scale: 1,
    preview_artwork_offset_x: 0,
    preview_artwork_offset_y: 0,
    ...overrides,
  };
}

function makeListRow(overrides = {}) {
  return {
    id: `lst-${Math.random().toString(36).slice(2, 8)}`,
    owner_user_id: 'u-1',
    template_id: 'tpl-shared',
    title: 'My ranking',
    description: '',
    is_public: false,
    play_count: 0,
    owner_name: 'tester',
    owner_username: 'tester',
    has_adult_content: false,
    custom_items: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('tierlist remote queries — query performance', () => {
  beforeEach(() => {
    resetMockState(mockState);
    attachDefaultRecorder(mockState);
    supportApi.invalidateTierlistRemoteCaches();
  });

  describe('fetchRemoteTemplates', () => {
    it('issues exactly two parallel selects against tierlist_templates (public + owned)', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({
        data: [makeTemplateRow()],
        error: null,
      }));

      await queriesApi.fetchRemoteTemplates('user-1');

      const selects = mockState.ops.filter(
        (op) => op.table === 'tierlist_templates' && op.action === 'select'
      );
      expect(selects).toHaveLength(2);
      expect(selects.some((op) => op.filters.some((f) => f.kind === 'eq' && f.col === 'is_public' && f.val === true))).toBe(true);
      expect(selects.some((op) => op.filters.some((f) => f.kind === 'eq' && f.col === 'owner_user_id' && f.val === 'user-1'))).toBe(true);
    });

    it('skips the owned-only branch when there is no userId', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteTemplates(null);

      const selects = mockState.ops.filter(
        (op) => op.table === 'tierlist_templates' && op.action === 'select'
      );
      expect(selects).toHaveLength(1);
      expect(selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'is_public')).toBe(true);
    });

    it('uses the explicit REMOTE_TEMPLATE_SELECT column list (never select-*)', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteTemplates('user-2');

      const selects = mockState.ops.filter(
        (op) => op.table === 'tierlist_templates' && op.action === 'select'
      );
      expect(selects.length).toBeGreaterThan(0);
      selects.forEach((op) => {
        expect(op.select).toBeTypeOf('string');
        expect(op.select).not.toBe('*');
        expect(op.select).toContain('id');
        expect(op.select).toContain('title_ids');
        expect(op.select).toContain('is_public');
        expect(op.select).toContain('plays');
      });
    });

    it('serves a repeated identical call from the result cache (zero new selects)', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({
        data: [makeTemplateRow()],
        error: null,
      }));

      await queriesApi.fetchRemoteTemplates('user-cache');
      const firstCallCount = mockState.ops.filter((op) => op.table === 'tierlist_templates').length;

      await queriesApi.fetchRemoteTemplates('user-cache');
      const secondCallCount = mockState.ops.filter((op) => op.table === 'tierlist_templates').length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('collapses parallel identical calls into one set of selects via in-flight dedup', async () => {
      setTableHandler(mockState, 'tierlist_templates', async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { data: [makeTemplateRow()], error: null };
      });

      await Promise.all([
        queriesApi.fetchRemoteTemplates('user-parallel'),
        queriesApi.fetchRemoteTemplates('user-parallel'),
        queriesApi.fetchRemoteTemplates('user-parallel'),
        queriesApi.fetchRemoteTemplates('user-parallel'),
      ]);

      const selects = mockState.ops.filter(
        (op) => op.table === 'tierlist_templates' && op.action === 'select'
      );
      // Two queries (public + owned) for one logical fetch — not eight.
      expect(selects).toHaveLength(2);
    });

    it('forwards publicLimit to .limit() exactly', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteTemplates('user-3', { publicLimit: 12 });

      const publicSelect = mockState.ops.find(
        (op) => op.table === 'tierlist_templates'
          && op.action === 'select'
          && op.filters.some((f) => f.kind === 'eq' && f.col === 'is_public' && f.val === true)
      );
      expect(publicSelect?.limit).toBe(12);
    });

    it('orders public templates by plays DESC, updated_at DESC', async () => {
      setTableHandler(mockState, 'tierlist_templates', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteTemplates('user-order');

      const publicSelect = mockState.ops.find(
        (op) => op.table === 'tierlist_templates'
          && op.action === 'select'
          && op.filters.some((f) => f.kind === 'eq' && f.col === 'is_public')
      );
      expect(publicSelect?.orders).toEqual([
        { col: 'plays', options: { ascending: false } },
        { col: 'updated_at', options: { ascending: false } },
      ]);
    });
  });

  describe('fetchRemoteLists', () => {
    it('default fetch issues 3 selects: lists, list_rows, list_pool_items', async () => {
      const listRow = makeListRow();
      setTableHandler(mockState, 'tierlist_lists', () => ({ data: [listRow], error: null }));
      setTableHandler(mockState, 'tierlist_list_rows', () => ({ data: [], error: null }));
      setTableHandler(mockState, 'tierlist_list_pool_items', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteLists('user-default', {
        includePublic: false,
        includeOwned: true,
        skipPoolItems: false,
        skipRows: false,
      });

      const selectsByTable = (table) => mockState.ops.filter(
        (op) => op.table === table && op.action === 'select'
      );

      expect(selectsByTable('tierlist_lists')).toHaveLength(1);
      expect(selectsByTable('tierlist_list_rows')).toHaveLength(1);
      expect(selectsByTable('tierlist_list_pool_items')).toHaveLength(1);
    });

    it('skipRows + skipPoolItems short-circuits to a single lists select', async () => {
      setTableHandler(mockState, 'tierlist_lists', () => ({ data: [makeListRow()], error: null }));

      await queriesApi.fetchRemoteLists('user-skip', {
        includePublic: false,
        includeOwned: true,
        skipPoolItems: true,
        skipRows: true,
      });

      expect(mockState.ops.filter((op) => op.table === 'tierlist_lists' && op.action === 'select')).toHaveLength(1);
      expect(mockState.ops.filter((op) => op.table === 'tierlist_list_rows')).toHaveLength(0);
      expect(mockState.ops.filter((op) => op.table === 'tierlist_list_pool_items')).toHaveLength(0);
    });

    it('skipPoolItems but rows-fetched issues 2 selects (lists + rows only)', async () => {
      setTableHandler(mockState, 'tierlist_lists', () => ({ data: [makeListRow()], error: null }));
      setTableHandler(mockState, 'tierlist_list_rows', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteLists('user-rows-only', {
        includePublic: false,
        includeOwned: true,
        skipPoolItems: true,
        skipRows: false,
      });

      expect(mockState.ops.filter((op) => op.table === 'tierlist_lists' && op.action === 'select')).toHaveLength(1);
      expect(mockState.ops.filter((op) => op.table === 'tierlist_list_rows' && op.action === 'select')).toHaveLength(1);
      expect(mockState.ops.filter((op) => op.table === 'tierlist_list_pool_items')).toHaveLength(0);
    });

    it('forwards ownedLimit/ownedOffset to .range() exactly', async () => {
      setTableHandler(mockState, 'tierlist_lists', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteLists('user-range', {
        includePublic: false,
        includeOwned: true,
        ownedLimit: 25,
        ownedOffset: 50,
        skipRows: true,
        skipPoolItems: true,
      });

      const ownedSelect = mockState.ops.find(
        (op) => op.table === 'tierlist_lists'
          && op.action === 'select'
          && op.filters.some((f) => f.kind === 'eq' && f.col === 'owner_user_id')
      );
      expect(ownedSelect?.range).toEqual([50, 74]);
    });

    it('rows + pool fetch use a single .in(list_id, [...]) batch even for many lists', async () => {
      const listRows = Array.from({ length: 12 }, (_, i) => makeListRow({ id: `lst-${i}` }));
      setTableHandler(mockState, 'tierlist_lists', () => ({ data: listRows, error: null }));
      setTableHandler(mockState, 'tierlist_list_rows', () => ({ data: [], error: null }));
      setTableHandler(mockState, 'tierlist_list_pool_items', () => ({ data: [], error: null }));

      await queriesApi.fetchRemoteLists('user-batch', {
        includePublic: false,
        includeOwned: true,
        skipPoolItems: false,
        skipRows: false,
      });

      const rowSelect = mockState.ops.find((op) => op.table === 'tierlist_list_rows' && op.action === 'select');
      const poolSelect = mockState.ops.find((op) => op.table === 'tierlist_list_pool_items' && op.action === 'select');

      const rowInFilter = rowSelect?.filters.find((f) => f.kind === 'in' && f.col === 'list_id');
      const poolInFilter = poolSelect?.filters.find((f) => f.kind === 'in' && f.col === 'list_id');

      expect(rowInFilter?.vals).toHaveLength(12);
      expect(poolInFilter?.vals).toHaveLength(12);
    });
  });

  describe('loadOwnedTierListStats', () => {
    it('selects only the two columns it needs (template_id, is_public)', async () => {
      setTableHandler(mockState, 'tierlist_lists', () => ({
        data: [
          { template_id: 'tpl-a', is_public: true },
          { template_id: 'tpl-a', is_public: false },
          { template_id: 'tpl-b', is_public: true },
        ],
        error: null,
      }));

      const result = await queriesApi.loadOwnedTierListStats('user-stats');

      const op = mockState.ops.find((entry) => entry.table === 'tierlist_lists' && entry.action === 'select');
      expect(op?.select).toBe('template_id, is_public');
      expect(result.totalCount).toBe(3);
      expect(result.publicCount).toBe(2);
      expect(result.linkedCountByTemplateId).toEqual({ 'tpl-a': 2, 'tpl-b': 1 });
    });

    it('returns a zeroed result without any DB roundtrip when userId is missing', async () => {
      const before = mockState.ops.length;
      const result = await queriesApi.loadOwnedTierListStats(null);
      expect(mockState.ops.length).toBe(before);
      expect(result.totalCount).toBe(0);
      expect(result.publicCount).toBe(0);
    });
  });

  describe('loadListPoolItems', () => {
    it('issues a single select with eq+order — not multiple lookups', async () => {
      setTableHandler(mockState, 'tierlist_list_pool_items', () => ({
        data: [
          { title_id: 7, position: 0 },
          { title_id: 9, position: 1 },
        ],
        error: null,
      }));

      const ids = await queriesApi.loadListPoolItems('list-99');

      const selects = mockState.ops.filter((op) => op.table === 'tierlist_list_pool_items' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].select).toBe('title_id, position');
      expect(selects[0].orders).toEqual([{ col: 'position', options: { ascending: true } }]);
      expect(ids).toEqual([7, 9]);
    });
  });
});
