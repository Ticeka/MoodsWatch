import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  templateUpdateResponses: [],
  templateInsertResponses: [],
  templateUpdatePayloads: [],
  templateInsertPayloads: [],
  templateSelectResponses: [],
  templateSelectCalls: [],
  listUpdateResponses: [],
  listInsertResponses: [],
  listUpdatePayloads: [],
  listInsertPayloads: [],
  listSelectResponses: [],
  listSelectCalls: [],
  rowSelectResponses: [],
  rowSelectCalls: [],
  poolSelectResponses: [],
  poolSelectCalls: [],
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

function createSelectBuilder(table, responseQueue, fallbackResponse, callLog) {
  const state = {
    filters: [],
  };

  const builder = Promise.resolve().then(() => {
    callLog.push({
      table,
      filters: state.filters.slice(),
    });
    return nextResponse(responseQueue, fallbackResponse);
  });

  builder.eq = vi.fn((column, value) => {
    state.filters.push({ type: 'eq', column, value });
    return builder;
  });
  builder.neq = vi.fn((column, value) => {
    state.filters.push({ type: 'neq', column, value });
    return builder;
  });
  builder.order = vi.fn((column, options) => {
    state.filters.push({ type: 'order', column, options });
    return builder;
  });
  builder.or = vi.fn((expression) => {
    state.filters.push({ type: 'or', expression });
    return builder;
  });
  builder.limit = vi.fn((value) => {
    state.filters.push({ type: 'limit', value });
    return builder;
  });
  builder.in = vi.fn((column, value) => {
    state.filters.push({ type: 'in', column, value });
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => {
    callLog.push({
      table,
      filters: [...state.filters, { type: 'maybeSingle' }],
    });
    return nextResponse(responseQueue, fallbackResponse);
  });
  builder.single = vi.fn(async () => {
    callLog.push({
      table,
      filters: [...state.filters, { type: 'single' }],
    });
    return nextResponse(responseQueue, fallbackResponse);
  });

  return builder;
}

function createTableClient(table) {
  if (table === 'tierlist_templates') {
    return {
      select: vi.fn(() => createSelectBuilder(
        table,
        mockState.templateSelectResponses,
        { data: [], error: null },
        mockState.templateSelectCalls
      )),
      update: vi.fn((payload) => {
        mockState.templateUpdatePayloads.push(payload);
        return {
          eq: vi.fn(() => ({
            select: vi.fn(async () => nextResponse(
              mockState.templateUpdateResponses,
              { data: [], error: null }
            )),
          })),
        };
      }),
      insert: vi.fn((payload) => {
        mockState.templateInsertPayloads.push(payload);
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => nextResponse(
              mockState.templateInsertResponses,
              { data: payload, error: null }
            )),
            maybeSingle: vi.fn(async () => nextResponse(
              mockState.templateInsertResponses,
              { data: payload, error: null }
            )),
          })),
        };
      }),
    };
  }

  if (table === 'tierlist_lists') {
    return {
      select: vi.fn(() => createSelectBuilder(
        table,
        mockState.listSelectResponses,
        { data: [], error: null },
        mockState.listSelectCalls
      )),
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
      select: vi.fn(() => createSelectBuilder(
        table,
        mockState.rowSelectResponses,
        { data: [], error: null },
        mockState.rowSelectCalls
      )),
      delete: vi.fn(() => createDeleteBuilder(table)),
      upsert: vi.fn(async (payload) => {
        mockState.rowUpserts.push(payload);
        return { error: null };
      }),
    };
  }

  if (table === 'tierlist_list_pool_items') {
    return {
      select: vi.fn(() => createSelectBuilder(
        table,
        mockState.poolSelectResponses,
        { data: [], error: null },
        mockState.poolSelectCalls
      )),
      delete: vi.fn(() => createDeleteBuilder(table)),
      upsert: vi.fn(async (payload) => {
        mockState.poolUpserts.push(payload);
        return { error: null };
      }),
    };
  }

  return {
    select: vi.fn(() => createSelectBuilder(
      table,
      [],
      { data: [], error: null },
      []
    )),
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
  YOUTUBE_ENTITY_TYPE: 'youtube',
  normalizeCatalogEntityType: (value) => (value ? String(value) : 'title'),
}), { virtual: true });

