import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';

const TIERLIST_STORAGE_KEY = 'moodtoon-tierlist-v3';
const DEFAULT_ROWS = ['S', 'A', 'B', 'C', 'D'];
const TEMPLATE_CATEGORY_CHARACTER_PREFIX = 'character::';
const TEMPLATE_CATEGORY_THEME_SONG_PREFIX = 'theme_song::';

export const DEFAULT_LIBRARY = {
  templates: [],
  lists: [],
};

export function encodeTemplateCategory(category, entityType = TITLE_ENTITY_TYPE) {
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

export function makeId(prefix) {
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

export function dedupeNumberIds(ids = []) {
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

export function dedupeTierEntryIds(ids = []) {
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

export function normalizeCustomTierItems(items = []) {
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

export function normalizeTemplatePreviewFit(value) {
  return String(value || '').trim().toLowerCase() === 'contain' ? 'contain' : 'cover';
}

export function normalizeTemplatePreviewPosition(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'top' || normalized === 'bottom') {
    return normalized;
  }
  return 'center';
}

export function normalizeTemplatePreviewScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(2.5, numeric));
}

export function normalizeTemplatePreviewOffset(value) {
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

export function normalizeTemplate(raw, index = 0) {
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

function resolveTierListEntityType(list, templateById) {
  const templateEntityType = normalizeCatalogEntityType(templateById.get(list.templateId)?.entityType);
  const listEntityType = normalizeCatalogEntityType(list?.entityType);

  if (listEntityType === TITLE_ENTITY_TYPE && templateEntityType !== TITLE_ENTITY_TYPE) {
    return templateEntityType;
  }

  return listEntityType || templateEntityType || TITLE_ENTITY_TYPE;
}

export function normalizeTierList(raw, index = 0) {
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

export function normalizeLibrary(raw) {
  const templates = Array.isArray(raw?.templates)
    ? raw.templates.map((template, index) => normalizeTemplate(template, index))
    : [];
  const lists = Array.isArray(raw?.lists)
    ? raw.lists.map((list, index) => normalizeTierList(list, index))
    : [];
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

export function uniqueById(items = []) {
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

export function loadLibraryRaw() {
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

export function saveLibraryRaw(library) {
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
