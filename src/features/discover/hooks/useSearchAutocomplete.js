import { useEffect, useMemo, useRef, useState } from 'react';
import { listTitles, isCatalogCacheWarm } from '@/features/discover/lib/recommend';
import { searchPosts, searchProfiles, searchTierlists } from '@/features/discover/lib/entitySearch';
import { getAutocompleteSelectionBoost } from '@/features/discover/lib/autocompleteFeedback';
import { getSearchIntent, scoreSearchCandidates } from '@/features/discover/lib/searchMatch';
import { expandQuery } from '@/features/discover/lib/searchSynonyms';
import { trackDiscoverEvent } from '@/features/discover/lib/discoverAnalytics';

// ── Module-level score cache ──────────────────────────────────────────────────
// scoreSearchCandidates is pure and expensive (fuzzy scoring over all fields).
// Keyed by item.id within a single query — cleared when query changes so memory
// stays bounded. Both header and discover hook instances share this cache, so
// the same title is scored only once per query even when both surfaces are live.
const _scoreCache = new Map();
let _scoreCacheQuery = '';

function getCachedScore(query, item) {
  if (query !== _scoreCacheQuery) {
    _scoreCache.clear();
    _scoreCacheQuery = query;
  }
  const key = item.id;
  if (_scoreCache.has(key)) return _scoreCache.get(key);
  const score = scoreSearchCandidates(query, item.rankingCandidates || []);
  _scoreCache.set(key, score);
  return score;
}

// ── Module-level group result cache ──────────────────────────────────────────
// Caches toGroupedSuggestions output by (searchQuery + surface) for 3 minutes.
// Eliminates debounce + re-fetch latency when the user re-types the same query,
// and lets header + discover serve results from the same cached payload.
const _groupResultCache = new Map();
const GROUP_CACHE_TTL_MS = 3 * 60 * 1000;

// Per-surface configuration: order groups so the most "navigatable" results come first
// for header (go-to), and more exploratory results are prominent for discover.
const SURFACE_CONFIG = {
  header: {
    groupOrder: ['recent', 'titles', 'people', 'posts', 'tierlists'],
    groupCaps: { recent: 3, titles: 3, people: 2, posts: 2, tierlists: 2 },
  },
  discover: {
    groupOrder: ['recent', 'titles', 'posts', 'people', 'tierlists'],
    groupCaps: { recent: 4, titles: 4, people: 3, posts: 3, tierlists: 3 },
  },
};

function getSurfaceConfig(surface) {
  return SURFACE_CONFIG[surface] || SURFACE_CONFIG.header;
}

function buildDiscoverSearchHref(term) {
  const params = new URLSearchParams();
  if (term) {
    params.set('q', term);
  }

  return params.toString() ? `/discover?${params.toString()}` : '/discover';
}

function getDisplayTitle(title) {
  return title?.title_en || title?.title_th || title?.title_romaji || title?.title_native || title?.slug || 'Untitled';
}

function buildTitleSuggestion(title, index, queryScript = 'latin') {
  // Language-aware weights: boost the script family that matches the query.
  // Cap delta at ±1.4 so a mismatch doesn't make the other script invisible.
  const thaiWeight  = queryScript === 'thai'  ? 5.8 : queryScript === 'latin' ? 3.4 : 4.8;
  const latinWeight = queryScript === 'latin' ? 5.8 : queryScript === 'thai'  ? 3.4 : 4.8;

  // Soft popularity bonus: log-capped at 8 pts so strongly-matching but
  // less-popular titles still win on lexical score (~100+ pts).
  const popularityBonus = Math.min(8, Math.sqrt(title?.popularity || 0) * 0.4);

  return {
    id: `title-${title.id}`,
    entityId: title.id,
    kind: 'title',
    title: getDisplayTitle(title),
    meta: [title.type, title.year].filter(Boolean).join(' / '),
    href: title?.slug ? `/title/${title.slug}` : '/discover',
    thumbnailUrl: title?.cover || '',
    rankHint: index,
    popularityBonus,
    rankingCandidates: [
      {
        // Thai-script title field — no fuzzy match (character-level edit distance
        // doesn't apply meaningfully to Thai orthography).
        weight: thaiWeight,
        texts: [title?.title_th],
        allowTypo: false,
      },
      {
        // Latin-script title fields + aliases
        weight: latinWeight,
        texts: [
          title?.title_en,
          title?.title_romaji,
          title?.title_native,
          title?.slug,
          ...(Array.isArray(title?.aliases) ? title.aliases : []),
        ],
        allowTypo: true,
      },
      {
        weight: 1.8,
        texts: [
          title?.type,
          ...(Array.isArray(title?.genres) ? title.genres : []),
          ...(Array.isArray(title?.moods) ? title.moods : []),
        ],
      },
    ],
  };
}

