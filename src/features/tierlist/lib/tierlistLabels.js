import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  getCatalogEntityMeta,
  getCatalogEntityName,
  isCharacterEntity,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';

export function humanizeTierToken(value = '') {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getMediaTypeLabel(type, pick) {
  const normalized = String(type || '').toLowerCase();
  const labels = {
    all: pick('ทุกประเภท', 'All Types'),
    anime: pick('อนิเมะ', 'Anime'),
    manga: pick('มังงะ', 'Manga'),
    manhwa: pick('มันฮวา', 'Manhwa'),
  };

  return labels[normalized] || humanizeTierToken(type);
}

export function getEntityTypeLabel(entityType, pick) {
  const normalized = normalizeCatalogEntityType(entityType);
  const labels = {
    [TITLE_ENTITY_TYPE]: pick('เรื่อง', 'Titles'),
    [CHARACTER_ENTITY_TYPE]: pick('ตัวละคร', 'Characters'),
    [THEME_SONG_ENTITY_TYPE]: pick('เพลงประกอบ', 'Theme Songs'),
  };

  return labels[normalized] || pick('เรื่อง', 'Titles');
}

export function getCreateSortLabel(sortValue, pick) {
  const labels = {
    popularity: pick('ยอดนิยม', 'Popular'),
    score: pick('คะแนน', 'Score'),
    year: pick('ใหม่สุด', 'Newest'),
    title: pick('ก-ฮ', 'A-Z'),
  };

  return labels[sortValue] || humanizeTierToken(sortValue);
}

export function getTierCategoryLabel(category, pick) {
  const normalized = String(category || '').toLowerCase();
  const labels = {
    anime: pick('อนิเมะ', 'Anime'),
    manga: pick('มังงะ', 'Manga'),
    manhwa: pick('มันฮวา', 'Manhwa'),
    romance: pick('โรแมนซ์', 'Romance'),
    action: pick('แอ็กชัน', 'Action'),
    comedy: pick('คอเมดี้', 'Comedy'),
    fantasy: pick('แฟนตาซี', 'Fantasy'),
    drama: pick('ดราม่า', 'Drama'),
    characters: pick('ตัวละคร', 'Characters'),
    songs: pick('เพลง', 'Songs'),
  };

  return labels[normalized] || humanizeTierToken(category);
}

export function getTierRowFallbackLabel(index, pick) {
  return pick(`ชั้น ${index + 1}`, `Tier ${index + 1}`);
}

export function getOwnerDisplayName(ownerName, ownerUsername, pick) {
  if (!ownerUsername && ownerName === 'You') {
    return pick('คุณ', 'You');
  }

  return ownerName || ownerUsername || pick('ผู้ใช้', 'User');
}

export function getDisplayName(title) {
  if (title?.isCustomTierItem) {
    return title.title || title.title_en || title.title_th || 'Custom item';
  }

  return getCatalogEntityName(title);
}

export function getMetaLine(title) {
  if (title?.isCustomTierItem) {
    return title.subtitle || title.sourceTitleName || '';
  }

  return getCatalogEntityMeta(title);
}

export function getThemeSongSummary(song) {
  return [
    song?.theme_label || song?.role,
    song?.artist_name,
    song?.episodes_text,
  ].filter(Boolean);
}

export function getTemplateExplorerSummary(template, pick) {
  const entityLabel = getEntityTypeLabel(template?.entityType, pick);
  const categoryLabel = template?.category ? getTierCategoryLabel(template.category, pick) : pick('ทั่วไป', 'General');
  const rowCount = Array.isArray(template?.defaultRows) ? template.defaultRows.length : 0;
  const plays = Number(template?.plays || 0);
  const playsLabel = pick(`${plays} ครั้งเล่น`, `${plays} plays`);

  return {
    categoryLabel,
    statLine: [
      entityLabel,
      rowCount > 0 ? pick(`${rowCount} tier`, `${rowCount} tiers`) : '',
      plays > 0 ? playsLabel : '',
    ].filter(Boolean).join(' • '),
    playsLabel,
  };
}

export function getEntityModeSummary(entityType, pick) {
  if (normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE) {
    return {
      title: pick('จัด Tier จากตัวละคร', 'Build a character tier'),
      description: pick('ค้นหาจากชื่อเรื่องต้นทาง แล้วค่อยกรองชื่อตัวละครให้ละเอียดต่อได้', 'Browse by source title first, then refine by character name.'),
    };
  }

  if (normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE) {
    return {
      title: pick('จัด Tier จากเพลง OP/ED', 'Build a theme-song tier'),
      description: pick('เลือกเรื่องก่อน แล้วคัดเฉพาะเพลงที่อยากหยิบมาเทียบกัน', 'Choose a title first, then pick the OP/ED tracks you want to compare.'),
    };
  }

  return {
    title: pick('จัด Tier จากชื่อเรื่อง', 'Build a title tier'),
    description: pick('คัดรายการจากแคตตาล็อกด้วยตัวกรองละเอียด แล้วเริ่มเล่นได้ทันที', 'Use richer catalog filters to curate the exact set you want before playing.'),
  };
}

export function getCatalogTypeChipLabel(entity, pick) {
  if (isThemeSongEntity(entity)) {
    return pick('เพลง', 'Song');
  }

  if (entity?.subtype === 'manhwa' || entity?.type === 'manhwa') {
    return getMediaTypeLabel('manhwa', pick);
  }

  if (entity?.type === 'manga') {
    return getMediaTypeLabel('manga', pick);
  }

  if (isCharacterEntity(entity)) {
    return pick('ตัวละคร', 'Character');
  }

  return getMediaTypeLabel('anime', pick);
}

export function getStatusLabel(status, pick) {
  const normalized = String(status || '').toLowerCase();
  const labels = {
    all: pick('ทุกสถานะ', 'All status'),
    ongoing: pick('กำลังฉาย/อัปเดต', 'Ongoing'),
    completed: pick('จบแล้ว', 'Completed'),
    upcoming: pick('กำลังมา', 'Upcoming'),
    hiatus: pick('พักชั่วคราว', 'Hiatus'),
    cancelled: pick('ยกเลิก', 'Cancelled'),
  };

  return labels[normalized] || status || pick('ไม่ระบุ', 'Unknown');
}

export function matchesStatusFilter(entity, statusFilter) {
  if (!statusFilter || statusFilter === 'all') {
    return true;
  }

  return String(entity?.status || '').toLowerCase() === String(statusFilter).toLowerCase();
}

export function matchesCharacterName(entity, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    entity?.title_en,
    entity?.title_th,
    entity?.title_native,
    entity?.sourceTitleName,
    entity?.voice_actor_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function matchesSongQuery(entity, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    entity?.song_title,
    entity?.artist_name,
    entity?.theme_label,
    entity?.episodes_text,
    entity?.sourceTitleName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}
