import { normalizeTrailer } from '@/shared/lib/trailers';

const CANONICAL_TITLE_LIST_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  origin_country,
  origin_language,
  status,
  release_year,
  format,
  season,
  season_year,
  episodes,
  chapters,
  volumes,
  duration_minutes,
  is_adult,
  cover_image,
  banner_image,
  synopsis,
  avg_score,
  mean_score,
  popularity_score,
  favorites_count,
  hashtag,
  trailer_url,
  trailer_site,
  trailer_video_id,
  trailer_thumbnail_url,
  trailer_source,
  start_date,
  end_date,
  editorial_score,
  created_at,
  updated_at,
  last_synced_at,
  aliases:aliases_cache,
  genres:genres_cache,
  tags:tags_cache,
  moods:moods_cache,
  studios:title_studios(studio_name, is_animation_studio)
`;

const CANONICAL_TITLE_BROWSE_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  status,
  release_year,
  episodes,
  chapters,
  volumes,
  duration_minutes,
  is_adult,
  cover_image,
  banner_image,
  avg_score,
  popularity_score,
  trailer_url,
  trailer_site,
  trailer_video_id,
  trailer_thumbnail_url,
  trailer_source,
  aliases:aliases_cache,
  genres:genres_cache,
  tags:tags_cache,
  moods:moods_cache
`;

const CANONICAL_TITLE_PREVIEW_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  release_year,
  is_adult,
  cover_image,
  banner_image,
  avg_score,
  popularity_score,
  aliases:aliases_cache
`;

// Lightweight select for search autocomplete — excludes trailers, banner,
// heavy metadata that search doesn't need.  Keeps aliases/genres/moods for
// client-side fuzzy matching and display.
const CANONICAL_TITLE_SEARCH_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  release_year,
  is_adult,
  cover_image,
  popularity_score,
  aliases:aliases_cache,
  genres:genres_cache,
  moods:moods_cache
`;

const CANONICAL_TITLE_DETAIL_SELECT = `
  ${CANONICAL_TITLE_LIST_SELECT},
  availability:title_availability(platform_name, region_code, url, is_official),
  source_refs:title_source_refs(provider, external_id, source_priority),
  characters:title_characters(anilist_id, name_full, name_native, image_url, role, voice_actor_name, voice_actor_image, sort_order),
  staff:title_staff(anilist_id, name_full, name_native, image_url, role, sort_order)
`;

const CANONICAL_TITLE_SELECT = CANONICAL_TITLE_DETAIL_SELECT;

function getAlias(record, predicate) {
  return record.aliases?.find(predicate)?.alias || '';
}

