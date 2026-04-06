import { supabase } from '@/shared/lib/supabase';
import {
  collapseTierTemplatesByIdentity,
  dedupeTierEntryIds,
  loadLibraryRaw,
  normalizeLibrary,
  normalizeTemplate,
  normalizeTierList,
  saveLibraryRaw,
} from './tierlistStoreCore';
import {
  compareTierListsByRecency,
  detachTemplateFromList,
  getTierListDraftIdentityKey,
  hasMeaningfulTierRankingInStore,
  isOwnedTierListByUser,
  mergeLibraries,
  rekeyTemplateForOwner,
  rekeyTierListForOwner,
  shouldPromoteTemplateToOwnedCopy,
  shouldPromoteTierListToOwnedCopy,
} from './tierlistStoreLibraryHelpers';
import {
  createTierlistDiagnosticError,
  fromRemoteList,
  fromRemoteTemplate,
  getErrorStatus,
  invalidateTierlistRemoteCaches,
  isForeignKeyError,
  isMissingTemplatePreviewSettingsError,
  isNetworkLikeError,
  isPermissionLikeError,
  isUniqueConflictError,
  setRemoteTemplatePreviewSettingsSupported,
  getRemoteTemplatePreviewSettingsSupported,
  toRemoteList,
  toRemoteTemplate,
} from './tierlistStoreRemoteSupport';
import { fetchRemoteLists, fetchRemoteTemplates } from './tierlistStoreRemoteQueries';

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
    return await persistTemplate(getRemoteTemplatePreviewSettingsSupported());
  } catch (error) {
    if (getRemoteTemplatePreviewSettingsSupported() && isMissingTemplatePreviewSettingsError(error)) {
      setRemoteTemplatePreviewSettingsSupported(false);
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
    if (!prev) return true;
    return (
      prev.label !== payload.label ||
      prev.color !== payload.color ||
      prev.position !== payload.position ||
      JSON.stringify(prev.title_ids) !== JSON.stringify(payload.title_ids)
    );
  });
}

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

  const changedRowPayload = getChangedRowPayloads(remoteBaseline?.rows, rowPayload);
  if (changedRowPayload.length > 0) {
    const { error: rowInsertError } = await supabase
      .from('tierlist_list_rows')
      .upsert(changedRowPayload, { onConflict: 'id' });
    if (rowInsertError) throw rowInsertError;
  }

  const nextPoolIds = dedupeTierEntryIds(normalized.poolTitleIds);
  if (poolTitleIdsChanged(remoteBaseline, nextPoolIds) && poolPayload.length > 0) {
    const chunkSize = 500;
    for (let index = 0; index < poolPayload.length; index += chunkSize) {
      const chunk = poolPayload.slice(index, index + chunkSize);
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
      if (library && list.templateId && userId) {
        const sourceTemplate = (library.templates || []).find(
          (template) => String(template.id) === String(list.templateId)
        );
        if (sourceTemplate) {
          try {
            await saveRemoteTemplateWithRecovery(sourceTemplate, userId, { allowRekey: false });
            return await saveRemoteList(list, userId, previousList);
          } catch {
            // Fall through to strip templateId
          }
        }
      }
      const listWithoutTemplate = normalizeTierList({ ...list, templateId: '' });
      try {
        return await saveRemoteList(listWithoutTemplate, userId, previousList);
      } catch (retryError) {
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
    saveLibraryRaw(source);
    invalidateTierlistRemoteCaches();
    throw createTierlistDiagnosticError('delete_tierlist_failed', {
      step: 'delete_tierlist',
      listId: normalizedListId,
    }, error);
  }
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
