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
const REMOTE_CACHE_TTL_MS = 30_000;
const remoteTemplatesRequestCache = new Map();
const remoteListsRequestCache = new Map();
const remoteTemplatesResultCache = new Map();
const remoteListsResultCache = new Map();
const tierTemplateDetailRequestCache = new Map();
const tierListDetailRequestCache = new Map();
const REMOTE_TEMPLATE_SELECT_BASE = 'id, owner_user_id, title, description, category, title_ids, default_rows, is_public, is_system, plays, has_adult_content, preview_artwork_url, custom_items, created_at, updated_at';
const REMOTE_TEMPLATE_PREVIEW_SETTINGS_SELECT = 'manual_preview_artwork_url, preview_artwork_fit, preview_artwork_position, preview_artwork_scale, preview_artwork_offset_x, preview_artwork_offset_y';
const REMOTE_TEMPLATE_SELECT = `${REMOTE_TEMPLATE_SELECT_BASE}, ${REMOTE_TEMPLATE_PREVIEW_SETTINGS_SELECT}`;
const REMOTE_LIST_SELECT = 'id, owner_user_id, template_id, title, description, is_public, play_count, owner_name, owner_username, has_adult_content, custom_items, created_at, updated_at';
const REMOTE_LIST_ROWS_SELECT = 'id, list_id, position, label, color, title_ids';
const REMOTE_LIST_POOL_SELECT = 'list_id, title_id, position';
let tierlistRemoteCacheVersion = 0;
let remoteTemplatePreviewSettingsSupported = true;

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

function dedupeTierEntryIds(ids = []) {
  const seen = new Set();
  return ids
    .map(Number)
    .filter((id) => Number.isFinite(id) && id !== 0)
    .filter((id) => {
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
}

function makeCustomTierItemId(index = 0) {
  return -(Date.now() + index + Math.floor(Math.random() * 1000));
}

function normalizeCustomTierItems(items = []) {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  return source
    .map((item, index) => {
      const rawId = Number(item?.id);
      const id = Number.isFinite(rawId) && rawId !== 0 ? rawId : makeCustomTierItemId(index);
      const imageUrl = String(item?.imageUrl ?? item?.image_url ?? item?.cover ?? '').trim();
      const title = String(item?.title ?? item?.label ?? item?.name ?? '').trim();
      const subtitle = String(item?.subtitle ?? item?.description ?? '').trim();
      const sourceUrl = String(item?.sourceUrl ?? item?.source_url ?? '').trim();

      return {
        id,
        title: title || `Custom item ${index + 1}`,
        imageUrl,
        subtitle,
        sourceUrl,
      };
    })
    .filter((item) => item.imageUrl)
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
}

function getTemplatePreviewArtworkUrl(entries = []) {
  return (entries || [])
    .map((entry) => (
      entry?.cover
      || entry?.cover_image
      || entry?.image_url
      || entry?.poster
      || entry?.avatar_url
      || entry?.banner
      || entry?.banner_image
      || entry?.trailer_thumbnail_url
      || ''
    ))
    .find((value) => typeof value === 'string' && value.trim().length > 0) || '';
}

function normalizeTemplatePreviewFit(value) {
  return String(value || '').trim().toLowerCase() === 'contain' ? 'contain' : 'cover';
}

function normalizeTemplatePreviewPosition(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'top' || normalized === 'bottom') {
    return normalized;
  }
  return 'center';
}

function normalizeTemplatePreviewScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(2.5, numeric));
}

function normalizeTemplatePreviewOffset(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(-35, Math.min(35, numeric));
}