function buildProfileSuggestion(profile, index) {
  const displayName = profile?.name || profile?.username || 'Unknown user';
  const metaParts = [];

  if (profile?.username) {
    metaParts.push(`@${profile.username}`);
  }

  if (Array.isArray(profile?.favorite_moods) && profile.favorite_moods.length > 0) {
    metaParts.push(profile.favorite_moods.slice(0, 2).join(', '));
  }

  return {
    id: `profile-${profile.id}`,
    entityId: profile.id,
    kind: 'people',
    title: displayName,
    meta: metaParts.join(' / '),
    href: profile?.username ? `/u/${profile.username}` : '/discover',
    thumbnailUrl: profile?.avatar_url || '',
    thumbnailAlt: displayName,
    rankHint: index,
    rankingCandidates: [
      {
        weight: 4.7,
        texts: [profile?.username, profile?.name],
        allowTypo: true,
      },
      {
        weight: 1.6,
        texts: [profile?.bio, ...(Array.isArray(profile?.favorite_moods) ? profile.favorite_moods : [])],
      },
    ],
  };
}

function buildPostSuggestion(post, index) {
  const titleLabel = post?.title?.title_en || post?.title?.title_th || post?.title?.title_native || post?.title?.slug || '';
  const excerpt = String(post?.content || '').trim();
  const displayTitle = excerpt || titleLabel || post?.author_name || post?.author_username || 'Untitled post';
  const metaParts = [];

  if (post?.author_username) {
    metaParts.push(`@${post.author_username}`);
  } else if (post?.author_name) {
    metaParts.push(post.author_name);
  }

  if (titleLabel) {
    metaParts.push(titleLabel);
  }

  // Freshness bonus: posts within 7 days get up to +14 pts, decaying linearly.
  const ageMs = post?.created_at ? Date.now() - new Date(post.created_at).getTime() : null;
  const freshnessBonus = ageMs !== null ? Math.max(0, 14 - (ageMs / (24 * 3600 * 1000)) * 2) : 0;

  return {
    id: `post-${post.id}`,
    entityId: post.id,
    kind: 'posts',
    title: displayTitle,
    meta: metaParts.join(' / '),
    description: excerpt && titleLabel ? titleLabel : '',
    href: post.id ? `/feed?post=${post.id}` : '/feed',
    thumbnailUrl: post?.image_url || post?.title?.cover || post?.author_avatar || '',
    thumbnailAlt: titleLabel || displayTitle,
    freshnessBonus,
    rankHint: index,
    rankingCandidates: [
      {
        weight: 4.1,
        texts: [post?.content, titleLabel],
        allowTypo: true,
      },
      {
        weight: 2.4,
        texts: [post?.author_username, post?.author_name],
        allowTypo: true,
      },
    ],
  };
}

function buildTierlistSuggestion(item, index) {
  const metaParts = [];

  if (item?.ownerUsername || item?.ownerName) {
    metaParts.push(item.ownerUsername ? `@${item.ownerUsername}` : item.ownerName);
  }

  if (item?.kind) {
    metaParts.push(item.kind);
  }

  return {
    id: `tierlist-${item.kind}-${item.id}`,
    entityId: item.id,
    kind: 'tierlists',
    title: item?.title || 'Untitled list',
    meta: metaParts.join(' / '),
    href: item?.href || '/discover',
    thumbnailUrl: item?.coverUrl || '',
    rankHint: index,
    rankingCandidates: [
      {
        weight: 4.4,
        texts: [item?.title],
        allowTypo: true,
      },
      {
        weight: 1.9,
        texts: [item?.ownerUsername, item?.ownerName, item?.category, item?.kind],
      },
      {
        weight: 1.2,
        texts: [item?.description],
      },
    ],
  };
}

