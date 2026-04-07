import { getAutoDerivableMoods } from '@/shared/data/moods';
import { normalizeTrailer } from '@/shared/lib/trailers';

export function slugify(v) {
  return String(v || '').toLowerCase().trim().normalize('NFKD')
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function mapStatus(s) {
  const n = String(s || '').toUpperCase();
  if (['FINISHED', 'COMPLETED', 'COMPLETE', 'ENDED'].includes(n)) return 'completed';
  if (['NOT_YET_RELEASED', 'TBA', 'UPCOMING', 'UNRELEASED'].includes(n)) return 'upcoming';
  if (['HIATUS', 'ON_HIATUS'].includes(n)) return 'hiatus';
  if (['CANCELLED', 'CANCELED'].includes(n)) return 'cancelled';
  return 'ongoing';
}

function inferSubtype({ mediaType, originCountry, sourceHints = [] }) {
  if (mediaType === 'anime') return { type: 'anime', subtype: 'anime' };
  const hints = sourceHints.join(' ').toLowerCase();
  if (originCountry === 'KR' || hints.includes('manhwa') || hints.includes('webtoon')) {
    return { type: 'manga', subtype: hints.includes('webtoon') ? 'webtoon' : 'manhwa' };
  }
  if (originCountry === 'CN' || hints.includes('manhua')) {
    return { type: 'manga', subtype: 'manhua' };
  }
  return { type: 'manga', subtype: 'manga' };
}

export function deriveMoodIds(parts) {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return getAutoDerivableMoods()
    .filter((mood) => (mood.tags || []).some((tag) => hay.includes(tag.toLowerCase())))
    .map((mood) => mood.id);
}

export function buildAniListTrailerPatch(media) {
  const trailer = normalizeTrailer({
    trailer_url: media?.trailer?.id
      ? media.trailer.site === 'youtube'
        ? `https://www.youtube.com/watch?v=${media.trailer.id}`
        : media.trailer.site === 'dailymotion'
          ? `https://www.dailymotion.com/video/${media.trailer.id}`
          : null
      : null,
    trailer_site: media?.trailer?.site || null,
    trailer_video_id: media?.trailer?.id || null,
    trailer_thumbnail_url: media?.trailer?.thumbnail || null,
    trailer_source: media?.trailer?.id ? 'anilist' : null,
  });

  return {
    trailer_url: trailer?.url || null,
    trailer_site: trailer?.site || null,
    trailer_video_id: trailer?.videoId || null,
    trailer_thumbnail_url: trailer?.thumbnailUrl || null,
    trailer_source: trailer?.source || 'anilist',
  };
}

export function buildResolvedTrailerPatch(trailerInput) {
  const trailer = normalizeTrailer({
    trailer_url: trailerInput?.url || trailerInput?.watchUrl || null,
    trailer_site: trailerInput?.site || trailerInput?.provider || null,
    trailer_video_id: trailerInput?.videoId || null,
    trailer_thumbnail_url: trailerInput?.thumbnailUrl || null,
    trailer_source: trailerInput?.source || null,
  });

  return {
    trailer_url: trailer?.url || null,
    trailer_site: trailer?.site || null,
    trailer_video_id: trailer?.videoId || null,
    trailer_thumbnail_url: trailer?.thumbnailUrl || null,
    trailer_source: trailer?.source || trailerInput?.source || null,
  };
}

export function getMediaDisplayTitle(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || `AniList #${media?.id ?? ''}`;
}

export function normalizeMedia(media) {
  const mediaType = media.type === 'ANIME' ? 'anime' : 'manga';
  const { type, subtype } = inferSubtype({
    mediaType,
    originCountry: media.countryOfOrigin || null,
    sourceHints: [media.format, ...(media.genres || []), ...(media.tags || []).map((t) => t.name)],
  });
  const canonicalTitle = media.title.english || media.title.romaji || media.title.native || `anilist-${media.id}`;
  const slugBase = media.title.english || media.title.romaji || media.title.native || `${type}-${media.id}`;
  const originLanguage = media.countryOfOrigin === 'JP' ? 'ja' : media.countryOfOrigin === 'KR' ? 'ko' : media.countryOfOrigin === 'CN' ? 'zh' : null;
  return {
    anilistId: String(media.id),
    displayTitle: canonicalTitle,
    coverImage: media.coverImage?.large || null,
    canonical: {
      slug: `${slugify(slugBase) || type}-${media.id}`,
      canonical_title: canonicalTitle,
      type,
      subtype,
      origin_country: media.countryOfOrigin || null,
      origin_language: originLanguage,
      status: mapStatus(media.status),
      release_year: media.seasonYear || null,
      episodes: media.episodes || null,
      chapters: media.chapters || null,
      volumes: media.volumes || null,
      duration_minutes: media.duration || null,
      is_adult: Boolean(media.isAdult),
      cover_image: media.coverImage?.extraLarge || media.coverImage?.large || null,
      banner_image: media.bannerImage || null,
      synopsis: media.description || null,
      avg_score: media.averageScore || null,
      ...buildAniListTrailerPatch(media),
      popularity_score: media.popularity || null,
      last_synced_at: new Date().toISOString(),
    },
    aliases: [
      media.title.english && { alias: media.title.english, language_code: 'en', alias_type: 'english', is_primary: true },
      media.title.romaji && { alias: media.title.romaji, language_code: 'ja-Latn', alias_type: 'romaji', is_primary: !media.title.english },
      media.title.native && { alias: media.title.native, language_code: null, alias_type: 'native', is_primary: false },
      ...(media.synonyms || []).filter(Boolean).map((a) => ({ alias: a, language_code: null, alias_type: 'synonym', is_primary: false })),
    ].filter(Boolean),
    genres: (media.genres || []).map((genre_name) => ({ genre_name })),
    tags: (media.tags || []).map((tag) => ({ tag_name: tag.name, weight: tag.rank || null, source_provider: 'anilist' })),
    moodIds: deriveMoodIds([media.description, ...(media.genres || []), ...(media.tags || []).map((t) => t.name)]),
    sourceRef: {
      provider: 'anilist',
      external_id: String(media.id),
      external_url: media.siteUrl || null,
      source_priority: media.type === 'ANIME' ? 10 : subtype === 'manhwa' ? 20 : 10,
      raw_payload: media,
    },
  };
}