function dedupeRows(rows = []) {
  const seenTitleIds = new Set();
  return rows.map((row, index) => {
    const nextTitleIds = [];
    dedupeTierEntryIds(row?.titleIds || []).forEach((titleId) => {
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
  const hasAdultContent = raw?.hasAdultContent ?? raw?.has_adult_content;
  const previewArtworkUrl = String(raw?.previewArtworkUrl ?? raw?.preview_artwork_url ?? '').trim();
  const manualPreviewArtworkUrl = String(raw?.manualPreviewArtworkUrl ?? raw?.manual_preview_artwork_url ?? '').trim();
  const customItems = normalizeCustomTierItems(raw?.customItems ?? raw?.custom_items ?? []);
  const previewArtworkFit = normalizeTemplatePreviewFit(raw?.previewArtworkFit ?? raw?.preview_artwork_fit);
  const previewArtworkPosition = normalizeTemplatePreviewPosition(raw?.previewArtworkPosition ?? raw?.preview_artwork_position);
  const previewArtworkScale = normalizeTemplatePreviewScale(raw?.previewArtworkScale ?? raw?.preview_artwork_scale);
  const previewArtworkOffsetX = normalizeTemplatePreviewOffset(raw?.previewArtworkOffsetX ?? raw?.preview_artwork_offset_x);
  const previewArtworkOffsetY = normalizeTemplatePreviewOffset(raw?.previewArtworkOffsetY ?? raw?.preview_artwork_offset_y);

  return {
    id: String(raw?.id || makeId(`template-${index}`)),
    title: String(raw?.title || `Template ${index + 1}`),
    description: String(raw?.description || ''),
    category: String(decodedCategory.category || 'general'),
    entityType,
    titleIds: dedupeTierEntryIds([...(raw?.titleIds || []), ...customItems.map((item) => item.id)]),
    defaultRows: Array.isArray(raw?.defaultRows) && raw.defaultRows.length > 0
      ? raw.defaultRows.map((label) => String(label || '').trim()).filter(Boolean)
      : DEFAULT_ROWS,
    isPublic: Boolean(raw?.isPublic ?? true),
    isSystem: Boolean(raw?.isSystem),
    plays: Number(raw?.plays || 0),
    hasAdultContent: typeof hasAdultContent === 'boolean' ? hasAdultContent : null,
    previewArtworkUrl: previewArtworkUrl || manualPreviewArtworkUrl || '',
    manualPreviewArtworkUrl: manualPreviewArtworkUrl || '',
    previewArtworkFit,
    previewArtworkPosition,
    previewArtworkScale,
    previewArtworkOffsetX,
    previewArtworkOffsetY,
    customItems,
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

function normalizeTierListIdentityText(value) {
  return String(value || '').trim().toLowerCase();
}

function getTierListCommunityIdentityKey(list) {
  if (!list) {
    return '';
  }

  return JSON.stringify({
    owner: normalizeTierListIdentityText(list.ownerUserId || list.ownerUsername || list.ownerName || ''),
    templateId: String(list.templateId || ''),
    entityType: normalizeCatalogEntityType(list.entityType),
    title: normalizeTierListIdentityText(list.title),
    description: normalizeTierListIdentityText(list.description),
    rows: (list.rows || []).map((row) => ({
      label: normalizeTierListIdentityText(row?.label),
      color: String(row?.color || ''),
      titleIds: (row?.titleIds || []).map(Number).filter((id) => Number.isFinite(id) && id !== 0),
    })),
    poolTitleIds: (list.poolTitleIds || []).map(Number).filter((id) => Number.isFinite(id) && id !== 0),
    customItems: (list.customItems || []).map((item) => ({
      id: Number(item?.id),
      title: normalizeTierListIdentityText(item?.title),
      imageUrl: String(item?.imageUrl || ''),
    })),
  });
}

function dedupeTierListsByIdentity(lists = []) {
  const seen = new Set();
  return [...lists]
    .sort((a, b) => {
      const updatedDelta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      if (updatedDelta !== 0) return updatedDelta;
      return Number(b.playCount || 0) - Number(a.playCount || 0);
    })
    .filter((list) => {
      const identityKey = getTierListCommunityIdentityKey(list);
      if (!identityKey || seen.has(identityKey)) {
        return false;
      }
      seen.add(identityKey);
      return true;
    });
}

function sortListsByRecentAndPopularity(lists = []) {
  return dedupeTierListsByIdentity(lists).sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return Number(b.playCount || 0) - Number(a.playCount || 0);
  });
}

export function getTierTemplateIdentityKey(template) {
  const normalized = normalizeTemplate(template);
  return [
    normalizeCatalogEntityType(normalized.entityType),
    normalizeTemplateIdentityText(normalized.category),
    normalizeTemplateIdentityText(normalized.title),
    normalizeTemplateIdentityText(normalized.description),
    normalized.defaultRows.map(normalizeTemplateIdentityText).join('|'),
    dedupeTierEntryIds(normalized.titleIds).join(','),
    (normalized.customItems || []).map((item) => `${Number(item?.id)}:${normalizeTemplateIdentityText(item?.title)}:${String(item?.imageUrl || '')}`).join('|'),
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
    customItems: normalizeCustomTierItems(template?.customItems || []),
    entityType: normalizeCatalogEntityType(template?.entityType),
    isPublic: false,
    playCount: 0,
    ownerName: 'You',
    hasAdultContent: typeof template?.hasAdultContent === 'boolean' ? template.hasAdultContent : null,
    ownerUserId: template?.ownerUserId ? String(template.ownerUserId) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function createTemplateFromCatalog(titles = [], options = {}) {
  const baseRows = Array.isArray(options.defaultRows) && options.defaultRows.length > 0
    ? options.defaultRows
    : DEFAULT_ROWS;
  const customItems = normalizeCustomTierItems(options.customItems || []);
  const manualPreviewArtworkUrl = String(options.manualPreviewArtworkUrl ?? options.previewArtworkUrl ?? '').trim();

  return normalizeTemplate({
    id: makeId('template'),
    title: options.title || 'Untitled template',
    description: options.description || '',
    category: options.category || 'general',
    entityType: normalizeCatalogEntityType(options.entityType),
    titleIds: [...titles.map((title) => Number(title.id)), ...customItems.map((item) => item.id)],
    defaultRows: baseRows,
    isPublic: Boolean(options.isPublic ?? true),
    isSystem: Boolean(options.isSystem),
    plays: 0,
    hasAdultContent: titles.some((title) => Boolean(title?.is_adult)),
    previewArtworkUrl: manualPreviewArtworkUrl || getTemplatePreviewArtworkUrl([...customItems.map((item) => ({ cover: item.imageUrl })), ...titles]),
    manualPreviewArtworkUrl,
    previewArtworkFit: normalizeTemplatePreviewFit(options.previewArtworkFit),
    previewArtworkPosition: normalizeTemplatePreviewPosition(options.previewArtworkPosition),
    previewArtworkScale: normalizeTemplatePreviewScale(options.previewArtworkScale),
    previewArtworkOffsetX: normalizeTemplatePreviewOffset(options.previewArtworkOffsetX),
    previewArtworkOffsetY: normalizeTemplatePreviewOffset(options.previewArtworkOffsetY),
    customItems,
    ownerUserId: options.ownerUserId || null,
  });
}

function normalizeTierList(raw, index = 0) {
  const rows = normalizeRows(raw?.rows);
  const assigned = new Set(rows.flatMap((row) => row.titleIds));
  const customItems = normalizeCustomTierItems(raw?.customItems ?? raw?.custom_items ?? []);
  const poolTitleIds = dedupeTierEntryIds([...(raw?.poolTitleIds || []), ...customItems.map((item) => item.id)]).filter((id) => !assigned.has(id));
  const hasAdultContent = raw?.hasAdultContent ?? raw?.has_adult_content;

  return {
    id: String(raw?.id || makeId(`tierlist-${index}`)),
    templateId: String(raw?.templateId || ''),
    title: String(raw?.title || 'My Tier List'),
    description: String(raw?.description || ''),
    entityType: inferTierListEntityType(raw),
    rows,
    poolTitleIds,
    customItems,
    isPublic: Boolean(raw?.isPublic),
    playCount: Number(raw?.playCount || 0),
    ownerName: String(raw?.ownerName || 'You'),
    ownerUsername: raw?.ownerUsername ? String(raw.ownerUsername) : null,
    hasAdultContent: typeof hasAdultContent === 'boolean' ? hasAdultContent : null,
    ownerUserId: raw?.ownerUserId ? String(raw.ownerUserId) : null,
    createdAt: raw?.createdAt || new Date().toISOString(),
    updatedAt: raw?.updatedAt || new Date().toISOString(),
  };
}

function resolveTierListEntityType(list, templateById) {
  const templateEntityType = normalizeCatalogEntityType(templateById.get(list.templateId)?.entityType);
  const listEntityType = normalizeCatalogEntityType(list?.entityType);

  if (listEntityType === TITLE_ENTITY_TYPE && templateEntityType !== TITLE_ENTITY_TYPE) {
    return templateEntityType;
  }

  return listEntityType || templateEntityType || TITLE_ENTITY_TYPE;
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
      entityType: resolveTierListEntityType(list, templateById),
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

function shouldPersistLocalTemplate(template) {
  if (!template) {
    return false;
  }

  if (template.isSystem) {
    return true;
  }

  if (template.ownerUserId) {
    return true;
  }

  return !template.isPublic;
}

function shouldPersistLocalList(list) {
  if (!list) {
    return false;
  }

  if (list.ownerUserId) {
    return true;
  }

  return !list.isPublic;
}

function prunePersistedLocalLibrary(library) {
  const normalized = normalizeLibrary(library);
  return {
    templates: normalized.templates.filter((template) => shouldPersistLocalTemplate(template)),
    lists: normalized.lists.filter((list) => shouldPersistLocalList(list)),
  };
}

function loadLibraryRaw() {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_LIBRARY };
  }

  try {
    const parsed = JSON.parse(storage.getItem(TIERLIST_STORAGE_KEY) || 'null');
    return parsed ? prunePersistedLocalLibrary(parsed) : { ...DEFAULT_LIBRARY };
  } catch {
    return { ...DEFAULT_LIBRARY };
  }
}

function saveLibraryRaw(library) {
  const storage = getStorage();
  const normalized = prunePersistedLocalLibrary(library);
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

function getComparableTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function preferNewerTierListVersion(remoteList, localList) {
  if (!remoteList) {
    return localList || null;
  }

  if (!localList) {
    return remoteList;
  }

  return getComparableTimestamp(localList.updatedAt) >= getComparableTimestamp(remoteList.updatedAt)
    ? localList
    : remoteList;
}

function readTimedCache(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (Number(entry.expiresAt || 0) <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeTimedCache(cache, key, value, ttlMs = REMOTE_CACHE_TTL_MS) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

function invalidateTierlistRemoteCaches() {
  tierlistRemoteCacheVersion += 1;
  remoteTemplatesRequestCache.clear();
  remoteListsRequestCache.clear();
  remoteTemplatesResultCache.clear();
  remoteListsResultCache.clear();
  tierTemplateDetailRequestCache.clear();
  tierListDetailRequestCache.clear();
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

function hasMissingColumn(error, columnName) {
  const normalizedColumn = String(columnName || '').trim().toLowerCase();
  const haystack = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.error_description,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  return (
    haystack.includes(`column "${normalizedColumn}"`) ||
    haystack.includes(`'${normalizedColumn}'`) ||
    haystack.includes(`"${normalizedColumn}"`) ||
    (haystack.includes('schema cache') && haystack.includes(normalizedColumn))
  );
}

function isMissingTemplatePreviewSettingsError(error) {
  return [
    'manual_preview_artwork_url',
    'preview_artwork_fit',
    'preview_artwork_position',
    'preview_artwork_scale',
    'preview_artwork_offset_x',
    'preview_artwork_offset_y',
  ].some((columnName) => hasMissingColumn(error, columnName));
}

function isNoRowsSingleResultError(error) {
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  const details = getErrorDetails(error);
  return (
    code === 'PGRST116' &&
    (
      message.includes('cannot coerce the result to a single json object') ||
      message.includes('0 rows') ||
      details.includes('0 rows')
    )
  );
}

function getErrorText(error) {
  return {
    status: getErrorStatus(error),
    code: String(error?.code ?? error?.error?.code ?? ''),
    message: String(error?.message ?? error?.error?.message ?? ''),
    details: String(error?.details ?? error?.error?.details ?? ''),
    hint: String(error?.hint ?? error?.error?.hint ?? ''),
  };
}

function buildTierlistDiagnosticMessage(action, context = {}, error = null) {
  const { status, code, message, details, hint } = getErrorText(error);
  const actionLabel = String(action || 'tierlist_action_failed');
  const step = context?.step ? `step=${context.step}` : '';
  const listId = context?.listId ? `listId=${context.listId}` : '';
  const templateId = context?.templateId ? `templateId=${context.templateId}` : '';
  const statusLabel = status ? `status=${status}` : '';
  const codeLabel = code ? `code=${code}` : '';
  const messageLabel = message ? `message=${message}` : '';
  const detailsLabel = details ? `details=${details}` : '';
  const hintLabel = hint ? `hint=${hint}` : '';

  return [
    actionLabel,
    step,
    listId,
    templateId,
    statusLabel,
    codeLabel,
    messageLabel,
    detailsLabel,
    hintLabel,
  ].filter(Boolean).join(' | ');
}

function createTierlistDiagnosticError(action, context = {}, error = null) {
  const diagnosticError = new Error(buildTierlistDiagnosticMessage(action, context, error));
  diagnosticError.name = 'TierlistDiagnosticError';
  diagnosticError.cause = error || null;
  diagnosticError.tierlistDebug = {
    action,
    ...context,
    ...getErrorText(error),
  };
  return diagnosticError;
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

function isOwnedTierListByUser(list, userId = null) {
  if (!list) {
    return false;
  }

  if (userId && list.ownerUserId) {
    return String(list.ownerUserId) === String(userId);
  }

  return !list.ownerUserId && String(list.ownerName || '').trim().toLowerCase() === 'you';
}

function hasMeaningfulTierRankingInStore(list) {
  return (list?.rows || []).some((row) => Array.isArray(row?.titleIds) && row.titleIds.length > 0);
}

function getTierListDraftIdentityKey(list) {
  if (!list) {
    return '';
  }

  const normalized = normalizeTierList(list);
  return JSON.stringify({
    owner: normalizeTierListIdentityText(normalized.ownerUserId || normalized.ownerUsername || normalized.ownerName || ''),
    templateId: String(normalized.templateId || ''),
    entityType: normalizeCatalogEntityType(normalized.entityType),
    title: normalizeTierListIdentityText(normalized.title),
    description: normalizeTierListIdentityText(normalized.description),
    rows: (normalized.rows || []).map((row) => ({
      label: normalizeTierListIdentityText(row?.label),
      color: String(row?.color || ''),
      titleIds: dedupeTierEntryIds(row?.titleIds || []),
    })),
    poolTitleIds: dedupeTierEntryIds(normalized.poolTitleIds || []),
    customItems: (normalized.customItems || []).map((item) => ({
      id: Number(item?.id),
      title: normalizeTierListIdentityText(item?.title),
      imageUrl: String(item?.imageUrl || ''),
    })),
  });
}

function compareTierListsByRecency(left, right) {
  const updatedDelta = new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
  if (updatedDelta !== 0) {
    return updatedDelta;
  }

  const createdDelta = new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime();
  if (createdDelta !== 0) {
    return createdDelta;
  }

  return String(right?.id || '').localeCompare(String(left?.id || ''));
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

function matchesRequestedAdultMode(entry, showAdult = null) {
  if (showAdult === null) {
    return true;
  }

  if (typeof entry?.hasAdultContent !== 'boolean') {
    return !showAdult;
  }

  return entry.hasAdultContent === showAdult;
}

function applyAdultContentQueryFilter(query, showAdult, column = 'has_adult_content') {
  if (typeof showAdult !== 'boolean') {
    return query;
  }

  if (showAdult) {
    return query.eq(column, true);
  }

  return query.or(`${column}.eq.false,${column}.is.null`);
}

function filterLocalTemplatesForRemoteMerge(templates = [], userId = null, showAdult = null) {
  return (templates || []).filter((template) => {
    if (!template || template.isSystem) {
      return false;
    }

    if (!matchesRequestedAdultMode(template, showAdult)) {
      return false;
    }

    const isOwnedByCurrentUser = userId && template.ownerUserId && String(template.ownerUserId) === String(userId);
    return Boolean(isOwnedByCurrentUser || !template.isPublic);
  });
}

function filterLocalListsForRemoteMerge(lists = [], userId = null, showAdult = null) {
  return (lists || []).filter((list) => {
    if (!list) {
      return false;
    }

    if (!matchesRequestedAdultMode(list, showAdult)) {
      return false;
    }

    const isOwnedByCurrentUser = userId && list.ownerUserId && String(list.ownerUserId) === String(userId);
    return Boolean(isOwnedByCurrentUser || !list.isPublic);
  });
}

function toRemoteTemplate(template, userId = null, options = {}) {
  const normalized = normalizeTemplate(template);
  const includePreviewSettings = options?.includePreviewSettings !== false;
  const payload = {
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
    has_adult_content: normalized.hasAdultContent,
    preview_artwork_url: normalized.previewArtworkUrl || null,
    custom_items: normalized.customItems,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  };

  if (includePreviewSettings) {
    payload.manual_preview_artwork_url = normalized.manualPreviewArtworkUrl || null;
    payload.preview_artwork_fit = normalized.previewArtworkFit;
    payload.preview_artwork_position = normalized.previewArtworkPosition;
    payload.preview_artwork_scale = normalized.previewArtworkScale;
    payload.preview_artwork_offset_x = normalized.previewArtworkOffsetX;
    payload.preview_artwork_offset_y = normalized.previewArtworkOffsetY;
  }

  return payload;
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
    hasAdultContent: typeof row?.has_adult_content === 'boolean' ? row.has_adult_content : null,
    previewArtworkUrl: row?.preview_artwork_url || '',
    manualPreviewArtworkUrl: row?.manual_preview_artwork_url || '',
    previewArtworkFit: row?.preview_artwork_fit || 'cover',
    previewArtworkPosition: row?.preview_artwork_position || 'center',
    previewArtworkScale: row?.preview_artwork_scale ?? 1,
    previewArtworkOffsetX: row?.preview_artwork_offset_x ?? 0,
    previewArtworkOffsetY: row?.preview_artwork_offset_y ?? 0,
    customItems: row?.custom_items || [],
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
    has_adult_content: normalized.hasAdultContent,
    custom_items: normalized.customItems,
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
    hasAdultContent: typeof row?.has_adult_content === 'boolean' ? row.has_adult_content : null,
    customItems: row?.custom_items || [],
    ownerUserId: row?.owner_user_id,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  });
}

async function fetchRemoteTemplates(userId = null, options = {}) {
  if (!supabase) {
    return [];
  }

  const includePublic = options?.includePublic !== false;
  const publicLimit = Number.isFinite(options?.publicLimit) && options.publicLimit > 0
    ? Math.floor(options.publicLimit)
    : null;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const includeOwned = options?.includeOwned !== false && Boolean(userId);
  if (!includePublic && !includeOwned) {
    return [];
  }

  const requestKey = `${userId || 'anon'}::${includePublic ? 'public' : 'owned-only'}::${includeOwned ? 'owned' : 'no-owned'}::${publicLimit ?? 'all'}::${showAdult ?? 'any'}`;
  const cachedResult = readTimedCache(remoteTemplatesResultCache, requestKey);
  if (cachedResult) {
    return cachedResult;
  }

  if (remoteTemplatesRequestCache.has(requestKey)) {
    return remoteTemplatesRequestCache.get(requestKey);
  }

  const cacheVersion = tierlistRemoteCacheVersion;
  const request = (async () => {
    const requests = [];
    const runTemplateSelect = async (buildQuery) => {
      const selectValue = remoteTemplatePreviewSettingsSupported
        ? REMOTE_TEMPLATE_SELECT
        : REMOTE_TEMPLATE_SELECT_BASE;
      const result = await buildQuery(selectValue);
      if (result?.error && remoteTemplatePreviewSettingsSupported && isMissingTemplatePreviewSettingsError(result.error)) {
        remoteTemplatePreviewSettingsSupported = false;
        return buildQuery(REMOTE_TEMPLATE_SELECT_BASE);
      }
      return result;
    };

    if (includePublic) {
      requests.push(runTemplateSelect((selectValue) => {
        let publicTemplatesQuery = supabase
          .from('tierlist_templates')
          .select(selectValue)
          .eq('is_public', true)
          .order('plays', { ascending: false })
          .order('updated_at', { ascending: false });

        publicTemplatesQuery = applyAdultContentQueryFilter(publicTemplatesQuery, showAdult);

        if (publicLimit !== null) {
          publicTemplatesQuery = publicTemplatesQuery.limit(publicLimit);
        }

        return publicTemplatesQuery;
      }));
    }

    if (includeOwned) {
      requests.push(runTemplateSelect((selectValue) => {
        let ownedTemplatesQuery = supabase
          .from('tierlist_templates')
          .select(selectValue)
          .eq('owner_user_id', userId);

        ownedTemplatesQuery = applyAdultContentQueryFilter(ownedTemplatesQuery, showAdult);

        return ownedTemplatesQuery;
      }));
    }

    const results = await Promise.all(requests);
    const rows = [];

    results.forEach(({ data, error }) => {
      if (error) {
        throw error;
      }
      rows.push(...(data || []));
    });

    const result = uniqueById(rows.map(fromRemoteTemplate));
    if (cacheVersion === tierlistRemoteCacheVersion) {
      writeTimedCache(remoteTemplatesResultCache, requestKey, result);
    }
    return result;
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

  const includePublic = options?.includePublic !== false;
  const publicLimit = Number.isFinite(options?.publicLimit) && options.publicLimit > 0
    ? Math.floor(options.publicLimit)
    : null;
  const ownedLimit = Number.isFinite(options?.ownedLimit) && options.ownedLimit > 0
    ? Math.floor(options.ownedLimit)
    : null;
  const ownedOffset = Number.isFinite(options?.ownedOffset) && options.ownedOffset >= 0
    ? Math.floor(options.ownedOffset)
    : 0;
  const skipPoolItems = options?.skipPoolItems !== false;
  const skipRows = options?.skipRows === true;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const includeOwned = options?.includeOwned !== false && Boolean(userId);
  if (!includePublic && !includeOwned) {
    return [];
  }

  const requestKey = `${userId || 'anon'}::${includePublic ? 'public' : 'owned-only'}::${includeOwned ? 'owned' : 'no-owned'}::${publicLimit ?? 'all'}::owned-limit:${ownedLimit ?? 'all'}::owned-offset:${ownedOffset}::${skipRows ? 'nrows' : 'rows'}::${skipPoolItems ? 'npool' : 'pool'}::${showAdult ?? 'any'}`;
  const cachedResult = readTimedCache(remoteListsResultCache, requestKey);
  if (cachedResult) {
    return cachedResult;
  }

  if (remoteListsRequestCache.has(requestKey)) {
    return remoteListsRequestCache.get(requestKey);
  }

  const cacheVersion = tierlistRemoteCacheVersion;
  const request = (async () => {
    const requests = [];

    if (includePublic) {
      let publicListsQuery = supabase
        .from('tierlist_lists')
        .select(REMOTE_LIST_SELECT)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .order('play_count', { ascending: false });

      publicListsQuery = applyAdultContentQueryFilter(publicListsQuery, showAdult);

      if (publicLimit !== null) {
        publicListsQuery = publicListsQuery.limit(publicLimit);
      }

      requests.push(publicListsQuery);
    }

    if (includeOwned) {
      let ownedListsQuery = supabase
        .from('tierlist_lists')
        .select(REMOTE_LIST_SELECT)
        .eq('owner_user_id', userId)
        .order('updated_at', { ascending: false })
        .order('play_count', { ascending: false });

      ownedListsQuery = applyAdultContentQueryFilter(ownedListsQuery, showAdult);

      if (ownedLimit !== null) {
        ownedListsQuery = ownedListsQuery.range(ownedOffset, ownedOffset + ownedLimit - 1);
      }

      requests.push(ownedListsQuery);
    }

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

    if (skipRows && skipPoolItems) {
      const result = dedupedLists.map((listRow) => fromRemoteList(listRow, [], []));
      if (cacheVersion === tierlistRemoteCacheVersion) {
        writeTimedCache(remoteListsResultCache, requestKey, result);
      }
      return result;
    }

    const listIds = dedupedLists.map((entry) => entry.id);
    const rowsData = skipRows
      ? []
      : await (async () => {
        const { data, error } = await supabase
          .from('tierlist_list_rows')
          .select(REMOTE_LIST_ROWS_SELECT)
          .in('list_id', listIds);

        if (error) throw error;
        return data || [];
      })();

    if (skipPoolItems) {
      const result = dedupedLists.map((listRow) => fromRemoteList(
        listRow,
        rowsData.filter((entry) => entry.list_id === listRow.id),
        []
      ));
      if (cacheVersion === tierlistRemoteCacheVersion) {
        writeTimedCache(remoteListsResultCache, requestKey, result);
      }
      return result;
    }

    const { data: poolData, error: poolError } = await supabase
      .from('tierlist_list_pool_items')
      .select(REMOTE_LIST_POOL_SELECT)
      .in('list_id', listIds);

    if (poolError) throw poolError;

    const result = dedupedLists.map((listRow) => fromRemoteList(
      listRow,
      (rowsData || []).filter((entry) => entry.list_id === listRow.id),
      (poolData || []).filter((entry) => entry.list_id === listRow.id)
    ));
    if (cacheVersion === tierlistRemoteCacheVersion) {
      writeTimedCache(remoteListsResultCache, requestKey, result);
    }
    return result;
  })();

  remoteListsRequestCache.set(requestKey, request);

  try {
    return await request;
  } finally {
    remoteListsRequestCache.delete(requestKey);
  }
}

export async function loadListPoolItems(listId) {
  if (!supabase || !listId) return [];
  const { data, error } = await supabase
    .from('tierlist_list_pool_items')
    .select('title_id, position')
    .eq('list_id', String(listId))
    .order('position', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => Number(row.title_id));
}

async function fetchRowsForListIds(listIds = []) {
  const normalizedIds = [...new Set((listIds || []).map(String).filter(Boolean))];
  if (!supabase || normalizedIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('tierlist_list_rows')
    .select(REMOTE_LIST_ROWS_SELECT)
    .in('list_id', normalizedIds);

  if (error) {
    throw error;
  }

  return data || [];
}

function buildPartialTierLibrary({ template = null, currentList = null, relatedPublicLists = [] } = {}) {
  return normalizeLibrary({
    templates: template ? [normalizeTemplate(template)] : [],
    lists: [
      ...(currentList ? [normalizeTierList(currentList)] : []),
      ...(relatedPublicLists || []).map((list) => normalizeTierList(list)),
    ],
  });
}

export async function loadTierTemplateDetail(templateId, options = {}) {
  const normalizedTemplateId = String(templateId || '');
  const userId = options?.userId || null;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const requestKey = `${normalizedTemplateId}::${userId || 'anon'}::${showAdult ?? 'any'}`;

  if (!normalizedTemplateId) {
    return { template: null, library: { ...DEFAULT_LIBRARY } };
  }

  if (tierTemplateDetailRequestCache.has(requestKey)) {
    return tierTemplateDetailRequestCache.get(requestKey);
  }

  const request = (async () => {
    const localLibrary = normalizeLibrary(loadLibraryRaw());
    const localTemplate = findTierTemplate(normalizedTemplateId, localLibrary);
    const localRelatedPublicLists = sortListsByRecentAndPopularity(
      localLibrary.lists.filter((list) => (
        list.isPublic &&
        String(list.templateId || '') === normalizedTemplateId
      ))
    );

    if (!supabase) {
      return {
        template: localTemplate,
        library: buildPartialTierLibrary({
          template: localTemplate,
          relatedPublicLists: localRelatedPublicLists,
        }),
      };
    }

    try {
      const { data: templateRow, error: templateError } = await (async () => {
        const runTemplateDetailQuery = async (selectValue) => {
          let templateQuery = supabase
            .from('tierlist_templates')
            .select(selectValue)
            .eq('id', normalizedTemplateId);

          templateQuery = applyAdultContentQueryFilter(templateQuery, showAdult);

          return templateQuery.maybeSingle();
        };

        const result = await runTemplateDetailQuery(
          remoteTemplatePreviewSettingsSupported
            ? REMOTE_TEMPLATE_SELECT
            : REMOTE_TEMPLATE_SELECT_BASE
        );

        if (result?.error && remoteTemplatePreviewSettingsSupported && isMissingTemplatePreviewSettingsError(result.error)) {
          remoteTemplatePreviewSettingsSupported = false;
          return runTemplateDetailQuery(REMOTE_TEMPLATE_SELECT_BASE);
        }

        return result;
      })();

      if (templateError && !isNoRowsSingleResultError(templateError)) {
        throw templateError;
      }

      const remoteTemplate = templateRow ? fromRemoteTemplate(templateRow) : null;
      if (!remoteTemplate) {
        return {
          template: localTemplate,
          library: buildPartialTierLibrary({
            template: localTemplate,
            relatedPublicLists: localRelatedPublicLists,
          }),
        };
      }

      let relatedListsQuery = supabase
        .from('tierlist_lists')
        .select(REMOTE_LIST_SELECT)
        .eq('template_id', normalizedTemplateId)
        .eq('is_public', true)
        .order('updated_at', { ascending: false })
        .order('play_count', { ascending: false });

      relatedListsQuery = applyAdultContentQueryFilter(relatedListsQuery, showAdult);

      const { data: relatedListRows, error: relatedListsError } = await relatedListsQuery;

      if (relatedListsError) {
        throw relatedListsError;
      }

      const relatedIds = (relatedListRows || []).map((row) => row.id);
      const relatedRows = await fetchRowsForListIds(relatedIds);

      return {
        template: remoteTemplate,
        library: buildPartialTierLibrary({
          template: remoteTemplate,
          relatedPublicLists: (relatedListRows || []).map((row) => fromRemoteList(
            row,
            relatedRows.filter((entry) => entry.list_id === row.id),
            []
          )),
        }),
      };
    } catch (error) {
      if (isNetworkLikeError(error)) {
        return {
          template: localTemplate,
          library: buildPartialTierLibrary({
            template: localTemplate,
            relatedPublicLists: localRelatedPublicLists,
          }),
        };
      }

      throw error;
    }
  })();

  tierTemplateDetailRequestCache.set(requestKey, request);

  try {
    return await request;
  } finally {
    tierTemplateDetailRequestCache.delete(requestKey);
  }
}

export async function loadTierListDetail(listId, options = {}) {
  const normalizedListId = String(listId || '');
  const userId = options?.userId || null;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const requestKey = `${normalizedListId}::${userId || 'anon'}::${showAdult ?? 'any'}`;

  if (!normalizedListId) {
    return { list: null, library: { ...DEFAULT_LIBRARY } };
  }

  if (tierListDetailRequestCache.has(requestKey)) {
    return tierListDetailRequestCache.get(requestKey);
  }

  const request = (async () => {
    const localLibrary = normalizeLibrary(loadLibraryRaw());
    const localList = findTierList(normalizedListId, localLibrary);
    const localTemplate = localList?.templateId ? findTierTemplate(localList.templateId, localLibrary) : null;
    const localRelatedPublicLists = localList?.templateId
      ? sortListsByRecentAndPopularity(
        localLibrary.lists.filter((list) => (
          list.isPublic &&
          list.id !== normalizedListId &&
          String(list.templateId || '') === String(localList.templateId || '')
        ))
      )
      : [];

    if (!supabase) {
      return {
        list: localList,
        library: buildPartialTierLibrary({
          template: localTemplate,
          currentList: localList,
          relatedPublicLists: localRelatedPublicLists,
        }),
      };
    }

    try {
      let listQuery = supabase
        .from('tierlist_lists')
        .select(REMOTE_LIST_SELECT)
        .eq('id', normalizedListId);

      listQuery = applyAdultContentQueryFilter(listQuery, showAdult);

      const { data: listRow, error: listError } = await listQuery.maybeSingle();

      if (listError && !isNoRowsSingleResultError(listError)) {
        throw listError;
      }

      if (!listRow) {
        return {
          list: localList,
          library: buildPartialTierLibrary({
            template: localTemplate,
            currentList: localList,
            relatedPublicLists: localRelatedPublicLists,
          }),
        };
      }

      const templateId = String(listRow.template_id || '');
      const currentListRequests = [
        supabase
          .from('tierlist_list_rows')
          .select(REMOTE_LIST_ROWS_SELECT)
          .eq('list_id', normalizedListId),
        supabase
          .from('tierlist_list_pool_items')
          .select(REMOTE_LIST_POOL_SELECT)
          .eq('list_id', normalizedListId)
          .order('position', { ascending: true }),
      ];

      if (templateId) {
        currentListRequests.push((async () => {
          const runTemplateQuery = async (selectValue) => supabase
            .from('tierlist_templates')
            .select(selectValue)
            .eq('id', templateId)
            .maybeSingle();

          const result = await runTemplateQuery(
            remoteTemplatePreviewSettingsSupported
              ? REMOTE_TEMPLATE_SELECT
              : REMOTE_TEMPLATE_SELECT_BASE
          );

          if (result?.error && remoteTemplatePreviewSettingsSupported && isMissingTemplatePreviewSettingsError(result.error)) {
            remoteTemplatePreviewSettingsSupported = false;
            return runTemplateQuery(REMOTE_TEMPLATE_SELECT_BASE);
          }

          return result;
        })());
      }

      const [rowsResult, poolResult, templateResult] = await Promise.all(currentListRequests);

      if (rowsResult.error) {
        throw rowsResult.error;
      }
      if (poolResult.error) {
        throw poolResult.error;
      }
      if (templateResult?.error && !isNoRowsSingleResultError(templateResult.error)) {
        throw templateResult.error;
      }

      const remoteTemplate = templateResult?.data ? fromRemoteTemplate(templateResult.data) : localTemplate;
      const currentList = preferNewerTierListVersion(
        fromRemoteList(listRow, rowsResult.data || [], poolResult.data || []),
        localList
      );
      let relatedPublicLists = [];

      if (templateId) {
        let relatedListsQuery = supabase
          .from('tierlist_lists')
          .select(REMOTE_LIST_SELECT)
          .eq('template_id', templateId)
          .eq('is_public', true)
          .neq('id', normalizedListId)
          .order('updated_at', { ascending: false })
          .order('play_count', { ascending: false });

        relatedListsQuery = applyAdultContentQueryFilter(relatedListsQuery, showAdult);

        const { data: relatedListRows, error: relatedListsError } = await relatedListsQuery;

        if (relatedListsError) {
          throw relatedListsError;
        }

        const relatedIds = (relatedListRows || []).map((row) => row.id);
        const relatedRows = await fetchRowsForListIds(relatedIds);
        relatedPublicLists = (relatedListRows || []).map((row) => fromRemoteList(
          row,
          relatedRows.filter((entry) => entry.list_id === row.id),
          []
        ));
      }

      const library = buildPartialTierLibrary({
        template: remoteTemplate,
        currentList,
        relatedPublicLists,
      });

      return {
        list: findTierList(normalizedListId, library) || currentList,
        library,
      };
    } catch (error) {
      if (isNetworkLikeError(error)) {
        return {
          list: localList,
          library: buildPartialTierLibrary({
            template: localTemplate,
            currentList: localList,
            relatedPublicLists: localRelatedPublicLists,
          }),
        };
      }

      throw error;
    }
  })();

  tierListDetailRequestCache.set(requestKey, request);

  try {
    return await request;
  } finally {
    tierListDetailRequestCache.delete(requestKey);
  }
}

async function saveRemoteTemplate(template, userId = null) {
  if (!supabase) {
    return normalizeTemplate(template);
  }

  const persistTemplate = async (includePreviewSettings) => {
    const payload = toRemoteTemplate(template, userId, { includePreviewSettings });
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
  };

  try {
    return await persistTemplate(remoteTemplatePreviewSettingsSupported);
  } catch (error) {
    if (remoteTemplatePreviewSettingsSupported && isMissingTemplatePreviewSettingsError(error)) {
      remoteTemplatePreviewSettingsSupported = false;
      return persistTemplate(false);
    }
    throw error;
  }
}

async function saveRemoteTemplateWithRecovery(template, userId = null, options = {}) {
  const allowRekey = options?.allowRekey !== false;

  try {
    return await saveRemoteTemplate(template, userId);
  } catch (error) {
    if (!userId || !allowRekey || (!isUniqueConflictError(error) && getErrorStatus(error) !== 409)) {
      throw error;
    }

    return saveRemoteTemplate(rekeyTemplateForOwner(template, userId), userId);
  }
}

// Returns only the row payloads that are new or have changed vs previousList.
// When previousList is absent (first save), all rows are returned as-is.
function getChangedRowPayloads(previousRows, nextRowPayloads) {
  if (!previousRows || previousRows.length === 0) return nextRowPayloads;

  const prevByRowId = new Map(
    previousRows.map((row, index) => [
      String(row.id),
      {
        label: String(row.label || ''),
        color: String(row.color || ''),
        title_ids: dedupeTierEntryIds(row.titleIds),
        position: index,
      },
    ])
  );

  return nextRowPayloads.filter((payload) => {
    const prev = prevByRowId.get(String(payload.id));
    if (!prev) return true; // new row
    return (
      prev.label !== payload.label ||
      prev.color !== payload.color ||
      prev.position !== payload.position ||
      JSON.stringify(prev.title_ids) !== JSON.stringify(payload.title_ids)
    );
  });
}

// Returns true if the pool title IDs or their order has changed.
function poolTitleIdsChanged(previousList, nextPoolTitleIds) {
  if (!previousList) return nextPoolTitleIds.length > 0;
  const prevPool = dedupeTierEntryIds(previousList.poolTitleIds || []);
  if (prevPool.length !== nextPoolTitleIds.length) return true;
  return prevPool.some((id, index) => id !== nextPoolTitleIds[index]);
}

function getRemovedTierRowIds(previousList, nextList) {
  const previousIds = new Set((previousList?.rows || []).map((row) => String(row?.id || '')).filter(Boolean));
  const nextIds = new Set((nextList?.rows || []).map((row) => String(row?.id || '')).filter(Boolean));
  return [...previousIds].filter((id) => !nextIds.has(id));
}

function getRemovedPoolTitleIds(previousList, nextList) {
  const previousIds = new Set(dedupeTierEntryIds(previousList?.poolTitleIds || []));
  const nextIds = new Set(dedupeTierEntryIds(nextList?.poolTitleIds || []));
  return [...previousIds].filter((id) => !nextIds.has(id));
}

async function deleteRemoteListChildrenDiff(previousList, nextList) {
  if (!supabase || !previousList?.id) {
    return;
  }

  const removedRowIds = getRemovedTierRowIds(previousList, nextList);
  const removedPoolTitleIds = getRemovedPoolTitleIds(previousList, nextList);

  if (removedRowIds.length > 0) {
    const { error: deleteRowsError } = await supabase
      .from('tierlist_list_rows')
      .delete()
      .eq('list_id', String(previousList.id))
      .in('id', removedRowIds);

    if (deleteRowsError) throw deleteRowsError;
  }

  if (removedPoolTitleIds.length > 0) {
    const { error: deletePoolError } = await supabase
      .from('tierlist_list_pool_items')
      .delete()
      .eq('list_id', String(previousList.id))
      .in('title_id', removedPoolTitleIds);

    if (deletePoolError) throw deletePoolError;
  }
}

async function saveRemoteList(list, userId = null, previousList = null) {
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

  // For a first-time INSERT there is no existing remote state to diff against,
  // so always write all rows/pool regardless of what previousList contains.
  // Also force a full rewrite when publishing (isPublic going false → true) because
  // previousList reflects local draft state, not what's actually in tierlist_list_rows —
  // rows may be missing from the DB if they were never successfully written.
  const isPublishing = normalized.isPublic === true && !previousList?.isPublic;
  const remoteBaseline = (updatedRow && !isPublishing) ? previousList : null;

  if (updatedRow && previousList) {
    await deleteRemoteListChildrenDiff(previousList, normalized);
  }

  const rowPayload = normalized.rows.map((row, index) => ({
    id: row.id,
    list_id: normalized.id,
    position: index,
    label: row.label,
    color: row.color || '',
    title_ids: dedupeTierEntryIds(row.titleIds),
  }));

  const poolPayload = dedupeTierEntryIds(normalized.poolTitleIds).map((titleId, index) => ({
    list_id: normalized.id,
    title_id: titleId,
    position: index,
  }));

  // Only upsert rows that are new or changed since the last remote save.
  const changedRowPayload = getChangedRowPayloads(remoteBaseline?.rows, rowPayload);
  if (changedRowPayload.length > 0) {
    const { error: rowInsertError } = await supabase
      .from('tierlist_list_rows')
      .upsert(changedRowPayload, { onConflict: 'id' });
    if (rowInsertError) throw rowInsertError;
  }

  // Only upsert pool items when the pool has actually changed vs remote.
  const nextPoolIds = dedupeTierEntryIds(normalized.poolTitleIds);
  if (poolTitleIdsChanged(remoteBaseline, nextPoolIds) && poolPayload.length > 0) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < poolPayload.length; i += CHUNK_SIZE) {
      const chunk = poolPayload.slice(i, i + CHUNK_SIZE);
      const { error: poolInsertError } = await supabase
        .from('tierlist_list_pool_items')
        .upsert(chunk, { onConflict: 'list_id,title_id' });
      if (poolInsertError) throw poolInsertError;
    }
  }

  return fromRemoteList(data || payload, rowPayload, poolPayload);
}

async function saveRemoteListWithRecovery(list, userId = null, previousList = null, options = {}, library = null) {
  const allowRetry = options?.allowRetry !== false;
  const allowRekey = options?.allowRekey !== false;
  const shouldRetryAfterConflict = (error) => (
    getErrorStatus(error) === 409 ||
    isUniqueConflictError(error) ||
    isPermissionLikeError(error)
  );

  try {
    return await saveRemoteList(list, userId, previousList);
  } catch (error) {
    if (isForeignKeyError(error)) {
      // Try saving the referenced template first so the FK constraint can be satisfied
      if (library && list.templateId && userId) {
        const sourceTemplate = (library.templates || []).find(
          (t) => String(t.id) === String(list.templateId)
        );
        if (sourceTemplate) {
          try {
            await saveRemoteTemplateWithRecovery(sourceTemplate, userId, { allowRekey: false });
            return await saveRemoteList(list, userId, previousList);
          } catch {
            // template save or list retry failed — fall through to strip templateId
          }
        }
      }
      // template_id references a template that doesn't exist remotely — save without it
      const listWithoutTemplate = normalizeTierList({ ...list, templateId: '' });
      try {
        return await saveRemoteList(listWithoutTemplate, userId, previousList);
      } catch (retryError) {
        // If the no-template retry also conflicts (duplicate ID), rekey and retry
        if (!userId || !allowRetry || !allowRekey || !shouldRetryAfterConflict(retryError)) {
          throw retryError;
        }
        return saveRemoteListWithRecovery(rekeyTierListForOwner(listWithoutTemplate, userId), userId, null, {
          allowRetry: false,
          allowRekey: false,
        });
      }
    }
    if (!userId || !allowRetry || !allowRekey || !shouldRetryAfterConflict(error)) {
      throw error;
    }

    return saveRemoteListWithRecovery(rekeyTierListForOwner(list, userId), userId, null, {
      allowRetry: false,
      allowRekey: false,
    });
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
  const includePublic = options?.includePublic !== false;
  const includeOwned = options?.includeOwned !== false;
  const shouldFetchTemplates = options?.fetchTemplates !== false;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const localLibrary = withSystemTemplates(loadLibraryRaw(), catalog);
  saveLibraryRaw(localLibrary);

  if (!supabase) {
    return localLibrary;
  }

  try {
    const [remoteTemplates, remoteLists] = await Promise.all([
      shouldFetchTemplates
        ? fetchRemoteTemplates(userId, {
          includePublic,
          includeOwned,
          publicLimit: options?.publicTemplateLimit,
          showAdult: options?.showAdult,
        })
        : Promise.resolve([]),
      fetchRemoteLists(userId, {
        includePublic,
        includeOwned,
        publicLimit: options?.publicListLimit,
        ownedLimit: options?.ownedListLimit,
        ownedOffset: options?.ownedListOffset,
        skipRows: options?.skipOwnedListRows === true,
        skipPoolItems: true,
        showAdult: options?.showAdult,
      }),
    ]);

    const merged = mergeLibraries(
      { templates: localLibrary.templates.filter((template) => template.isSystem), lists: [] },
      { templates: remoteTemplates, lists: remoteLists },
      // Always include local non-system data so unsaved local changes survive
      // (sort-by-updatedAt in normalizeLibrary ensures the newest version wins)
      {
        templates: filterLocalTemplatesForRemoteMerge(localLibrary.templates, userId, showAdult),
        lists: filterLocalListsForRemoteMerge(localLibrary.lists, userId, showAdult),
      }
    );

    saveLibraryRaw(merged);
    return withSystemTemplates(merged, catalog);
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return localLibrary;
    }

    throw error;
  }
}

export async function loadOwnedTierListsPage(userId, options = {}) {
  const limit = Number.isFinite(options?.limit) && options.limit > 0
    ? Math.floor(options.limit)
    : null;
  const offset = Number.isFinite(options?.offset) && options.offset >= 0
    ? Math.floor(options.offset)
    : 0;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const localLibrary = normalizeLibrary(loadLibraryRaw());
  const localOwnedLists = sortListsByRecentAndPopularity(
    localLibrary.lists.filter((list) => (
      isOwnedTierListByUser(list, userId)
      && matchesRequestedAdultMode(list, showAdult)
    ))
  );
  const localPage = limit === null
    ? localOwnedLists.slice(offset)
    : localOwnedLists.slice(offset, offset + limit);

  if (!userId || !supabase) {
    return localPage;
  }

  try {
    const remoteLists = await fetchRemoteLists(userId, {
      includePublic: false,
      includeOwned: true,
      ownedLimit: limit,
      ownedOffset: offset,
      skipRows: false,
      skipPoolItems: false,
      showAdult,
    });
    // Prefer local draft over remote when local is newer (e.g. remote save was queued/failed)
    return remoteLists.map((remoteList) => {
      const localList = localLibrary.lists.find((l) => String(l.id) === String(remoteList.id));
      return preferNewerTierListVersion(remoteList, localList);
    });
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return localPage;
    }

    throw error;
  }
}

export async function loadOwnedTierListStats(userId, options = {}) {
  if (!userId) {
    return {
      totalCount: 0,
      publicCount: 0,
      linkedCountByTemplateId: {},
    };
  }

  if (!supabase) {
    const localLibrary = normalizeLibrary(loadLibraryRaw());
    const ownedLists = localLibrary.lists.filter((list) => isOwnedTierListByUser(list, userId));
    const linkedCountByTemplateId = {};
    ownedLists.forEach((list) => {
      const templateId = String(list.templateId || '');
      if (!templateId) {
        return;
      }
      linkedCountByTemplateId[templateId] = Number(linkedCountByTemplateId[templateId] || 0) + 1;
    });
    return {
      totalCount: ownedLists.length,
      publicCount: ownedLists.filter((list) => list.isPublic).length,
      linkedCountByTemplateId,
    };
  }

  let query = supabase
    .from('tierlist_lists')
    .select('template_id, is_public')
    .eq('owner_user_id', userId);

  query = applyAdultContentQueryFilter(query, options?.showAdult);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const linkedCountByTemplateId = {};
  (data || []).forEach((row) => {
    const templateId = String(row?.template_id || '');
    if (!templateId) {
      return;
    }
    linkedCountByTemplateId[templateId] = Number(linkedCountByTemplateId[templateId] || 0) + 1;
  });

  return {
    totalCount: (data || []).length,
    publicCount: (data || []).filter((row) => Boolean(row?.is_public)).length,
    linkedCountByTemplateId,
  };
}

export async function loadTierTemplates(catalog = [], options = {}) {
  const userId = options?.userId || null;
  const includePublic = options?.includePublic !== false;
  const includeOwned = options?.includeOwned !== false;
  const showAdult = typeof options?.showAdult === 'boolean' ? options.showAdult : null;
  const localLibrary = withSystemTemplates(loadLibraryRaw(), catalog);
  saveLibraryRaw(localLibrary);

  if (!supabase) {
    return localLibrary.templates;
  }

  try {
    const remoteTemplates = await fetchRemoteTemplates(userId, {
      includePublic,
      includeOwned,
      publicLimit: options?.publicTemplateLimit,
      showAdult: options?.showAdult,
    });
    const merged = mergeLibraries(
      { templates: localLibrary.templates.filter((template) => template.isSystem), lists: [] },
      { templates: remoteTemplates, lists: [] },
      { templates: filterLocalTemplatesForRemoteMerge(localLibrary.templates, userId, showAdult), lists: [] }
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
  invalidateTierlistRemoteCaches();

  if (!supabase || !userId) {
    return normalized;
  }

  try {
    await syncLocalLibraryToSupabase(normalized, userId);
    const [remoteTemplates, remoteLists] = await Promise.all([
      fetchRemoteTemplates(userId, { includePublic: false }),
      fetchRemoteLists(userId, { includePublic: false }),
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
  const hasExistingTemplateId = source.templates.some((entry) => String(entry?.id || '') === String(template?.id || ''));
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
  invalidateTierlistRemoteCaches();

  if (
    !supabase
    || !userId
    || normalizedTemplate.isSystem
    || (preserveOwnership && String(normalizedTemplate.ownerUserId || '') !== String(userId))
  ) {
    return localLibrary;
  }

  try {
    const remoteTemplate = await saveRemoteTemplateWithRecovery(normalizedTemplate, userId, {
      allowRekey: !hasExistingTemplateId,
    });
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
  const hasExistingListId = source.lists.some((entry) => String(entry?.id || '') === String(tierList?.id || ''));
  const existingList = source.lists.find((entry) => String(entry.id || '') === String(tierList?.id || '')) || null;
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
  invalidateTierlistRemoteCaches();

  if (!supabase || !userId) {
    return localLibrary;
  }

  try {
    const remoteList = await saveRemoteListWithRecovery(normalized, userId, existingList, {
      allowRekey: !hasExistingListId,
    }, source);
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

async function deleteRemoteTemplate(templateId) {
  if (!supabase || !templateId) {
    return;
  }

  const { error } = await supabase
    .from('tierlist_templates')
    .delete()
    .eq('id', String(templateId));

  if (error) {
    throw error;
  }
}

function detachTemplateFromList(list) {
  return normalizeTierList({
    ...list,
    templateId: '',
    updatedAt: new Date().toISOString(),
  });
}

async function deleteRemoteList(listId) {
  if (!supabase || !listId) {
    return;
  }

  const normalizedListId = String(listId);

  const deleteSteps = [
    {
      step: 'delete_rows',
      request: () => supabase
      .from('tierlist_list_rows')
      .delete()
      .eq('list_id', normalizedListId),
    },
    {
      step: 'delete_pool_items',
      request: () => supabase
      .from('tierlist_list_pool_items')
      .delete()
      .eq('list_id', normalizedListId),
    },
    {
      step: 'delete_comments',
      request: () => supabase
      .from('tierlist_comments')
      .delete()
      .eq('list_id', normalizedListId),
    },
  ];

  for (const { step, request } of deleteSteps) {
    const { error } = await request();
    if (error) {
      throw createTierlistDiagnosticError('delete_tierlist_failed', {
        step,
        listId: normalizedListId,
      }, error);
    }
  }

  const { data, error } = await supabase
    .from('tierlist_lists')
    .delete()
    .eq('id', normalizedListId)
    .select('id');

  if (error) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'delete_list_row',
      listId: normalizedListId,
    }, error);
  }

  const deletedRow = Array.isArray(data) ? data[0] : null;
  if (!deletedRow?.id) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'delete_list_row',
      listId: normalizedListId,
      note: 'delete returned no row',
    }, null);
  }
}

async function verifyRemoteListDeleted(listId) {
  if (!supabase || !listId) {
    return;
  }

  const normalizedListId = String(listId);
  const { data, error } = await supabase
    .from('tierlist_lists')
    .select('id, owner_user_id')
    .eq('id', normalizedListId)
    .limit(1);

  if (error) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'verify_delete_list_row',
      listId: normalizedListId,
    }, error);
  }

  const existingRow = Array.isArray(data) ? data[0] : null;
  if (existingRow?.id) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'verify_delete_list_row',
      listId: normalizedListId,
      note: 'list still visible after delete',
    }, null);
  }
}

export async function deleteTierTemplate(templateId, library = null, options = {}) {
  const userId = options?.userId || null;
  const source = normalizeLibrary(library || loadLibraryRaw());
  const normalizedTemplateId = String(templateId || '');
  const targetTemplate = source.templates.find((entry) => String(entry.id || '') === normalizedTemplateId) || null;

  if (!targetTemplate) {
    return source;
  }

  const linkedLists = source.lists.filter((list) => String(list.templateId || '') === normalizedTemplateId);
  const detachedListById = new Map(
    linkedLists.map((list) => [String(list.id || ''), detachTemplateFromList(list)])
  );

  const nextLibrary = saveLibraryRaw({
    ...source,
    templates: source.templates.filter((entry) => String(entry.id || '') !== normalizedTemplateId),
    lists: source.lists.map((entry) => detachedListById.get(String(entry.id || '')) || entry),
  });
  invalidateTierlistRemoteCaches();

  if (!supabase || !userId) {
    return nextLibrary;
  }

  try {
    const ownedLinkedLists = linkedLists.filter((list) => (
      !list.ownerUserId || String(list.ownerUserId || '') === String(userId)
    ));
    for (const list of ownedLinkedLists) {
      const detachedList = detachedListById.get(String(list.id || ''));
      if (!detachedList) {
        continue;
      }
      await saveRemoteListWithRecovery(detachedList, userId, list);
    }
    await deleteRemoteTemplate(normalizedTemplateId);
    return nextLibrary;
  } catch (error) {
    if (isNetworkLikeError(error)) {
      return nextLibrary;
    }
    if (isForeignKeyError(error)) {
      throw new Error('Template is still referenced by rankings that cannot be detached automatically');
    }
    throw error;
  }
}

export async function deleteTierList(listId, library = null, options = {}) {
  const userId = options?.userId || null;
  const source = normalizeLibrary(library || loadLibraryRaw());
  const normalizedListId = String(listId || '');

  if (!normalizedListId) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'validate_input',
      listId: normalizedListId,
      note: 'missing list id',
    }, null);
  }

  const targetList = source.lists.find((entry) => String(entry.id || '') === normalizedListId) || null;

  if (!targetList) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'resolve_local_target',
      listId: normalizedListId,
      note: 'list not found in current library state',
    }, null);
  }

  if (!userId) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'require_user',
      listId: normalizedListId,
      note: 'missing authenticated user id',
    }, null);
  }

  if (!supabase) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'require_supabase',
      listId: normalizedListId,
      note: 'supabase client unavailable',
    }, null);
  }

  if (targetList.ownerUserId && String(targetList.ownerUserId) !== String(userId)) {
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'validate_owner',
      listId: normalizedListId,
      note: `list owner mismatch (${targetList.ownerUserId})`,
    }, null);
  }

  const nextLibrary = saveLibraryRaw({
    ...source,
    lists: source.lists.filter((entry) => String(entry.id || '') !== normalizedListId),
  });
  invalidateTierlistRemoteCaches();

  try {
    await deleteRemoteList(normalizedListId);
    await verifyRemoteListDeleted(normalizedListId);
    return nextLibrary;
  } catch (error) {
    // Revert the optimistic local delete — there is no sync mechanism
    // to re-apply it later, so leaving it removed would cause the list
    // to reappear from remote on the next load anyway.
    saveLibraryRaw(source);
    invalidateTierlistRemoteCaches();
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'delete_tierlist',
      listId: normalizedListId,
    }, error);
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

