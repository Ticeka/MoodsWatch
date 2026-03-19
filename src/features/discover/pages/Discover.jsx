import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import { TitleCard } from '@/shared/components/ui/Card';
import { listTitles, getCacheInfo, clearTitlesCache } from '@/features/discover/lib/recommend';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  buildRecommendationState,
  filterHiddenTitles,
  filterSeenTitles,
  filterTitlesByRecommendationPreferences,
  prioritizeUnseenTitles,
} from '@/features/profile/lib/profileStore';
import { TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import './Discover.css';

const TYPE_TABS = [
  { id: 'all',    labelKey: 'discover.typeAll',    icon: '🌐' },
  { id: 'anime',  labelKey: 'discover.typeAnime',  icon: '📺' },
  { id: 'manga',  labelKey: 'discover.typeManga',  icon: '📚' },
  { id: 'manhwa', labelKey: 'discover.typeManhwa', icon: '🇰🇷' },
];

const QUICK_TAGS = ['manhwa', 'action', 'romance', 'isekai', 'comedy', 'horror'];
const PAGE_SIZE = 20;

export function Discover() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [browseResults, setBrowseResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [hideSeen, setHideSeen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [catalogInfo, setCatalogInfo] = useState(getCacheInfo());
  const [errorMessage, setErrorMessage] = useState('');
  const [sortBy, setSortBy] = useState('popularity');
  const browseSectionRef = useRef(null);
  const loadBrowseRequestRef = useRef(0);

  const { watchlist } = useWatchlist();
  const { hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const recommendationState = useMemo(
    () => buildRecommendationState(watchlist, prefs, hiddenFromDiscoveryIds),
    [watchlist, prefs, hiddenFromDiscoveryIds]
  );

  useEffect(() => {
    setHideSeen(prefs.hideSeenByDefault);
  }, [prefs.hideSeenByDefault]);

  const loadBrowse = useCallback(async ({
    page = 1,
    type = activeTab,
    searchValue = query,
    tagValue = activeTag,
    sortValue = sortBy,
  } = {}) => {
    const requestId = ++loadBrowseRequestRef.current;
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await listTitles({
        type,
        query: searchValue,
        tag: tagValue,
        sortBy: sortValue,
        page,
        pageSize: PAGE_SIZE,
      });

      if (requestId !== loadBrowseRequestRef.current) return null;
      startTransition(() => {
        setBrowseResults(response.items);
        setTotalResults(response.total);
        setTotalPages(response.totalPages);
        setCurrentPage(response.page);
        setCatalogInfo(getCacheInfo());
      });

      return response;
    } catch (error) {
      if (requestId !== loadBrowseRequestRef.current) return null;
      console.error(error);
      startTransition(() => {
        setBrowseResults([]);
        setTotalResults(0);
        setTotalPages(1);
        setCurrentPage(1);
        setCatalogInfo(getCacheInfo());
        setErrorMessage(error.message || t('discover.discoverCatalogError'));
      });
      return null;
    } finally {
      if (requestId === loadBrowseRequestRef.current) setIsLoading(false);
    }
  }, [activeTab, query, activeTag, sortBy, t]);

  const scrollToBrowseSection = useCallback(() => {
    browseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleBrowsePageChange = useCallback((nextPage) => {
    loadBrowse({ page: nextPage, type: activeTab, searchValue: query, tagValue: activeTag, sortValue: sortBy });
    window.requestAnimationFrame(scrollToBrowseSection);
  }, [activeTab, query, activeTag, sortBy, loadBrowse, scrollToBrowseSection]);

  useEffect(() => {
    const handleRebuild = () => {
      clearTitlesCache();
      loadBrowse({ page: 1, type: activeTab, searchValue: query, tagValue: activeTag, sortValue: sortBy });
    };

    window.addEventListener('moodtoon:recommendations-rebuild', handleRebuild);
    return () => window.removeEventListener('moodtoon:recommendations-rebuild', handleRebuild);
  }, [activeTab, query, activeTag, sortBy, loadBrowse]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadBrowse({ page: 1, type: activeTab, searchValue: query, tagValue: activeTag, sortValue: sortBy });
    }, query.trim().length >= 2 ? 250 : activeTag ? 100 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, query, activeTag, sortBy, loadBrowse]);

  const filteredBrowse = useMemo(() => (
    filterSeenTitles(
      filterTitlesByRecommendationPreferences(
        filterHiddenTitles(prioritizeUnseenTitles(browseResults, recommendationState), recommendationState),
        recommendationState
      ),
      recommendationState,
      hideSeen
    )
  ), [browseResults, recommendationState, hideSeen]);

  const activeTabLabel = useMemo(() => {
    const activeTabItem = TYPE_TABS.find((tab) => tab.id === activeTab) || TYPE_TABS[0];
    return t(activeTabItem.labelKey);
  }, [activeTab, t]);

  const hasSearchQuery = query.trim().length >= 2;
  const hasActiveTag = Boolean(activeTag);
  const resultHeading = hasSearchQuery
    ? t('discover.searchResultsFor', { query })
    : hasActiveTag
      ? t('discover.tagResultsFor', { tag: activeTag })
      : t('discover.allOfType', { type: activeTabLabel });
  const shownBrowseCount = filteredBrowse.length;

  return (
    <div className="discover-page animate-fade-in">
      <section className="section discover-header">
        <div className="container text-center">
          <div className="discover-hero-badge animate-fade-in-up">🔍 {t('discover.badge')}</div>
          <h1 className="discover-title animate-fade-in-up">
            {t('discover.title').replace(t('discover.accent'), '')}
            <span className="text-gradient">{t('discover.accent')}</span>
          </h1>
          <p className="discover-subtitle animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            {t('discover.subtitle')}
          </p>

          <div className="search-box glass animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              aria-label={t('discover.searchPlaceholder')}
              placeholder={t('discover.searchPlaceholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              className="search-input"
              autoFocus
            />
            {query && (
              <button
                className="search-clear"
                onClick={() => { setQuery(''); setCurrentPage(1); }}
                aria-label={t('discover.clearSearch')}
                type="button"
              >
                X
              </button>
            )}
          </div>

          <div
            className="type-tabs animate-fade-in-up"
            style={{ animationDelay: '0.2s' }}
            role="toolbar"
            aria-label={t('discover.typeTabsAria')}
          >
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={activeTab === tab.id}
                className={`type-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
              >
                <span>{tab.icon}</span> {t(tab.labelKey)}
              </button>
            ))}
          </div>

          <div className="quick-search-tags animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
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

          {(hasSearchQuery || hasActiveTag) && (
            <div className="discover-active-filters animate-fade-in-up" style={{ animationDelay: '0.28s' }}>
              {hasSearchQuery && <span className="discover-filter-pill">{t('discover.searchLabel')}: {query}</span>}
              {hasActiveTag && (
                <button className="discover-filter-pill is-removable" onClick={() => setActiveTag('')} type="button">
                  {t('discover.tagLabel')}: {activeTag} <XIcon size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <div className="discover-catalog-wrap animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <span className="catalog-pill">
              {t('discover.catalogLabel')}
              <span className="catalog-pill-meta">
                {catalogInfo.count > 0 ? t('discover.loaded', { count: catalogInfo.count }) : t('common.loading').toLowerCase()}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="section discover-content">
        <div className="container">
          {errorMessage && <ErrorState message={errorMessage} />}

          {!errorMessage && (
            <div ref={browseSectionRef} className="browse-context animate-fade-in-up">
              <div className="browse-toolbar">
                <h3 className="browse-heading">
                  {resultHeading}
                  <span className="browse-count">{t('discover.resultCount', { count: totalResults })}</span>
                </h3>
                <div className="browse-toolbar-actions" role="toolbar" aria-label={t('discover.resultsToolbarAria')}>
                  {totalResults > 0 && (
                    <span className="browse-visible-count">
                      {t('discover.showingResultCount', { shown: shownBrowseCount, count: totalResults })}
                    </span>
                  )}
                  <SortSelect
                    value={sortBy}
                    onChange={(value) => { setSortBy(value); setCurrentPage(1); }}
                    label={t('watchlist.sort')}
                    className="discover-sorter"
                  >
                    {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </SortSelect>
                  <label className="hide-seen-toggle">
                    <input type="checkbox" checked={hideSeen} onChange={(event) => setHideSeen(event.target.checked)} />
                    <span className="toggle-track"><span className="toggle-thumb"></span></span>
                    <span className="toggle-label">{t('discover.hideSeen')}</span>
                  </label>
                </div>
              </div>

              {isLoading ? (
                <SkeletonGrid />
              ) : filteredBrowse.length > 0 ? (
                <>
                  <div className="results-grid stagger-children">
                    {filteredBrowse.map((title) => (
                      <TitleCard key={title.id} title={title} />
                    ))}
                  </div>

                  <div className="discover-pagination">
                    <button
                      onClick={() => handleBrowsePageChange(currentPage - 1)}
                      className="primary-btn discover-page-btn"
                      disabled={currentPage <= 1}
                      type="button"
                    >
                      {t('common.previous')}
                    </button>
                    <span className="discover-page-indicator">
                      {t('discover.pageIndicator', { page: currentPage, total: totalPages })}
                    </span>
                    <button
                      onClick={() => handleBrowsePageChange(currentPage + 1)}
                      className="primary-btn discover-page-btn"
                      disabled={currentPage >= totalPages}
                      type="button"
                    >
                      {t('common.next')}
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState
                  className="empty-discover"
                  title={t('discover.noResults')}
                  message={t('discover.noResultsHint')}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Discover;
