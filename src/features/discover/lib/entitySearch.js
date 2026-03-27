// loadTierLibrary removed — tierlists are now searched directly via DB
import { supabase } from '@/shared/lib/supabase';
import { buildTitleSearchCandidates, getAllTitles, isCatalogCacheWarm } from '@/features/discover/lib/recommend';
import { BRAND_NAME } from '@/shared/config/brand';
import { matchesAgeGateMode } from '@/shared/lib/ageGate';
import { CANONICAL_TITLE_BROWSE_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import { getSearchIntent, sortBySearchRelevance, textMatchesQuery } from '@/features/discover/lib/searchMatch';

const PROFILE_SELECT = 'id, name, username, avatar_url, bio, favorite_moods, created_at';
const POST_AUTHOR_SELECT = 'id, name, username, avatar_url';
const TIERLIST_DB_FETCH_LIMIT = 24; // over-fetch before ranking/slice
const POST_DEFAULT_SAMPLE_LIMIT = 24;
const POST_SELECT = `
  id,
  user_id,
  content,
  image_url,
  title_id,
  created_at,
  title:canonical_titles(${CANONICAL_TITLE_BROWSE_SELECT})
`;

const tierlistResultCache = new Map(); // key → { data, ts }
const tierlistInflight    = new Map(); // key → Promise

// ── Entity result cache + in-flight deduplication ───────────────────────────
// Both Header and Discover mount simultaneously with the same query, so they
// would otherwise fire identical DB requests in parallel. The in-flight map
// ensures the second caller reuses the first caller's Promise; the TTL cache
// serves repeat queries within the same session without touching the network.
const RESULT_CACHE_TTL_MS = 60 * 1000; // 60 s — fresh enough for autocomplete

const profileResultCache = new Map(); // key → { data: Profile[], ts: number }
const postResultCache    = new Map(); // key → { data: Post[],    ts: number }
const profileInflight    = new Map(); // key → Promise<Profile[]>
const postInflight       = new Map(); // key → Promise<Post[]>

function withCacheDedup(resultCache, inflightMap, key, fetchFn) {
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.ts < RESULT_CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const existing = inflightMap.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(() => fetchFn())
    .then((data) => {
      resultCache.set(key, { data, ts: Date.now() });
      inflightMap.delete(key);
      return data;
    })
    .catch((err) => {
      inflightMap.delete(key);
      throw err;
    });

  inflightMap.set(key, promise);
  return promise;
}

function sanitizeSearchTerm(value) {
  return String(value || '').trim().replace(/[%_,]/g, '');
}

const TEMPLATE_SELECT = 'id, title, description, category, is_public, is_system, plays, title_ids, updated_at';
const LIST_SEARCH_SELECT = 'id, title, description, is_public, play_count, owner_name, owner_username, updated_at';

async function _fetchTierlists(query, userId) {
  if (!supabase) return [];
  const wildcard = `%${query}%`;

  const [templateRes, publicListRes, ownListRes] = await Promise.all([
    supabase
      .from('tierlist_templates')
      .select(TEMPLATE_SELECT)
      .eq('is_public', true)
      .or(`title.ilike.${wildcard},description.ilike.${wildcard}`)
      .order('plays', { ascending: false })
      .limit(TIERLIST_DB_FETCH_LIMIT),
    supabase
      .from('tierlist_lists')
      .select(LIST_SEARCH_SELECT)
      .eq('is_public', true)
      .or(`title.ilike.${wildcard},description.ilike.${wildcard},owner_name.ilike.${wildcard},owner_username.ilike.${wildcard}`)
      .order('play_count', { ascending: false })
      .limit(TIERLIST_DB_FETCH_LIMIT),
    userId
      ? supabase
          .from('tierlist_lists')
          .select(LIST_SEARCH_SELECT)
          .eq('owner_user_id', userId)
          .or(`title.ilike.${wildcard},description.ilike.${wildcard}`)
          .limit(Math.ceil(TIERLIST_DB_FETCH_LIMIT / 2))
      : Promise.resolve({ data: [] }),
  ]);

  const templates = (templateRes.data || []).map((row) => ({
    id: row.id,
    kind: 'template',
    title: row.title,
    description: row.description || '',
    category: row.category || 'general',
    ownerName: row.is_system ? BRAND_NAME : null,
    ownerUsername: null,
    coverTitleId: Array.isArray(row.title_ids) && row.title_ids.length > 0 ? row.title_ids[0] : null,
    playCount: Number(row.plays || 0),
    updatedAt: row.updated_at,
    href: `/tierlist/template/${row.id}`,
  }));

  const toListEntry = (row) => ({
    id: row.id,
    kind: 'list',
    title: row.title,
    description: row.description || '',
    category: 'community',
    ownerName: row.owner_name || null,
    ownerUsername: row.owner_username || null,
    // coverTitleId not available without fetching rows; resolved below if cache is warm
    coverTitleId: null,
    playCount: Number(row.play_count || 0),
    updatedAt: row.updated_at,
    href: `/tierlist/play/${row.id}`,
  });

  const seen = new Set();
  const lists = [
    ...(publicListRes.data || []),
    ...(ownListRes.data || []),
  ]
    .filter((row) => { if (seen.has(row.id)) return false; seen.add(row.id); return true; })
    .map(toListEntry);

  return [...templates, ...lists];
}

// Fixed sample sizes match the max any surface will request, so the cached
// result is always large enough to slice for both header and discover limits.
const PROFILE_SAMPLE = 24;
const POST_SAMPLE    = 90;

async function _fetchProfiles(normalizedQuery) {
  if (!supabase) return [];

  const sampleLimit = normalizedQuery.length >= 2 ? PROFILE_SAMPLE : 12;
  const requests = [
    supabase
      .from('user_profiles')
      .select(PROFILE_SELECT)
      .eq('is_profile_public', true)
      .order('created_at', { ascending: false })
      .limit(sampleLimit),
  ];

  if (normalizedQuery.length >= 2) {
    requests.push(
      supabase
        .from('user_profiles')
        .select(PROFILE_SELECT)
        .eq('is_profile_public', true)
        .or(`username.ilike.%${normalizedQuery}%,name.ilike.%${normalizedQuery}%,bio.ilike.%${normalizedQuery}%`)
        .order('created_at', { ascending: false })
        .limit(sampleLimit)
    );
  }

  const responses = await Promise.all(requests);
  const mergedProfiles = [];
  const seenProfileIds = new Set();

  responses.forEach(({ data, error }) => {
    if (error) throw error;
    (data || []).forEach((profile) => {
      if (!seenProfileIds.has(profile.id)) {
        seenProfileIds.add(profile.id);
        mergedProfiles.push(profile);
      }
    });
  });

  const intent = getSearchIntent(normalizedQuery);
  const filteredProfiles = mergedProfiles.filter((profile) => (
    normalizedQuery.length < 2 ||
    textMatchesQuery(profile.username, normalizedQuery, { allowTypo: true }) ||
    textMatchesQuery(profile.name, normalizedQuery, { allowTypo: true }) ||
    textMatchesQuery(profile.bio, normalizedQuery) ||
    (profile.favorite_moods || []).some((mood) => textMatchesQuery(mood, normalizedQuery))
  ));

  return sortBySearchRelevance(filteredProfiles, normalizedQuery, (profile) => ([
    {
      weight: 4.9,
      texts: [profile.username],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 280,
        prefixPhrase: 180,
        containsPhrase: 92,
        exactToken: 88,
        wordBoundary: 58,
        prefixToken: 40,
        containsToken: 18,
        typoToken: 15,
      },
    },
    {
      weight: 3.6,
      texts: [profile.name],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 240,
        prefixPhrase: 158,
        containsPhrase: 86,
        exactToken: 82,
        wordBoundary: 50,
        prefixToken: 34,
        containsToken: 16,
        typoToken: 14,
      },
    },
    {
      weight: intent.isBroad ? 0.45 : 1.2,
      texts: [profile.bio],
      longTextPenalty: {
        threshold: 88,
        floor: 0.2,
      },
      matchWeights: {
        containsPhrase: 58,
        exactToken: 44,
        wordBoundary: 28,
        prefixToken: 18,
        containsToken: 10,
      },
    },
    {
      weight: intent.isBroad ? 0.6 : 1.4,
      texts: profile.favorite_moods || [],
      matchWeights: {
        exactPhrase: 200,
        prefixPhrase: 126,
        containsPhrase: 74,
        exactToken: 58,
        wordBoundary: 36,
        prefixToken: 24,
        containsToken: 12,
      },
    },
  ]), (left, right) => (
    new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  ));
  // Return the full ranked sample; callers slice to their display limit.
}

