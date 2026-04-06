import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getMoodOptionsForAgeGate } from '@/shared/data/moods';
import { HOMEPAGE_BLOCK_PUBLIC_SELECT, mapHomepagePublicBlock } from '@/shared/lib/editorial';
import { supabase } from '@/shared/lib/supabase';
import { sortTitlesCollection } from '@/shared/lib/titleSorting';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import {
  clearTitlesCache,
  getAllTitles,
  getTrendingTitles,
  isCatalogCacheWarm,
  recommend,
} from '@/features/discover/lib/recommend';
import {
  buildRecommendationState,
  filterHiddenTitles,
  filterSeenTitles,
  filterTitlesByRecommendationPreferences,
  normalizeProfilePreferences,
  prioritizeUnseenTitles,
  RECOMMENDATION_SUBTYPE_OPTIONS,
  RECOMMENDATION_TYPE_OPTIONS,
} from '@/features/profile/lib/profileStore';

const RESULTS_PAGE_SIZE = 16;

export function useHomeDiscovery({
  watchlist,
  favoriteTitleIds,
  hiddenFromRecommendationIds,
  hiddenFromDiscoveryIds,
  prefs,
  showAdult,
  t,
}) {
  const [moods, setMoods] = useState([]);
  const [timeOption, setTimeOption] = useState(null);
  const [type, setType] = useState('all');
  const [results, setResults] = useState([]);
  const [randomPick, setRandomPick] = useState(null);
  const [isRandomModalOpen, setIsRandomModalOpen] = useState(false);
  const [isRandomLoading, setIsRandomLoading] = useState(false);
  const [trending, setTrending] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hideSeen, setHideSeen] = useState(false);
  const [resultsPage, setResultsPage] = useState(1);
  const [editorialBlocks, setEditorialBlocks] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [resultSortBy, setResultSortBy] = useState('match');
  const [trendingSortBy, setTrendingSortBy] = useState('popularity');
  const resultsSectionRef = useRef(null);
  const recommendRequestRef = useRef(0);
  const adultAutoLoadRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const catalogWarmedRef = useRef(false);

  const effectivePrefs = useMemo(
    () => normalizeProfilePreferences(showAdult
      ? {
          ...prefs,
          hideAdultContent: false,
          recommendationTypes: [...RECOMMENDATION_TYPE_OPTIONS],
          recommendationSubtypes: [...RECOMMENDATION_SUBTYPE_OPTIONS],
          recommendationLength: 'any',
          minRecommendationScore: 0,
          recommendationProgressStates: ['untracked', 'planned', 'reading', 'on-hold', 'completed', 'dropped'],
          excludeCompletedFromRecs: false,
          excludeDroppedFromRecs: false,
          forceUnseenOnly: false,
        }
      : prefs),
    [prefs, showAdult]
  );
  const recommendationState = useMemo(
    () => buildRecommendationState(watchlist, effectivePrefs, hiddenFromRecommendationIds),
    [watchlist, effectivePrefs, hiddenFromRecommendationIds]
  );
  const discoveryState = useMemo(
    () => buildRecommendationState(watchlist, effectivePrefs, hiddenFromDiscoveryIds),
    [watchlist, effectivePrefs, hiddenFromDiscoveryIds]
  );
  const visibleMoods = useMemo(
    () => getMoodOptionsForAgeGate(showAdult),
    [showAdult]
  );
  const visibleMoodIds = useMemo(
    () => new Set(visibleMoods.map((mood) => mood.id)),
    [visibleMoods]
  );
  const selectedVisibleMoods = useMemo(
    () => moods.filter((moodId) => visibleMoodIds.has(moodId)),
    [moods, visibleMoodIds]
  );
  const profileMoodFallbacks = useMemo(
    () => prefs.favoriteMoods.filter((moodId) => visibleMoodIds.has(moodId)),
    [prefs.favoriteMoods, visibleMoodIds]
  );
  const shouldShowTypeSelector = !showAdult;
  const effectiveMoodFilters = useMemo(
    () => (selectedVisibleMoods.length > 0 ? selectedVisibleMoods : (showAdult ? [] : profileMoodFallbacks)),
    [profileMoodFallbacks, selectedVisibleMoods, showAdult]
  );
  const hasFinderActiveFilters = selectedVisibleMoods.length > 0
    || !!timeOption
    || (shouldShowTypeSelector && type !== 'all');

  const ensureCatalogWarm = useCallback(() => {
    if (!catalogWarmedRef.current && !isCatalogCacheWarm()) {
      catalogWarmedRef.current = true;
      getAllTitles().catch(() => {});
    }
  }, []);

  const applyRecommendationFilters = useCallback(
    (list) => filterTitlesByRecommendationPreferences(filterHiddenTitles(list, discoveryState), discoveryState),
    [discoveryState]
  );
  const filterSeen = useCallback(
    (list) => filterSeenTitles(applyRecommendationFilters(list), recommendationState, hideSeen),
    [applyRecommendationFilters, recommendationState, hideSeen]
  );
  const orderTitles = useCallback(
    (list) => prioritizeUnseenTitles(list, recommendationState),
    [recommendationState]
  );

  const handleRecommend = useCallback(async ({ scrollToResults = true } = {}) => {
    const requestId = ++recommendRequestRef.current;
    setIsLoading(true);
    try {
      const recs = await recommend({
        type,
        moods: effectiveMoodFilters,
        timeOption: timeOption ? { id: timeOption } : null,
        likedTitleIds: favoriteTitleIds,
        limit: null,
        watchlist,
        preferences: effectivePrefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
        showAdult,
      });
      if (requestId !== recommendRequestRef.current) return;
      if (scrollToResults) pendingScrollRef.current = true;
      startTransition(() => {
        setResults(recs);
        setResultsPage(1);
      });
    } catch (err) {
      if (requestId !== recommendRequestRef.current) return;
      console.error('Failed to fetch recommendations', err);
      toast.error(t('home.recommendError'));
    } finally {
      if (requestId === recommendRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    effectiveMoodFilters,
    effectivePrefs,
    favoriteTitleIds,
    hiddenFromRecommendationIds,
    showAdult,
    t,
    timeOption,
    type,
    watchlist,
  ]);

  const handleRandomPick = useCallback(async () => {
    setIsRandomLoading(true);
    setIsRandomModalOpen(true);
    try {
      const recs = await recommend({
        type: 'all',
        moods: effectiveMoodFilters,
        likedTitleIds: favoriteTitleIds,
        limit: 80,
        watchlist,
        preferences: effectivePrefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
        showAdult,
      });
      const visibleRecs = filterSeen(recs);
      const pool = visibleRecs.length > 0 ? visibleRecs : recs;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      startTransition(() => {
        setRandomPick(shuffled[0] || null);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRandomLoading(false);
    }
  }, [
    effectiveMoodFilters,
    effectivePrefs,
    favoriteTitleIds,
    filterSeen,
    hiddenFromRecommendationIds,
    showAdult,
    watchlist,
  ]);

  const handleQuickMood = useCallback(async (moodId) => {
    const requestId = ++recommendRequestRef.current;
    setMoods([moodId]);
    setIsLoading(true);
    try {
      const recs = await recommend({
        moods: [moodId],
        likedTitleIds: favoriteTitleIds,
        limit: null,
        watchlist,
        preferences: effectivePrefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
        showAdult,
      });
      if (requestId !== recommendRequestRef.current) return;
      startTransition(() => {
        setResults(recs);
        setResultsPage(1);
      });
    } catch (err) {
      if (requestId !== recommendRequestRef.current) return;
      console.error(err);
      toast.error(t('home.recommendError'));
    } finally {
      if (requestId === recommendRequestRef.current) {
        setIsLoading(false);
        setTimeout(() => {
          document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
      }
    }
  }, [
    effectivePrefs,
    favoriteTitleIds,
    hiddenFromRecommendationIds,
    showAdult,
    t,
    watchlist,
  ]);

  const displayResults = useMemo(
    () => sortTitlesCollection(filterTitlesForAgeGate(filterSeen(orderTitles(results)), showAdult), resultSortBy),
    [results, resultSortBy, filterSeen, orderTitles, showAdult]
  );
  const displayTrending = useMemo(
    () => sortTitlesCollection(filterSeen(orderTitles(trending)), trendingSortBy),
    [trending, trendingSortBy, filterSeen, orderTitles]
  );
  const resultsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(displayResults.length / RESULTS_PAGE_SIZE)),
    [displayResults.length]
  );
  const pagedResults = useMemo(
    () => displayResults.slice((resultsPage - 1) * RESULTS_PAGE_SIZE, resultsPage * RESULTS_PAGE_SIZE),
    [displayResults, resultsPage]
  );
  const shownResultsCount = pagedResults.length;
  const heroBlock = useMemo(
    () => editorialBlocks.find((block) => block.blockType === 'hero') || null,
    [editorialBlocks]
  );
  const collectionBlocks = useMemo(
    () => editorialBlocks.filter((block) => block.blockType === 'collection' && block.collection?.items?.length),
    [editorialBlocks]
  );
  const hasContinueBlock = useMemo(
    () => editorialBlocks.some((block) => block.blockType === 'continue'),
    [editorialBlocks]
  );
  const hasTrendingBlock = useMemo(
    () => editorialBlocks.some((block) => block.blockType === 'trending'),
    [editorialBlocks]
  );

  useEffect(() => {
    setHideSeen(showAdult ? false : prefs.hideSeenByDefault);
  }, [prefs.hideSeenByDefault, showAdult]);

  useEffect(() => {
    if (pendingScrollRef.current && resultsSectionRef.current) {
      pendingScrollRef.current = false;
      resultsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [results]);

  useEffect(() => {
    setMoods((current) => {
      const next = current.filter((moodId) => visibleMoodIds.has(moodId));
      return next.length === current.length ? current : next;
    });
  }, [visibleMoodIds]);

  useEffect(() => {
    if (showAdult && type !== 'all') {
      setType('all');
    }
  }, [showAdult, type]);

  useEffect(() => {
    async function fetchInitial() {
      getAllTitles().catch(() => {});
      try {
        const [nextTrending, homepageBlocks] = await Promise.all([
          getTrendingTitles(8, { showAdult }),
          (async () => {
            if (!supabase) return [];
            const { data, error } = await supabase
              .from('homepage_content_blocks')
              .select(HOMEPAGE_BLOCK_PUBLIC_SELECT)
              .eq('status', 'published')
              .eq('visibility', 'public')
              .order('position', { ascending: true });
            if (error) throw error;
            return (data || []).map(mapHomepagePublicBlock);
          })(),
        ]);
        startTransition(() => {
          setTrending(nextTrending);
          setEditorialBlocks(homepageBlocks);
        });
      } catch (err) {
        console.error('Failed to load trending titles', err);
        startTransition(() => {
          setEditorialBlocks([]);
        });
      } finally {
        setIsInitialLoad(false);
      }
    }

    fetchInitial();
  }, [refreshToken, showAdult]);

  useEffect(() => {
    if (!isRandomModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsRandomModalOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRandomModalOpen]);

  useEffect(() => {
    const handleRebuild = () => {
      clearTitlesCache();
      setRefreshToken((current) => current + 1);
    };

    window.addEventListener('moodtoon:recommendations-rebuild', handleRebuild);
    return () => window.removeEventListener('moodtoon:recommendations-rebuild', handleRebuild);
  }, []);

  useEffect(() => {
    if (!showAdult) {
      adultAutoLoadRef.current = false;
      return;
    }

    if (adultAutoLoadRef.current) {
      return;
    }

    adultAutoLoadRef.current = true;
    handleRecommend({ scrollToResults: false });
  }, [handleRecommend, showAdult]);

  useEffect(() => {
    setResultsPage((currentPage) => Math.min(currentPage, Math.max(1, Math.ceil(displayResults.length / RESULTS_PAGE_SIZE))));
  }, [displayResults.length]);

  useEffect(() => {
    document.documentElement.classList.add('home-scroll-snap');
    document.body.classList.add('home-scroll-snap');

    return () => {
      document.documentElement.classList.remove('home-scroll-snap');
      document.body.classList.remove('home-scroll-snap');
    };
  }, []);

  const scrollToResultsSection = useCallback(() => {
    resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleResultsPageChange = useCallback((nextPage) => {
    setResultsPage(nextPage);
    window.requestAnimationFrame(scrollToResultsSection);
  }, [scrollToResultsSection]);

  const handleTypeChange = useCallback((nextType) => {
    ensureCatalogWarm();
    setType(nextType);
  }, [ensureCatalogWarm]);

  const handleMoodsChange = useCallback((nextMoods) => {
    ensureCatalogWarm();
    setMoods(nextMoods);
  }, [ensureCatalogWarm]);

  const handleTimeOptionChange = useCallback((nextTimeOption) => {
    ensureCatalogWarm();
    setTimeOption(nextTimeOption);
  }, [ensureCatalogWarm]);

  const handleClearAllFilters = useCallback(() => {
    setMoods([]);
    setTimeOption(null);
    setType('all');
  }, []);

  const handleClearResultFilters = useCallback(() => {
    setMoods([]);
    setTimeOption(null);
  }, []);

  const closeRandomModal = useCallback(() => {
    setIsRandomModalOpen(false);
  }, []);

  return {
    moods,
    timeOption,
    type,
    results,
    randomPick,
    isRandomModalOpen,
    isRandomLoading,
    trending,
    isLoading,
    isInitialLoad,
    hideSeen,
    resultsPage,
    editorialBlocks,
    resultSortBy,
    trendingSortBy,
    resultsSectionRef,
    visibleMoods,
    selectedVisibleMoods,
    shouldShowTypeSelector,
    hasFinderActiveFilters,
    displayResults,
    displayTrending,
    resultsTotalPages,
    pagedResults,
    shownResultsCount,
    heroBlock,
    collectionBlocks,
    hasContinueBlock,
    hasTrendingBlock,
    hasEditorialBlocks: editorialBlocks.length > 0,
    setHideSeen,
    setResultSortBy,
    setTrendingSortBy,
    handleRecommend,
    handleRandomPick,
    handleQuickMood,
    handleResultsPageChange,
    handleTypeChange,
    handleMoodsChange,
    handleTimeOptionChange,
    handleClearAllFilters,
    handleClearResultFilters,
    closeRandomModal,
  };
}
