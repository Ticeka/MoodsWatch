import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  listUpdateResponses: [],
  listInsertResponses: [],
  listUpdatePayloads: [],
  listInsertPayloads: [],
  rowUpserts: [],
  poolUpserts: [],
  rowDeletes: [],
  poolDeletes: [],
}));

function nextResponse(queue, fallback) {
  return queue.length > 0 ? queue.shift() : fallback;
}

function createDeleteBuilder(table) {
  return {
    eq: vi.fn(async (column, value) => {
      if (table === 'tierlist_list_rows') {
        mockState.rowDeletes.push({ column, value });
      } else if (table === 'tierlist_list_pool_items') {
        mockState.poolDeletes.push({ column, value });
      }
      return { error: null };
    }),
  };
}

function createTableClient(table) {
  if (table === 'tierlist_lists') {
    return {
      update: vi.fn((payload) => {
        mockState.listUpdatePayloads.push(payload);
        return {
          eq: vi.fn(() => ({
            select: vi.fn(async () => nextResponse(
              mockState.listUpdateResponses,
              { data: [], error: null }
            )),
          })),
        };
      }),
      insert: vi.fn((payload) => {
        mockState.listInsertPayloads.push(payload);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => nextResponse(
              mockState.listInsertResponses,
              { data: payload, error: null }
            )),
          })),
        };
      }),
    };
  }

  if (table === 'tierlist_list_rows') {
    return {
      delete: vi.fn(() => createDeleteBuilder(table)),
      upsert: vi.fn(async (payload) => {
        mockState.rowUpserts.push(payload);
        return { error: null };
      }),
    };
  }

  if (table === 'tierlist_list_pool_items') {
    return {
      delete: vi.fn(() => createDeleteBuilder(table)),
      upsert: vi.fn(async (payload) => {
        mockState.poolUpserts.push(payload);
        return { error: null };
      }),
    };
  }

  return {
    select: vi.fn(async () => ({ data: [], error: null })),
  };
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
  },
}));

vi.mock('@/shared/lib/catalogEntities', () => ({
  TITLE_ENTITY_TYPE: 'title',
  CHARACTER_ENTITY_TYPE: 'character',
  THEME_SONG_ENTITY_TYPE: 'theme_song',
  normalizeCatalogEntityType: (value) => (value ? String(value) : 'title'),
}), { virtual: true });

import { saveTierList } from '../tierlistStore.js';

function makeTemplate(overrides = {}) {
  return {
    id: 'template-public-stale',
    title: 'Template',
    description: '',
    category: 'general',
    entityType: 'title',
    titleIds: [1, 2, 3],
    defaultRows: ['S', 'A'],
    isPublic: true,
    isSystem: false,
    plays: 0,
    ownerUserId: 'owner-1',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeList(overrides = {}) {
  return {
    id: 'tierlist-local-1',
    templateId: '',
    title: 'My Tier List',
    description: '',
    entityType: 'title',
    rows: [{ id: 'row-1', label: 'S', titleIds: [1], color: '' }],
    poolTitleIds: [2, 3],
    isPublic: false,
    playCount: 0,
    ownerName: 'You',
    ownerUsername: 'you',
    ownerUserId: 'user-1',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tierlistStore saveTierList recovery', () => {
  beforeEach(() => {
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.rowUpserts = [];
    mockState.poolUpserts = [];
    mockState.rowDeletes = [];
    mockState.poolDeletes = [];
    mockState.from.mockImplementation((table) => createTableClient(table));
  });

  it('keeps template_id when the local library does not have the template yet', async () => {
    const library = { templates: [], lists: [] };

    await saveTierList(
      makeList({ templateId: 'missing-template' }),
      library,
      { userId: 'user-1' }
    );

    expect(mockState.listInsertPayloads).toHaveLength(1);
    expect(mockState.listInsertPayloads[0]?.template_id).toBe('missing-template');
  });

  it('retries with template_id null when remote insert returns FK violation (23503)', async () => {
    mockState.listInsertResponses.push(
      {
        data: null,
        error: {
          status: 409,
          code: '23503',
          details: 'Key is not present in table "tierlist_templates".',
          message: 'insert or update on table "tierlist_lists" violates foreign key constraint',
        },
      },
      {
        data: null,
        error: null,
      }
    );

    const library = { templates: [makeTemplate()], lists: [] };
    const saved = await saveTierList(
      makeList({ templateId: 'template-public-stale' }),
      library,
      { userId: 'user-1' }
    );

    expect(mockState.listInsertPayloads).toHaveLength(2);
    expect(mockState.listInsertPayloads[0]?.template_id).toBe('template-public-stale');
    expect(mockState.listInsertPayloads[1]?.template_id).toBeNull();
    expect(saved.lists[0]?.templateId).toBe('');
  });

  it('treats bare HTTP 409 as recoverable and rekeys without dropping template_id', async () => {
    mockState.listInsertResponses.push(
      {
        data: null,
        error: {
          status: 409,
          message: 'Conflict',
        },
      },
      {
        data: null,
        error: null,
      }
    );

    const library = { templates: [makeTemplate()], lists: [] };

    await saveTierList(
      makeList({ templateId: 'template-public-stale' }),
      library,
      { userId: 'user-1' }
    );

    expect(mockState.listInsertPayloads).toHaveLength(2);
    expect(mockState.listInsertPayloads[0]?.template_id).toBe('template-public-stale');
    expect(mockState.listInsertPayloads[1]?.template_id).toBe('template-public-stale');
    expect(mockState.listInsertPayloads[1]?.id).not.toBe(mockState.listInsertPayloads[0]?.id);
  });
});