function dedupePlatforms(platforms) {
  const seen = new Set();

  return platforms.filter((platform) => {
    const key = [platform.name, platform.url].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickPlatformSearchQuery(record) {
  const localizedTitle = getAlias(record, (alias) => alias.language_code === 'th');
  const englishTitle = getAlias(record, (alias) => alias.alias_type === 'english' || alias.language_code === 'en');

  return localizedTitle || englishTitle || record.canonical_title || '';
}

function buildOfficialFallbackPlatforms(record) {
  const query = pickPlatformSearchQuery(record).trim();
  if (!query) return [];

  let suffix = null;
  if (record.type === 'anime') {
    suffix = ' anime ไทย';
  } else if (record.type === 'manga') {
    suffix = record.subtype === 'manhwa' ? ' manhwa แปลไทย' : ' มังงะ ไทย';
  }

  if (!suffix) return [];

  return [
    {
      name: 'Google',
      region: null,
      url: `https://www.google.com/search?q=${encodeURIComponent(query + suffix)}`,
      isSearchFallback: true,
    },
  ];
}

export function getDisplayType(record) {
  if (record.type === 'manga' && record.subtype === 'manhwa') return 'manhwa';
  return record.type;
}

export function toCanonicalType(displayType) {
  if (displayType === 'manhwa') {
    return { type: 'manga', subtype: 'manhwa' };
  }

  if (displayType === 'manga') {
    return { type: 'manga', subtype: 'manga' };
  }

  return { type: 'anime', subtype: 'anime' };
}

export function mapCanonicalTitle(record) {
  const titleEn =
    getAlias(record, (alias) => alias.alias_type === 'english' || alias.language_code === 'en') ||
    record.canonical_title;
  const titleTh = getAlias(record, (alias) => alias.language_code === 'th');
  const titleRomaji = getAlias(record, (alias) => alias.alias_type === 'romaji');
  const titleNative = getAlias(record, (alias) => alias.alias_type === 'native');
  const aliases = [...new Set(
    (record.aliases || [])
      .map((alias) => alias.alias)
      .filter(Boolean)
      .filter((alias) => ![titleEn, titleTh, titleRomaji, titleNative].includes(alias))
  )];

  const officialPlatforms = record.availability?.filter((item) => item.is_official !== false).map((item) => ({
    name: item.platform_name,
    region: item.region_code,
    url: item.url,
    isSearchFallback: false,
  })) || [];
  const fallbackPlatforms = buildOfficialFallbackPlatforms(record).filter((fallback) => (
    !officialPlatforms.some((platform) => platform.name === fallback.name)
  ));

  const trailer = normalizeTrailer(record);

  return {
    id: record.id,
    slug: record.slug,
    type: getDisplayType(record),
    subtype: record.subtype,
    title_en: titleEn,
    title_th: titleTh,
    title_romaji: titleRomaji,
    title_native: titleNative,
    aliases,
    synopsis: record.synopsis,
    cover: record.cover_image,
    banner: record.banner_image,
    score: record.avg_score ?? null,
    popularity: record.popularity_score ?? 0,
    year: record.release_year,
    episodes: record.episodes,
    chapters: record.chapters,
    volumes: record.volumes,
    duration: record.duration_minutes,
    status: record.status,
    is_adult: record.is_adult,
    origin_country: record.origin_country || null,
    origin_language: record.origin_language || null,
    format: record.format || null,
    season: record.season || null,
    season_year: record.season_year || null,
    mean_score: record.mean_score ?? null,
    favorites_count: record.favorites_count ?? null,
    hashtag: record.hashtag || null,
    trailer_url: record.trailer_url || null,
    trailer_site: trailer?.site || null,
    trailer_video_id: trailer?.videoId || null,
    trailer_thumbnail_url: trailer?.thumbnailUrl || null,
    trailer_source: trailer?.source || null,
    trailer,
    start_date: record.start_date || null,
    end_date: record.end_date || null,
    genres: record.genres?.map((genre) => genre.genre_name) || [],
    tags: record.tags?.map((tag) => tag.tag_name) || [],
    tagDetails: record.tags?.map((tag) => ({ name: tag.tag_name, weight: tag.weight ?? null })) || [],
    moods: record.moods?.map((mood) => mood.mood_id) || [],
    studios: record.studios?.filter((s) => s.is_animation_studio).map((s) => s.studio_name) || [],
    platforms: dedupePlatforms([...officialPlatforms, ...fallbackPlatforms]),
    source_refs: record.source_refs || [],
    characters: (record.characters || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    staff: (record.staff || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  };
}

export function mapCanonicalRecordToAdminForm(record) {
  const title = mapCanonicalTitle(record);

  return {
    title_en: title.title_en,
    title_romaji: title.title_romaji,
    title_native: title.title_native,
    title_th: title.title_th,
    slug: title.slug,
    synopsis: title.synopsis || '',
    type: title.type,
    status: title.status || 'ongoing',
    release_year: title.year || '',
    average_score: title.score ?? '',
    episodes: title.episodes ?? '',
    chapters: title.chapters ?? '',
    volumes: title.volumes ?? '',
    duration_minutes: title.duration ?? '',
    cover_image: title.cover || '',
    banner_image: title.banner || '',
    trailer_url: title.trailer?.url || '',
    trailer_site: title.trailer?.site || '',
    trailer_video_id: title.trailer?.videoId || '',
    trailer_thumbnail_url: title.trailer?.thumbnailUrl || '',
    trailer_source: title.trailer?.source || '',
    popularity: title.popularity ?? 0,
    is_adult: Boolean(title.is_adult),
    origin_country: record.origin_country || '',
    origin_language: record.origin_language || '',
  };
}

export function buildCanonicalPayload(formData) {
  const { type, subtype } = toCanonicalType(formData.type);
  const trailer = normalizeTrailer(formData);

  return {
    canonical_title: formData.title_en?.trim(),
    slug: formData.slug?.trim(),
    type,
    subtype,
    status: formData.status,
    release_year: formData.release_year === '' ? null : Number(formData.release_year),
    episodes: formData.episodes === '' ? null : Number(formData.episodes),
    chapters: formData.chapters === '' ? null : Number(formData.chapters),
    volumes: formData.volumes === '' ? null : Number(formData.volumes),
    duration_minutes: formData.duration_minutes === '' ? null : Number(formData.duration_minutes),
    cover_image: formData.cover_image?.trim() || null,
    banner_image: formData.banner_image?.trim() || null,
    trailer_url: trailer?.url || null,
    trailer_site: trailer?.site || null,
    trailer_video_id: trailer?.videoId || null,
    trailer_thumbnail_url: trailer?.thumbnailUrl || null,
    trailer_source: formData.trailer_source?.trim() || trailer?.source || null,
    synopsis: formData.synopsis?.trim() || null,
    avg_score: formData.average_score === '' ? null : Number(formData.average_score),
    popularity_score: formData.popularity === '' ? null : Number(formData.popularity),
    is_adult: Boolean(formData.is_adult),
    origin_country: formData.origin_country?.trim() || null,
    origin_language: formData.origin_language?.trim() || null,
    last_synced_at: new Date().toISOString(),
  };
}

export function buildAliasRows(titleId, formData, sourceProvider = 'manual') {
  const aliasDefs = [
    {
      alias: formData.title_en?.trim(),
      language_code: 'en',
      alias_type: 'english',
      is_primary: true,
    },
    {
      alias: formData.title_romaji?.trim(),
      language_code: 'ja-Latn',
      alias_type: 'romaji',
      is_primary: false,
    },
    {
      alias: formData.title_native?.trim(),
      language_code: formData.origin_language?.trim() || null,
      alias_type: 'native',
      is_primary: false,
    },
    {
      alias: formData.title_th?.trim(),
      language_code: 'th',
      alias_type: 'localized',
      is_primary: false,
    },
  ];

  return aliasDefs
    .filter((item) => item.alias)
    .map((item) => ({
      canonical_title_id: titleId,
      source_provider: sourceProvider,
      ...item,
    }));
}

export {
  CANONICAL_TITLE_BROWSE_SELECT,
  CANONICAL_TITLE_PREVIEW_SELECT,
  CANONICAL_TITLE_SEARCH_SELECT,
  CANONICAL_TITLE_LIST_SELECT,
  CANONICAL_TITLE_DETAIL_SELECT,
  CANONICAL_TITLE_SELECT,
};
