import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import './Discover.css';

const TYPE_TABS = [
  { id: 'all', labelTh: 'ทั้งหมด', labelEn: 'All', icon: '🌐' },
  { id: 'anime', labelTh: 'อนิเมะ', labelEn: 'Anime', icon: '📺' },
  { id: 'manga', labelTh: 'มังงะ', labelEn: 'Manga', icon: '📖' },
  { id: 'manhwa', labelTh: 'มันฮวา', labelEn: 'Manhwa', icon: '🇰🇷' },
];

const QUICK_TAGS = ['manhwa', 'action', 'romance', 'isekai', 'comedy', 'horror'];
const PAGE_SIZE = 20;

export function Discover() {
  const { language, t } = useLanguage();
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

  const { watchlist } = useWatchlist();
  const { hiddenFromDiscoveryIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const recommendationState = buildRecommendationState(watchlist, prefs, hiddenFromDiscoveryIds);

  useEffect(() => {
    setHideSeen(prefs.hideSeenByDefault);
  }, [prefs.hideSeenByDefault]);

  const loadBrowse = useCallback(async ({ page = 1, type = activeTab, searchValue = query, tagValue = activeTag, sortValue = sortBy } = {}) => {
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

      setBrowseResults(response.items);
      setTotalResults(response.total);
      setTotalPages(response.totalPages);
      setCurrentPage(response.page);
      setCatalogInfo(getCacheInfo());
      return response;
    } catch (error) {
      console.error(error);
      setBrowseResults([]);
      setTotalResults(0);
      setTotalPages(1);
      setCurrentPage(1);
      setCatalogInfo(getCacheInfo());
      setErrorMessage(error.message || t('discover.discoverCatalogError'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, query, activeTag, sortBy, t]);

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

  const filteredBrowse = filterSeenTitles(
    filterTitlesByRecommendationPreferences(
      filterHiddenTitles(prioritizeUnseenTitles(browseResults, recommendationState), recommendationState),
      recommendationState
    ),
    recommendationState,
    hideSeen
  );

  const activeTabLabel = useMemo(() => {
    const activeTabItem = TYPE_TABS.find((tab) => tab.id === activeTab) || TYPE_TABS[0];
    return language === 'th' ? activeTabItem.labelTh : activeTabItem.labelEn;
  }, [activeTab, language]);

  const hasSearchQuery = query.trim().length >= 2;
  const hasActiveTag = Boolean(activeTag);
  const resultHeading = hasSearchQuery
    ? t('discover.searchResultsFor', { query })
    : hasActiveTag
      ? t('discover.tagResultsFor', { tag: activeTag })
      : t('discover.allOfType', { type: activeTabLabel });

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
            <span className="search-icon">🔍</span>
            <input
              type="text"
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
              <button className="search-clear" onClick={() => { setQuery(''); setCurrentPage(1); }} aria-label={t('discover.clearSearch')}>
                ×
              </button>
            )}
          </div>

          <div className="type-tabs animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`type-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setCurrentPage(1);
                }}
              >
                <span>{tab.icon}</span> {language === 'th' ? tab.labelTh : tab.labelEn}
              </button>
            ))}
          </div>

          <div className="quick-search-tags animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                className={`quick-tag ${activeTag === tag ? 'active' : ''}`}
                onClick={() => {
                  setActiveTag((currentTag) => currentTag === tag ? '' : tag);
                  setCurrentPage(1);
                }}
              >
                {tag}
              </button>
            ))}
          </div>

          {(hasSearchQuery || hasActiveTag) && (
            <div className="discover-active-filters animate-fade-in-up" style={{ animationDelay: '0.28s' }}>
              {hasSearchQuery && <span className="discover-filter-pill">{t('discover.searchLabel')}: {query}</span>}
              {hasActiveTag && (
                <button className="discover-filter-pill is-removable" onClick={() => setActiveTag('')}>
                  {t('discover.tagLabel')}: {activeTag} ×
                </button>
              )}
            </div>
          )}

          <div className="discover-catalog-wrap animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            <span className="catalog-pill">
              Catalog: canonical_titles
              <span className="catalog-pill-meta">
                {catalogInfo.count > 0 ? t('discover.loaded', { count: catalogInfo.count }) : t('common.loading').toLowerCase()}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="section discover-content">
        <div className="container">
          {errorMessage && (
            <div className="empty-discover">
              <span className="empty-emoji">⚠️</span>
              <p>{errorMessage}</p>
            </div>
          )}

          {!errorMessage && (
            <div className="browse-context animate-fade-in-up">
	              <div className="browse-toolbar">
	                <h3 className="browse-heading">
	                  {resultHeading}
	                  <span className="browse-count">{t('discover.resultCount', { count: totalResults })}</span>
	                </h3>
	                <div className="browse-toolbar-actions">
	                  <label className="discover-sorter">
	                    <span>{t('watchlist.sort')}</span>
		                    <select value={sortBy} onChange={(event) => {
		                      setSortBy(event.target.value);
		                      setCurrentPage(1);
		                    }}>
	                      {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
	                        <option key={option.id} value={option.id}>{option.label}</option>
	                      ))}
	                    </select>
	                  </label>
	                  <label className="hide-seen-toggle">
	                    <input type="checkbox" checked={hideSeen} onChange={(event) => setHideSeen(event.target.checked)} />
	                    <span className="toggle-track"><span className="toggle-thumb"></span></span>
	                    <span className="toggle-label">{t('discover.hideSeen')}</span>
	                  </label>
	                </div>
	              </div>

              {isLoading ? (
                <div className="loading-grid">
                  {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="skeleton-card"></div>)}
                </div>
              ) : filteredBrowse.length > 0 ? (
                <>
                  <div className="results-grid stagger-children">
                    {filteredBrowse.map((title) => (
                      <TitleCard key={title.id} title={title} />
                    ))}
                  </div>

                  <div className="discover-pagination">
                    <button
	                      onClick={() => loadBrowse({ page: currentPage - 1, type: activeTab, searchValue: query, tagValue: activeTag, sortValue: sortBy })}
                      className="primary-btn discover-page-btn"
                      disabled={currentPage <= 1}
                    >
                      {t('common.previous')}
                    </button>
                    <span className="discover-page-indicator">
                      {t('discover.pageIndicator', { page: currentPage, total: totalPages })}
                    </span>
                    <button
	                      onClick={() => loadBrowse({ page: currentPage + 1, type: activeTab, searchValue: query, tagValue: activeTag, sortValue: sortBy })}
                      className="primary-btn discover-page-btn"
                      disabled={currentPage >= totalPages}
                    >
                      {t('common.next')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-discover">
                  <div className="empty-illustration">
                    <span className="empty-main-icon">🔍</span>
                    <div className="empty-floating">
                      <span>📺</span>
                      <span>📖</span>
                      <span>🇰🇷</span>
                    </div>
                  </div>
                  <h3>{t('discover.noResults')}</h3>
                  <p>{t('discover.noResultsHint')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default Discover;
