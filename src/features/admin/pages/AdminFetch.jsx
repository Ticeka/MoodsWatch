import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Download, Play, Square, RefreshCw,
  CheckCircle2, XCircle, SkipForward, Info,
  TrendingUp, Star, Flame, Clock, CalendarDays, Hash, Users, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
import { getAutoDerivableMoods } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { normalizeTrailer } from '@/shared/lib/trailers';

// ─── Utilities ───────────────────────────────────────────────────────────────

function slugify(v) {
  return String(v || '').toLowerCase().trim().normalize('NFKD')
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}
function mapStatus(s) {
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
  if (originCountry === 'KR' || hints.includes('manhwa') || hints.includes('webtoon'))
    return { type: 'manga', subtype: hints.includes('webtoon') ? 'webtoon' : 'manhwa' };
  if (originCountry === 'CN' || hints.includes('manhua'))
    return { type: 'manga', subtype: 'manhua' };
  return { type: 'manga', subtype: 'manga' };
}
function deriveMoodIds(parts) {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return getAutoDerivableMoods()
    .filter((mood) => (mood.tags || []).some((tag) => hay.includes(tag.toLowerCase())))
    .map((mood) => mood.id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAniListTrailerPatch(media) {
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

function buildResolvedTrailerPatch(trailerInput) {
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

function getMediaDisplayTitle(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || `AniList #${media?.id ?? ''}`;
}

function normalizeMedia(media) {
  const mediaType = media.type === 'ANIME' ? 'anime' : 'manga';
  const { type, subtype } = inferSubtype({
    mediaType, originCountry: media.countryOfOrigin || null,
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
      canonical_title: canonicalTitle, type, subtype,
      origin_country: media.countryOfOrigin || null, origin_language: originLanguage,
      status: mapStatus(media.status), release_year: media.seasonYear || null,
      episodes: media.episodes || null, chapters: media.chapters || null,
      volumes: media.volumes || null, duration_minutes: media.duration || null,
      is_adult: Boolean(media.isAdult),
      cover_image: media.coverImage?.extraLarge || media.coverImage?.large || null,
      banner_image: media.bannerImage || null,
      synopsis: media.description || null, avg_score: media.averageScore || null,
      ...buildAniListTrailerPatch(media),
      popularity_score: media.popularity || null, last_synced_at: new Date().toISOString(),
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
      provider: 'anilist', external_id: String(media.id), external_url: media.siteUrl || null,
      source_priority: media.type === 'ANIME' ? 10 : subtype === 'manhwa' ? 20 : 10,
      raw_payload: media,
    },
  };
}

// ─── AniList ─────────────────────────────────────────────────────────────────

const ANILIST_URL = import.meta.env.DEV ? '/anilist-gql' : 'https://graphql.anilist.co';
const GQL = `query($page:Int!$perPage:Int!$type:MediaType!$sort:[MediaSort!]$formatIn:[MediaFormat!]$status:MediaStatus$countryOfOrigin:CountryCode$averageScoreGreater:Int$popularityGreater:Int){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}media(type:$type,sort:$sort,isAdult:false,format_in:$formatIn,status:$status,countryOfOrigin:$countryOfOrigin,averageScore_greater:$averageScoreGreater,popularity_greater:$popularityGreater){id type format status seasonYear episodes duration chapters volumes countryOfOrigin isAdult popularity averageScore description(asHtml:false)siteUrl title{romaji english native}synonyms coverImage{extraLarge large}bannerImage genres tags{name rank} trailer{id site thumbnail}}}}`;
const ANILIST_TRAILER_GQL = `query($id:Int!){Media(id:$id){id type siteUrl title{romaji english native} trailer{id site thumbnail}}}`;
const ANILIST_TRAILER_SEARCH_GQL = `query($search:String!$type:MediaType){Page(page:1,perPage:5){media(search:$search,type:$type,isAdult:false){id type siteUrl title{romaji english native} trailer{id site thumbnail}}}}`;

async function fetchAniListGraphQL(query, variables, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function fetchAniListPage(vars, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: GQL, variables: vars }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ตอบกลับ ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data.Page;
}

// ─── AniList characters & staff query ────────────────────────────────────────

const CHAR_STAFF_GQL = `query($id:Int!){Media(id:$id){characters(sort:[ROLE,RELEVANCE],perPage:25){edges{role node{id name{full native}image{medium}}voiceActors(language:JAPANESE){id name{full native}image{medium}}}}staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full native}image{medium}}}}}}`;

async function fetchAniListCharStaff(anilistId, signal) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: CHAR_STAFF_GQL, variables: { id: anilistId } }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data?.Media || null;
}

async function fetchAniListTrailerById(anilistId, signal) {
  const data = await fetchAniListGraphQL(ANILIST_TRAILER_GQL, { id: anilistId }, signal);
  return data?.Media || null;
}

async function searchAniListTrailerByName(search, type, signal) {
  const data = await fetchAniListGraphQL(ANILIST_TRAILER_SEARCH_GQL, { search, type }, signal);
  return data?.Page?.media || [];
}

async function resolveTrailerFromFallbackSources(titleRecord, preferredSearchName = '') {
  if (!supabase) return null;

  try {
    const searchNames = buildPreferredTitleSearchNames(
      titleRecord,
      preferredSearchName ? [preferredSearchName] : []
    );

    const { data, error } = await supabase.functions.invoke('trailer-source-proxy', {
      body: {
        title: titleRecord?.canonical_title || '',
        type: titleRecord?.type || '',
        subtype: titleRecord?.subtype || '',
        releaseYear: titleRecord?.release_year || null,
        searchNames,
        aliases: getOrderedAliasValues(titleRecord),
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

// ─── Jikan (MyAnimeList) ──────────────────────────────────────────────────────

const JIKAN_BASE = 'https://api.jikan.moe/v4';
// Genre IDs: Erotica=49, exclude Yaoi=28, Shounen Ai=26

function mapJikanStatus(s) {
  if (!s) return 'ongoing';
  const u = s.toLowerCase();
  if (u.includes('finish')) return 'completed';
  if (u.includes('hiatus')) return 'hiatus';
  if (u.includes('discontinu') || u.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

function normalizeJikanManga(item) {
  const title = item.title_english || item.title || `jikan-${item.mal_id}`;
  const slugBase = item.title_english || item.title || `manhwa-${item.mal_id}`;
  const allGenreNames = [
    ...(item.genres || []).map((g) => g.name),
    ...(item.themes || []).map((th) => th.name),
    ...(item.demographics || []).map((d) => d.name),
  ];
  const releaseYear = item.published?.from ? new Date(item.published.from).getFullYear() : null;
  return {
    malId: String(item.mal_id),
    displayTitle: title,
    coverImage: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    canonical: {
      slug: `${slugify(slugBase) || 'manhwa'}-mal-${item.mal_id}`,
      canonical_title: title,
      type: 'manga', subtype: 'manhwa',
      origin_country: 'KR', origin_language: 'ko',
      status: mapJikanStatus(item.status),
      release_year: releaseYear,
      chapters: item.chapters || null, volumes: item.volumes || null,
      episodes: null, duration_minutes: null,
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
      provider: 'jikan', external_id: String(item.mal_id),
      external_url: item.url || null, source_priority: 20,
    },
  };
}

async function fetchJikanPage(page, jikanCfg, signal) {
  const params = new URLSearchParams({
    type: 'manhwa', genres: '49',
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

function normalizePornhwaTag(value) {
  return String(value || '').trim().toLowerCase();
}

function isBoysLovePornhwa(item) {
  const tags = [item.orientation, ...(item.genreTags || []), ...(item.tags || [])].map(normalizePornhwaTag);
  return tags.some((tag) => ['yaoi', 'boys love', 'boys-love', 'bl', 'shounen ai', 'shonen ai'].includes(tag));
}

function normalizePornhwaDbEntry(item) {
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
      .filter((c) => c?.canonicalName)
      .map((c, i) => ({
        name_full: c.canonicalName,
        role: c.role || 'creator',
        sort_order: i,
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

async function fetchPornhwaDbPage(page, pornhwaCfg, signal) {
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

function hasPornhwaDbNextPage(pageData, page, perPage) {
  const pagination = pageData?.pagination || {};
  if (typeof pagination.hasNextPage === 'boolean') return pagination.hasNextPage;
  if (typeof pagination.has_next_page === 'boolean') return pagination.has_next_page;

  const totalPages = Number(pagination.totalPages || pagination.total_pages || 0);
  if (totalPages > 0) return page < totalPages;

  const total = Number(pagination.total || pagination.totalItems || pagination.total_items || 0);
  if (total > 0) return page * perPage < total;

  return Array.isArray(pageData?.data) && pageData.data.length >= perPage;
}

const ANIMETHEMES_BASE = 'https://api.animethemes.moe';
const ANIMETHEMES_INCLUDE = 'resources,animethemes.song,animethemes.animethemeentries.videos';
const THEME_SOURCE_PRIORITY = { BD: 4, WEB: 3, DVD: 2, RAW: 1 };
const ALIAS_TYPE_PRIORITY = { romaji: 0, english: 1, native: 2, synonym: 3, localized: 4, alternate: 5, canonical: 6 };

function normalizeLooseText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getSourceRefId(sourceRefs, provider) {
  const ref = (sourceRefs || []).find((entry) => entry.provider === provider);
  return ref?.external_id ? String(ref.external_id) : '';
}

function getOrderedAliasValues(titleRecord) {
  return [...(titleRecord?.aliases || [])]
    .sort((a, b) => {
      const rankA = ALIAS_TYPE_PRIORITY[a.alias_type] ?? 99;
      const rankB = ALIAS_TYPE_PRIORITY[b.alias_type] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return String(a.alias || '').length - String(b.alias || '').length;
    })
    .map((entry) => entry.alias);
}

function collectUniqueTitleValues(values = []) {
  const seen = new Set();
  return values
    .filter((value) => String(value || '').trim())
    .filter((value) => {
      const key = normalizeLooseText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTitleLookupValues(titleRecord, extraValues = []) {
  return collectUniqueTitleValues([
    ...extraValues,
    titleRecord?.canonical_title,
    titleRecord?.slug,
    ...getOrderedAliasValues(titleRecord),
  ]);
}

function buildPreferredTitleSearchNames(titleRecord, extraNames = []) {
  return collectUniqueTitleValues([
    ...extraNames,
    titleRecord?.canonical_title,
    ...getOrderedAliasValues(titleRecord),
  ]).slice(0, 5);
}

function matchesTrailerTitleQuery(titleRecord, query) {
  const normalizedQuery = normalizeLooseText(query);
  if (!normalizedQuery) return true;

  return buildTitleLookupValues(titleRecord).some((value) => (
    normalizeLooseText(value).includes(normalizedQuery)
  ));
}

function mapTitleRecordToAniListMediaType(titleRecord) {
  return String(titleRecord?.type || '').toLowerCase() === 'anime' ? 'ANIME' : 'MANGA';
}

function buildAniListMediaCandidateNames(media) {
  return collectUniqueTitleValues([
    getMediaDisplayTitle(media),
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
  ]);
}

function selectAniListTrailerCandidate(mediaList, searchNames = []) {
  const normalizedCandidates = new Set(
    (searchNames || []).map((value) => normalizeLooseText(value)).filter(Boolean)
  );
  const isExactMatch = (media) => buildAniListMediaCandidateNames(media)
    .some((value) => normalizedCandidates.has(normalizeLooseText(value)));

  return mediaList.find((media) => media?.trailer?.id && isExactMatch(media))
    || mediaList.find((media) => media?.trailer?.id)
    || mediaList.find((media) => isExactMatch(media))
    || mediaList[0]
    || null;
}

async function resolveAniListTrailerBySearch(titleRecord, signal, preferredSearchName = '') {
  const searchNames = buildPreferredTitleSearchNames(
    titleRecord,
    preferredSearchName ? [preferredSearchName] : []
  );

  if (!searchNames.length) {
    return { media: null, searchName: null };
  }

  const mediaType = mapTitleRecordToAniListMediaType(titleRecord);
  let fallback = null;

  for (const searchName of searchNames) {
    const mediaList = await searchAniListTrailerByName(searchName, mediaType, signal);
    const media = selectAniListTrailerCandidate(mediaList, searchNames);

    if (media?.trailer?.id) {
      return { media, searchName };
    }

    if (!fallback && media) {
      fallback = { media, searchName };
    }
  }

  return fallback || { media: null, searchName: null };
}

function getThemeType(rawType) {
  if (rawType === 'OP') return 'OP';
  if (rawType === 'ED') return 'ED';
  if (rawType === 'IN') return 'INSERT';
  return 'OTHER';
}

function pickPreferredThemeVideo(videos) {
  return [...(videos || [])].sort((left, right) => {
    if (Boolean(left?.nc) !== Boolean(right?.nc)) return Number(Boolean(right?.nc)) - Number(Boolean(left?.nc));
    const resolutionDiff = Number(right?.resolution || 0) - Number(left?.resolution || 0);
    if (resolutionDiff !== 0) return resolutionDiff;
    const sourceDiff = (THEME_SOURCE_PRIORITY[right?.source] || 0) - (THEME_SOURCE_PRIORITY[left?.source] || 0);
    if (sourceDiff !== 0) return sourceDiff;
    return Number(right?.id || 0) - Number(left?.id || 0);
  })[0] || null;
}

async function fetchAnimeThemesByName(name, signal) {
  const params = new URLSearchParams();
  params.set('filter[name]', name);
  params.set('include', ANIMETHEMES_INCLUDE);
  const res = await fetch(`${ANIMETHEMES_BASE}/anime?${params.toString()}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  if (!res.ok) throw new Error(`AnimeThemes ${res.status}`);
  const json = await res.json();
  return json?.anime || [];
}

function selectAnimeThemesMatch(candidates, titleRecord, queryName) {
  const anilistId = getSourceRefId(titleRecord?.source_refs, 'anilist');
  const malId = getSourceRefId(titleRecord?.source_refs, 'jikan');
  const queryNorm = normalizeLooseText(queryName);
  const searchNames = new Set(buildPreferredTitleSearchNames(titleRecord).map(normalizeLooseText));

  let best = null;

  for (const candidate of candidates || []) {
    const resources = candidate?.resources || [];
    const candidateNorm = normalizeLooseText(candidate?.name);
    const matchedAniList = Boolean(
      anilistId && resources.some((resource) => resource?.site === 'AniList' && String(resource?.external_id || '') === anilistId)
    );
    const matchedMal = Boolean(
      malId && resources.some((resource) => resource?.site === 'MyAnimeList' && String(resource?.external_id || '') === malId)
    );
    const matchedAlias = Boolean(candidateNorm && searchNames.has(candidateNorm));
    const matchedQuery = Boolean(candidateNorm && candidateNorm === queryNorm);
    const matchedYear = Boolean(titleRecord?.release_year && candidate?.year && Number(candidate.year) === Number(titleRecord.release_year));

    const score = (matchedAniList ? 1000 : 0)
      + (matchedMal ? 900 : 0)
      + (matchedAlias ? 120 : 0)
      + (matchedQuery ? 25 : 0)
      + (matchedYear ? 10 : 0);

    if (!best || score > best.score) {
      best = {
        score,
        queryName,
        candidate,
        matchedBy: matchedAniList
          ? 'anilist'
          : matchedMal
            ? 'mal'
            : matchedAlias
              ? 'alias'
              : matchedQuery
                ? 'query'
                : matchedYear
                  ? 'year'
                  : 'candidate',
      };
    }
  }

  if (!best) return null;
  if (best.score >= 900) return best;
  if (best.score >= 120) return best;
  return null;
}

async function resolveAnimeThemesMatch(titleRecord, signal) {
  const searchNames = buildPreferredTitleSearchNames(titleRecord);
  let best = null;

  for (const name of searchNames) {
    const candidates = await fetchAnimeThemesByName(name, signal);
    const matched = selectAnimeThemesMatch(candidates, titleRecord, name);
    if (matched?.score >= 900) return matched;
    if (!best || (matched && matched.score > best.score)) best = matched;
  }

  return best;
}

function buildThemeSongRows(titleId, matched) {
  const anime = matched?.candidate;
  let order = 0;

  return (anime?.animethemes || [])
    .filter((theme) => ['OP', 'ED'].includes(theme?.type))
    .flatMap((theme) => {
      const entries = theme?.animethemeentries?.length ? theme.animethemeentries : [null];
      return entries.map((entry) => {
        const video = pickPreferredThemeVideo(entry?.videos || []);
        const themeType = getThemeType(theme?.type);
        order += 1;
        return {
          canonical_title_id: titleId,
          source_provider: 'animethemes',
          theme_key: `${anime?.id || 'anime'}:${theme?.id || 'theme'}:${entry?.id || 'entry'}:${video?.id || 'novideo'}`,
          source_anime_id: anime?.id ? String(anime.id) : null,
          source_theme_id: theme?.id ? String(theme.id) : null,
          source_song_id: theme?.song?.id ? String(theme.song.id) : null,
          source_entry_id: entry?.id ? String(entry.id) : null,
          source_video_id: video?.id ? String(video.id) : null,
          theme_slug: theme?.slug || null,
          theme_type: themeType,
          theme_sequence: Number.isFinite(Number(theme?.sequence)) ? Number(theme.sequence) : null,
          entry_version: Number.isFinite(Number(entry?.version)) ? Number(entry.version) : null,
          display_order: order,
          song_title: theme?.song?.title || theme?.slug || `${themeType}${theme?.sequence || ''}`,
          artist_name: Array.isArray(theme?.song?.artists) && theme.song.artists.length
            ? theme.song.artists.map((artist) => artist?.name).filter(Boolean).join(', ')
            : null,
          episodes_text: entry?.episodes || null,
          notes: entry?.notes || null,
          video_url: video?.link || null,
          video_resolution: Number.isFinite(Number(video?.resolution)) ? Number(video.resolution) : null,
          video_source: video?.source || null,
          is_creditless: Boolean(video?.nc),
          is_nsfw: Boolean(entry?.nsfw),
          is_spoiler: Boolean(entry?.spoiler),
          is_subbed: Boolean(video?.subbed),
          metadata: {
            matched_query: matched?.queryName || null,
            matched_by: matched?.matchedBy || null,
            anime_name: anime?.name || null,
            anime_slug: anime?.slug || null,
            video_filename: video?.filename || null,
            video_tags: video?.tags || null,
          },
          fetched_at: new Date().toISOString(),
        };
      });
    });
}

async function replaceTitleThemeSongs(titleId, matched) {
  const rows = buildThemeSongRows(titleId, matched);
  const { error: deleteError } = await supabase.from('title_theme_songs').delete().eq('canonical_title_id', titleId);
  if (deleteError) throw deleteError;

  if (rows.length) {
    const { error: insertError } = await supabase.from('title_theme_songs').insert(rows);
    if (insertError) throw insertError;
  }

  const { error: titleError } = await supabase
    .from('canonical_titles')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', titleId);
  if (titleError) throw titleError;

  return {
    rows: rows.length,
    themes: (matched?.candidate?.animethemes || []).filter((theme) => ['OP', 'ED'].includes(theme?.type)).length,
  };
}

// ─── Supabase upsert ─────────────────────────────────────────────────────────

async function upsertTitle(norm, skipDuplicates) {
  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'anilist').eq('external_id', norm.anilistId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'anilist', ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) { const { error: insErr } = await supabase.from(table).insert(rows); if (insErr) throw insErr; }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;
  return wasExisting ? 'updated' : 'imported';
}

async function upsertCharStaff(titleId, media) {
  const { error: delCharErr } = await supabase.from('title_characters').delete().eq('canonical_title_id', titleId);
  if (delCharErr) throw delCharErr;
  const { error: delStaffErr } = await supabase.from('title_staff').delete().eq('canonical_title_id', titleId);
  if (delStaffErr) throw delStaffErr;

  const chars = (media?.characters?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    voice_actor_name: edge.voiceActors?.[0]?.name?.full ?? null,
    voice_actor_image: edge.voiceActors?.[0]?.image?.medium ?? null,
    sort_order: i,
  }));

  const staff = (media?.staff?.edges || []).map((edge, i) => ({
    canonical_title_id: titleId,
    anilist_id: edge.node?.id ?? null,
    name_full: edge.node?.name?.full ?? null,
    name_native: edge.node?.name?.native ?? null,
    image_url: edge.node?.image?.medium ?? null,
    role: edge.role ?? null,
    sort_order: i,
  }));

  if (chars.length) { const { error } = await supabase.from('title_characters').insert(chars); if (error) throw error; }
  if (staff.length) { const { error } = await supabase.from('title_staff').insert(staff); if (error) throw error; }
  return { chars: chars.length, staff: staff.length };
}

async function upsertJikanTitle(norm, skipDuplicates) {
  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'jikan').eq('external_id', norm.malId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'jikan', ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) { const { error: insErr } = await supabase.from(table).insert(rows); if (insErr) throw insErr; }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;
  return wasExisting ? 'updated' : 'imported';
}

async function fetchPornhwaDbCharactersViaProxy(slug, apiKey, signal) {
  if (!supabase) throw new Error('Supabase unavailable');
  const { data, error } = await supabase.functions.invoke('pornhwadb-proxy', {
    body: { path: 'title-characters', slug, apiKey: apiKey || undefined },
    signal,
  });
  if (error) {
    if (typeof error.context?.json === 'function') {
      try {
        const payload = await error.context.json();
        throw new Error(payload?.error || payload?.message || error.message || 'PornhwaDB characters fetch failed');
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) throw contextError;
      }
    }
    if (typeof error.context?.text === 'function') {
      try {
        const message = await error.context.text();
        if (message) throw new Error(message);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message) throw contextError;
      }
    }
    throw new Error(error.message || 'PornhwaDB characters fetch failed');
  }
  return data;
}

async function upsertPornhwaDbCharacters(titleId, characters) {
  const { error: delErr } = await supabase.from('title_characters').delete().eq('canonical_title_id', titleId);
  if (delErr) throw delErr;
  const rows = (characters || []).map((char, i) => ({
    canonical_title_id: titleId,
    anilist_id: null,
    name_full: char.name || null,
    name_native: (char.alternativeNames || []).find((n) => /[가-힣]/.test(n)) || null,
    image_url: char.image || null,
    role: char.role ? char.role.toUpperCase() : null,
    sort_order: i,
  }));
  if (rows.length) {
    const { error } = await supabase.from('title_characters').insert(rows);
    if (error) throw error;
  }
  return rows.length;
}

async function upsertPornhwaDbTitle(norm, skipDuplicates) {
  const { data: existingRef } = await supabase.from('title_source_refs').select('canonical_title_id')
    .eq('provider', 'pornhwadb').eq('external_id', norm.pornhwaId).maybeSingle();
  if (existingRef?.canonical_title_id && skipDuplicates) return 'skipped';

  let titleId = existingRef?.canonical_title_id || null;
  const wasExisting = !!titleId;

  if (!titleId) {
    const { data: bySlug } = await supabase.from('canonical_titles').select('id').eq('slug', norm.canonical.slug).maybeSingle();
    if (bySlug?.id && skipDuplicates) return 'skipped';
    titleId = bySlug?.id || null;
  }

  if (titleId) {
    const { error } = await supabase.from('canonical_titles').update(norm.canonical).eq('id', titleId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('canonical_titles').upsert(norm.canonical, { onConflict: 'slug' }).select('id').single();
    if (error) throw error;
    titleId = data.id;
  }

  for (const { table, rows } of [
    { table: 'title_aliases', rows: norm.aliases.map((a) => ({ canonical_title_id: titleId, source_provider: 'pornhwadb', ...a })) },
    { table: 'title_genres', rows: norm.genres.map((g) => ({ canonical_title_id: titleId, ...g })) },
    { table: 'title_tags', rows: norm.tags.map((t) => ({ canonical_title_id: titleId, ...t })) },
    { table: 'title_moods', rows: norm.moodIds.map((mood_id) => ({ canonical_title_id: titleId, mood_id })) },
    { table: 'title_staff', rows: (norm.staff || []).map((s) => ({ canonical_title_id: titleId, ...s })) },
  ]) {
    const { error: delErr } = await supabase.from(table).delete().eq('canonical_title_id', titleId);
    if (delErr) throw delErr;
    if (rows.length) { const { error: insErr } = await supabase.from(table).insert(rows); if (insErr) throw insErr; }
  }

  const { error: refErr } = await supabase.from('title_source_refs').upsert(
    { canonical_title_id: titleId, ...norm.sourceRef, last_synced_at: new Date().toISOString(), fetched_at: new Date().toISOString() },
    { onConflict: 'provider,external_id' },
  );
  if (refErr && refErr.code !== 'PGRST205') throw refErr;
  return wasExisting ? 'updated' : 'imported';
}

// ─── Config options ───────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'POPULARITY_DESC', labelKey: 'admin.fetch.sortPopularity', icon: TrendingUp },
  { value: 'SCORE_DESC', labelKey: 'admin.fetch.sortScore', icon: Star },
  { value: 'TRENDING_DESC', labelKey: 'admin.fetch.sortTrending', icon: Flame },
  { value: 'UPDATED_AT_DESC', labelKey: 'admin.fetch.sortUpdated', icon: Clock },
  { value: 'START_DATE_DESC', labelKey: 'admin.fetch.sortStartDate', icon: CalendarDays },
  { value: 'ID_DESC', labelKey: 'admin.fetch.sortIdDesc', icon: Hash },
];

const ANIME_FORMATS = [
  { value: '', labelKey: 'admin.fetch.formatAll' },
  { value: 'TV', labelKey: 'admin.fetch.formatTv' },
  { value: 'MOVIE', labelKey: 'admin.fetch.formatMovie' },
  { value: 'OVA', labelKey: 'admin.fetch.formatOva' },
  { value: 'ONA', labelKey: 'admin.fetch.formatOna' },
  { value: 'SPECIAL', labelKey: 'admin.fetch.formatSpecial' },
];

const MANGA_SUBTYPES = [
  { value: '', labelKey: 'admin.fetch.subtypeAll', country: '', format: '' },
  { value: 'JP', labelKey: 'admin.fetch.subtypeMangaJp', country: 'JP', format: '' },
  { value: 'KR', labelKey: 'admin.fetch.subtypeManhwaKr', country: 'KR', format: '' },
  { value: 'CN', labelKey: 'admin.fetch.subtypeManhuaCn', country: 'CN', format: '' },
  { value: 'NOVEL', labelKey: 'admin.fetch.subtypeNovel', country: '', format: 'NOVEL' },
  { value: 'ONE_SHOT', labelKey: 'admin.fetch.subtypeOneShot', country: '', format: 'ONE_SHOT' },
];

const STATUS_OPTIONS = [
  { value: '', labelKey: 'admin.fetch.statusAll' },
  { value: 'RELEASING', labelKey: 'admin.fetch.statusReleasing' },
  { value: 'FINISHED', labelKey: 'admin.fetch.statusFinished' },
  { value: 'NOT_YET_RELEASED', labelKey: 'admin.fetch.statusNotYetReleased' },
  { value: 'HIATUS', labelKey: 'admin.fetch.statusHiatus' },
  { value: 'CANCELLED', labelKey: 'admin.fetch.statusCancelled' },
];

function matchesTrailerCategory(titleRecord, category) {
  if (category === 'all') return true;

  const subtype = String(titleRecord?.subtype || '').toLowerCase();
  const type = String(titleRecord?.type || '').toLowerCase();

  if (category === 'anime') {
    return subtype === 'anime' || type === 'anime';
  }

  if (category === 'manga') {
    return subtype === 'manga' || (type === 'manga' && !subtype);
  }

  return subtype === category;
}

const LOG_ICON = {
  imported: <CheckCircle2 size={12} />,
  updated: <RefreshCw size={12} />,
  skipped: <SkipForward size={12} />,
  error: <XCircle size={12} />,
  info: <Info size={12} />,
  success: <CheckCircle2 size={12} />,
};
const LOG_COLOR = {
  imported: '#16a34a', updated: '#2563eb', skipped: '#9ca3af',
  error: '#dc2626', info: 'var(--text-tertiary)', success: '#16a34a',
};

// ─── Small reusable chip button ───────────────────────────────────────────────
function Chip({ active, onClick, disabled, children, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.45rem 0.85rem', borderRadius: 999, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
        border: `1.5px solid ${active ? (color || 'var(--primary-500)') : 'var(--border-default)'}`,
        background: active ? `color-mix(in srgb, ${color || 'var(--primary-500)'} 14%, transparent)` : 'var(--bg-primary)',
        color: active ? (color || 'var(--primary-700)') : 'var(--text-secondary)',
        transition: 'all 0.15s ease', opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ─── Number stepper ───────────────────────────────────────────────────────────
function Stepper({ value, onChange, min, max, disabled, step = 1 }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitValue = (rawValue) => {
    const trimmed = String(rawValue ?? '').trim();
    if (!trimmed) {
      setDraft(String(value));
      return;
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      setDraft(String(value));
      return;
    }

    const nextValue = Math.min(max, Math.max(min, Math.round(numericValue)));
    setDraft(String(nextValue));
    onChange(nextValue);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--border-default)', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={disabled || value <= min}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>−</button>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
        aria-label="Number input"
        style={{
          width: 72,
          height: 38,
          border: 'none',
          borderLeft: '1px solid var(--border-default)',
          borderRight: '1px solid var(--border-default)',
          background: 'transparent',
          color: 'var(--text-primary)',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '0.95rem',
          outline: 'none',
          padding: '0 0.4rem',
          MozAppearance: 'textfield',
        }}
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={disabled || value >= max}
        style={{ width: 36, height: 38, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}>+</button>
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--primary-500)' : 'var(--bg-tertiary)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
      border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
      borderRadius: 24, padding: 'var(--space-6)',
    }}>
      <p style={{ margin: '0 0 var(--space-4)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  type: 'ANIME',
  sort: 'POPULARITY_DESC',
  animeFormat: '',
  mangaSubtype: '',   // '' | 'JP' | 'KR' | 'CN' | 'NOVEL' | 'ONE_SHOT'
  status: '',
  minScore: '',
  minPopularity: '',
  pages: 3,
  perPage: 25,
};

export function AdminFetch() {
  const { t, language } = useLanguage();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('titles');
  const [csConfig, setCsConfig] = useState({ onlyMissing: true, limit: 50 });
  const [jikanConfig, setJikanConfig] = useState({ sort: 'score', pages: 3, perPage: 25 });
  const [pornhwaConfig, setPornhwaConfig] = useState({
    sort: 'updated_at',
    status: 'On Going',
    orientation: '',
    tags: '',
    pages: 5,
    perPage: 50,
    minRatings: 3,
    apiKey: localStorage.getItem('admin-pornhwadb-api-key') || '',
  });
  const [pornhwaCharsConfig, setPornhwaCharsConfig] = useState({
    onlyMissing: true,
    limit: 50,
    delayMs: 800,
  });
  const [trailerConfig, setTrailerConfig] = useState({
    mode: 'batch',
    onlyMissing: true,
    category: 'all',
    limit: 100,
    delayMs: 1200,
    titleQuery: '',
  });
  const [themeConfig, setThemeConfig] = useState({ onlyMissing: true, limit: 100, delayMs: 1200 });
  const abortRef = useRef(null);
  const logContainerRef = useRef(null);

  const set = useCallback((key, value) => setConfig((p) => ({ ...p, [key]: value })), []);

  const addLog = useCallback((type, message) => {
    const locale = language === 'th' ? 'th-TH' : 'en-US';
    const entry = { id: `${Date.now()}-${Math.random()}`, type, message, time: new Date().toLocaleTimeString(locale) };
    setLogs((p) => { const n = [...p, entry]; return n.length > 200 ? n.slice(-200) : n; });
  }, [language]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('admin-pornhwadb-api-key', pornhwaConfig.apiKey || '');
  }, [pornhwaConfig.apiKey]);

  // Build AniList variables from config
  const buildVars = useCallback((page) => {
    const mangaSub = MANGA_SUBTYPES.find((s) => s.value === config.mangaSubtype) || MANGA_SUBTYPES[0];
    return {
      type: config.type,
      sort: [config.sort],
      perPage: config.perPage,
      page,
      ...(config.type === 'ANIME' && config.animeFormat ? { formatIn: [config.animeFormat] } : {}),
      ...(config.type === 'MANGA' && mangaSub.format ? { formatIn: [mangaSub.format] } : {}),
      ...(config.type === 'MANGA' && mangaSub.country ? { countryOfOrigin: mangaSub.country } : {}),
      ...(config.status ? { status: config.status } : {}),
      ...(config.minScore ? { averageScoreGreater: Number(config.minScore) } : {}),
      ...(config.minPopularity ? { popularityGreater: Number(config.minPopularity) } : {}),
    };
  }, [config]);

  const trailerCategoryOptions = [
    { value: 'all', label: t('admin.titles.allSubtypes') },
    { value: 'anime', label: t('admin.titles.subtypeAnime') },
    { value: 'manga', label: t('admin.titles.subtypeManga') },
    { value: 'manhwa', label: t('admin.titles.subtypeManhwa') },
    { value: 'manhua', label: t('admin.titles.subtypeManhua') },
    { value: 'webtoon', label: t('admin.titles.subtypeWebtoon') },
  ];

  const handleFetch = async () => {
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: config.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });

    const sortLabel = t(SORT_OPTIONS.find((s) => s.value === config.sort)?.labelKey || 'admin.fetch.sortPopularity');
    addLog('info', t('admin.fetch.logStart', { type: config.type, sort: sortLabel }));

    try {
      for (let page = 1; page <= config.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', t('admin.fetch.logPage', { page, total: config.pages }));

        let pageData;
        try {
          pageData = await fetchAniListPage(buildVars(page), abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', t('admin.fetch.logFetchFailed', { message: err.message }));
          break;
        }

        const items = pageData.media || [];
        addLog('info', t('admin.fetch.logItemsReceived', { count: items.length }));

        for (const media of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeMedia(media);
          try {
            const result = await upsertTitle(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported'
              ? t('admin.fetch.resultImported')
              : result === 'updated'
                ? t('admin.fetch.resultUpdated')
                : t('admin.fetch.resultSkipped');
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pageInfo?.hasNextPage) { addLog('info', t('admin.fetch.logNoNextPage')); break; }
        if (page < config.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 1200));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.logFinished'));
        toast.success(t('admin.fetch.fetchFinished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleCharStaff = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog('info', t('admin.fetch.cs.logStart'));

      const { data: refs, error: refsError } = await supabase
        .from('title_source_refs')
        .select('canonical_title_id, external_id')
        .eq('provider', 'anilist');
      if (refsError) throw refsError;

      let targets = refs || [];

      if (csConfig.onlyMissing) {
        const { data: existing } = await supabase.from('title_characters').select('canonical_title_id');
        const existingSet = new Set((existing || []).map((r) => r.canonical_title_id));
        targets = targets.filter((r) => !existingSet.has(r.canonical_title_id));
      }

      if (csConfig.limit > 0) targets = targets.slice(0, csConfig.limit);

      addLog('info', t('admin.fetch.cs.logTotal', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, chars: 0, staff: 0, errors: 0 });

      for (const ref of targets) {
        if (abortRef.current.signal.aborted) break;
        try {
          const media = await fetchAniListCharStaff(Number(ref.external_id), abortRef.current.signal);
          const result = await upsertCharStaff(ref.canonical_title_id, media);
          setProgress((p) => ({ ...p, done: p.done + 1, chars: p.chars + result.chars, staff: p.staff + result.staff }));
          addLog('imported', `[${ref.canonical_title_id}] chars:${result.chars} staff:${result.staff}`);
        } catch (err) {
          if (err.name === 'AbortError') break;
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `[${ref.canonical_title_id}] ${err.message}`);
        }
        if (!abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 750));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.cs.logFinished'));
        toast.success(t('admin.fetch.cs.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleTrailerBackfill = async () => {
    if (!supabase) {
      toast.error(t('admin.fetch.trailers.supabaseUnavailable'));
      return;
    }

    const explicitTitleQuery = String(trailerConfig.titleQuery || '').trim();
    if (trailerConfig.mode === 'search' && !explicitTitleQuery) {
      toast.error(t('admin.fetch.trailers.titleQueryRequired'));
      return;
    }

    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog(
        'info',
        t('admin.fetch.trailers.logStart', {
          mode: trailerConfig.mode === 'search'
            ? t('admin.fetch.trailers.modeSearch')
            : trailerConfig.onlyMissing
              ? t('admin.fetch.trailers.modeMissing')
              : t('admin.fetch.trailers.modeRefresh'),
          delayMs: trailerConfig.delayMs,
        })
      );

      if (trailerConfig.mode === 'search') {
        addLog('info', t('admin.fetch.trailers.logSearchQuery', { query: explicitTitleQuery }));
      }

      let targets = [];

      if (trailerConfig.mode === 'search') {
        const { data: titleRows, error: titleError } = await supabase
          .from('canonical_titles')
          .select(`
            id,
            canonical_title,
            slug,
            release_year,
            type,
            subtype,
            trailer_url,
            trailer_video_id,
            aliases:aliases_cache,
            source_refs:title_source_refs(provider, external_id)
          `)
          .order('id', { ascending: true });
        if (titleError) throw titleError;

        targets = (titleRows || [])
          .filter((titleRecord) => matchesTrailerCategory(titleRecord, trailerConfig.category))
          .filter((titleRecord) => matchesTrailerTitleQuery(titleRecord, explicitTitleQuery))
          .map((titleRecord) => ({
            canonical_title_id: titleRecord.id,
            external_id: getSourceRefId(titleRecord.source_refs, 'anilist') || null,
            canonical_titles: titleRecord,
          }));
      } else {
        let query = supabase
          .from('canonical_titles')
          .select(`
            id,
            canonical_title,
            slug,
            release_year,
            type,
            subtype,
            trailer_url,
            trailer_video_id,
            aliases:aliases_cache,
            source_refs:title_source_refs(provider, external_id)
          `)
          .order('id', { ascending: true });

        if (trailerConfig.onlyMissing) {
          query = query.is('trailer_url', null).is('trailer_video_id', null);
        }

        const { data: titleRows, error: titleError } = await query;
        if (titleError) throw titleError;

        targets = (titleRows || [])
          .filter((titleRecord) => matchesTrailerCategory(titleRecord, trailerConfig.category))
          .map((titleRecord) => ({
            canonical_title_id: titleRecord.id,
            external_id: getSourceRefId(titleRecord.source_refs, 'anilist') || null,
            canonical_titles: titleRecord,
          }));
      }

      if (trailerConfig.limit > 0) {
        targets = targets.slice(0, trailerConfig.limit);
      }

      addLog('info', t('admin.fetch.trailers.logTargets', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, updated: 0, noTrailer: 0, noMatch: 0, errors: 0 });

      if (targets.length === 0) {
        if (trailerConfig.mode === 'search') {
          addLog('success', t('admin.fetch.trailers.logNoLocalMatch', { query: explicitTitleQuery }));
          toast.success(t('admin.fetch.trailers.noLocalMatch'));
        } else {
          addLog('success', t('admin.fetch.trailers.logNothingToDo'));
          toast.success(t('admin.fetch.trailers.nothingToDo'));
        }
        return;
      }

      for (const target of targets) {
        if (abortRef.current.signal.aborted) break;

        const titleRecord = Array.isArray(target.canonical_titles)
          ? target.canonical_titles[0]
          : target.canonical_titles;
        const fallbackTitle = titleRecord?.canonical_title || `#${target.canonical_title_id}`;

        try {
          let media = null;
          let resolvedTrailer = null;

          if (target.external_id) {
            media = await fetchAniListTrailerById(Number(target.external_id), abortRef.current.signal);
          } else {
            const searchResult = await resolveAniListTrailerBySearch(
              titleRecord,
              abortRef.current.signal,
              trailerConfig.mode === 'search' ? explicitTitleQuery : ''
            );
            media = searchResult.media;
          }

          if (abortRef.current.signal.aborted) break;

          if (media?.id) {
            const { error: sourceRefError } = await supabase.from('title_source_refs').upsert(
              {
                canonical_title_id: target.canonical_title_id,
                provider: 'anilist',
                external_id: String(media.id),
                external_url: media?.siteUrl || null,
                source_priority: titleRecord?.type === 'anime' ? 10 : 20,
                raw_payload: media,
                last_synced_at: new Date().toISOString(),
                fetched_at: new Date().toISOString(),
              },
              { onConflict: 'provider,external_id' },
            );
            if (sourceRefError && sourceRefError.code !== 'PGRST205') throw sourceRefError;
          }

          if (!media?.trailer?.id) {
            resolvedTrailer = await resolveTrailerFromFallbackSources(
              titleRecord,
              trailerConfig.mode === 'search' ? explicitTitleQuery : ''
            );
          }

          if (!media && !resolvedTrailer) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noMatch: current.noMatch + 1,
            }));
            addLog('skipped', t('admin.fetch.trailers.logNoMatch', { title: fallbackTitle }));
          } else if (!media?.trailer?.id && !resolvedTrailer) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noTrailer: current.noTrailer + 1,
            }));
            addLog('skipped', t('admin.fetch.trailers.logNoTrailer', { title: getMediaDisplayTitle(media) || fallbackTitle }));
          } else {
            const patch = media?.trailer?.id
              ? buildAniListTrailerPatch(media)
              : buildResolvedTrailerPatch(resolvedTrailer);
            const updateLabel = media?.trailer?.id
              ? getMediaDisplayTitle(media) || fallbackTitle
              : fallbackTitle;
            const { error: updateError } = await supabase
              .from('canonical_titles')
              .update({
                ...patch,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', target.canonical_title_id);
            if (updateError) throw updateError;

            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              updated: current.updated + 1,
            }));
            addLog(
              'updated',
              t('admin.fetch.trailers.logUpdated', {
                title: updateLabel,
                site: patch.trailer_source || patch.trailer_site || 'external',
              })
            );
          }
        } catch (error) {
          if (error.name === 'AbortError') break;
          setProgress((current) => ({
            ...current,
            done: current.done + 1,
            errors: current.errors + 1,
          }));
          addLog('error', `[${fallbackTitle}] ${error.message}`);
        }

        if (!abortRef.current.signal.aborted && trailerConfig.delayMs > 0) {
          await sleep(trailerConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.trailers.logFinished'));
        toast.success(t('admin.fetch.trailers.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        addLog('error', error.message);
        toast.error(error.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleThemeBackfill = async () => {
    if (!supabase) {
      toast.error(t('admin.fetch.themes.supabaseUnavailable'));
      return;
    }

    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog(
        'info',
        t('admin.fetch.themes.logStart', {
          mode: themeConfig.onlyMissing
            ? t('admin.fetch.themes.modeMissing')
            : t('admin.fetch.themes.modeRefresh'),
          delayMs: themeConfig.delayMs,
        })
      );

      const { data: titleRows, error: titleError } = await supabase
        .from('canonical_titles')
        .select(`
          id,
          canonical_title,
          release_year,
          type,
          subtype,
          aliases:aliases_cache,
          source_refs:title_source_refs(provider, external_id),
          themes:title_theme_songs(id)
        `)
        .eq('type', 'anime')
        .order('id', { ascending: true });
      if (titleError) throw titleError;

      let targets = (titleRows || []).filter((titleRecord) => {
        if (themeConfig.onlyMissing && Array.isArray(titleRecord.themes) && titleRecord.themes.length > 0) {
          return false;
        }
        return buildPreferredTitleSearchNames(titleRecord).length > 0;
      });

      if (themeConfig.limit > 0) {
        targets = targets.slice(0, themeConfig.limit);
      }

      addLog('info', t('admin.fetch.themes.logTargets', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, synced: 0, rows: 0, noMatch: 0, errors: 0 });

      if (targets.length === 0) {
        addLog('success', t('admin.fetch.themes.logNothingToDo'));
        toast.success(t('admin.fetch.themes.nothingToDo'));
        return;
      }

      for (const titleRecord of targets) {
        if (abortRef.current.signal.aborted) break;

        const fallbackTitle = titleRecord?.canonical_title || `#${titleRecord?.id}`;

        try {
          const matched = await resolveAnimeThemesMatch(titleRecord, abortRef.current.signal);

          if (!matched?.candidate) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noMatch: current.noMatch + 1,
            }));
            addLog('skipped', t('admin.fetch.themes.logNoMatch', { title: fallbackTitle }));
          } else {
            const result = await replaceTitleThemeSongs(titleRecord.id, matched);
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              synced: current.synced + 1,
              rows: current.rows + result.rows,
            }));

            addLog(
              result.rows > 0 ? 'updated' : 'skipped',
              t(
                result.rows > 0 ? 'admin.fetch.themes.logSynced' : 'admin.fetch.themes.logNoThemes',
                {
                  title: fallbackTitle,
                  rows: result.rows,
                  match: matched.candidate?.name || fallbackTitle,
                }
              )
            );
          }
        } catch (error) {
          if (error.name === 'AbortError') break;
          setProgress((current) => ({
            ...current,
            done: current.done + 1,
            errors: current.errors + 1,
          }));
          addLog('error', `[${fallbackTitle}] ${error.message}`);
        }

        if (!abortRef.current.signal.aborted && themeConfig.delayMs > 0) {
          await sleep(themeConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.themes.logFinished'));
        toast.success(t('admin.fetch.themes.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        addLog('error', error.message);
        toast.error(error.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handlePornhwaCharsFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog('info', 'เริ่ม fetch Characters สำหรับ PornhwaDB titles...');

      const { data: refs, error: refsError } = await supabase
        .from('title_source_refs')
        .select('canonical_title_id, external_id, raw_payload, canonical_titles!inner(canonical_title)')
        .eq('provider', 'pornhwadb');
      if (refsError) throw refsError;

      let targets = refs || [];

      if (pornhwaCharsConfig.onlyMissing) {
        const { data: existing } = await supabase.from('title_characters').select('canonical_title_id');
        const existingSet = new Set((existing || []).map((r) => r.canonical_title_id));
        targets = targets.filter((r) => !existingSet.has(r.canonical_title_id));
      }

      if (pornhwaCharsConfig.limit > 0) targets = targets.slice(0, pornhwaCharsConfig.limit);

      addLog('info', `พบ ${targets.length} titles ที่ต้องดึง characters`);
      setProgress({ total: targets.length, done: 0, chars: 0, errors: 0 });

      for (const ref of targets) {
        if (abortRef.current.signal.aborted) break;
        const titleName = (Array.isArray(ref.canonical_titles)
          ? ref.canonical_titles[0]
          : ref.canonical_titles)?.canonical_title || `#${ref.canonical_title_id}`;
        const slug = ref.raw_payload?.slug;
        if (!slug) {
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `${titleName}: ไม่พบ slug ใน raw_payload`);
          continue;
        }
        try {
          const result = await fetchPornhwaDbCharactersViaProxy(
            slug,
            pornhwaConfig.apiKey,
            abortRef.current.signal,
          );
          const count = await upsertPornhwaDbCharacters(ref.canonical_title_id, result?.data || []);
          setProgress((p) => ({ ...p, done: p.done + 1, chars: p.chars + count }));
          addLog('imported', `${titleName} — ${count} characters`);
        } catch (err) {
          if (err.name === 'AbortError') break;
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `${titleName}: ${err.message}`);
        }
        if (!abortRef.current.signal.aborted && pornhwaCharsConfig.delayMs > 0) {
          await sleep(pornhwaCharsConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'PornhwaDB Characters fetch เสร็จสมบูรณ์');
        toast.success('PornhwaDB Characters fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleJikanFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: jikanConfig.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });
    addLog('info', `เริ่ม fetch Manhwa Adult จาก Jikan — ${jikanConfig.pages} หน้า, ${jikanConfig.perPage}/หน้า (ไม่มี BL)`);

    try {
      for (let page = 1; page <= jikanConfig.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${jikanConfig.pages}`);

        let pageData;
        try {
          pageData = await fetchJikanPage(page, jikanConfig, abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `Fetch ล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.data || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const item of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeJikanManga(item);
          try {
            const result = await upsertJikanTitle(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'นำเข้า' : result === 'updated' ? 'อัปเดต' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pagination?.has_next_page) { addLog('info', 'ไม่มีหน้าถัดไป'); break; }
        // Jikan rate limit ~3 req/s — wait 400ms between pages
        if (page < jikanConfig.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 400));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'Fetch เสร็จสมบูรณ์');
        toast.success('Jikan fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handlePornhwaFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: pornhwaConfig.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });
    addLog('info', `เริ่ม fetch Adult Manhwa จาก PornhwaDB - ${pornhwaConfig.pages} หน้า, ${pornhwaConfig.perPage}/หน้า`);

    try {
      for (let page = 1; page <= pornhwaConfig.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${pornhwaConfig.pages}`);

        let pageData;
        try {
          pageData = await fetchPornhwaDbPage(page, pornhwaConfig, abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `Fetch ล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.data || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const item of items) {
          if (abortRef.current.signal.aborted) break;
          if (isBoysLovePornhwa(item)) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, skipped: p.skipped + 1 }));
            addLog('skipped', `[ข้าม BL/Yaoi] ${item.title || item.id}`);
            continue;
          }
          const norm = normalizePornhwaDbEntry(item);
          try {
            const result = await upsertPornhwaDbTitle(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'นำเข้า' : result === 'updated' ? 'อัปเดต' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!hasPornhwaDbNextPage(pageData, page, pornhwaConfig.perPage)) {
          addLog('info', 'ไม่มีหน้าถัดไป');
          break;
        }

        if (page < pornhwaConfig.pages && !abortRef.current.signal.aborted) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'PornhwaDB fetch เสร็จสมบูรณ์');
        toast.success('PornhwaDB fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const totalEstimate = config.pages * config.perPage;
  const pageProgress = progress ? Math.min(((progress.page - 1) / progress.totalPages) * 100, 100) : 0;

  return (
    <div className="admin-page-content">

      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            <Download size={24} /> {t('admin.fetch.pageTitle')}
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {activeTab === 'titles'
              ? t('admin.fetch.pageSubtitle')
              : activeTab === 'themes'
                ? t('admin.fetch.themes.tabSubtitle')
                : activeTab === 'trailers'
                  ? t('admin.fetch.trailers.tabSubtitle')
                  : activeTab === 'pornhwa'
                    ? 'ดึง Adult Manhwa จาก PornhwaDB ผ่าน proxy'
                    : activeTab === 'pornhwa-chars'
                      ? 'ดึง Characters สำหรับ PornhwaDB titles ที่นำเข้าแล้ว'
                      : activeTab === 'jikan'
                        ? 'ดึง Manhwa Adult จาก MyAnimeList (ไม่มี BL)'
                        : t('admin.fetch.cs.tabSubtitle')}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
        {[
          { id: 'titles', label: t('admin.fetch.tabTitles'), Icon: Download },
          { id: 'themes', label: t('admin.fetch.themes.tabTitle'), Icon: Hash },
          { id: 'trailers', label: t('admin.fetch.trailers.tabTitle'), Icon: RefreshCw },
          { id: 'pornhwa', label: 'PornhwaDB', Icon: Flame },
          { id: 'pornhwa-chars', label: 'PWDB Chars', Icon: Users },
          { id: 'jikan', label: 'Jikan (MAL)', Icon: Globe },
          { id: 'charstaff', label: t('admin.fetch.cs.tabTitle'), Icon: Users },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => { setActiveTab(id); setProgress(null); setLogs([]); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', borderRadius: 999, border: 'none',
              background: activeTab === id ? 'var(--primary-500)' : 'transparent',
              color: activeTab === id ? 'white' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.88rem',
              cursor: running ? 'default' : 'pointer', opacity: running ? 0.6 : 1,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* ── Left: Config ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {activeTab === 'titles' ? (
            <>
              {/* 1. Type */}
              <Section title={t('admin.fetch.typeLabel')}>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  {[
                    { value: 'ANIME', label: t('admin.fetch.typeAnime'), emoji: '🎌' },
                    { value: 'MANGA', label: t('admin.fetch.typeManga'), emoji: '📚' },
                  ].map((tp) => (
                    <button
                      key={tp.value}
                      type="button"
                      disabled={running}
                      onClick={() => setConfig((p) => ({ ...p, type: tp.value, animeFormat: '', mangaSubtype: '' }))}
                      style={{
                        flex: 1, padding: 'var(--space-4)', borderRadius: 18, cursor: 'pointer',
                        border: `2px solid ${config.type === tp.value ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: config.type === tp.value
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s',
                        opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{tp.emoji}</div>
                      <div style={{ fontWeight: 700, color: config.type === tp.value ? 'var(--primary-700)' : 'var(--text-primary)', fontSize: '0.92rem' }}>
                        {tp.label}
                      </div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* 2. Subtype / Format */}
              <Section title={config.type === 'ANIME' ? t('admin.fetch.formatLabel') : t('admin.fetch.subtypeLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {config.type === 'ANIME'
                    ? ANIME_FORMATS.map((f) => (
                      <Chip key={f.value} active={config.animeFormat === f.value} disabled={running}
                        onClick={() => set('animeFormat', f.value)}>
                        {t(f.labelKey)}
                      </Chip>
                    ))
                    : MANGA_SUBTYPES.map((s) => (
                      <Chip key={s.value} active={config.mangaSubtype === s.value} disabled={running}
                        onClick={() => set('mangaSubtype', s.value)}>
                        {t(s.labelKey)}
                      </Chip>
                    ))
                  }
                </div>
                {config.type === 'MANGA' && config.mangaSubtype && (
                  <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {config.mangaSubtype === 'KR' && t('admin.fetch.subtypeHintKr')}
                    {config.mangaSubtype === 'CN' && t('admin.fetch.subtypeHintCn')}
                    {config.mangaSubtype === 'JP' && t('admin.fetch.subtypeHintJp')}
                    {config.mangaSubtype === 'NOVEL' && t('admin.fetch.subtypeHintNovel')}
                    {config.mangaSubtype === 'ONE_SHOT' && t('admin.fetch.subtypeHintOneShot')}
                  </p>
                )}
              </Section>

              {/* 3. Sort */}
              <Section title={t('admin.fetch.sortLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {SORT_OPTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Chip key={s.value} active={config.sort === s.value} disabled={running}
                        onClick={() => set('sort', s.value)}>
                        <Icon size={13} />
                        {t(s.labelKey)}
                      </Chip>
                    );
                  })}
                </div>
              </Section>

              {/* 4. Status */}
              <Section title={t('admin.fetch.statusLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {STATUS_OPTIONS.map((s) => (
                    <Chip key={s.value} active={config.status === s.value} disabled={running}
                      onClick={() => set('status', s.value)}>
                      {t(s.labelKey)}
                    </Chip>
                  ))}
                </div>
              </Section>

              {/* 5. Score / Popularity filter */}
              <Section title={t('admin.fetch.extraFilters')}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Star size={13} /> {t('admin.fetch.scoreMin')}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(0–100)</span>
                    </label>
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} max={100} value={config.minScore} disabled={running}
                      onChange={(e) => set('minScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp size={13} /> {t('admin.fetch.popularityMin')}
                    </label>
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} value={config.minPopularity} disabled={running}
                      onChange={(e) => set('minPopularity', e.target.value)} />
                  </div>
                </div>
              </Section>
            </>
          ) : activeTab === 'themes' ? (
            <>
              <Section title={t('admin.fetch.themes.modeLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: true,
                      label: t('admin.fetch.themes.modeMissing'),
                      hint: t('admin.fetch.themes.modeMissingHint'),
                    },
                    {
                      key: false,
                      label: t('admin.fetch.themes.modeRefresh'),
                      hint: t('admin.fetch.themes.modeRefreshHint'),
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setThemeConfig((current) => ({ ...current, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${themeConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: themeConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: themeConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.sourceLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ padding: 'var(--space-4)', borderRadius: 18, background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                      {t('admin.fetch.themes.sourceTitle')}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
                      {t('admin.fetch.themes.sourceHint')}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={themeConfig.limit}
                    onChange={(value) => setThemeConfig((current) => ({ ...current, limit: value }))}
                    min={0}
                    max={1000}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.themes.limitHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.delayLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={themeConfig.delayMs}
                    onChange={(value) => setThemeConfig((current) => ({ ...current, delayMs: value }))}
                    min={250}
                    max={5000}
                    step={250}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.themes.delayHint')}
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'trailers' ? (
            <>
              <Section title={t('admin.fetch.trailers.targetLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: 'batch',
                      label: t('admin.fetch.trailers.targetBatch'),
                      hint: t('admin.fetch.trailers.targetBatchHint'),
                    },
                    {
                      key: 'search',
                      label: t('admin.fetch.trailers.targetSearch'),
                      hint: t('admin.fetch.trailers.targetSearchHint'),
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={running}
                      onClick={() => setTrailerConfig((current) => ({ ...current, mode: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${trailerConfig.mode === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: trailerConfig.mode === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: trailerConfig.mode === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {trailerConfig.mode === 'batch' ? (
                <Section title={t('admin.fetch.trailers.modeLabel')}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {[
                      {
                        key: true,
                        label: t('admin.fetch.trailers.modeMissing'),
                        hint: t('admin.fetch.trailers.modeMissingHint'),
                      },
                      {
                        key: false,
                        label: t('admin.fetch.trailers.modeRefresh'),
                        hint: t('admin.fetch.trailers.modeRefreshHint'),
                      },
                    ].map(({ key, label, hint }) => (
                      <button
                        key={String(key)}
                        type="button"
                        disabled={running}
                        onClick={() => setTrailerConfig((current) => ({ ...current, onlyMissing: key }))}
                        style={{
                          padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                          border: `2px solid ${trailerConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                          background: trailerConfig.onlyMissing === key
                            ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                            : 'var(--bg-primary)',
                          textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: trailerConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                      </button>
                    ))}
                  </div>
                </Section>
              ) : (
                <Section title={t('admin.fetch.trailers.titleQueryLabel')}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={trailerConfig.titleQuery}
                      onChange={(event) => setTrailerConfig((current) => ({ ...current, titleQuery: event.target.value }))}
                      placeholder={t('admin.fetch.trailers.titleQueryPlaceholder')}
                      disabled={running}
                    />
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                      {t('admin.fetch.trailers.titleQueryHint')}
                    </p>
                  </div>
                </Section>
              )}

              <Section title={t('admin.fetch.trailers.categoryLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {trailerCategoryOptions.map((option) => (
                      <Chip
                        key={option.value}
                        active={trailerConfig.category === option.value}
                        disabled={running}
                        onClick={() => setTrailerConfig((current) => ({ ...current, category: option.value }))}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.categoryHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.limit}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, limit: value }))}
                    min={0}
                    max={1000}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.limitHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.delayLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.delayMs}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, delayMs: value }))}
                    min={250}
                    max={5000}
                    step={250}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.delayHint')}
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'pornhwa' ? (
            <>
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Flame size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>PornhwaDB via Supabase Edge Function</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Adult manhwa metadata แบบ secure proxy สำหรับ admin/editor เท่านั้น
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="PornhwaDB API Key">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="pwdb_xxxxxxxxxxxxx"
                    value={pornhwaConfig.apiKey}
                    onChange={(event) => setPornhwaConfig((current) => ({ ...current, apiKey: event.target.value }))}
                    disabled={running}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Paste key ที่นี่ได้เลย ระบบจะใช้ค่านี้ก่อน secret ฝั่ง Supabase และ key ต้องขึ้นต้นด้วย <code>pwdb_</code>
                  </p>
                </div>
              </Section>

              <Section title="เรียงลำดับ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'updated_at', label: 'Updated', Icon: Clock },
                    { value: 'average_rating', label: 'Rating', Icon: Star },
                    { value: 'release_year', label: 'Release Year', Icon: CalendarDays },
                    { value: 'total_ratings', label: 'Ratings Count', Icon: Users },
                  ].map(({ value, label, Icon }) => (
                    <Chip key={value} active={pornhwaConfig.sort === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, sort: value }))}>
                      <Icon size={13} /> {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="สถานะ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: '', label: 'All' },
                    { value: 'On Going', label: 'On Going' },
                    { value: 'Completed', label: 'Completed' },
                    { value: 'Hiatus', label: 'Hiatus' },
                  ].map(({ value, label }) => (
                    <Chip key={label} active={pornhwaConfig.status === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, status: value }))}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Orientation">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: '', label: 'All' },
                    { value: 'yuri', label: 'Yuri' },
                  ].map(({ value, label }) => (
                    <Chip key={label} active={pornhwaConfig.orientation === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, orientation: value }))}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Genre Tag (filter)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="เช่น Harem, Romance, Vanilla (เว้นว่างเพื่อดึงทั้งหมด)"
                    value={pornhwaConfig.tags}
                    onChange={(e) => setPornhwaConfig((p) => ({ ...p, tags: e.target.value }))}
                    disabled={running}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {['', 'Harem', 'Romance', 'Vanilla', 'Office', 'Milf', 'Incest', 'NTR', 'Isekai', 'Fantasy', 'System', 'Netorare', 'Revenge', 'College', 'Action'].map((tag) => (
                      <Chip key={tag || 'all'} active={pornhwaConfig.tags === tag} disabled={running}
                        onClick={() => setPornhwaConfig((p) => ({ ...p, tags: tag }))}>
                        {tag || 'All'}
                      </Chip>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="ขั้นต่ำจำนวนเรต">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={pornhwaConfig.minRatings}
                    onChange={(v) => setPornhwaConfig((p) => ({ ...p, minRatings: v }))}
                    min={0}
                    max={500}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    ลดข้อมูลบางเกินไปก่อนนำเข้าฐาน
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'pornhwa-chars' ? (
            <>
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Users size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>PornhwaDB — Characters</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      ดึง characters ของ PornhwaDB titles ผ่าน proxy (ใช้ API Key จาก tab PornhwaDB)
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="โหมด">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    { key: true, label: 'เฉพาะที่ยังไม่มี characters', hint: 'ข้าม titles ที่มี characters ในฐานข้อมูลแล้ว' },
                    { key: false, label: 'Refresh ทั้งหมด', hint: 'ดึงซ้ำแม้จะมีข้อมูลอยู่แล้ว' },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setPornhwaCharsConfig((p) => ({ ...p, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${pornhwaCharsConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: pornhwaCharsConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: pornhwaCharsConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="จำนวนสูงสุด">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={pornhwaCharsConfig.limit}
                    onChange={(v) => setPornhwaCharsConfig((p) => ({ ...p, limit: v }))}
                    min={0} max={500} disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    0 = ไม่จำกัด — แต่ละ title ใช้ 1 API call
                  </p>
                </div>
              </Section>

              <Section title="Delay ระหว่าง title">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {[400, 800, 1200, 2000].map((ms) => (
                      <Chip key={ms} active={pornhwaCharsConfig.delayMs === ms} disabled={running}
                        onClick={() => setPornhwaCharsConfig((p) => ({ ...p, delayMs: ms }))}>
                        {ms}ms
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    ป้องกัน rate limit — แนะนำ 800ms+
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'jikan' ? (
            <>
              {/* Jikan — Source info */}
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Globe size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Jikan API v4 (MyAnimeList)</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Manhwa - Erotica (genre 49) - ไม่มี BL/Yaoi (genre 28, 26) - เรียงตาม Score
                    </div>
                  </div>
                </div>
              </Section>

              {/* Jikan — Sort */}
              <Section title="เรียงลำดับ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'score', label: 'Score', Icon: Star },
                    { value: 'scored_by', label: 'Most Rated', Icon: Users },
                    { value: 'popularity', label: 'Popularity', Icon: TrendingUp },
                    { value: 'start_date', label: 'Start Date', Icon: CalendarDays },
                  ].map(({ value, label, Icon }) => (
                    <Chip key={value} active={jikanConfig.sort === value} disabled={running}
                      onClick={() => setJikanConfig((p) => ({ ...p, sort: value }))}>
                      <Icon size={13} /> {label}
                    </Chip>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* Characters & Staff — Mode */}
              <Section title={t('admin.fetch.cs.modeLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    { key: true, label: t('admin.fetch.cs.onlyMissing'), hint: t('admin.fetch.cs.onlyMissingHint') },
                    { key: false, label: t('admin.fetch.cs.refetchAll'), hint: t('admin.fetch.cs.refetchAllHint') },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setCsConfig((p) => ({ ...p, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${csConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: csConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: csConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* Characters & Staff — Limit */}
              <Section title={t('admin.fetch.cs.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={csConfig.limit}
                    onChange={(v) => setCsConfig((p) => ({ ...p, limit: v }))}
                    min={0} max={500} disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.cs.limitHint')}
                  </p>
                </div>
              </Section>
            </>
          )}

        </div>

        {/* ── Right: Options + Action ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'calc(var(--header-height) + 1rem)' }}>

          {/* Pages + Per page (titles + pornhwa + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && (
            <Section title={t('admin.fetch.volumeLabel')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label className="form-label">{t('admin.fetch.pages')}</label>
                  {activeTab === 'titles'
                    ? <Stepper value={config.pages} onChange={(v) => set('pages', v)} min={1} max={20} disabled={running} />
                    : activeTab === 'jikan'
                      ? <Stepper value={jikanConfig.pages} onChange={(v) => setJikanConfig((p) => ({ ...p, pages: v }))} min={1} max={20} disabled={running} />
                      : <Stepper value={pornhwaConfig.pages} onChange={(v) => setPornhwaConfig((p) => ({ ...p, pages: v }))} min={1} max={20} disabled={running} />
                  }
                </div>
                <div>
                  <label className="form-label">{t('admin.fetch.perPage')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {(activeTab === 'jikan' ? [10, 25] : activeTab === 'pornhwa' ? [25, 50, 100] : [10, 25, 50]).map((n) => (
                      <Chip
                        key={n}
                        active={activeTab === 'titles' ? config.perPage === n : activeTab === 'jikan' ? jikanConfig.perPage === n : pornhwaConfig.perPage === n}
                        disabled={running}
                        onClick={() => activeTab === 'titles'
                          ? set('perPage', n)
                          : activeTab === 'jikan'
                            ? setJikanConfig((p) => ({ ...p, perPage: n }))
                            : setPornhwaConfig((p) => ({ ...p, perPage: n }))}
                      >
                        {n}
                      </Chip>
                    ))}
                  </div>
                  {activeTab === 'jikan' && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                      Jikan จำกัด 25 items/หน้า
                    </p>
                  )}
                  {activeTab === 'pornhwa' && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                      PornhwaDB proxy รองรับได้ถึง 100 items/หน้า
                    </p>
                  )}
                </div>
                <div style={{
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ~{activeTab === 'titles'
                      ? totalEstimate
                      : activeTab === 'jikan'
                        ? jikanConfig.pages * jikanConfig.perPage
                        : pornhwaConfig.pages * pornhwaConfig.perPage}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{t('admin.fetch.willFetch')}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Duplicate mode (titles + pornhwa + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && (
            <Section title={t('admin.fetch.duplicateLabel')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', cursor: running ? 'default' : 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('admin.fetch.skipDuplicates')}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {skipDuplicates ? t('admin.fetch.skipOn') : t('admin.fetch.skipOff')}
                    </div>
                  </div>
                  <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} disabled={running} />
                </label>
                <div style={{
                  fontSize: '0.78rem', color: 'var(--text-tertiary)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  lineHeight: 1.55,
                }}>
                  {skipDuplicates ? t('admin.fetch.skipHintOn') : t('admin.fetch.skipHintOff')}
                </div>
              </div>
            </Section>
          )}

          {/* Action button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!running ? (
              <button type="button" className="primary-btn"
                onClick={
                  activeTab === 'titles'
                    ? handleFetch
                    : activeTab === 'themes'
                      ? handleThemeBackfill
                      : activeTab === 'trailers'
                        ? handleTrailerBackfill
                        : activeTab === 'pornhwa'
                          ? handlePornhwaFetch
                          : activeTab === 'pornhwa-chars'
                            ? handlePornhwaCharsFetch
                            : activeTab === 'jikan'
                              ? handleJikanFetch
                              : handleCharStaff
                }
                style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}>
                <Play size={16} /> {
                  activeTab === 'titles'
                    ? t('admin.fetch.fetchBtn')
                    : activeTab === 'themes'
                      ? t('admin.fetch.themes.startBtn')
                      : activeTab === 'trailers'
                        ? trailerConfig.mode === 'search'
                          ? t('admin.fetch.trailers.startSearchBtn')
                          : t('admin.fetch.trailers.startBtn')
                        : activeTab === 'pornhwa'
                          ? 'Fetch PornhwaDB'
                          : activeTab === 'pornhwa-chars'
                            ? 'Fetch PWDB Characters'
                            : activeTab === 'jikan'
                              ? 'Fetch Manhwa Adult'
                              : t('admin.fetch.cs.startBtn')
                }
              </button>
            ) : (
              <button type="button" onClick={() => abortRef.current?.abort()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: 'var(--space-4)', background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                  color: 'white', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.95rem',
                  cursor: 'pointer', boxShadow: '0 8px 20px rgba(220,38,38,0.3)',
                }}>
                <Square size={16} /> {t('admin.fetch.stopBtn')}
              </button>
            )}
            {progress && !running && (
              <button type="button" className="action-btn" onClick={() => { setProgress(null); setLogs([]); }}
                style={{ width: '100%', justifyContent: 'center' }}>
                {t('admin.fetch.clearResults')}
              </button>
            )}
          </div>

          {/* Progress stats */}
          {progress && (
            <Section title={running ? t('admin.fetch.runningTitle') : t('admin.fetch.resultTitle')}>
              {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && running && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.pageProgress', { page: progress.page, total: progress.totalPages })}</span>
                    <span>{t('admin.fetch.itemsProgress', { count: progress.fetched })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${pageProgress}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {(activeTab === 'charstaff' || activeTab === 'pornhwa-chars') && running && progress?.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{progress.done}/{progress.total}</span>
                    {activeTab === 'pornhwa-chars' && <span>{pornhwaCharsConfig.delayMs}ms delay</span>}
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {activeTab === 'trailers' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.trailers.progress', { done: progress.done, total: progress.total })}</span>
                    <span>{t('admin.fetch.trailers.delayProgress', { delayMs: trailerConfig.delayMs })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {activeTab === 'themes' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.themes.progress', { done: progress.done, total: progress.total })}</span>
                    <span>{t('admin.fetch.themes.delayProgress', { delayMs: themeConfig.delayMs })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan'
                  ? [
                    { label: t('admin.fetch.statNew'), value: progress.imported, color: '#16a34a' },
                    { label: t('admin.fetch.statUpdated'), value: progress.updated, color: '#2563eb' },
                    { label: t('admin.fetch.statSkipped'), value: progress.skipped, color: 'var(--text-tertiary)' },
                    { label: t('admin.fetch.statErrors'), value: progress.errors, color: '#dc2626' },
                  ]
                  : activeTab === 'pornhwa-chars'
                    ? [
                      { label: 'Done', value: progress.done, color: '#2563eb' },
                      { label: 'Characters', value: progress.chars, color: '#16a34a' },
                      { label: 'Errors', value: progress.errors, color: '#dc2626' },
                      { label: 'Total', value: progress.total, color: 'var(--text-tertiary)' },
                    ]
                    : activeTab === 'themes'
                      ? [
                        { label: t('admin.fetch.themes.statSynced'), value: progress.synced, color: '#16a34a' },
                        { label: t('admin.fetch.themes.statRows'), value: progress.rows, color: '#2563eb' },
                        { label: t('admin.fetch.themes.statNoMatch'), value: progress.noMatch, color: 'var(--text-tertiary)' },
                        { label: t('admin.fetch.themes.statErrors'), value: progress.errors, color: '#dc2626' },
                      ]
                      : activeTab === 'trailers'
                        ? [
                          { label: t('admin.fetch.trailers.statDone'), value: progress.done, color: '#2563eb' },
                          { label: t('admin.fetch.trailers.statUpdated'), value: progress.updated, color: '#16a34a' },
                          { label: t('admin.fetch.trailers.statNoTrailer'), value: progress.noTrailer, color: 'var(--text-tertiary)' },
                          { label: t('admin.fetch.trailers.statNoMatch'), value: progress.noMatch, color: '#a16207' },
                          { label: t('admin.fetch.trailers.statErrors'), value: progress.errors, color: '#dc2626' },
                        ]
                        : [
                          { label: t('admin.fetch.cs.statDone'), value: progress.done, color: '#2563eb' },
                          { label: t('admin.fetch.cs.statChars'), value: progress.chars, color: '#16a34a' },
                          { label: t('admin.fetch.cs.statStaff'), value: progress.staff, color: '#7c3aed' },
                          { label: t('admin.fetch.cs.statErrors'), value: progress.errors, color: '#dc2626' },
                        ]
                ).map((stat) => (
                  <div key={stat.label} style={{
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>{stat.value ?? 0}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* ── Log ── */}
      {logs.length > 0 && (
        <div style={{
          marginTop: 'var(--space-5)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
          border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
          borderRadius: 24, padding: 'var(--space-5)',
          overflowAnchor: 'none',
        }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logTitle')}
          </p>
          <div ref={logContainerRef} style={{
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
            fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace', fontSize: '0.76rem',
            overflowAnchor: 'none',
          }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', padding: '0.18rem 0.2rem', color: LOG_COLOR[log.type] }}>
                <span style={{ flexShrink: 0 }}>{LOG_ICON[log.type]}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, fontSize: '0.7rem' }}>{log.time}</span>
                <span style={{ wordBreak: 'break-word', color: LOG_COLOR[log.type] }}>{log.message}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logItems', { count: logs.length })}
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!progress && logs.length === 0 && (
        <div className="admin-empty-state" style={{ marginTop: 'var(--space-5)' }}>
          <Download size={26} style={{ color: 'var(--text-tertiary)', marginBottom: '0.75rem' }} />
          <span className="admin-state-title">{t('admin.fetch.readyTitle')}</span>
          <p className="admin-state-description">
            {t('admin.fetch.readyHint')}
          </p>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AdminFetch;
