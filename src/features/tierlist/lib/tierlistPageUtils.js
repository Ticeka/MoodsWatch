import { normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';

export function sortTemplates(templates, sortBy) {
  if (sortBy === 'newest') {
    return [...templates].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  if (sortBy === 'alphabet') {
    return [...templates].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }

  return [...templates].sort((a, b) => Number(b.plays || 0) - Number(a.plays || 0));
}

export function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: clampedPage,
    totalPages,
  };
}

export function getCurrentUsername(user) {
  return user?.profile?.username || user?.user_metadata?.username || null;
}

export function isOwnedTemplateByUser(template, user) {
  if (!template) {
    return false;
  }

  if (user?.id && template?.ownerUserId) {
    return String(template.ownerUserId) === String(user.id);
  }

  return !template?.ownerUserId && !template?.isPublic;
}

export function isOwnedListByUser(list, user) {
  if (!list) {
    return false;
  }

  if (user?.id && list?.ownerUserId) {
    return String(list.ownerUserId) === String(user.id);
  }

  return !list?.ownerUserId && String(list?.ownerName || '').trim().toLowerCase() === 'you';
}

export function formatTierDate(value, locale) {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export function buildRemixedTierList(list, user) {
  const ownerUsername = getCurrentUsername(user);

  return {
    ...list,
    id: undefined,
    ownerName: ownerUsername || 'You',
    ownerUsername,
    ownerUserId: user?.id || null,
    isPublic: false,
    title: `${list.title} (Remix)`,
    playCount: 0,
  };
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
      titleIds: (row?.titleIds || []).map(Number).filter(Boolean),
    })),
    poolTitleIds: (list.poolTitleIds || []).map(Number).filter(Boolean),
  });
}

function dedupeTierListsByIdentity(lists = []) {
  const seen = new Set();

  return [...lists]
    .sort((a, b) => {
      const updatedDelta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
      if (updatedDelta !== 0) {
        return updatedDelta;
      }

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
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return Number(b.playCount || 0) - Number(a.playCount || 0);
  });
}

export function getTierListPodium(list, entityById) {
  if (!list || !entityById) {
    return [];
  }

  return list.rows
    .flatMap((row) => row.titleIds || [])
    .map((id) => entityById.get(Number(id)))
    .filter(Boolean)
    .slice(0, 3);
}

export function getTierListPreviewTitles(list, titleById, limit = 4) {
  const ids = [
    ...(list?.rows || []).flatMap((row) => row.titleIds || []),
    ...(list?.poolTitleIds || []),
  ];

  return ids
    .map((id) => titleById.get(Number(id)))
    .filter(Boolean)
    .slice(0, limit);
}

export function hasVisibleTemplateTitles(template, titleById) {
  return (template?.titleIds || []).some((id) => titleById.has(Number(id)));
}

export function hasVisibleTierListTitles(list, titleById) {
  const ids = [
    ...(list?.rows || []).flatMap((row) => row.titleIds || []),
    ...(list?.poolTitleIds || []),
  ];

  return ids.some((id) => titleById.has(Number(id)));
}

export function hasMeaningfulTierRanking(list) {
  return (list?.rows || []).some((row) => Array.isArray(row?.titleIds) && row.titleIds.length > 0);
}

export function hasTierListStructureChanged(left, right) {
  if (!left || !right) {
    return false;
  }

  return JSON.stringify({
    rows: left.rows?.map((row) => ({
      id: row.id,
      titleIds: row.titleIds,
    })),
    poolTitleIds: left.poolTitleIds,
  }) !== JSON.stringify({
    rows: right.rows?.map((row) => ({
      id: row.id,
      titleIds: row.titleIds,
    })),
    poolTitleIds: right.poolTitleIds,
  });
}
