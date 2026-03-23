export const TITLE_ENTITY_TYPE = 'title';
export const CHARACTER_ENTITY_TYPE = 'character';

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
  return value === CHARACTER_ENTITY_TYPE ? CHARACTER_ENTITY_TYPE : TITLE_ENTITY_TYPE;
}

export function isCharacterEntity(entity) {
  return normalizeCatalogEntityType(entity?.entityType) === CHARACTER_ENTITY_TYPE;
}

export function getCatalogEntityName(entity) {
  return entity?.title_th || entity?.title_en || entity?.title_native || 'Unknown';
}

export function getCatalogEntityMeta(entity) {
  if (isCharacterEntity(entity)) {
    return [
      entity?.sourceTitleName,
      CHARACTER_ROLE_LABELS[normalizeText(entity?.role).toUpperCase()] || 'Character',
    ].filter(Boolean).join(' / ');
  }

  return [entity?.type, ...(entity?.genres || []).slice(0, 2)].filter(Boolean).join(' / ');
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