export async function cleanupDuplicateTierLists(library = null, options = {}) {
  const userId = options?.userId || null;
  const source = normalizeLibrary(library || loadLibraryRaw());
  const duplicateGroups = new Map();

  source.lists.forEach((list) => {
    if (
      !list ||
      list.isPublic ||
      hasMeaningfulTierRankingInStore(list) ||
      !isOwnedTierListByUser(list, userId)
    ) {
      return;
    }

    const identityKey = getTierListDraftIdentityKey(list);
    if (!identityKey) {
      return;
    }

    const group = duplicateGroups.get(identityKey) || [];
    group.push(list);
    duplicateGroups.set(identityKey, group);
  });

  const duplicateIdsToRemove = [];
  duplicateGroups.forEach((group) => {
    if (!Array.isArray(group) || group.length < 2) {
      return;
    }

    group
      .slice()
      .sort(compareTierListsByRecency)
      .slice(1)
      .forEach((list) => {
        duplicateIdsToRemove.push(String(list.id || ''));
      });
  });

  if (duplicateIdsToRemove.length === 0) {
    return {
      library: source,
      removedIds: [],
      failedIds: [],
    };
  }

  const removedIds = [];
  const failedIds = [];

  if (supabase && userId) {
    for (const duplicateId of duplicateIdsToRemove) {
      try {
        await deleteRemoteList(duplicateId);
        await verifyRemoteListDeleted(duplicateId);
        removedIds.push(duplicateId);
      } catch (error) {
        failedIds.push({
          id: duplicateId,
          message: error?.message || 'Failed to delete duplicate tier list',
        });
        console.error('tierlist duplicate cleanup failed', {
          listId: duplicateId,
          error,
        });
      }
    }
  } else {
    removedIds.push(...duplicateIdsToRemove);
  }

  if (removedIds.length === 0) {
    return {
      library: source,
      removedIds,
      failedIds,
    };
  }

  const removedIdSet = new Set(removedIds.map(String));
  const nextLibrary = saveLibraryRaw({
    ...source,
    lists: source.lists.filter((list) => !removedIdSet.has(String(list.id || ''))),
  });
  invalidateTierlistRemoteCaches();

  return {
    library: nextLibrary,
    removedIds,
    failedIds,
  };
}