function buildRecentSuggestion(term, index) {
  return {
    id: `recent-${String(term || '').trim().toLowerCase()}-${index}`,
    entityId: term,
    kind: 'recent',
    title: term,
    meta: '',
    href: buildDiscoverSearchHref(term),
    searchTerm: term,
    rankHint: index,
    rankingCandidates: [
      {
        weight: 5,
        texts: [term],
      },
    ],
  };
}

function sortSuggestionItems(items = [], query = '') {
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery) {
    return [...items];
  }

  const intent = getSearchIntent(normalizedQuery);
  const queryLower = normalizedQuery.toLowerCase();

  return [...items].sort((left, right) => {
    const leftLexical = getCachedScore(normalizedQuery, left);
    const rightLexical = getCachedScore(normalizedQuery, right);

    // Exact display-name match → push to the very top regardless of other factors
    const leftExact = (left.title || '').toLowerCase() === queryLower ? 600 : 0;
    const rightExact = (right.title || '').toLowerCase() === queryLower ? 600 : 0;

    // Broad query: dampen items that only matched loosely (metadata, not name)
    const leftBroadMult = intent.isBroad && leftExact === 0 && leftLexical < 80 ? 0.55 : 1;
    const rightBroadMult = intent.isBroad && rightExact === 0 && rightLexical < 80 ? 0.55 : 1;

    // Behavior boost: cap at 55% of the item's own lexical score so past clicks
    // can't override a clearly better new match
    const rawLeftBoost = getAutocompleteSelectionBoost(normalizedQuery, left.id);
    const rawRightBoost = getAutocompleteSelectionBoost(normalizedQuery, right.id);
    const leftBoost = leftLexical > 0 ? Math.min(rawLeftBoost, leftLexical * 0.55) : rawLeftBoost * 0.2;
    const rightBoost = rightLexical > 0 ? Math.min(rawRightBoost, rightLexical * 0.55) : rawRightBoost * 0.2;

    const leftScore = (leftLexical * leftBroadMult) + leftBoost + (left.freshnessBonus || 0) + (left.popularityBonus || 0) + leftExact;
    const rightScore = (rightLexical * rightBroadMult) + rightBoost + (right.freshnessBonus || 0) + (right.popularityBonus || 0) + rightExact;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    const leftRank = Number.isFinite(left.rankHint) ? left.rankHint : Number.MAX_SAFE_INTEGER;
    const rightRank = Number.isFinite(right.rankHint) ? right.rankHint : Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return String(left.title || '').localeCompare(String(right.title || ''));
  });
}

function flattenSuggestionGroups(groups = [], query = '') {
  const flatItems = [];
  const normalizedGroups = groups
    .map((group) => ({
      ...group,
      items: sortSuggestionItems(group.items || [], query),
    }))
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const flatItem = {
          ...item,
          groupId: group.id,
          flatIndex: flatItems.length,
        };
        flatItems.push(flatItem);
        return flatItem;
      }),
    }));

  return {
    groups: normalizedGroups,
    flatItems,
  };
}

function buildRecentSearchGroup(recentSearches = [], query = '', cap = 4) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const items = (Array.isArray(recentSearches) ? recentSearches : [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length >= 2)
    .filter((entry) => !normalizedQuery || entry.toLowerCase().includes(normalizedQuery))
    .slice(0, cap)
    .map((entry, index) => buildRecentSuggestion(entry, index));

  if (items.length === 0) {
    return null;
  }

  return {
    id: 'recent',
    labelKey: 'discover.recentSearchesLabel',
    items,
  };
}

function toGroupedSuggestions({ titles = [], posts = [], profiles = [], tierlists = [], surface = 'header', queryScript = 'latin' } = {}) {
  const { groupOrder, groupCaps } = getSurfaceConfig(surface);

  const allGroups = {
    titles: { id: 'titles', labelKey: 'discover.scopeTitles', items: titles.slice(0, groupCaps.titles).map((title, index) => buildTitleSuggestion(title, index, queryScript)) },
    posts:  { id: 'posts',  labelKey: 'discover.scopePosts',   items: posts.slice(0, groupCaps.posts).map((post, index) => buildPostSuggestion(post, index)) },
    people: { id: 'people', labelKey: 'discover.scopePeople',  items: profiles.slice(0, groupCaps.people).map((profile, index) => buildProfileSuggestion(profile, index)) },
    tierlists: { id: 'tierlists', labelKey: 'discover.scopeTierlists', items: tierlists.slice(0, groupCaps.tierlists).map((item, index) => buildTierlistSuggestion(item, index)) },
  };

  return groupOrder
    .filter((id) => id !== 'recent' && allGroups[id])
    .map((id) => allGroups[id])
    .filter((group) => group.items.length > 0);
}

