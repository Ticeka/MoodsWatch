import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { MoodSelector } from '@/features/discover/components/MoodSelector';
import { TimeSelector } from '@/features/discover/components/TimeSelector';
import { recommend, getTrendingTitles, getCacheInfo, getTitlesByIds, clearTitlesCache } from '@/features/discover/lib/recommend';
import { useFavoriteTitles } from '@/features/profile/hooks/useFavoriteTitles';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { TYPE_OPTIONS, getLocalizedLabel, getLocalizedMoodName, getMoodOptionsForAgeGate } from '@/shared/data/moods';
import { HOMEPAGE_BLOCK_PUBLIC_SELECT, mapHomepagePublicBlock } from '@/shared/lib/editorial';
import { supabase } from '@/shared/lib/supabase';
import { TypeIcon } from '@/shared/components/ui/TypeIcon';
import { Dices, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { sortTitlesCollection, TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';
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
import { getTitleTypeMeta, isEpisodeBasedType } from '@/shared/lib/titleType';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import './Home.css';

const RESULTS_PAGE_SIZE = 16;

export function Home() {
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
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
  const [catalogInfo, setCatalogInfo] = useState(getCacheInfo());
  const [continueTitles, setContinueTitles] = useState([]);
  const [editorialBlocks, setEditorialBlocks] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [resultSortBy, setResultSortBy] = useState('match');
  const [trendingSortBy, setTrendingSortBy] = useState('popularity');
  const resultsSectionRef = useRef(null);
  const recommendRequestRef = useRef(0);
  const adultAutoLoadRef = useRef(false);
  const pendingScrollRef = useRef(false);

  const { watchlist, advanceProgress, updateItem, setConsumptionTarget, catchUpToTarget } = useWatchlist();
  const { favoriteTitleIds } = useFavoriteTitles();
  const { hiddenFromRecommendationIds, hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
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
  const canRequestRecommendations = showAdult
    || selectedVisibleMoods.length > 0
    || profileMoodFallbacks.length > 0
    || !!timeOption
    || (shouldShowTypeSelector && type !== 'all');

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
          setCatalogInfo(getCacheInfo());
        });
      } catch (err) {
        console.error('Failed to load trending titles', err);
        startTransition(() => {
          setEditorialBlocks([]);
          setCatalogInfo(getCacheInfo());
        });
      } finally {
        setIsInitialLoad(false);
      }
    }

    fetchInitial();
  }, [refreshToken, showAdult]);

  useEffect(() => {
    document.documentElement.classList.add('home-scroll-snap');
    document.body.classList.add('home-scroll-snap');

    return () => {
      document.documentElement.classList.remove('home-scroll-snap');
      document.body.classList.remove('home-scroll-snap');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContinueTitles() {
      const continueItems = watchlist
        .filter((item) => item.status === 'watching' || item.status === 'reading')
        .filter((item) => !hiddenFromDiscoveryIds.includes(item.titleId))
        .sort((a, b) => {
          const consumedDiff = new Date(b.lastConsumedAt || b.updatedAt || b.addedAt || 0).getTime()
            - new Date(a.lastConsumedAt || a.updatedAt || a.addedAt || 0).getTime();
          if (consumedDiff !== 0) return consumedDiff;
          const aProgress = Math.max(a.progressEpisode || 0, a.progressChapter || 0);
          const bProgress = Math.max(b.progressEpisode || 0, b.progressChapter || 0);
          return bProgress - aProgress;
        })
        .slice(0, 4);

      if (continueItems.length === 0) {
        setContinueTitles([]);
        return;
      }

      try {
        const titles = await getTitlesByIds(continueItems.map((item) => item.titleId));
        if (!cancelled) {
          const hydratedContinueTitles = continueItems
            .map((item) => {
              const title = titles.find((entry) => entry.id === item.titleId);
              return title ? {
                ...title,
                _listProgressEpisode: item.progressEpisode ?? null,
                _listProgressChapter: item.progressChapter ?? null,
                _lastConsumedAt: item.lastConsumedAt ?? null,
                _targetEpisode: item.targetEpisode ?? null,
                _targetChapter: item.targetChapter ?? null,
              } : null;
            })
            .filter(Boolean);

          setContinueTitles(filterTitlesForAgeGate(hydratedContinueTitles, showAdult));
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load continue titles', error);
          setContinueTitles([]);
        }
      }
    }

    loadContinueTitles();

    return () => {
      cancelled = true;
    };
  }, [watchlist, hiddenFromDiscoveryIds, showAdult]);

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
        setCatalogInfo(getCacheInfo());
      });
    } catch (err) {
      if (requestId !== recommendRequestRef.current) return;
      console.error('Failed to fetch recommendations', err);
      toast.error(t('home.recommendError'));
      setCatalogInfo(getCacheInfo());
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

  const handleRandomPick = async () => {
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
        setCatalogInfo(getCacheInfo());
      });
    } catch (err) {
      console.error(err);
      setCatalogInfo(getCacheInfo());
    } finally {
      setIsRandomLoading(false);
    }
  };

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
      setCatalogInfo(getCacheInfo());
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

  const quickMoods = visibleMoods.slice(0, 6);
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

  const handleQuickMood = async (moodId) => {
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
        setCatalogInfo(getCacheInfo());
      });
    } catch (err) {
      if (requestId !== recommendRequestRef.current) return;
      console.error(err);
      toast.error(t('home.recommendError'));
      setCatalogInfo(getCacheInfo());
    } finally {
      if (requestId === recommendRequestRef.current) {
        setIsLoading(false);
        setTimeout(() => {
          document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
        }, 200);
      }
    }
  };

  useEffect(() => {
    setResultsPage((currentPage) => Math.min(currentPage, Math.max(1, Math.ceil(displayResults.length / RESULTS_PAGE_SIZE))));
  }, [displayResults.length]);

  const continueCards = useMemo(() => continueTitles.map((title) => {
    const unitLabel = getTitleTypeMeta(title.type).unitLabel;
    const currentProgress = isEpisodeBasedType(title.type)
      ? Number(title._listProgressEpisode || 0)
      : Number(title._listProgressChapter || 0);
    const totalUnits = isEpisodeBasedType(title.type) ? title.episodes : title.chapters;
    const targetUnits = isEpisodeBasedType(title.type)
      ? Number(title._targetEpisode || 0)
      : Number(title._targetChapter || 0);
    const nextUnit = currentProgress + 1;

    return {
      ...title,
      _continueUnitLabel: unitLabel,
      _continueCurrentProgress: currentProgress,
      _continueNextUnit: nextUnit,
      _continueRemaining: totalUnits ? Math.max(totalUnits - currentProgress, 0) : null,
      _continueTargetUnits: targetUnits || null,
      _continueSummary: totalUnits ? `${unitLabel} ${currentProgress} / ${totalUnits}` : `${unitLabel} ${currentProgress}`,
    };
  }), [continueTitles]);

  const handleContinueAdvance = async (title) => {
    try {
      await advanceProgress(title, 1);
      toast.success(t('home.updatedProgress', { unit: title._continueUnitLabel, value: title._continueNextUnit }));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedUpdateProgress'));
    }
  };

  const handleContinueComplete = async (title) => {
    try {
      await updateItem(title.id, { status: 'completed' }, { title });
      toast.success(t('home.markedCompleted'));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedUpdateStatus'));
    }
  };

  const handleSetNextTarget = async (title) => {
    try {
      await setConsumptionTarget(title, title._continueNextUnit);
      toast.success(t('home.setTargetSuccess', { unit: title._continueUnitLabel, value: title._continueNextUnit }));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedSetTarget'));
    }
  };

  const handleCatchUpTarget = async (title) => {
    try {
      await catchUpToTarget(title);
      toast.success(t('home.caughtUp'));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedCatchUp'));
    }
  };

  const scrollToResultsSection = () => {
    resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleResultsPageChange = (nextPage) => {
    setResultsPage(nextPage);
    window.requestAnimationFrame(scrollToResultsSection);
  };

  const heroTitle = heroBlock?.title || t('home.heroTitle');
  const heroSubtitle = heroBlock?.subtitle || t('home.heroSubtitle');
  const heroAccent = heroBlock?.config?.accentText || t('home.heroAccent');
  const heroLead = heroTitle.includes(heroAccent) ? heroTitle.replace(heroAccent, '') : heroTitle;
  const heroCtaLabel = heroBlock?.config?.ctaLabel || t('home.startFinding');
  const heroCtaHref = heroBlock?.config?.ctaHref || null;
  const showContinueSection = (hasContinueBlock || editorialBlocks.length === 0) && continueCards.length > 0 && !results.length && !isLoading;
  const showTrendingSection = (hasTrendingBlock || editorialBlocks.length === 0) && !results.length && !isLoading;

  return (
    <div className="home-page animate-fade-in">
      {isRandomModalOpen && (
        <div className="random-modal-overlay" onClick={() => setIsRandomModalOpen(false)} aria-hidden="true">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('home.randomDialogLabel')}
            className="random-modal animate-scale-in"
            onClick={(event) => event.stopPropagation()}
          >
            {isRandomLoading ? (
              <div className="random-modal-loading">
                <div className="random-modal-skeleton"></div>
              </div>
            ) : randomPick ? (
              <div className="random-modal-card">
                <TitleCard title={randomPick} hideActions />
              </div>
            ) : (
              <EmptyState
                className="empty-state random-modal-empty"
                title={t('home.noRandomTitle')}
                message={t('home.tryRandomAgain')}
              />
            )}

            <div className="random-modal-actions">
              <Button
                size="lg"
                variant="secondary"
                onClick={handleRandomPick}
                icon={isRandomLoading ? <Loader2 size={18} className="animate-spin" /> : <Dices size={18} />}
                className={`random-modal-button ${isRandomLoading ? 'spinning-icon' : ''}`}
              >
                {isRandomLoading ? t('home.picking') : t('home.pickAgain')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="hero-section">
        <div className="hero-bg-effects">
          <div className="hero-orb hero-orb-1"></div>
          <div className="hero-orb hero-orb-2"></div>
          <div className="hero-orb hero-orb-3"></div>
          <div className="hero-grid-pattern"></div>
        </div>
        <div className="container hero-container text-center">
          <div className="hero-badge animate-fade-in-up">
            <span className="hero-badge-dot"></span>
            {heroBlock?.config?.badgeLabel || t('home.heroBadge')}
          </div>
          <h1 className="hero-title animate-fade-in-up">
            {heroLead}
            {heroTitle.includes(heroAccent) && <span className="text-gradient">{heroAccent}</span>}
          </h1>
          <p className="hero-subtitle animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {heroSubtitle}
          </p>

          <div className="quick-moods animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            {quickMoods.map((mood) => (
              <button
                key={mood.id}
                type="button"
                className={`quick-mood-chip ${moods.includes(mood.id) ? 'active' : ''}`}
                onClick={() => handleQuickMood(mood.id)}
                style={{ '--chip-color': mood.color }}
              >
                <span>{mood.icon}</span> {getLocalizedMoodName(mood, language)}
              </button>
            ))}
          </div>

          <div className="hero-actions animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {heroCtaHref ? (
              <Link to={heroCtaHref} className="hero-link-btn">
                <span className="btn-icon"><Sparkles size={18} /></span>
                <span className="btn-text">{heroCtaLabel}</span>
              </Link>
            ) : (
              <Button size="lg" icon={<Sparkles size={18} />} onClick={() => {
                const el = document.getElementById('finder-section');
                if (!el) return;
                window.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
              }}>
                {heroCtaLabel}
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={handleRandomPick} icon={<Dices size={18} />}>
              {t('home.randomPick')}
            </Button>
          </div>

          <div className="hero-quick-links animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
            <Link to="/discover" className="quick-link">
              <span>{t('common.browse')}</span> {t('home.discoverLink')}
            </Link>
            <Link to="/watchlist" className="quick-link">
              <span>{t('common.list')}</span> {t('home.watchlistLink')}
            </Link>
          </div>
        </div>
      </section>

      <section id="finder-section" className="section finder-section">
        <div className="container">
          <div className="glass-panel main-finder">
            <div className="finder-header">
              <h2 className="finder-title">{t('home.chooseWhatYouWant')}</h2>

              <label className="hide-seen-toggle">
                <input
                  type="checkbox"
                  checked={hideSeen}
                  onChange={(e) => setHideSeen(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb"></span>
                </span>
                <span className="toggle-label">{t('home.hideSeenTitles')}</span>
              </label>
            </div>

            {shouldShowTypeSelector && (
              <div className="type-selector stagger-children" role="toolbar" aria-label={t('home.typeTabsAria')}>
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={type === opt.id}
                    className={`type-btn ${type === opt.id ? 'active' : ''}`}
                    data-type={opt.id}
                    onClick={() => setType(opt.id)}
                  >
                    <span className="type-icon">
                      <TypeIcon option={opt} className="type-icon-graphic" />
                    </span>
                    <span className="type-btn-label">{getLocalizedLabel(opt, language)}</span>
                  </button>
                ))}
              </div>
            )}

            <MoodSelector selected={moods} onChange={setMoods} />
            <div className="divider"></div>
            <TimeSelector selected={timeOption} onChange={setTimeOption} />

            <div className="finder-submit">
              <Button
                size="lg"
                fullWidth
                onClick={handleRecommend}
                disabled={isLoading}
                icon={isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                className={isLoading ? 'spinning-icon' : 'pulse-glow-btn'}
              >
                {isLoading ? t('home.findingMatches') : t('home.findMyMatch')}
              </Button>

              {(selectedVisibleMoods.length > 0 || timeOption || (shouldShowTypeSelector && type !== 'all')) && (
                <button
                  type="button"
                  className="clear-all-btn"
                  onClick={() => {
                    setMoods([]);
                    setTimeOption(null);
                    setType('all');
                  }}
                >
                  {t('home.clearAllFilters')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {(results.length > 0 || isLoading) && (
        <section id="results-section" ref={resultsSectionRef} className="section results-section">
          <div className="container">
            <div className="results-header">
              <h2 className="section-heading">
                {t('home.recommendationsForYou')}
                {displayResults.length > 0 && <span className="results-count">{t('home.titlesCount', { count: displayResults.length })}</span>}
              </h2>
              <div className="results-toolbar-actions" role="toolbar" aria-label={t('home.resultsToolbarAria')}>
                {displayResults.length > 0 && (
                  <span className="results-visible-count">
                    {t('home.showingTitlesCount', { shown: shownResultsCount, count: displayResults.length })}
                  </span>
                )}
                <SortSelect
                  value={resultSortBy}
                  onChange={setResultSortBy}
                  label={t('watchlist.sort')}
                  className="results-sorter"
                >
                  {TITLE_SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                  ))}
                </SortSelect>
                {results.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleRecommend} icon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}>
                    {t('common.refresh')}
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <SkeletonGrid />
            ) : displayResults.length > 0 ? (
              <>
                <div className="results-grid stagger-children">
                  {pagedResults.map((title) => (
                    <TitleCard key={title.id} title={title} />
                  ))}
                </div>
                {resultsTotalPages > 1 && (
                  <div className="results-pagination">
                    <button
                      type="button"
                      className="results-page-btn"
                      onClick={() => handleResultsPageChange(Math.max(1, resultsPage - 1))}
                      disabled={resultsPage <= 1}
                    >
                      {t('common.previous')}
                    </button>
                    <span className="results-page-indicator">
                      {t('common.page')} {resultsPage} / {resultsTotalPages}
                    </span>
                    <button
                      type="button"
                      className="results-page-btn"
                      onClick={() => handleResultsPageChange(Math.min(resultsTotalPages, resultsPage + 1))}
                      disabled={resultsPage >= resultsTotalPages}
                    >
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                icon="No Match"
                title={t('home.noMatchingTitles')}
                message={`${t('home.relaxFilters')}${hideSeen ? t('home.hideSeenHint') : ''}.`}
                action={
                  <Button variant="outline" onClick={() => { setMoods([]); setTimeOption(null); }}>
                    {t('home.clearFilters')}
                  </Button>
                }
              />
            )}
          </div>
        </section>
      )}

      {!results.length && !isLoading && collectionBlocks.length > 0 && (
        <>
          {collectionBlocks.map((block) => {
            const collectionTitles = block.collection.items
              .slice(0, Math.max(1, Number(block.config?.maxItems || block.collection.itemLimit || 12)))
              .map((item) => item.title)
              .filter(Boolean);
            const visibleCollectionTitles = filterTitlesForAgeGate(collectionTitles, showAdult);

            if (visibleCollectionTitles.length === 0) return null;

            return (
              <section key={block.id} className="section editorial-section">
                <div className="container">
                  <SectionHeader
                    title={block.title}
                    subtitle={block.subtitle && <p className="editorial-subtitle">{block.subtitle}</p>}
                    action={block.collection?.slug && (
                      <span className="editorial-chip">{block.collection.badgeLabel || block.collection.slug}</span>
                    )}
                  />
                  <div className="results-grid stagger-children">
                    {visibleCollectionTitles.map((title) => (
                      <TitleCard key={`${block.id}-${title.id}`} title={title} />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </>
      )}

      {showContinueSection && (
        <section className="section">
          <div className="container">
            <SectionHeader
              title={t('home.continueSection')}
              action={
                <Link to="/watchlist" className="quick-link">
                  <span>{t('common.list')}</span> {t('home.openWatchlist')}
                </Link>
              }
            />
            <div className="continue-grid stagger-children">
              {continueCards.map((title) => (
                <div key={title.id} className="continue-card-shell">
                  <TitleCard title={title} />
                  <div className="continue-actions-panel">
                    <div className="continue-copy">
                      <strong>{title._continueSummary}</strong>
                      <span>
                        {title._continueRemaining === null
                          ? t('home.continueAt', { unit: title._continueUnitLabel, value: title._continueNextUnit })
                          : title._continueRemaining <= 1
                            ? t('home.almostDone')
                            : t('home.continueAt', { unit: title._continueUnitLabel, value: title._continueNextUnit })}
                      </span>
                      {title._continueTargetUnits && (
                        <span className="continue-target-pill">
                          {t('common.target')}: {title._continueUnitLabel} {title._continueTargetUnits}
                        </span>
                      )}
                    </div>
                    <div className="continue-actions-row">
                      <Button variant="secondary" onClick={() => handleContinueAdvance(title)}>
                        +1 {title._continueUnitLabel}
                      </Button>
                      <Button variant="ghost" onClick={() => handleSetNextTarget(title)}>
                        {t('home.setTarget')}
                      </Button>
                      {title._continueTargetUnits && title._continueTargetUnits > title._continueCurrentProgress && (
                        <Button variant="ghost" onClick={() => handleCatchUpTarget(title)}>
                          {t('home.catchUp')}
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => handleContinueComplete(title)}>
                        {t('home.markComplete')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {showTrendingSection && (
        <section className="section trending-section">
          <div className="container">
            <SectionHeader
              title={t('home.trendingNow')}
              action={
                <div className="results-toolbar-actions" role="toolbar" aria-label={t('home.trendingToolbarAria')}>
                  <SortSelect
                    value={trendingSortBy}
                    onChange={setTrendingSortBy}
                    label={t('watchlist.sort')}
                    className="results-sorter"
                  >
                    {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
                      <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                    ))}
                  </SortSelect>
                  <label className="hide-seen-toggle alt">
                  <input
                    type="checkbox"
                    checked={hideSeen}
                    onChange={(e) => setHideSeen(e.target.checked)}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb"></span>
                  </span>
                  <span className="toggle-label">{t('home.hideSeen')}</span>
                </label>
              </div>
              }
            />

            {isInitialLoad ? (
              <SkeletonGrid />
            ) : (
              <div className="results-grid stagger-children">
                {displayTrending.map((title, index) => (
                  <TitleCard key={title.id} title={title} priority={index < 4} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default Home;
