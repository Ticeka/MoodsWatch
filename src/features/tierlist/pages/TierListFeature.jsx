import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crown,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Loader2,
  Medal,
  Monitor,
  Music,
  Palette,
  Pencil,
  Play,
  Plus,
  Search,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getCharactersPage, getTitleBySlug, getTitlePreviewByIds, getTitlesByIds, getTitlesPage } from '@/features/discover/lib/recommend';
import {
  getTierItemTitleFromFilename,
  uploadTierlistImage,
} from '@/features/tierlist/api';
import {
  TierListArtworkImage as ArtworkImage,
  TierListCommentSection,
  TierListCommunityCard,
  TierListEmptyPanel,
  TierListErrorPanel,
} from '@/features/tierlist/components';
import {
  BROWSE_ENTITY_ID_LIMIT,
  BROWSE_ENTITY_IDS_PER_LIST,
  BROWSE_ENTITY_IDS_PER_TEMPLATE,
  BROWSE_ENTITY_LIST_LIMIT,
  BROWSE_PAGE_SIZE,
  CREATE_CATEGORY_OPTIONS,
  CREATE_SORT_OPTIONS,
  CREATE_STATUS_OPTIONS,
  ENTITY_TYPE_OPTIONS,
  ENTITY_VISIBILITY_CHUNK_SIZE,
  MANAGE_LISTS_PAGE_SIZE,
  TIER_COLORS,
} from '@/features/tierlist/constants';
import {
  addTierRow,
  buildTierListFromTemplate,
  createTemplateFromCatalog,
  createTierListFromTemplate,
  cleanupDuplicateTierLists,
  deleteTierList,
  deleteTierTemplate,
  dedupeTierTemplatesByIdentity,
  findTierList,
  findReusableTierListDraft,
  findTierTemplate,
  filterTierListToCatalog,
  loadTierListDetail,
  loadTierLibrary,
  loadOwnedTierListStats,
  loadOwnedTierListsPage,
  loadTierTemplateDetail,
  loadTierTemplates,
  moveTitle,
  moveTierRow,
  removeTierRow,
  saveTierList,
  saveTierTemplate,
  saveTierListDraftLocal,
  seedPoolFromCatalog,
} from '@/features/tierlist/lib/tierlistStore';
import {
  getCatalogTypeChipLabel,
  getCreateSortLabel,
  getDisplayName,
  getEntityModeSummary,
  getEntityTypeLabel,
  getMediaTypeLabel,
  getMetaLine,
  getOwnerDisplayName,
  getStatusLabel,
  getTemplateExplorerSummary,
  getThemeSongSummary,
  getTierCategoryLabel,
  getTierRowFallbackLabel,
  matchesCharacterName,
  matchesSongQuery,
  matchesStatusFilter,
} from '@/features/tierlist/lib/tierlistLabels';
import {
  buildRemixedTierList,
  formatTierDate,
  getCurrentUsername,
  getTierListPodium,
  hasMeaningfulTierRanking,
  hasTierListStructureChanged,
  hasVisibleTierListTitles,
  isOwnedListByUser,
  isOwnedTemplateByUser,
  paginate,
  sortListsByRecentAndPopularity,
  sortTemplates,
} from '@/features/tierlist/lib/tierlistPageUtils';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import { BRAND_NAME } from '@/shared/config/brand';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CANONICAL_TITLE_PREVIEW_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  buildCharacterEntity,
  buildThemeSongEntity,
  getCatalogEntities,
  getCatalogEntityName,
  isCharacterEntity,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { supabase } from '@/shared/lib/supabase';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import './TierList.css';