export function seedPoolFromCatalog(tierList, catalogTitleIds = []) {
  const normalized = normalizeTierList(tierList);
  const knownIds = new Set(catalogTitleIds.map(Number).filter(Boolean));
  const customItemIds = new Set((normalized.customItems || []).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id !== 0));
  const allowedIds = new Set([...knownIds, ...customItemIds]);
  const assignedIds = new Set(normalized.rows.flatMap((row) => row.titleIds).filter((id) => allowedIds.has(id)));
  const poolFromStored = dedupeTierEntryIds(normalized.poolTitleIds).filter((id) => allowedIds.has(id) && !assignedIds.has(id));
  const missingIds = dedupeNumberIds(catalogTitleIds).filter((id) => !assignedIds.has(id) && !poolFromStored.includes(id));

  return normalizeTierList({
    ...normalized,
    rows: normalized.rows.map((row) => ({
      ...row,
      titleIds: row.titleIds.filter((id) => allowedIds.has(id)),
    })),
    poolTitleIds: [...poolFromStored, ...missingIds],
  });
}

export function filterTierListToCatalog(tierList, catalogTitleIds = []) {
  const normalized = normalizeTierList(tierList);
  const knownIds = new Set(catalogTitleIds.map(Number).filter(Boolean));
  const customItemIds = new Set((normalized.customItems || []).map((item) => Number(item.id)).filter((id) => Number.isFinite(id) && id !== 0));
  const allowedIds = new Set([...knownIds, ...customItemIds]);

  return normalizeTierList({
    ...normalized,
    rows: normalized.rows.map((row) => ({
      ...row,
      titleIds: dedupeTierEntryIds(row.titleIds).filter((id) => allowedIds.has(id)),
    })),
    poolTitleIds: dedupeTierEntryIds(normalized.poolTitleIds).filter((id) => allowedIds.has(id)),
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
        titleIds: dedupeTierEntryIds(nextTitleIds),
      };
    } else {
      poolTitleIds = dedupeTierEntryIds([...poolTitleIds, id]);
    }
  } else {
    poolTitleIds = dedupeTierEntryIds([...poolTitleIds, id]);
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

export function moveTierRow(tierList, rowId, targetIndex) {
  const normalized = normalizeTierList(tierList);
  const fromIndex = normalized.rows.findIndex((row) => row.id === rowId);
  if (fromIndex < 0) {
    return normalized;
  }

  const boundedTargetIndex = Math.max(0, Math.min(Number(targetIndex) || 0, normalized.rows.length));
  const rows = [...normalized.rows];
  const [movedRow] = rows.splice(fromIndex, 1);
  const insertIndex = boundedTargetIndex > fromIndex ? boundedTargetIndex - 1 : boundedTargetIndex;
  rows.splice(insertIndex, 0, movedRow);

  return normalizeTierList({
    ...normalized,
    rows,
  });
}
