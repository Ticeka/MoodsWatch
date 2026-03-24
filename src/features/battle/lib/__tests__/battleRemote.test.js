import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_SONG_ENTITY_TYPE } from '../../../../shared/lib/catalogEntities.js';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
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
  },
}));

import { persistRemoteBattleSession } from '../battleRemote.js';

describe('battleRemote persistence hardening', () => {
  beforeEach(() => {
    mockState.operations = [];
    mockState.deleteErrors = new Map();
    mockState.upsertErrors = new Map();
    mockState.selectResponses = new Map();
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

  it('retries session upsert after removing a conflicting duplicate deck row', async () => {
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

    await expect(persistRemoteBattleSession('user-1', session)).resolves.toEqual(session);

    const sessionUpserts = mockState.operations.filter((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');
    const duplicateDeletes = mockState.operations.filter((entry) => entry.table === 'battle_sessions' && entry.action === 'delete');

    expect(sessionUpserts).toHaveLength(2);
    expect(duplicateDeletes[0]?.filters).toEqual(expect.arrayContaining([
      { type: 'eq', column: 'user_id', value: 'user-1' },
      { type: 'eq', column: 'deck_key', value: 'conflict-deck' },
      { type: 'neq', column: 'id', value: session.id },
    ]));
  });

  it('adopts the existing remote session id when the same deck already exists in cloud', async () => {
    let battleSessionUpsertCalls = 0;
    mockState.selectResponses.set('battle_sessions', [
      {
        id: '00000000-0000-4000-8000-000000000099',
        deck_key: 'existing-deck',
        deck_fingerprint: '1:2',
        deck_label: 'Existing deck',
        filters: { entityType: 'title', size: 8 },
        title_ids: [1, 2],
        titles_snapshot: [
          { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
          { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
        ],
        target_rounds: 8,
        history: [],
        ratings: {},
        ranking: null,
        tiers: null,
        winner_title_id: null,
        snapshot: {},
        status: 'active',
        current_pair: { leftId: 1, rightId: 2 },
        created_at: '2026-03-20T00:00:00.000Z',
        updated_at: '2026-03-24T00:00:00.000Z',
        completed_at: null,
      },
    ]);

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
    const sessionUpserts = mockState.operations.filter((entry) => entry.table === 'battle_sessions' && entry.action === 'upsert');
    const selectLookup = mockState.operations.find((entry) => entry.table === 'battle_sessions' && entry.action === 'select');

    expect(selectLookup?.filters).toEqual(expect.arrayContaining([
      { type: 'eq', column: 'user_id', value: 'user-1' },
      { type: 'eq', column: 'deck_key', value: 'existing-deck' },
    ]));
    expect(sessionUpserts).toHaveLength(2);
    expect(sessionUpserts[1]?.payload?.id).toBe('00000000-0000-4000-8000-000000000099');
    expect(persisted.id).toBe('00000000-0000-4000-8000-000000000099');
  });
});
