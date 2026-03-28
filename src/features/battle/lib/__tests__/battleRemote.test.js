import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_SONG_ENTITY_TYPE } from '../../../../shared/lib/catalogEntities.js';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  operations: [],
  deleteErrors: new Map(),
  upsertErrors: new Map(),
  selectResponses: new Map(),
}));

function createFilterBuilder(table, action) {
  const filters = [];
  let committed = false;

  const commit = () => {
    if (!committed) {
      mockState.operations.push({
        table,
        action,
        filters: [...filters],
      });
      committed = true;
    }

    return { error: mockState.deleteErrors.get(table) || null };
  };

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    neq(column, value) {
      filters.push({ type: 'neq', column, value });
      return this;
    },
    gte(column, value) {
      filters.push({ type: 'gte', column, value });
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(commit()).then(resolve, reject);
    },
  };
}

function createSelectBuilder(table) {
  const filters = [];
  let sort = null;
  let limitValue = null;

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    order(column, options) {
      sort = { column, options };
      return this;
    },
    limit(value) {
      limitValue = value;
      return Promise.resolve({
        data: mockState.selectResponses.get(table) || [],
        error: null,
      }).then((result) => {
        mockState.operations.push({
          table,
          action: 'select',
          filters: [...filters],
          sort,
          limit: limitValue,
        });
        return result;
      });
    },
  };
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
    rpc: mockState.rpc,
  },
}));

import { persistRemoteBattleSession } from '../battleRemote.js';