function toCustomTierEntity(item, entityType = TITLE_ENTITY_TYPE) {
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

function buildEntityMaps(titles = [], customItems = [], customEntityType = TITLE_ENTITY_TYPE) {
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

function getEntityMap(entityMaps, entityType = TITLE_ENTITY_TYPE) {
  return entityMaps[normalizeCatalogEntityType(entityType)] || entityMaps[TITLE_ENTITY_TYPE] || new Map();
}

function getBestEntityMapForIds(entityMaps, ids = [], preferredType = TITLE_ENTITY_TYPE) {
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

function getBrowseHydrationEntryKey(entry) {
  if (!entry?.id) {
    return '';
  }

  return `${entry?.rows ? 'list' : 'template'}:${entry.id}`;
}

function mergeEntitiesByTypeAndId(current = [], incoming = []) {
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

function mergeBrowseVisibilityState(current = createEmptyBrowseVisibility(), incoming = createEmptyBrowseVisibility()) {
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

async function fetchThemeSongEntitiesByIds(songIds = [], options = {}) {
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

async function fetchCharacterEntitiesByIds(characterIds = [], options = {}) {
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

async function fetchSongsForTitle(title) {
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

function preloadSongsForTitle(title) {
  void fetchSongsForTitle(title).catch(() => { });
}

async function getSongCountMap() {
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

function getTierEntryEntityIds(entry, options = {}) {
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

function createEmptyBrowseVisibility() {
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

// Derive visibility from already-fetched entities (all entity types carry is_adult).
// Avoids a redundant fetchEntityVisibilityByAdultMode DB round trip.
function buildVisibilityFromEntities(titleEntities, songEntities, characterEntities, showAdult) {
  const visibility = createEmptyBrowseVisibility();
  if (typeof showAdult !== 'boolean') {
    return visibility;
  }
  const addTo = (entityType, id, isAdult) => {
    const bucket = Boolean(isAdult) === showAdult ? 'allowedByType' : 'blockedByType';
    visibility[bucket][entityType].add(Number(id));
  };
  (titleEntities || []).forEach((t) => t?.id && addTo(TITLE_ENTITY_TYPE, t.id, t.is_adult));
  (songEntities || []).forEach((s) => s?.id && addTo(THEME_SONG_ENTITY_TYPE, s.id, s.is_adult));
  (characterEntities || []).forEach((c) => c?.id && addTo(CHARACTER_ENTITY_TYPE, c.id, c.is_adult));
  return visibility;
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

async function resolveTierBrowsePreviewEntitiesForIds({ titleIds = [], songIds = [], characterIds = [] }) {
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

async function resolveTierBrowseEntitiesForIds({ titleIds = [], songIds = [], characterIds = [] }, options = {}) {
  // Entity fetches for cover/preview display must NOT be age-gated — templates are already
  // filtered at the metadata level (matchesTemplateMetadataAgeGate).  Applying showAdult here
  // causes covers to disappear when title_ids don't perfectly match the template's adult flag.
  const [titles, characterEntities] = await Promise.all([
    getTitlePreviewByIds(titleIds),
    fetchCharacterEntitiesByIds(characterIds),
  ]);
  const resolvedTitleIdSet = new Set((titles || []).map((entry) => Number(entry.id)));
  const missingTitleIds = titleIds.filter((id) => !resolvedTitleIdSet.has(Number(id)));
  const mergedSongIds = [...new Set([...songIds, ...missingTitleIds])];
  const songEntities = await fetchThemeSongEntitiesByIds(mergedSongIds);

  // Build visibility from the already-fetched entity data (is_adult is present on all entity types).
  // This avoids a redundant fetchEntityVisibilityByAdultMode DB round trip.
  const visibility = buildVisibilityFromEntities(titles, songEntities, characterEntities, options?.showAdult);

  return {
    titles: [...titles, ...characterEntities],
    songEntities,
    visibility,
  };
}

async function resolveTierBrowsePreviewEntitiesForEntries(entries = [], options = {}) {
  const entityIds = collectBrowseEntityIdsFromEntries(entries);
  return resolveTierBrowsePreviewEntitiesForIds(entityIds, options);
}

async function resolveTierBrowseEntitiesForEntries(entries = [], options = {}) {
  const entityIds = collectBrowseEntityIdsFromEntries(entries);
  return resolveTierBrowseEntitiesForIds(entityIds, options);
}

function matchesTierEntryAgeGate(entry, entityMaps, showAdult = false, visibility = null) {
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

function matchesTemplateMetadataAgeGate(template, showAdult = false) {
  if (!template) {
    return false;
  }

  if (typeof template.hasAdultContent !== 'boolean') {
    // unknown metadata: assume safe — passes safe mode, blocked in adult mode
    return !showAdult;
  }

  return template.hasAdultContent === showAdult;
}

function matchesListMetadataAgeGate(list, showAdult = false) {
  if (!list) {
    return false;
  }

  if (typeof list.hasAdultContent !== 'boolean') {
    // unknown metadata: assume safe — passes safe mode, blocked in adult mode
    return !showAdult;
  }

  return list.hasAdultContent === showAdult;
}

function splitByAdultFlag(items = []) {
  return items.reduce((groups, item) => {
    if (item?.is_adult) {
      groups.adult.push(item);
    } else {
      groups.safe.push(item);
    }
    return groups;
  }, { safe: [], adult: [] });
}

function TierTitleCard({
  title,
  fromRowId = '',
  fromIndex = null,
  eager = false,
  isDragging = false,
  onPointerDragStart = null,
  onPreviewSong = null,
}) {
  const isSong = isThemeSongEntity(title);
  const isCharacter = isCharacterEntity(title);
  const canPreviewSong = isSong && title?.video_url && typeof onPreviewSong === 'function';
  const entityChip = isSong ? 'Theme Song' : (isCharacter ? 'Character' : 'Title');

  return (
    <article
      className={`tiermaker-tile${isDragging ? ' is-dragging-origin' : ''}`}
      title={getDisplayName(title)}
      data-tier-tile="true"
      onPointerDown={(event) => {
        if (event.button !== 0 || !onPointerDragStart) {
          return;
        }
        onPointerDragStart(event, {
          titleId: Number(title.id),
          fromRowId,
          fromIndex,
        });
      }}
    >
      <div className={`tierlist-item-thumb${isSong ? ' is-song' : ''}`}>
        <ArtworkImage entity={title} alt="" loading={eager ? 'eager' : 'lazy'} />
        <span className="tiermaker-entity-chip">{entityChip}</span>
        {title?.is_adult ? <span className="tiermaker-age-chip">18+</span> : null}
        {isSong ? (
          <>
            <span className="tier-song-badge">{title.role || title.theme_label}</span>
            {canPreviewSong ? (
              <button
                type="button"
                className="tiermaker-song-play"
                aria-label={`Play ${getDisplayName(title)}`}
                title={`Play ${getDisplayName(title)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPreviewSong(title);
                }}
              >
                <Play size={14} />
              </button>
            ) : null}
            <div className="tiermaker-song-meta">
              <strong>{title.song_title || getDisplayName(title)}</strong>
              <span>{title.artist_name || title.sourceTitleName || 'Theme song'}</span>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

function loadExportImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function TierListEditor({ tierList, setTierList, titleById, query, setQuery, pick, readOnly = false }) {
  const { user } = useAuth();
  const [saveState, setSaveState] = useState('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [highlightPool, setHighlightPool] = useState(false);
  const [isPoolPinned, setIsPoolPinned] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [rowDragState, setRowDragState] = useState(null);
  const [rowDragTarget, setRowDragTarget] = useState(null);
  const [activeSong, setActiveSong] = useState(null);
  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const boardRef = useRef(null);
  const dragStateRef = useRef(null);
  const rowDragStateRef = useRef(null);
  const tierListRef = useRef(tierList);
  const sampleEntity = titleById.values().next().value;
  const isSongTierList = normalizeCatalogEntityType(tierList?.entityType) === THEME_SONG_ENTITY_TYPE || isThemeSongEntity(sampleEntity);
  const normalizedPoolQuery = useMemo(() => String(query || '').trim().toLowerCase(), [query]);

  useEffect(() => {
    tierListRef.current = tierList;
  }, [tierList]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    rowDragStateRef.current = rowDragState;
  }, [rowDragState]);

  useEffect(() => {
    if (!isSongTierList) {
      setActiveSong(null);
      setIsSongModalOpen(false);
      return;
    }

    const activeSongId = Number(activeSong?.id);
    if (activeSongId && titleById.has(activeSongId)) {
      return;
    }

    const firstSongId = [...tierList.rows.flatMap((row) => row.titleIds), ...tierList.poolTitleIds]
      .map(Number)
      .find((id) => titleById.has(id));

    setActiveSong(firstSongId ? titleById.get(firstSongId) : null);
  }, [activeSong?.id, isSongTierList, tierList.poolTitleIds, tierList.rows, titleById]);

  const beginPointerDrag = (event, payload) => {
    if (readOnly) {
      return;
    }
    const tile = event.currentTarget;
    const rect = tile.getBoundingClientRect();

    event.preventDefault();

    setDragState({
      ...payload,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    setDragTarget(null);
    setHighlightPool(false);
  };

  const beginRowPointerDrag = (event, payload) => {
    if (readOnly) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setRowDragState({
      ...payload,
      y: event.clientY,
    });
    setRowDragTarget(payload.index);
  };

  const autoScrollDuringDrag = useEffectEvent((clientY, eventTarget = null) => {
    const viewportEdge = 88;
    const poolRail = eventTarget instanceof HTMLElement ? eventTarget.closest('.tiermaker-pool-rail') : null;

    if (poolRail instanceof HTMLElement) {
      const railRect = poolRail.getBoundingClientRect();
      if (clientY < railRect.top + 56) {
        poolRail.scrollTop -= 18;
      } else if (clientY > railRect.bottom - 56) {
        poolRail.scrollTop += 18;
      }
      return;
    }

    if (clientY < viewportEdge) {
      window.scrollBy({ top: -18, behavior: 'instant' });
    } else if (clientY > window.innerHeight - viewportEdge) {
      window.scrollBy({ top: 18, behavior: 'instant' });
    }
  });

  const resolveInsertIndex = (dropzone, clientX) => {
    const tiles = Array.from(dropzone.querySelectorAll('.tiermaker-tile[data-tier-tile="true"]'));
    for (let index = 0; index < tiles.length; index += 1) {
      const rect = tiles[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
    }
    return tiles.length;
  };

  const resolveDragTarget = useEffectEvent((clientX, clientY) => {
    const hovered = document.elementFromPoint(clientX, clientY);
    if (!(hovered instanceof HTMLElement)) {
      return null;
    }

    const slot = hovered.closest('.tiermaker-insert-slot[data-row-id]');
    if (slot instanceof HTMLElement) {
      return {
        type: 'row',
        rowId: slot.dataset.rowId || '',
        insertIndex: Number(slot.dataset.insertIndex || 0),
      };
    }

    const row = hovered.closest('.tiermaker-row[data-row-id]');
    if (row instanceof HTMLElement) {
      const rowId = row.dataset.rowId || '';
      const dropzone = row.querySelector('.tiermaker-dropzone');
      return {
        type: 'row',
        rowId,
        insertIndex: dropzone instanceof HTMLElement ? resolveInsertIndex(dropzone, clientX) : null,
      };
    }

    const pool = hovered.closest('.tiermaker-pool[data-drop-pool="true"], .tiermaker-pool-rail');
    if (pool instanceof HTMLElement) {
      return { type: 'pool' };
    }

    return null;
  });

  const resolveRowDragTarget = useEffectEvent((clientY) => {
    const rows = Array.from(document.querySelectorAll('.tiermaker-row[data-row-id]'));
    if (rows.length === 0) {
      return null;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!(row instanceof HTMLElement)) {
        continue;
      }
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        return index;
      }
    }

    return rows.length;
  });

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      event.preventDefault();
      autoScrollDuringDrag(event.clientY, event.target);
      setDragState((current) => (
        current
          ? {
            ...current,
            x: event.clientX,
            y: event.clientY,
          }
          : current
      ));
      setDragTarget(resolveDragTarget(event.clientX, event.clientY));
    };

    const finishDrag = (event) => {
      const current = dragStateRef.current;
      const target = resolveDragTarget(event.clientX, event.clientY);

      if (current && !readOnly && target?.type === 'row' && target.rowId) {
        setTierList((existing) => moveTitle(
          existing,
          current.titleId,
          current.fromRowId,
          target.rowId,
          target.insertIndex
        ));
        setSaveState('idle');
        setSaveMessage('');
      } else if (current && !readOnly && target?.type === 'pool') {
        setTierList((existing) => moveTitle(existing, current.titleId, current.fromRowId, ''));
        setSaveState('idle');
        setSaveMessage('');
        setHighlightPool(true);
      }

      setDragState(null);
      setDragTarget(null);
    };

    const cancelDrag = () => {
      setDragState(null);
      setDragTarget(null);
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);
    };
  }, [dragState, readOnly, setTierList]);

  useEffect(() => {
    if (!rowDragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      event.preventDefault();
      autoScrollDuringDrag(event.clientY, event.target);
      setRowDragState((current) => (
        current
          ? {
            ...current,
            y: event.clientY,
          }
          : current
      ));
      setRowDragTarget(resolveRowDragTarget(event.clientY));
    };

    const finishRowDrag = (event) => {
      const current = rowDragStateRef.current;
      const targetIndex = resolveRowDragTarget(event.clientY);

      if (current && !readOnly && targetIndex != null) {
        setTierList((existing) => moveTierRow(existing, current.rowId, targetIndex));
        setSaveState('idle');
        setSaveMessage('');
      }

      setRowDragState(null);
      setRowDragTarget(null);
    };

    const cancelRowDrag = () => {
      setRowDragState(null);
      setRowDragTarget(null);
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishRowDrag);
    window.addEventListener('pointercancel', cancelRowDrag);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishRowDrag);
      window.removeEventListener('pointercancel', cancelRowDrag);
    };
  }, [readOnly, rowDragState, setTierList]);

  const filteredPoolIds = useMemo(() => {
    if (!normalizedPoolQuery) return tierList.poolTitleIds;

    return tierList.poolTitleIds.filter((titleId) => {
      const title = titleById.get(Number(titleId));
      if (!title) return false;
      const haystack = [title.title_th, title.title_en, title.title_native, title.sourceTitleName, title.slug]
        .map((entry) => String(entry || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedPoolQuery);
    });
  }, [normalizedPoolQuery, tierList.poolTitleIds, titleById]);

  const visiblePoolEntities = useMemo(
    () => filteredPoolIds
      .map((id) => titleById.get(Number(id)))
      .filter(Boolean),
    [filteredPoolIds, titleById]
  );

  const persist = async (nextTierList) => {
    setIsSaving(true);
    setSaveState('idle');

    try {
      const savedLibrary = await saveTierList(nextTierList, null, { userId: user?.id || null });
      const savedList = findTierList(nextTierList.id, savedLibrary) || savedLibrary.lists[0] || nextTierList;
      setTierList(savedList);
      setSaveState('success');
      setSaveMessage(pick('บันทึกล่าสุดเรียบร้อยแล้ว', 'Latest changes are saved'));
      toast.success(pick('บันทึกแล้ว', 'Saved'));
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (readOnly || !tierList?.id) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      saveTierListDraftLocal(tierList);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [readOnly, tierList]);

  useEffect(() => {
    if (readOnly) {
      return undefined;
    }

    const handleBeforeUnload = () => {
      if (tierListRef.current?.id) {
        saveTierListDraftLocal(tierListRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [readOnly]);

  useEffect(() => {
    if (saveState !== 'success') {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setSaveState('idle');
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    if (!highlightPool) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setHighlightPool(false);
    }, 550);

    return () => window.clearTimeout(timeout);
  }, [highlightPool]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth > 768) {
        setIsToolbarCollapsed(false);
        setIsToolbarExpanded(true);
        setIsMobileViewport(false);
        return;
      }
      setIsMobileViewport(true);
      const collapsed = window.scrollY > 180;
      setIsToolbarCollapsed(collapsed);
      if (!collapsed) {
        setIsToolbarExpanded(true);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const resetRows = () => {
    if (readOnly) return;
    setTierList((current) => {
      const movedBack = current.rows.flatMap((row) => row.titleIds);
      const poolSet = new Set([...current.poolTitleIds, ...movedBack]);
      return {
        ...current,
        rows: current.rows.map((row) => ({ ...row, titleIds: [] })),
        poolTitleIds: Array.from(poolSet),
      };
    });
    setSaveState('idle');
    setSaveMessage('');
  };

  const resetRow = (rowId) => {
    if (readOnly) return;
    setTierList((current) => {
      const target = current.rows.find((row) => row.id === rowId);
      if (!target || target.titleIds.length === 0) return current;

      const poolSet = new Set([...current.poolTitleIds, ...target.titleIds]);
      return {
        ...current,
        rows: current.rows.map((row) => (row.id === rowId ? { ...row, titleIds: [] } : row)),
        poolTitleIds: Array.from(poolSet),
      };
    });
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const labelWidth = 108;
      const tileSize = 74;
      const rowGap = 4;
      const boardPadding = 18;
      const titleBarHeight = 54;
      const longestRow = Math.max(1, ...tierList.rows.map((row) => row.titleIds.length));
      const canvas = document.createElement('canvas');
      const width = boardPadding * 2 + labelWidth + longestRow * tileSize;
      const height = boardPadding * 2 + titleBarHeight + tierList.rows.length * (tileSize + rowGap) - rowGap;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas unavailable');
      }

      context.fillStyle = '#111111';
      context.fillRect(0, 0, width, height);

      context.fillStyle = '#1b1b1b';
      context.fillRect(boardPadding, boardPadding, width - boardPadding * 2, titleBarHeight);
      context.fillStyle = '#ffffff';
      context.font = '700 22px Arial';
      context.fillText(tierList.title || 'Tier List', boardPadding + 14, boardPadding + 32);
      context.fillStyle = 'rgba(255,255,255,0.72)';
      context.font = '14px Arial';
      context.fillText(pick(`จัดอันดับด้วย ${BRAND_NAME} Tier List`, `Ranked with ${BRAND_NAME} Tier List`), boardPadding + 14, boardPadding + 47);

      const imageEntries = await Promise.all(
        tierList.rows.flatMap((row) => row.titleIds).map(async (titleId) => {
          const title = titleById.get(Number(titleId));
          if (!title) {
            return [titleId, null];
          }
          const image = await loadExportImage(getTitleArtwork(title));
          return [titleId, image];
        })
      );
      const imageByTitleId = new Map(imageEntries);

      tierList.rows.forEach((row, rowIndex) => {
        const top = boardPadding + titleBarHeight + 12 + rowIndex * (tileSize + rowGap);
        const labelColor = row.color || TIER_COLORS[rowIndex % TIER_COLORS.length];

        context.fillStyle = labelColor;
        context.fillRect(boardPadding, top, labelWidth, tileSize);

        context.fillStyle = 'rgba(17,17,17,0.88)';
        context.font = '700 30px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(row.label || getTierRowFallbackLabel(rowIndex, pick), boardPadding + labelWidth / 2, top + tileSize / 2);

        context.fillStyle = '#222222';
        context.fillRect(boardPadding + labelWidth, top, width - boardPadding * 2 - labelWidth, tileSize);

        row.titleIds.forEach((titleId, titleIndex) => {
          const image = imageByTitleId.get(titleId);
          const tileLeft = boardPadding + labelWidth + titleIndex * tileSize;
          context.fillStyle = '#2e2e2e';
          context.fillRect(tileLeft, top, tileSize, tileSize);

          if (image) {
            context.drawImage(image, tileLeft, top, tileSize, tileSize);
          } else {
            context.fillStyle = 'rgba(255,255,255,0.16)';
            context.fillRect(tileLeft + 4, top + 4, tileSize - 8, tileSize - 8);
          }
        });
      });

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        toast.error(pick('ส่งออกไม่สำเร็จ', 'Export failed'));
        return;
      }

      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${(tierList.title || 'tier-list').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(pick('ดาวน์โหลดรูปภาพแล้ว', 'Image downloaded'));
    } catch {
      toast.error(pick('ส่งออกไม่สำเร็จ', 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const cycleRowColor = (rowId, currentColor, fallbackIndex) => {
    if (readOnly) return;
    const baseColor = currentColor || TIER_COLORS[fallbackIndex % TIER_COLORS.length];
    const colorIndex = TIER_COLORS.indexOf(baseColor);
    const nextColor = TIER_COLORS[(colorIndex + 1) % TIER_COLORS.length];

    setTierList((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.id === rowId ? { ...row, color: nextColor } : row
      )),
    }));
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleAddRow = () => {
    if (readOnly) return;
    setTierList((current) => addTierRow(current));
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleSave = () => {
    if (readOnly) return;
    persist(tierList);
  };
  const handleTogglePin = () => setIsPoolPinned((current) => !current);
  const handleTogglePresentation = () => setIsPresentationMode((current) => !current);
  const handlePreviewSong = (song) => {
    setActiveSong(song);

    if (!song?.video_url) {
      toast.error(pick('เพลงนี้ยังไม่มีตัวอย่างให้เปิด', 'This song does not have a playable preview yet'));
      return;
    }

    setIsSongModalOpen(true);
  };

  const toolbarCompact = isMobileViewport && isToolbarCollapsed && !isToolbarExpanded;

  const statusClass = saveState === 'success' ? 'is-success' : saveState === 'error' ? 'is-error' : '';
  const dragOverRowId = dragTarget?.type === 'row' ? dragTarget.rowId : null;
  const isDragOverPool = dragTarget?.type === 'pool';
  const dragPreviewTitle = dragState ? titleById.get(Number(dragState.titleId)) : null;
  const rowDragInsertIndex = rowDragState ? rowDragTarget : null;
  const activeSongSummary = getThemeSongSummary(activeSong);

  return (
    <section className={`container tiermaker-editor ${isPresentationMode ? 'is-presentation' : ''} ${dragState ? 'is-pointer-dragging' : ''} ${readOnly ? 'is-readonly' : ''}`}>

      {/* Sticky toolbar */}
      <section className={[
        'tiermaker-toolbar glass-heavy',
        toolbarCompact ? 'is-collapsed' : '',
        isSaving ? 'is-saving' : '',
        saveState === 'success' ? 'is-saved' : '',
      ].filter(Boolean).join(' ')}>

        {/* Mobile: toggle button */}
        <div className="tiermaker-toolbar-compact-toggle">
          <Button variant="ghost" size="sm" onClick={() => setIsToolbarExpanded((c) => !c)}>
            {toolbarCompact ? pick('แสดงตัวควบคุม', 'Show Controls') : pick('ซ่อนตัวควบคุม', 'Hide Controls')}
          </Button>
        </div>

        {/* Tier list name */}
        <div className="tiermaker-toolbar-title">
          <input
            type="text"
            value={tierList.title}
            placeholder={pick('ชื่อ Tier List', 'Tier list name')}
            readOnly={readOnly}
            onChange={(event) => {
              if (readOnly) return;
              setTierList((current) => ({ ...current, title: event.target.value }));
              setSaveState('idle');
              setSaveMessage('');
            }}
          />
        </div>

        {/* Search pool */}
        <div className="tiermaker-toolbar-search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pick('ค้นหาในพูล...', 'Search pool...')}
            aria-label={pick('ค้นหาในพูล', 'Search pool')}
          />
          {query ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQuery('')}
              aria-label={pick('ล้างการค้นหาในพูล', 'Clear pool search')}
              title={pick('ล้างการค้นหา', 'Clear search')}
            >
              <X size={14} />
            </Button>
          ) : null}
        </div>

        <div className="tiermaker-toolbar-sep" />

        {/* Action buttons */}
        <div className="tiermaker-toolbar-actions" role="group" aria-label={pick('การกระทำของตัวแก้ไข Tier List', 'Tier list editor actions')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={resetRows}
            disabled={isSaving || readOnly}
            title={pick('รีเซ็ตทุกแถว', 'Reset all rows')}
          >
            {pick('รีเซ็ต', 'Reset')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddRow}
            disabled={readOnly}
            title={pick('เพิ่มแถว', 'Add row')}
          >
            {pick('แถว', 'Row')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownload}
            disabled={isExporting}
            title={pick('ดาวน์โหลดรูปภาพ', 'Download image')}
          >
            {isExporting ? '...' : pick('IMG', 'IMG')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Layers size={14} />}
            onClick={handleTogglePin}
            title={isPoolPinned ? pick('เลิกปักหมุดพูล', 'Unpin pool') : pick('ปักหมุดพูล', 'Pin pool')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Monitor size={14} />}
            onClick={handleTogglePresentation}
            title={isPresentationMode ? pick('ออกจากโหมดพรีเซนต์', 'Exit presentation') : pick('โหมดพรีเซนต์', 'Presentation mode')}
          />
        </div>

        {saveState !== 'idle' && (
          <span className={`tiermaker-toolbar-status ${statusClass}`}>
            {saveState === 'success'
              ? saveMessage || pick('บันทึกแล้ว', 'Saved')
              : saveMessage || pick('บันทึกไม่สำเร็จ', 'Save failed')}
          </span>
        )}
      </section>

      {!readOnly ? (
        <section className={`tiermaker-savebar glass-heavy ${isSaving ? 'is-saving' : ''} ${statusClass}`}>
          <div className="tiermaker-savebar-copy">
            <strong>{pick('บันทึกเมื่อจัดเสร็จแล้ว', 'Save when you finish arranging')}</strong>
            <span>
              {saveState === 'success'
                ? saveMessage || pick('บันทึกล่าสุดเรียบร้อยแล้ว', 'Latest changes are saved')
                : saveState === 'error'
                  ? saveMessage || pick('บันทึกไม่สำเร็จ ลองอีกครั้งได้เลย', 'Save failed. Please try again.')
                  : pick('การลากจัดอันดับจะยังไม่ถูกบันทึกจนกว่าจะกดปุ่มนี้', 'Your ranking changes will not be saved until you press this button.')}
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึกการจัดอันดับ', 'Save Ranking')}
          </Button>
        </section>
      ) : null}

      {/* Board */}
      {isSongTierList ? (
        <section className="tiermaker-song-preview glass-heavy" aria-label={pick('ตัวอย่างเพลงที่เลือก', 'Selected song preview')}>
          <div className="tiermaker-song-preview-copy">
            <small className="tierlist-chip">{pick('โหมดจัดอันดับเพลง', 'Song tierlist mode')}</small>
            <strong>{activeSong?.song_title || activeSong?.title_en || pick('เลือกเพลงจากการ์ดด้านล่าง', 'Pick a song tile to preview')}</strong>
            <p>
              {activeSong
                ? activeSongSummary.join(' • ')
                : pick('กดปุ่มเล่นบนการ์ดเพลงเพื่อฟังระหว่างจัด tier ได้ทันที', 'Use the play button on any song card to listen while ranking.')}
            </p>
          </div>
          <div className="tiermaker-song-preview-actions">
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={14} />}
              onClick={() => {
                if (!activeSong?.video_url) {
                  toast.error(pick('เพลงนี้ยังไม่มีตัวอย่างให้เปิด', 'This song does not have a playable preview yet'));
                  return;
                }
                setIsSongModalOpen(true);
              }}
              disabled={!activeSong?.video_url}
            >
              {pick('เปิดเพลง', 'Play song')}
            </Button>
            <span className="tiermaker-song-preview-hint">
              {pick('เพิ่ม tier ได้จากปุ่มด้านบน แล้วลากเพลงลงแต่ละช่องได้เลย', 'Create tiers from the toolbar, then drag songs into each slot.')}
            </span>
          </div>
        </section>
      ) : null}
      <div className="tiermaker-export-board">
        <div className="tiermaker-export-head">
          <strong>{tierList.title}</strong>
          <span>{pick(`จัดอันดับด้วย ${BRAND_NAME} Tier List`, `Ranked with ${BRAND_NAME} Tier List`)}</span>
        </div>
        <div className="tiermaker-board" ref={boardRef}>
          {tierList.rows.map((row, index) => (
            <article
              key={row.id}
              data-row-id={row.id}
              className={[
                'tiermaker-row',
                row.titleIds.length === 0 ? 'is-empty' : 'has-items',
                dragOverRowId === row.id ? 'is-drag-over' : '',
                rowDragState?.rowId === row.id ? 'is-row-dragging' : '',
                rowDragInsertIndex === index ? 'is-row-insert-before' : '',
                rowDragInsertIndex === index + 1 ? 'is-row-insert-after' : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Colored label */}
              <div
                className="tiermaker-label"
                style={{ background: row.color || TIER_COLORS[index % TIER_COLORS.length] }}
              >
                {!readOnly ? (
                  <button
                    type="button"
                    className="tiermaker-row-handle"
                    onPointerDown={(event) => beginRowPointerDrag(event, { rowId: row.id, index })}
                    aria-label={pick('ลากเพื่อจัดลำดับแถว Tier', 'Drag to reorder tier row')}
                    title={pick('ลากเพื่อจัดลำดับแถว Tier', 'Drag to reorder tier row')}
                  >
                    <GripVertical size={14} />
                  </button>
                ) : null}
                <input
                  type="text"
                  aria-label={pick('ป้ายชื่อ Tier', 'Tier label')}
                  value={row.label}
                  readOnly={readOnly}
                  onChange={(event) => {
                    if (readOnly) return;
                    const nextLabel = event.target.value;
                    setTierList((current) => ({
                      ...current,
                      rows: current.rows.map((entry) => (
                        entry.id === row.id ? { ...entry, label: nextLabel } : entry
                      )),
                    }));
                    setSaveState('idle');
                    setSaveMessage('');
                  }}
                />
              </div>
              {/* Actions revealed on row hover; floats outside the label */}
              <div className="tiermaker-label-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Palette size={12} />}
                  onClick={() => cycleRowColor(row.id, row.color, index)}
                  disabled={readOnly}
                  title={pick('เปลี่ยนสี', 'Change color')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={12} />}
                  onClick={() => resetRow(row.id)}
                  disabled={readOnly || row.titleIds.length === 0}
                  title={pick('ล้างแถว', 'Clear row')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => {
                    if (readOnly) return;
                    setTierList((current) => removeTierRow(current, row.id));
                    setSaveState('idle');
                    setSaveMessage('');
                  }}
                  disabled={readOnly || tierList.rows.length <= 1}
                  title={pick('ลบแถว', 'Remove row')}
                />
              </div>

              {/* Drop zone */}
              <div className={`tiermaker-dropzone ${row.titleIds.length === 0 ? 'is-empty' : ''}`}>
                {row.titleIds.length === 0
                  ? <span className="tierlist-empty-row">{pick('วางตรงนี้', 'Drop here')}</span>
                  : row.titleIds
                    .map((id) => titleById.get(Number(id)))
                    .filter(Boolean)
                    .flatMap((title, titleIndex, arr) => {
                      const nodes = [
                        <button
                          key={`slot-${row.id}-${title.id}-${titleIndex}`}
                          className={`tiermaker-insert-slot${dragTarget?.type === 'row' && dragTarget.rowId === row.id && dragTarget.insertIndex === titleIndex ? ' is-active' : ''}`}
                          type="button"
                          data-row-id={row.id}
                          data-insert-index={titleIndex}
                          aria-label={pick('แทรกตรงนี้', 'Insert here')}
                        />,
                        <TierTitleCard
                          key={title.id}
                          title={title}
                          fromRowId={row.id}
                          fromIndex={titleIndex}
                          isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === row.id && dragState?.fromIndex === titleIndex}
                          onPointerDragStart={readOnly ? null : beginPointerDrag}
                          onPreviewSong={isSongTierList ? handlePreviewSong : null}
                        />,
                      ];
                      if (titleIndex === arr.length - 1) {
                        nodes.push(
                          <button
                            key={`slot-end-${row.id}`}
                            className={`tiermaker-insert-slot${dragTarget?.type === 'row' && dragTarget.rowId === row.id && dragTarget.insertIndex === arr.length ? ' is-active' : ''}`}
                            type="button"
                            data-row-id={row.id}
                            data-insert-index={arr.length}
                            aria-label={pick('แทรกท้ายแถว', 'Insert at end')}
                          />
                        );
                      }
                      return nodes;
                    })}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Image pool */}
      <aside
        data-drop-pool="true"
        className={[
          'tiermaker-pool glass-heavy',
          isPoolPinned ? 'is-pinned' : '',
          highlightPool ? 'is-highlighted' : '',
          isDragOverPool ? 'is-drag-over' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="tiermaker-pool-head">
          <h2><Layers size={13} /> {isSongTierList ? pick('คลังเพลง', 'Song Pool') : pick('คลังรูป', 'Image Pool')}</h2>
          <span>{visiblePoolEntities.length}</span>
        </div>
        <div className="tiermaker-pool-rail">
          {filteredPoolIds.length === 0 ? (
            <p className="tierlist-pool-state">
              {normalizedPoolQuery
                ? (isSongTierList ? pick('ไม่พบเพลงที่ตรงกับคำค้น', 'No songs match this search') : pick('ไม่พบรูปที่ตรงกับคำค้น', 'No images match this search'))
                : (isSongTierList ? pick('จัดอันดับเพลงทั้งหมดแล้ว', 'All songs ranked!') : pick('จัดอันดับรูปทั้งหมดแล้ว', 'All images ranked!'))}
            </p>
          ) : visiblePoolEntities.length === 0 ? (
            <p className="tierlist-pool-state">
              {isSongTierList
                ? pick('ยังโหลดข้อมูลเพลงไม่ครบ ลองรีเฟรชอีกครั้ง', 'Song data is not ready yet. Try refreshing.')
                : pick('ยังโหลดข้อมูลรูปไม่ครบ ลองรีเฟรชอีกครั้ง', 'Image data is not ready yet. Try refreshing.')}
            </p>
          ) : (
            visiblePoolEntities.map((title, index) => (
              <TierTitleCard
                key={title.id}
                title={title}
                fromIndex={index}
                eager
                isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === '' && dragState?.fromIndex === index}
                onPointerDragStart={readOnly ? null : beginPointerDrag}
                onPreviewSong={isSongTierList ? handlePreviewSong : null}
              />
            ))
          )}
        </div>
      </aside>

      {dragState && dragPreviewTitle && (
        <div
          className="tiermaker-drag-preview"
          aria-hidden="true"
          style={{
            width: `${dragState.width}px`,
            height: `${dragState.height}px`,
            transform: `translate(${dragState.x - dragState.offsetX}px, ${dragState.y - dragState.offsetY}px) rotate(-2deg)`,
          }}
        >
          <div className="tierlist-item-thumb">
            <ArtworkImage entity={dragPreviewTitle} alt="" />
          </div>
        </div>
      )}
      {isSongTierList && isSongModalOpen && activeSong ? (
        <ThemeSongModal
          song={activeSong}
          onClose={() => setIsSongModalOpen(false)}
        />
      ) : null}
    </section>
  );
}

export function TierListBrowsePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const browseHydrationEpochRef = useRef(0);
  const hydratedBrowseEntryKeysRef = useRef(new Set());
  const pendingBrowseEntryKeysRef = useRef(new Set());
  const failedBrowseEntryKeysRef = useRef(new Set());
  const hydrationRetryAttemptsRef = useRef(0);
  const isBrowseMountedRef = useRef(true);
  const [titles, setTitles] = useState([]);
  const [songEntities, setSongEntities] = useState([]);
  const [query, setQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [page, setPage] = useState(1);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isCatalogHydrating, setIsCatalogHydrating] = useState(true);
  const [hydrationRetryKey, setHydrationRetryKey] = useState(0);
  const [browseVisibility, setBrowseVisibility] = useState(() => createEmptyBrowseVisibility());
  const [loadError, setLoadError] = useState('');

  useEffect(() => () => {
    isBrowseMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      browseHydrationEpochRef.current += 1;
      hydratedBrowseEntryKeysRef.current = new Set();
      pendingBrowseEntryKeysRef.current = new Set();
      failedBrowseEntryKeysRef.current = new Set();
      hydrationRetryAttemptsRef.current = 0;
      setIsLoading(true);
      setIsCatalogHydrating(true);
      setLoadError('');
      setTitles([]);
      setSongEntities([]);
      setBrowseVisibility(createEmptyBrowseVisibility());
      // Step 1: load library fast (no full catalog needed) and show content immediately
      const fastTemplatesPromise = loadTierTemplates([], {
        userId: user?.id || null,
        includeOwned: false,
        showAdult,
      });
      const libraryPromise = loadTierLibrary([], {
        userId: user?.id || null,
        includeOwned: false,
        fetchTemplates: false,
        publicListLimit: BROWSE_ENTITY_LIST_LIMIT,
        showAdult,
      });
      const fastTemplates = await fastTemplatesPromise;
      if (cancelled) return;
      setLibrary((current) => ({ ...current, templates: fastTemplates }));
      setIsLoading(false);

      const nextLibrary = await libraryPromise;
      if (cancelled) return;
      setLibrary((current) => ({
        ...nextLibrary,
        templates: current.templates,
      }));
      setIsCatalogHydrating(false);
    }
    load().catch((error) => {
      if (!cancelled) {
        setLoadError(error?.message || pick('โหลดหน้า Tier List ไม่สำเร็จ', 'Failed to load tier lists'));
        setIsLoading(false);
        setIsCatalogHydrating(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult, user?.id, isAuthLoading]);

  const publicTemplates = useMemo(
    () => dedupeTierTemplatesByIdentity(library.templates.filter((template) => (
      template.isPublic &&
      matchesTemplateMetadataAgeGate(template, showAdult)
    ))),
    [library.templates, showAdult]
  );
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return publicTemplates.filter((template) => {
      if (entityTypeFilter !== 'all' && normalizeCatalogEntityType(template.entityType) !== entityTypeFilter) return false;
      if (category !== 'all' && template.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = `${template.title} ${template.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, entityTypeFilter, publicTemplates, query]);

  const pagedTemplates = useMemo(() => {
    const sorted = sortTemplates(filteredTemplates, sortBy);
    return paginate(sorted, page, BROWSE_PAGE_SIZE);
  }, [filteredTemplates, page, sortBy]);

  const trendingTemplates = useMemo(
    () => sortTemplates(publicTemplates, 'popular').slice(0, 6),
    [publicTemplates]
  );
  const communityPreviewCandidates = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        matchesListMetadataAgeGate(list, showAdult)
      ))
    ).slice(0, 8),
    [library.lists, showAdult]
  );
  const previewHydrationEntries = useMemo(() => {
    const seen = new Set();
    return [
      ...pagedTemplates.items,
      ...trendingTemplates,
      ...communityPreviewCandidates,
    ].filter((entry) => {
      const key = `${entry?.rows ? 'list' : 'template'}:${entry?.id || ''}`;
      if (!entry?.id || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [communityPreviewCandidates, pagedTemplates.items, trendingTemplates]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    async function hydrateBrowseEntities() {
      if (previewHydrationEntries.length === 0 && pendingBrowseEntryKeysRef.current.size === 0) {
        setIsCatalogHydrating(false);
        return;
      }

      const epoch = browseHydrationEpochRef.current;
      const entriesToHydrate = previewHydrationEntries.filter((entry) => {
        const key = getBrowseHydrationEntryKey(entry);
        return key
          && !hydratedBrowseEntryKeysRef.current.has(key)
          && !pendingBrowseEntryKeysRef.current.has(key)
          && !failedBrowseEntryKeysRef.current.has(key);
      });

      if (entriesToHydrate.length === 0) {
        if (pendingBrowseEntryKeysRef.current.size === 0) {
          setIsCatalogHydrating(false);
        }
        return;
      }

      const pendingKeys = entriesToHydrate
        .map((entry) => getBrowseHydrationEntryKey(entry))
        .filter(Boolean);

      pendingKeys.forEach((key) => pendingBrowseEntryKeysRef.current.add(key));
      setIsCatalogHydrating(true);

      let willRetry = false;
      try {
        const nonCharacterTemplateEntries = entriesToHydrate.filter((entry) => (
          !entry?.rows && normalizeCatalogEntityType(entry?.entityType) !== CHARACTER_ENTITY_TYPE
        ));
        const characterTemplateEntries = entriesToHydrate.filter((entry) => (
          !entry?.rows && normalizeCatalogEntityType(entry?.entityType) === CHARACTER_ENTITY_TYPE
        ));
        const communityListEntries = entriesToHydrate.filter((entry) => Boolean(entry?.rows));
        const batches = [
          { entries: nonCharacterTemplateEntries, resolver: resolveTierBrowsePreviewEntitiesForEntries, includeVisibility: false },
          { entries: characterTemplateEntries, resolver: resolveTierBrowsePreviewEntitiesForEntries, includeVisibility: false },
          { entries: communityListEntries, resolver: resolveTierBrowseEntitiesForEntries, includeVisibility: true },
        ];

        for (const batch of batches) {
          if (batch.entries.length === 0) {
            continue;
          }

          const batchKeys = batch.entries
            .map((entry) => getBrowseHydrationEntryKey(entry))
            .filter(Boolean);

          const result = await batch.resolver(batch.entries, { showAdult });
          if (!isBrowseMountedRef.current || browseHydrationEpochRef.current !== epoch) {
            return;
          }

          batchKeys.forEach((key) => {
            hydratedBrowseEntryKeysRef.current.add(key);
            pendingBrowseEntryKeysRef.current.delete(key);
          });

          setTitles((current) => mergeEntitiesByTypeAndId(current, result.titles));
          setSongEntities((current) => mergeEntitiesByTypeAndId(current, result.songEntities));

          if (batch.includeVisibility) {
            setBrowseVisibility((current) => mergeBrowseVisibilityState(current, result.visibility));
          }
        }
      } catch (error) {
        if (!isBrowseMountedRef.current || browseHydrationEpochRef.current !== epoch) {
          return;
        }
        console.warn('Failed to hydrate tierlist browse previews:', error?.message || error);
        const MAX_HYDRATION_RETRIES = 2;
        if (pendingBrowseEntryKeysRef.current.size > 0 && hydrationRetryAttemptsRef.current < MAX_HYDRATION_RETRIES) {
          hydrationRetryAttemptsRef.current += 1;
          willRetry = true;
          setHydrationRetryKey((n) => n + 1);
          return;
        }
        // Max retries reached — mark keys as permanently failed so we stop trying
        [...pendingBrowseEntryKeysRef.current].forEach((key) => {
          failedBrowseEntryKeysRef.current.add(key);
          pendingBrowseEntryKeysRef.current.delete(key);
        });
      } finally {
        if (!willRetry) {
          if (isBrowseMountedRef.current && browseHydrationEpochRef.current === epoch && pendingBrowseEntryKeysRef.current.size === 0) {
            setIsCatalogHydrating(false);
          }
        }
      }
    }

    hydrateBrowseEntities();
  }, [isLoading, previewHydrationEntries, showAdult, hydrationRetryKey]);

  const browseCustomItems = useMemo(
    () => [
      ...communityPreviewCandidates.flatMap((list) => list?.customItems || []),
      ...library.templates.flatMap((template) => template?.customItems || []),
    ],
    [communityPreviewCandidates, library.templates]
  );
  const entityMaps = useMemo(
    () => buildEntityMaps([...titles, ...songEntities], browseCustomItems),
    [browseCustomItems, songEntities, titles]
  );
  const publicLists = useMemo(
    () => {
      if (isCatalogHydrating) {
        return [];
      }

      return communityPreviewCandidates.filter((list) => (
        matchesTierEntryAgeGate(list, entityMaps, showAdult, browseVisibility)
      ));
    },
    [browseVisibility, communityPreviewCandidates, entityMaps, isCatalogHydrating, showAdult]
  );
  const recentCommunityLists = useMemo(
    () => sortListsByRecentAndPopularity(publicLists).slice(0, 8),
    [publicLists]
  );

  const handlePlayTemplate = async (template) => {
    try {
      const currentLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        includeOwned: true,
        showAdult,
      });
      const cleanupResult = await cleanupDuplicateTierLists(currentLibrary, {
        userId: user?.id || null,
      });
      const workingLibrary = cleanupResult.library;
      const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
      const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, workingLibrary, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
      const normalizedSavedTemplate = normalizeCatalogEntityType(savedTemplate?.entityType) === THEME_SONG_ENTITY_TYPE
        ? { ...savedTemplate, entityType: THEME_SONG_ENTITY_TYPE }
        : savedTemplate;
      const list = buildTierListFromTemplate(normalizedSavedTemplate);
      const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
      const ownerUsername = getCurrentUsername(user);
      const reusableDraft = findReusableTierListDraft({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, {
        userId: user?.id || null,
      });
      if (reusableDraft) {
        setLibrary(libraryAfterTemplate);
        navigate(`/tierlist/play/${reusableDraft.id}`);
        return;
      }
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      setLibrary(libraryAfterList);
      const savedList = findTierList(seeded.id, libraryAfterList) || libraryAfterList.lists[0];
      navigate(`/tierlist/play/${savedList.id}`);
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemixList = async (list) => {
    try {
      const saved = await saveTierList(buildRemixedTierList(list, user), library, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  const categoryOptions = ['all', ...new Set(
    publicTemplates
      .filter((template) => entityTypeFilter === 'all' || normalizeCatalogEntityType(template.entityType) === entityTypeFilter)
      .map((template) => template.category)
      .filter(Boolean)
  )];
  const hasActiveFilters = entityTypeFilter !== 'all' || category !== 'all' || query.trim().length > 0 || sortBy !== 'popular';

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับหน้าแรก', 'Back home')}
            backTo="/"
          />
        </section>
      </div>
    );
  }

  const tabItems = [
    { value: 'all', label: pick('ทั้งหมด', 'All'), icon: <Layers size={14} /> },
    ...ENTITY_TYPE_OPTIONS.map((option) => ({ value: option.value, label: getEntityTypeLabel(option.value, pick), icon: null })),
    ...categoryOptions
      .filter((cat) => cat !== 'all')
      .map((cat) => ({ value: `cat:${cat}`, label: getTierCategoryLabel(cat, pick), icon: null })),
  ];

  return (
    <div className="tierlist-page">
      <div className="container tierlist-browse-title-row">
        <div className="tierlist-browse-title-row-left">
          <h1>{pick('ศูนย์รวม Tier List', 'Tier List Explorer')}</h1>
        </div>
        <div className="tierlist-browse-title-row-actions">
          {user?.id ? (
            <Link className="tierlist-browse-manage-btn" to="/tierlist/me">
              <Monitor size={14} /> {pick('จัดการของฉัน', 'Manage Mine')}
            </Link>
          ) : null}
          <Link className="tierlist-browse-create-btn" to="/tierlist/create">
            <Plus size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}
          </Link>
        </div>
      </div>

      <nav className="container tierlist-browse-tabs">
        {tabItems.map((tab) => {
          const isEntityTab = tab.value === 'all' || ENTITY_TYPE_OPTIONS.some((o) => o.value === tab.value);
          const isCatTab = tab.value.startsWith('cat:');
          const isActive = isEntityTab
            ? (entityTypeFilter === tab.value && category === 'all')
            : (isCatTab && category === tab.value.replace('cat:', ''));

          return (
            <button
              key={tab.value}
              type="button"
              className={`tierlist-browse-tab${isActive ? ' is-active' : ''}`}
              onClick={() => {
                if (isEntityTab) {
                  setEntityTypeFilter(tab.value);
                  setCategory('all');
                } else if (isCatTab) {
                  setCategory(tab.value.replace('cat:', ''));
                }
                setPage(1);
              }}
            >
              {tab.icon}{tab.label}
            </button>
          );
        })}
      </nav>

      <div className="container tierlist-browse-layout">
        <div className="tierlist-browse-main">
          <div className="tierlist-browse-search-bar" role="group" aria-label={pick('ควบคุมการค้นหาเทมเพลต', 'Template search controls')}>
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder={pick('ค้นหา tier lists...', 'Search tier lists...')}
              aria-label={pick('ค้นหาเทมเพลต', 'Search templates')}
            />
            <button type="button" className="tierlist-browse-search-icon" aria-hidden="true">
              <Search size={16} />
            </button>
          </div>

          <div className="tierlist-browse-sort-row">
            {!isLoading && (
              <span className="tierlist-browse-result-count">{filteredTemplates.length} {pick('เทมเพลต', 'templates')}</span>
            )}
            <SortSelect
              value={sortBy}
              onChange={(value) => { setSortBy(value); setPage(1); }}
              label={pick('เรียงลำดับ', 'Sort')}
              className="tierlist-browse-sorter"
            >
              <option value="popular">{pick('ยอดนิยม', 'Popular')}</option>
              <option value="newest">{pick('ใหม่ล่าสุด', 'Newest')}</option>
              <option value="alphabet">{pick('ก-ฮ', 'A-Z')}</option>
            </SortSelect>
          </div>

          <section className="tierlist-browse-content">
            {isLoading ? (
              <TierListEmptyPanel
                icon={<Loader2 size={28} className="animate-spin" />}
                title={pick('กำลังโหลดเทมเพลต', 'Loading templates')}
                message={pick('กำลังเตรียมเทมเพลตและอันดับล่าสุดจากชุมชน', 'Fetching templates and recent community rankings.')}
              />
            ) : pagedTemplates.items.length === 0 ? (
              <TierListEmptyPanel
                icon={<Compass size={28} />}
                title={pick('ยังไม่พบเทมเพลตที่ตรง', 'No matching templates')}
                message={
                  hasActiveFilters
                    ? pick('ลองล้างคำค้นหา เปลี่ยนหมวดหมู่ หรือสลับการเรียงลำดับ', 'Try clearing your search, switching categories, or changing the sort order.')
                    : pick('ยังไม่มีเทมเพลตสาธารณะในตอนนี้', 'There are no public templates yet.')
                }
                action={hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEntityTypeFilter('all');
                      setCategory('all');
                      setQuery('');
                      setSortBy('popular');
                      setPage(1);
                    }}
                  >
                    {pick('ล้างตัวกรอง', 'Clear filters')}
                  </Button>
                ) : null}
              />
            ) : (
              <div className="tierlist-browse-grid">
                {pagedTemplates.items.map((template, index) => {
                  const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
                  const cover = template.titleIds
                    .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
                    .map((id) => entityById.get(Number(id)))
                    .filter(Boolean);
                  const coverEntity = cover[0] || (template.previewArtworkUrl ? { cover: template.previewArtworkUrl } : null);
                  const explorerSummary = getTemplateExplorerSummary(template, pick);

                  return (
                    <article key={template.id} className="tierlist-explorer-card">
                      <div className="tierlist-explorer-card-cover">
                        {coverEntity
                          ? (
                            <ArtworkImage
                              entity={coverEntity}
                              alt={template.title}
                              loading={index < 3 ? 'eager' : 'lazy'}
                              fetchPriority={index < 3 ? 'high' : 'auto'}
                            />
                          )
                          : isCatalogHydrating
                            ? <div className="tierlist-explorer-card-cover-loading" />
                            : <div className="tierlist-explorer-card-cover-empty" />}
                        <span className="tierlist-explorer-card-count">
                          {template.titleIds.length} {pick('เรื่อง', 'titles')}
                        </span>
                      </div>
                      <div className="tierlist-explorer-card-body">
                        <div className="tierlist-explorer-card-meta">
                          <span className="tierlist-explorer-card-tag">{explorerSummary.categoryLabel}</span>
                          <span className="tierlist-explorer-card-stat">{explorerSummary.statLine}</span>
                        </div>
                        <h3>{template.title}</h3>
                        <p className="tierlist-explorer-card-description">{explorerSummary.playsLabel}</p>
                        <div className="tierlist-explorer-card-actions">
                          <Button size="sm" variant="primary" className="tierlist-explorer-btn-rank" onClick={() => handlePlayTemplate(template)}>
                            {pick('จัดอันดับ', 'Rank')}
                          </Button>
                          <Link className="tierlist-explorer-btn-view" to={`/tierlist/template/${template.id}`}>
                            {pick('ดู', 'View')}
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {pagedTemplates.totalPages > 1 && (
              <div className="tierlist-pagination">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ChevronLeft size={14} />}
                  disabled={pagedTemplates.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {pick('ก่อนหน้า', 'Previous')}
                </Button>
                <span>{pagedTemplates.page} / {pagedTemplates.totalPages}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight={<ChevronRight size={14} />}
                  disabled={pagedTemplates.page >= pagedTemplates.totalPages}
                  onClick={() => setPage((current) => Math.min(pagedTemplates.totalPages, current + 1))}
                >
                  {pick('ถัดไป', 'Next')}
                </Button>
              </div>
            )}
          </section>

          <section className="tierlist-browse-songs-section">
            <Link className="tierlist-songs-banner glass-heavy" to="/tierlist/songs">
              <div className="tierlist-songs-banner-icon"><Music size={28} /></div>
              <div className="tierlist-songs-banner-copy">
                <h2>{pick('จัดอันดับเพลงเปิด-ปิด', 'Rank Opening & Ending Songs')}</h2>
                <p>{pick('เลือกเรื่องที่มีข้อมูลเพลง แล้วจัดอันดับ OP/ED ในแบบของคุณเอง', 'Pick a title with song data and build your own OP/ED tier list.')}</p>
              </div>
              <span className="btn btn-primary btn-sm">
                {pick('ดูลิสต์จัดอันดับเพลง', 'Explore Song Tier Lists')} <ArrowRight size={13} />
              </span>
            </Link>
          </section>

          {recentCommunityLists.length > 0 && (
            <section className="tierlist-browse-community-section">
              <div className="tierlist-section-head">
                <h2>{pick('อันดับชุมชนล่าสุด', 'Fresh Community Rankings')}</h2>
              </div>
              <div className="tierlist-browse-grid">
                {recentCommunityLists.map((list) => (
                  <TierListCommunityCard
                    key={list.id}
                    list={list}
                    titleById={getEntityMap(entityMaps, list.entityType)}
                    pick={pick}
                    primaryLabel={pick('เปิดอันดับ', 'Open ranking')}
                    primaryTo={`/tierlist/play/${list.id}`}
                    secondaryLabel={pick('รีมิกซ์', 'Remix')}
                    onSecondaryClick={() => handleRemixList(list)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="tierlist-browse-sidebar">
          <div className="tierlist-browse-sidebar-card">
            <h3>{pick('เทมเพลตยอดนิยม', 'Trending Templates')}</h3>
            <ul className="tierlist-trending-list">
              {trendingTemplates.map((template, index) => {
                const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
                const coverEntity = template.titleIds
                  .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
                  .map((id) => entityById.get(Number(id)))
                  .filter(Boolean)[0] || (template.previewArtworkUrl ? { cover: template.previewArtworkUrl } : null);

                return (
                  <li key={template.id}>
                    <Link className="tierlist-trending-item" to={`/tierlist/template/${template.id}`}>
                      <span className="tierlist-trending-rank">{index + 1}.</span>
                      {coverEntity ? (
                        <ArtworkImage className="tierlist-trending-thumb" entity={coverEntity} alt="" loading="lazy" />
                      ) : (
                        <span className="tierlist-trending-thumb tierlist-trending-thumb-empty" />
                      )}
                      <span className="tierlist-trending-name">{template.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function TierListTemplatePage() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [songEntities, setSongEntities] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [template, setTemplate] = useState(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      setIsTemplateLoading(true);
      setIsPreviewLoading(true);
      setLoadError('');

      const loadedDetail = await loadTierTemplateDetail(templateId, {
        userId: user?.id || null,
        showAdult,
      });
      if (cancelled) return;
      setLibrary(loadedDetail.library);

      const found = loadedDetail.template;
      if (!found) {
        setIsTemplateLoading(false);
        setIsPreviewLoading(false);
        setLoadError(pick('ไม่พบเทมเพลต', 'Template not found'));
        return;
      }

      let resolvedTemplate = found;
      let resolvedTemplateEntityType = normalizeCatalogEntityType(found.entityType);

      setTemplate(resolvedTemplate);
      setIsTemplateLoading(false);

      const communityListIds = loadedDetail.library.lists
        .filter((l) => String(l.templateId) === String(templateId))
        .flatMap((l) => [
          ...(l.rows || []).flatMap((r) => r.titleIds || []),
          ...(l.poolTitleIds || []),
        ]);
      const previewIds = [...new Set([...resolvedTemplate.titleIds, ...communityListIds].map(Number).filter(Boolean))];

      // Preview pages only need the referenced entities, not the whole catalog.
      const isCharacterType = resolvedTemplateEntityType === CHARACTER_ENTITY_TYPE;
      const isSongType = resolvedTemplateEntityType === THEME_SONG_ENTITY_TYPE;
      let fetchedTitles;
      if (isCharacterType) {
        fetchedTitles = await fetchCharacterEntitiesByIds(previewIds);
        if (cancelled) return;
        setSongEntities([]);
      } else if (isSongType) {
        fetchedTitles = [];
        const fetchedSongs = await fetchThemeSongEntitiesByIds(previewIds);
        if (cancelled) return;
        setSongEntities(fetchedSongs);
      } else {
        fetchedTitles = await getTitlesByIds(previewIds);
        if (cancelled) return;
        setSongEntities([]);
      }
      if (cancelled) return;
      setTitles(fetchedTitles);
      setIsPreviewLoading(false);
    }

    load().catch((error) => {
      if (cancelled) return;
      setIsTemplateLoading(false);
      setIsPreviewLoading(false);
      setLoadError(error?.message || pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load template'));
    });

    return () => { cancelled = true; };
  }, [pick, templateId, showAdult, user?.id, isAuthLoading]);

  const entityMaps = useMemo(
    () => buildEntityMaps([...titles, ...songEntities], template?.customItems || [], template?.entityType),
    [songEntities, template?.customItems, template?.entityType, titles]
  );
  const titleById = useMemo(
    () => getBestEntityMapForIds(entityMaps, template?.titleIds || [], template?.entityType),
    [entityMaps, template?.entityType, template?.titleIds]
  );

  const relatedPublicLists = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        String(list.templateId || '') === String(templateId) &&
        hasVisibleTierListTitles(list, titleById)
      ))
    ),
    [library.lists, templateId, titleById]
  );

  const handlePlay = async () => {
    try {
      const cleanupResult = await cleanupDuplicateTierLists(library, {
        userId: user?.id || null,
      });
      const workingLibrary = cleanupResult.library;
      const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
      const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, workingLibrary, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
      setLibrary(libraryAfterTemplate);
      setTemplate(savedTemplate);
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
      const ownerUsername = getCurrentUsername(user);
      const reusableDraft = findReusableTierListDraft({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, {
        userId: user?.id || null,
      });
      if (reusableDraft) {
        navigate(`/tierlist/play/${reusableDraft.id}`);
        return;
      }
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, null, { userId: user?.id || null });
      const savedList = findTierList(seeded.id, libraryAfterList) || libraryAfterList.lists[0];
      navigate(`/tierlist/play/${savedList.id}`);
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemix = async (list) => {
    try {
      const saved = await saveTierList(buildRemixedTierList(list, user), null, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  if (isTemplateLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดเทมเพลต', 'Loading template')}
            message={pick('กำลังดึงรายละเอียดและรายการเรื่องตัวอย่าง', 'Fetching template details and preview titles.')}
          />
        </section>
      </div>
    );
  }

  if (!template || loadError) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError || pick('ไม่พบเทมเพลต', 'Template not found')}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  const previewTitles = template.titleIds
    .slice(0, 16)
    .map((id) => titleById.get(Number(id)))
    .filter(Boolean);
  const heroCover = previewTitles[0] || (template.previewArtworkUrl ? { cover: template.previewArtworkUrl } : null);
  const previewPodium = previewTitles.slice(0, 3);

  return (
    <div className="tierlist-page">
      <section className="container tierlist-hero tierlist-create-hero tierlist-create-rail">
        <div className="tierlist-create-hero">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('รายละเอียดเทมเพลต', 'Template Detail')}</span>
          <h1>{template.title}</h1>
          <p>{template.description || pick('ยังไม่มีคำอธิบาย', 'No description yet.')}</p>
          <div className="tierlist-hero-actions">
            <Link className="btn btn-ghost" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
            <Button variant="primary" iconRight={<ArrowRight size={14} />} onClick={handlePlay}>
              {pick('เล่นเทมเพลตนี้', 'Play This Template')}
            </Button>
          </div>
        </div>
        <div className="tierlist-hero-panel glass-heavy">
          {heroCover ? (
            <div className="tierlist-hero-cover">
              <ArtworkImage entity={heroCover} alt={template.title} loading="lazy" />
            </div>
          ) : null}
          <div className="tierlist-stat"><strong>{template.titleIds.length}</strong><span>{pick('เรื่อง', 'Titles')}</span></div>
          <div className="tierlist-stat"><strong>{template.plays || 0}</strong><span>{pick('ครั้งที่เล่น', 'Plays')}</span></div>
          <div className="tierlist-stat"><strong>{relatedPublicLists.length}</strong><span>{pick('รีมิกซ์สาธารณะ', 'Public remixes')}</span></div>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('ตัวอย่างเรื่อง', 'Preview Titles')}</h2>
        </div>
        {previewPodium.length > 0 ? (
          <div className="tierlist-podium-grid tierlist-preview-podium">
            {previewPodium.map((entry, index) => (
              <article
                key={`preview-podium-${entry.id}`}
                className={`tierlist-podium-card${index === 0 ? ' tierlist-podium-card-winner' : ''} glass-heavy`}
              >
                <div className="tierlist-podium-cover">
                  <ArtworkImage entity={entry} alt={getDisplayName(entry)} loading="lazy" />
                </div>
                <span className="tierlist-podium-rank">
                  {index === 0 ? (
                    <Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  ) : (
                    <Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  )}
                  #{index + 1}
                </span>
                <strong>{getDisplayName(entry)}</strong>
                <small>{getMetaLine(entry) || pick('ตัวอย่างจากเทมเพลตนี้', 'Example from this template')}</small>
              </article>
            ))}
          </div>
        ) : null}
        <div className="tierlist-preview-gallery">
          {isPreviewLoading ? (
            <TierListEmptyPanel
              icon={<Loader2 size={24} className="animate-spin" />}
              title={pick('กำลังโหลดตัวอย่าง', 'Loading previews')}
              message={pick('กำลังเตรียมรายชื่อเรื่องจากแคตตาล็อก', 'Preparing preview titles from the catalog.')}
            />
          ) : previewTitles.length === 0 ? (
            <TierListEmptyPanel
              icon={<Compass size={24} />}
              title={pick('ยังไม่มีเรื่องตัวอย่าง', 'No preview titles available')}
              message={pick('เทมเพลตนี้ยังไม่มีรายการเรื่องให้แสดงตัวอย่าง', 'This template does not have any titles to preview yet.')}
            />
          ) : (
            previewTitles.map((title) => (
              <article key={title.id} className="tierlist-preview-tile">
                <div className="tierlist-preview-poster">
                  <ArtworkImage entity={title} alt={getDisplayName(title)} loading="lazy" />
                </div>
                <div className="tierlist-preview-caption">
                  <h3>{getDisplayName(title)}</h3>
                  <p>{getMetaLine(title)}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('อันดับชุมชนของเทมเพลตนี้', 'Community Rankings For This Template')}</h2>
          <span className="tierlist-count">{relatedPublicLists.length} {pick('ลิสต์สาธารณะ', 'public lists')}</span>
        </div>

        {relatedPublicLists.length === 0 ? (
          <TierListEmptyPanel
            icon={<Sparkles size={24} />}
            title={pick('ยังไม่มีอันดับสาธารณะ', 'No public rankings yet')}
            message={pick('ลองเล่นเทมเพลตนี้แล้วเผยแพร่อันดับของคุณเป็นคนแรก', 'Play this template and publish the first community ranking.')}
          />
        ) : (
          <div className="tierlist-browse-grid">
            {relatedPublicLists.slice(0, 8).map((list) => (
              <TierListCommunityCard
                key={list.id}
                list={list}
                titleById={titleById}
                pick={pick}
                primaryLabel={pick('เปิดอันดับ', 'Open Ranking')}
                primaryTo={`/tierlist/play/${list.id}`}
                secondaryLabel={pick('รีมิกซ์', 'Remix')}
                onSecondaryClick={() => handleRemix(list)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TierListCreatePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult, toggleAdult } = useAgeGate();
  const [pagedEntries, setPagedEntries] = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [customItems, setCustomItems] = useState([]);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingPoolItems, setIsUploadingPoolItems] = useState(false);
  const [category, setCategory] = useState('anime');
  const [entityType, setEntityType] = useState(TITLE_ENTITY_TYPE);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [statusFilter, setStatusFilter] = useState('all');
  const [titleQuery, setTitleQuery] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedEntityCache, setSelectedEntityCache] = useState(new Map());
  // Song-specific state
  const [browsingTitle, setBrowsingTitle] = useState(null);
  const [songEntityCache, setSongEntityCache] = useState(new Map());
  const [isSongsLoading, setIsSongsLoading] = useState(false);
  const [isAudienceSwitching, setIsAudienceSwitching] = useState(false);

  // Initialise library in background (no catalog needed)
  useEffect(() => {
    if (isAuthLoading) return;
    loadTierLibrary([], {
      userId: user?.id || null,
      includePublic: false,
      fetchTemplates: false,
      showAdult,
    }).catch(() => { });
  }, [showAdult, user?.id, isAuthLoading]);

  // Debounce search query and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(
        normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE
          ? ''
          : titleQuery
      );
      setCatalogPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [entityType, titleQuery]);

  // Server-side paginated fetch for all entity types (title, character, song)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    const isCharMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
    const fetchFn = isCharMode ? getCharactersPage : getTitlesPage;
    fetchFn({
      type: typeFilter === 'all' ? undefined : typeFilter,
      query: debouncedQuery,
      sortBy,
      page: catalogPage,
      pageSize: 30,
      showAdult,
    }).then((result) => {
      if (cancelled) return;
      setPagedEntries(result.items);
      setCatalogTotalPages(result.totalPages);
      setCatalogTotal(result.total);
      setIsLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลดแคตตาล็อกสำหรับสร้างเทมเพลตไม่สำเร็จ', 'Failed to load the catalog for template creation'));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [entityType, typeFilter, debouncedQuery, sortBy, catalogPage, showAdult, pick]);

  useEffect(() => {
    if (!isLoading) {
      setIsAudienceSwitching(false);
    }
  }, [isLoading]);

  // Load songs when user drills into a title (song picker mode)
  useEffect(() => {
    const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;
    if (!isSongMode || !browsingTitle) return undefined;
    const titleId = Number(browsingTitle.id);
    if (songEntityCache.has(titleId)) return undefined;
    let cancelled = false;
    setIsSongsLoading(true);
    fetchSongsForTitle(browsingTitle)
      .then((entities) => {
        if (cancelled) return;
        setIsSongsLoading(false);
        setSongEntityCache((prev) => {
          const next = new Map(prev);
          next.set(titleId, entities);
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setIsSongsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [browsingTitle, entityType, songEntityCache]);

  const isCharacterMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
  // Derived above together with the other create-page mode flags.
  const modeSummary = useMemo(() => getEntityModeSummary(entityType, pick), [entityType, pick]);

  const catalogEntries = useMemo(() => pagedEntries, [pagedEntries]);

  const filtered = useMemo(
    () => catalogEntries.filter((entry) => (
      matchesStatusFilter(entry, statusFilter) && (!isCharacterMode || matchesCharacterName(entry, titleQuery))
    )),
    [catalogEntries, statusFilter, isCharacterMode, titleQuery]
  );
  const groupedFiltered = useMemo(
    () => splitByAdultFlag(filtered),
    [filtered]
  );

  const selectedTitles = useMemo(
    () => Array.from(selectedIds).map((id) => selectedEntityCache.get(id)).filter(Boolean),
    [selectedIds, selectedEntityCache]
  );

  const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;

  // Titles for browsing in song mode; already filtered server-side
  const filteredForSongBrowse = useMemo(() => {
    if (!isSongMode) return [];
    return pagedEntries;
  }, [isSongMode, pagedEntries]);
  const groupedFilteredForSongBrowse = useMemo(
    () => splitByAdultFlag(filteredForSongBrowse),
    [filteredForSongBrowse]
  );

  // Songs currently shown in the drill-down panel
  const currentBrowseSongs = useMemo(() => {
    if (!isSongMode || !browsingTitle) return [];
    return songEntityCache.get(Number(browsingTitle.id)) || [];
  }, [isSongMode, browsingTitle, songEntityCache]);

  const filteredBrowseSongs = useMemo(
    () => currentBrowseSongs.filter((song) => matchesSongQuery(song, songQuery)),
    [currentBrowseSongs, songQuery]
  );
  const groupedFilteredBrowseSongs = useMemo(
    () => splitByAdultFlag(filteredBrowseSongs),
    [filteredBrowseSongs]
  );

  // All selected song entities (accumulated across titles)
  const selectedSongEntities = useMemo(() => {
    if (!isSongMode) return [];
    const result = [];
    for (const songs of songEntityCache.values()) {
      songs.forEach((s) => { if (selectedIds.has(s.id)) result.push(s); });
    }
    return result;
  }, [isSongMode, selectedIds, songEntityCache]);

  const selectedCustomEntities = useMemo(
    () => Array.from(selectedIds)
      .map((id) => selectedEntityCache.get(id))
      .filter((entry) => entry?.isCustomTierItem),
    [selectedEntityCache, selectedIds]
  );

  const selectedItems = isSongMode ? [...selectedSongEntities, ...selectedCustomEntities] : selectedTitles;
  const minimumRequired = isSongMode ? 2 : 8;
  const hasActiveFilters = typeFilter !== 'all'
    || sortBy !== 'popularity'
    || statusFilter !== 'all'
    || titleQuery.trim().length > 0
    || songQuery.trim().length > 0;

  const toggleTitle = (id, entity) => {
    const numId = Number(id);
    const isCurrentlySelected = selectedIds.has(numId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) next.delete(numId);
      else next.add(numId);
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      if (isCurrentlySelected) next.delete(numId);
      else if (entity) next.set(numId, entity);
      return next;
    });
  };

  const handleUploadCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!user?.id) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป', 'Please sign in before uploading images'));
      event.target.value = '';
      return;
    }

    setIsUploadingCover(true);
    try {
      const uploadedUrl = await uploadTierlistImage(file, user.id, 'tierlist-cover');
      setCoverImageUrl(uploadedUrl);
      toast.success(pick('อัปโหลดรูปหน้าปกแล้ว', 'Cover image uploaded'));
    } catch (error) {
      toast.error(error?.message || pick('อัปโหลดรูปหน้าปกไม่สำเร็จ', 'Failed to upload cover image'));
    } finally {
      setIsUploadingCover(false);
      event.target.value = '';
    }
  };

  const handleUploadPoolItems = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    if (!user?.id) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป', 'Please sign in before uploading images'));
      event.target.value = '';
      return;
    }

    setIsUploadingPoolItems(true);
    try {
      const uploadedItems = [];
      for (const file of files) {
        const imageUrl = await uploadTierlistImage(file, user.id, 'tierlist-item');
        const customId = -(Date.now() + Math.floor(Math.random() * 1000) + uploadedItems.length);
        const title = getTierItemTitleFromFilename(file.name, pick);
        uploadedItems.push({
          id: customId,
          title,
          subtitle: '',
          imageUrl,
        });
      }

      setCustomItems((prev) => [...prev, ...uploadedItems]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        uploadedItems.forEach((item) => next.add(Number(item.id)));
        return next;
      });
      setSelectedEntityCache((prev) => {
        const next = new Map(prev);
        uploadedItems.forEach((item) => {
          next.set(Number(item.id), toCustomTierEntity(item, entityType));
        });
        return next;
      });
      toast.success(
        uploadedItems.length === 1
          ? pick('เพิ่มรูปเข้า pool แล้ว', 'Added image to the pool')
          : pick(`เพิ่มรูปเข้า pool แล้ว ${uploadedItems.length} รูป`, `Added ${uploadedItems.length} images to the pool`)
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปโหลดรูปเข้า pool ไม่สำเร็จ', 'Failed to upload pool images'));
    } finally {
      setIsUploadingPoolItems(false);
      event.target.value = '';
    }
  };

  const removeCustomItem = (itemId) => {
    const normalizedId = Number(itemId);
    setCustomItems((prev) => prev.filter((item) => Number(item.id) !== normalizedId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(normalizedId);
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      next.delete(normalizedId);
      return next;
    });
  };

  const handleCreate = async () => {
    const entitiesToUse = selectedItems;
    if (entitiesToUse.length < minimumRequired) {
      toast.error(
        isSongMode
          ? pick('กรุณาเลือกอย่างน้อย 2 เพลง', 'Please select at least 2 songs')
          : pick('กรุณาเลือกอย่างน้อย 8 เรื่อง', 'Please select at least 8 titles')
      );
      return;
    }

    setIsSaving(true);
    try {
      const externalPoolItems = entitiesToUse
        .filter((entry) => entry?.isCustomTierItem)
        .map((entry) => ({
          id: Number(entry.id),
          title: getDisplayName(entry),
          subtitle: entry.subtitle || entry.sourceTitleName || '',
          imageUrl: entry.cover || entry.image_url || '',
        }));
      const catalogItems = entitiesToUse.filter((entry) => !entry?.isCustomTierItem);
      const template = createTemplateFromCatalog(catalogItems, {
        title: templateName.trim() || (isSongMode ? pick('เทมเพลตเพลงใหม่', 'New Song Template') : pick('เทมเพลตใหม่', 'New Template')),
        description: templateDesc.trim(),
        category: isSongMode ? 'songs' : category,
        entityType,
        isPublic: true,
        isSystem: false,
        defaultRows: ['S', 'A', 'B', 'C', 'D'],
        previewArtworkUrl: coverImageUrl.trim(),
        customItems: externalPoolItems,
        ownerUserId: user?.id || null,
      });

      const currentLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        showAdult,
      });
      const cleanupResult = await cleanupDuplicateTierLists(currentLibrary, {
        userId: user?.id || null,
      });
      const workingLibrary = cleanupResult.library;
      const libraryAfterTemplate = await saveTierTemplate(template, workingLibrary, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(template.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || template;
      const normalizedSavedTemplate = isSongMode
        ? { ...savedTemplate, entityType: THEME_SONG_ENTITY_TYPE }
        : savedTemplate;
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog({
        ...list,
        entityType: isSongMode ? THEME_SONG_ENTITY_TYPE : list.entityType,
      }, entitiesToUse.map((e) => Number(e.id)));
      const ownerUsername = getCurrentUsername(user);
      const reusableDraft = findReusableTierListDraft({
        ...seeded,
        templateId: normalizedSavedTemplate.id,
        entityType: isSongMode ? THEME_SONG_ENTITY_TYPE : seeded.entityType,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, {
        userId: user?.id || null,
      });
      if (reusableDraft) {
        navigate(`/tierlist/play/${reusableDraft.id}`);
        return;
      }
      const libraryAfterList = await saveTierList({
        ...seeded,
        templateId: normalizedSavedTemplate.id,
        entityType: isSongMode ? THEME_SONG_ENTITY_TYPE : seeded.entityType,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      const savedList = findTierList(seeded.id, libraryAfterList) || libraryAfterList.lists[0];
      navigate(`/tierlist/play/${savedList.id}`);
    } catch (error) {
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetCreateFilters = () => {
    setTypeFilter('all');
    setSortBy('popularity');
    setStatusFilter('all');
    setTitleQuery('');
    setSongQuery('');
    setCatalogPage(1);
  };

  const switchAudienceMode = (nextAdultMode) => {
    if (Boolean(nextAdultMode) !== Boolean(showAdult)) {
      setIsAudienceSwitching(true);
      toggleAdult();
      setCatalogPage(1);
    }
  };

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <section className="container tierlist-hero tierlist-create-hero tierlist-create-rail">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}</span>
          <h1>{modeSummary.title}</h1>
          <p>{modeSummary.description}</p>
          <div className="tierlist-create-hero-meta" aria-label={pick('ภาพรวมการสร้าง', 'Creation summary')}>
            <span className="tierlist-create-meta-pill">
              <strong>{minimumRequired}</strong>
              {isSongMode
                ? pick(' ขั้นต่ำที่ต้องเลือก', ' minimum picks')
                : pick(' ขั้นต่ำก่อนสร้าง', ' minimum to create')}
            </span>
            <span className="tierlist-create-meta-pill">
              <strong>{selectedItems.length}</strong>
              {pick(' รายการที่เลือก', ' selected')}
            </span>
          </div>
        </div>
      </section>

      <section className="container tierlist-create-mode-row tierlist-create-rail">
        {ENTITY_TYPE_OPTIONS.map((option) => {
          const active = option.value === entityType;
          return (
            <button
              key={option.value}
              type="button"
              className={`glass-heavy tierlist-create-mode-card${active ? ' is-active' : ''}`}
              onClick={() => {
                setEntityType(normalizeCatalogEntityType(option.value));
                setSelectedIds(new Set());
                setSelectedEntityCache(new Map());
                setBrowsingTitle(null);
                setCategory(option.value === CHARACTER_ENTITY_TYPE ? 'characters' : option.value === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
                resetCreateFilters();
              }}
              aria-pressed={active}
            >
              <strong>{getEntityTypeLabel(option.value, pick)}</strong>
              <span>
                {option.value === TITLE_ENTITY_TYPE
                  ? pick('คัดชื่อเรื่องตรง ๆ พร้อมตัวกรองเพิ่ม', 'Curate titles directly with richer filtering')
                  : option.value === CHARACTER_ENTITY_TYPE
                    ? pick('แยกค้นหาชื่อเรื่องต้นทางกับชื่อตัวละครออกจากกัน', 'Keep source-title search and character-name search separate')
                    : pick('เลือกเรื่องก่อน แล้วค่อยเจาะ OP/ED ด้านใน', 'Pick a title first, then drill into its OP/ED tracks')}
              </span>
            </button>
          );
        })}
      </section>

      <section className="container tierlist-create-toolbar-shell tierlist-create-rail">
        <div className="tierlist-toolbar glass-heavy tierlist-create-toolbar">
        <div className="tierlist-create-audience-row" role="group" aria-label={pick('โหมดคอนเทนต์', 'Audience mode')}>
          <button
            type="button"
            className={`tierlist-create-audience-pill${!showAdult ? ' is-active' : ''}`}
            onClick={() => switchAudienceMode(false)}
            aria-pressed={!showAdult}
            disabled={isAudienceSwitching}
          >
            {pick('ทั่วไป', 'General')}
          </button>
          <button
            type="button"
            className={`tierlist-create-audience-pill${showAdult ? ' is-active' : ''}`}
            onClick={() => switchAudienceMode(true)}
            aria-pressed={showAdult}
            disabled={isAudienceSwitching}
          >
            18+
          </button>
          <span className="tierlist-create-audience-note">
            {showAdult
              ? pick('ตอนนี้ manhwa 18+ จะถูกดึงตรงตามโหมดผู้ใหญ่', '18+ manhwa is now fetched through the adult catalog mode.')
              : pick('ตอนนี้จะแสดงเฉพาะคอนเทนต์ทั่วไป', 'General-only catalog is active right now.')}
          </span>
        </div>

        <label className="tierlist-field">
          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={pick('เช่น Best Romance 2026', 'e.g. Best Romance 2026')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('คำอธิบาย', 'Description')}</span>
          <input
            value={templateDesc}
            onChange={(event) => setTemplateDesc(event.target.value)}
            placeholder={pick('อธิบายสั้น ๆ ว่าเทมเพลตนี้เหมาะกับอะไร', 'Add a short description for this template')}
          />
        </label>

        <div className="tierlist-create-external-panel glass-heavy">
          <div className="tierlist-create-external-head">
            <strong>{pick('อัปโหลดรูป', 'Upload Images')}</strong>
            <span>{pick('อัปโหลดไฟล์สำหรับหน้าปกและรูปใน pool ได้เลย โดยไม่ต้องตั้งชื่อเอง', 'Upload files for the cover and pool items without naming them manually')}</span>
          </div>
          <div className="tierlist-create-external-grid">
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปหน้าปก', 'Cover image')}</span>
              <label className={`tierlist-upload-button${isUploadingCover ? ' is-uploading' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCover}
                  disabled={isUploadingCover || isSaving}
                />
                <span>{isUploadingCover ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหน้าปก', 'Choose cover image')}</span>
              </label>
              <small>{coverImageUrl ? pick('อัปโหลดแล้ว พร้อมใช้เป็นหน้าปก', 'Uploaded and ready as the cover') : pick('ใช้รูปเดียวสำหรับหน้าปกเทมเพลต', 'Use a single image as the template cover')}</small>
            </label>
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปสำหรับ pool', 'Pool images')}</span>
              <label className={`tierlist-upload-button${isUploadingPoolItems ? ' is-uploading' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadPoolItems}
                  disabled={isUploadingPoolItems || isSaving}
                />
                <span>{isUploadingPoolItems ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหลายไฟล์', 'Choose multiple images')}</span>
              </label>
              <small>{pick('ระบบจะเพิ่มเข้าพูลให้อัตโนมัติ', 'Files will be added to the pool automatically')}</small>
            </label>
          </div>
          <div className="tierlist-create-external-status">
            <span className="tierlist-chip">{coverImageUrl ? pick('มีหน้าปกแล้ว', 'Cover ready') : pick('ยังไม่มีหน้าปก', 'No cover yet')}</span>
            <span className="tierlist-chip">{pick(`${customItems.length} รูปในพูล`, `${customItems.length} pool images`)}</span>
          </div>
          {coverImageUrl ? (
            <div className="tierlist-create-cover-preview">
              <img src={coverImageUrl} alt={pick('ตัวอย่างหน้าปก', 'Cover preview')} loading="lazy" />
            </div>
          ) : null}
          {customItems.length > 0 ? (
            <div className="tierlist-create-custom-list">
              {customItems.map((item) => (
                <article key={item.id} className="tierlist-create-custom-card">
                  <div className="tierlist-create-custom-thumb">
                    <img src={item.imageUrl} alt={item.title} loading="lazy" />
                  </div>
                  <div className="tierlist-create-custom-copy">
                    <strong>{item.title}</strong>
                    <span>{pick('รูปที่อัปโหลดเข้า pool', 'Uploaded pool image')}</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeCustomItem(item.id)}>
                    <Trash2 size={14} /> {pick('ลบ', 'Remove')}
                  </Button>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        {!isSongMode && (
          <label className="tierlist-field">
            <span>{pick('หมวดหมู่', 'Category')}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CREATE_CATEGORY_OPTIONS
                .filter((option) => !isCharacterMode || option.value !== 'anime')
                .map((option) => (
                  <option key={option.value} value={option.value}>{getTierCategoryLabel(option.value, pick)}</option>
                ))}
            </select>
          </label>
        )}

        <label className="tierlist-field">
          <span>{pick('แคตตาล็อก', 'Catalog')}</span>
          <select
            value={entityType}
            onChange={(event) => {
              const nextType = normalizeCatalogEntityType(event.target.value);
              setEntityType(nextType);
              setSelectedIds(new Set());
              setSelectedEntityCache(new Map());
              setBrowsingTitle(null);
              setCategory(nextType === CHARACTER_ENTITY_TYPE ? 'characters' : nextType === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
              setTypeFilter('all');
              setTitleQuery('');
              setCatalogPage(1);
            }}
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getEntityTypeLabel(option.value, pick)}</option>
            ))}
          </select>
        </label>

        <div className="tierlist-toolbar-actions">
          <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={isLoading || isSaving || selectedItems.length < minimumRequired}
          >
            {isSaving
              ? pick('กำลังสร้าง...', 'Creating...')
              : `${pick('สร้างและเล่น', 'Create & Play')}${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`}
          </Button>
        </div>
        </div>
      </section>

      {/* Song picker (song mode only) */}
      {isSongMode ? (
        <section className="container tierlist-section tierlist-create-rail">
          {browsingTitle ? (
            // Song drill-down: songs of the selected title
            <>
              <div className="tierlist-section-head">
                <div className="tierlist-songs-drilldown-head">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowsingTitle(null)}
                  >
                    <ChevronLeft size={14} /> {pick('กลับเลือกเรื่อง', 'Back to titles')}
                  </button>
                  <h2>
                    {getCatalogEntityName(browsingTitle)}
                    <span className="tierlist-count">
                      &nbsp;•&nbsp;
                      {currentBrowseSongs.filter((s) => selectedIds.has(s.id)).length}/{currentBrowseSongs.length} {pick('เพลงที่เลือก', 'songs selected')}
                    </span>
                  </h2>
                </div>
                <div className="tierlist-picker-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.add(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.length === 0}
                  >
                    {pick('เลือกทั้งหมด', 'Select All')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.delete(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.every((s) => !selectedIds.has(s.id))}
                  >
                    {pick('ยกเลิกทั้งหมด', 'Deselect All')}
                  </button>
                </div>
              </div>

              <div className="tierlist-picker-filterbar">
                <div className="tierlist-picker-filterbar-top">
                  <div className="tierlist-picker-search-wrap">
                    <input
                      className="tierlist-picker-search"
                      value={songQuery}
                      onChange={(event) => setSongQuery(event.target.value)}
                      placeholder={pick('ค้นหาเพลง ศิลปิน หรือ OP/ED...', 'Search by song, artist, or OP/ED...')}
                      aria-label={pick('ค้นหาเพลง', 'Search songs')}
                    />
                    {songQuery ? (
                      <button type="button" className="tierlist-picker-search-clear" onClick={() => setSongQuery('')}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <span className="tierlist-picker-result-count">{filteredBrowseSongs.length} {pick('เพลง', 'songs')}</span>
                </div>
              </div>

              {isSongsLoading ? (
                <TierListEmptyPanel
                  icon={<Loader2 size={24} className="animate-spin" />}
                  title={pick('กำลังโหลดเพลง', 'Loading songs')}
                  message={pick('กำลังดึงรายการเพลงสำหรับเรื่องนี้', 'Fetching song list for this title.')}
                />
              ) : filteredBrowseSongs.length === 0 ? (
                <TierListEmptyPanel
                  icon={<Music size={24} />}
                  title={pick('ไม่พบเพลงสำหรับเรื่องนี้', 'No songs found for this title')}
                  message={pick('เรื่องนี้ยังไม่มีข้อมูลเพลงในระบบ', 'This title has no song data in the database.')}
                />
              ) : (
                <div className="tierlist-adult-split-wrap">
                  {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                    <section key={group.key} className="tierlist-adult-split-block">
                      <h3>{group.label} <span>{groupedFilteredBrowseSongs[group.key].length}</span></h3>
                      <div className="tierlist-song-picker-list">
                        {groupedFilteredBrowseSongs[group.key].length === 0 ? (
                          <p className="tierlist-pool-state">{pick('ไม่มีรายการฝั่งนี้', 'No items in this side')}</p>
                        ) : groupedFilteredBrowseSongs[group.key].map((song) => {
                          const selected = selectedIds.has(song.id);
                          return (
                            <button
                              key={song.id}
                              type="button"
                              className={`tierlist-song-picker-row${selected ? ' is-selected' : ''}`}
                              onClick={() => toggleTitle(song.id)}
                              aria-pressed={selected}
                            >
                              <div className="tierlist-song-picker-thumb">
                                <ArtworkImage entity={song} alt="" loading="lazy" />
                              </div>
                              <div className="tierlist-song-picker-info">
                                <strong>{song.song_title || getCatalogEntityName(song)}</strong>
                                <span>{[song.theme_label, song.artist_name].filter(Boolean).join(' | ')}</span>
                                {song.episodes_text ? <small>{song.episodes_text}</small> : null}
                              </div>
                              <span className="tierlist-song-picker-check" aria-hidden="true">
                                {selected ? <span className="tierlist-picker-check-dot is-on" /> : <span className="tierlist-picker-check-dot" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Title browser: pick which title to drill into
            <>
              <div className="tierlist-section-head">
                <h2>
                  {pick('เลือกเรื่องที่ต้องการเพลง', 'Pick a title to browse songs')}
                  {selectedIds.size > 0 && (
                    <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('เพลงที่เลือกแล้ว', 'songs selected')}</span>
                  )}
                </h2>
              </div>

              <div className="tierlist-picker-filterbar">
                <div className="tierlist-picker-filterbar-top">
                  <div className="tierlist-picker-type-pills" role="toolbar">
                    {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                        onClick={() => setTypeFilter(type)}
                        aria-pressed={typeFilter === type}
                      >
                        {getMediaTypeLabel(type, pick)}
                      </button>
                    ))}
                  </div>
                  <SortSelect
                    value={sortBy}
                    onChange={(value) => {
                      setSortBy(value);
                      setCatalogPage(1);
                    }}
                    label={pick('เรียง', 'Sort')}
                    className="results-sorter"
                  >
                    {CREATE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
                    ))}
                  </SortSelect>
                  <div className="tierlist-picker-search-wrap">
                    <input
                      className="tierlist-picker-search"
                      value={titleQuery}
                      onChange={(e) => setTitleQuery(e.target.value)}
                      placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
                    />
                    {titleQuery && (
                      <button type="button" className="tierlist-picker-search-clear" onClick={() => setTitleQuery('')}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <span className="tierlist-picker-result-count">{filteredForSongBrowse.length} {pick('เรื่อง', 'titles')}</span>
                </div>
              </div>

              {isLoading ? (
                <TierListEmptyPanel
                  icon={<Loader2 size={28} className="animate-spin" />}
                  title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
                  message={pick('กำลังเตรียมรายชื่อเรื่อง', 'Preparing titles.')}
                />
              ) : filteredForSongBrowse.length === 0 ? (
                <TierListEmptyPanel
                  icon={<Search size={28} />}
                  title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
                  message={pick('ลองล้างคำค้นหา', 'Try clearing the search.')}
                />
              ) : (
                <>
                  <div className="tierlist-adult-split-wrap">
                    {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                      <section key={group.key} className="tierlist-adult-split-block">
                        <h3>{group.label} <span>{groupedFilteredForSongBrowse[group.key].length}</span></h3>
                        <div className="tierlist-picker-grid">
                          {groupedFilteredForSongBrowse[group.key].map((title) => {
                            const titleSongs = songEntityCache.get(Number(title.id)) || [];
                            const selectedCount = titleSongs.filter((s) => selectedIds.has(s.id)).length;
                            return (
                              <button
                                key={title.id}
                                type="button"
                                className={`tierlist-picker-card${selectedCount > 0 ? ' is-selected' : ''}`}
                                onClick={() => setBrowsingTitle(title)}
                                onMouseEnter={() => preloadSongsForTitle(title)}
                                onFocus={() => preloadSongsForTitle(title)}
                                title={getDisplayName(title)}
                              >
                                <div className="tierlist-picker-thumb">
                                  <ArtworkImage entity={title} alt="" loading="lazy" />
                                  {selectedCount > 0 && (
                                    <div className="tierlist-picker-check">
                                      <Music size={10} /> {selectedCount}
                                    </div>
                                  )}
                                </div>
                                <div className="tierlist-picker-card-body">
                                  <div className="tierlist-picker-card-tags">
                                    <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                                    {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                                  </div>
                                  <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                                  <span className="tierlist-picker-card-subtitle">{getMetaLine(title) || getStatusLabel(title.status, pick)}</span>
                                  <small className="tierlist-picker-card-footnote">
                                    {pick('กดเพื่อเข้าไปเลือก OP / ED ของเรื่องนี้', 'Open this title to pick its OP / ED tracks')}
                                  </small>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                  {catalogTotalPages > 1 && (
                    <div className="tierlist-picker-pagination">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={catalogPage <= 1}
                        onClick={() => setCatalogPage((p) => p - 1)}
                      >
                        <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
                      </Button>
                      <span className="tierlist-picker-page-info">
                        {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={catalogPage >= catalogTotalPages}
                        onClick={() => setCatalogPage((p) => p + 1)}
                      >
                        {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      ) : (
        /* Normal title/character picker */
        <section className="container tierlist-section tierlist-create-rail">
          <div className="tierlist-section-head">
            <h2>
              {isCharacterMode
                ? pick('เลือก Character โดยแยกจาก Source Title ชัดเจน', 'Pick characters with source titles clearly separated')
                : pick('เลือกเรื่อง', 'Select Titles')}
              {selectedIds.size > 0 && (
                <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('รายการที่เลือก', 'selected')}</span>
              )}
            </h2>
            <div className="tierlist-picker-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const toAdd = filtered.filter((t) => !selectedIds.has(Number(t.id)));
                  setSelectedIds((prev) => { const n = new Set(prev); toAdd.forEach((t) => n.add(Number(t.id))); return n; });
                  setSelectedEntityCache((prev) => { const n = new Map(prev); toAdd.forEach((t) => n.set(Number(t.id), t)); return n; });
                }}
                disabled={filtered.length === 0}
              >
                {pick('เลือกทั้งหมด', 'Select All')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelectedIds(new Set()); setSelectedEntityCache(new Map()); }}
                disabled={selectedIds.size === 0}
              >
                {pick('ล้าง', 'Clear')}
              </button>
            </div>
          </div>

          <div className="tierlist-picker-filterbar">
            <div className="tierlist-picker-filterbar-top">
              <div className="tierlist-picker-type-pills" role="toolbar" aria-label={pick('กรองตามประเภท', 'Filter by type')}>
                {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                    onClick={() => { setTypeFilter(type); setCatalogPage(1); }}
                    aria-pressed={typeFilter === type}
                  >
                    {getMediaTypeLabel(type, pick)}
                  </button>
                ))}
              </div>
              <SortSelect
                value={sortBy}
                onChange={(value) => {
                  setSortBy(value);
                  setCatalogPage(1);
                }}
                label={pick('เรียง', 'Sort')}
                className="results-sorter"
              >
                {CREATE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
                ))}
              </SortSelect>
              <SortSelect
                value={statusFilter}
                onChange={setStatusFilter}
                label={pick('สถานะ', 'Status')}
                className="results-sorter"
              >
                {CREATE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{getStatusLabel(status, pick)}</option>
                ))}
              </SortSelect>
              <div className="tierlist-picker-search-wrap">
                <input
                  className="tierlist-picker-search"
                  value={titleQuery}
                  onChange={(event) => setTitleQuery(event.target.value)}
                  placeholder={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง...', 'Search character or source title...') : pick('ค้นหาเรื่อง...', 'Search titles...')}
                  aria-label={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง', 'Search character or source title') : pick('ค้นหาเรื่อง', 'Search titles')}
                />
                {titleQuery && (
                  <button
                    type="button"
                    className="tierlist-picker-search-clear"
                    onClick={() => setTitleQuery('')}
                    aria-label={pick('ล้างคำค้นหา', 'Clear search')}
                  ><X size={14} /></button>
                )}
              </div>
              <span className="tierlist-picker-result-count">
                {isCharacterMode ? filtered.length : catalogTotal} {pick('รายการ', 'items')}
              </span>
            </div>
          </div>

          {isLoading ? (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
              message={pick('กำลังเตรียมรายการเรื่องให้เลือกสำหรับสร้างเทมเพลต', 'Preparing titles you can use in this template.')}
            />
          ) : filtered.length === 0 ? (
            <TierListEmptyPanel
              icon={<Search size={28} />}
              title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
              message={
                hasActiveFilters
                  ? pick('ลองล้างคำค้นหา ปิดตัวกรองบางตัว หรือเลือกทุกประเภท', 'Try clearing search, relaxing filters, or switching back to all types.')
                  : pick('ยังไม่มีข้อมูลเรื่องให้เลือกในตอนนี้', 'There are no titles available to pick right now.')
              }
              action={hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetCreateFilters}
                >
                  {pick('ล้างตัวกรอง', 'Clear filters')}
                </Button>
              ) : null}
            />
          ) : (
            <>
              <div className="tierlist-adult-split-wrap">
                {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                  <section key={group.key} className="tierlist-adult-split-block">
                    <h3>{group.label} <span>{groupedFiltered[group.key].length}</span></h3>
                    <div className="tierlist-picker-grid">
                      {groupedFiltered[group.key].map((title) => {
                        const selected = selectedIds.has(Number(title.id));
                        return (
                          <button
                            key={title.id}
                            type="button"
                            className={`tierlist-picker-card${selected ? ' is-selected' : ''}`}
                            onClick={() => toggleTitle(Number(title.id), title)}
                            title={getDisplayName(title)}
                            aria-pressed={selected}
                          >
                            <div className="tierlist-picker-thumb">
                              <ArtworkImage entity={title} alt="" loading="lazy" />
                              {selected && <div className="tierlist-picker-check">{pick('เลือกแล้ว', 'Selected')}</div>}
                            </div>
                            <div className="tierlist-picker-card-body">
                              <div className="tierlist-picker-card-tags">
                                <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                                {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                                {isCharacterMode && title.role ? <span className="tierlist-chip">{title.role}</span> : null}
                              </div>
                              <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                              <span className="tierlist-picker-card-subtitle">
                                {isCharacterMode
                                  ? `${title.sourceTitleName || pick('ไม่ทราบเรื่องต้นทาง', 'Unknown source title')}${title.voice_actor_name ? ` • ${title.voice_actor_name}` : ''}`
                                  : getMetaLine(title)}
                              </span>
                              <small className="tierlist-picker-card-footnote">
                                {isCharacterMode
                                  ? pick('บรรทัดบนคือชื่อตัวละคร บรรทัดล่างคือชื่อเรื่องต้นทาง', 'Top line is the character name, bottom line is the source title')
                                  : getStatusLabel(title.status, pick)}
                              </small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {catalogTotalPages > 1 && (
                <div className="tierlist-picker-pagination">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={catalogPage <= 1}
                    onClick={() => setCatalogPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
                  </Button>
                  <span className="tierlist-picker-page-info">
                    {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={catalogPage >= catalogTotalPages}
                    onClick={() => setCatalogPage((p) => p + 1)}
                  >
                    {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function TierListManagePage() {
  const { pick, locale } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [myListStats, setMyListStats] = useState({
    totalCount: 0,
    publicCount: 0,
    linkedCountByTemplateId: {},
  });
  const [listPage, setListPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSavingId, setIsSavingId] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    setListPage(1);
  }, [showAdult, user?.id]);

  const refreshLibrary = useCallback(async (options = {}) => {
    if (!user?.id) {
      const emptyLibrary = { templates: [], lists: [] };
      setLibrary(emptyLibrary);
      setMyListStats({
        totalCount: 0,
        publicCount: 0,
        linkedCountByTemplateId: {},
      });
      return emptyLibrary;
    }

    const targetPage = Number.isFinite(options?.page) && options.page > 0
      ? Math.floor(options.page)
      : listPage;
    const offset = (targetPage - 1) * MANAGE_LISTS_PAGE_SIZE;

    const [ownedTemplates, pagedLists, nextStats] = await Promise.all([
      loadTierTemplates([], {
        userId: user.id,
        includePublic: false,
        includeOwned: true,
        showAdult,
      }),
      loadOwnedTierListsPage(user.id, {
        limit: MANAGE_LISTS_PAGE_SIZE,
        offset,
        showAdult,
      }),
      loadOwnedTierListStats(user.id, { showAdult }),
    ]);

    const totalPages = Math.max(1, Math.ceil(nextStats.totalCount / MANAGE_LISTS_PAGE_SIZE));
    const nextPage = Math.min(targetPage, totalPages);
    const nextLists = nextPage === targetPage
      ? pagedLists
      : await loadOwnedTierListsPage(user.id, {
        limit: MANAGE_LISTS_PAGE_SIZE,
        offset: (nextPage - 1) * MANAGE_LISTS_PAGE_SIZE,
        showAdult,
      });
    const nextLibrary = {
      templates: ownedTemplates,
      lists: nextLists,
    };

    if (nextPage !== listPage) {
      setListPage(nextPage);
    }

    setLibrary(nextLibrary);
    setMyListStats(nextStats);
    return nextLibrary;
  }, [listPage, showAdult, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user?.id) {
      return;
    }

    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');
      try {
        await refreshLibrary();
        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || pick('โหลดรายการของคุณไม่สำเร็จ', 'Failed to load your tier lists'));
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, pick, refreshLibrary, user?.id]);

  const myTemplates = useMemo(
    () => sortTemplates(
      (library.templates || []).filter((template) => isOwnedTemplateByUser(template, user)),
      'newest'
    ),
    [library.templates, user]
  );
  const myLists = useMemo(
    () => [...(library.lists || [])]
      .filter((list) => isOwnedListByUser(list, user))
      .sort((left, right) => {
        const updatedDelta = new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
        if (updatedDelta !== 0) {
          return updatedDelta;
        }
        return Number(right?.playCount || 0) - Number(left?.playCount || 0);
      }),
    [library.lists, user]
  );
  const totalListPages = Math.max(1, Math.ceil(myListStats.totalCount / MANAGE_LISTS_PAGE_SIZE));
  const linkedCountByTemplateId = myListStats.linkedCountByTemplateId || {};

  const loadFullListForAction = useCallback(async (listId) => {
    const detail = await loadTierListDetail(listId, {
      userId: user?.id || null,
      showAdult,
    });
    if (!detail?.list) {
      throw new Error(pick('ไม่พบลิสต์ที่ต้องการแก้ไข', 'Ranking not found'));
    }
    return detail;
  }, [pick, showAdult, user?.id]);

  const beginEditing = (kind, entry) => {
    setEditingKey(`${kind}:${entry.id}`);
    setDraftTitle(String(entry?.title || ''));
    setDraftDescription(String(entry?.description || ''));
  };

  const stopEditing = () => {
    setEditingKey('');
    setDraftTitle('');
    setDraftDescription('');
  };

  const handleToggleTemplateVisibility = async (template) => {
    const nextTemplate = { ...template, isPublic: !template.isPublic };
    const savingKey = `template:${template.id}`;
    setIsSavingId(savingKey);

    try {
      await saveTierTemplate(nextTemplate, library, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      await refreshLibrary();
      toast.success(
        nextTemplate.isPublic
          ? pick('เผยแพร่เทมเพลตแล้ว', 'Template is now public')
          : pick('ซ่อนเทมเพลตแล้ว', 'Template is now private')
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปเดตสถานะเทมเพลตไม่สำเร็จ', 'Failed to update template visibility'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleSaveTemplateMeta = async (template) => {
    const nextTemplate = {
      ...template,
      title: draftTitle.trim() || template.title,
      description: draftDescription.trim(),
    };
    const savingKey = `template:${template.id}:edit`;
    setIsSavingId(savingKey);

    try {
      await saveTierTemplate(nextTemplate, library, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      await refreshLibrary();
      stopEditing();
      toast.success(pick('อัปเดตเทมเพลตแล้ว', 'Template updated'));
    } catch (error) {
      toast.error(error?.message || pick('บันทึกเทมเพลตไม่สำเร็จ', 'Failed to save template'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleToggleListVisibility = async (list) => {
    const savingKey = `list:${list.id}`;
    setIsSavingId(savingKey);

    try {
      const detail = await loadFullListForAction(list.id);
      const nextList = { ...detail.list, isPublic: !detail.list.isPublic };
      await saveTierList(nextList, detail.library, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      toast.success(
        nextList.isPublic
          ? pick('เผยแพร่อันดับแล้ว', 'Ranking is now public')
          : pick('ซ่อนอันดับแล้ว', 'Ranking is now private')
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปเดตสถานะลิสต์ไม่สำเร็จ', 'Failed to update list visibility'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleSaveListMeta = async (list) => {
    const savingKey = `list:${list.id}:edit`;
    setIsSavingId(savingKey);

    try {
      const detail = await loadFullListForAction(list.id);
      const nextList = {
        ...detail.list,
        title: draftTitle.trim() || detail.list.title,
        description: draftDescription.trim(),
      };
      await saveTierList(nextList, detail.library, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      stopEditing();
      toast.success(pick('อัปเดตลิสต์แล้ว', 'Ranking updated'));
    } catch (error) {
      toast.error(error?.message || pick('บันทึกลิสต์ไม่สำเร็จ', 'Failed to save ranking'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleDeleteTemplate = async (template) => {
    const linkedCount = Number(linkedCountByTemplateId[String(template.id)] || 0);
    const confirmMessage = linkedCount > 0
      ? pick(
        `ลบเทมเพลต "${template.title}" ใช่ไหม\n\nลิสต์ที่อ้างอิงอยู่ ${linkedCount} รายการจะถูกเก็บไว้ต่อ และเปลี่ยนเป็นลิสต์เดี่ยว`,
        `Delete template "${template.title}"?\n\n${linkedCount} linked rankings will be kept and converted into standalone rankings.`
      )
      : pick(`ลบเทมเพลต "${template.title}" ใช่ไหม`, `Delete template "${template.title}"?`);

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const savingKey = `template:${template.id}:delete`;
    setIsSavingId(savingKey);
    try {
      const fullOwnedLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        includeOwned: true,
        showAdult,
      });
      await deleteTierTemplate(template.id, {
        templates: fullOwnedLibrary.templates,
        lists: fullOwnedLibrary.lists,
      }, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      if (editingKey === `template:${template.id}`) {
        stopEditing();
      }
      toast.success(
        linkedCount > 0
          ? pick('ลบเทมเพลตแล้ว และแปลงลิสต์ที่อ้างอิงเป็นลิสต์เดี่ยว', 'Template deleted and linked rankings were converted to standalone')
          : pick('ลบเทมเพลตแล้ว', 'Template deleted')
      );
    } catch (error) {
      const message = String(error?.message || '');
      if (message === 'Template is still referenced by rankings that cannot be detached automatically') {
        toast.error(
          pick(
            'ยังลบเทมเพลตไม่ได้ เพราะยังมีลิสต์บางรายการอ้างอิงอยู่และระบบถอดออกให้อัตโนมัติไม่ได้',
            'This template cannot be deleted yet because some rankings still reference it and could not be detached automatically'
          )
        );
      } else {
        toast.error(error?.message || pick('ลบเทมเพลตไม่สำเร็จ', 'Failed to delete template'));
      }
    } finally {
      setIsSavingId('');
    }
  };

  const handleDeleteList = async (list) => {
    console.info('tierlist delete requested', {
      listId: list?.id || '',
      title: list?.title || '',
      userId: user?.id || null,
      libraryListCount: Array.isArray(library?.lists) ? library.lists.length : 0,
    });

    if (!window.confirm(pick(`ลบลิสต์ "${list.title}" ใช่ไหม`, `Delete ranking "${list.title}"?`))) {
      return;
    }

    const savingKey = `list:${list.id}:delete`;
    setIsSavingId(savingKey);
    try {
      await deleteTierList(list.id, library, {
        userId: user?.id || null,
      });
      console.info('tierlist delete remote step resolved', {
        listId: list?.id || '',
      });
      await refreshLibrary();
      console.info('tierlist delete refresh resolved', {
        listId: list?.id || '',
      });
      if (editingKey === `list:${list.id}`) {
        stopEditing();
      }
      toast.success(pick('ลบลิสต์แล้ว', 'Ranking deleted'));
    } catch (error) {
      console.error('tierlist delete failed', {
        listId: list?.id || '',
        title: list?.title || '',
        debug: error?.tierlistDebug || null,
        error,
      });
      toast.error(error?.message || pick('ลบลิสต์ไม่สำเร็จ', 'Failed to delete ranking'));
    } finally {
      setIsSavingId('');
    }
  };

  if (isAuthLoading || (isLoading && !loadError)) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดพื้นที่จัดการ', 'Loading your workspace')}
            message={pick('กำลังดึงเทมเพลตและลิสต์ของคุณ', 'Fetching your templates and rankings.')}
          />
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <section className="container tierlist-manage-hero">
        <div className="tierlist-manage-hero-copy">
          <span className="tierlist-kicker"><Monitor size={14} /> {pick('พื้นที่จัดการส่วนตัว', 'Personal Workspace')}</span>
          <h1>{pick('จัดการ Tier List ของฉัน', 'Manage My Tier Lists')}</h1>
          <p>{pick('รวมเทมเพลตและอันดับที่คุณสร้างไว้ทั้งหมดในที่เดียว เปิดแก้ไขต่อหรือสลับ public/private ได้เร็วขึ้น', 'See every template and ranking you created in one place, then jump back in to edit or switch visibility faster.')}</p>
        </div>
        <div className="tierlist-manage-hero-actions">
          <Link className="tierlist-browse-manage-btn" to="/tierlist">
            <ChevronLeft size={14} /> {pick('กลับไปหน้ารวม', 'Back to Browse')}
          </Link>
          <Link className="tierlist-browse-create-btn" to="/tierlist/create">
            <Plus size={14} /> {pick('สร้าง Tier List ใหม่', 'Create New Tier List')}
          </Link>
        </div>
        <div className="tierlist-manage-summary-grid">
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myTemplates.length}</strong>
            <span>{pick('เทมเพลตของฉัน', 'My templates')}</span>
          </article>
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myListStats.totalCount}</strong>
            <span>{pick('ลิสต์ของฉัน', 'My rankings')}</span>
          </article>
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myListStats.publicCount}</strong>
            <span>{pick('ลิสต์สาธารณะ', 'Public rankings')}</span>
          </article>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('เทมเพลตของฉัน', 'My Templates')}</h2>
          <span className="tierlist-count">{myTemplates.length} {pick('รายการ', 'items')}</span>
        </div>

        {myTemplates.length === 0 ? (
          <TierListEmptyPanel
            icon={<Sparkles size={24} />}
            title={pick('ยังไม่มีเทมเพลตของคุณ', 'No templates yet')}
            message={pick('เริ่มจากสร้างเทมเพลตแรก แล้วมันจะมารวมที่หน้านี้อัตโนมัติ', 'Create your first template and it will show up here automatically.')}
            action={(
              <Link className="btn btn-primary btn-sm" to="/tierlist/create">
                {pick('เริ่มสร้าง', 'Start Creating')}
              </Link>
            )}
          />
        ) : (
          <div className="tierlist-manage-grid">
            {myTemplates.map((template) => {
              const savingKey = `template:${template.id}`;
              const linkedCount = Number(linkedCountByTemplateId[String(template.id)] || 0);
              const isEditing = editingKey === `template:${template.id}`;
              return (
                <article key={template.id} className="glass-heavy tierlist-manage-card">
                  <div
                    className="tierlist-manage-card-cover"
                    style={template.previewArtworkUrl ? { backgroundImage: `url(${template.previewArtworkUrl})` } : undefined}
                  >
                    {!template.previewArtworkUrl && (
                      <div className="tierlist-manage-cover-fallback">
                        <Sparkles size={30} />
                      </div>
                    )}
                    <div className="tierlist-manage-cover-badges">
                      <small className="tierlist-chip">{getTierCategoryLabel(template.category, pick)}</small>
                      <span className={`tierlist-manage-visibility${template.isPublic ? ' is-public' : ''}`}>
                        {template.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                        {template.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                      </span>
                    </div>
                  </div>
                  <div className="tierlist-manage-card-body">
                    <h3 className="tierlist-manage-card-title">{template.title}</h3>
                    {!isEditing && (
                      <p className="tierlist-manage-description">
                        {template.description || pick('ยังไม่ได้ใส่คำอธิบาย', 'No description yet.')}
                      </p>
                    )}
                    {!isEditing && (
                      <div className="tierlist-manage-meta">
                        <span>{getEntityTypeLabel(template.entityType, pick)}</span>
                        <span>{template.titleIds.length} {pick('รายการ', 'items')}</span>
                        {Number(template.plays || 0) > 0 && <span>{Number(template.plays)} {pick('ครั้งเล่น', 'plays')}</span>}
                        {linkedCount > 0 && <span>{linkedCount} {pick('ลิสต์ที่ผูก', 'linked')}</span>}
                        <span>{formatTierDate(template.updatedAt, locale)}</span>
                      </div>
                    )}
                    {isEditing && (
                      <div className="tierlist-manage-edit-form">
                        <label className="tierlist-field">
                          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
                          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                        </label>
                        <label className="tierlist-field">
                          <span>{pick('คำอธิบาย', 'Description')}</span>
                          <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                        </label>
                      </div>
                    )}
                    <div className="tierlist-manage-actions">
                      <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/template/${template.id}`}>
                        {pick('เปิดเทมเพลต', 'Open')}
                      </Link>
                      {isEditing ? (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="primary"
                            className="tierlist-manage-action-primary"
                            onClick={() => handleSaveTemplateMeta(template)}
                            disabled={isSavingId === `template:${template.id}:edit`}
                          >
                            {isSavingId === `template:${template.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={stopEditing}>
                            {pick('ยกเลิก', 'Cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={pick('แก้ไขชื่อและคำอธิบาย', 'Edit name & description')}
                            onClick={() => beginEditing('template', template)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={template.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                            onClick={() => handleToggleTemplateVisibility(template)}
                            disabled={isSavingId === savingKey}
                          >
                            {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (template.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="tierlist-manage-icon-danger"
                            title={linkedCount > 0 ? pick('ลบแล้วลิสต์ที่ผูกจะเปลี่ยนเป็นลิสต์เดี่ยว', 'Deleting converts linked rankings to standalone') : pick('ลบเทมเพลต', 'Delete template')}
                            onClick={() => handleDeleteTemplate(template)}
                            disabled={isSavingId === `template:${template.id}:delete`}
                          >
                            {isSavingId === `template:${template.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('ลิสต์ของฉัน', 'My Rankings')}</h2>
          <span className="tierlist-count">{myListStats.totalCount} {pick('รายการ', 'items')}</span>
        </div>

        {myListStats.totalCount === 0 ? (
          <TierListEmptyPanel
            icon={<Layers size={24} />}
            title={pick('ยังไม่มีลิสต์ของคุณ', 'No rankings yet')}
            message={pick('เล่นจากเทมเพลตสักอันก่อน แล้วลิสต์ของคุณจะกลับมาจัดการต่อได้จากหน้านี้', 'Play a template first and your rankings will be collected here for quick editing later.')}
            action={(
              <Link className="btn btn-primary btn-sm" to="/tierlist">
                {pick('ไปเลือกเทมเพลต', 'Browse Templates')}
              </Link>
            )}
          />
        ) : (
          <div className="tierlist-manage-grid">
            {myLists.map((list) => {
              const savingKey = `list:${list.id}`;
              const sourceTemplate = list.templateId ? findTierTemplate(list.templateId, library) : null;
              const isEditing = editingKey === `list:${list.id}`;
              const previewRows = list.rows.slice(0, 5);
              const maxItems = Math.max(1, ...previewRows.map((r) => r.titleIds.length));
              return (
                <article key={list.id} className="glass-heavy tierlist-manage-card">
                  <div className="tierlist-manage-tier-preview">
                    {previewRows.length > 0 ? previewRows.map((row) => {
                      const barPct = Math.max(4, (row.titleIds.length / maxItems) * 100);
                      return (
                        <div key={row.id} className="tierlist-manage-tier-row" style={row.color ? { '--row-c': row.color } : undefined}>
                          <span className="tierlist-manage-tier-tag">{row.label}</span>
                          <div className="tierlist-manage-tier-bar-wrap">
                            <div className="tierlist-manage-tier-bar" style={{ width: row.titleIds.length > 0 ? `${barPct}%` : '0%' }} />
                          </div>
                          <span className="tierlist-manage-tier-n">{row.titleIds.length}</span>
                        </div>
                      );
                    }) : (
                      <div className="tierlist-manage-tier-empty">
                        <Layers size={18} />
                        <span>{pick('ยังไม่มี tier', 'No tiers yet')}</span>
                      </div>
                    )}
                  </div>
                  <div className="tierlist-manage-card-body">
                    <div className="tierlist-manage-card-head">
                      <small className="tierlist-chip">
                        {sourceTemplate ? pick('จากเทมเพลต', 'From template') : pick('ลิสต์เดี่ยว', 'Standalone')}
                      </small>
                      <span className={`tierlist-manage-visibility${list.isPublic ? ' is-public' : ''}`}>
                        {list.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                        {list.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                      </span>
                    </div>
                    <h3 className="tierlist-manage-card-title">{list.title}</h3>
                    {!isEditing && (
                      <div className="tierlist-manage-meta">
                        <span>{list.rows.length} {pick('tier', 'tiers')}</span>
                        {Number(list.playCount || 0) > 0 && <span>{Number(list.playCount)} {pick('ครั้งเล่น', 'plays')}</span>}
                        <span>{formatTierDate(list.updatedAt, locale)}</span>
                      </div>
                    )}
                    {isEditing && (
                      <div className="tierlist-manage-edit-form">
                        <label className="tierlist-field">
                          <span>{pick('ชื่อลิสต์', 'Ranking name')}</span>
                          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                        </label>
                        <label className="tierlist-field">
                          <span>{pick('คำอธิบาย', 'Description')}</span>
                          <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                        </label>
                      </div>
                    )}
                    <div className="tierlist-manage-actions">
                      <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/play/${list.id}`}>
                        {pick('เปิดแก้ไข', 'Open')}
                      </Link>
                      {isEditing ? (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="primary"
                            className="tierlist-manage-action-primary"
                            onClick={() => handleSaveListMeta(list)}
                            disabled={isSavingId === `list:${list.id}:edit`}
                          >
                            {isSavingId === `list:${list.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={stopEditing}>
                            {pick('ยกเลิก', 'Cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={pick('แก้ไขชื่อ', 'Edit name')}
                            onClick={() => beginEditing('list', list)}
                          >
                            <Pencil size={14} />
                          </Button>
                          {sourceTemplate && (
                            <Link
                              className="btn btn-ghost btn-sm"
                              to={`/tierlist/template/${sourceTemplate.id}`}
                              title={pick('ดูเทมเพลตต้นทาง', 'View source template')}
                            >
                              <ArrowRight size={14} />
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title={list.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                            onClick={() => handleToggleListVisibility(list)}
                            disabled={isSavingId === savingKey}
                          >
                            {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (list.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="tierlist-manage-icon-danger"
                            title={pick('ลบลิสต์', 'Delete ranking')}
                            onClick={() => handleDeleteList(list)}
                            disabled={isSavingId === `list:${list.id}:delete`}
                          >
                            {isSavingId === `list:${list.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {myListStats.totalCount > MANAGE_LISTS_PAGE_SIZE ? (
          <div className="tierlist-pagination">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft size={14} />}
              disabled={listPage <= 1}
              onClick={() => setListPage((current) => Math.max(1, current - 1))}
            >
              {pick('ก่อนหน้า', 'Previous')}
            </Button>
            <span>{listPage} / {totalListPages}</span>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={14} />}
              disabled={listPage >= totalListPages}
              onClick={() => setListPage((current) => Math.min(totalListPages, current + 1))}
            >
              {pick('ถัดไป', 'Next')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TierListPlayPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [tierList, setTierList] = useState(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [songEntityMap, setSongEntityMap] = useState(new Map());

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      setLoadError('');
      setSongEntityMap(new Map());

      const loadedDetail = await loadTierListDetail(listId, {
        userId: user?.id || null,
        showAdult,
      });
      if (!cancelled) {
        setLibrary(loadedDetail.library);
      }

      const foundList = loadedDetail.list;
      if (!foundList) {
        setLoadError(pick('ไม่พบ Tier List', 'Tier list not found'));
        return;
      }

      const list = foundList;

      if (!cancelled) {
        setTierList(list);
      }
      const sourceTemplate = list.templateId
        ? findTierTemplate(list.templateId, loadedDetail.library)
        : null;
      const allowedTitleIds = sourceTemplate?.titleIds?.length
        ? sourceTemplate.titleIds
        : [
          ...list.poolTitleIds,
          ...list.rows.flatMap((row) => row.titleIds),
        ];

      // Determine entity type to choose loading strategy
      const resolvedEntityTypeForLoad = normalizeCatalogEntityType(
        list.entityType || (sourceTemplate ? sourceTemplate.entityType : null)
      );

      const persistedEntityIds = [...new Set([
        ...list.poolTitleIds,
        ...list.rows.flatMap((row) => row.titleIds),
      ].map(Number).filter(Boolean))];
      const referencedEntityIds = [...new Set([
        ...allowedTitleIds,
        ...persistedEntityIds,
      ].map(Number).filter(Boolean))];

      let filteredCatalog;
      let availableCatalogIds = referencedEntityIds;
      if (resolvedEntityTypeForLoad === CHARACTER_ENTITY_TYPE) {
        const catalog = await fetchCharacterEntitiesByIds(referencedEntityIds, { showAdult });
        if (cancelled) return;
        filteredCatalog = catalog;
        availableCatalogIds = catalog.map((entity) => Number(entity.id)).filter(Boolean);
      } else if (resolvedEntityTypeForLoad !== THEME_SONG_ENTITY_TYPE) {
        const catalog = await getTitlesByIds(referencedEntityIds, { showAdult });
        if (cancelled) return;
        filteredCatalog = catalog;
        availableCatalogIds = catalog.map((entry) => Number(entry.id)).filter(Boolean);
      } else {
        filteredCatalog = [];
      }
      setTitles(filteredCatalog);

      const shouldReseedFromTemplate = (
        persistedEntityIds.length === 0 &&
        Array.isArray(sourceTemplate?.titleIds) &&
        sourceTemplate.titleIds.length > 0
      );
      const baseListForFilter = shouldReseedFromTemplate
        ? seedPoolFromCatalog({
          ...list,
          entityType: resolvedEntityTypeForLoad,
        }, sourceTemplate.titleIds)
        : {
          ...list,
          entityType: resolvedEntityTypeForLoad,
        };

      let cleanedList = filterTierListToCatalog(baseListForFilter, availableCatalogIds);
      const canRepairFromTemplate = (
        Array.isArray(sourceTemplate?.titleIds) &&
        sourceTemplate.titleIds.length > 0 &&
        resolvedEntityTypeForLoad !== TITLE_ENTITY_TYPE
      );
      if (canRepairFromTemplate && getTierEntryEntityIds(cleanedList).length === 0) {
        const repairedList = seedPoolFromCatalog({
          ...list,
          entityType: resolvedEntityTypeForLoad,
        }, sourceTemplate.titleIds);
        cleanedList = resolvedEntityTypeForLoad === CHARACTER_ENTITY_TYPE
          ? filterTierListToCatalog(repairedList, availableCatalogIds)
          : repairedList;
      }
      if (cancelled) return;

      let nextPlayableList = cleanedList;

      if (hasTierListStructureChanged(list, cleanedList)) {
        const cleanedLibrary = await saveTierList(cleanedList, null, { userId: user?.id || null });
        if (cancelled) return;
        setLibrary(cleanedLibrary);
        nextPlayableList = findTierList(cleanedList.id, cleanedLibrary) || cleanedList;
      }

      // Load song entities for song-type tier lists
      const resolvedEntityType = normalizeCatalogEntityType(
        cleanedList.entityType || (sourceTemplate ? sourceTemplate.entityType : null)
      );
      nextPlayableList = {
        ...nextPlayableList,
        entityType: resolvedEntityType,
      };
      setTierList(nextPlayableList);

      if (resolvedEntityType === THEME_SONG_ENTITY_TYPE) {
        let songIds = [
          ...(sourceTemplate?.titleIds || []),
          ...nextPlayableList.poolTitleIds,
          ...nextPlayableList.rows.flatMap((row) => row.titleIds),
        ].map(Number).filter((id) => Number.isFinite(id) && id > 0);

        let uniqueSongIds = [...new Set(songIds)];
        if (uniqueSongIds.length > 0) {
          let songEntities = await fetchThemeSongEntitiesByIds(uniqueSongIds, { showAdult });

          if (cancelled) return;
          if (
            songEntities.length === 0 &&
            canRepairFromTemplate
          ) {
            const repairedSongList = seedPoolFromCatalog({
              ...nextPlayableList,
              entityType: THEME_SONG_ENTITY_TYPE,
            }, sourceTemplate.titleIds);
            nextPlayableList = repairedSongList;
            setTierList(repairedSongList);
            songIds = [...new Set(sourceTemplate.titleIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
            uniqueSongIds = songIds;
            songEntities = uniqueSongIds.length > 0
              ? await fetchThemeSongEntitiesByIds(uniqueSongIds, { showAdult })
              : [];
            if (cancelled) return;
          }

          setSongEntityMap(new Map(songEntities.map((e) => [e.id, e])));
        }
      }
    }
    load().catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลด Tier List ไม่สำเร็จ', 'Failed to load tier list'));
    });
    return () => { cancelled = true; };
  }, [listId, pick, showAdult, user?.id, isAuthLoading]);

  const sourceTemplate = tierList?.templateId ? findTierTemplate(tierList.templateId, library) : null;
  const activeEntityType = normalizeCatalogEntityType(tierList?.entityType || sourceTemplate?.entityType);
  const entityMaps = useMemo(
    () => buildEntityMaps(titles, tierList?.customItems || sourceTemplate?.customItems || [], activeEntityType),
    [activeEntityType, sourceTemplate, tierList, titles]
  );
  const titleById = useMemo(
    () => getEntityMap(entityMaps, activeEntityType),
    [activeEntityType, entityMaps]
  );
  // For song-type lists, override titleById with the loaded song entity map
  const effectiveTitleById = songEntityMap.size > 0 ? songEntityMap : titleById;
  const isOwner = Boolean(user?.id && tierList?.ownerUserId && String(user.id) === String(tierList.ownerUserId));
  const canEdit = !tierList?.ownerUserId || isOwner;
  const relatedPublicLists = tierList?.templateId
    ? sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        list.id !== tierList.id &&
        String(list.templateId || '') === String(tierList.templateId) &&
        hasVisibleTierListTitles(list, effectiveTitleById)
      ))
    )
    : [];

  const requiredEntityIds = useMemo(
    () => [...new Set([
      ...(tierList?.poolTitleIds || []),
      ...((tierList?.rows || []).flatMap((row) => row.titleIds || [])),
    ].map(Number).filter(Boolean))],
    [tierList]
  );
  const hasResolvedRequiredEntities = useMemo(
    () => requiredEntityIds.every((id) => effectiveTitleById.has(id)),
    [effectiveTitleById, requiredEntityIds]
  );

  const handleToggleVisibility = async () => {
    if (!tierList.isPublic && !hasMeaningfulTierRanking(tierList)) {
      const totalEntityCount = [
        ...(tierList?.poolTitleIds || []),
        ...((tierList?.rows || []).flatMap((row) => row.titleIds || [])),
      ].length;

      if (totalEntityCount === 0 && sourceTemplate?.titleIds?.length) {
        setTierList((current) => seedPoolFromCatalog(current, sourceTemplate.titleIds));
      }

      toast.error(
        pick(
          'จัดอันดับอย่างน้อย 1 รายการก่อนเผยแพร่',
          'Rank at least one item before publishing',
        ),
      );
      return;
    }

    const next = { ...tierList, isPublic: !tierList.isPublic };
    setTierList(next);
    try {
      const savedLibrary = await saveTierList(next, null, { userId: user?.id || null });
      setLibrary(savedLibrary);
      setTierList(findTierList(next.id, savedLibrary) || savedLibrary.lists[0] || next);
    } catch (error) {
      setTierList(tierList);
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    }
  };

  const handleRemixTierList = async (list) => {
    try {
      const saved = await saveTierList(buildRemixedTierList(list, user), null, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  const isSongType = activeEntityType === THEME_SONG_ENTITY_TYPE;
  const isWaitingForSongs = isSongType && songEntityMap.size === 0 && !loadError;
  const isWaitingForPoolEntities = Boolean(tierList) && requiredEntityIds.length > 0 && !hasResolvedRequiredEntities && !loadError;
  const podium = useMemo(() => getTierListPodium(tierList, effectiveTitleById), [effectiveTitleById, tierList]);
  const winner = podium[0] || null;
  const runnerUps = podium.slice(1, 3);

  if (!tierList || isWaitingForSongs || isWaitingForPoolEntities) {
    return (
      <div className="tierlist-play-page">
        <section className="container tierlist-section">
          {loadError ? (
            <TierListErrorPanel
              message={loadError}
              onRetry={() => window.location.reload()}
              backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
              backTo="/tierlist"
            />
          ) : (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลด Tier List', 'Loading tier list')}
              message={isWaitingForPoolEntities
                ? pick('กำลังเตรียมภาพในคลัง tier list', 'Preparing artwork for the tier list pool.')
                : isSongType
                  ? pick('กำลังโหลดข้อมูลเพลงสำหรับคลังรูป', 'Loading song data for the image pool.')
                  : pick('กำลังเตรียมข้อมูลการจัดอันดับและเรื่องในพูล', 'Preparing the ranking board and title pool.')}
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-play-page">
      <div className="container tierlist-play-topbar">
        <div className="tierlist-play-topbar-left">
          <Link className="btn btn-ghost btn-sm" to={sourceTemplate ? `/tierlist/template/${sourceTemplate.id}` : '/tierlist'}>
            <ChevronLeft size={14} /> {sourceTemplate ? pick('กลับไปเทมเพลต', 'Back to Template') : pick('กลับไปหน้ารวม', 'Back to Browse')}
          </Link>
          {!canEdit && (() => {
            const slug = tierList.ownerUsername || tierList.ownerName;
            const label = getOwnerDisplayName(tierList.ownerName, tierList.ownerUsername, pick);
            return slug && slug !== 'You' ? (
              <span className="tierlist-by-line">
                {pick('โดย', 'by')}{' '}
                <Link to={`/u/${slug}`} className="tierlist-owner-link">{label}</Link>
              </span>
            ) : null;
          })()}
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant={tierList.isPublic ? 'secondary' : 'ghost'}
            onClick={handleToggleVisibility}
          >
            {tierList.isPublic ? pick('สาธารณะ: เปิด', 'Public: ON') : pick('ทำเป็นสาธารณะ', 'Make Public')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleRemixTierList(tierList)}
          >
            {pick('รีมิกซ์อันดับนี้', 'Remix This Ranking')}
          </Button>
        )}
      </div>

      <TierListEditor
        tierList={tierList}
        setTierList={setTierList}
        titleById={effectiveTitleById}
        query={query}
        setQuery={setQuery}
        pick={pick}
        readOnly={!canEdit}
      />

      {winner ? (
        <section className="container tierlist-section">
          <div className="tierlist-section-head">
            <h2>{pick('อันดับเด่นตอนนี้', 'Current Podium')}</h2>
          </div>
          <div className="tierlist-podium-grid">
            <article className="tierlist-podium-card tierlist-podium-card-winner glass-heavy">
              <div className="tierlist-podium-cover">
                <ArtworkImage entity={winner} alt={getDisplayName(winner)} loading="lazy" />
              </div>
              <span className="tierlist-podium-rank"><Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #1</span>
              <strong>{getDisplayName(winner)}</strong>
              <small>{getMetaLine(winner) || pick('อันดับสูงสุดของลิสต์นี้', 'Top ranked in this tier list')}</small>
            </article>
            {runnerUps.map((entry, index) => (
              <article key={entry.id} className="tierlist-podium-card glass-heavy">
                <div className="tierlist-podium-cover">
                  <ArtworkImage entity={entry} alt={getDisplayName(entry)} loading="lazy" />
                </div>
                <span className="tierlist-podium-rank"><Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #{index + 2}</span>
                <strong>{getDisplayName(entry)}</strong>
                <small>{getMetaLine(entry) || pick('ตัวท็อปของการจัดอันดับนี้', 'Top ranked in this tier list')}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sourceTemplate && (
        <section className="container tierlist-section">
          <div className="tierlist-community-banner glass-heavy">
            <div className="tierlist-community-banner-copy">
              <small className="tierlist-chip">{pick('ชุมชนของเทมเพลต', 'Template Community')}</small>
              <h2>{pick('ดูว่าคนอื่นจัดอันดับเทมเพลตเดียวกันนี้อย่างไร', 'See how other people ranked this same template')}</h2>
              <p>
                {canEdit
                  ? pick('เผยแพร่อันดับของคุณ เปรียบเทียบลำดับกับคนอื่น หรือรีมิกซ์จากลิสต์ชุมชนเพื่อแตกกิ่งแนวคิดใหม่ได้เลย', 'Publish your version, compare tier choices, or remix a community ranking to start your own branch.')
                  : pick('ลิสต์นี้แก้ไขไม่ได้ แต่คุณยังดูความต่างของแต่ละอันดับ แล้วรีมิกซ์เป็นเวอร์ชันที่แก้ไขได้ของตัวเองต่อได้', 'This ranking is view-only. Compare tier choices here, then remix it to create your own editable version.')}
              </p>
            </div>
            <div className="tierlist-community-banner-actions">
              <Link className="btn btn-ghost" to={`/tierlist/template/${sourceTemplate.id}`}>
                {pick('หน้าเทมเพลต', 'Template Page')}
              </Link>
              {canEdit && !tierList.isPublic ? (
                <Button variant="primary" onClick={handleToggleVisibility}>
                  {pick('เผยแพร่อันดับของคุณ', 'Publish Your Ranking')}
                </Button>
              ) : null}
              {!canEdit ? (
                <Button variant="primary" onClick={() => handleRemixTierList(tierList)}>
                  {pick('รีมิกซ์เพื่อแก้ไข', 'Remix To Edit')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="tierlist-section-head">
            <h2>{pick('อันดับจากชุมชน', 'Community Rankings')}</h2>
            <span className="tierlist-count">{relatedPublicLists.length} {pick('ลิสต์ที่เกี่ยวข้อง', 'related lists')}</span>
          </div>

          {relatedPublicLists.length === 0 ? (
            <TierListEmptyPanel
              icon={<Compass size={24} />}
              title={pick('ยังไม่มีอันดับสาธารณะอื่น', 'No other public rankings yet')}
              message={pick('ยังไม่มีอันดับสาธารณะอื่นสำหรับเทมเพลตนี้ในตอนนี้', 'There are no other public rankings for this template yet.')}
            />
          ) : (
            <div className="tierlist-browse-grid">
              {relatedPublicLists.slice(0, 8).map((list) => (
                <TierListCommunityCard
                  key={list.id}
                  list={list}
                  titleById={titleById}
                  pick={pick}
                  primaryLabel={pick('เปิดอันดับ', 'Open Ranking')}
                  primaryTo={`/tierlist/play/${list.id}`}
                  secondaryLabel={pick('รีมิกซ์', 'Remix')}
                  onSecondaryClick={() => handleRemixTierList(list)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tierList.isPublic && (
        <TierListCommentSection
          listId={tierList.id}
          listOwnerId={tierList.ownerUserId}
          pick={pick}
        />
      )}
    </div>
  );
}

export function SongTierListPage() {
  const { titleSlug } = useParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const [sourceTitle, setSourceTitle] = useState(null);
  const [songs, setSongs] = useState([]);
  const [tierList, setTierList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!titleSlug) return undefined;
    let cancelled = false;

    async function load() {
      setLoadError('');
      try {
        const title = await getTitleBySlug(titleSlug);
        if (cancelled) return;
        if (!title) {
          setLoadError(pick('ไม่พบชื่อเรื่องนี้', 'Title not found'));
          return;
        }
        setSourceTitle(title);

        const songEntities = await fetchSongsForTitle(title);
        if (cancelled) return;
        setSongs(songEntities);

        if (songEntities.length === 0) {
          setLoadError(pick('ไม่มีเพลงสำหรับชื่อเรื่องนี้', 'No songs found for this title'));
          return;
        }

        // Load library to find an existing song tierlist for this title
        const library = await loadTierLibrary([], {
          userId: user?.id || null,
          includePublic: false,
          fetchTemplates: false,
          showAdult,
        });
        if (cancelled) return;

        const songSourceKey = `song-source:${title.id}`;
        const isCurrentOwnerList = (list) => (
          user?.id
            ? String(list.ownerUserId || '') === String(user.id)
            : !list.ownerUserId && String(list.ownerName || '').trim().toLowerCase() === 'you'
        );
        const existing = library.lists
          .filter((list) => (
            list.description === songSourceKey &&
            normalizeCatalogEntityType(list.entityType) === THEME_SONG_ENTITY_TYPE &&
            isCurrentOwnerList(list)
          ))
          .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())[0];

        const songIds = songEntities.map((s) => s.id);
        const baseList = existing
          ? seedPoolFromCatalog({
            ...existing,
            entityType: THEME_SONG_ENTITY_TYPE,
            description: songSourceKey,
          }, songIds)
          : createTierListFromTemplate({
            id: '',
            title: `${pick('เพลงจาก', 'Songs of')} ${getCatalogEntityName(title)}`,
            description: songSourceKey,
            defaultRows: ['S', 'A', 'B', 'C', 'D'],
            titleIds: songIds,
            entityType: THEME_SONG_ENTITY_TYPE,
            hasAdultContent: Boolean(title?.is_adult),
          });

        if (!cancelled) {
          setTierList(baseList);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || pick('โหลดไม่สำเร็จ', 'Failed to load'));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [titleSlug, user?.id, showAdult, pick]);

  const titleById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs]
  );

  const _titleName = sourceTitle ? getCatalogEntityName(sourceTitle) : titleSlug;

  if (!tierList) {
    return (
      <div className="tierlist-play-page">
        <section className="container tierlist-section">
          {loadError ? (
            <TierListErrorPanel
              message={loadError}
              onRetry={() => window.location.reload()}
              backLabel={pick('กลับ', 'Back')}
              backTo={`/title/${titleSlug}`}
            />
          ) : (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดเพลง', 'Loading songs')}
              message={pick('กำลังเตรียมรายการเพลงสำหรับจัด Tierlist', 'Preparing song list for tierlist')}
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-play-page">
      <div className="container tierlist-play-topbar">
        <div className="tierlist-play-topbar-left">
          <Link className="btn btn-ghost btn-sm" to="/tierlist/songs">
            <ChevronLeft size={14} /> {pick('ลิสต์จัดอันดับเพลง', 'Song Tier Lists')}
          </Link>
          <span className="tierlist-by-line">
            <Music size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {pick('จัดอันดับเพลง', 'Song Tierlist')}
          </span>
        </div>
      </div>

      <TierListEditor
        tierList={tierList}
        setTierList={setTierList}
        titleById={titleById}
        query={query}
        setQuery={setQuery}
        pick={pick}
      />
    </div>
  );
}

export function SongTierListBrowsePage() {
  const { pick } = useLanguage();
  const { showAdult } = useAgeGate();
  const [titlesWithSongs, setTitlesWithSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');

      // Step 1: get only the title IDs that have songs (fast, no full catalog)
      const songCountMap = await getSongCountMap();

      const uniqueTitleIds = [...songCountMap.keys()];
      const catalog = await getTitlesByIds(uniqueTitleIds);
      if (cancelled) return;

      const filtered = filterTitlesForAgeGate(catalog, showAdult);

      const result = filtered
        .map((t) => ({ ...t, songCount: songCountMap.get(Number(t.id)) || 0 }))
        .filter((t) => t.songCount > 0)
        .sort((a, b) => b.songCount - a.songCount);

      setTitlesWithSongs(result);
      setIsLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setLoadError(err?.message || pick('โหลดไม่สำเร็จ', 'Failed to load'));
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult]);

  const filteredTitles = useMemo(() => {
    let result = typeFilter === 'all' ? titlesWithSongs : titlesWithSongs.filter((t) => t.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const haystack = [t.title_th, t.title_en, t.canonical_title].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [titlesWithSongs, typeFilter, query]);

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <div className="container tierlist-browse-header">
        <div className="tierlist-browse-header-left">
          <h1><Music size={17} /> {pick('ลิสต์จัดอันดับเพลง', 'Song Tier Lists')}</h1>
          {!isLoading && (
            <span className="tierlist-count">{filteredTitles.length} {pick('เรื่อง', 'titles')}</span>
          )}
        </div>
        <Link className="btn btn-ghost btn-sm" to="/tierlist">
          <ChevronLeft size={13} /> {pick('ลิสต์จัดอันดับทั้งหมด', 'All Tier Lists')}
        </Link>
      </div>

      <div className="container tierlist-browse-filters">
        <div className="tierlist-browse-cats">
          {['all', 'anime', 'manga', 'manhwa'].map((type) => (
            <button
              key={type}
              type="button"
              className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
              onClick={() => setTypeFilter(type)}
              aria-pressed={typeFilter === type}
            >
              {getMediaTypeLabel(type, pick)}
            </button>
          ))}
        </div>
        <div className="tierlist-browse-search" role="group">
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
            aria-label={pick('ค้นหาชื่อเรื่อง', 'Search titles')}
          />
          {query ? (
            <Button size="sm" variant="ghost" onClick={() => setQuery('')} aria-label={pick('ล้างคำค้นหา', 'Clear search')}>
              <X size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      <section className="container tierlist-section">
        {isLoading ? (
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดรายชื่อ', 'Loading titles')}
            message={pick('กำลังค้นหาเรื่องที่มีเพลงสำหรับจัดอันดับ', 'Finding titles with songs available to rank.')}
          />
        ) : filteredTitles.length === 0 ? (
          <TierListEmptyPanel
            icon={<Music size={28} />}
            title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
            message={
              query || typeFilter !== 'all'
                ? pick('ลองล้างคำค้นหาหรือเปลี่ยนประเภท', 'Try clearing the search or switching the type filter.')
                : pick('ยังไม่มีเรื่องที่มีข้อมูลเพลงในตอนนี้', 'No titles with song data are available yet.')
            }
            action={query || typeFilter !== 'all' ? (
              <Button variant="outline" onClick={() => { setQuery(''); setTypeFilter('all'); }}>
                {pick('ล้างตัวกรอง', 'Clear filters')}
              </Button>
            ) : null}
          />
        ) : (
          <div className="tierlist-browse-grid">
            {filteredTitles.map((title) => (
              <article key={title.id} className="glass-heavy tierlist-browse-card">
                <div className="tierlist-browse-cover">
                  <ArtworkImage entity={title} alt="" loading="lazy" />
                </div>
                <div className="tierlist-browse-card-body">
                  <small className="tierlist-chip">{getMediaTypeLabel(title.type || 'anime', pick)}</small>
                  <h3>{getCatalogEntityName(title)}</h3>
                  <small className="tierlist-meta">
                    <Music size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {title.songCount} {pick('เพลง', 'songs')}
                  </small>
                </div>
                <div className="tierlist-browse-card-actions">
                  <Link className="btn btn-primary btn-sm" to={`/tierlist/songs/${title.slug}`}>
                    <Play size={12} /> {pick('จัดอันดับเพลง', 'Rank Songs')}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default TierListBrowsePage;