import { collapseTierTemplatesByIdentity, findTierList, loadTierLibrary, loadTierTemplates, saveTierList, saveTierTemplate } from '../tierlistStore.js';

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
    mockState.templateUpdateResponses = [];
    mockState.templateInsertResponses = [];
    mockState.templateUpdatePayloads = [];
    mockState.templateInsertPayloads = [];
    mockState.templateSelectResponses = [];
    mockState.templateSelectCalls = [];
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.listSelectResponses = [];
    mockState.listSelectCalls = [];
    mockState.rowSelectResponses = [];
    mockState.rowSelectCalls = [];
    mockState.poolSelectResponses = [];
    mockState.poolSelectCalls = [];
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

  it('saves template first then retries list with original template_id on FK violation (23503)', async () => {
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

    // Template should be saved first to satisfy the FK constraint
    expect(mockState.templateInsertPayloads).toHaveLength(1);
    // List should be retried with the original template_id preserved
    expect(mockState.listInsertPayloads).toHaveLength(2);
    expect(mockState.listInsertPayloads[0]?.template_id).toBe('template-public-stale');
    expect(mockState.listInsertPayloads[1]?.template_id).toBe('template-public-stale');
    expect(saved.lists[0]?.templateId).toBe('template-public-stale');
  });

  it('falls back to stripping template_id when template save also fails on FK violation', async () => {
    mockState.templateInsertResponses.push({ data: null, error: { status: 500, message: 'template save failed' } });
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

  it('upserts all rows and pool items on first remote INSERT even when previousList has matching data', async () => {
    // Simulate: list exists only locally (update finds 0 rows → INSERT path)
    // previousList has same rows as nextList — without the fix, diff would be empty and rows never reach remote
    const list = makeList({
      rows: [
        { id: 'row-1', label: 'S', titleIds: [1], color: '' },
        { id: 'row-2', label: 'A', titleIds: [2], color: '' },
      ],
      poolTitleIds: [3, 4],
    });

    await saveTierList(
      list,
      { templates: [], lists: [list] },  // previousList == list (same rows)
      { userId: 'user-1' }
    );

    // List should be inserted (update returned empty)
    expect(mockState.listInsertPayloads).toHaveLength(1);
    // All rows must be upserted — not skipped because diff thought nothing changed
    expect(mockState.rowUpserts).toHaveLength(1);
    expect(mockState.rowUpserts[0]).toHaveLength(2);
    // Pool must be upserted too
    expect(mockState.poolUpserts).toHaveLength(1);
    expect(mockState.poolUpserts[0]).toHaveLength(2);
  });

  it('force-writes all rows and pool on publish even when previousList has identical data', async () => {
    // Simulate: list exists in DB (UPDATE succeeds) but tierlist_list_rows is empty due to prior bug.
    // previousList (from local draft) has the same rows — without the fix, diff would be empty.
    mockState.listUpdateResponses.push({
      data: [{ id: 'tierlist-local-1' }],
      error: null,
    });

    const privateList = makeList({
      isPublic: false,
      rows: [
        { id: 'row-1', label: 'S', titleIds: [1], color: '' },
        { id: 'row-2', label: 'A', titleIds: [2], color: '' },
      ],
      poolTitleIds: [3],
    });
    const publishedList = { ...privateList, isPublic: true };

    await saveTierList(
      publishedList,
      { templates: [], lists: [privateList] }, // previousList is private w/ same rows
      { userId: 'user-1' }
    );

    // All rows must be force-written when publishing
    expect(mockState.rowUpserts).toHaveLength(1);
    expect(mockState.rowUpserts[0]).toHaveLength(2);
    expect(mockState.poolUpserts).toHaveLength(1);
    expect(mockState.poolUpserts[0]).toHaveLength(1);
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

describe('tierlistStore template preview settings', () => {
  beforeEach(() => {
    mockState.templateUpdateResponses = [];
    mockState.templateInsertResponses = [];
    mockState.templateUpdatePayloads = [];
    mockState.templateInsertPayloads = [];
    mockState.templateSelectResponses = [];
    mockState.templateSelectCalls = [];
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.listSelectResponses = [];
    mockState.listSelectCalls = [];
    mockState.rowSelectResponses = [];
    mockState.rowSelectCalls = [];
    mockState.poolSelectResponses = [];
    mockState.poolSelectCalls = [];
    mockState.rowUpserts = [];
    mockState.poolUpserts = [];
    mockState.rowDeletes = [];
    mockState.poolDeletes = [];
    mockState.from.mockImplementation((table) => createTableClient(table));
  });

  it('persists manual cover framing fields when remote columns are available', async () => {
    await saveTierTemplate(
      makeTemplate({
        previewArtworkUrl: 'https://cdn.example.com/cover.jpg',
        manualPreviewArtworkUrl: 'https://cdn.example.com/cover.jpg',
        previewArtworkFit: 'cover',
        previewArtworkPosition: 'center',
        previewArtworkScale: 1.8,
        previewArtworkOffsetX: 12,
        previewArtworkOffsetY: -8,
      }),
      { templates: [], lists: [] },
      { userId: 'user-1' }
    );

    expect(mockState.templateInsertPayloads).toHaveLength(1);
    expect(mockState.templateInsertPayloads[0]).toMatchObject({
      preview_artwork_url: 'https://cdn.example.com/cover.jpg',
      manual_preview_artwork_url: 'https://cdn.example.com/cover.jpg',
      preview_artwork_fit: 'cover',
      preview_artwork_position: 'center',
      preview_artwork_scale: 1.8,
      preview_artwork_offset_x: 12,
      preview_artwork_offset_y: -8,
    });
  });

  it('retries without preview-setting columns when the database schema is older', async () => {
    mockState.templateUpdateResponses.push(
      {
        data: null,
        error: {
          message: 'column "manual_preview_artwork_url" of relation "tierlist_templates" does not exist',
        },
      },
      {
        data: [],
        error: null,
      }
    );

    await saveTierTemplate(
      makeTemplate({
        previewArtworkUrl: 'https://cdn.example.com/cover.jpg',
        manualPreviewArtworkUrl: 'https://cdn.example.com/cover.jpg',
        previewArtworkFit: 'cover',
        previewArtworkPosition: 'center',
        previewArtworkScale: 2,
        previewArtworkOffsetX: -10,
        previewArtworkOffsetY: 6,
      }),
      { templates: [], lists: [] },
      { userId: 'user-1' }
    );

    expect(mockState.templateUpdatePayloads).toHaveLength(2);
    expect(mockState.templateUpdatePayloads[0]).toHaveProperty('manual_preview_artwork_url');
    expect(mockState.templateUpdatePayloads[0]).toHaveProperty('preview_artwork_scale');
    expect(mockState.templateUpdatePayloads[1]).not.toHaveProperty('manual_preview_artwork_url');
    expect(mockState.templateUpdatePayloads[1]).not.toHaveProperty('preview_artwork_scale');
    expect(mockState.templateInsertPayloads[0]).not.toHaveProperty('manual_preview_artwork_url');
  });

  it('does not clone an existing template into a new id when a repeated save hits a conflict', async () => {
    mockState.templateUpdateResponses.push({
      data: [],
      error: null,
    });
    mockState.templateInsertResponses.push({
      data: null,
      error: {
        status: 409,
        message: 'duplicate key value violates unique constraint',
      },
    });

    const existingTemplate = makeTemplate({
      id: 'template-existing',
      ownerUserId: 'user-1',
      title: 'Existing template',
    });

    await expect(saveTierTemplate(
      { ...existingTemplate, title: 'Existing template updated' },
      { templates: [existingTemplate], lists: [] },
      { userId: 'user-1', preserveOwnership: true }
    )).rejects.toMatchObject({
      status: 409,
    });

    expect(mockState.templateInsertPayloads).toHaveLength(1);
    expect(mockState.templateInsertPayloads[0]?.id).toBe('template-existing');
  });

  it('does not clone an existing list into a new id when a repeated save hits a conflict', async () => {
    mockState.listUpdateResponses.push({
      data: [],
      error: null,
    });
    mockState.listInsertResponses.push({
      data: null,
      error: {
        status: 409,
        message: 'duplicate key value violates unique constraint',
      },
    });

    const existingList = makeList({
      id: 'tierlist-existing',
      ownerUserId: 'user-1',
      title: 'Existing ranking',
    });

    await expect(saveTierList(
      { ...existingList, title: 'Existing ranking updated' },
      { templates: [], lists: [existingList] },
      { userId: 'user-1' }
    )).rejects.toMatchObject({
      status: 409,
    });

    expect(mockState.listInsertPayloads).toHaveLength(1);
    expect(mockState.listInsertPayloads[0]?.id).toBe('tierlist-existing');
  });
});

describe('tierlistStore diff-save (no-op / changed-only / pool guard)', () => {
  beforeEach(() => {
    mockState.templateUpdateResponses = [];
    mockState.templateInsertResponses = [];
    mockState.templateUpdatePayloads = [];
    mockState.templateInsertPayloads = [];
    mockState.templateSelectResponses = [];
    mockState.templateSelectCalls = [];
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.listSelectResponses = [];
    mockState.listSelectCalls = [];
    mockState.rowSelectResponses = [];
    mockState.rowSelectCalls = [];
    mockState.poolSelectResponses = [];
    mockState.poolSelectCalls = [];
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

describe('tierlistStore load performance guards', () => {
  const originalWindow = globalThis.window;
  const storage = new Map();

  beforeEach(() => {
    mockState.templateUpdateResponses = [];
    mockState.templateInsertResponses = [];
    mockState.templateUpdatePayloads = [];
    mockState.templateInsertPayloads = [];
    mockState.templateSelectResponses = [];
    mockState.templateSelectCalls = [];
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.listSelectResponses = [];
    mockState.listSelectCalls = [];
    mockState.rowSelectResponses = [];
    mockState.rowSelectCalls = [];
    mockState.poolSelectResponses = [];
    mockState.poolSelectCalls = [];
    mockState.rowUpserts = [];
    mockState.poolUpserts = [];
    mockState.rowDeletes = [];
    mockState.poolDeletes = [];
    mockState.from.mockImplementation((table) => createTableClient(table));
    storage.clear();
    globalThis.window = {
      localStorage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => {
          storage.set(key, value);
        },
        removeItem: (key) => {
          storage.delete(key);
        },
      },
    };
  });

  afterAll(() => {
    globalThis.window = originalWindow;
  });

  it('does not sync local tierlist data to Supabase during read-only library loads', async () => {
    storage.set('moodtoon-tierlist-v3', JSON.stringify({
      templates: [makeTemplate({ id: 'template-local-1', ownerUserId: null })],
      lists: [makeList({ id: 'tierlist-local-1', templateId: 'template-local-1', ownerUserId: null })],
    }));

    await loadTierLibrary([], { userId: 'user-1' });

    expect(mockState.templateInsertPayloads).toHaveLength(0);
    expect(mockState.templateUpdatePayloads).toHaveLength(0);
    expect(mockState.listInsertPayloads).toHaveLength(0);
    expect(mockState.listUpdatePayloads).toHaveLength(0);
  });

  it('reuses tierlist template fetches until a mutation invalidates the cache', async () => {
    mockState.templateSelectResponses.push(
      {
        data: [
          {
            id: 'template-public-1',
            title: 'Cached template',
            description: '',
            category: 'general',
            title_ids: [1, 2, 3],
            default_rows: ['S', 'A'],
            is_public: true,
            is_system: false,
            plays: 0,
            owner_user_id: null,
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'template-public-2',
            title: 'After invalidation',
            description: '',
            category: 'general',
            title_ids: [4, 5, 6],
            default_rows: ['S', 'A'],
            is_public: true,
            is_system: false,
            plays: 0,
            owner_user_id: null,
            created_at: '2026-03-02T00:00:00.000Z',
            updated_at: '2026-03-02T00:00:00.000Z',
          },
        ],
        error: null,
      }
    );

    const first = await loadTierTemplates([]);
    const second = await loadTierTemplates([]);
    expect(first[0]?.id).toBe('template-public-1');
    expect(second[0]?.id).toBe('template-public-1');
    expect(mockState.templateSelectCalls).toHaveLength(1);

    await saveTierTemplate(makeTemplate({ id: 'template-local-new', ownerUserId: null }), null, { userId: null });

    const third = await loadTierTemplates([]);
    expect(third.some((template) => template.id === 'template-public-2')).toBe(true);
    expect(mockState.templateSelectCalls).toHaveLength(2);
  });

  it('skips owned tierlist queries when browse only needs public data', async () => {
    mockState.templateSelectResponses.push({
      data: [
        {
          id: 'template-public-browse',
          title: 'Browse Template',
          description: '',
          category: 'general',
          title_ids: [1, 2, 3],
          default_rows: ['S', 'A'],
          is_public: true,
          is_system: false,
          plays: 10,
          owner_user_id: null,
          created_at: '2026-03-03T00:00:00.000Z',
          updated_at: '2026-03-03T00:00:00.000Z',
        },
      ],
      error: null,
    });
    mockState.listSelectResponses.push({
      data: [
        {
          id: 'tierlist-public-browse',
          template_id: null,
          title: 'Browse List',
          description: '',
          is_public: true,
          play_count: 3,
          owner_name: 'Public User',
          owner_username: 'public-user',
          has_adult_content: false,
          owner_user_id: null,
          created_at: '2026-03-03T00:00:00.000Z',
          updated_at: '2026-03-03T00:00:00.000Z',
        },
      ],
      error: null,
    });
    mockState.rowSelectResponses.push({
      data: [
        {
          id: 'row-public-browse',
          list_id: 'tierlist-public-browse',
          label: 'S',
          color: '',
          position: 0,
          title_ids: [1, 2],
        },
      ],
      error: null,
    });

    await loadTierLibrary([], {
      userId: 'browse-user',
      includeOwned: false,
      publicListLimit: 8,
      showAdult: false,
    });

    expect(mockState.templateSelectCalls).toHaveLength(1);
    expect(mockState.listSelectCalls).toHaveLength(1);
    expect(mockState.templateSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'eq' && filter.column === 'owner_user_id'
    ))).toBe(false);
    expect(mockState.listSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'eq' && filter.column === 'owner_user_id'
    ))).toBe(false);
  });

  it('skips public tierlist queries when a flow only needs owned data', async () => {
    mockState.listSelectResponses.push({
      data: [
        {
          id: 'tierlist-owned-only',
          template_id: null,
          title: 'Owned Only',
          description: '',
          is_public: false,
          play_count: 0,
          owner_name: 'You',
          owner_username: 'user-1',
          has_adult_content: false,
          owner_user_id: 'user-1',
          created_at: '2026-03-06T00:00:00.000Z',
          updated_at: '2026-03-06T00:00:00.000Z',
        },
      ],
      error: null,
    });
    mockState.rowSelectResponses.push({
      data: [
        {
          id: 'row-owned-only',
          list_id: 'tierlist-owned-only',
          label: 'S',
          color: '',
          position: 0,
          title_ids: [7],
        },
      ],
      error: null,
    });

    await loadTierLibrary([], {
      userId: 'user-1',
      includePublic: false,
      fetchTemplates: false,
      showAdult: false,
    });

    expect(mockState.listSelectCalls).toHaveLength(1);
    expect(mockState.listSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'eq' && filter.column === 'is_public' && filter.value === true
    ))).toBe(false);
    expect(mockState.listSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'eq' && filter.column === 'owner_user_id' && filter.value === 'user-1'
    ))).toBe(true);
  });

  it('keeps owned template fetches separated by age mode', async () => {
    mockState.templateSelectResponses.push(
      {
        data: [
          {
            id: 'template-safe-public',
            title: 'Safe Template',
            description: '',
            category: 'general',
            title_ids: [1, 2, 3],
            default_rows: ['S', 'A'],
            is_public: true,
            is_system: false,
            plays: 1,
            has_adult_content: false,
            owner_user_id: null,
            created_at: '2026-03-04T00:00:00.000Z',
            updated_at: '2026-03-04T00:00:00.000Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'template-safe-owned',
            title: 'Owned Safe Template',
            description: '',
            category: 'general',
            title_ids: [4, 5, 6],
            default_rows: ['S', 'A'],
            is_public: false,
            is_system: false,
            plays: 0,
            has_adult_content: false,
            owner_user_id: 'user-1',
            created_at: '2026-03-04T00:00:00.000Z',
            updated_at: '2026-03-04T00:00:00.000Z',
          },
        ],
        error: null,
      }
    );

    await loadTierTemplates([], { userId: 'user-1', showAdult: false });

    expect(mockState.templateSelectCalls).toHaveLength(2);
    expect(mockState.templateSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'or' && filter.expression === 'has_adult_content.eq.false,has_adult_content.is.null'
    ))).toBe(true);
    expect(mockState.templateSelectCalls[1]?.filters.some((filter) => (
      filter.type === 'or' && filter.expression === 'has_adult_content.eq.false,has_adult_content.is.null'
    ))).toBe(true);
  });

  it('drops stale public local templates that do not match the requested age mode', async () => {
    storage.set('moodtoon-tierlist-v3', JSON.stringify({
      templates: [
        makeTemplate({
          id: 'template-stale-adult',
          title: 'Stale Adult Template',
          isPublic: true,
          ownerUserId: null,
          hasAdultContent: true,
          updatedAt: '2026-03-09T00:00:00.000Z',
        }),
      ],
      lists: [],
    }));
    mockState.templateSelectResponses.push({
      data: [],
      error: null,
    });

    const templates = await loadTierTemplates([], {
      userId: 'stale-public-user',
      includeOwned: false,
      showAdult: false,
    });

    expect(templates.some((template) => template.id === 'template-stale-adult')).toBe(false);
  });

  it('does not persist public remote snapshots in local storage after loading templates', async () => {
    mockState.templateSelectResponses.push({
      data: [
        {
          id: 'template-public-remote-only',
          title: 'Remote Only Template',
          description: '',
          category: 'theme_song::songs',
          title_ids: [1013, 1014],
          default_rows: ['S', 'A'],
          is_public: true,
          is_system: false,
          plays: 2,
          has_adult_content: false,
          owner_user_id: null,
          created_at: '2026-03-11T00:00:00.000Z',
          updated_at: '2026-03-11T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const templates = await loadTierTemplates([], {
      userId: 'remote-storage-user',
      includeOwned: false,
      showAdult: false,
    });
    const stored = JSON.parse(storage.get('moodtoon-tierlist-v3') || '{"templates":[],"lists":[]}');

    expect(templates.some((template) => template.id === 'template-public-remote-only')).toBe(true);
    expect((stored.templates || []).some((template) => template.id === 'template-public-remote-only')).toBe(false);
  });

  it('prefers remote public templates over stale local public snapshots so entity previews stay correct', async () => {
    storage.set('moodtoon-tierlist-v3', JSON.stringify({
      templates: [
        makeTemplate({
          id: 'template-public-song',
          title: 'Broken Local Song Template',
          category: 'general',
          entityType: 'title',
          titleIds: [1013, 1014],
          isPublic: true,
          ownerUserId: null,
          hasAdultContent: false,
          updatedAt: '2026-03-10T00:00:00.000Z',
        }),
      ],
      lists: [],
    }));
    mockState.templateSelectResponses.push({
      data: [
        {
          id: 'template-public-song',
          title: 'Remote Song Template',
          description: '',
          category: 'theme_song::songs',
          title_ids: [1013, 1014],
          default_rows: ['S', 'A'],
          is_public: true,
          is_system: false,
          plays: 5,
          has_adult_content: false,
          owner_user_id: null,
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const templates = await loadTierTemplates([], {
      userId: 'remote-template-user',
      includeOwned: false,
      showAdult: false,
    });
    const resolved = templates.find((template) => template.id === 'template-public-song');

    expect(resolved?.title).toBe('Remote Song Template');
    expect(resolved?.entityType).toBe('theme_song');
    expect(resolved?.hasAdultContent).toBe(false);
  });

  it('keeps owned list fetches separated by age mode', async () => {
    mockState.listSelectResponses.push(
      {
        data: [
          {
            id: 'tierlist-safe-public',
            template_id: null,
            title: 'Safe Public List',
            description: '',
            is_public: true,
            play_count: 1,
            owner_name: 'Public User',
            owner_username: 'public-user',
            has_adult_content: false,
            owner_user_id: null,
            created_at: '2026-03-04T00:00:00.000Z',
            updated_at: '2026-03-04T00:00:00.000Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'tierlist-safe-owned',
            template_id: null,
            title: 'Owned Safe List',
            description: '',
            is_public: false,
            play_count: 0,
            owner_name: 'You',
            owner_username: 'user-1',
            has_adult_content: false,
            owner_user_id: 'user-1',
            created_at: '2026-03-04T00:00:00.000Z',
            updated_at: '2026-03-04T00:00:00.000Z',
          },
        ],
        error: null,
      }
    );
    mockState.rowSelectResponses.push({
      data: [
        {
          id: 'row-safe-owned',
          list_id: 'tierlist-safe-public',
          label: 'S',
          color: '',
          position: 0,
          title_ids: [1],
        },
        {
          id: 'row-safe-owned-2',
          list_id: 'tierlist-safe-owned',
          label: 'S',
          color: '',
          position: 0,
          title_ids: [2],
        },
      ],
      error: null,
    });

    await loadTierLibrary([], {
      userId: 'user-1',
      fetchTemplates: false,
      showAdult: false,
    });

    expect(mockState.listSelectCalls).toHaveLength(2);
    expect(mockState.listSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'or' && filter.expression === 'has_adult_content.eq.false,has_adult_content.is.null'
    ))).toBe(true);
    expect(mockState.listSelectCalls[1]?.filters.some((filter) => (
      filter.type === 'or' && filter.expression === 'has_adult_content.eq.false,has_adult_content.is.null'
    ))).toBe(true);
  });

  it('does not reuse list fetch cache across adult mode switches', async () => {
    mockState.listSelectResponses.push(
      {
        data: [
          {
            id: 'tierlist-safe-mode',
            template_id: null,
            title: 'Safe Browse List',
            description: '',
            is_public: true,
            play_count: 1,
            owner_name: 'Safe User',
            owner_username: 'safe-user',
            has_adult_content: false,
            owner_user_id: null,
            created_at: '2026-03-05T00:00:00.000Z',
            updated_at: '2026-03-05T00:00:00.000Z',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'tierlist-adult-mode',
            template_id: null,
            title: 'Adult Browse List',
            description: '',
            is_public: true,
            play_count: 2,
            owner_name: 'Adult User',
            owner_username: 'adult-user',
            has_adult_content: true,
            owner_user_id: null,
            created_at: '2026-03-05T00:00:00.000Z',
            updated_at: '2026-03-05T00:00:00.000Z',
          },
        ],
        error: null,
      }
    );
    mockState.rowSelectResponses.push(
      {
        data: [
          {
            id: 'row-safe-mode',
            list_id: 'tierlist-safe-mode',
            label: 'S',
            color: '',
            position: 0,
            title_ids: [1],
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'row-adult-mode',
            list_id: 'tierlist-adult-mode',
            label: 'S',
            color: '',
            position: 0,
            title_ids: [2],
          },
        ],
        error: null,
      }
    );

    await loadTierLibrary([], {
      userId: 'mode-user',
      includeOwned: false,
      fetchTemplates: false,
      showAdult: false,
    });
    await loadTierLibrary([], {
      userId: 'mode-user',
      includeOwned: false,
      fetchTemplates: false,
      showAdult: true,
    });

    expect(mockState.listSelectCalls).toHaveLength(2);
    expect(mockState.listSelectCalls[0]?.filters.some((filter) => (
      filter.type === 'or' && filter.expression === 'has_adult_content.eq.false,has_adult_content.is.null'
    ))).toBe(true);
    expect(mockState.listSelectCalls[1]?.filters.some((filter) => (
      filter.type === 'eq' && filter.column === 'has_adult_content' && filter.value === true
    ))).toBe(true);
  });
});

describe('tierlistStore adult content serialization regression', () => {
  beforeEach(() => {
    mockState.templateUpdateResponses = [];
    mockState.templateInsertResponses = [];
    mockState.templateUpdatePayloads = [];
    mockState.templateInsertPayloads = [];
    mockState.templateSelectResponses = [];
    mockState.templateSelectCalls = [];
    mockState.listUpdateResponses = [];
    mockState.listInsertResponses = [];
    mockState.listUpdatePayloads = [];
    mockState.listInsertPayloads = [];
    mockState.listSelectResponses = [];
    mockState.listSelectCalls = [];
    mockState.rowSelectResponses = [];
    mockState.rowSelectCalls = [];
    mockState.poolSelectResponses = [];
    mockState.poolSelectCalls = [];
    mockState.rowUpserts = [];
    mockState.poolUpserts = [];
    mockState.rowDeletes = [];
    mockState.poolDeletes = [];
    mockState.from.mockImplementation((table) => createTableClient(table));
  });

  it('includes has_adult_content in template insert payload', async () => {
    await saveTierTemplate(
      makeTemplate({ id: null, hasAdultContent: true }),
      null,
      { userId: 'user-1' }
    );

    expect(mockState.templateInsertPayloads).toHaveLength(1);
    expect(mockState.templateInsertPayloads[0]).toHaveProperty('has_adult_content', true);
  });

  it('includes has_adult_content in template update payload', async () => {
    mockState.templateUpdateResponses.push({ data: [{ id: 'template-existing' }], error: null });

    await saveTierTemplate(
      makeTemplate({ id: 'template-existing', ownerUserId: 'user-1', hasAdultContent: false }),
      null,
      { userId: 'user-1' }
    );

    expect(mockState.templateUpdatePayloads).toHaveLength(1);
    expect(mockState.templateUpdatePayloads[0]).toHaveProperty('has_adult_content', false);
  });

  it('includes has_adult_content in list insert payload', async () => {
    await saveTierList(
      makeList({ id: null, hasAdultContent: true }),
      { templates: [], lists: [] },
      { userId: 'user-1' }
    );

    expect(mockState.listInsertPayloads).toHaveLength(1);
    expect(mockState.listInsertPayloads[0]).toHaveProperty('has_adult_content', true);
  });

  it('includes has_adult_content in list update payload', async () => {
    mockState.listUpdateResponses.push({ data: [{ id: 'tierlist-local-1' }], error: null });

    const existing = makeList({ hasAdultContent: false });
    await saveTierList(
      { ...existing, title: 'Updated' },
      { templates: [], lists: [existing] },
      { userId: 'user-1' }
    );

    expect(mockState.listUpdatePayloads).toHaveLength(1);
    expect(mockState.listUpdatePayloads[0]).toHaveProperty('has_adult_content', false);
  });
});