export function useSearchAutocomplete(query, { enabled = true, userId = null, recentSearches = [], surface = 'header', showAdult = false } = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [liveGroups, setLiveGroups] = useState([]);
  const [recoveryTitles, setRecoveryTitles] = useState([]);
  const requestRef = useRef(0);
  const recoveryRef = useRef(0);
  const prevLoadingRef = useRef(false);
  const normalizedQuery = useMemo(() => String(query || '').trim(), [query]);
  // searchQuery applies synonym/abbreviation/typo expansion for fetches and ranking.
  // normalizedQuery is kept for UI display, event tracking, and recent-search filtering.
  const searchQuery = useMemo(() => expandQuery(normalizedQuery), [normalizedQuery]);
  const canSearch = enabled && normalizedQuery.length >= 2;
  const { groupCaps } = getSurfaceConfig(surface);

  const recentGroup = useMemo(
    () => buildRecentSearchGroup(recentSearches, normalizedQuery, groupCaps.recent),
    [normalizedQuery, recentSearches, groupCaps.recent]
  );

  useEffect(() => {
    if (!canSearch) {
      requestRef.current += 1;
      return undefined;
    }

    // Group result cache hit: serve immediately, skip debounce + re-fetch.
    const cacheKey = `${searchQuery}:${surface}:${showAdult ? 'adult' : 'normal'}`;
    const cacheHit = _groupResultCache.get(cacheKey);
    if (cacheHit && Date.now() - cacheHit.ts < GROUP_CACHE_TTL_MS) {
      const frameId = window.requestAnimationFrame(() => {
        setLiveGroups(cacheHit.groups);
        setIsLoading(false);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const requestId = ++requestRef.current;
    const loadingFrameId = window.requestAnimationFrame(() => {
      if (requestId === requestRef.current) {
        setIsLoading(true);
      }
    });

    // Adaptive debounce: 80ms when catalog cache is warm (client-side search
    // is near-instant), 220ms when cold (needs network round-trip).
    const debounceMs = isCatalogCacheWarm() ? 80 : 220;
    const timeoutId = window.setTimeout(async () => {
      const intent = getSearchIntent(searchQuery);

      const [titlesResult, postsResult, profilesResult, tierlistsResult] = await Promise.allSettled([
        listTitles({ query: searchQuery, page: 1, pageSize: groupCaps.titles + 1, showAdult }),
        searchPosts({ query: searchQuery, limit: groupCaps.posts + 1, showAdult }),
        searchProfiles({ query: searchQuery, limit: groupCaps.people + 1 }),
        searchTierlists({ query: searchQuery, userId, limit: groupCaps.tierlists + 1 }),
      ]);

      if (requestId !== requestRef.current) {
        return;
      }

      const groups = toGroupedSuggestions({
        titles: titlesResult.status === 'fulfilled' ? titlesResult.value.items || [] : [],
        posts: postsResult.status === 'fulfilled' ? postsResult.value || [] : [],
        profiles: profilesResult.status === 'fulfilled' ? profilesResult.value || [] : [],
        tierlists: tierlistsResult.status === 'fulfilled' ? tierlistsResult.value || [] : [],
        surface,
        queryScript: intent.queryScript,
      });
      _groupResultCache.set(cacheKey, { groups, ts: Date.now() });
      setLiveGroups(groups);
      setIsLoading(false);
    }, debounceMs);

    return () => {
      window.cancelAnimationFrame(loadingFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [canSearch, searchQuery, showAdult, userId, surface, groupCaps.titles, groupCaps.posts, groupCaps.people, groupCaps.tierlists]);

  // Fire no_results_view once when a search finishes with zero live results.
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && canSearch && liveGroups.length === 0) {
      void trackDiscoverEvent({
        eventType: 'no_results_view',
        userId,
        query: normalizedQuery,
        metadata: {
          surface,
          query_length: normalizedQuery.length,
        },
      });
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, canSearch, liveGroups.length, normalizedQuery, surface, userId]);

  // Recovery search: when all live groups are empty after a query of >= 3 chars,
  // try the expanded query + component tokens to surface "Did you mean?" alternatives.
  useEffect(() => {
    if (isLoading || !canSearch || normalizedQuery.length < 3 || liveGroups.length > 0) {
      const frameId = window.requestAnimationFrame(() => {
        setRecoveryTitles([]);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const tokens = searchQuery.split(/\s+/);
    const firstToken = tokens[0];
    const lastToken = tokens[tokens.length - 1];
    // Always try full query (catches single-word typos); add component tokens for multi-word
    const recoveryCandidates = new Set([searchQuery]);
    if (firstToken && firstToken.length >= 3 && firstToken !== searchQuery) {
      recoveryCandidates.add(firstToken);
    }
    if (lastToken && lastToken.length >= 3 && lastToken !== searchQuery && lastToken !== firstToken) {
      recoveryCandidates.add(lastToken);
    }

    const recoveryId = ++recoveryRef.current;
    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await Promise.allSettled(
          [...recoveryCandidates].map((term) => listTitles({ query: term, page: 1, pageSize: 5, showAdult }))
        );
        if (recoveryId !== recoveryRef.current) return;
        const seen = new Set();
        const titles = [];
        results.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          (result.value.items || []).forEach((item) => {
            const name = getDisplayTitle(item);
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              titles.push(name);
            }
          });
        });
        setRecoveryTitles(titles.slice(0, 4));
      } catch {
        // ignore
      }
    }, 240);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading, canSearch, normalizedQuery, searchQuery, showAdult, liveGroups.length]);

  // Cross-lane note: titles absent but other content lanes found results
  const crossLaneNote = useMemo(() => {
    if (!canSearch || isLoading || liveGroups.length === 0) return null;
    if (liveGroups.some((g) => g.id === 'titles')) return null;
    const otherIds = liveGroups.map((g) => g.id).filter((id) => id !== 'recent');
    return otherIds.length > 0 ? otherIds : null;
  }, [canSearch, isLoading, liveGroups]);

  // Recovery group: "Did you mean?" suggestions shown when all lanes are empty
  const recoveryGroup = useMemo(() => {
    if (!canSearch || isLoading || liveGroups.length > 0 || recoveryTitles.length === 0) return null;
    return {
      id: 'recovery',
      labelKey: 'discover.recoverySuggestedMany',
      items: recoveryTitles.map((title, index) => ({
        id: `recovery-${index}-${title}`,
        entityId: title,
        kind: 'recovery',
        title,
        meta: '',
        href: `/discover?q=${encodeURIComponent(title)}`,
        rankHint: index,
        rankingCandidates: [],
      })),
    };
  }, [canSearch, isLoading, liveGroups.length, recoveryTitles]);

  // Use the expanded searchQuery for scoring so synonym-expanded terms rank correctly.
  // recentGroup filtering continues to use normalizedQuery (user's actual input).
  const mergedSuggestions = useMemo(
    () => flattenSuggestionGroups([
      ...(recentGroup ? [recentGroup] : []),
      ...(canSearch ? liveGroups : []),
      ...(recoveryGroup ? [recoveryGroup] : []),
    ], searchQuery),
    [canSearch, liveGroups, searchQuery, recentGroup, recoveryGroup]
  );

  // Prefetch the routes of the top 3 live results once loading settles.
  // Uses <link rel="prefetch"> so the browser can load them during idle time.
  useEffect(() => {
    if (!canSearch || isLoading || liveGroups.length === 0) return undefined;

    const hrefs = liveGroups
      .flatMap((group) => group.items || [])
      .slice(0, 3)
      .map((item) => item.href)
      .filter((href) => href && href.startsWith('/'));

    if (hrefs.length === 0) return undefined;

    const injected = hrefs
      .filter((href) => !document.head.querySelector(`link[rel="prefetch"][href="${href}"]`))
      .map((href) => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
        return link;
      });

    return () => injected.forEach((link) => link.parentNode?.removeChild(link));
  }, [canSearch, isLoading, liveGroups]);

  return {
    groups: mergedSuggestions.groups,
    flatItems: mergedSuggestions.flatItems,
    isLoading: canSearch ? isLoading : false,
    hasQuery: normalizedQuery.length >= 2,
    crossLaneNote,
  };
}
