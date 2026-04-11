import { CANONICAL_TITLE_PREVIEW_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  YOUTUBE_ENTITY_TYPE,
  buildCharacterEntity,
  buildThemeSongEntity,
} from '@/shared/lib/catalogEntities';
import { supabase } from '@/shared/lib/supabase';

const ENTITY_VISIBILITY_CHUNK_SIZE = 120;
const CHARACTER_BATCH_SIZE = 200;

function normalizeJoinedTitleRecord(record) {
  const rawTitle = Array.isArray(record) ? record[0] : record;
  return rawTitle ? mapCanonicalTitle(rawTitle) : null;
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
      entities.push(buildCharacterEntity(sourceTitle, row, index, {
        preferRowId: Number(row?.id || 0) > 0,
      }));
    });
  });

  return entities;
}

export function createEmptyBrowseVisibility() {
  return {
    allowedByType: {
      [TITLE_ENTITY_TYPE]: new Set(),
      [CHARACTER_ENTITY_TYPE]: new Set(),
      [THEME_SONG_ENTITY_TYPE]: new Set(),
      [YOUTUBE_ENTITY_TYPE]: new Set(),
    },
    blockedByType: {
      [TITLE_ENTITY_TYPE]: new Set(),
      [CHARACTER_ENTITY_TYPE]: new Set(),
      [THEME_SONG_ENTITY_TYPE]: new Set(),
      [YOUTUBE_ENTITY_TYPE]: new Set(),
    },
  };
}

export async function fetchTierlistThemeSongEntities(songIds = [], options = {}) {
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

export async function fetchTierlistCharacterEntities(characterIds = [], options = {}) {
  const uniqueCharacterIds = [...new Set((characterIds || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!supabase || uniqueCharacterIds.length === 0) {
    return [];
  }

  const characterRows = [];
  const sourceTitles = [];
  const resolvedIds = new Set();
  const requestedIds = new Set(uniqueCharacterIds);

  const mainChunks = [];
  for (let index = 0; index < uniqueCharacterIds.length; index += CHARACTER_BATCH_SIZE) {
    mainChunks.push(uniqueCharacterIds.slice(index, index + CHARACTER_BATCH_SIZE));
  }

  const rowIdResults = await Promise.all(
    mainChunks.map((chunk) => {
      let query = supabase
        .from('title_characters')
        .select(`
          id,
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
        .in('id', chunk);

      if (typeof options?.showAdult === 'boolean') {
        query = query.eq('canonical_titles.is_adult', options.showAdult);
      }

      return query;
    })
  );

  for (const { data, error } of rowIdResults) {
    if (error) throw error;
    characterRows.push(...(data || []));
    (data || []).forEach((row) => {
      const rowId = Number(row?.id || 0);
      if (rowId > 0) resolvedIds.add(rowId);
      const sourceTitle = normalizeJoinedTitleRecord(row.canonical_titles);
      if (sourceTitle) sourceTitles.push(sourceTitle);
    });
  }

  const mainResults = await Promise.all(
    mainChunks.map((chunk) => {
      const unresolvedChunk = chunk.filter((id) => !resolvedIds.has(id));
      if (unresolvedChunk.length === 0) {
        return Promise.resolve({ data: [], error: null });
      }

      let query = supabase
        .from('title_characters')
        .select(`
          id,
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
        .in('anilist_id', unresolvedChunk);

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
      const rowId = Number(row?.id || 0);
      if (rowId > 0 && requestedIds.has(rowId)) resolvedIds.add(rowId);
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
            id,
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
  const entityById = new Map();
  builtEntities.forEach((entity) => {
    const entityId = Number(entity.id || 0);
    if (entityId > 0) {
      entityById.set(entityId, entity);
    }

    const rowId = Number(entity.characterRowId || 0);
    if (rowId > 0 && !entityById.has(rowId)) {
      entityById.set(rowId, entity);
    }

    const anilistId = Number(entity.anilist_id || 0);
    if (anilistId > 0 && !entityById.has(anilistId)) {
      entityById.set(anilistId, entity);
    }
  });

  return uniqueCharacterIds
    .map((characterId) => entityById.get(Number(characterId)) || null)
    .filter(Boolean);
}

export async function fetchTierlistSongsForTitle(title) {
  const titleId = Number(title?.id || 0);
  if (!supabase || !titleId) {
    return [];
  }

  const { data, error } = await supabase
    .from('title_theme_songs')
    .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
    .eq('canonical_title_id', titleId)
    .order('display_order');

  if (error) {
    throw error;
  }

  return (data || []).map((song) => buildThemeSongEntity(song, title));
}

export async function fetchTierlistSongCountMap() {
  if (!supabase) {
    return new Map();
  }

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

  return countMap;
}

export async function fetchTierlistBrowseVisibility({ titleIds = [], songIds = [], characterIds = [] }, showAdult = false) {
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
        supabase.from('title_characters').select('id, anilist_id, canonical_titles!inner(is_adult)').or(
          `id.in.(${chunk.join(',')}),anilist_id.in.(${chunk.join(',')})`
        )
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
      const titleRecord = Array.isArray(row.canonical_titles) ? row.canonical_titles[0] : row.canonical_titles;
      const bucket = Boolean(titleRecord.is_adult) === showAdult ? 'allowedByType' : 'blockedByType';
      const rowId = Number(row.id || 0);
      const anilistId = Number(row.anilist_id || 0);
      if (rowId > 0) {
        visibility[bucket][CHARACTER_ENTITY_TYPE].add(rowId);
      }
      if (anilistId > 0) {
        visibility[bucket][CHARACTER_ENTITY_TYPE].add(anilistId);
      }
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