export async function searchProfiles({ query = '', limit = 6 } = {}) {
  const normalizedQuery = sanitizeSearchTerm(query);
  const results = await withCacheDedup(profileResultCache, profileInflight, normalizedQuery, () => _fetchProfiles(normalizedQuery));
  return results.slice(0, limit);
}

export async function searchTierlists({ query = '', userId = null, limit = 6 } = {}) {
  const normalizedQuery = sanitizeSearchTerm(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const intent = getSearchIntent(normalizedQuery);
  // Cache key includes userId so logged-in results (own lists) stay separate.
  const cacheKey = `${normalizedQuery}::${userId || 'anon'}`;
  const rawEntries = await withCacheDedup(
    tierlistResultCache,
    tierlistInflight,
    cacheKey,
    () => _fetchTierlists(normalizedQuery, userId)
  );

  // Resolve cover URLs from the catalog cache only when already warm —
  // avoids blocking search on a full catalog download.
  const allTitles = isCatalogCacheWarm() ? await getAllTitles().catch(() => []) : [];
  const titleById = new Map(allTitles.map((t) => [t.id, t]));
  const entries = rawEntries.map((entry) => ({
    ...entry,
    coverUrl: entry.coverTitleId ? (titleById.get(entry.coverTitleId)?.cover ?? null) : null,
  }));

  return sortBySearchRelevance(entries, normalizedQuery, (entry) => ([
    {
      weight: 4.7,
      texts: [entry.title],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 280,
        prefixPhrase: 180,
        containsPhrase: 96,
        exactToken: 88,
        wordBoundary: 58,
        prefixToken: 40,
        containsToken: 18,
        typoToken: 15,
      },
    },
    {
      weight: 2.4,
      texts: [entry.ownerUsername, entry.ownerName],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 210,
        prefixPhrase: 142,
        containsPhrase: 82,
        exactToken: 70,
        wordBoundary: 46,
        prefixToken: 28,
        containsToken: 14,
        typoToken: 12,
      },
    },
    {
      weight: intent.isBroad ? 1.8 : 1.3,
      texts: [entry.category, entry.kind],
      matchWeights: {
        exactPhrase: 220,
        prefixPhrase: 130,
        containsPhrase: 76,
        exactToken: 64,
        wordBoundary: 42,
        prefixToken: 24,
        containsToken: 12,
      },
    },
    {
      weight: intent.isBroad ? 0.8 : 1.1,
      texts: [entry.description],
      longTextPenalty: {
        threshold: 92,
        floor: 0.22,
      },
      matchWeights: {
        containsPhrase: 56,
        exactToken: 40,
        wordBoundary: 24,
        prefixToken: 16,
        containsToken: 10,
      },
    },
  ]), (left, right) => {
    const updatedDelta = new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return Number(right.playCount || 0) - Number(left.playCount || 0);
  }).slice(0, limit);
}

