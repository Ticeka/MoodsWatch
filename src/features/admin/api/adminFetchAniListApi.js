import { fetchAniListGraphQL } from '@/shared/lib/anilist';

const ANILIST_CHARACTER_PAGE_SIZE = 25;
const ANILIST_CHARACTER_PAGE_HARD_LIMIT = 40;
export const ANILIST_CHARACTER_ROLE_OPTIONS = ['MAIN', 'SUPPORTING', 'BACKGROUND'];
const ANILIST_RATE_LIMIT_MAX_RETRIES = 4;
const ANILIST_RATE_LIMIT_BASE_DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHAR_STAFF_GQL = `query($id:Int!$characterPage:Int!$characterPerPage:Int!){Media(id:$id){characters(page:$characterPage,perPage:$characterPerPage,sort:[ROLE,RELEVANCE]){pageInfo{currentPage hasNextPage}edges{role node{id gender name{full native}image{medium}}voiceActors(language:JAPANESE){id name{full native}image{medium}}}}staff(sort:RELEVANCE,perPage:25){edges{role node{id name{full native}image{medium}}}}}}`;

export function isAniListRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('429') || message.includes('rate limit');
}

function getAniListCharacterEdgeKey(edge) {
  const characterId = edge?.node?.id ?? null;
  const role = String(edge?.role || '').toUpperCase();
  return `${characterId ?? 'unknown'}:${role}`;
}

function getStoredCharacterRowKey(row) {
  return `${row?.anilist_id ?? row?.name_full ?? 'unknown'}:${String(row?.role || '').toUpperCase()}`;
}

export function buildStoredCharacterKeySet(rows, options = {}) {
  const allowedRoles = new Set((options.allowedRoles || ANILIST_CHARACTER_ROLE_OPTIONS).map((role) => String(role || '').toUpperCase()));
  return new Set(
    (rows || [])
      .filter((row) => allowedRoles.has(String(row?.role || '').toUpperCase()))
      .filter((row) => !options.imageOnly || row?.image_url)
      .map((row) => getStoredCharacterRowKey(row)),
  );
}

export async function fetchAniListCharStaff(anilistId, signal, options = {}) {
  const aggregatedEdges = [];
  const seenCharacterKeys = new Set();
  let currentPage = 1;
  let staffEdges = [];
  let lastMedia = null;
  let partialCharacterSync = false;

  while (currentPage <= ANILIST_CHARACTER_PAGE_HARD_LIMIT) {
    let data = null;

    for (let attempt = 0; attempt <= ANILIST_RATE_LIMIT_MAX_RETRIES; attempt += 1) {
      try {
        data = await fetchAniListGraphQL(
          CHAR_STAFF_GQL,
          { id: anilistId, characterPage: currentPage, characterPerPage: ANILIST_CHARACTER_PAGE_SIZE },
          { signal },
        );
        break;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (!isAniListRateLimitError(error) || attempt === ANILIST_RATE_LIMIT_MAX_RETRIES) {
          throw error;
        }
        const retryDelay = ANILIST_RATE_LIMIT_BASE_DELAY_MS * (2 ** attempt) + Math.round(Math.random() * 400);
        await sleep(retryDelay);
      }
    }

    const media = data?.Media || null;
    if (!media) {
      return lastMedia;
    }

    lastMedia = media;
    for (const edge of media.characters?.edges || []) {
      const dedupeKey = getAniListCharacterEdgeKey(edge);
      if (seenCharacterKeys.has(dedupeKey)) {
        continue;
      }
      seenCharacterKeys.add(dedupeKey);
      aggregatedEdges.push(edge);
    }

    if (currentPage === 1) {
      staffEdges = media.staff?.edges || [];
    }

    if (options.targetCharacterCount > 0) {
      const filteredKeys = new Set(
        aggregatedEdges.map((edge) => getAniListCharacterEdgeKey(edge)),
      );
      for (const existingKey of options.existingCharacterKeys || []) {
        filteredKeys.add(existingKey);
      }
      if (filteredKeys.size >= options.targetCharacterCount) {
        partialCharacterSync = Boolean(media.characters?.pageInfo?.hasNextPage);
        break;
      }
    }

    if (!media.characters?.pageInfo?.hasNextPage || !(media.characters?.edges || []).length) {
      break;
    }

    currentPage += 1;
    await sleep(500);
  }

  return {
    ...lastMedia,
    characters: {
      ...lastMedia?.characters,
      edges: aggregatedEdges,
    },
    staff: {
      ...lastMedia?.staff,
      edges: staffEdges,
    },
    syncMeta: {
      partialCharacterSync,
    },
  };
}

function filterAniListCharacterEdges(edges, options = {}) {
  const allowedRoles = new Set((options.allowedRoles || ANILIST_CHARACTER_ROLE_OPTIONS).map((role) => String(role || '').toUpperCase()));
  let filtered = (edges || []).filter((edge) => allowedRoles.has(String(edge?.role || '').toUpperCase()));

  if (options.imageOnly) {
    filtered = filtered.filter((edge) => edge?.node?.image?.medium);
  }

  if (options.maxCharactersPerTitle > 0) {
    filtered = filtered.slice(0, options.maxCharactersPerTitle);
  }

  return filtered;
}

export function buildFilteredAniListCharStaffMedia(media, options = {}) {
  if (!media) return media;
  return {
    ...media,
    characters: {
      ...media.characters,
      edges: filterAniListCharacterEdges(media.characters?.edges || [], options),
    },
    syncMeta: media.syncMeta,
  };
}
