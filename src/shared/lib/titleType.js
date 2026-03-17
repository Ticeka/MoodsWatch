const TITLE_TYPE_META = {
  anime: {
    id: 'anime',
    label: 'Anime',
    labelTh: 'อนิเมะ',
    badgeClass: 'badge-anime',
    unitLabel: 'EP',
    fallbackFormat: 'Anime',
  },
  manga: {
    id: 'manga',
    label: 'Manga',
    labelTh: 'มังงะ',
    badgeClass: 'badge-manga',
    unitLabel: 'CH',
    fallbackFormat: 'Manga',
  },
  manhwa: {
    id: 'manhwa',
    label: 'Manhwa',
    labelTh: 'มันฮวา',
    badgeClass: 'badge-manhwa',
    unitLabel: 'CH',
    fallbackFormat: 'Manhwa',
  },
};

export function getTitleTypeMeta(type, language = 'en') {
  const meta = TITLE_TYPE_META[type] || TITLE_TYPE_META.anime;

  return {
    ...meta,
    displayLabel: language === 'th' ? meta.labelTh : meta.label,
  };
}

export function isEpisodeBasedType(type) {
  return type === 'anime';
}

export function isChapterBasedType(type) {
  return type === 'manga' || type === 'manhwa';
}

export function getTitleFormatBadge(title) {
  const meta = getTitleTypeMeta(title.type);
  const count = isEpisodeBasedType(title.type) ? title.episodes : title.chapters;

  return count ? `${count} ${meta.unitLabel}` : meta.fallbackFormat;
}