function mapPostAuthor(record, profileById) {
  const profile = profileById.get(record.user_id);

  return {
    author_id: record.user_id,
    author_name: profile?.name || null,
    author_username: profile?.username || null,
    author_avatar: profile?.avatar_url || null,
  };
}

function matchesPostQuery(post, query) {
  if (!query || query.length < 2) {
    return true;
  }

  return (
    textMatchesQuery(post.author_name, query, { allowTypo: true }) ||
    textMatchesQuery(post.author_username, query, { allowTypo: true }) ||
    [post.title?.title_en, post.title?.title_th, post.title?.title_romaji, post.title?.title_native, post.title?.slug, ...(post.title?.aliases || [])]
      .some((value) => textMatchesQuery(value, query, { allowTypo: true })) ||
    (post.title?.genres || []).some((genre) => textMatchesQuery(genre, query)) ||
    (post.title?.moods || []).some((mood) => textMatchesQuery(mood, query)) ||
    textMatchesQuery(post.content, query)
  );
}

async function getProfilesByIds(userIds = []) {
  const normalizedIds = [...new Set(userIds.filter(Boolean))];

  if (!supabase || normalizedIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select(POST_AUTHOR_SELECT)
    .in('id', normalizedIds);

  if (error) throw error;

  return new Map((data || []).map((profile) => [profile.id, profile]));
}

async function _fetchPosts(normalizedQuery) {
  if (!supabase) return [];

  const intent = getSearchIntent(normalizedQuery);
  const sampleLimit = normalizedQuery.length >= 2 ? POST_SAMPLE : POST_DEFAULT_SAMPLE_LIMIT;

  const requests = [
    supabase
      .from('social_posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .limit(sampleLimit),
  ];

  if (normalizedQuery.length >= 2) {
    requests.push(
      supabase
        .from('social_posts')
        .select(POST_SELECT)
        .ilike('content', `%${normalizedQuery}%`)
        .order('created_at', { ascending: false })
        .limit(sampleLimit)
    );
  }

  const responses = await Promise.all(requests);
  const mergedRows = [];
  const seenPostIds = new Set();

  responses.forEach(({ data, error }) => {
    if (error) {
      throw error;
    }

    (data || []).forEach((row) => {
      if (seenPostIds.has(row.id)) {
        return;
      }

      seenPostIds.add(row.id);
      mergedRows.push(row);
    });
  });

  const authorProfiles = await getProfilesByIds(mergedRows.map((row) => row.user_id));
  const posts = mergedRows
    .map((row) => ({
      id: row.id,
      content: row.content || '',
      image_url: row.image_url || '',
      title_id: row.title_id || null,
      created_at: row.created_at,
      title: row.title ? mapCanonicalTitle(row.title) : null,
      ...mapPostAuthor(row, authorProfiles),
    }))
    .filter((post) => matchesPostQuery(post, normalizedQuery))
    ;

  return sortBySearchRelevance(posts, normalizedQuery, (post) => ([
    ...buildTitleSearchCandidates(post.title || {}, intent),
    {
      weight: 3.5,
      texts: [post.author_username],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 240,
        prefixPhrase: 156,
        containsPhrase: 84,
        exactToken: 76,
        wordBoundary: 50,
        prefixToken: 30,
        containsToken: 14,
        typoToken: 14,
      },
    },
    {
      weight: 2.7,
      texts: [post.author_name],
      allowTypo: true,
      matchWeights: {
        exactPhrase: 210,
        prefixPhrase: 138,
        containsPhrase: 78,
        exactToken: 70,
        wordBoundary: 44,
        prefixToken: 28,
        containsToken: 14,
        typoToken: 12,
      },
    },
    {
      weight: intent.isBroad ? 0.55 : 1.1,
      texts: [post.content],
      longTextPenalty: {
        threshold: 96,
        floor: 0.18,
      },
      matchWeights: {
        containsPhrase: 54,
        exactToken: 42,
        wordBoundary: 24,
        prefixToken: 14,
        containsToken: 9,
      },
    },
  ]), (left, right) => (
    new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
  ));
  // Return the full ranked sample; callers slice to their display limit.
}

export async function searchPosts({ query = '', limit = 6, showAdult = false } = {}) {
  const normalizedQuery = sanitizeSearchTerm(query);
  const results = await withCacheDedup(postResultCache, postInflight, normalizedQuery, () => _fetchPosts(normalizedQuery));
  const filteredResults = results.filter((post) => (
    post.title ? matchesAgeGateMode(post.title, showAdult) : !showAdult
  ));
  return filteredResults.slice(0, limit);
}

export function clearEntitySearchCache() {
  tierlistResultCache.clear();
  tierlistInflight.clear();
  profileResultCache.clear();
  postResultCache.clear();
  profileInflight.clear();
  postInflight.clear();
}
