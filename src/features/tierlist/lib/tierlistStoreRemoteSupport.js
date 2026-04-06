import {
  encodeTemplateCategory,
  normalizeTemplate,
  normalizeTierList,
} from './tierlistStoreCore';

const REMOTE_CACHE_TTL_MS = 30_000;

export const remoteTemplatesRequestCache = new Map();
export const remoteListsRequestCache = new Map();
export const remoteTemplatesResultCache = new Map();
export const remoteListsResultCache = new Map();
export const tierTemplateDetailRequestCache = new Map();
export const tierListDetailRequestCache = new Map();

export const REMOTE_TEMPLATE_SELECT_BASE = 'id, owner_user_id, title, description, category, title_ids, default_rows, is_public, is_system, plays, has_adult_content, preview_artwork_url, custom_items, created_at, updated_at';
const REMOTE_TEMPLATE_PREVIEW_SETTINGS_SELECT = 'manual_preview_artwork_url, preview_artwork_fit, preview_artwork_position, preview_artwork_scale, preview_artwork_offset_x, preview_artwork_offset_y';
export const REMOTE_TEMPLATE_SELECT = `${REMOTE_TEMPLATE_SELECT_BASE}, ${REMOTE_TEMPLATE_PREVIEW_SETTINGS_SELECT}`;
export const REMOTE_LIST_SELECT = 'id, owner_user_id, template_id, title, description, is_public, play_count, owner_name, owner_username, has_adult_content, custom_items, created_at, updated_at';
export const REMOTE_LIST_ROWS_SELECT = 'id, list_id, position, label, color, title_ids';
export const REMOTE_LIST_POOL_SELECT = 'list_id, title_id, position';

let tierlistRemoteCacheVersion = 0;
let remoteTemplatePreviewSettingsSupported = true;

export function getRemoteCacheVersion() {
  return tierlistRemoteCacheVersion;
}

export function getRemoteTemplatePreviewSettingsSupported() {
  return remoteTemplatePreviewSettingsSupported;
}

export function setRemoteTemplatePreviewSettingsSupported(value) {
  remoteTemplatePreviewSettingsSupported = Boolean(value);
}

export function readTimedCache(cache, key) {
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

export function writeTimedCache(cache, key, value, ttlMs = REMOTE_CACHE_TTL_MS) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export function invalidateTierlistRemoteCaches() {
  tierlistRemoteCacheVersion += 1;
  remoteTemplatesRequestCache.clear();
  remoteListsRequestCache.clear();
  remoteTemplatesResultCache.clear();
  remoteListsResultCache.clear();
  tierTemplateDetailRequestCache.clear();
  tierListDetailRequestCache.clear();
}

export function getErrorStatus(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.error?.status ?? error?.error?.statusCode ?? 0);
  return Number.isFinite(status) ? status : 0;
}

export function getErrorCode(error) {
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

export function isMissingTemplatePreviewSettingsError(error) {
  return [
    'manual_preview_artwork_url',
    'preview_artwork_fit',
    'preview_artwork_position',
    'preview_artwork_scale',
    'preview_artwork_offset_x',
    'preview_artwork_offset_y',
  ].some((columnName) => hasMissingColumn(error, columnName));
}

export function isNoRowsSingleResultError(error) {
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

export function createTierlistDiagnosticError(action, context = {}, error = null) {
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

export function isNetworkLikeError(error) {
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

export function isForeignKeyError(error) {
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

export function isUniqueConflictError(error) {
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

export function isPermissionLikeError(error) {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);
  return (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('forbidden')
  );
}

export function toRemoteTemplate(template, userId = null, options = {}) {
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

export function fromRemoteTemplate(row) {
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

export function toRemoteList(list, userId = null) {
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

export function fromRemoteList(row, rows = [], poolItems = []) {
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
