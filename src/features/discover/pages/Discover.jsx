import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Clapperboard,
  Compass,
  History,
  Info,
  ListOrdered,
  Loader2,
  MessageCircle,
  Pin,
  PinOff,
  PencilLine,
  ScrollText,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X as XIcon,
} from 'lucide-react';
import { buildTitleSearchCandidates, listTitles, getCacheInfo, clearTitlesCache, getCachedTitlesSnapshot, isCatalogCacheWarm } from '@/features/discover/lib/recommend';
import { recordAutocompleteSelection } from '@/features/discover/lib/autocompleteFeedback';
import { clearEntitySearchCache, searchPosts, searchProfiles, searchTierlists } from '@/features/discover/api/entitySearchApi';
import { DiscoverProfileCard } from '@/features/discover/components/DiscoverProfileCard';
import { DiscoverPostCard } from '@/features/discover/components/DiscoverPostCard';
import { DiscoverSection } from '@/features/discover/components/DiscoverSection';
import { DiscoverTierlistCard } from '@/features/discover/components/DiscoverTierlistCard';
import { DiscoverTitleCard } from '@/features/discover/components/DiscoverTitleCard';
import { getDisplayTitle } from '@/features/discover/lib/discoverPageUtils';
import { getSearchIntent, scoreSearchCandidates, sortBySearchRelevance } from '@/features/discover/lib/searchMatch';
import { useDiscoverSavedSearches } from '@/features/discover/hooks/useDiscoverSavedSearches';
import { trackDiscoverEvent } from '@/features/discover/api/discoverAnalyticsApi';
import {
  MAX_RECENT_SEARCHES,
  areSearchPresetsEqual,
  clearRecentSearches as clearRecentSearchesStorage,
  readRecentSearches,
  sanitizeSavedSearch,
  writeRecentSearches,
} from '@/features/discover/lib/discoverSearchState';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { BRAND_NAME } from '@/shared/config/brand';
import {
  buildRecommendationState,
  filterHiddenTitles,
  filterSeenTitles,
  filterTitlesByRecommendationPreferences,
  prioritizeUnseenTitles,
} from '@/features/profile/lib/profileStore';
import { TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Button } from '@/shared/components/ui/Button';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';
import { useSearchAutocomplete } from '@/features/discover/hooks/useSearchAutocomplete';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import '../styles/Discover.css';

const SEARCH_SCOPE_TABS = [
  { id: 'all', labelKey: 'discover.scopeAll', icon: Compass },
  { id: 'titles', labelKey: 'discover.scopeTitles', icon: Search },
  { id: 'posts', labelKey: 'discover.scopePosts', icon: MessageCircle },
  { id: 'people', labelKey: 'discover.scopePeople', icon: Users },
  { id: 'tierlists', labelKey: 'discover.scopeTierlists', icon: ListOrdered },
];

const TITLE_TYPE_TABS = [
  { id: 'all', labelKey: 'discover.typeAll', icon: Compass },
  { id: 'anime', labelKey: 'discover.typeAnime', icon: Clapperboard },
  { id: 'manga', labelKey: 'discover.typeManga', icon: BookOpen },
  { id: 'manhwa', labelKey: 'discover.typeManhwa', icon: ScrollText },
];

