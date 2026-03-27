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
  const state = {
    filters: [],
  };

  const builder = {
    eq: vi.fn((column, value) => {
      state.filters.push({ type: 'eq', column, value });
      return builder;
    }),
    in: vi.fn(async (column, value) => {
      state.filters.push({ type: 'in', column, value });
      if (table === 'tierlist_list_rows') {
        mockState.rowDeletes.push(state.filters.slice());
      } else if (table === 'tierlist_list_pool_items') {
        mockState.poolDeletes.push(state.filters.slice());
      }
      return { error: null };
    }),
  };

  return builder;
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

import { collapseTierTemplatesByIdentity, findTierList, saveTierList } from '../tierlistStore.js';

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

  it('deletes only removed rows and pool items for existing lists', async () => {
    mockState.listUpdateResponses.push({
      data: [{ id: 'tierlist-local-1' }],
      error: null,
    });

    const previousList = makeList({
      rows: [
        { id: 'row-1', label: 'S', titleIds: [1], color: '' },
        { id: 'row-2', label: 'A', titleIds: [4], color: '' },
      ],
      poolTitleIds: [2, 3, 5],
    });
    const nextList = makeList({
      rows: [
        { id: 'row-1', label: 'S', titleIds: [1], color: '' },
      ],
      poolTitleIds: [2],
    });

    await saveTierList(
      nextList,
      { templates: [], lists: [previousList] },
      { userId: 'user-1' }
    );

    expect(mockState.rowDeletes).toEqual([
      [
        { type: 'eq', column: 'list_id', value: 'tierlist-local-1' },
        { type: 'in', column: 'id', value: ['row-2'] },
      ],
    ]);
    expect(mockState.poolDeletes).toEqual([
      [
        { type: 'eq', column: 'list_id', value: 'tierlist-local-1' },
        { type: 'in', column: 'title_id', value: [3, 5] },
      ],
    ]);
  });
});

describe('tierlistStore diff-save (no-op / changed-only / pool guard)', () => {
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

  it('does not upsert rows or pool when nothing changed', async () => {
    mockState.listUpdateResponses.push({ data: [{ id: 'tierlist-local-1' }], error: null });

    const list = makeList({
      rows: [{ id: 'row-1', label: 'S', titleIds: [1, 2], color: '' }],
      poolTitleIds: [3],
    });

    await saveTierList(list, { templates: [], lists: [list] }, { userId: 'user-1' });

    expect(mockState.rowUpserts).toHaveLength(0);
    expect(mockState.poolUpserts).toHaveLength(0);
  });

  it('upserts only the row whose title_ids changed, skips unchanged rows', async () => {
    mockState.listUpdateResponses.push({ data: [{ id: 'tierlist-local-1' }], error: null });

    const previousList = makeList({
      rows: [
        { id: 'row-1', label: 'S', titleIds: [1, 2], color: '' },
        { id: 'row-2', label: 'A', titleIds: [3], color: '' },
      ],
      poolTitleIds: [],
    });
    const nextList = makeList({
      rows: [
        { id: 'row-1', label: 'S', titleIds: [2, 1], color: '' }, // order changed
        { id: 'row-2', label: 'A', titleIds: [3], color: '' },    // unchanged
      ],
      poolTitleIds: [],
    });

    await saveTierList(nextList, { templates: [], lists: [previousList] }, { userId: 'user-1' });

    expect(mockState.rowUpserts).toHaveLength(1);
    // Only row-1 (whose title_ids changed order) should appear in the upsert payload
    const upsertedIds = mockState.rowUpserts[0].map((r) => r.id);
    expect(upsertedIds).toContain('row-1');
    expect(upsertedIds).not.toContain('row-2');
  });

  it('does not upsert pool when pool is identical', async () => {
    mockState.listUpdateResponses.push({ data: [{ id: 'tierlist-local-1' }], error: null });

    const list = makeList({
      rows: [{ id: 'row-1', label: 'S', titleIds: [99], color: '' }],
      poolTitleIds: [10, 20],
    });
    const nextList = makeList({
      rows: [{ id: 'row-1', label: 'S', titleIds: [99], color: 'red' }], // row changed
      poolTitleIds: [10, 20], // pool unchanged
    });

    await saveTierList(nextList, { templates: [], lists: [list] }, { userId: 'user-1' });

    // Row should be upserted (color changed), pool should not
    expect(mockState.rowUpserts).toHaveLength(1);
    expect(mockState.poolUpserts).toHaveLength(0);
  });
});

describe('tierlistStore template identity collapse', () => {
  it('keeps the strongest template and maps stale copies back to it', () => {
    const canonical = makeTemplate({
      id: 'template-owned',
      ownerUserId: 'user-1',
      plays: 12,
      updatedAt: '2026-03-02T00:00:00.000Z',
    });
    const staleLocal = makeTemplate({
      id: 'template-local-stale',
      ownerUserId: null,
      plays: 0,
      updatedAt: '2026-03-01T00:00:00.000Z',
    });

    const result = collapseTierTemplatesByIdentity([staleLocal, canonical]);

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]?.id).toBe('template-owned');
    expect(result.canonicalIdById.get('template-owned')).toBe('template-owned');
    expect(result.canonicalIdById.get('template-local-stale')).toBe('template-owned');
  });
});

describe('tierlistStore entity type normalization', () => {
  it('inherits a non-title entity type from the linked template when the list falls back to title', () => {
    const template = makeTemplate({
      id: 'template-song-1',
      category: 'songs',
      entityType: 'theme_song',
      titleIds: [1013, 1014, 1015],
    });
    const list = makeList({
      id: 'tierlist-song-1',
      templateId: 'template-song-1',
      entityType: 'title',
      poolTitleIds: [1013, 1014, 1015],
    });

    const resolved = findTierList('tierlist-song-1', {
      templates: [template],
      lists: [list],
    });

    expect(resolved?.entityType).toBe('theme_song');
  });
});
