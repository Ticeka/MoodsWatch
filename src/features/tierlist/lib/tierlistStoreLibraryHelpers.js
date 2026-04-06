import { normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import {
  createTemplateFromCatalog,
  dedupeTierEntryIds,
  makeId,
  normalizeLibrary,
  normalizeTemplate,
  normalizeTierList,
} from './tierlistStoreCore';

export function getComparableTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function preferNewerTierListVersion(remoteList, localList) {
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

export function sortListsByRecentAndPopularity(lists = []) {
  return dedupeTierListsByIdentity(lists).sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return Number(b.playCount || 0) - Number(a.playCount || 0);
  });
}

export function rekeyTemplateForOwner(template, userId) {
  const timestamp = new Date().toISOString();
  return normalizeTemplate({
    ...template,
    id: makeId('template'),
    ownerUserId: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function rekeyTierListForOwner(list, userId) {
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

export function shouldPromoteTemplateToOwnedCopy(template, userId) {
  return Boolean(
    userId &&
    template &&
    !template.isSystem &&
    (!template.ownerUserId || String(template.ownerUserId) !== String(userId))
  );
}

export function shouldPromoteTierListToOwnedCopy(list, userId) {
  return Boolean(
    userId &&
    list &&
    (!list.ownerUserId || String(list.ownerUserId) !== String(userId))
  );
}

export function isOwnedTierListByUser(list, userId = null) {
  if (!list) {
    return false;
  }

  if (userId && list.ownerUserId) {
    return String(list.ownerUserId) === String(userId);
  }

  return !list.ownerUserId && String(list.ownerName || '').trim().toLowerCase() === 'you';
}

export function hasMeaningfulTierRankingInStore(list) {
  return (list?.rows || []).some((row) => Array.isArray(row?.titleIds) && row.titleIds.length > 0);
}

export function getTierListDraftIdentityKey(list) {
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

export function compareTierListsByRecency(left, right) {
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

export function withSystemTemplates(library, catalog = []) {
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

export function mergeLibraries(...libraries) {
  const merged = libraries.reduce((acc, library) => ({
    templates: [...acc.templates, ...(library?.templates || [])],
    lists: [...acc.lists, ...(library?.lists || [])],
  }), { templates: [], lists: [] });

  const normalized = normalizeLibrary(merged);

  normalized.templates.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  normalized.lists.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

  return normalized;
}

export function matchesRequestedAdultMode(entry, showAdult = null) {
  if (showAdult === null) {
    return true;
  }

  if (typeof entry?.hasAdultContent !== 'boolean') {
    return !showAdult;
  }

  return entry.hasAdultContent === showAdult;
}

export function applyAdultContentQueryFilter(query, showAdult, column = 'has_adult_content') {
  if (typeof showAdult !== 'boolean') {
    return query;
  }

  if (showAdult) {
    return query.eq(column, true);
  }

  return query.or(`${column}.eq.false,${column}.is.null`);
}

export function filterLocalTemplatesForRemoteMerge(templates = [], userId = null, showAdult = null) {
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

export function filterLocalListsForRemoteMerge(lists = [], userId = null, showAdult = null) {
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

export function detachTemplateFromList(list) {
  return normalizeTierList({
    ...list,
    templateId: '',
    updatedAt: new Date().toISOString(),
  });
}
