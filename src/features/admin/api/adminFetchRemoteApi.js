import {
  deriveMoodIds,
  mapStatus,
  slugify,
} from './adminFetchNormalization';
import { supabase } from '@/shared/lib/supabase';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

export async function fetchAdminJikanPage(page, jikanCfg, signal) {
  const params = new URLSearchParams({
    type: 'manhwa',
    genres: '49',
    genres_exclude: '28,26',
    limit: String(jikanCfg.perPage),
    page: String(page),
    order_by: jikanCfg.sort,
    sort: 'desc',
  });
  const res = await fetch(`${JIKAN_BASE}/manga?${params}`, { signal });
  if (!res.ok) throw new Error(`Jikan ตอบกลับ ${res.status}`);
  return res.json();
}

function mapJikanStatus(s) {
  if (!s) return 'ongoing';
  const normalized = s.toLowerCase();
  if (normalized.includes('finish')) return 'completed';
  if (normalized.includes('hiatus')) return 'hiatus';
  if (normalized.includes('discontinu') || normalized.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

export function normalizeJikanMangaEntry(item) {
  const title = item.title_english || item.title || `jikan-${item.mal_id}`;
  const slugBase = item.title_english || item.title || `manhwa-${item.mal_id}`;
  const allGenreNames = [
    ...(item.genres || []).map((genre) => genre.name),
    ...(item.themes || []).map((theme) => theme.name),
    ...(item.demographics || []).map((demographic) => demographic.name),
  ];
  const releaseYear = item.published?.from ? new Date(item.published.from).getFullYear() : null;

  return {
    malId: String(item.mal_id),
    displayTitle: title,
    coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-mal-${item.mal_id}`,
      canonical_title: title,
      type: 'manga',
      subtype: 'manhwa',
      origin_country: 'KR',
      origin_language: 'ko',
      status: mapJikanStatus(item.status),
      release_year: releaseYear,
      chapters: item.chapters || null,
      volumes: item.volumes || null,
      episodes: null,
      duration_minutes: null,
      is_adult: true,
      cover_image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
      banner_image: null,
      synopsis: item.synopsis || null,
      avg_score: item.score ? Math.round(item.score * 10) : null,
      popularity_score: item.scored_by || null,
      last_synced_at: new Date().toISOString(),
    },
    aliases: [
      item.title_english && { alias: item.title_english, language_code: 'en', alias_type: 'english', is_primary: true },
      item.title && item.title !== item.title_english && { alias: item.title, language_code: 'ja-Latn', alias_type: 'romaji', is_primary: !item.title_english },
      item.title_japanese && { alias: item.title_japanese, language_code: null, alias_type: 'native', is_primary: false },
    ].filter(Boolean),
    genres: allGenreNames.map((genre_name) => ({ genre_name })),
    tags: allGenreNames.map((tag_name) => ({ tag_name, weight: null, source_provider: 'jikan' })),
    moodIds: deriveMoodIds([item.synopsis, ...allGenreNames]),
    sourceRef: {
      provider: 'jikan',
      external_id: String(item.mal_id),
      external_url: item.url || null,
      source_priority: 20,
    },
  };
}

function normalizePornhwaTag(value) {
  return String(value || '').trim().toLowerCase();
}

export function isBoysLovePornhwaEntry(item) {
  const tags = [item.orientation, ...(item.genreTags || []), ...(item.tags || [])].map(normalizePornhwaTag);
  return tags.some((tag) => ['yaoi', 'boys love', 'boys-love', 'bl', 'shounen ai', 'shonen ai'].includes(tag));
}

export function normalizePornhwaDbEntry(item) {
  const title = item.title || `pornhwadb-${item.id}`;
  const slugBase = item.slug || item.title || `manhwa-${item.id}`;
  const genreTags = [...new Set((item.genreTags || []).filter(Boolean))];
  const allTags = [...new Set([...genreTags, item.orientation || null].filter(Boolean))];
  const averageRating = Number(item.averageRating);
  const normalizedScore = Number.isFinite(averageRating) ? averageRating * 20 : null;

  return {
    pornhwaId: String(item.id),
    displayTitle: title,
    coverImage: item.coverImage || null,
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-pwdb-${item.id}`,
      canonical_title: title,
      type: 'manga',
      subtype: 'manhwa',
      origin_country: 'KR',
      origin_language: 'ko',
      status: mapStatus(item.status),
      release_year: item.releaseYear || null,
      chapters: item.totalChapters || item.chapterCount || null,
      volumes: null,
      episodes: null,
      duration_minutes: null,
      is_adult: true,
      cover_image: item.coverImage || null,
      banner_image: null,
      synopsis: item.description || null,
      avg_score: normalizedScore,
      popularity_score: item.totalRatings || null,
      last_synced_at: new Date().toISOString(),
    },
    aliases: title
      ? [{ alias: title, language_code: 'en', alias_type: 'english', is_primary: true }]
      : [],
    genres: genreTags.map((genre_name) => ({ genre_name })),
    tags: allTags.map((tag_name) => ({ tag_name, weight: null, source_provider: 'pornhwadb' })),
    moodIds: deriveMoodIds([item.description, ...allTags]),
    staff: (item.creators || [])
      .filter((creator) => creator?.canonicalName)
      .map((creator, index) => ({
        name_full: creator.canonicalName,
        role: creator.role || 'creator',
        sort_order: index,
      })),
    sourceRef: {
      provider: 'pornhwadb',
      external_id: String(item.id),
      external_url: null,
      source_priority: 15,
      raw_payload: item,
    },
  };
}

export async function fetchAdminPornhwaDbPage(page, pornhwaCfg, signal) {
  if (!supabase) throw new Error('Supabase unavailable');
  const { data, error } = await supabase.functions.invoke('pornhwadb-proxy', {
    body: {
      apiKey: pornhwaCfg.apiKey || undefined,
      page,
      limit: pornhwaCfg.perPage,
      sort: pornhwaCfg.sort,
      order: 'desc',
      status: pornhwaCfg.status || undefined,
      orientation: pornhwaCfg.orientation || undefined,
      minRatings: pornhwaCfg.minRatings || undefined,
      tags: pornhwaCfg.tags || undefined,
    },
    signal,
  });
  if (error) {
    if (typeof error.context?.json === 'function') {
      try {
        const payload = await error.context.json();
        throw new Error(payload?.error || payload?.message || error.message || 'PornhwaDB fetch failed');
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) {
          throw contextError;
        }
      }
    }
    if (typeof error.context?.text === 'function') {
      try {
        const message = await error.context.text();
        if (message) {
          throw new Error(message);
        }
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) {
          throw contextError;
        }
      }
    }
    throw new Error(error.message || 'PornhwaDB fetch failed');
  }

  return data;
}

export async function resolveAdminTrailerFromFallbackSources({
  aliases = [],
  preferredSearchName = '',
  titleRecord = {},
  searchNames = [],
} = {}) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke('trailer-source-proxy', {
      body: {
        title: titleRecord?.canonical_title || '',
        type: titleRecord?.type || '',
        subtype: titleRecord?.subtype || '',
        releaseYear: titleRecord?.release_year || null,
        searchNames: preferredSearchName ? [preferredSearchName, ...searchNames.filter((value) => value !== preferredSearchName)] : searchNames,
        aliases,
      },
    });

    if (error) {
      throw error;
    }

    return data?.trailer || null;
  } catch (error) {
    console.warn('[AdminFetch] trailer fallback lookup failed:', error);
    return null;
  }
}
