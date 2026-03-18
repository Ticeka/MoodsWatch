import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
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
import { TYPE_OPTIONS, MOODS, getLocalizedLabel, getLocalizedMoodName } from '@/shared/data/moods';
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
  prioritizeUnseenTitles,
} from '@/features/profile/lib/profileStore';
import { getTitleTypeMeta, isEpisodeBasedType } from '@/shared/lib/titleType';
import './Home.css';

const RESULTS_PAGE_SIZE = 16;

export function Home() {
  const { language, t } = useLanguage();
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

  const { watchlist, advanceProgress, updateItem, setConsumptionTarget, catchUpToTarget } = useWatchlist();
  const { favoriteTitleIds } = useFavoriteTitles();
  const { hiddenFromRecommendationIds, hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const recommendationState = buildRecommendationState(watchlist, prefs, hiddenFromRecommendationIds);
  const discoveryState = buildRecommendationState(watchlist, prefs, hiddenFromDiscoveryIds);
  const effectiveMoodFilters = moods.length > 0 ? moods : prefs.favoriteMoods;
  const canRequestRecommendations = moods.length > 0 || prefs.favoriteMoods.length > 0 || !!timeOption || type !== 'all';

  useEffect(() => {
    setHideSeen(prefs.hideSeenByDefault);
  }, [prefs.hideSeenByDefault]);

  useEffect(() => {
    async function fetchInitial() {
      try {
        const [nextTrending, homepageBlocks] = await Promise.all([
          getTrendingTitles(8),
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
  }, [refreshToken]);

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
          setContinueTitles(
            continueItems
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
              .filter(Boolean)
          );
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
  }, [watchlist, hiddenFromDiscoveryIds]);

  const handleRecommend = async () => {
    setIsLoading(true);
    try {
      const recs = await recommend({
        type,
        moods: effectiveMoodFilters,
        timeOption: timeOption ? { id: timeOption } : null,
        likedTitleIds: favoriteTitleIds,
        limit: null,
        watchlist,
        preferences: prefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
      });
      startTransition(() => {
        setResults(recs);
        setResultsPage(1);
        setCatalogInfo(getCacheInfo());
      });
    } catch (err) {
      console.error('Failed to fetch recommendations', err);
      setCatalogInfo(getCacheInfo());
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleRandomPick = async () => {
    setIsRandomLoading(true);
    setIsRandomModalOpen(true);
    try {
      const recs = await recommend({
        type: 'all',
        moods: prefs.favoriteMoods,
        likedTitleIds: favoriteTitleIds,
        limit: 80,
        watchlist,
        preferences: prefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
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

  const applyRecommendationFilters = (list) => (
    filterTitlesByRecommendationPreferences(
      filterHiddenTitles(list, discoveryState),
      discoveryState
    )
  );
  const filterSeen = (list) => filterSeenTitles(applyRecommendationFilters(list), recommendationState, hideSeen);
  const orderTitles = (list) => prioritizeUnseenTitles(list, recommendationState);

  const displayResults = useMemo(
    () => sortTitlesCollection(filterSeen(orderTitles(results)), resultSortBy),
    [results, resultSortBy, recommendationState, discoveryState, hideSeen]
  );
  const displayTrending = useMemo(
    () => sortTitlesCollection(filterSeen(orderTitles(trending)), trendingSortBy),
    [trending, trendingSortBy, recommendationState, discoveryState, hideSeen]
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

  const quickMoods = MOODS.slice(0, 6);
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
    setMoods([moodId]);
    setIsLoading(true);
    try {
      const recs = await recommend({
        moods: [moodId],
        likedTitleIds: favoriteTitleIds,
        limit: null,
        watchlist,
        preferences: prefs,
        hiddenTitleIds: hiddenFromRecommendationIds,
      });
      startTransition(() => {
        setResults(recs);
        setResultsPage(1);
        setCatalogInfo(getCacheInfo());
      });
    } catch (err) {
      console.error(err);
      setCatalogInfo(getCacheInfo());
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
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
        <div className="random-modal-overlay" onClick={() => setIsRandomModalOpen(false)}>
          <div
            className="random-modal animate-scale-in"
            onClick={(event) => event.stopPropagation()}
          >
            {isRandomLoading ? (
              <div className="random-modal-loading">
                <div className="random-modal-skeleton"></div>
              </div>
            ) : randomPick ? (
              <div className="random-modal-card">
                <TitleCard title={randomPick} />
              </div>
            ) : (
              <div className="empty-state random-modal-empty">
                <span className="empty-icon">Random</span>
                <h3>{t('home.noRandomTitle')}</h3>
                <p>{t('home.tryRandomAgain')}</p>
              </div>
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
	              <Button size="lg" icon={<Sparkles size={18} />} onClick={() => document.getElementById('finder-section').scrollIntoView({ behavior: 'smooth' })}>
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

          <div className="animate-fade-in-up" style={{ animationDelay: '0.3s', marginTop: 'var(--space-4)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.875rem',
                borderRadius: '999px',
                background: 'rgba(34, 197, 94, 0.14)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Catalog: canonical_titles
              <span style={{ opacity: 0.8, fontWeight: 500 }}>
                {catalogInfo.count > 0 ? t('home.catalogLoaded', { count: catalogInfo.count }) : t('common.loading')}
              </span>
            </span>
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

            <div className="type-selector stagger-children">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`type-btn ${type === opt.id ? 'active' : ''}`}
                  onClick={() => setType(opt.id)}
                >
                  <span className="type-icon"><TypeIcon option={opt} /></span>
                  {getLocalizedLabel(opt, language)}
                </button>
              ))}
            </div>

            <MoodSelector selected={moods} onChange={setMoods} />
            <div className="divider"></div>
            <TimeSelector selected={timeOption} onChange={setTimeOption} />

            <div className="finder-submit">
              <Button
                size="lg"
                fullWidth
                onClick={handleRecommend}
                disabled={isLoading || !canRequestRecommendations}
                icon={isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                className={isLoading ? 'spinning-icon' : 'pulse-glow-btn'}
              >
                {isLoading ? t('home.findingMatches') : t('home.findMyMatch')}
              </Button>

              {(moods.length > 0 || timeOption || type !== 'all') && (
                <button
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
              <div className="results-toolbar-actions">
                {displayResults.length > 0 && (
                  <span className="results-visible-count">
                    {t('home.showingTitlesCount', { shown: shownResultsCount, count: displayResults.length })}
                  </span>
                )}
                <label className="results-sorter">
                  <span>{t('watchlist.sort')}</span>
                  <select value={resultSortBy} onChange={(event) => setResultSortBy(event.target.value)}>
                    {TITLE_SORT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                {results.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleRecommend} icon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}>
                    {t('common.refresh')}
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="loading-grid">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className="skeleton-card"></div>
                ))}
              </div>
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
              <div className="empty-state">
                <span className="empty-icon">No Match</span>
                <h3>{t('home.noMatchingTitles')}</h3>
                <p>{t('home.relaxFilters')}{hideSeen ? t('home.hideSeenHint') : ''}.</p>
                <Button variant="outline" onClick={() => { setMoods([]); setTimeOption(null); }}>
                  {t('home.clearFilters')}
                </Button>
              </div>
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

            if (collectionTitles.length === 0) return null;

            return (
              <section key={block.id} className="section editorial-section">
                <div className="container">
                  <div className="section-header-row">
                    <div>
                      <h2 className="section-heading">{block.title}</h2>
                      {block.subtitle && <p className="editorial-subtitle">{block.subtitle}</p>}
                    </div>
                    {block.collection?.slug && (
                      <span className="editorial-chip">{block.collection.badgeLabel || block.collection.slug}</span>
                    )}
                  </div>
                  <div className="results-grid stagger-children">
                    {collectionTitles.map((title) => (
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
            <div className="section-header-row">
              <h2 className="section-heading">{t('home.continueSection')}</h2>
              <Link to="/watchlist" className="quick-link">
                <span>{t('common.list')}</span> {t('home.openWatchlist')}
              </Link>
            </div>
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
            <div className="section-header-row">
              <h2 className="section-heading">{t('home.trendingNow')}</h2>
              <div className="results-toolbar-actions">
                <label className="results-sorter">
                  <span>{t('watchlist.sort')}</span>
                  <select value={trendingSortBy} onChange={(event) => setTrendingSortBy(event.target.value)}>
                    {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
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
            </div>

            {isInitialLoad ? (
              <div className="loading-grid">
                {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="skeleton-card"></div>)}
              </div>
            ) : (
              <div className="results-grid stagger-children">
                {displayTrending.map((title) => (
                  <TitleCard key={title.id} title={title} />
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
