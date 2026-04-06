import { getTitlePreviewByIds } from '@/features/discover/lib/recommend';
import {
  BROWSE_ENTITY_ID_LIMIT,
  BROWSE_ENTITY_IDS_PER_LIST,
  BROWSE_ENTITY_IDS_PER_TEMPLATE,
  BROWSE_ENTITY_LIST_LIMIT,
  ENTITY_VISIBILITY_CHUNK_SIZE,
} from '@/features/tierlist/constants';
import {
  sortListsByRecentAndPopularity,
  sortTemplates,
} from '@/features/tierlist/lib/tierlistPageUtils';
import { CANONICAL_TITLE_PREVIEW_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  buildCharacterEntity,
  buildThemeSongEntity,
  getCatalogEntities,
  isCharacterEntity,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { supabase } from '@/shared/lib/supabase';

export function toCustomTierEntity(item, entityType = TITLE_ENTITY_TYPE) {
  return {
    id: Number(item?.id),
    title: String(item?.title || ''),
    title_en: String(item?.title || ''),
    title_th: String(item?.title || ''),
    sourceTitleName: String(item?.subtitle || ''),
    subtitle: String(item?.subtitle || ''),
    cover: String(item?.imageUrl || ''),
    image_url: String(item?.imageUrl || ''),
    source_url: String(item?.sourceUrl || ''),
    entityType: normalizeCatalogEntityType(entityType),
    isCustomTierItem: true,
  };
}

export function buildEntityMaps(titles = [], customItems = [], customEntityType = TITLE_ENTITY_TYPE) {
  const sourceEntries = Array.isArray(titles) ? titles : [];
  const customEntities = (customItems || []).map((item) => toCustomTierEntity(item, customEntityType));
  const titleMap = new Map(
    [...sourceEntries
      .filter((entry) => !isCharacterEntity(entry) && !isThemeSongEntity(entry))
      .map((title) => [Number(title.id), title]), ...customEntities.map((item) => [Number(item.id), item])]
  );
  const directCharacterEntities = sourceEntries.filter((entry) => isCharacterEntity(entry));
  const catalogCharacterEntities = getCatalogEntities(sourceEntries, CHARACTER_ENTITY_TYPE);
  const characterMap = new Map(
    [...catalogCharacterEntities, ...directCharacterEntities, ...customEntities].map((character) => [Number(character.id), character])
  );
  const themeSongMap = new Map(
    [...sourceEntries
      .filter((entry) => isThemeSongEntity(entry))
      .map((song) => [Number(song.id), song]), ...customEntities.map((item) => [Number(item.id), item])]
  );

  return {
    [TITLE_ENTITY_TYPE]: titleMap,
    [CHARACTER_ENTITY_TYPE]: characterMap,
    [THEME_SONG_ENTITY_TYPE]: themeSongMap,
  };
}

export function getEntityMap(entityMaps, entityType = TITLE_ENTITY_TYPE) {
  return entityMaps[normalizeCatalogEntityType(entityType)] || entityMaps[TITLE_ENTITY_TYPE] || new Map();
}

export function getBestEntityMapForIds(entityMaps, ids = [], preferredType = TITLE_ENTITY_TYPE) {
  const normalizedIds = [...new Set((ids || []).map(Number).filter(Boolean))];
  const preferredMap = getEntityMap(entityMaps, preferredType);

  if (normalizedIds.length === 0) {
    return preferredMap;
  }

  if (normalizedIds.some((id) => preferredMap.has(id))) {
    return preferredMap;
  }

  const fallbackOrder = [THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, CHARACTER_ENTITY_TYPE]
    .filter((type, index, list) => type !== normalizeCatalogEntityType(preferredType) && list.indexOf(type) === index);

  for (const type of fallbackOrder) {
    const candidateMap = getEntityMap(entityMaps, type);
    if (normalizedIds.some((id) => candidateMap.has(id))) {
      return candidateMap;
    }
  }

  return preferredMap;
}

export function getBrowseHydrationEntryKey(entry) {
  if (!entry?.id) {
    return '';
  }

  return `${entry?.rows ? 'list' : 'template'}:${entry.id}`;
}

export function mergeEntitiesByTypeAndId(current = [], incoming = []) {
  const merged = new Map();

  [...(current || []), ...(incoming || [])].forEach((entity) => {
    if (!entity?.id) {
      return;
    }

    const key = `${normalizeCatalogEntityType(entity.entityType)}:${Number(entity.id)}`;
    merged.set(key, entity);
  });

  return [...merged.values()];
}

export function createEmptyBrowseVisibility() {
  return {
    allowedByType: {
      [TITLE_ENTITY_TYPE]: new Set(),
      [CHARACTER_ENTITY_TYPE]: new Set(),
      [THEME_SONG_ENTITY_TYPE]: new Set(),
    },
    blockedByType: {
      [TITLE_ENTITY_TYPE]: new Set(),
      [CHARACTER_ENTITY_TYPE]: new Set(),
      [THEME_SONG_ENTITY_TYPE]: new Set(),
    },
  };
}

export function mergeBrowseVisibilityState(current = createEmptyBrowseVisibility(), incoming = createEmptyBrowseVisibility()) {
  const nextVisibility = createEmptyBrowseVisibility();
  const buckets = ['allowedByType', 'blockedByType'];
  const entityTypes = [TITLE_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, CHARACTER_ENTITY_TYPE];

  buckets.forEach((bucket) => {
    entityTypes.forEach((entityType) => {
      const combined = new Set([
        ...(current?.[bucket]?.[entityType] || []),
        ...(incoming?.[bucket]?.[entityType] || []),
      ]);
      nextVisibility[bucket][entityType] = combined;
    });
  });

  return nextVisibility;
}

function normalizeJoinedTitleRecord(record) {
  const rawTitle = Array.isArray(record) ? record[0] : record;
  return rawTitle ? mapCanonicalTitle(rawTitle) : null;
}

export async function fetchThemeSongEntitiesByIds(songIds = [], options = {}) {
  const uniqueSongIds = [...new Set((songIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!supabase || uniqueSongIds.length === 0) {
    return [];
  }

  let songQuery = supabase
    .from('title_theme_songs')
    .select(`
      id,
      theme_type,
      theme_sequence,
      song_title,
      artist_name,
      episodes_text,
      video_url,
      is_creditless,
      is_spoiler,
      is_nsfw,
      canonical_title_id,
      canonical_titles!inner(${CANONICAL_TITLE_PREVIEW_SELECT})
    `)
    .in('id', uniqueSongIds);

  if (typeof options?.showAdult === 'boolean') {
    songQuery = songQuery.eq('canonical_titles.is_adult', options.showAdult);
  }

  const { data: songRows, error: songError } = await songQuery;

  if (songError) {
    throw songError;
  }

  return (songRows || []).map((song) =>
    buildThemeSongEntity(song, normalizeJoinedTitleRecord(song.canonical_titles))
  );
}

function chunkIds(ids = [], size = ENTITY_VISIBILITY_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

function getFallbackCharacterSourceId(characterId) {
  const numericId = Number(characterId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return 0;
  }

  return Math.floor((numericId - 1) / 1000);
}

function sortCharacterRows(rows = []) {
  return [...rows].sort((left, right) => {
    const sortDelta = Number(left?.sort_order ?? 0) - Number(right?.sort_order ?? 0);
    if (sortDelta !== 0) {
      return sortDelta;
    }

    return String(left?.name_full || '').localeCompare(String(right?.name_full || ''));
  });
}

function buildCharacterEntitiesFromRows(sourceTitles = [], characterRows = []) {
  const titlesById = new Map((sourceTitles || []).map((title) => [Number(title.id), title]));
  const rowsByTitleId = new Map();

  (characterRows || []).forEach((row) => {
    const titleId = Number(row?.canonical_title_id || 0);
    if (!titleId) {
      return;
    }

    if (!rowsByTitleId.has(titleId)) {
      rowsByTitleId.set(titleId, []);
    }

    rowsByTitleId.get(titleId).push(row);
  });

  const entities = [];

  rowsByTitleId.forEach((rows, titleId) => {
    const sourceTitle = titlesById.get(Number(titleId));
    if (!sourceTitle) {
      return;
    }

    sortCharacterRows(rows).forEach((row, index) => {
      entities.push(buildCharacterEntity(sourceTitle, row, index));
    });
  });

  return entities;
}

export async function fetchCharacterEntitiesByIds(characterIds = [], options = {}) {
  const uniqueCharacterIds = [...new Set((characterIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!supabase || uniqueCharacterIds.length === 0) {
    return [];
  }

  const characterRows = [];
  const sourceTitles = [];
  const resolvedIds = new Set();

  const mainChunks = [];
  for (let index = 0; index < uniqueCharacterIds.length; index += 200) {
    mainChunks.push(uniqueCharacterIds.slice(index, index + 200));
  }

  const mainResults = await Promise.all(
    mainChunks.map((chunk) => {
      let query = supabase
        .from('title_characters')
        .select(`
          canonical_title_id,
          anilist_id,
          name_full,
          name_native,
          image_url,
          role,
          is_primary_protagonist,
          is_primary_heroine,
          lead_type,
          presentation_gender,
          voice_actor_name,
          voice_actor_image,
          sort_order,
          canonical_titles!inner(${CANONICAL_TITLE_PREVIEW_SELECT})
        `)
        .in('anilist_id', chunk);

      if (typeof options?.showAdult === 'boolean') {
        query = query.eq('canonical_titles.is_adult', options.showAdult);
      }

      return query;
    })
  );

  for (const { data, error } of mainResults) {
    if (error) throw error;
    characterRows.push(...(data || []));
    (data || []).forEach((row) => {
      const anilistId = Number(row?.anilist_id || 0);
      if (anilistId > 0) resolvedIds.add(anilistId);
      const sourceTitle = normalizeJoinedTitleRecord(row.canonical_titles);
      if (sourceTitle) sourceTitles.push(sourceTitle);
    });
  }

  const unresolvedFallbackIds = uniqueCharacterIds.filter((id) => !resolvedIds.has(id));
  const fallbackSourceIds = [...new Set(
    unresolvedFallbackIds
      .map((id) => getFallbackCharacterSourceId(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];

  if (fallbackSourceIds.length > 0) {
    const fallbackResults = await Promise.all(
      chunkIds(fallbackSourceIds).map((chunk) => {
        let query = supabase
          .from('title_characters')
          .select(`
            canonical_title_id,
            anilist_id,
            name_full,
            name_native,
            image_url,
            role,
            is_primary_protagonist,
            is_primary_heroine,
            lead_type,
            presentation_gender,
            voice_actor_name,
            voice_actor_image,
            sort_order,
            canonical_titles!inner(${CANONICAL_TITLE_PREVIEW_SELECT})
          `)
          .in('canonical_title_id', chunk);

        if (typeof options?.showAdult === 'boolean') {
          query = query.eq('canonical_titles.is_adult', options.showAdult);
        }

        return query;
      })
    );

    for (const { data: fallbackRows, error: fallbackError } of fallbackResults) {
      if (fallbackError) throw fallbackError;
      characterRows.push(...(fallbackRows || []));
      (fallbackRows || []).forEach((row) => {
        const sourceTitle = normalizeJoinedTitleRecord(row.canonical_titles);
        if (sourceTitle) sourceTitles.push(sourceTitle);
      });
    }
  }

  if (characterRows.length === 0) {
    return [];
  }

  const builtEntities = buildCharacterEntitiesFromRows(sourceTitles, characterRows);
  const entityById = new Map(builtEntities.map((entity) => [Number(entity.id), entity]));

  return uniqueCharacterIds
    .map((characterId) => entityById.get(Number(characterId)) || null)
    .filter(Boolean);
}

const titleSongCache = new Map();
const titleSongRequestCache = new Map();
let songCountMapCache = null;
let songCountMapPromise = null;

export async function fetchSongsForTitle(title) {
  const titleId = Number(title?.id || 0);
  if (!supabase || !titleId) {
    return [];
  }

  if (titleSongCache.has(titleId)) {
    return titleSongCache.get(titleId);
  }

  if (titleSongRequestCache.has(titleId)) {
    return titleSongRequestCache.get(titleId);
  }

  const request = (async () => {
    const { data, error } = await supabase
      .from('title_theme_songs')
      .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
      .eq('canonical_title_id', titleId)
      .order('display_order');

    if (error) {
      throw error;
    }

    const entities = (data || []).map((song) => buildThemeSongEntity(song, title));
    titleSongCache.set(titleId, entities);
    return entities;
  })();

  titleSongRequestCache.set(titleId, request);

  try {
    return await request;
  } finally {
    titleSongRequestCache.delete(titleId);
  }
}

export function preloadSongsForTitle(title) {
  void fetchSongsForTitle(title).catch(() => {});
}

export async function getSongCountMap() {
  if (songCountMapCache) {
    return songCountMapCache;
  }

  if (songCountMapPromise) {
    return songCountMapPromise;
  }

  songCountMapPromise = (async () => {
    const { data, error } = await supabase
      .from('title_theme_songs')
      .select('canonical_title_id');

    if (error) {
      throw error;
    }

    const countMap = new Map();
    (data || []).forEach((row) => {
      const id = Number(row.canonical_title_id);
      if (id > 0) {
        countMap.set(id, (countMap.get(id) || 0) + 1);
      }
    });

    songCountMapCache = countMap;
    return countMap;
  })();

  try {
    return await songCountMapPromise;
  } finally {
    songCountMapPromise = null;
  }
}

export function getTierEntryEntityIds(entry, options = {}) {
  const maxIds = Number(options?.maxIds || 0);
  const shouldLimit = Number.isFinite(maxIds) && maxIds > 0;
  if (!entry) {
    return [];
  }

  if (Array.isArray(entry.titleIds)) {
    const normalized = entry.titleIds.map(Number).filter(Boolean);
    return shouldLimit ? normalized.slice(0, maxIds) : normalized;
  }

  const combined = [
    ...((entry.poolTitleIds || []).map(Number)),
    ...((entry.rows || []).flatMap((row) => row.titleIds || []).map(Number)),
  ];
  return shouldLimit ? combined.slice(0, maxIds) : combined;
}

function buildVisibilityFromEntities(titleEntities, songEntities, characterEntities, showAdult) {
  const visibility = createEmptyBrowseVisibility();
  if (typeof showAdult !== 'boolean') {
    return visibility;
  }
  const addTo = (entityType, id, isAdult) => {
    const bucket = Boolean(isAdult) === showAdult ? 'allowedByType' : 'blockedByType';
    visibility[bucket][entityType].add(Number(id));
  };
  (titleEntities || []).forEach((title) => title?.id && addTo(TITLE_ENTITY_TYPE, title.id, title.is_adult));
  (songEntities || []).forEach((song) => song?.id && addTo(THEME_SONG_ENTITY_TYPE, song.id, song.is_adult));
  (characterEntities || []).forEach((character) => character?.id && addTo(CHARACTER_ENTITY_TYPE, character.id, character.is_adult));
  return visibility;
}

function collectBrowseEntityIdsFromEntries(entries = []) {
  const titleIds = new Set();
  const songIds = new Set();
  const characterIds = new Set();

  (entries || []).forEach((entry) => {
    if (titleIds.size + songIds.size + characterIds.size >= BROWSE_ENTITY_ID_LIMIT) {
      return;
    }

    const entityType = normalizeCatalogEntityType(entry.entityType);
    const ids = getTierEntryEntityIds(entry, {
      maxIds: entry?.rows ? BROWSE_ENTITY_IDS_PER_LIST : BROWSE_ENTITY_IDS_PER_TEMPLATE,
    });

    ids.forEach((id) => {
      if (titleIds.size + songIds.size + characterIds.size >= BROWSE_ENTITY_ID_LIMIT) {
        return;
      }
      const numericId = Number(id);
      if (!numericId) {
        return;
      }

      if (entityType === THEME_SONG_ENTITY_TYPE) {
        songIds.add(numericId);
      } else if (entityType === CHARACTER_ENTITY_TYPE) {
        characterIds.add(numericId);
      } else {
        titleIds.add(numericId);
      }
    });
  });

  return {
    titleIds: [...titleIds],
    songIds: [...songIds],
    characterIds: [...characterIds],
  };
}

function collectTierLibraryBrowseEntityIds(library) {
  const publicTemplates = sortTemplates(
    (library?.templates || []).filter((template) => template.isPublic),
    'popular'
  );
  const publicLists = sortListsByRecentAndPopularity(
    (library?.lists || []).filter((list) => list.isPublic)
  ).slice(0, BROWSE_ENTITY_LIST_LIMIT);
  return collectBrowseEntityIdsFromEntries([...publicTemplates, ...publicLists]);
}

function collectVisibilityEntityIdsFromEntries(entries = []) {
  const titleIds = new Set();
  const songIds = new Set();
  const characterIds = new Set();

  (entries || []).forEach((entry) => {
    const entityType = normalizeCatalogEntityType(entry.entityType);
    const ids = getTierEntryEntityIds(entry);
    ids.forEach((id) => {
      const numericId = Number(id);
      if (!numericId) {
        return;
      }

      if (entityType === THEME_SONG_ENTITY_TYPE) {
        songIds.add(numericId);
      } else if (entityType === CHARACTER_ENTITY_TYPE) {
        characterIds.add(numericId);
      } else {
        titleIds.add(numericId);
      }
    });
  });

  return {
    titleIds: [...titleIds],
    songIds: [...songIds],
    characterIds: [...characterIds],
  };
}

function _collectTierLibraryVisibilityEntityIds(library) {
  return collectVisibilityEntityIdsFromEntries([
    ...((library?.templates || []).filter((template) => template.isPublic)),
    ...((library?.lists || []).filter((list) => list.isPublic)),
  ]);
}

async function _fetchEntityVisibilityByAdultMode({ titleIds = [], songIds = [], characterIds = [] }, showAdult = false) {
  if (!supabase) {
    return createEmptyBrowseVisibility();
  }

  const visibility = createEmptyBrowseVisibility();

  const [titleResults, songResults, characterResults] = await Promise.all([
    Promise.all(
      chunkIds(titleIds).map((chunk) =>
        supabase.from('canonical_titles').select('id, is_adult').in('id', chunk)
      )
    ),
    Promise.all(
      chunkIds(songIds).map((chunk) =>
        supabase.from('title_theme_songs').select('id, canonical_titles!inner(is_adult)').in('id', chunk)
      )
    ),
    Promise.all(
      chunkIds(characterIds).map((chunk) =>
        supabase.from('title_characters').select('anilist_id, canonical_titles!inner(is_adult)').in('anilist_id', chunk)
      )
    ),
  ]);

  for (const { data, error } of titleResults) {
    if (error) throw error;
    (data || []).forEach((row) => {
      const id = Number(row.id);
      if (!id) return;
      const bucket = Boolean(row.is_adult) === showAdult ? 'allowedByType' : 'blockedByType';
      visibility[bucket][TITLE_ENTITY_TYPE].add(id);
    });
  }

  for (const { data, error } of songResults) {
    if (error) throw error;
    (data || []).forEach((row) => {
      const id = Number(row.id);
      const titleRecord = Array.isArray(row.canonical_titles) ? row.canonical_titles[0] : row.canonical_titles;
      if (!id || titleRecord?.is_adult === undefined) return;
      const bucket = Boolean(titleRecord.is_adult) === showAdult ? 'allowedByType' : 'blockedByType';
      visibility[bucket][THEME_SONG_ENTITY_TYPE].add(id);
    });
  }

  for (const { data, error } of characterResults) {
    if (error) throw error;
    (data || []).forEach((row) => {
      const id = Number(row.anilist_id);
      const titleRecord = Array.isArray(row.canonical_titles) ? row.canonical_titles[0] : row.canonical_titles;
      if (!id || titleRecord?.is_adult === undefined) return;
      const bucket = Boolean(titleRecord.is_adult) === showAdult ? 'allowedByType' : 'blockedByType';
      visibility[bucket][CHARACTER_ENTITY_TYPE].add(id);
    });
  }

  const unresolvedCharacterIds = characterIds.filter((id) => (
    !visibility.allowedByType[CHARACTER_ENTITY_TYPE].has(id)
    && !visibility.blockedByType[CHARACTER_ENTITY_TYPE].has(id)
  ));
  const fallbackSourceIds = [...new Set(
    unresolvedCharacterIds
      .map((id) => getFallbackCharacterSourceId(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  )];

  if (fallbackSourceIds.length > 0) {
    const fallbackResults = await Promise.all(
      chunkIds(fallbackSourceIds).map((chunk) =>
        supabase.from('canonical_titles').select('id, is_adult').in('id', chunk)
      )
    );

    for (const { data, error } of fallbackResults) {
      if (error) throw error;
      const titleById = new Map((data || []).map((row) => [Number(row.id), Boolean(row.is_adult)]));
      unresolvedCharacterIds.forEach((characterId) => {
        const sourceId = getFallbackCharacterSourceId(characterId);
        if (!titleById.has(sourceId)) return;
        const bucket = titleById.get(sourceId) === showAdult ? 'allowedByType' : 'blockedByType';
        visibility[bucket][CHARACTER_ENTITY_TYPE].add(Number(characterId));
      });
    }
  }

  return visibility;
}

async function _resolveTierLibraryBrowseEntities(library, options = {}) {
  const { titleIds, songIds, characterIds } = collectTierLibraryBrowseEntityIds(library);
  return resolveTierBrowseEntitiesForIds({ titleIds, songIds, characterIds }, options);
}

export async function resolveTierBrowsePreviewEntitiesForIds({ titleIds = [], songIds = [], characterIds = [] }) {
  const [titles, characterEntities] = await Promise.all([
    getTitlePreviewByIds(titleIds),
    fetchCharacterEntitiesByIds(characterIds),
  ]);
  const resolvedTitleIdSet = new Set((titles || []).map((entry) => Number(entry.id)));
  const missingTitleIds = titleIds.filter((id) => !resolvedTitleIdSet.has(Number(id)));
  const mergedSongIds = [...new Set([
    ...songIds,
    ...missingTitleIds,
  ])];
  const songEntities = await fetchThemeSongEntitiesByIds(mergedSongIds);

  return {
    titles: [...titles, ...characterEntities],
    songEntities,
  };
}

export async function resolveTierBrowseEntitiesForIds({ titleIds = [], songIds = [], characterIds = [] }, options = {}) {
  const [titles, characterEntities] = await Promise.all([
    getTitlePreviewByIds(titleIds),
    fetchCharacterEntitiesByIds(characterIds),
  ]);
  const resolvedTitleIdSet = new Set((titles || []).map((entry) => Number(entry.id)));
  const missingTitleIds = titleIds.filter((id) => !resolvedTitleIdSet.has(Number(id)));
  const mergedSongIds = [...new Set([...songIds, ...missingTitleIds])];
  const songEntities = await fetchThemeSongEntitiesByIds(mergedSongIds);

  const visibility = buildVisibilityFromEntities(titles, songEntities, characterEntities, options?.showAdult);

  return {
    titles: [...titles, ...characterEntities],
    songEntities,
    visibility,
  };
}

export async function resolveTierBrowsePreviewEntitiesForEntries(entries = [], options = {}) {
  const entityIds = collectBrowseEntityIdsFromEntries(entries);
  return resolveTierBrowsePreviewEntitiesForIds(entityIds, options);
}

export async function resolveTierBrowseEntitiesForEntries(entries = [], options = {}) {
  const entityIds = collectBrowseEntityIdsFromEntries(entries);
  return resolveTierBrowseEntitiesForIds(entityIds, options);
}

export function matchesTierEntryAgeGate(entry, entityMaps, showAdult = false, visibility = null) {
  if (!entry) {
    return false;
  }

  const ids = Array.isArray(entry.titleIds)
    ? entry.titleIds
    : [
      ...((entry.poolTitleIds || []).map(Number)),
      ...((entry.rows || []).flatMap((row) => row.titleIds || []).map(Number)),
    ];

  const normalizedIds = [...new Set(ids.map(Number).filter(Boolean))];
  if (normalizedIds.length === 0) {
    return false;
  }

  const entityType = normalizeCatalogEntityType(entry.entityType);
  const blockedIds = visibility?.blockedByType?.[entityType];
  const allowedIds = visibility?.allowedByType?.[entityType];

  if (blockedIds instanceof Set && normalizedIds.some((id) => blockedIds.has(id))) {
    return false;
  }

  if (allowedIds instanceof Set && normalizedIds.some((id) => allowedIds.has(id))) {
    return true;
  }

  const entityById = getBestEntityMapForIds(entityMaps, normalizedIds, entry.entityType);
  const resolvedEntities = normalizedIds
    .map((id) => entityById.get(Number(id)))
    .filter(Boolean);

  if (resolvedEntities.length === 0) {
    return false;
  }

  const hasAdultEntity = resolvedEntities.some((entity) => Boolean(entity?.is_adult));
  return showAdult ? hasAdultEntity : !hasAdultEntity;
}

export function matchesTemplateMetadataAgeGate(template, showAdult = false) {
  if (!template) {
    return false;
  }

  if (typeof template.hasAdultContent !== 'boolean') {
    return !showAdult;
  }

  return template.hasAdultContent === showAdult;
}

export function matchesListMetadataAgeGate(list, showAdult = false) {
  if (!list) {
    return false;
  }

  if (typeof list.hasAdultContent !== 'boolean') {
    return !showAdult;
  }

  return list.hasAdultContent === showAdult;
}

export function splitByAdultFlag(items = []) {
  return items.reduce((groups, item) => {
    if (item?.is_adult) {
      groups.adult.push(item);
    } else {
      groups.safe.push(item);
    }
    return groups;
  }, { safe: [], adult: [] });
}
