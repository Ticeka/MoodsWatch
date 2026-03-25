import { supabase } from '@/shared/lib/supabase';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';

const TIERLIST_STORAGE_KEY = 'moodtoon-tierlist-v3';

const DEFAULT_ROWS = ['S', 'A', 'B', 'C', 'D'];
const TEMPLATE_CATEGORY_CHARACTER_PREFIX = 'character::';
const TEMPLATE_CATEGORY_THEME_SONG_PREFIX = 'theme_song::';
const DEFAULT_LIBRARY = {
  templates: [],
  lists: [],
};
const remoteTemplatesRequestCache = new Map();
const remoteListsRequestCache = new Map();

function encodeTemplateCategory(category, entityType = TITLE_ENTITY_TYPE) {
  const normalizedCategory = String(category || 'general');
  const normalizedEntityType = normalizeCatalogEntityType(entityType);
  if (normalizedEntityType === CHARACTER_ENTITY_TYPE) {
    return `${TEMPLATE_CATEGORY_CHARACTER_PREFIX}${normalizedCategory}`;
  }
  if (normalizedEntityType === THEME_SONG_ENTITY_TYPE) {
    return `${TEMPLATE_CATEGORY_THEME_SONG_PREFIX}${normalizedCategory}`;
  }
  return normalizedCategory;
}

function decodeTemplateCategory(category) {
  const rawCategory = String(category || 'general');
  if (rawCategory.startsWith(TEMPLATE_CATEGORY_CHARACTER_PREFIX)) {
    return {
      category: rawCategory.slice(TEMPLATE_CATEGORY_CHARACTER_PREFIX.length) || 'general',
      entityType: CHARACTER_ENTITY_TYPE,
    };
  }
  if (rawCategory.startsWith(TEMPLATE_CATEGORY_THEME_SONG_PREFIX)) {
    return {
      category: rawCategory.slice(TEMPLATE_CATEGORY_THEME_SONG_PREFIX.length) || 'general',
      entityType: THEME_SONG_ENTITY_TYPE,
    };
  }

  return {
    category: rawCategory,
    entityType: TITLE_ENTITY_TYPE,
  };
}

function makeId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dedupeNumberIds(ids = []) {
  const seen = new Set();
  return ids
    .map(Number)
    .filter((id) => Number.isFinite(id) && id > 0)
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
}

function dedupeRows(rows = []) {
  const seenTitleIds = new Set();
  return rows.map((row, index) => {
    const nextTitleIds = [];
    dedupeNumberIds(row?.titleIds || []).forEach((titleId) => {
      if (!seenTitleIds.has(titleId)) {
        seenTitleIds.add(titleId);
        nextTitleIds.push(titleId);
      }
    });

    return {
      id: String(row?.id || makeId(`row-${index}`)),
      label: String(row?.label || `Tier ${index + 1}`).trim() || `Tier ${index + 1}`,
      titleIds: nextTitleIds,
      color: typeof row?.color === 'string' ? row.color : '',
    };
  });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return DEFAULT_ROWS.map((label) => ({ id: makeId('row'), label, titleIds: [], color: '' }));
  }

  return dedupeRows(rows);
}

function inferTierListEntityType(raw = {}) {
  if (raw?.entityType) {
    return normalizeCatalogEntityType(raw.entityType);
  }

  const normalizedDescription = String(raw?.description || '').trim().toLowerCase();
  if (normalizedDescription.startsWith('song-source:')) {
    return THEME_SONG_ENTITY_TYPE;
  }

  return TITLE_ENTITY_TYPE;
}

