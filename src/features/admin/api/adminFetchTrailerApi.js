import { fetchAniListGraphQL } from '@/shared/lib/anilist';
import { getMediaDisplayTitle } from './adminFetchNormalization';

const ANILIST_TRAILER_GQL = `query($id:Int!){Media(id:$id){id type siteUrl title{romaji english native} trailer{id site thumbnail}}}`;
const ANILIST_TRAILER_SEARCH_GQL = `query($search:String!$type:MediaType){Page(page:1,perPage:5){media(search:$search,type:$type,isAdult:false){id type siteUrl title{romaji english native} trailer{id site thumbnail}}}}`;
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

export function getSourceRefId(sourceRefs, provider) {
  const ref = (sourceRefs || []).find((entry) => entry.provider === provider);
  return ref?.external_id ? String(ref.external_id) : '';
}

export function getOrderedAliasValues(titleRecord) {
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

export function buildPreferredTitleSearchNames(titleRecord, extraNames = []) {
  return collectUniqueTitleValues([
    ...extraNames,
    titleRecord?.canonical_title,
    ...getOrderedAliasValues(titleRecord),
  ]).slice(0, 5);
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

export async function fetchAniListTrailerById(anilistId, signal) {
  const data = await fetchAniListGraphQL(ANILIST_TRAILER_GQL, { id: anilistId }, { signal });
  return data?.Media || null;
}

async function searchAniListTrailerByName(search, type, signal) {
  const data = await fetchAniListGraphQL(ANILIST_TRAILER_SEARCH_GQL, { search, type }, { signal });
  return data?.Page?.media || [];
}

export async function resolveAniListTrailerBySearch(titleRecord, signal, preferredSearchName = '') {
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

export async function resolveAnimeThemesMatch(titleRecord, signal) {
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

export function getThemeType(rawType) {
  if (rawType === 'OP') return 'OP';
  if (rawType === 'ED') return 'ED';
  if (rawType === 'IN') return 'INSERT';
  return 'OTHER';
}

export function pickPreferredTrailerThemeVideo(videos) {
  return pickPreferredThemeVideo(videos);
}

export function matchesTrailerCategory(titleRecord, category) {
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
