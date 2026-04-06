import { supabase } from '@/shared/lib/supabase';
import {
  DEFAULT_LIBRARY,
  findTierList,
  findTierTemplate,
  loadLibraryRaw,
  normalizeLibrary,
  normalizeTemplate,
  normalizeTierList,
  saveLibraryRaw,
  uniqueById,
} from './tierlistStoreCore';
import {
  applyAdultContentQueryFilter,
  filterLocalListsForRemoteMerge,
  filterLocalTemplatesForRemoteMerge,
  isOwnedTierListByUser,
  matchesRequestedAdultMode,
  mergeLibraries,
  preferNewerTierListVersion,
  sortListsByRecentAndPopularity,
  withSystemTemplates,
} from './tierlistStoreLibraryHelpers';
import {
  REMOTE_LIST_POOL_SELECT,
  REMOTE_LIST_ROWS_SELECT,
  REMOTE_LIST_SELECT,
  REMOTE_TEMPLATE_SELECT,
  REMOTE_TEMPLATE_SELECT_BASE,
  fromRemoteList,
  fromRemoteTemplate,
  getRemoteCacheVersion,
  getRemoteTemplatePreviewSettingsSupported,
  isMissingTemplatePreviewSettingsError,
  isNetworkLikeError,
  isNoRowsSingleResultError,
  readTimedCache,
  remoteListsRequestCache,
  remoteListsResultCache,
  remoteTemplatesRequestCache,
  remoteTemplatesResultCache,
  setRemoteTemplatePreviewSettingsSupported,
  tierListDetailRequestCache,
  tierTemplateDetailRequestCache,
  writeTimedCache,
} from './tierlistStoreRemoteSupport';

export async function fetchRemoteTemplates(userId = null, options = {}) {
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

  const cacheVersion = getRemoteCacheVersion();
  const request = (async () => {
    const requests = [];
    const runTemplateSelect = async (buildQuery) => {
      const selectValue = getRemoteTemplatePreviewSettingsSupported()
        ? REMOTE_TEMPLATE_SELECT
        : REMOTE_TEMPLATE_SELECT_BASE;
      const result = await buildQuery(selectValue);
      if (result?.error && getRemoteTemplatePreviewSettingsSupported() && isMissingTemplatePreviewSettingsError(result.error)) {
        setRemoteTemplatePreviewSettingsSupported(false);
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
    if (cacheVersion === getRemoteCacheVersion()) {
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

export async function fetchRemoteLists(userId = null, options = {}) {
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

  const cacheVersion = getRemoteCacheVersion();
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
      if (cacheVersion === getRemoteCacheVersion()) {
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
      if (cacheVersion === getRemoteCacheVersion()) {
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
    if (cacheVersion === getRemoteCacheVersion()) {
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
          getRemoteTemplatePreviewSettingsSupported()
            ? REMOTE_TEMPLATE_SELECT
            : REMOTE_TEMPLATE_SELECT_BASE
        );

        if (result?.error && getRemoteTemplatePreviewSettingsSupported() && isMissingTemplatePreviewSettingsError(result.error)) {
          setRemoteTemplatePreviewSettingsSupported(false);
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
            getRemoteTemplatePreviewSettingsSupported()
              ? REMOTE_TEMPLATE_SELECT
              : REMOTE_TEMPLATE_SELECT_BASE
          );

          if (result?.error && getRemoteTemplatePreviewSettingsSupported() && isMissingTemplatePreviewSettingsError(result.error)) {
            setRemoteTemplatePreviewSettingsSupported(false);
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
    return remoteLists.map((remoteList) => {
      const localList = localLibrary.lists.find((list) => String(list.id) === String(remoteList.id));
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