function normalizeTemplate(raw, index = 0) {
  const decodedCategory = decodeTemplateCategory(raw?.category);
  const entityType = normalizeCatalogEntityType(raw?.entityType || decodedCategory.entityType);

  return {
    id: String(raw?.id || makeId(`template-${index}`)),
    title: String(raw?.title || `Template ${index + 1}`),
    description: String(raw?.description || ''),
    category: String(decodedCategory.category || 'general'),
    entityType,
    titleIds: dedupeNumberIds(raw?.titleIds || []),
    defaultRows: Array.isArray(raw?.defaultRows) && raw.defaultRows.length > 0
      ? raw.defaultRows.map((label) => String(label || '').trim()).filter(Boolean)
      : DEFAULT_ROWS,
    isPublic: Boolean(raw?.isPublic ?? true),
    isSystem: Boolean(raw?.isSystem),
    plays: Number(raw?.plays || 0),
    ownerUserId: raw?.ownerUserId ? String(raw.ownerUserId) : null,
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

function normalizeTemplateIdentityText(value) {
  return String(value || '').trim().toLowerCase();
}

function compareTemplatesByIdentityPriority(left, right) {
  const playDelta = Number(right?.plays || 0) - Number(left?.plays || 0);
  if (playDelta !== 0) {
    return playDelta;
  }

  const updatedAtDelta = new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  const createdAtDelta = new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime();
  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return String(right?.id || '').localeCompare(String(left?.id || ''));
}

export function getTierTemplateIdentityKey(template) {
  const normalized = normalizeTemplate(template);
  return [
    normalizeCatalogEntityType(normalized.entityType),
    normalizeTemplateIdentityText(normalized.category),
    normalizeTemplateIdentityText(normalized.title),
    normalizeTemplateIdentityText(normalized.description),
    normalized.defaultRows.map(normalizeTemplateIdentityText).join('|'),
    dedupeNumberIds(normalized.titleIds).join(','),
  ].join('::');
}

export function dedupeTierTemplatesByIdentity(templates = []) {
  return collapseTierTemplatesByIdentity(templates).templates;
}

export function collapseTierTemplatesByIdentity(templates = []) {
  const seen = new Map();
  const canonicalIdById = new Map();
  const collapsed = [];

  [...templates]
    .map((template) => normalizeTemplate(template))
    .sort(compareTemplatesByIdentityPriority)
    .forEach((template) => {
      const identityKey = getTierTemplateIdentityKey(template);
      if (!identityKey) {
        canonicalIdById.set(template.id, template.id);
        collapsed.push(template);
        return;
      }

      const canonical = seen.get(identityKey);
      if (canonical) {
        canonicalIdById.set(template.id, canonical.id);
        return;
      }

      seen.set(identityKey, template);
      canonicalIdById.set(template.id, template.id);
      collapsed.push(template);
    });

  return {
    templates: collapsed,
    canonicalIdById,
  };
}

export function createTierListFromTemplate(template) {
  const rowLabels = Array.isArray(template?.defaultRows) && template.defaultRows.length > 0
    ? template.defaultRows
    : DEFAULT_ROWS;

  return normalizeTierList({
    id: makeId('tierlist'),
    templateId: String(template?.id || ''),
    title: String(template?.title || 'My Tier List'),
    description: String(template?.description || ''),
    rows: rowLabels.map((label) => ({
      id: makeId('row'),
      label,
      titleIds: [],
      color: '',
    })),
    poolTitleIds: Array.isArray(template?.titleIds) ? template.titleIds : [],
    entityType: normalizeCatalogEntityType(template?.entityType),
    isPublic: false,
    playCount: 0,
    ownerName: 'You',
    ownerUserId: template?.ownerUserId ? String(template.ownerUserId) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function createTemplateFromCatalog(titles = [], options = {}) {
  const baseRows = Array.isArray(options.defaultRows) && options.defaultRows.length > 0
    ? options.defaultRows
    : DEFAULT_ROWS;

  return normalizeTemplate({
    id: makeId('template'),
    title: options.title || 'Untitled template',
    description: options.description || '',
    category: options.category || 'general',
    entityType: normalizeCatalogEntityType(options.entityType),
    titleIds: titles.map((title) => Number(title.id)),
    defaultRows: baseRows,
    isPublic: Boolean(options.isPublic ?? true),
    isSystem: Boolean(options.isSystem),
    plays: 0,
    ownerUserId: options.ownerUserId || null,
  });
}

function normalizeTierList(raw, index = 0) {
  const rows = normalizeRows(raw?.rows);
  const assigned = new Set(rows.flatMap((row) => row.titleIds));
  const poolTitleIds = dedupeNumberIds(raw?.poolTitleIds || []).filter((id) => !assigned.has(id));

  return {
    id: String(raw?.id || makeId(`tierlist-${index}`)),
    templateId: String(raw?.templateId || ''),
    title: String(raw?.title || 'My Tier List'),
    description: String(raw?.description || ''),
    entityType: inferTierListEntityType(raw),
    rows,
    poolTitleIds,
    isPublic: Boolean(raw?.isPublic),
    playCount: Number(raw?.playCount || 0),
    ownerName: String(raw?.ownerName || 'You'),
    ownerUsername: raw?.ownerUsername ? String(raw.ownerUsername) : null,
    ownerUserId: raw?.ownerUserId ? String(raw.ownerUserId) : null,
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

function normalizeLibrary(raw) {
  const templates = Array.isArray(raw?.templates)
    ? raw.templates.map((template, index) => normalizeTemplate(template, index))
    : [];
  const lists = Array.isArray(raw?.lists)
    ? raw.lists.map((list, index) => normalizeTierList(list, index))
    : [];
  // Sort by updatedAt DESC before uniqueById so the newest version wins when IDs collide
  const byNewest = (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  const sortedTemplates = [...templates].sort(byNewest);
  const sortedLists = [...lists].sort(byNewest);
  const templateById = new Map(sortedTemplates.map((template) => [template.id, template]));
  return {
    templates: uniqueById(sortedTemplates),
    lists: uniqueById(sortedLists).map((list) => ({
      ...list,
      entityType: normalizeCatalogEntityType(
        list.entityType
        || templateById.get(list.templateId)?.entityType
        || TITLE_ENTITY_TYPE
      ),
    })),
  };
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.id || '');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function loadLibraryRaw() {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_LIBRARY };
  }

  try {
    const parsed = JSON.parse(storage.getItem(TIERLIST_STORAGE_KEY) || 'null');
    return parsed ? normalizeLibrary(parsed) : { ...DEFAULT_LIBRARY };
  } catch {
    return { ...DEFAULT_LIBRARY };
  }
}

function saveLibraryRaw(library) {
  const storage = getStorage();
  const normalized = normalizeLibrary(library);
  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(TIERLIST_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures
  }
  return normalized;
}

function getErrorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.error?.status ?? error?.error?.statusCode ?? 0);
  return Number.isFinite(status) ? status : 0;
}

function getErrorCode(error) {
  return String(error?.code ?? error?.error?.code ?? '');
}

function getErrorMessage(error) {
  return String(error?.message ?? error?.error?.message ?? '').toLowerCase();
}

function getErrorDetails(error) {
  return String(error?.details ?? error?.error?.details ?? '').toLowerCase();
}

function getErrorHint(error) {
  return String(error?.hint ?? error?.error?.hint ?? '').toLowerCase();
}

function isNetworkLikeError(error) {
  const message = getErrorMessage(error);
  const details = getErrorDetails(error);
  const hint = getErrorHint(error);
  const status = getErrorStatus(error);
  return (
    status >= 500 ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('network request failed') ||
    message.includes('fetch') ||
    message.includes('bad gateway') ||
    message.includes('cors') ||
    details.includes('bad gateway') ||
    details.includes('cors') ||
    hint.includes('cors')
  );
}

function isUniqueConflictError(error) {
  const message = getErrorMessage(error);
  const details = getErrorDetails(error);
  const code = getErrorCode(error);
  if (isForeignKeyError(error)) {
    return false;
  }

  return (
    code === '23505' ||
    message.includes('unique constraint') ||
    details.includes('unique constraint') ||
    message.includes('duplicate key') ||
    details.includes('duplicate key') ||
    message.includes('duplicate') ||
    details.includes('duplicate')
  );
}

function isForeignKeyError(error) {
  const message = getErrorMessage(error);
  const details = getErrorDetails(error);
  const hint = getErrorHint(error);
  const code = getErrorCode(error);
  return (
    code === '23503' ||
    message.includes('foreign key') ||
    message.includes('violates foreign key constraint') ||
    details.includes('foreign key') ||
    details.includes('is not present in table') ||
    hint.includes('foreign key')
  );
}

function isPermissionLikeError(error) {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  return (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('forbidden')
  );
}

function rekeyTemplateForOwner(template, userId) {
  const timestamp = new Date().toISOString();
  return normalizeTemplate({
    ...template,
    id: makeId('template'),
    ownerUserId: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function rekeyTierListForOwner(list, userId) {
  const timestamp = new Date().toISOString();
  return normalizeTierList({
    ...list,
    id: makeId('tierlist'),
    ownerUserId: userId,
    rows: (list?.rows || []).map((row) => ({
      ...row,
      id: makeId('row'),
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function shouldPromoteTemplateToOwnedCopy(template, userId) {
  return Boolean(
    userId &&
    template &&
    !template.isSystem &&
    (!template.ownerUserId || String(template.ownerUserId) !== String(userId))
  );
}

function shouldPromoteTierListToOwnedCopy(list, userId) {
  return Boolean(
    userId &&
    list &&
    (!list.ownerUserId || String(list.ownerUserId) !== String(userId))
  );
}

function createSystemTemplatesFromCatalog(catalog = []) {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return [];
  }

  const byType = {
    anime: catalog.filter((title) => title.type === 'anime').slice(0, 80),
    manga: catalog.filter((title) => title.type === 'manga').slice(0, 80),
    manhwa: catalog.filter((title) => title.type === 'manhwa').slice(0, 80),
  };

  const romance = catalog
    .filter((title) => [...(title.genres || []), ...(title.tags || [])]
      .some((entry) => String(entry || '').toLowerCase().includes('romance')))
    .slice(0, 80);

  const templates = [
    createTemplateFromCatalog(byType.anime, {
      title: 'Best Anime',
      description: 'Build your ultimate anime ranking from the catalog.',
      category: 'anime',
      isPublic: true,
      isSystem: true,
    }),
    createTemplateFromCatalog(byType.manga, {
      title: 'Best Manga',
      description: 'Rank top manga titles in your own style.',
      category: 'manga',
      isPublic: true,
      isSystem: true,
    }),
    createTemplateFromCatalog(byType.manhwa, {
      title: 'Best Manhwa',
      description: 'Create a personal manhwa tier list from catalog data.',
      category: 'manhwa',
      isPublic: true,
      isSystem: true,
    }),
    createTemplateFromCatalog(romance, {
      title: 'Romance Picks',
      description: 'Tier list for romance fans across formats.',
      category: 'romance',
      isPublic: true,
      isSystem: true,
    }),
  ];

  return templates.filter((template) => template.titleIds.length >= 8);
}

function withSystemTemplates(library, catalog = []) {
  const normalized = normalizeLibrary(library);
  const existingSystem = normalized.templates.filter((template) => template.isSystem);
  if (existingSystem.length > 0 || catalog.length === 0) {
    return normalized;
  }

  return normalizeLibrary({
    ...normalized,
    templates: [...createSystemTemplatesFromCatalog(catalog), ...normalized.templates],
  });
}

function mergeLibraries(...libraries) {
  const merged = libraries.reduce((acc, library) => ({
    templates: [...acc.templates, ...(library?.templates || [])],
    lists: [...acc.lists, ...(library?.lists || [])],
  }), { ...DEFAULT_LIBRARY });

  const normalized = normalizeLibrary(merged);

  normalized.templates.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  normalized.lists.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

  return normalized;
}

function toRemoteTemplate(template, userId = null) {
  const normalized = normalizeTemplate(template);
  return {
    id: normalized.id,
    owner_user_id: normalized.isSystem ? null : (normalized.ownerUserId || userId || null),
    title: normalized.title,
    description: normalized.description,
    category: encodeTemplateCategory(normalized.category, normalized.entityType),
    title_ids: normalized.titleIds,
    default_rows: normalized.defaultRows,
    is_public: normalized.isPublic,
    is_system: normalized.isSystem,
    plays: normalized.plays,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };
}

function fromRemoteTemplate(row) {
  return normalizeTemplate({
    id: row?.id,
    title: row?.title,
    description: row?.description,
    category: row?.category,
    titleIds: row?.title_ids || [],
    defaultRows: row?.default_rows || [],
    isPublic: row?.is_public,
    isSystem: row?.is_system,
    plays: row?.plays,
    ownerUserId: row?.owner_user_id,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  });
}

function toRemoteList(list, userId = null) {
  const normalized = normalizeTierList(list);
  return {
    id: normalized.id,
    owner_user_id: normalized.ownerUserId || userId || null,
    template_id: normalized.templateId || null,
    title: normalized.title,
    description: normalized.description,
    is_public: normalized.isPublic,
    play_count: normalized.playCount,
    owner_name: normalized.ownerName,
    owner_username: normalized.ownerUsername || '',
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };
}

function fromRemoteList(row, rows = [], poolItems = []) {
  return normalizeTierList({
    id: row?.id,
    templateId: row?.template_id,
    title: row?.title,
    description: row?.description,
    rows: rows
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        color: entry.color || '',
        titleIds: entry.title_ids || [],
      })),
    poolTitleIds: poolItems
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map((entry) => Number(entry.title_id)),
    isPublic: row?.is_public,
    playCount: row?.play_count,
    ownerName: row?.owner_name,
    ownerUsername: row?.owner_username || null,
    ownerUserId: row?.owner_user_id,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  });
}

async function fetchRemoteTemplates(userId = null, options = {}) {
  if (!supabase) {
    return [];
  }

  const select = 'id, owner_user_id, title, description, category, title_ids, default_rows, is_public, is_system, plays, created_at, updated_at';
  const publicLimit = Number.isFinite(options?.publicLimit) && options.publicLimit > 0
    ? Math.floor(options.publicLimit)
    : null;
  const requestKey = `${userId || 'anon'}::${publicLimit ?? 'all'}`;

  if (remoteTemplatesRequestCache.has(requestKey)) {
    return remoteTemplatesRequestCache.get(requestKey);
  }

  const request = (async () => {
    let publicTemplatesQuery = supabase
      .from('tierlist_templates')
      .select(select)
      .eq('is_public', true)
      .order('plays', { ascending: false })
      .order('updated_at', { ascending: false });

    if (publicLimit !== null) {
      publicTemplatesQuery = publicTemplatesQuery.limit(publicLimit);
    }

    const requests = userId
      ? [
          publicTemplatesQuery,
          supabase.from('tierlist_templates').select(select).eq('owner_user_id', userId),
        ]
      : [
          publicTemplatesQuery,
        ];

    const results = await Promise.all(requests);
    const rows = [];

    results.forEach(({ data, error }) => {
      if (error) {
        throw error;
      }
      rows.push(...(data || []));
    });

    return uniqueById(rows.map(fromRemoteTemplate));
  })();

  remoteTemplatesRequestCache.set(requestKey, request);

  try {
    return await request;
  } finally {
    remoteTemplatesRequestCache.delete(requestKey);
  }
}

async function fetchRemoteLists(userId = null, options = {}) {
  if (!supabase) {
    return [];
  }

  const select = 'id, owner_user_id, template_id, title, description, is_public, play_count, owner_name, owner_username, created_at, updated_at';
  const publicLimit = Number.isFinite(options?.publicLimit) && options.publicLimit > 0
    ? Math.floor(options.publicLimit)
    : null;
  const requestKey = `${userId || 'anon'}::${publicLimit ?? 'all'}`;

  if (remoteListsRequestCache.has(requestKey)) {
    return remoteListsRequestCache.get(requestKey);
  }

  const request = (async () => {
    let publicListsQuery = supabase
      .from('tierlist_lists')
      .select(select)
      .eq('is_public', true)
      .order('updated_at', { ascending: false })
      .order('play_count', { ascending: false });

    if (publicLimit !== null) {
      publicListsQuery = publicListsQuery.limit(publicLimit);
    }

    const requests = userId
      ? [
          publicListsQuery,
          supabase.from('tierlist_lists').select(select).eq('owner_user_id', userId),
        ]
      : [
          publicListsQuery,
        ];

    const results = await Promise.all(requests);
    const listRows = [];

    results.forEach(({ data, error }) => {
      if (error) {
        throw error;
      }
      listRows.push(...(data || []));
    });

    const dedupedLists = uniqueById(listRows);
    if (dedupedLists.length === 0) {
      return [];
    }

    const listIds = dedupedLists.map((entry) => entry.id);
    const [
      { data: rowsData, error: rowsError },
      { data: poolData, error: poolError },
    ] = await Promise.all([
      supabase.from('tierlist_list_rows').select('id, list_id, position, label, color, title_ids').in('list_id', listIds),
      supabase.from('tierlist_list_pool_items').select('list_id, title_id, position').in('list_id', listIds),
    ]);

    if (rowsError) throw rowsError;
    if (poolError) throw poolError;

    return dedupedLists.map((listRow) => fromRemoteList(
      listRow,
      (rowsData || []).filter((entry) => entry.list_id === listRow.id),
      (poolData || []).filter((entry) => entry.list_id === listRow.id)
    ));
  })();

  remoteListsRequestCache.set(requestKey, request);

  try {
    return await request;
  } finally {
    remoteListsRequestCache.delete(requestKey);
  }
}

async function saveRemoteTemplate(template, userId = null) {
  if (!supabase) {
    return normalizeTemplate(template);
  }

  const payload = toRemoteTemplate(template, userId);
  const { data: updatedRows, error: updateError } = await supabase
    .from('tierlist_templates')
    .update(payload)
    .eq('id', payload.id)
    .select('*');

  if (updateError) {
    throw updateError;
  }

  const updatedRow = Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;

  const { data, error } = updatedRow
    ? { data: updatedRow, error: null }
    : await supabase
      .from('tierlist_templates')
      .insert(payload)
      .select('*')
      .single();

  if (error) {
    throw error;
  }

  return fromRemoteTemplate(data || payload);
}

async function saveRemoteTemplateWithRecovery(template, userId = null) {
  try {
    return await saveRemoteTemplate(template, userId);
  } catch (error) {
    if (!userId || (!isUniqueConflictError(error) && getErrorStatus(error) !== 409)) {
      throw error;
    }

    return saveRemoteTemplate(rekeyTemplateForOwner(template, userId), userId);
  }
}

async function saveRemoteList(list, userId = null) {
  if (!supabase) {
    return normalizeTierList(list);
  }

  const normalized = normalizeTierList(list);
  const payload = toRemoteList(normalized, userId);
  const { data: updatedRows, error: updateError } = await supabase
    .from('tierlist_lists')
    .update(payload)
    .eq('id', payload.id)
    .select('*');

  if (updateError) {
    throw updateError;
  }

  const updatedRow = Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;

  const { data, error } = updatedRow
    ? { data: updatedRow, error: null }
    : await supabase
      .from('tierlist_lists')
      .insert(payload)
      .select('*')
      .single();

  if (error) {
    throw error;
  }

  // Brand-new lists do not have child rows yet, so skip the cleanup deletes.
  // This avoids extra DELETE requests during first save and reduces chances of
  // transient browser/network issues surfacing as save errors.
  if (updatedRow) {
    const { error: deleteRowsError } = await supabase
      .from('tierlist_list_rows')
      .delete()
      .eq('list_id', normalized.id);

    if (deleteRowsError) throw deleteRowsError;

    const { error: deletePoolError } = await supabase
      .from('tierlist_list_pool_items')
      .delete()
      .eq('list_id', normalized.id);

    if (deletePoolError) throw deletePoolError;
  }

  const rowPayload = normalized.rows.map((row, index) => ({
    id: row.id,
    list_id: normalized.id,
    position: index,
    label: row.label,
    color: row.color || '',
    title_ids: dedupeNumberIds(row.titleIds),
  }));

  const poolPayload = dedupeNumberIds(normalized.poolTitleIds).map((titleId, index) => ({
    list_id: normalized.id,
    title_id: titleId,
    position: index,
  }));

  if (rowPayload.length > 0) {
    const { error: rowInsertError } = await supabase
      .from('tierlist_list_rows')
      .upsert(rowPayload, { onConflict: 'id' });
    if (rowInsertError) throw rowInsertError;
  }

  if (poolPayload.length > 0) {
    const { error: poolInsertError } = await supabase
      .from('tierlist_list_pool_items')
      .upsert(poolPayload, { onConflict: 'list_id,title_id' });
    if (poolInsertError) throw poolInsertError;
  }

  return fromRemoteList(data || payload, rowPayload, poolPayload);
}

async function saveRemoteListWithRecovery(list, userId = null, allowRetry = true) {
  const shouldRetryAfterConflict = (error) => (
    getErrorStatus(error) === 409 ||
    isUniqueConflictError(error) ||
    isPermissionLikeError(error)
  );

  try {
    return await saveRemoteList(list, userId);
  } catch (error) {
    if (isForeignKeyError(error)) {
      // template_id references a template that doesn't exist remotely — save without it
      const listWithoutTemplate = normalizeTierList({ ...list, templateId: '' });
      try {
        return await saveRemoteList(listWithoutTemplate, userId);
      } catch (retryError) {
        // If the no-template retry also conflicts (duplicate ID), rekey and retry
        if (!userId || !allowRetry || !shouldRetryAfterConflict(retryError)) {
          throw retryError;
        }
        return saveRemoteListWithRecovery(rekeyTierListForOwner(listWithoutTemplate, userId), userId, false);
      }
    }
    if (!userId || !allowRetry || !shouldRetryAfterConflict(error)) {
      throw error;
    }

    return saveRemoteListWithRecovery(rekeyTierListForOwner(list, userId), userId, false);
  }
}

async function syncLocalLibraryToSupabase(localLibrary, userId) {
  if (!userId || !supabase) {
    return localLibrary;
  }

  const normalized = normalizeLibrary(localLibrary);
  const { templates: collapsedTemplates, canonicalIdById } = collapseTierTemplatesByIdentity(normalized.templates);
  const sourceTemplates = collapsedTemplates
    .filter((template) => (
      !template.isSystem &&
      (!template.ownerUserId || template.ownerUserId === userId)
    ));
  const localTemplates = sourceTemplates
    .map((template) => (
      shouldPromoteTemplateToOwnedCopy(template, userId)
        ? rekeyTemplateForOwner(template, userId)
        : normalizeTemplate({ ...template, ownerUserId: userId })
    ));
  const sourceLists = normalized.lists
    .filter((list) => (
      !list.ownerUserId || list.ownerUserId === userId
    ));

  const savedTemplates = await Promise.all(
    localTemplates.map((template) => saveRemoteTemplateWithRecovery(template, userId))
  );

  const templateIdMap = new Map(
    sourceTemplates.map((template, index) => [template.id, savedTemplates[index]?.id || template.id])
  );

  const localLists = sourceLists.map((list) => {
    const canonicalTemplateId = canonicalIdById.get(String(list.templateId || '')) || list.templateId || '';
    const nextTemplateId = templateIdMap.get(canonicalTemplateId) || canonicalTemplateId || '';
    const preparedList = normalizeTierList({
      ...list,
      templateId: nextTemplateId,
      ownerUserId: userId,
    });
    return shouldPromoteTierListToOwnedCopy(list, userId)
      ? rekeyTierListForOwner(preparedList, userId)
      : preparedList;
  });

  const savedLists = await Promise.all(
    localLists.map((list) => saveRemoteListWithRecovery(list, userId))
  );

  const syncedTemplateIds = new Set(sourceTemplates.map((template) => template.id));
  const syncedListIds = new Set(sourceLists.map((list) => list.id));

  return saveLibraryRaw({
    ...normalized,
    templates: [
      ...savedTemplates,
      ...normalized.templates.filter((template) => (
        !syncedTemplateIds.has(template.id)
        && (canonicalIdById.get(String(template.id || '')) || String(template.id || '')) === String(template.id || '')
      )),
    ],
    lists: [
      ...savedLists,
      ...normalized.lists.filter((list) => !syncedListIds.has(list.id)),
    ],
  });
}

export async function loadTierLibrary(catalog = [], options = {}) {
  const userId = options?.userId || null;
  const shouldFetchTemplates = options?.fetchTemplates !== false;
  const localLibrary = withSystemTemplates(loadLibraryRaw(), catalog);
  let workingLocalLibrary = localLibrary;
  saveLibraryRaw(localLibrary);

  if (!supabase) {
    return localLibrary;
  }

  try {
    if (userId) {
      try {
        workingLocalLibrary = await syncLocalLibraryToSupabase(localLibrary, userId);
      } catch (syncError) {
        if (!isNetworkLikeError(syncError) && !isPermissionLikeError(syncError)) {
          throw syncError;
        }
      }
    }

    const [remoteTemplates, remoteLists] = await Promise.all([
      shouldFetchTemplates
        ? fetchRemoteTemplates(userId, { publicLimit: options?.publicTemplateLimit })
        : Promise.resolve([]),
      fetchRemoteLists(userId, { publicLimit: options?.publicListLimit }),
    ]);

    const merged = mergeLibraries(
      { templates: workingLocalLibrary.templates.filter((template) => template.isSystem), lists: [] },
      { templates: remoteTemplates, lists: remoteLists },
      // Always include local non-system data so unsaved local changes survive
      // (sort-by-updatedAt in normalizeLibrary ensures the newest version wins)
      { templates: workingLocalLibrary.templates.filter((template) => !template.isSystem), lists: workingLocalLibrary.lists }
    );

    saveLibraryRaw(merged);
    return withSystemTemplates(merged, catalog);
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return workingLocalLibrary;
    }

    throw error;
  }
}

export async function loadTierTemplates(catalog = [], options = {}) {
  const userId = options?.userId || null;
  const localLibrary = withSystemTemplates(loadLibraryRaw(), catalog);
  saveLibraryRaw(localLibrary);

  if (!supabase) {
    return localLibrary.templates;
  }

  try {
    const remoteTemplates = await fetchRemoteTemplates(userId, { publicLimit: options?.publicTemplateLimit });
    const merged = mergeLibraries(
      { templates: localLibrary.templates.filter((template) => template.isSystem), lists: [] },
      { templates: remoteTemplates, lists: [] },
      { templates: localLibrary.templates.filter((template) => !template.isSystem), lists: [] }
    );

    saveLibraryRaw({
      ...localLibrary,
      templates: merged.templates,
    });

    return merged.templates;
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return localLibrary.templates;
    }

    throw error;
  }
}

export async function saveTierLibrary(library, options = {}) {
  const normalized = saveLibraryRaw(library);
  const userId = options?.userId || null;

  if (!supabase || !userId) {
    return normalized;
  }

  try {
    await syncLocalLibraryToSupabase(normalized, userId);
    const [remoteTemplates, remoteLists] = await Promise.all([
      fetchRemoteTemplates(userId),
      fetchRemoteLists(userId),
    ]);
    const merged = mergeLibraries(
      { templates: normalized.templates.filter((template) => template.isSystem), lists: [] },
      { templates: remoteTemplates, lists: remoteLists }
    );
    return saveLibraryRaw(merged);
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return normalized;
    }
    throw error;
  }
}

export async function saveTierTemplate(template, library = null, options = {}) {
  const userId = options?.userId || null;
  const preserveOwnership = Boolean(options?.preserveOwnership);
  const source = normalizeLibrary(library || loadLibraryRaw());
  const baseTemplate = !preserveOwnership && shouldPromoteTemplateToOwnedCopy(template, userId)
    ? rekeyTemplateForOwner(template, userId)
    : template;
  const normalizedTemplate = normalizeTemplate({
    ...baseTemplate,
    ownerUserId: preserveOwnership
      ? (baseTemplate?.ownerUserId || null)
      : (baseTemplate?.ownerUserId || userId || null),
    updatedAt: new Date().toISOString(),
  });

  const localLibrary = saveLibraryRaw({
    ...source,
    templates: [
      normalizedTemplate,
      ...source.templates.filter((entry) => entry.id !== normalizedTemplate.id),
    ],
  });

  if (
    !supabase
    || !userId
    || normalizedTemplate.isSystem
    || (preserveOwnership && String(normalizedTemplate.ownerUserId || '') !== String(userId))
  ) {
    return localLibrary;
  }

  try {
    const remoteTemplate = await saveRemoteTemplateWithRecovery(normalizedTemplate, userId);
    return saveLibraryRaw({
      ...localLibrary,
      templates: [
        remoteTemplate,
        ...localLibrary.templates.filter((entry) => entry.id !== normalizedTemplate.id && entry.id !== remoteTemplate.id),
      ],
    });
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return localLibrary;
    }
    throw error;
  }
}

export async function saveTierList(tierList, library = null, options = {}) {
  const userId = options?.userId || null;
  const source = normalizeLibrary(library || loadLibraryRaw());
  const baseTierList = shouldPromoteTierListToOwnedCopy(tierList, userId)
    ? rekeyTierListForOwner(tierList, userId)
    : tierList;
  const normalized = normalizeTierList({
    ...baseTierList,
    ownerUserId: baseTierList?.ownerUserId || userId || null,
    updatedAt: new Date().toISOString(),
  });

  const localLibrary = saveLibraryRaw({
    ...source,
    lists: [
      normalized,
      ...source.lists.filter((entry) => entry.id !== normalized.id),
    ],
  });

  if (!supabase || !userId) {
    return localLibrary;
  }

  try {
    const remoteList = await saveRemoteListWithRecovery(normalized, userId);
    return saveLibraryRaw({
      ...localLibrary,
      lists: [
        remoteList,
        ...localLibrary.lists.filter((entry) => entry.id !== normalized.id && entry.id !== remoteList.id),
      ],
    });
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return localLibrary;
    }
    throw error;
  }
}

export function findTierTemplate(templateId, library = null) {
  const source = library ? normalizeLibrary(library) : loadLibraryRaw();
  return source.templates.find((template) => template.id === templateId) || null;
}

export function findTierList(listId, library = null) {
  const source = library ? normalizeLibrary(library) : loadLibraryRaw();
  return source.lists.find((list) => list.id === listId) || null;
}

export function buildTierListFromTemplate(template, options = {}) {
  return createTierListFromTemplate({
    ...template,
    title: options.title || template.title,
    description: options.description || template.description,
    ownerUserId: options.ownerUserId || template.ownerUserId || null,
  });
}

export function seedPoolFromCatalog(tierList, catalogTitleIds = []) {
  const normalized = normalizeTierList(tierList);
  const knownIds = new Set(catalogTitleIds.map(Number).filter(Boolean));
  const assignedIds = new Set(normalized.rows.flatMap((row) => row.titleIds).filter((id) => knownIds.has(id)));
  const poolFromStored = dedupeNumberIds(normalized.poolTitleIds).filter((id) => knownIds.has(id) && !assignedIds.has(id));
  const missingIds = dedupeNumberIds(catalogTitleIds).filter((id) => !assignedIds.has(id) && !poolFromStored.includes(id));

  return normalizeTierList({
    ...normalized,
    rows: normalized.rows.map((row) => ({
      ...row,
      titleIds: row.titleIds.filter((id) => knownIds.has(id)),
    })),
    poolTitleIds: [...poolFromStored, ...missingIds],
  });
}

export function filterTierListToCatalog(tierList, catalogTitleIds = []) {
  const normalized = normalizeTierList(tierList);
  const knownIds = new Set(catalogTitleIds.map(Number).filter(Boolean));

  return normalizeTierList({
    ...normalized,
    rows: normalized.rows.map((row) => ({
      ...row,
      titleIds: dedupeNumberIds(row.titleIds).filter((id) => knownIds.has(id)),
    })),
    poolTitleIds: dedupeNumberIds(normalized.poolTitleIds).filter((id) => knownIds.has(id)),
  });
}

export function moveTitle(tierList, titleId, fromRowId, toRowId, toIndex = null) {
  const normalized = normalizeTierList(tierList);
  const id = Number(titleId);

  if (!Number.isFinite(id)) {
    return normalized;
  }

  const rows = normalized.rows.map((row) => ({
    ...row,
    titleIds: row.titleIds.filter((entryId) => entryId !== id),
  }));

  let poolTitleIds = normalized.poolTitleIds.filter((entryId) => entryId !== id);

  if (toRowId) {
    const targetIndex = rows.findIndex((row) => row.id === toRowId);
    if (targetIndex >= 0) {
      const nextTitleIds = [...rows[targetIndex].titleIds];
      const insertIndex = Number.isInteger(toIndex)
        ? Math.max(0, Math.min(toIndex, nextTitleIds.length))
        : nextTitleIds.length;
      nextTitleIds.splice(insertIndex, 0, id);
      rows[targetIndex] = {
        ...rows[targetIndex],
        titleIds: dedupeNumberIds(nextTitleIds),
      };
    } else {
      poolTitleIds = dedupeNumberIds([...poolTitleIds, id]);
    }
  } else {
    poolTitleIds = dedupeNumberIds([...poolTitleIds, id]);
  }

  return normalizeTierList({
    ...normalized,
    rows,
    poolTitleIds,
  });
}

export function removeTierRow(tierList, rowId) {
  const normalized = normalizeTierList(tierList);
  const row = normalized.rows.find((entry) => entry.id === rowId);
  if (!row || normalized.rows.length <= 1) {
    return normalized;
  }

  return normalizeTierList({
    ...normalized,
    rows: normalized.rows.filter((entry) => entry.id !== rowId),
    poolTitleIds: [...normalized.poolTitleIds, ...row.titleIds],
  });
}

export function addTierRow(tierList, label = '') {
  const normalized = normalizeTierList(tierList);
  return normalizeTierList({
    ...normalized,
    rows: [...normalized.rows, {
      id: makeId('row'),
      label: String(label || `Tier ${normalized.rows.length + 1}`),
      titleIds: [],
      color: '',
    }],
  });
}