describe('battleRemote persistence hardening', () => {
  beforeEach(() => {
    mockState.operations = [];
    mockState.deleteErrors = new Map();
    mockState.upsertErrors = new Map();
    mockState.selectResponses = new Map();
    mockState.rpc.mockResolvedValue({ data: null, error: null });
    mockState.from.mockImplementation((table) => ({
      select: vi.fn(() => createSelectBuilder(table)),
      upsert: vi.fn(async (payload, options) => {
        mockState.operations.push({
          table,
          action: 'upsert',
          payload,
          options,
        });
        return { error: mockState.upsertErrors.get(table) || null };
      }),
      delete: vi.fn(() => createFilterBuilder(table, 'delete')),
    }));
  });

  it('refreshes the community rollup after persisting a completed session', async () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000099',
      deckKey: 'completed-deck',
      deckFingerprint: '11:22:33',
      deckLabel: 'Completed deck',
      filters: { entityType: 'title', size: 8 },
      titles: [
        { id: 11, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 22, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      titleIds: [11, 22],
      targetRounds: 8,
      history: [],
      ratings: {},
      ranking: [
        { id: 11, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 22, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      tiers: [],
      winnerId: 11,
      snapshot: {},
      fastState: null,
      status: 'completed',
      currentPair: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: '2026-03-24T00:01:00.000Z',
    };

    await persistRemoteBattleSession('user-1', session);

    expect(mockState.rpc).toHaveBeenCalledWith('refresh_battle_deck_rollup', {
      p_deck_fingerprint: '11:22:33',
    });
  });

  it('keeps earlier same-deck sessions instead of deleting them after a successful save', async () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000199',
      deckKey: 'repeatable-deck',
      deckFingerprint: '44:55:66',
      deckLabel: 'Repeatable deck',
      filters: { entityType: 'title', size: 8 },
      titles: [
        { id: 44, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 55, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      titleIds: [44, 55],
      targetRounds: 8,
      history: [],
      ratings: {},
      ranking: [
        { id: 44, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 55, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      tiers: [],
      winnerId: 44,
      snapshot: {},
      fastState: null,
      status: 'completed',
      currentPair: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: '2026-03-24T00:01:00.000Z',
    };

    await persistRemoteBattleSession('user-1', session);

    const sessionDeletes = mockState.operations.filter(
      (entry) => entry.table === 'battle_sessions' && entry.action === 'delete'
    );

    expect(sessionDeletes).toHaveLength(0);
  });

  it('skips canonical-title-only vote syncing for theme song battles and clears winner FK', async () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000001',
      deckKey: 'songs-deck',
      deckFingerprint: '101:102',
      deckLabel: 'Songs deck',
      filters: { entityType: THEME_SONG_ENTITY_TYPE, size: 8 },
      titles: [
        {
          id: 101,
          entityType: THEME_SONG_ENTITY_TYPE,
          song_title: 'Idol',
          title_en: 'Idol',
          title_th: 'Idol',
        },
        {
          id: 102,
          entityType: THEME_SONG_ENTITY_TYPE,
          song_title: 'Mephisto',
          title_en: 'Mephisto',
          title_th: 'Mephisto',
        },
      ],
      titleIds: [101, 102],
      targetRounds: 8,
      history: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          leftId: 101,
          rightId: 102,
          result: 'left',
          createdAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      ratings: {},
      ranking: [
        { id: 101, entityType: THEME_SONG_ENTITY_TYPE, title_en: 'Idol', title_th: 'Idol' },
        { id: 102, entityType: THEME_SONG_ENTITY_TYPE, title_en: 'Mephisto', title_th: 'Mephisto' },
      ],
      tiers: [],
      winnerId: 101,
      snapshot: {},
      fastState: null,
      status: 'completed',
      currentPair: null,
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: '2026-03-24T00:01:00.000Z',
    };

    await persistRemoteBattleSession('user-1', session);

    const sessionUpsert = mockState.operations.find((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');
    const voteUpsert = mockState.operations.find((entry) => entry.table === 'battle_votes' && entry.action === 'upsert');
    const voteDelete = mockState.operations.find((entry) => entry.table === 'battle_votes' && entry.action === 'delete');

    expect(sessionUpsert?.payload?.winner_title_id).toBeNull();
    expect(voteUpsert).toBeUndefined();
    expect(voteDelete?.filters).toEqual(expect.arrayContaining([
      { type: 'eq', column: 'session_id', value: session.id },
      { type: 'eq', column: 'user_id', value: 'user-1' },
      { type: 'gte', column: 'sequence_index', value: 0 },
    ]));
  });

  it('keeps session sync successful when vote cleanup fails after the session upsert', async () => {
    mockState.deleteErrors.set('battle_votes', {
      message: `Could not find the 'sequence_index' column of 'battle_votes' in the schema cache`,
    });

    const session = {
      id: '00000000-0000-4000-8000-000000000002',
      deckKey: 'anime-deck',
      deckFingerprint: '1:2',
      deckLabel: 'Anime deck',
      filters: { entityType: 'title', size: 8 },
      titles: [
        { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      titleIds: [1, 2],
      targetRounds: 8,
      history: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          leftId: 1,
          rightId: 2,
          result: 'left',
          createdAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      ratings: {},
      ranking: null,
      tiers: null,
      winnerId: null,
      snapshot: {},
      fastState: null,
      status: 'active',
      currentPair: { leftId: 1, rightId: 2 },
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: null,
    };

    await expect(persistRemoteBattleSession('user-1', session)).resolves.toEqual(session);

    const sessionUpsert = mockState.operations.find((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');
    const voteUpsert = mockState.operations.find((entry) => entry.table === 'battle_votes' && entry.action === 'upsert');

    expect(sessionUpsert).toBeDefined();
    expect(voteUpsert).toBeUndefined();
  });

  it('retries session upsert with a fresh remote session id when a conflict occurs', async () => {
    mockState.upsertErrors.set('battle_sessions', { status: 409, message: 'duplicate key value violates unique constraint' });
    let battleSessionUpsertCalls = 0;

    mockState.from.mockImplementation((table) => ({
      select: vi.fn(() => createSelectBuilder(table)),
      upsert: vi.fn(async (payload, options) => {
        mockState.operations.push({
          table,
          action: 'upsert',
          payload,
          options,
        });

        if (table === 'battle_sessions') {
          battleSessionUpsertCalls += 1;
          return { error: battleSessionUpsertCalls === 1 ? { status: 409, message: 'duplicate key value violates unique constraint' } : null };
        }

        return { error: null };
      }),
      delete: vi.fn(() => createFilterBuilder(table, 'delete')),
    }));

    const session = {
      id: '00000000-0000-4000-8000-000000000003',
      deckKey: 'conflict-deck',
      deckFingerprint: '1:2',
      deckLabel: 'Conflict deck',
      filters: { entityType: 'title', size: 8 },
      titles: [
        { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      titleIds: [1, 2],
      targetRounds: 8,
      history: [],
      ratings: {},
      ranking: null,
      tiers: null,
      winnerId: null,
      snapshot: {},
      fastState: null,
      status: 'active',
      currentPair: { leftId: 1, rightId: 2 },
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: null,
    };

    const persisted = await persistRemoteBattleSession('user-1', session);

    const sessionUpserts = mockState.operations.filter((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');

    expect(sessionUpserts).toHaveLength(2);
    expect(sessionUpserts[0]?.payload?.deck_key).toBe(`${session.deckKey}::${session.id}`);
    expect(sessionUpserts[1]?.payload?.id).not.toBe(session.id);
    expect(sessionUpserts[1]?.payload?.deck_key).toMatch(/^conflict-deck::/);
    expect(sessionUpserts[1]?.payload?.deck_key).not.toBe(sessionUpserts[0]?.payload?.deck_key);
    expect(persisted.id).toBe(sessionUpserts[1]?.payload?.id);
  });

  it('stores a stable base deck key in snapshot while persisting a unique remote session deck key', async () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000004',
      deckKey: 'existing-deck',
      deckFingerprint: '1:2',
      deckLabel: 'Existing deck',
      filters: { entityType: 'title', size: 8 },
      titles: [
        { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
        { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
      ],
      titleIds: [1, 2],
      targetRounds: 8,
      history: [],
      ratings: {},
      ranking: null,
      tiers: null,
      winnerId: null,
      snapshot: {},
      fastState: null,
      status: 'active',
      currentPair: { leftId: 1, rightId: 2 },
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:01:00.000Z',
      completedAt: null,
    };

    const persisted = await persistRemoteBattleSession('user-1', session);
    const sessionUpsert = mockState.operations.find((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');

    expect(sessionUpsert?.payload?.deck_key).toBe(`${session.deckKey}::${session.id}`);
    expect(sessionUpsert?.payload?.snapshot?.baseDeckKey).toBe(session.deckKey);
    expect(persisted.id).toBe(session.id);
  });
});
