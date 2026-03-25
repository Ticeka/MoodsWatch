import { buildTrailerThumbnailUrl, parseTrailerUrl } from '@/shared/lib/trailers';

export const TITLE_ENTITY_TYPE = 'title';
export const CHARACTER_ENTITY_TYPE = 'character';
export const THEME_SONG_ENTITY_TYPE = 'theme_song';

const CHARACTER_ROLE_LABELS = {
  MAIN: 'Main character',
  SUPPORTING: 'Supporting character',
};

const CHARACTER_ROLE_PRIORITY = {
  MAIN: 3,
  SUPPORTING: 2,
  BACKGROUND: 1,
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getRolePriority(role) {
  return CHARACTER_ROLE_PRIORITY[normalizeText(role).toUpperCase()] || 0;
}

function getFallbackCharacterId(sourceTitle, index) {
  const sourceId = Number(sourceTitle?.id || 0);
  return (Math.max(1, sourceId) * 1000) + index + 1;
}

function resolveCharacterId(sourceTitle, character, index) {
  const anilistId = Number(character?.anilist_id || 0);
  if (Number.isFinite(anilistId) && anilistId > 0) {
    return anilistId;
  }

  return getFallbackCharacterId(sourceTitle, index);
}

function buildCharacterKey(sourceTitle, character, index) {
  const anilistId = Number(character?.anilist_id || 0);
  if (Number.isFinite(anilistId) && anilistId > 0) {
    return `anilist:${anilistId}`;
  }

  return `fallback:${sourceTitle?.id || '0'}:${index}`;
}

function shouldReplaceCharacter(existingEntity, nextEntity) {
  const existingRole = getRolePriority(existingEntity?.role);
  const nextRole = getRolePriority(nextEntity?.role);
  if (nextRole !== existingRole) {
    return nextRole > existingRole;
  }

  const popularityDelta = Number(nextEntity?.popularity || 0) - Number(existingEntity?.popularity || 0);
  if (popularityDelta !== 0) {
    return popularityDelta > 0;
  }

  const scoreDelta = Number(nextEntity?.score || 0) - Number(existingEntity?.score || 0);
  if (scoreDelta !== 0) {
    return scoreDelta > 0;
  }

  return false;
}

export function normalizeCatalogEntityType(value) {
  if (value === CHARACTER_ENTITY_TYPE) return CHARACTER_ENTITY_TYPE;
  if (value === THEME_SONG_ENTITY_TYPE) return THEME_SONG_ENTITY_TYPE;
  return TITLE_ENTITY_TYPE;
}

export function isCharacterEntity(entity) {
  return normalizeCatalogEntityType(entity?.entityType) === CHARACTER_ENTITY_TYPE;
}

export function isThemeSongEntity(entity) {
  return entity?.entityType === THEME_SONG_ENTITY_TYPE;
}

export function getCatalogEntityName(entity) {
  if (isThemeSongEntity(entity)) {
    return entity?.song_title || entity?.title_en || 'Unknown';
  }
  return entity?.title_th || entity?.title_en || entity?.title_native || 'Unknown';
}

export function getCatalogEntityMeta(entity) {
  if (isThemeSongEntity(entity)) {
    return [
      entity?.voice_actor_name || entity?.artist_name,
      entity?.sourceTitleName,
    ].filter(Boolean).join(' / ');
  }

  if (isCharacterEntity(entity)) {
    return [
      entity?.sourceTitleName,
      CHARACTER_ROLE_LABELS[normalizeText(entity?.role).toUpperCase()] || 'Character',
    ].filter(Boolean).join(' / ');
  }

  return [entity?.type, ...(entity?.genres || []).slice(0, 2)].filter(Boolean).join(' / ');
}

export function buildThemeSongEntity(song, sourceTitle) {
  const themeLabel = song.theme_type + (song.theme_sequence > 1 ? ` ${song.theme_sequence}` : '');
  const sourceTitleName = sourceTitle
    ? (sourceTitle.title_th || sourceTitle.title_en || sourceTitle.title_native || '')
    : '';
  const parsedTrailer = parseTrailerUrl(song.video_url || '');
  const fallbackSongArtwork = buildTrailerThumbnailUrl({
    site: parsedTrailer.site,
    videoId: parsedTrailer.videoId,
  });

  return {
    id: Number(song.id),
    entityType: THEME_SONG_ENTITY_TYPE,
    slug: `song-${song.id}`,
    title_en: song.song_title,
    title_th: song.song_title,
    title_native: '',
    cover: sourceTitle?.cover || fallbackSongArtwork || '',
    banner: sourceTitle?.banner || fallbackSongArtwork || '',
    synopsis: '',
    // Store in existing serializable fields so they survive battle session serialization:
    role: themeLabel,
    voice_actor_name: song.artist_name || '',
    // Song-specific fields (available in-memory; also preserved in stored sessions):
    song_title: song.song_title,
    artist_name: song.artist_name || '',
    theme_type: song.theme_type,
    theme_sequence: song.theme_sequence || 1,
    theme_label: themeLabel,
    video_url: song.video_url || null,
    trailer_url: song.video_url || null,
    trailer_thumbnail_url: fallbackSongArtwork || null,
    is_creditless: Boolean(song.is_creditless),
    is_spoiler: Boolean(song.is_spoiler),
    is_nsfw: Boolean(song.is_nsfw),
    episodes_text: song.episodes_text || null,
    // Standard catalog fields:
    type: 'theme_song',
    subtype: song.theme_type || 'OP',
    genres: [],
    tags: [],
    moods: [],
    score: null,
    popularity: 0,
    is_adult: Boolean(sourceTitle?.is_adult),
    year: sourceTitle?.year || null,
    sourceTitleId: Number(sourceTitle?.id || 0) || null,
    sourceTitleSlug: sourceTitle?.slug || '',
    sourceTitleName,
  };
}

export function buildCharacterEntity(sourceTitle, character, index = 0) {
  const id = resolveCharacterId(sourceTitle, character, index);
  const sourceTitleName = getCatalogEntityName(sourceTitle);
  const nameFull = normalizeText(character?.name_full) || sourceTitleName || `Character ${id}`;
  const nameNative = normalizeText(character?.name_native);
  const role = normalizeText(character?.role).toUpperCase() || '';
  const slugBase = normalizeSlug(nameFull) || normalizeSlug(nameNative) || `character-${id}`;

  return {
    id,
    slug: `${slugBase}-${id}`,
    entityType: CHARACTER_ENTITY_TYPE,
    type: sourceTitle?.type || 'anime',
    subtype: sourceTitle?.subtype || sourceTitle?.type || 'anime',
    title_en: nameFull,
    title_th: nameFull,
    title_native: nameNative || '',
    cover: character?.image_url || sourceTitle?.cover || '',
    banner: sourceTitle?.banner || '',
    score: sourceTitle?.score ?? null,
    popularity: sourceTitle?.popularity ?? 0,
    is_adult: Boolean(sourceTitle?.is_adult),
    genres: Array.isArray(sourceTitle?.genres) ? sourceTitle.genres : [],
    tags: Array.isArray(sourceTitle?.tags) ? sourceTitle.tags : [],
    moods: Array.isArray(sourceTitle?.moods) ? sourceTitle.moods : [],
    synopsis: sourceTitle?.synopsis || '',
    year: sourceTitle?.year ?? null,
    role,
    voice_actor_name: normalizeText(character?.voice_actor_name),
    voice_actor_image: normalizeText(character?.voice_actor_image),
    sourceTitleId: Number(sourceTitle?.id || 0) || null,
    sourceTitleSlug: sourceTitle?.slug || '',
    sourceTitleName,
  };
}

export function buildCharacterCatalog(titles = []) {
  const entitiesByKey = new Map();

  (Array.isArray(titles) ? titles : []).forEach((title) => {
    (title?.characters || []).forEach((character, index) => {
      const key = buildCharacterKey(title, character, index);
      const nextEntity = buildCharacterEntity(title, character, index);
      const existingEntity = entitiesByKey.get(key);

      if (!existingEntity || shouldReplaceCharacter(existingEntity, nextEntity)) {
        entitiesByKey.set(key, nextEntity);
      }
    });
  });

  return [...entitiesByKey.values()].sort((left, right) => {
    const popularityDelta = Number(right?.popularity || 0) - Number(left?.popularity || 0);
    if (popularityDelta !== 0) {
      return popularityDelta;
    }

    const scoreDelta = Number(right?.score || 0) - Number(left?.score || 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getCatalogEntityName(left).localeCompare(getCatalogEntityName(right));
  });
}

export function getCatalogEntities(titles = [], entityType = TITLE_ENTITY_TYPE) {
  return normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE
    ? buildCharacterCatalog(titles)
    : (Array.isArray(titles) ? titles : []);
}
