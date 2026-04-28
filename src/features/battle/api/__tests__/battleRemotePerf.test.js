// Performance characteristics of the battle remote (sessions / public decks)
// query layer.
//
// What we assert:
//   1. Session reads use a bounded .limit() and ordered scan — no full-table.
//   2. Single-session lookups use eq(user_id) + eq(id) + maybeSingle.
//   3. Public deck browse uses .range(offset, offset+limit-1) — exact window.
//   4. Public deck "my decks" filters on owner_user_id, no extra fanout.
//   5. Community rollup lookup is a single eq(deck_fingerprint) + maybeSingle.
//   6. Increment play count is one RPC and never falls back to a fetch+update.
//   7. Persisting a *completed* session triggers exactly one rollup-refresh
//      RPC; persisting an *active* session triggers zero.
//   8. Select column lists are explicit (no `*`).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  attachDefaultRecorder,
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

const battleRemoteApi = await import('../battleRemoteApi.js');

function makeSession(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000abc',
    deckKey: 'deck-key',
    deckFingerprint: '1:2:3',
    deckLabel: 'Deck label',
    filters: { entityType: 'title', size: 8 },
    titles: [
      { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
      { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
      { id: 3, entityType: 'title', title_en: 'C', title_th: 'C' },
    ],
    titleIds: [1, 2, 3],
    targetRounds: 8,
    history: [],
    ratings: {},
    ranking: null,
    tiers: null,
    winnerId: null,
    snapshot: {},
    fastState: null,
    status: 'active',
    currentPair: null,
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:01:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

describe('battle remote — query performance', () => {
  beforeEach(() => {
    resetMockState(mockState);
    attachDefaultRecorder(mockState);
  });

  describe('fetchRemoteBattleSessions', () => {
    it('issues one bounded select with ordering and a default limit of 20', async () => {
      setTableHandler(mockState, 'battle_sessions', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchRemoteBattleSessions('user-1');

      const selects = mockState.ops.filter((op) => op.table === 'battle_sessions' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].limit).toBe(20);
      expect(selects[0].orders).toEqual([{ col: 'updated_at', options: { ascending: false } }]);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'user_id' && f.val === 'user-1')
      ).toBe(true);
    });

    it('honors a caller-provided limit', async () => {
      setTableHandler(mockState, 'battle_sessions', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchRemoteBattleSessions('user-1', { limit: 50 });

      const select = mockState.ops.find((op) => op.table === 'battle_sessions' && op.action === 'select');
      expect(select.limit).toBe(50);
    });

    it('returns immediately for a missing userId — no DB roundtrip', async () => {
      const before = mockState.ops.length;
      const result = await battleRemoteApi.fetchRemoteBattleSessions(null);
      expect(result).toEqual([]);
      expect(mockState.ops.length).toBe(before);
    });

    it('uses an explicit column list (never select-*)', async () => {
      setTableHandler(mockState, 'battle_sessions', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchRemoteBattleSessions('user-explicit');

      const select = mockState.ops.find((op) => op.table === 'battle_sessions' && op.action === 'select');
      expect(select.select).not.toBe('*');
      expect(select.select).toContain('id');
      expect(select.select).toContain('deck_fingerprint');
      expect(select.select).toContain('history');
    });
  });

  describe('fetchRemoteBattleSession', () => {
    it('uses two eq filters + maybeSingle (one row)', async () => {
      setTableHandler(mockState, 'battle_sessions', () => ({
        data: { id: 'sid-1', user_id: 'user-1', titles_snapshot: [], title_ids: [] },
        error: null,
      }));

      await battleRemoteApi.fetchRemoteBattleSession('user-1', 'sid-1');

      const selects = mockState.ops.filter((op) => op.table === 'battle_sessions' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].maybeSingle).toBe(true);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'user_id' && f.val === 'user-1')
      ).toBe(true);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'id' && f.val === 'sid-1')
      ).toBe(true);
      // No range, no limit — maybeSingle implies a single-row read.
      expect(selects[0].limit).toBeNull();
      expect(selects[0].range).toBeNull();
    });

    it('skips the roundtrip when sessionId is missing', async () => {
      const before = mockState.ops.length;
      const result = await battleRemoteApi.fetchRemoteBattleSession('user-1', '');
      expect(result).toBeNull();
      expect(mockState.ops.length).toBe(before);
    });
  });

  describe('fetchPublicBattleDecks', () => {
    it('uses .range(offset, offset+limit-1) for the requested window', async () => {
      setTableHandler(mockState, 'battle_public_decks', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchPublicBattleDecks({ limit: 24, offset: 48 });

      const select = mockState.ops.find((op) => op.table === 'battle_public_decks' && op.action === 'select');
      expect(select.range).toEqual([48, 71]);
      expect(select.orders).toEqual([{ col: 'updated_at', options: { ascending: false } }]);
    });

    it('uses default range [0,23] when no params are passed', async () => {
      setTableHandler(mockState, 'battle_public_decks', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchPublicBattleDecks();

      const select = mockState.ops.find((op) => op.table === 'battle_public_decks' && op.action === 'select');
      expect(select.range).toEqual([0, 23]);
    });

    it('issues one query for the happy path (no preflight, no count query)', async () => {
      setTableHandler(mockState, 'battle_public_decks', () => ({
        data: [
          { id: 'd1', owner_user_id: 'u1', deck_key: 'k1', deck_fingerprint: '1:2', deck_label: 'A', titles_snapshot: [], title_ids: [] },
        ],
        error: null,
      }));

      await battleRemoteApi.fetchPublicBattleDecks({ limit: 10, offset: 0 });

      const selects = mockState.ops.filter((op) => op.table === 'battle_public_decks' && op.action === 'select');
      expect(selects).toHaveLength(1);
    });

    it('returns empty (no extra roundtrips) when the table is missing from the schema', async () => {
      // isMissingRelation matches an error mentioning the table name in
      // single quotes — the function should bail out without throwing or
      // issuing follow-up queries.
      setTableHandler(mockState, 'battle_public_decks', () => ({
        data: null,
        error: { status: 404, message: `relation 'battle_public_decks' does not exist` },
      }));

      const result = await battleRemoteApi.fetchPublicBattleDecks({ limit: 5, offset: 0 });

      expect(result).toEqual([]);
      const selects = mockState.ops.filter((op) => op.table === 'battle_public_decks' && op.action === 'select');
      expect(selects).toHaveLength(1);
    });
  });

  describe('fetchMyPublicBattleDecks', () => {
    it('issues one ordered select scoped by owner_user_id', async () => {
      setTableHandler(mockState, 'battle_public_decks', () => ({ data: [], error: null }));

      await battleRemoteApi.fetchMyPublicBattleDecks('user-9');

      const selects = mockState.ops.filter((op) => op.table === 'battle_public_decks' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'owner_user_id' && f.val === 'user-9')
      ).toBe(true);
      expect(selects[0].orders).toEqual([{ col: 'updated_at', options: { ascending: false } }]);
    });
  });

  describe('fetchBattleCommunityRollup', () => {
    it('is one eq(deck_fingerprint) + maybeSingle, never a scan', async () => {
      setTableHandler(mockState, 'battle_deck_rollups', () => ({
        data: { deck_fingerprint: '1:2:3' },
        error: null,
      }));

      const rollup = await battleRemoteApi.fetchBattleCommunityRollup('1:2:3');

      const selects = mockState.ops.filter((op) => op.table === 'battle_deck_rollups' && op.action === 'select');
      expect(selects).toHaveLength(1);
      expect(selects[0].maybeSingle).toBe(true);
      expect(
        selects[0].filters.some((f) => f.kind === 'eq' && f.col === 'deck_fingerprint' && f.val === '1:2:3')
      ).toBe(true);
      expect(rollup).toEqual({ deck_fingerprint: '1:2:3' });
    });

    it('skips the roundtrip for empty fingerprint', async () => {
      const before = mockState.ops.length;
      const rollup = await battleRemoteApi.fetchBattleCommunityRollup('');
      expect(rollup).toBeNull();
      expect(mockState.ops.length).toBe(before);
    });
  });

  describe('incrementRemotePublicBattleDeckPlayCount', () => {
    it('issues exactly one RPC and no DB roundtrip', async () => {
      setRpcHandler(mockState, 'increment_battle_public_deck_play_count', () => ({ data: null, error: null }));

      await battleRemoteApi.incrementRemotePublicBattleDeckPlayCount('deck-7');

      expect(mockState.rpcCalls.filter((c) => c.name === 'increment_battle_public_deck_play_count')).toHaveLength(1);
      expect(mockState.rpcCalls[0].params).toEqual({ p_deck_id: 'deck-7' });
      expect(mockState.ops.filter((op) => op.table === 'battle_public_decks')).toHaveLength(0);
    });

    it('skips the call entirely when deckId is empty', async () => {
      await battleRemoteApi.incrementRemotePublicBattleDeckPlayCount('');
      expect(mockState.rpcCalls).toHaveLength(0);
    });
  });

  describe('persistRemoteBattleSession — rollup refresh discipline', () => {
    it('completed session: one rollup-refresh RPC', async () => {
      setRpcHandler(mockState, 'refresh_battle_deck_rollup', () => ({ data: null, error: null }));

      await battleRemoteApi.persistRemoteBattleSession('user-1', makeSession({
        status: 'completed',
        completedAt: '2026-04-27T00:05:00.000Z',
        winnerId: 1,
        ranking: [
          { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
          { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
          { id: 3, entityType: 'title', title_en: 'C', title_th: 'C' },
        ],
      }));

      const refreshCalls = mockState.rpcCalls.filter((c) => c.name === 'refresh_battle_deck_rollup');
      expect(refreshCalls).toHaveLength(1);
      expect(refreshCalls[0].params).toEqual({ p_deck_fingerprint: '1:2:3' });
    });

    it('active session: zero rollup-refresh RPCs', async () => {
      setRpcHandler(mockState, 'refresh_battle_deck_rollup', () => ({ data: null, error: null }));

      await battleRemoteApi.persistRemoteBattleSession('user-1', makeSession({ status: 'active' }));

      expect(mockState.rpcCalls.filter((c) => c.name === 'refresh_battle_deck_rollup')).toHaveLength(0);
    });
  });

  describe('deleteRemoteBattleSession', () => {
    it('issues exactly one delete with eq(user_id) and eq(id)', async () => {
      setTableHandler(mockState, 'battle_sessions', () => ({ data: null, error: null }));

      await battleRemoteApi.deleteRemoteBattleSession('user-7', 'sid-7');

      const deletes = mockState.ops.filter((op) => op.table === 'battle_sessions' && op.action === 'delete');
      expect(deletes).toHaveLength(1);
      expect(
        deletes[0].filters.some((f) => f.kind === 'eq' && f.col === 'user_id' && f.val === 'user-7')
      ).toBe(true);
      expect(
        deletes[0].filters.some((f) => f.kind === 'eq' && f.col === 'id' && f.val === 'sid-7')
      ).toBe(true);
    });

    it('skips the roundtrip when sessionId is empty', async () => {
      const before = mockState.ops.length;
      await battleRemoteApi.deleteRemoteBattleSession('user-7', '');
      expect(mockState.ops.length).toBe(before);
    });
  });
});