const QUICK_TAGS = ['manhwa', 'action', 'romance', 'isekai', 'comedy', 'horror'];
const TITLE_PREVIEW_SIZE = 6;
const TITLE_PAGE_SIZE = 20;
const ENTITY_PREVIEW_LIMIT = 6;
const ENTITY_FULL_LIMIT = 18;
const ENTITY_FOCUSED_PREVIEW_LIMIT = 4;
const ENTITY_FOCUSED_FULL_LIMIT = 12;
const SUGGESTED_SEARCHES = [
  { id: 'frieren', labelKey: 'discover.suggestionFrieren', scope: 'titles', query: 'Frieren', titleType: 'anime' },
  { id: 'action', labelKey: 'discover.suggestionAction', scope: 'titles', query: '', tag: 'action', titleType: 'all' },
  { id: 'people', labelKey: 'discover.suggestionPeople', scope: 'people', query: '', tag: '', titleType: 'all' },
  { id: 'tierlists', labelKey: 'discover.suggestionTierlists', scope: 'tierlists', query: 'romance', tag: '', titleType: 'all' },
];
const CURATED_LANES = [
  {
    id: 'titles',
    icon: BookOpen,
    titleKey: 'discover.laneTitlesTitle',
    descriptionKey: 'discover.laneTitlesDescription',
    countLabelKey: 'discover.laneTitlesCount',
    preset: { scope: 'titles', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'posts',
    icon: MessageCircle,
    titleKey: 'discover.lanePostsTitle',
    descriptionKey: 'discover.lanePostsDescription',
    countLabelKey: 'discover.lanePostsCount',
    preset: { scope: 'posts', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'people',
    icon: Users,
    titleKey: 'discover.lanePeopleTitle',
    descriptionKey: 'discover.lanePeopleDescription',
    countLabelKey: 'discover.lanePeopleCount',
    preset: { scope: 'people', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'tierlists',
    icon: ListOrdered,
    titleKey: 'discover.laneTierlistsTitle',
    descriptionKey: 'discover.laneTierlistsDescription',
    countLabelKey: 'discover.laneTierlistsCount',
    preset: { scope: 'tierlists', query: '', tag: '', titleType: 'all' },
  },
];

function describeSearchPreset(preset, t) {
  if (preset?.label) {
    return preset.label;
  }

  const parts = [];
  const scopeTab = SEARCH_SCOPE_TABS.find((item) => item.id === preset.scope);
  const typeTab = TITLE_TYPE_TABS.find((item) => item.id === preset.titleType);

  if (preset.query) {
    parts.push(preset.query);
  }

  if (preset.tag) {
    parts.push(`#${preset.tag}`);
  }

  if (preset.scope !== 'all' && scopeTab) {
    parts.push(t(scopeTab.labelKey));
  }

  if (preset.scope !== 'posts' && preset.scope !== 'people' && preset.scope !== 'tierlists' && preset.titleType !== 'all' && typeTab) {
    parts.push(t(typeTab.labelKey));
  }

  return parts.join(' · ') || t('discover.scopeAll');
}

function resolveDiscoverEntityLimit(scope, query) {
  const intent = getSearchIntent(query);
  const isEntityScope = scope === 'people' || scope === 'posts' || scope === 'tierlists';

  if (!isEntityScope) {
    return intent.isBroad || intent.isShort ? ENTITY_PREVIEW_LIMIT : ENTITY_FOCUSED_PREVIEW_LIMIT;
  }

  return intent.isBroad || intent.isShort ? ENTITY_FULL_LIMIT : ENTITY_FOCUSED_FULL_LIMIT;
}


export function Discover() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [activeTag, setActiveTag] = useState('');
  const [activeScope, setActiveScope] = useState('all');
  const [activeTitleType, setActiveTitleType] = useState('all');
  const [hideSeen, setHideSeen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [recentSearches, setRecentSearches] = useState([]);
  const [editingSavedSearchId, setEditingSavedSearchId] = useState(null);
  const [savedSearchLabelDraft, setSavedSearchLabelDraft] = useState('');
  const [showSearchWorkbench, setShowSearchWorkbench] = useState(false);
  const [searchAutocompleteOpen, setSearchAutocompleteOpen] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [recoverySuggestions, setRecoverySuggestions] = useState([]);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
  const [sortBy, setSortBy] = useState('popularity');
  const [catalogInfo, setCatalogInfo] = useState(getCacheInfo());
  const [titlesState, setTitlesState] = useState({
    items: [],
    total: 0,
    totalPages: 1,
    page: 1,
  });
  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [tierlists, setTierlists] = useState([]);
  const [loadingState, setLoadingState] = useState({
    titles: false,
    posts: false,
    people: false,
    tierlists: false,
  });
  const [errorState, setErrorState] = useState({
    titles: '',
    posts: '',
    people: '',
    tierlists: '',
  });
  const browseSectionRef = useRef(null);
  const loadRequestRef = useRef(0);
  const searchInputRef = useRef(null);
  const searchFormRef = useRef(null);
  const helperChipRefs = useRef([]);
  const savedSearchInputRef = useRef(null);
  const lastTrackedSearchKeyRef = useRef('');
  const suppressUrlQuerySyncRef = useRef(false);
  const lastHandledGlobalSearchRef = useRef(0);
  const recoveryRequestRef = useRef(0);

  const { watchlist } = useWatchlist();
  const { hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const {
    savedSearches,
    isLoading: isSavedSearchesLoading,
    error: savedSearchesError,
    saveSearch,
    renameSearch,
    togglePinSearch,
    deleteSearch,
    clearAllSearches,
  } = useDiscoverSavedSearches(t);
  const recommendationState = useMemo(
    () => buildRecommendationState(watchlist, prefs, hiddenFromDiscoveryIds),
    [watchlist, prefs, hiddenFromDiscoveryIds]
  );
  const {
    groups: autocompleteGroups,
    flatItems: autocompleteItems,
    isLoading: isAutocompleteLoading,
    hasQuery: hasAutocompleteQuery,
  } = useSearchAutocomplete(query, {
    enabled: searchAutocompleteOpen,
    userId: user?.id || null,
    recentSearches,
    surface: 'discover',
    showAdult,
  });

  useEffect(() => {
    setHideSeen(prefs.hideSeenByDefault);
  }, [prefs.hideSeenByDefault]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  const refreshRecentSearches = useCallback(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    window.addEventListener('focus', refreshRecentSearches);
    window.addEventListener('storage', refreshRecentSearches);

    return () => {
      window.removeEventListener('focus', refreshRecentSearches);
      window.removeEventListener('storage', refreshRecentSearches);
    };
  }, [refreshRecentSearches]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchFormRef.current && !searchFormRef.current.contains(event.target)) {
        setSearchAutocompleteOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedSuggestionIndex(-1);
  }, [query, searchAutocompleteOpen]);

  const syncQueryToUrl = useCallback((nextQuery) => {
    suppressUrlQuerySyncRef.current = true;
    const nextParams = new URLSearchParams(searchParams);

    if (nextQuery) {
      nextParams.set('q', nextQuery);
    } else {
      nextParams.delete('q');
    }

    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateQuery = useCallback((nextQuery, { resetPage = true, syncUrl = true } = {}) => {
    setQuery(nextQuery);

    if (resetPage) {
      setCurrentPage(1);
    }

    if (syncUrl) {
      syncQueryToUrl(nextQuery);
    }
  }, [syncQueryToUrl]);

  const rememberRecentSearch = useCallback((term) => {
    const normalizedTerm = String(term || '').trim();
    if (normalizedTerm.length < 2) {
      return;
    }

    setRecentSearches((current) => {
      const next = [
        normalizedTerm,
        ...current.filter((entry) => entry.toLowerCase() !== normalizedTerm.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    clearRecentSearchesStorage();
  }, []);

  const currentSearchPreset = useMemo(() => sanitizeSavedSearch({
    id: 'current',
    query,
    tag: activeTag,
    scope: activeScope,
    titleType: activeTitleType,
  }), [activeScope, activeTag, activeTitleType, query]);

  const hasSavableSearch = Boolean(currentSearchPreset);
  const isCurrentSearchSaved = currentSearchPreset
    ? savedSearches.some((entry) => areSearchPresetsEqual(entry, currentSearchPreset))
    : false;

  const saveCurrentSearch = useCallback(() => {
    if (!currentSearchPreset) {
      return;
    }

    void saveSearch({
      ...currentSearchPreset,
      label: describeSearchPreset(currentSearchPreset, t),
    });
    void trackDiscoverEvent({
      eventType: 'saved_search_create',
      userId: user?.id || null,
      query,
      scope: activeScope,
      titleType: activeTitleType,
      tag: activeTag,
      metadata: {
        source: 'discover_shell',
      },
    });
    toast.success(t('discover.savedSearchCreated'));
  }, [activeScope, activeTag, activeTitleType, currentSearchPreset, query, saveSearch, t, user?.id]);

  const loadDiscoverData = useCallback(async ({
    page = activeScope === 'titles' ? currentPage : 1,
    titleType = activeTitleType,
    searchValue = query,
    tagValue = activeTag,
    sortValue = sortBy,
    scope = activeScope,
  } = {}) => {
    const requestId = ++loadRequestRef.current;
    const titlePageSize = scope === 'titles' ? TITLE_PAGE_SIZE : TITLE_PREVIEW_SIZE;
    const entityLimit = resolveDiscoverEntityLimit(scope, searchValue);

    setLoadingState({
      titles: true,
      posts: true,
      people: true,
      tierlists: true,
    });
    setErrorState({
      titles: '',
      posts: '',
      people: '',
      tierlists: '',
    });

    const [titlesResult, postsResult, profilesResult, tierlistsResult] = await Promise.allSettled([
      listTitles({
        type: titleType,
        query: searchValue,
        tag: tagValue,
        sortBy: sortValue,
        page,
        pageSize: titlePageSize,
        showAdult,
      }),
      searchPosts({
        query: searchValue,
        limit: entityLimit,
        showAdult,
      }),
      searchProfiles({
        query: searchValue,
        limit: entityLimit,
      }),
      searchTierlists({
        query: searchValue,
        userId: user?.id || null,
        limit: entityLimit,
      }),
    ]);

    if (requestId !== loadRequestRef.current) {
      return;
    }

    startTransition(() => {
      if (titlesResult.status === 'fulfilled') {
        setTitlesState(titlesResult.value);
        setCurrentPage(titlesResult.value.page);
        setCatalogInfo(getCacheInfo());
        setLoadingState((current) => ({ ...current, titles: false }));
      } else {
        console.error(titlesResult.reason);
        setTitlesState({ items: [], total: 0, totalPages: 1, page: 1 });
        setCatalogInfo(getCacheInfo());
        setErrorState((current) => ({ ...current, titles: titlesResult.reason?.message || t('discover.discoverCatalogError') }));
        setLoadingState((current) => ({ ...current, titles: false }));
      }

      if (postsResult.status === 'fulfilled') {
        setPosts(postsResult.value);
        setLoadingState((current) => ({ ...current, posts: false }));
      } else {
        console.error(postsResult.reason);
        setPosts([]);
        setErrorState((current) => ({ ...current, posts: postsResult.reason?.message || t('discover.postsLoadError') }));
        setLoadingState((current) => ({ ...current, posts: false }));
      }

      if (profilesResult.status === 'fulfilled') {
        setProfiles(profilesResult.value);
        setLoadingState((current) => ({ ...current, people: false }));
      } else {
        console.error(profilesResult.reason);
        setProfiles([]);
        setErrorState((current) => ({ ...current, people: profilesResult.reason?.message || t('discover.peopleLoadError') }));
        setLoadingState((current) => ({ ...current, people: false }));
      }

      if (tierlistsResult.status === 'fulfilled') {
        setTierlists(tierlistsResult.value);
        setLoadingState((current) => ({ ...current, tierlists: false }));
      } else {
        console.error(tierlistsResult.reason);
        setTierlists([]);
        setErrorState((current) => ({ ...current, tierlists: tierlistsResult.reason?.message || t('discover.tierlistsLoadError') }));
        setLoadingState((current) => ({ ...current, tierlists: false }));
      }
    });
  }, [activeScope, activeTag, activeTitleType, currentPage, query, showAdult, sortBy, t, user?.id]);

  const scrollToBrowseSection = useCallback(() => {
    browseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDiscoverData({
        page: activeScope === 'titles' ? currentPage : 1,
      });
    }, query.trim().length >= 2 ? 220 : activeTag ? 120 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeScope, activeTag, activeTitleType, currentPage, loadDiscoverData, query, sortBy]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      rememberRecentSearch(normalizedQuery);
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [query, rememberRecentSearch]);

  useEffect(() => {
    const handleRebuild = () => {
      clearTitlesCache();
      clearEntitySearchCache();
      setCatalogInfo(getCacheInfo());
      loadDiscoverData({
        page: activeScope === 'titles' ? currentPage : 1,
      });
    };

    window.addEventListener('moodtoon:recommendations-rebuild', handleRebuild);
    return () => window.removeEventListener('moodtoon:recommendations-rebuild', handleRebuild);
  }, [activeScope, currentPage, loadDiscoverData]);

  useEffect(() => {
    if (suppressUrlQuerySyncRef.current) {
      suppressUrlQuerySyncRef.current = false;
      return;
    }

    const nextUrlQuery = new URLSearchParams(location.search).get('q') || '';
    setQuery(nextUrlQuery);
    setActiveScope('all');
    setActiveTitleType('all');
    setActiveTag('');
    setCurrentPage(1);
  }, [location.search]);

  useEffect(() => {
    const globalSearch = location.state?.globalSearch;

    if (!globalSearch?.submittedAt || lastHandledGlobalSearchRef.current === globalSearch.submittedAt) {
      return;
    }

    lastHandledGlobalSearchRef.current = globalSearch.submittedAt;
    updateQuery(globalSearch.query || '', { syncUrl: false });
    setActiveScope('all');
    setActiveTitleType('all');
    setActiveTag('');
  }, [location.state, updateQuery]);

  // Reload when 18+ mode changes
  useEffect(() => {
    setCurrentPage(1);
    loadDiscoverData({ page: 1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdult]);

  const filteredTitles = useMemo(() => (
    filterSeenTitles(
      filterTitlesByRecommendationPreferences(
        filterHiddenTitles(prioritizeUnseenTitles(titlesState.items, recommendationState), recommendationState),
        recommendationState
      ),
      recommendationState,
      hideSeen
    )
  ), [titlesState.items, recommendationState, hideSeen]);

  const searchIntent = useMemo(() => getSearchIntent(query), [query]);

  const rankedTitles = useMemo(() => {
    if (query.trim().length < 2) {
      return filteredTitles;
    }

    return sortBySearchRelevance(filteredTitles, query, (title) => buildTitleSearchCandidates(title, searchIntent), (left, right) => (
      Number(right.popularity || 0) - Number(left.popularity || 0)
    ));
  }, [filteredTitles, query, searchIntent]);

  const activeTitleLabel = useMemo(() => {
    const activeTab = TITLE_TYPE_TABS.find((tab) => tab.id === activeTitleType) || TITLE_TYPE_TABS[0];
    return t(activeTab.labelKey);
  }, [activeTitleType, t]);

  const normalizedQuery = query.trim();
  const hasAnyQuery = normalizedQuery.length > 0;
  const hasCommittedQuery = normalizedQuery.length >= 2;
  const hasActiveTag = Boolean(activeTag);
  const isIdleDiscover = activeScope === 'all' && !hasAnyQuery && !hasActiveTag;
  const visibleRecentSearches = hasAnyQuery ? [] : recentSearches;
  const hasAnyLoading = loadingState.titles || loadingState.posts || loadingState.people || loadingState.tierlists;
  const visibleTitleCount = rankedTitles.length;
  const titleScopeCount = titlesState.total;
  const allScopeCount = visibleTitleCount + posts.length + profiles.length + tierlists.length;
  const noResultsEverywhere = !loadingState.titles
    && !loadingState.posts
    && !loadingState.people
    && !loadingState.tierlists
    && visibleTitleCount === 0
    && posts.length === 0
    && profiles.length === 0
    && tierlists.length === 0
    && !errorState.titles
    && !errorState.posts
    && !errorState.people
    && !errorState.tierlists;
  const visibleRecoverySuggestions = noResultsEverywhere && normalizedQuery.length >= 3 ? recoverySuggestions : [];
  const isVisibleRecoveryLoading = noResultsEverywhere && normalizedQuery.length >= 3 ? isRecoveryLoading : false;
  const hasDiscoverFilters = hasCommittedQuery || hasActiveTag || activeScope !== 'all' || activeTitleType !== 'all';
  const showScopeCounts = hasAnyQuery || hasActiveTag || activeScope !== 'all' || activeTitleType !== 'all' || hasAnyLoading;

  // Cross-lane fallback: titles found nothing, but other lanes have results.
  const crossLaneFallback = useMemo(() => {
    if (
      activeScope !== 'all' ||
      loadingState.titles ||
      loadingState.posts ||
      loadingState.people ||
      loadingState.tierlists ||
      !hasCommittedQuery ||
      visibleTitleCount > 0 ||
      noResultsEverywhere
    ) {
      return null;
    }
    const lanes = [];
    if (posts.length > 0) lanes.push(t('discover.scopePosts'));
    if (profiles.length > 0) lanes.push(t('discover.scopePeople'));
    if (tierlists.length > 0) lanes.push(t('discover.scopeTierlists'));
    return lanes.length > 0 ? lanes.join(', ') : null;
  }, [activeScope, hasCommittedQuery, loadingState, noResultsEverywhere, posts.length, profiles.length, tierlists.length, t, visibleTitleCount]);

  const currentHeading = (() => {
    if (activeScope === 'posts') {
      return hasAnyQuery ? t('discover.postsResultsFor', { query }) : t('discover.scopePosts');
    }
    if (activeScope === 'people') {
      return hasAnyQuery ? t('discover.peopleResultsFor', { query }) : t('discover.scopePeople');
    }
    if (activeScope === 'tierlists') {
      return hasAnyQuery ? t('discover.tierlistsResultsFor', { query }) : t('discover.scopeTierlists');
    }
    if (activeScope === 'titles') {
      if (hasAnyQuery) return t('discover.searchResultsFor', { query });
      if (hasActiveTag) return t('discover.tagResultsFor', { tag: activeTag });
      return t('discover.allOfType', { type: activeTitleLabel });
    }
    return hasAnyQuery ? t('discover.resultsFor', { query }) : t('discover.allResultsTitle');
  })();

  const currentSubtitle = (() => {
    if (activeScope === 'titles') {
      if (searchIntent.isShort) {
        return t('discover.shortQueryHint');
      }
      if (searchIntent.isBroad) {
        return t('discover.broadQueryHint');
      }
      return t('discover.titlesScopeSubtitle', {
        shown: visibleTitleCount,
        count: titlesState.total,
      });
    }
    if (activeScope === 'posts') {
      return hasAnyQuery ? t('discover.postsResultsHint') : t('discover.postsDefaultHint');
    }
    if (activeScope === 'people') {
      return hasAnyQuery ? t('discover.peopleResultsHint') : t('discover.peopleDefaultHint');
    }
    if (activeScope === 'tierlists') {
      return hasAnyQuery ? t('discover.tierlistsResultsHint') : t('discover.tierlistsDefaultHint');
    }
    if (searchIntent.isShort) {
      return t('discover.shortQueryHint');
    }
    if (searchIntent.isBroad) {
      return t('discover.broadQueryHint');
    }
    return t('discover.allResultsSubtitle');
  })();

  useEffect(() => {
    if (!noResultsEverywhere || normalizedQuery.length < 3) {
      recoveryRequestRef.current += 1;
      setRecoverySuggestions([]);
      setIsRecoveryLoading(false);
      return undefined;
    }

    // Misspelling recovery should never trigger a full catalog download.
    if (!isCatalogCacheWarm()) {
      recoveryRequestRef.current += 1;
      setRecoverySuggestions([]);
      setIsRecoveryLoading(false);
      return undefined;
    }

    let cancelled = false;
    const requestId = ++recoveryRequestRef.current;
    const loadingFrameId = window.requestAnimationFrame(() => {
      if (!cancelled && requestId === recoveryRequestRef.current) {
        setIsRecoveryLoading(true);
      }
    });

    const timeoutId = window.setTimeout(async () => {
      try {
        const cachedTitles = filterTitlesForAgeGate(getCachedTitlesSnapshot(), showAdult);
        const intent = getSearchIntent(normalizedQuery);
        const scoredMatches = cachedTitles
          .map((title) => {
            const label = getDisplayTitle(title);
            return {
              title,
              label,
              score: scoreSearchCandidates(normalizedQuery, buildTitleSearchCandidates(title, intent)),
            };
          })
          .filter((entry) => entry.label && entry.score >= 18 && entry.label.toLowerCase() !== normalizedQuery.toLowerCase())
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return Number(right.title?.popularity || 0) - Number(left.title?.popularity || 0);
          })
          .slice(0, 3);

        if (cancelled) return;

        if (requestId === recoveryRequestRef.current) {
          const suggestions = scoredMatches.map((entry) => ({
            query: entry.label,
            slug: entry.title?.slug || '',
            kind: 'title',
          }));

          // Add related terms from the best match's genres and moods.
          if (scoredMatches.length > 0) {
            const bestTitle = scoredMatches[0].title;
            const relatedTerms = [
              ...(Array.isArray(bestTitle?.genres) ? bestTitle.genres : []),
              ...(Array.isArray(bestTitle?.moods) ? bestTitle.moods : []),
            ].filter((term) => {
              const normalized = String(term || '').trim().toLowerCase();
              return (
                normalized.length >= 3 &&
                normalized !== normalizedQuery.toLowerCase() &&
                !suggestions.some((s) => s.query.toLowerCase() === normalized)
              );
            });

            for (const term of relatedTerms.slice(0, 3)) {
              if (suggestions.length >= 5) break;
              suggestions.push({ query: term, slug: '', kind: 'related' });
            }
          }

          setRecoverySuggestions(suggestions);
        }
      } catch {
        if (!cancelled && requestId === recoveryRequestRef.current) {
          setRecoverySuggestions([]);
        }
      } finally {
        if (!cancelled && requestId === recoveryRequestRef.current) {
          setIsRecoveryLoading(false);
        }
      }
    }, 120);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(loadingFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [noResultsEverywhere, normalizedQuery, showAdult]);

  useEffect(() => {
    if (!editingSavedSearchId) {
      return;
    }

    window.requestAnimationFrame(() => {
      savedSearchInputRef.current?.focus();
      savedSearchInputRef.current?.select();
    });
  }, [editingSavedSearchId]);

  useEffect(() => {
    document.title = `${currentHeading} | ${BRAND_NAME}`;

    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) {
      descriptionTag.setAttribute('content', `${currentSubtitle} ${BRAND_NAME} helps you search titles, people, posts, and tier lists.`.trim());
    }
  }, [currentHeading, currentSubtitle]);

  useEffect(() => {
    if (hasAnyLoading) {
      return;
    }

    if (!hasAnyQuery && !hasActiveTag) {
      lastTrackedSearchKeyRef.current = '';
      return;
    }

    const trackingKey = JSON.stringify({
      query: query.trim().toLowerCase(),
      tag: activeTag,
      scope: activeScope,
      titleType: activeTitleType,
      titleCount: visibleTitleCount,
      postCount: posts.length,
      peopleCount: profiles.length,
      tierlistCount: tierlists.length,
      mode: searchIntent.mode,
    });

    if (lastTrackedSearchKeyRef.current === trackingKey) {
      return;
    }

    lastTrackedSearchKeyRef.current = trackingKey;

    void trackDiscoverEvent({
      eventType: 'search_view',
      userId: user?.id || null,
      query,
      scope: activeScope,
      titleType: activeTitleType,
      tag: activeTag,
      metadata: {
        mode: searchIntent.mode,
        resultCounts: {
          titles: visibleTitleCount,
          posts: posts.length,
          people: profiles.length,
          tierlists: tierlists.length,
        },
      },
    });
  }, [
    activeScope,
    activeTag,
    activeTitleType,
    hasActiveTag,
    hasAnyLoading,
    hasAnyQuery,
    posts.length,
    profiles.length,
    query,
    searchIntent.mode,
    tierlists.length,
    user?.id,
    visibleTitleCount,
  ]);

  const handleScopeChange = (scopeId) => {
    setActiveScope(scopeId);
    setCurrentPage(1);
  };

  const applySearchPreset = useCallback((preset, source = 'preset') => {
    setActiveScope(preset.scope || 'all');
    setActiveTitleType(preset.titleType || 'all');
    setActiveTag(preset.tag || '');
    updateQuery(preset.query || '');
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);

    if (preset.query) {
      rememberRecentSearch(preset.query);
    }

    void trackDiscoverEvent({
      eventType: 'preset_apply',
      userId: user?.id || null,
      query: preset.query || '',
      scope: preset.scope || 'all',
      titleType: preset.titleType || 'all',
      tag: preset.tag || '',
      presetSource: source,
      metadata: {
        presetId: preset.id || null,
      },
    });
  }, [rememberRecentSearch, updateQuery, user?.id]);

  const startSavedSearchRename = useCallback((entry) => {
    setEditingSavedSearchId(entry.id);
    setSavedSearchLabelDraft(entry.label || describeSearchPreset(entry, t));
  }, [t]);

  const cancelSavedSearchRename = useCallback(() => {
    setEditingSavedSearchId(null);
    setSavedSearchLabelDraft('');
  }, []);

  const submitSavedSearchRename = useCallback(async (entry) => {
    const nextLabel = savedSearchLabelDraft.trim();
    await renameSearch(entry.id, nextLabel);
    void trackDiscoverEvent({
      eventType: 'saved_search_update',
      userId: user?.id || null,
      query: entry.query,
      scope: entry.scope,
      titleType: entry.titleType,
      tag: entry.tag,
      metadata: {
        action: 'rename',
        hasCustomLabel: Boolean(nextLabel),
      },
    });
    toast.success(t('discover.savedSearchRenamed'));
    cancelSavedSearchRename();
  }, [cancelSavedSearchRename, renameSearch, savedSearchLabelDraft, t, user?.id]);

  const handleSavedSearchPinToggle = useCallback(async (entry) => {
    await togglePinSearch(entry.id);
    void trackDiscoverEvent({
      eventType: 'saved_search_update',
      userId: user?.id || null,
      query: entry.query,
      scope: entry.scope,
      titleType: entry.titleType,
      tag: entry.tag,
      metadata: {
        action: entry.pinned ? 'unpin' : 'pin',
      },
    });
  }, [togglePinSearch, user?.id]);

  const handleSavedSearchDelete = useCallback(async (entry) => {
    const confirmed = window.confirm(
      language === 'th'
        ? `ลบชุดค้นหาที่บันทึก "${describeSearchPreset(entry, t)}" ใช่ไหม?`
        : `Delete saved search "${describeSearchPreset(entry, t)}"?`
    );
    if (!confirmed) {
      return;
    }

    if (editingSavedSearchId === entry.id) {
      cancelSavedSearchRename();
    }

    await deleteSearch(entry.id);
    void trackDiscoverEvent({
      eventType: 'saved_search_delete',
      userId: user?.id || null,
      query: entry.query,
      scope: entry.scope,
      titleType: entry.titleType,
      tag: entry.tag,
      metadata: {
        action: 'delete',
      },
    });
    toast.success(t('discover.savedSearchDeleted'));
  }, [cancelSavedSearchRename, deleteSearch, editingSavedSearchId, language, t, user?.id]);

  const isSearchWorkbenchOpen = showSearchWorkbench || Boolean(editingSavedSearchId);
  const renderedSavedSearches = isSearchWorkbenchOpen ? savedSearches : [];
  const helperChipCount = visibleRecentSearches.length + SUGGESTED_SEARCHES.length + renderedSavedSearches.length;
  const recentSearchOffset = 0;
  const suggestedSearchOffset = visibleRecentSearches.length;
  const savedSearchOffset = visibleRecentSearches.length + SUGGESTED_SEARCHES.length;
  helperChipRefs.current.length = helperChipCount;

  const focusHelperChip = useCallback((index) => {
    if (!helperChipCount) {
      return;
    }

    const nextIndex = ((index % helperChipCount) + helperChipCount) % helperChipCount;
    helperChipRefs.current[nextIndex]?.focus();
  }, [helperChipCount]);

  const handleAutocompleteSelect = useCallback((item = null) => {
    const nextRecentTerm = item?.searchTerm || query.trim();
    if (nextRecentTerm) {
      rememberRecentSearch(nextRecentTerm);
    }
    if (item?.id) {
      recordAutocompleteSelection({ query, itemId: item.id });
      void trackDiscoverEvent({
        eventType: 'autocomplete_select',
        userId: user?.id || null,
        query,
        scope: activeScope,
        titleType: activeTitleType,
        tag: activeTag,
        resultType: item.groupId || item.kind || 'unknown',
        resultId: item.entityId || item.id,
        metadata: {
          surface: 'discover',
          href: item.href || null,
          isRecent: item.groupId === 'recent',
        },
      });
    }
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
  }, [activeScope, activeTag, activeTitleType, query, rememberRecentSearch, user?.id]);

  const applyRecoverySuggestion = useCallback((nextQuery) => {
    const normalizedSuggestion = String(nextQuery || '').trim();
    if (!normalizedSuggestion) {
      return;
    }

    rememberRecentSearch(normalizedSuggestion);
    updateQuery(normalizedSuggestion);
    setActiveScope('all');
    setActiveTitleType('all');
    setActiveTag('');
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
    window.requestAnimationFrame(scrollToBrowseSection);
    void trackDiscoverEvent({
      eventType: 'recovery_apply',
      userId: user?.id || null,
      query,
      scope: activeScope,
      titleType: activeTitleType,
      tag: activeTag,
      metadata: {
        suggestedQuery: normalizedSuggestion,
      },
    });
  }, [activeScope, activeTag, activeTitleType, query, rememberRecentSearch, scrollToBrowseSection, updateQuery, user?.id]);

  const handleSearchInputKeyDown = useCallback((event) => {
    if (searchAutocompleteOpen && autocompleteItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedSuggestionIndex((current) => (current + 1) % autocompleteItems.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedSuggestionIndex((current) => (current <= 0 ? autocompleteItems.length - 1 : current - 1));
        return;
      }

      if (event.key === 'Enter' && highlightedSuggestionIndex >= 0) {
        event.preventDefault();
        const selectedItem = autocompleteItems[highlightedSuggestionIndex];
        if (selectedItem?.href) {
          navigate(selectedItem.href);
          handleAutocompleteSelect(selectedItem);
        }
        return;
      }
    }

    if (event.key === 'Escape') {
      setSearchAutocompleteOpen(false);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    if (!helperChipCount) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusHelperChip(0);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusHelperChip(helperChipCount - 1);
    }
  }, [autocompleteItems, focusHelperChip, handleAutocompleteSelect, helperChipCount, highlightedSuggestionIndex, navigate, searchAutocompleteOpen]);

  const handleHelperChipKeyDown = useCallback((event, index) => {
    if (!helperChipCount) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusHelperChip(index + 1);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusHelperChip(index - 1);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
  }, [focusHelperChip, helperChipCount]);

  const handleSearchSubmit = useCallback((event) => {
    event.preventDefault();
    const normalizedQuery = query.trim();

    if (normalizedQuery) {
      rememberRecentSearch(normalizedQuery);
    }

    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
    window.requestAnimationFrame(scrollToBrowseSection);
  }, [query, rememberRecentSearch, scrollToBrowseSection]);

  const handleBrowsePageChange = (nextPage) => {
    const clampedPage = Math.min(Math.max(1, nextPage), Math.max(1, titlesState.totalPages || 1));
    setCurrentPage(clampedPage);
    window.requestAnimationFrame(scrollToBrowseSection);
  };

  const retryDiscoverData = useCallback(() => {
    void loadDiscoverData({
      page: activeScope === 'titles' ? currentPage : 1,
    });
  }, [activeScope, currentPage, loadDiscoverData]);

  const clearActiveFilters = useCallback(() => {
    updateQuery('');
    setActiveTag('');
    setActiveScope('all');
    setActiveTitleType('all');
    setCurrentPage(1);
    setSearchAutocompleteOpen(false);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [updateQuery]);

  const emptyStateAction = (hasAnyQuery || hasActiveTag || visibleRecoverySuggestions.length > 0 || isVisibleRecoveryLoading) ? (
    <div className="discover-recovery-actions">
      {visibleRecoverySuggestions.length > 0 ? (
        <div className="discover-suggestion-chips" role="group" aria-label={t('discover.recoverySuggestedMany')}>
          {visibleRecoverySuggestions.map(({ query: sugQuery, kind }) => (
            <button
              key={sugQuery}
              type="button"
              className={`discover-suggestion-chip discover-suggestion-chip-${kind}`}
              onClick={() => applyRecoverySuggestion(sugQuery)}
            >
              {sugQuery}
            </button>
          ))}
        </div>
      ) : null}
      {(hasAnyQuery || hasActiveTag) ? (
        <Button type="button" variant="secondary" size="sm" onClick={clearActiveFilters}>
          {t('common.clear')}
        </Button>
      ) : null}
      {isVisibleRecoveryLoading ? <span className="discover-recovery-note">{t('discover.recoveryLoading')}</span> : null}
    </div>
  ) : null;

  const handleClearSavedSearches = useCallback(() => {
    const confirmed = window.confirm(
      language === 'th'
        ? 'ลบการค้นหาที่บันทึกไว้ทั้งหมดใช่ไหม?'
        : 'Delete all saved searches?'
    );
    if (!confirmed) {
      return;
    }

    cancelSavedSearchRename();
    void clearAllSearches();
    void trackDiscoverEvent({
      eventType: 'saved_search_delete',
      userId: user?.id || null,
      query,
      scope: activeScope,
      titleType: activeTitleType,
      tag: activeTag,
      metadata: {
        action: 'clear_all',
      },
    });
    toast.success(t('discover.savedSearchesCleared'));
  }, [activeScope, activeTag, activeTitleType, cancelSavedSearchRename, clearAllSearches, language, query, t, user?.id]);

  const handleResultClick = useCallback((resultType, item, rank) => {
    void trackDiscoverEvent({
      eventType: 'result_click',
      userId: user?.id || null,
      query,
      scope: activeScope,
      titleType: activeTitleType,
      tag: activeTag,
      resultType,
      resultId: item?.id || item?.slug || item?.username || null,
      resultRank: rank,
      metadata: {
        slug: item?.slug || null,
        username: item?.username || item?.ownerUsername || item?.author_username || null,
      },
    });
  }, [activeScope, activeTag, activeTitleType, query, user?.id]);

  const titleSectionAction = activeScope === 'all' ? (
    <Button type="button" variant="ghost" size="sm" className="discover-section-action" onClick={() => handleScopeChange('titles')}>
      {t('discover.viewAllTitles')}
    </Button>
  ) : null;
  const postsSectionAction = activeScope === 'all' ? (
    <Button type="button" variant="ghost" size="sm" className="discover-section-action" onClick={() => handleScopeChange('posts')}>
      {t('discover.viewAllPosts')}
    </Button>
  ) : null;
  const peopleSectionAction = activeScope === 'all' ? (
    <Button type="button" variant="ghost" size="sm" className="discover-section-action" onClick={() => handleScopeChange('people')}>
      {t('discover.viewAllPeople')}
    </Button>
  ) : null;
  const tierlistSectionAction = activeScope === 'all' ? (
    <Button type="button" variant="ghost" size="sm" className="discover-section-action" onClick={() => handleScopeChange('tierlists')}>
      {t('discover.viewAllTierlists')}
    </Button>
  ) : null;
  const curatedLaneCounts = {
    titles: titleScopeCount,
    posts: posts.length,
    people: profiles.length,
    tierlists: tierlists.length,
  };
  const laneSummaries = CURATED_LANES.map((lane) => ({
    ...lane,
    count: curatedLaneCounts[lane.id] || 0,
  }));

  return (
    <div className="discover-page animate-fade-in">
      <section className="section discover-header">
        <div className="container">
          <div className="discover-hero-shell">
            <div className="discover-hero-copy">
              <p className="discover-eyebrow animate-fade-in-up">{t('discover.badge')}</p>
              <h1 className="discover-title animate-fade-in-up">
                {t('discover.title').replace(t('discover.accent'), '')}
                <span className="text-gradient">{t('discover.accent')}</span>
              </h1>
              <p className="discover-subtitle animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
                {t('discover.subtitle')}
              </p>
            </div>

            <div className="discover-search-shell animate-fade-in-up" style={{ animationDelay: '0.14s' }}>
            <form ref={searchFormRef} className="discover-search-form" onSubmit={handleSearchSubmit}>
              <label className="discover-field">
                <span className="visually-hidden">{t('discover.searchInputLabel')}</span>
                <div className="search-box">
                  <span className="search-icon" aria-hidden="true"><Search size={16} /></span>
                  <input
                    ref={searchInputRef}
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="discover-search-listbox"
                    aria-expanded={searchAutocompleteOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading) ? true : false}
                    aria-activedescendant={highlightedSuggestionIndex >= 0 ? (autocompleteItems[highlightedSuggestionIndex]?.id ?? undefined) : undefined}
                    aria-label={t('discover.searchInputLabel')}
                    aria-describedby="discover-search-hint"
                    placeholder={t('discover.searchPlaceholder')}
                    value={query}
                    onChange={(event) => {
                      updateQuery(event.target.value);
                      setSearchAutocompleteOpen(true);
                    }}
                    onFocus={() => {
                      refreshRecentSearches();
                      setSearchAutocompleteOpen(true);
                    }}
                    onKeyDown={handleSearchInputKeyDown}
                    className="search-input"
                    autoFocus
                  />
                  {query && (
                    <button
                      className="search-clear"
                      onClick={() => {
                        updateQuery('');
                      }}
                      aria-label={t('discover.clearSearch')}
                      title={t('discover.clearSearch')}
                      type="button"
                    >
                      <XIcon size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="search-submit"
                    aria-label={t('discover.jumpToResults')}
                    title={t('discover.jumpToResults')}
                  >
                    <Search size={16} aria-hidden="true" />
                  </button>
                </div>
              </label>
              <SearchAutocomplete
                groups={autocompleteGroups}
                flatItems={autocompleteItems}
                isLoading={isAutocompleteLoading}
                isOpen={searchAutocompleteOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading)}
                highlightedIndex={highlightedSuggestionIndex}
                query={query}
                variant="discover"
                listboxId="discover-search-listbox"
                t={t}
                onSelect={handleAutocompleteSelect}
                onSearchAll={() => {
                  if (query.trim()) {
                    rememberRecentSearch(query.trim());
                  }
                  setSearchAutocompleteOpen(false);
                  window.requestAnimationFrame(scrollToBrowseSection);
                }}
              />
            </form>

            <div className="discover-search-meta">
              <p id="discover-search-hint" className="discover-search-hint" role="status" aria-live="polite">
                {hasAnyLoading ? (
                  <span className="discover-live-status"><Loader2 size={14} className="discover-spinner" /> {t('discover.searchingEverywhere')}</span>
                ) : searchIntent.isShort ? (
                  <span className="discover-live-status"><Info size={14} aria-hidden="true" /> {t('discover.shortQueryHint')}</span>
                ) : searchIntent.isBroad ? (
                  <span className="discover-live-status"><Info size={14} aria-hidden="true" /> {t('discover.broadQueryHint')}</span>
                ) : catalogInfo.count > 0 ? (
                  <span className="discover-catalog-note">{t('discover.loaded', { count: catalogInfo.count })}</span>
                ) : null}
              </p>
              <div className="discover-search-tools">
                {hasSavableSearch ? (
                  <button
                    type="button"
                    className={`discover-save-search ${isCurrentSearchSaved ? 'is-saved' : ''}`}
                    onClick={saveCurrentSearch}
                    disabled={isCurrentSearchSaved || isSavedSearchesLoading}
                  >
                    {isCurrentSearchSaved ? <BookmarkCheck size={14} aria-hidden="true" /> : <Bookmark size={14} aria-hidden="true" />}
                    {isCurrentSearchSaved ? t('discover.searchSaved') : t('discover.saveSearch')}
                  </button>
                ) : null}
                {(savedSearches.length > 0 || isSearchWorkbenchOpen) ? (
                  <button
                    type="button"
                    className={`discover-workbench-toggle ${isSearchWorkbenchOpen ? 'is-open' : ''}`}
                    onClick={() => setShowSearchWorkbench((current) => !current)}
                    aria-expanded={isSearchWorkbenchOpen}
                    aria-controls="discover-search-workbench"
                  >
                    <Bookmark size={15} aria-hidden="true" />
                    <span>{isSearchWorkbenchOpen ? t('common.close') : t('discover.savedSearchesLabel')}</span>
                    <ChevronDown size={15} className="discover-workbench-chevron" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className="discover-scope-tabs discover-scope-tabs-main"
              role="toolbar"
              aria-label={t('discover.scopeTabsAria')}
            >
              {SEARCH_SCOPE_TABS.map((scope) => {
                const Icon = scope.icon;
                const scopeCount = scope.id === 'all'
                  ? allScopeCount
                  : scope.id === 'titles'
                    ? titleScopeCount
                    : scope.id === 'posts'
                      ? posts.length
                      : scope.id === 'people'
                        ? profiles.length
                        : tierlists.length;

                return (
                  <button
                    key={scope.id}
                    type="button"
                    aria-pressed={activeScope === scope.id}
                    className={`discover-scope-tab ${activeScope === scope.id ? 'active' : ''}`}
                    onClick={() => handleScopeChange(scope.id)}
                  >
                    <span className="discover-scope-main">
                      <Icon size={16} aria-hidden="true" />
                      {t(scope.labelKey)}
                    </span>
                    {showScopeCounts ? <span className="discover-scope-count">{scopeCount}</span> : null}
                  </button>
                );
              })}
            </div>

            {(activeScope === 'all' || activeScope === 'titles') ? (
              <div className="discover-inline-filter-row">
                <span className="discover-filter-label">{t('discover.titleTypeLabel')}</span>
                <div className="type-tabs" role="toolbar" aria-label={t('discover.typeTabsAria')}>
                  {TITLE_TYPE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        aria-pressed={activeTitleType === tab.id}
                        className={`type-tab ${activeTitleType === tab.id ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTitleType(tab.id);
                          setCurrentPage(1);
                        }}
                      >
                        <Icon size={16} aria-hidden="true" />
                        {t(tab.labelKey)}
                      </button>
                    );
                  })}
                </div>
                <div className="quick-search-tags">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      className={`quick-tag ${activeTag === tag ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTag((currentTag) => (currentTag === tag ? '' : tag));
                        setCurrentPage(1);
                      }}
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="discover-search-quickbar">
              <div className="discover-helper-head">
                <span className="discover-helper-label"><Sparkles size={13} aria-hidden="true" /> {t('discover.quickPicksLabel')}</span>
                {visibleRecentSearches.length > 0 ? (
                  <button type="button" className="discover-helper-clear" onClick={clearRecentSearches}>
                    {t('discover.clearRecentSearches')}
                  </button>
                ) : null}
              </div>
              <div className="discover-helper-chips">
                {visibleRecentSearches.map((entry, index) => (
                  <button
                    key={entry}
                    ref={(node) => {
                      helperChipRefs.current[recentSearchOffset + index] = node;
                    }}
                    type="button"
                    className="discover-helper-chip"
                    onClick={() => applySearchPreset({ scope: 'all', query: entry, tag: '', titleType: 'all' }, 'recent')}
                    onKeyDown={(event) => handleHelperChipKeyDown(event, recentSearchOffset + index)}
                  >
                    <History size={13} aria-hidden="true" />
                    {entry}
                  </button>
                ))}
                {SUGGESTED_SEARCHES.map((preset, index) => (
                  <button
                    key={preset.id}
                    ref={(node) => {
                      helperChipRefs.current[suggestedSearchOffset + index] = node;
                    }}
                    type="button"
                    className="discover-helper-chip is-suggestion"
                    onClick={() => applySearchPreset(preset, 'shortcut')}
                    onKeyDown={(event) => handleHelperChipKeyDown(event, suggestedSearchOffset + index)}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
                </div>
              </div>

            {isSearchWorkbenchOpen ? (
              <div id="discover-search-workbench" className="discover-search-workbench">
                {renderedSavedSearches.length > 0 ? (
                  <div className="discover-search-helper-grid">
                    <div className="discover-helper-row">
                      <div className="discover-helper-head">
                        <span className="discover-helper-label"><Bookmark size={13} aria-hidden="true" /> {t('discover.savedSearchesLabel')}</span>
                        <button type="button" className="discover-helper-clear" onClick={handleClearSavedSearches}>
                          {t('discover.clearSavedSearches')}
                        </button>
                      </div>
                      <div className="discover-saved-search-grid">
                        {renderedSavedSearches.map((preset, index) => (
                          <article key={preset.id} className={`discover-saved-search-card ${preset.pinned ? 'is-pinned' : ''}`}>
                            <div className="discover-saved-search-main">
                              {editingSavedSearchId === preset.id ? (
                                <form
                                  className="discover-saved-search-edit"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void submitSavedSearchRename(preset);
                                  }}
                                >
                                  <input
                                    ref={savedSearchInputRef}
                                    type="text"
                                    value={savedSearchLabelDraft}
                                    onChange={(event) => setSavedSearchLabelDraft(event.target.value)}
                                    className="discover-saved-search-input"
                                    aria-label={t('discover.renameSavedSearch')}
                                  />
                                  <div className="discover-saved-search-edit-actions">
                                    <button type="submit" className="discover-saved-search-mini-btn">
                                      {t('common.save')}
                                    </button>
                                    <button type="button" className="discover-saved-search-mini-btn is-ghost" onClick={cancelSavedSearchRename}>
                                      {t('common.cancel')}
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <button
                                    ref={(node) => {
                                      helperChipRefs.current[savedSearchOffset + index] = node;
                                    }}
                                    type="button"
                                    className="discover-saved-search-open"
                                    onClick={() => applySearchPreset(preset, 'saved')}
                                    onKeyDown={(event) => handleHelperChipKeyDown(event, savedSearchOffset + index)}
                                  >
                                    <strong>{describeSearchPreset(preset, t)}</strong>
                                    <span>{[
                                      preset.query || null,
                                      preset.tag ? `#${preset.tag}` : null,
                                      preset.scope !== 'all' ? t(SEARCH_SCOPE_TABS.find((item) => item.id === preset.scope)?.labelKey || 'discover.scopeAll') : null,
                                    ].filter(Boolean).join(' / ')}</span>
                                  </button>
                                  <div className="discover-saved-search-actions">
                                    <button
                                      type="button"
                                      className="discover-saved-search-icon-btn"
                                      onClick={() => startSavedSearchRename(preset)}
                                      aria-label={t('discover.renameSavedSearch')}
                                      title={t('discover.renameSavedSearch')}
                                    >
                                      <PencilLine size={13} aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      className="discover-saved-search-icon-btn"
                                      onClick={() => void handleSavedSearchPinToggle(preset)}
                                      aria-label={preset.pinned ? t('discover.unpinSavedSearch') : t('discover.pinSavedSearch')}
                                      title={preset.pinned ? t('discover.unpinSavedSearch') : t('discover.pinSavedSearch')}
                                    >
                                      {preset.pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
                                    </button>
                                    <button
                                      type="button"
                                      className="discover-saved-search-icon-btn is-danger"
                                      onClick={() => void handleSavedSearchDelete(preset)}
                                      aria-label={t('discover.removeSavedSearch')}
                                      title={t('discover.removeSavedSearch')}
                                    >
                                      <XIcon size={12} aria-hidden="true" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {savedSearchesError ? (
                  <p className="discover-helper-note" role="status">{savedSearchesError}</p>
                ) : null}

              </div>
            ) : null}
          </div>
        </div>

          {isIdleDiscover ? (
              <div className="discover-starter-panel animate-fade-in-up" style={{ animationDelay: '0.18s' }}>
                <div className="discover-starter-head">
                  <div>
                    <span className="discover-helper-label"><Compass size={13} aria-hidden="true" /> {t('discover.idleExploreLabel')}</span>
                    <h2>{t('discover.allResultsTitle')}</h2>
                  </div>
                  <p>{t('discover.idleExploreSubtitle')}</p>
                </div>
                <div className="discover-lane-grid discover-starter-grid">
                  {laneSummaries.map((lane) => {
                    const Icon = lane.icon;
                    return (
                      <button
                        key={lane.id}
                        type="button"
                        className="discover-lane-card discover-starter-card"
                        onClick={() => applySearchPreset(lane.preset, 'lane')}
                      >
                        <span className="discover-lane-icon">
                          <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className="discover-lane-copy">
                          <strong>{t(lane.titleKey)}</strong>
                          <span>{t(lane.descriptionKey)}</span>
                        </span>
                        <span className="discover-lane-meta">
                          {t(lane.countLabelKey, { count: lane.count })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

          {hasDiscoverFilters && (
              <div className="discover-active-filters">
                {hasCommittedQuery && <span className="discover-filter-pill">{t('discover.searchLabel')}: {query}</span>}
                {hasActiveTag && (
                  <button className="discover-filter-pill is-removable" onClick={() => setActiveTag('')} type="button">
                    {t('discover.tagLabel')}: {activeTag} <XIcon size={12} aria-hidden="true" />
                  </button>
                )}
                {activeScope !== 'all' && (
                  <button className="discover-filter-pill is-removable" onClick={() => handleScopeChange('all')} type="button">
                    {t('discover.scopeAll')}: {t(SEARCH_SCOPE_TABS.find((item) => item.id === activeScope)?.labelKey || 'discover.scopeAll')} <XIcon size={12} aria-hidden="true" />
                  </button>
                )}
                {activeTitleType !== 'all' && (
                  <button
                    className="discover-filter-pill is-removable"
                    onClick={() => {
                      setActiveTitleType('all');
                      setCurrentPage(1);
                    }}
                    type="button"
                  >
                    {t('discover.titleTypeLabel')}: {t(TITLE_TYPE_TABS.find((item) => item.id === activeTitleType)?.labelKey || 'discover.typeAll')} <XIcon size={12} aria-hidden="true" />
                  </button>
                )}
                {hasCommittedQuery && searchIntent.isBroad ? <span className="discover-filter-pill discover-filter-pill-soft">{t('discover.broadQueryChip')}</span> : null}
              </div>
          )}
        </div>
      </section>

      <section className="section discover-content">
        <div className="container">
          <div ref={browseSectionRef} className="browse-context animate-fade-in-up">
            <div className="browse-toolbar">
              <div>
                <h2 className="browse-heading">{currentHeading}</h2>
                <p className="browse-subtitle">{currentSubtitle}</p>
              </div>

              {(activeScope === 'all' || activeScope === 'titles') && (
                <div className="browse-toolbar-actions" role="toolbar" aria-label={t('discover.resultsToolbarAria')}>
                  {titleScopeCount > 0 && (
                    <span className="browse-visible-count">
                      {t('discover.showingResultCount', { shown: visibleTitleCount, count: titleScopeCount })}
                    </span>
                  )}
                  <SortSelect
                    value={sortBy}
                    onChange={(value) => {
                      setSortBy(value);
                      setCurrentPage(1);
                    }}
                    label={t('watchlist.sort')}
                    className="discover-sorter"
                    selectAriaLabel={t('discover.sortResultsAria')}
                  >
                    {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
                      <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                    ))}
                  </SortSelect>
                  <label className="hide-seen-toggle">
                    <input type="checkbox" checked={hideSeen} onChange={(event) => setHideSeen(event.target.checked)} />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                    <span className="toggle-label">{t('discover.hideSeen')}</span>
                  </label>
                </div>
              )}
            </div>

            {activeScope === 'all' && !noResultsEverywhere && !isIdleDiscover ? (
              <div className="discover-results-overview" role="toolbar" aria-label={t('discover.scopeTabsAria')}>
                {laneSummaries.map((lane) => {
                  const Icon = lane.icon;
                  return (
                    <button
                      key={lane.id}
                      type="button"
                      className="discover-overview-card"
                      onClick={() => handleScopeChange(lane.id)}
                    >
                      <span className="discover-overview-top">
                        <span className="discover-overview-icon">
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        {t(lane.titleKey)}
                      </span>
                      <strong>{t(lane.countLabelKey, { count: lane.count })}</strong>
                      <span>{t(lane.descriptionKey)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {activeScope === 'all' && noResultsEverywhere ? (
              <EmptyState
                className="discover-empty-state discover-empty-state-large"
                icon={<Search size={28} />}
                title={t('discover.noResults')}
                message={
                  visibleRecoverySuggestions.length > 0
                    ? t('discover.recoverySuggestedMany')
                    : t('discover.noResultsHint')
                }
                action={emptyStateAction}
              />
            ) : null}

            {activeScope === 'all' && !noResultsEverywhere && crossLaneFallback ? (
              <div className="discover-cross-lane-banner">
                <Info size={15} aria-hidden="true" />
                <span>{t('discover.crossLaneTitlesMissed', { query: normalizedQuery, lanes: crossLaneFallback })}</span>
              </div>
            ) : null}

            {activeScope === 'all' && !noResultsEverywhere ? (
              <div className="discover-section-stack">
                <DiscoverSection
                  title={t('discover.titlesSectionTitle')}
                  subtitle={t('discover.titlesSectionSubtitle', { count: titleScopeCount })}
                  action={titleSectionAction}
                  isLoading={loadingState.titles}
                  error={errorState.titles}
                  onRetry={retryDiscoverData}
                  hasItems={rankedTitles.length > 0}
                  emptyTitle={t('discover.noResults')}
                  emptyMessage={t('discover.noResultsHint')}
                  emptyAction={emptyStateAction}
                  emptyIcon={<Search size={24} />}
                  loadingVariant="titles"
                >
                  <div className="results-grid stagger-children discover-title-grid">
                    {rankedTitles.map((title, index) => (
                      <DiscoverTitleCard key={title.id} title={title} query={query} onOpen={() => handleResultClick('titles', title, index + 1)} />
                    ))}
                  </div>
                </DiscoverSection>

                <DiscoverSection
                  title={t('discover.postsSectionTitle')}
                  subtitle={t('discover.postsSectionSubtitle', { count: posts.length })}
                  action={postsSectionAction}
                  isLoading={loadingState.posts}
                  error={errorState.posts}
                  onRetry={retryDiscoverData}
                  hasItems={posts.length > 0}
                  emptyTitle={t('discover.postsEmptyTitle')}
                  emptyMessage={t('discover.postsEmptyHint')}
                  emptyAction={emptyStateAction}
                  emptyIcon={<MessageCircle size={24} />}
                >
                  <div className="discover-entity-grid discover-post-grid">
                    {posts.map((post, index) => (
                      <DiscoverPostCard key={post.id} post={post} locale={locale} t={t} query={query} onOpen={() => handleResultClick('posts', post, index + 1)} />
                    ))}
                  </div>
                </DiscoverSection>

                <DiscoverSection
                  title={t('discover.peopleSectionTitle')}
                  subtitle={t('discover.peopleSectionSubtitle', { count: profiles.length })}
                  action={peopleSectionAction}
                  isLoading={loadingState.people}
                  error={errorState.people}
                  onRetry={retryDiscoverData}
                  hasItems={profiles.length > 0}
                  emptyTitle={t('discover.peopleEmptyTitle')}
                  emptyMessage={t('discover.peopleEmptyHint')}
                  emptyAction={emptyStateAction}
                  emptyIcon={<UserRound size={24} />}
                >
                  <div className="discover-entity-grid">
                    {profiles.map((profile, index) => (
                      <DiscoverProfileCard key={profile.id} profile={profile} locale={locale} t={t} query={query} onOpen={() => handleResultClick('people', profile, index + 1)} />
                    ))}
                  </div>
                </DiscoverSection>

                <DiscoverSection
                  title={t('discover.tierlistsSectionTitle')}
                  subtitle={t('discover.tierlistsSectionSubtitle', { count: tierlists.length })}
                  action={tierlistSectionAction}
                  isLoading={loadingState.tierlists}
                  error={errorState.tierlists}
                  onRetry={retryDiscoverData}
                  hasItems={tierlists.length > 0}
                  emptyTitle={t('discover.tierlistsEmptyTitle')}
                  emptyMessage={t('discover.tierlistsEmptyHint')}
                  emptyAction={emptyStateAction}
                  emptyIcon={<ListOrdered size={24} />}
                >
                  <div className="discover-entity-grid">
                    {tierlists.map((item, index) => (
                      <DiscoverTierlistCard key={`${item.kind}-${item.id}`} item={item} locale={locale} t={t} query={query} onOpen={() => handleResultClick('tierlists', item, index + 1)} />
                    ))}
                  </div>
                </DiscoverSection>
              </div>
            ) : null}

            {activeScope === 'titles' ? (
              <>
                {errorState.titles ? <ErrorState message={errorState.titles} onRetry={retryDiscoverData} /> : null}

                {!errorState.titles && (loadingState.titles ? (
                  <SkeletonGrid />
                ) : rankedTitles.length > 0 ? (
                  <>
                  <div className="results-grid stagger-children">
                    {rankedTitles.map((title, index) => (
                        <DiscoverTitleCard key={title.id} title={title} query={query} onOpen={() => handleResultClick('titles', title, index + 1)} />
                    ))}
                  </div>

                    <div className="discover-pagination">
                      <Button
                        onClick={() => handleBrowsePageChange(currentPage - 1)}
                        variant="primary"
                        size="sm"
                        className="discover-page-btn"
                        disabled={currentPage <= 1}
                        type="button"
                      >
                        {t('common.previous')}
                      </Button>
                      <span className="discover-page-indicator">
                        {t('discover.pageIndicator', { page: currentPage, total: titlesState.totalPages })}
                      </span>
                      <Button
                        onClick={() => handleBrowsePageChange(currentPage + 1)}
                        variant="primary"
                        size="sm"
                        className="discover-page-btn"
                        disabled={currentPage >= titlesState.totalPages}
                        type="button"
                      >
                        {t('common.next')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    className="discover-empty-state"
                    icon={<Search size={24} />}
                    title={t('discover.noResults')}
                    message={t('discover.noResultsHint')}
                    action={emptyStateAction}
                  />
                ))}
              </>
            ) : null}

            {activeScope === 'posts' ? (
              <DiscoverSection
                title={t('discover.postsSectionTitle')}
                subtitle={t('discover.postsSectionSubtitle', { count: posts.length })}
                isLoading={loadingState.posts}
                error={errorState.posts}
                onRetry={retryDiscoverData}
                hasItems={posts.length > 0}
                emptyTitle={t('discover.postsEmptyTitle')}
                emptyMessage={t('discover.postsEmptyHint')}
                emptyAction={emptyStateAction}
                emptyIcon={<MessageCircle size={24} />}
              >
                <div className="discover-entity-grid discover-post-grid">
                  {posts.map((post, index) => (
                    <DiscoverPostCard key={post.id} post={post} locale={locale} t={t} query={query} onOpen={() => handleResultClick('posts', post, index + 1)} />
                  ))}
                </div>
              </DiscoverSection>
            ) : null}

            {activeScope === 'people' ? (
              <DiscoverSection
                title={t('discover.peopleSectionTitle')}
                subtitle={t('discover.peopleSectionSubtitle', { count: profiles.length })}
                isLoading={loadingState.people}
                error={errorState.people}
                onRetry={retryDiscoverData}
                hasItems={profiles.length > 0}
                emptyTitle={t('discover.peopleEmptyTitle')}
                emptyMessage={t('discover.peopleEmptyHint')}
                emptyAction={emptyStateAction}
                emptyIcon={<UserRound size={24} />}
              >
                <div className="discover-entity-grid">
                  {profiles.map((profile, index) => (
                    <DiscoverProfileCard key={profile.id} profile={profile} locale={locale} t={t} query={query} onOpen={() => handleResultClick('people', profile, index + 1)} />
                  ))}
                </div>
              </DiscoverSection>
            ) : null}

            {activeScope === 'tierlists' ? (
              <DiscoverSection
                title={t('discover.tierlistsSectionTitle')}
                subtitle={t('discover.tierlistsSectionSubtitle', { count: tierlists.length })}
                isLoading={loadingState.tierlists}
                error={errorState.tierlists}
                onRetry={retryDiscoverData}
                hasItems={tierlists.length > 0}
                emptyTitle={t('discover.tierlistsEmptyTitle')}
                emptyMessage={t('discover.tierlistsEmptyHint')}
                emptyAction={emptyStateAction}
                emptyIcon={<ListOrdered size={24} />}
              >
                <div className="discover-entity-grid">
                  {tierlists.map((item, index) => (
                    <DiscoverTierlistCard key={`${item.kind}-${item.id}`} item={item} locale={locale} t={t} query={query} onOpen={() => handleResultClick('tierlists', item, index + 1)} />
                  ))}
                </div>
              </DiscoverSection>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Discover;
