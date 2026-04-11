import { getTitlePreviewByIds } from '@/features/discover/lib/recommend';
import {
  BROWSE_ENTITY_ID_LIMIT,
  BROWSE_ENTITY_IDS_PER_LIST,
  BROWSE_ENTITY_IDS_PER_TEMPLATE,
  BROWSE_ENTITY_LIST_LIMIT,
} from '@/features/tierlist/constants';
import {
  createEmptyBrowseVisibility as createEmptyBrowseVisibilityFromApi,
  fetchTierlistBrowseVisibility,
  fetchTierlistCharacterEntities,
  fetchTierlistSongCountMap,
  fetchTierlistSongsForTitle,
  fetchTierlistThemeSongEntities,
} from '@/features/tierlist/api';
import {
  sortListsByRecentAndPopularity,
  sortTemplates,
} from '@/features/tierlist/lib/tierlistPageUtils';
import {
  CHARACTER_ENTITY_TYPE,
  TEXT_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  YOUTUBE_ENTITY_TYPE,
  getCatalogEntities,
  isCharacterEntity,
  isThemeSongEntity,
  isYoutubeEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';

export function toCustomTierEntity(item, entityType = TITLE_ENTITY_TYPE) {
  const resolvedEntityType = normalizeCatalogEntityType(item?.entityType || entityType);
  if (resolvedEntityType === THEME_SONG_ENTITY_TYPE || resolvedEntityType === YOUTUBE_ENTITY_TYPE) {
    const title = String(item?.title || '');
    const subtitle = String(item?.subtitle || '');
    const videoUrl = String(item?.videoUrl || item?.sourceUrl || '');
    const themeLabel = String(item?.themeLabel || item?.role || 'YouTube');
    const artistName = String(item?.artistName || '');

    return {
      id: Number(item?.id),
      entityType: resolvedEntityType,
      title: title,
      title_en: title,
      title_th: title,
      sourceTitleName: subtitle,
      subtitle,
      cover: String(item?.imageUrl || ''),
      image_url: String(item?.imageUrl || ''),
      source_url: String(item?.sourceUrl || videoUrl || ''),
      trailer_url: String(item?.videoUrl || item?.sourceUrl || ''),
      video_url: String(item?.videoUrl || item?.sourceUrl || ''),
      trailer_site: String(item?.trailerSite || ''),
      trailer_video_id: String(item?.trailerVideoId || ''),
      trailer_thumbnail_url: String(item?.trailerThumbnailUrl || item?.imageUrl || ''),
      song_title: title,
      artist_name: artistName,
      theme_label: themeLabel,
      role: themeLabel,
      isCustomTierItem: true,
    };
  }

  const base = {
    id: Number(item?.id),
    title: String(item?.title || ''),
    title_en: String(item?.title || ''),
    title_th: String(item?.title || ''),
    sourceTitleName: String(item?.subtitle || ''),
    subtitle: String(item?.subtitle || ''),
    cover: String(item?.imageUrl || item?.cover || item?.image_url || ''),
    image_url: String(item?.imageUrl || item?.cover || item?.image_url || ''),
    source_url: String(item?.sourceUrl || ''),
    entityType: resolvedEntityType,
    isCustomTierItem: true,
  };

  if (resolvedEntityType === TEXT_ENTITY_TYPE && item?.textTileSize) {
    base.textTileSize = item.textTileSize;
  }

  return base;
}

export function buildEntityMaps(titles = [], customItems = [], customEntityType = TITLE_ENTITY_TYPE) {
  const sourceEntries = Array.isArray(titles) ? titles : [];
  const customEntities = (customItems || []).map((item) => toCustomTierEntity(item, customEntityType));
  const titleMap = new Map(
    [...sourceEntries
      .filter((entry) => !isCharacterEntity(entry) && !isThemeSongEntity(entry) && !isYoutubeEntity(entry))
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
  const youtubeMap = new Map(
    [...sourceEntries
      .filter((entry) => isYoutubeEntity(entry))
      .map((video) => [Number(video.id), video]), ...customEntities.map((item) => [Number(item.id), item])]
  );

  return {
    [TITLE_ENTITY_TYPE]: titleMap,
    [CHARACTER_ENTITY_TYPE]: characterMap,
    [THEME_SONG_ENTITY_TYPE]: themeSongMap,
    [YOUTUBE_ENTITY_TYPE]: youtubeMap,
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

  const fallbackOrder = [THEME_SONG_ENTITY_TYPE, YOUTUBE_ENTITY_TYPE, TITLE_ENTITY_TYPE, CHARACTER_ENTITY_TYPE]
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
  return createEmptyBrowseVisibilityFromApi();
}

export function mergeBrowseVisibilityState(current = createEmptyBrowseVisibility(), incoming = createEmptyBrowseVisibility()) {
  const nextVisibility = createEmptyBrowseVisibility();
  const buckets = ['allowedByType', 'blockedByType'];
  const entityTypes = [TITLE_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, YOUTUBE_ENTITY_TYPE, CHARACTER_ENTITY_TYPE];

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

export async function fetchThemeSongEntitiesByIds(songIds = [], options = {}) {
  return fetchTierlistThemeSongEntities(songIds, options);
}

export async function fetchCharacterEntitiesByIds(characterIds = [], options = {}) {
  return fetchTierlistCharacterEntities(characterIds, options);
}

const titleSongCache = new Map();
const titleSongRequestCache = new Map();
let songCountMapCache = null;
let songCountMapPromise = null;

export async function fetchSongsForTitle(title) {
  const titleId = Number(title?.id || 0);
  if (!titleId) {
    return [];
  }

  if (titleSongCache.has(titleId)) {
    return titleSongCache.get(titleId);
  }

  if (titleSongRequestCache.has(titleId)) {
    return titleSongRequestCache.get(titleId);
  }

  const request = (async () => {
    const entities = await fetchTierlistSongsForTitle(title);
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
    const countMap = await fetchTierlistSongCountMap();
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
  return fetchTierlistBrowseVisibility({ titleIds, songIds, characterIds }, showAdult);
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
