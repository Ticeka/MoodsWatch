import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { BRAND_NAME } from '@/shared/config/brand';
import {
  buildRecommendationState,
  filterHiddenTitles,
  filterSeenTitles,
  filterTitlesByRecommendationPreferences,
  prioritizeUnseenTitles,
} from '@/features/profile/lib/profileStore';

import { recordAutocompleteSelection } from '../lib/autocompleteFeedback';
import { buildTitleSearchCandidates } from '../lib/recommend';
import { getSearchIntent, sortBySearchRelevance } from '../lib/searchMatch';
import { areSearchPresetsEqual, sanitizeSavedSearch } from '../lib/discoverSearchState';
import { useDiscoverSavedSearches } from '../hooks/useDiscoverSavedSearches';
import { useSearchAutocomplete } from '../hooks/useSearchAutocomplete';
import { useDiscoverFilters } from '../hooks/useDiscoverFilters';
import { useDiscoverResults } from '../hooks/useDiscoverResults';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useRecoverySuggestions } from '../hooks/useRecoverySuggestions';
import { useDiscoverAnalytics } from '../hooks/useDiscoverAnalytics';

import {
  SEARCH_SCOPE_TABS,
  SUGGESTED_SEARCHES,
  TITLE_TYPE_TABS,
  describeSearchPreset,
} from '../constants/discoverConfig';

import { DiscoverHero } from '../components/sections/DiscoverHero';
import { DiscoverSearchField } from '../components/sections/DiscoverSearchField';
import { DiscoverSearchMeta } from '../components/sections/DiscoverSearchMeta';
import { DiscoverScopeTabs } from '../components/sections/DiscoverScopeTabs';
import { DiscoverFilterBar } from '../components/sections/DiscoverFilterBar';
import { DiscoverQuickPicks } from '../components/sections/DiscoverQuickPicks';
import { DiscoverSavedSearches } from '../components/sections/DiscoverSavedSearches';
import { DiscoverStarterLanes } from '../components/sections/DiscoverStarterLanes';
import { DiscoverActiveFilters } from '../components/sections/DiscoverActiveFilters';
import { DiscoverResultsToolbar } from '../components/sections/DiscoverResultsToolbar';
import { DiscoverResultsOverview } from '../components/sections/DiscoverResultsOverview';
import { DiscoverResults } from '../components/sections/DiscoverResults';
import { DiscoverRecoveryActions } from '../components/sections/DiscoverRecoveryActions';

import '../styles/Discover.css';

export function Discover() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const locale = language === 'th' ? 'th-TH' : 'en-US';

  const {
    query,
    updateQuery,
    scope,
    titleType,
    tag,
    page,
    sortBy,
    setScope,
    setTitleType,
    setTag,
    toggleTag,
    setPage,
    setSortBy,
    applyPreset: applyFilterPreset,
    resetAll,
  } = useDiscoverFilters();

  const { recentSearches, remember: rememberRecentSearch, clear: clearRecentSearches } = useRecentSearches();
  const {
    titlesState,
    posts,
    profiles,
    tierlists,
    loading,
    error,
    catalogInfo,
    retry,
  } = useDiscoverResults({
    query,
    scope,
    titleType,
    tag,
    sortBy,
    page,
    showAdult,
    userId: user?.id || null,
    t,
  });

  const [hideSeen, setHideSeen] = useState(false);
  const [searchAutocompleteOpen, setSearchAutocompleteOpen] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [showSearchWorkbench, setShowSearchWorkbench] = useState(false);
  const [editingSavedSearchId, setEditingSavedSearchId] = useState(null);
  const [savedSearchLabelDraft, setSavedSearchLabelDraft] = useState('');

  const searchInputRef = useRef(null);
  const searchFormRef = useRef(null);
  const savedSearchInputRef = useRef(null);
  const browseSectionRef = useRef(null);
  const helperChipRefs = useRef([]);

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

  const autocomplete = useSearchAutocomplete(query, {
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

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return undefined;

    const timeoutId = window.setTimeout(() => {
      rememberRecentSearch(normalizedQuery);
    }, 1400);
    return () => window.clearTimeout(timeoutId);
  }, [query, rememberRecentSearch]);

  useEffect(() => {
    if (!editingSavedSearchId) return;
    window.requestAnimationFrame(() => {
      savedSearchInputRef.current?.focus();
      savedSearchInputRef.current?.select();
    });
  }, [editingSavedSearchId]);

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
    if (query.trim().length < 2) return filteredTitles;
    return sortBySearchRelevance(
      filteredTitles,
      query,
      (title) => buildTitleSearchCandidates(title, searchIntent),
      (left, right) => Number(right.popularity || 0) - Number(left.popularity || 0),
    );
  }, [filteredTitles, query, searchIntent]);

  const normalizedQuery = query.trim();
  const hasAnyQuery = normalizedQuery.length > 0;
  const hasCommittedQuery = normalizedQuery.length >= 2;
  const hasActiveTag = Boolean(tag);
  const isIdleDiscover = scope === 'all' && !hasAnyQuery && !hasActiveTag;
  const hasAnyLoading = loading.titles || loading.posts || loading.people || loading.tierlists;
  const visibleTitleCount = rankedTitles.length;
  const titleScopeCount = titlesState.total;
  const allScopeCount = visibleTitleCount + posts.length + profiles.length + tierlists.length;
  const hasDiscoverFilters = hasCommittedQuery || hasActiveTag || scope !== 'all' || titleType !== 'all';
  const showScopeCounts = hasAnyQuery || hasActiveTag || scope !== 'all' || titleType !== 'all' || hasAnyLoading;

  const noResultsEverywhere = !hasAnyLoading
    && visibleTitleCount === 0
    && posts.length === 0
    && profiles.length === 0
    && tierlists.length === 0
    && !error.titles
    && !error.posts
    && !error.people
    && !error.tierlists;

  const { suggestions: recoverySuggestions, isLoading: isRecoveryLoading } = useRecoverySuggestions({
    enabled: noResultsEverywhere,
    query: normalizedQuery,
    showAdult,
  });
  const visibleRecoverySuggestions = noResultsEverywhere && normalizedQuery.length >= 3 ? recoverySuggestions : [];
  const isVisibleRecoveryLoading = noResultsEverywhere && normalizedQuery.length >= 3 ? isRecoveryLoading : false;

  const crossLaneFallback = useMemo(() => {
    if (
      scope !== 'all'
      || hasAnyLoading
      || !hasCommittedQuery
      || visibleTitleCount > 0
      || noResultsEverywhere
    ) return null;
    const lanes = [];
    if (posts.length > 0) lanes.push(t('discover.scopePosts'));
    if (profiles.length > 0) lanes.push(t('discover.scopePeople'));
    if (tierlists.length > 0) lanes.push(t('discover.scopeTierlists'));
    return lanes.length > 0 ? lanes.join(', ') : null;
  }, [hasAnyLoading, hasCommittedQuery, noResultsEverywhere, posts.length, profiles.length, scope, t, tierlists.length, visibleTitleCount]);

  const currentHeading = useMemo(() => {
    if (scope === 'posts') return hasAnyQuery ? t('discover.postsResultsFor', { query }) : t('discover.scopePosts');
    if (scope === 'people') return hasAnyQuery ? t('discover.peopleResultsFor', { query }) : t('discover.scopePeople');
    if (scope === 'tierlists') return hasAnyQuery ? t('discover.tierlistsResultsFor', { query }) : t('discover.scopeTierlists');
    if (scope === 'titles') {
      if (hasAnyQuery) return t('discover.searchResultsFor', { query });
      if (hasActiveTag) return t('discover.tagResultsFor', { tag });
      const typeLabel = TITLE_TYPE_TABS.find((item) => item.id === titleType) || TITLE_TYPE_TABS[0];
      return t('discover.allOfType', { type: t(typeLabel.labelKey) });
    }
    return hasAnyQuery ? t('discover.resultsFor', { query }) : t('discover.allResultsTitle');
  }, [hasActiveTag, hasAnyQuery, query, scope, t, tag, titleType]);

  const currentSubtitle = useMemo(() => {
    if (scope === 'titles') {
      if (searchIntent.isShort) return t('discover.shortQueryHint');
      if (searchIntent.isBroad) return t('discover.broadQueryHint');
      return t('discover.titlesScopeSubtitle', { shown: visibleTitleCount, count: titlesState.total });
    }
    if (scope === 'posts') return hasAnyQuery ? t('discover.postsResultsHint') : t('discover.postsDefaultHint');
    if (scope === 'people') return hasAnyQuery ? t('discover.peopleResultsHint') : t('discover.peopleDefaultHint');
    if (scope === 'tierlists') return hasAnyQuery ? t('discover.tierlistsResultsHint') : t('discover.tierlistsDefaultHint');
    if (searchIntent.isShort) return t('discover.shortQueryHint');
    if (searchIntent.isBroad) return t('discover.broadQueryHint');
    return t('discover.allResultsSubtitle');
  }, [hasAnyQuery, scope, searchIntent.isBroad, searchIntent.isShort, t, titlesState.total, visibleTitleCount]);

  useEffect(() => {
    document.title = `${currentHeading} | ${BRAND_NAME}`;
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) {
      descriptionTag.setAttribute(
        'content',
        `${currentSubtitle} ${BRAND_NAME} helps you search titles, people, posts, and tier lists.`.trim(),
      );
    }
  }, [currentHeading, currentSubtitle]);

  const resultCounts = useMemo(() => ({
    titles: visibleTitleCount,
    posts: posts.length,
    people: profiles.length,
    tierlists: tierlists.length,
  }), [posts.length, profiles.length, tierlists.length, visibleTitleCount]);

  const analytics = useDiscoverAnalytics({
    userId: user?.id || null,
    query,
    scope,
    titleType,
    tag,
    counts: resultCounts,
    searchMode: searchIntent.mode,
    isLoading: hasAnyLoading,
    hasAnyQuery,
    hasActiveTag,
  });

  const scrollToBrowseSection = useCallback(() => {
    browseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const applySearchPreset = useCallback((preset, source = 'preset') => {
    applyFilterPreset(preset);
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
    if (preset.query) rememberRecentSearch(preset.query);
    analytics.trackPresetApply(preset, source);
  }, [analytics, applyFilterPreset, rememberRecentSearch]);

  const handleAutocompleteSelect = useCallback((item = null) => {
    const nextRecentTerm = item?.searchTerm || query.trim();
    if (nextRecentTerm) rememberRecentSearch(nextRecentTerm);
    if (item?.id) {
      recordAutocompleteSelection({ query, itemId: item.id });
      analytics.trackAutocompleteSelect(item);
    }
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
  }, [analytics, query, rememberRecentSearch]);

  const applyRecoverySuggestion = useCallback((nextQuery) => {
    const normalizedSuggestion = String(nextQuery || '').trim();
    if (!normalizedSuggestion) return;

    rememberRecentSearch(normalizedSuggestion);
    applyFilterPreset({ scope: 'all', query: normalizedSuggestion, tag: '', titleType: 'all' });
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
    window.requestAnimationFrame(scrollToBrowseSection);
    analytics.trackRecoveryApply(normalizedSuggestion);
  }, [analytics, applyFilterPreset, rememberRecentSearch, scrollToBrowseSection]);

  const handleSearchSubmit = useCallback((event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) rememberRecentSearch(trimmed);
    setSearchAutocompleteOpen(false);
    setHighlightedSuggestionIndex(-1);
    window.requestAnimationFrame(scrollToBrowseSection);
  }, [query, rememberRecentSearch, scrollToBrowseSection]);

  const handleBrowsePageChange = useCallback((nextPage) => {
    const clampedPage = Math.min(Math.max(1, nextPage), Math.max(1, titlesState.totalPages || 1));
    setPage(clampedPage);
    window.requestAnimationFrame(scrollToBrowseSection);
  }, [scrollToBrowseSection, setPage, titlesState.totalPages]);

  const clearActiveFilters = useCallback(() => {
    resetAll();
    setSearchAutocompleteOpen(false);
    window.requestAnimationFrame(() => { searchInputRef.current?.focus(); });
  }, [resetAll]);

  const currentSearchPreset = useMemo(() => sanitizeSavedSearch({
    id: 'current',
    query,
    tag,
    scope,
    titleType,
  }), [query, scope, tag, titleType]);

  const hasSavableSearch = Boolean(currentSearchPreset);
  const isCurrentSearchSaved = currentSearchPreset
    ? savedSearches.some((entry) => areSearchPresetsEqual(entry, currentSearchPreset))
    : false;

  const saveCurrentSearch = useCallback(() => {
    if (!currentSearchPreset) return;
    void saveSearch({ ...currentSearchPreset, label: describeSearchPreset(currentSearchPreset, t) });
    analytics.trackSavedSearchCreate();
    toast.success(t('discover.savedSearchCreated'));
  }, [analytics, currentSearchPreset, saveSearch, t]);

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
    analytics.trackSavedSearchUpdate(entry, 'rename', { hasCustomLabel: Boolean(nextLabel) });
    toast.success(t('discover.savedSearchRenamed'));
    cancelSavedSearchRename();
  }, [analytics, cancelSavedSearchRename, renameSearch, savedSearchLabelDraft, t]);

  const handleSavedSearchPinToggle = useCallback(async (entry) => {
    await togglePinSearch(entry.id);
    analytics.trackSavedSearchUpdate(entry, entry.pinned ? 'unpin' : 'pin');
  }, [analytics, togglePinSearch]);

  const handleSavedSearchDelete = useCallback(async (entry) => {
    const confirmed = window.confirm(
      language === 'th'
        ? `ลบชุดค้นหาที่บันทึก "${describeSearchPreset(entry, t)}" ใช่ไหม?`
        : `Delete saved search "${describeSearchPreset(entry, t)}"?`,
    );
    if (!confirmed) return;
    if (editingSavedSearchId === entry.id) cancelSavedSearchRename();
    await deleteSearch(entry.id);
    analytics.trackSavedSearchDelete(entry);
    toast.success(t('discover.savedSearchDeleted'));
  }, [analytics, cancelSavedSearchRename, deleteSearch, editingSavedSearchId, language, t]);

  const handleClearSavedSearches = useCallback(() => {
    const confirmed = window.confirm(
      language === 'th' ? 'ลบการค้นหาที่บันทึกไว้ทั้งหมดใช่ไหม?' : 'Delete all saved searches?',
    );
    if (!confirmed) return;
    cancelSavedSearchRename();
    void clearAllSearches();
    analytics.trackSavedSearchDelete(null, 'clear_all');
    toast.success(t('discover.savedSearchesCleared'));
  }, [analytics, cancelSavedSearchRename, clearAllSearches, language, t]);

  const isSearchWorkbenchOpen = showSearchWorkbench || Boolean(editingSavedSearchId);
  const renderedSavedSearches = isSearchWorkbenchOpen ? savedSearches : [];

  const visibleRecentSearches = hasAnyQuery ? [] : recentSearches;
  const helperChipCount = visibleRecentSearches.length + SUGGESTED_SEARCHES.length + renderedSavedSearches.length;
  const recentSearchOffset = 0;
  const suggestedSearchOffset = visibleRecentSearches.length;
  const savedSearchOffset = visibleRecentSearches.length + SUGGESTED_SEARCHES.length;
  helperChipRefs.current.length = helperChipCount;

  const focusHelperChip = useCallback((index) => {
    if (!helperChipCount) return;
    const nextIndex = ((index % helperChipCount) + helperChipCount) % helperChipCount;
    helperChipRefs.current[nextIndex]?.focus();
  }, [helperChipCount]);

  const handleSearchInputKeyDown = useCallback((event) => {
    const flatItems = autocomplete.flatItems;
    if (searchAutocompleteOpen && flatItems.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedSuggestionIndex((current) => (current + 1) % flatItems.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedSuggestionIndex((current) => (current <= 0 ? flatItems.length - 1 : current - 1));
        return;
      }
      if (event.key === 'Enter' && highlightedSuggestionIndex >= 0) {
        event.preventDefault();
        const selectedItem = flatItems[highlightedSuggestionIndex];
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

    if (!helperChipCount) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusHelperChip(0);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusHelperChip(helperChipCount - 1);
    }
  }, [autocomplete.flatItems, focusHelperChip, handleAutocompleteSelect, helperChipCount, highlightedSuggestionIndex, navigate, searchAutocompleteOpen]);

  const handleHelperChipKeyDown = useCallback((event, index) => {
    if (!helperChipCount) return;
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

  const emptyStateAction = (
    <DiscoverRecoveryActions
      suggestions={visibleRecoverySuggestions}
      isLoading={isVisibleRecoveryLoading}
      showClear={hasAnyQuery || hasActiveTag}
      onApplySuggestion={applyRecoverySuggestion}
      onClear={clearActiveFilters}
    />
  );

  const scopeCounts = {
    all: allScopeCount,
    titles: titleScopeCount,
    posts: posts.length,
    people: profiles.length,
    tierlists: tierlists.length,
  };

  const laneCounts = {
    titles: titleScopeCount,
    posts: posts.length,
    people: profiles.length,
    tierlists: tierlists.length,
  };

  return (
    <div className="dv2-root animate-fade-in">
      <div className="dv2-container">
        <DiscoverHero>
          <div className="dv2-search-shell">
            <DiscoverSearchField
              ref={searchInputRef}
              formRef={searchFormRef}
              query={query}
              onQueryChange={(next) => {
                updateQuery(next);
                setSearchAutocompleteOpen(true);
              }}
              onClear={() => updateQuery('')}
              onFocus={() => setSearchAutocompleteOpen(true)}
              onKeyDown={handleSearchInputKeyDown}
              onSubmit={handleSearchSubmit}
              autocomplete={autocomplete}
              isOpen={searchAutocompleteOpen}
              highlightedIndex={highlightedSuggestionIndex}
              onAutocompleteSelect={handleAutocompleteSelect}
              onSearchAll={() => {
                if (query.trim()) rememberRecentSearch(query.trim());
                setSearchAutocompleteOpen(false);
                window.requestAnimationFrame(scrollToBrowseSection);
              }}
            />

            <DiscoverSearchMeta
              isLoading={hasAnyLoading}
              isShortQuery={searchIntent.isShort}
              isBroadQuery={searchIntent.isBroad}
              catalogCount={catalogInfo.count}
              canSave={hasSavableSearch}
              isSaved={isCurrentSearchSaved}
              isSaveDisabled={isCurrentSearchSaved || isSavedSearchesLoading}
              onSave={saveCurrentSearch}
              hasSavedToggle={savedSearches.length > 0 || isSearchWorkbenchOpen}
              isWorkbenchOpen={isSearchWorkbenchOpen}
              onToggleWorkbench={() => setShowSearchWorkbench((current) => !current)}
            />

            <DiscoverScopeTabs
              active={scope}
              counts={scopeCounts}
              showCounts={showScopeCounts}
              onChange={setScope}
            />

            {(scope === 'all' || scope === 'titles') ? (
              <DiscoverFilterBar
                activeTitleType={titleType}
                onTitleTypeChange={setTitleType}
                activeTag={tag}
                onToggleTag={toggleTag}
              />
            ) : null}

            <DiscoverQuickPicks
              recentSearches={visibleRecentSearches}
              onClearRecent={clearRecentSearches}
              onApplyPreset={applySearchPreset}
              chipRefs={helperChipRefs}
              onChipKeyDown={handleHelperChipKeyDown}
              recentOffset={recentSearchOffset}
              suggestedOffset={suggestedSearchOffset}
            />

            <DiscoverSavedSearches
              open={isSearchWorkbenchOpen}
              savedSearches={renderedSavedSearches}
              error={savedSearchesError}
              editingId={editingSavedSearchId}
              labelDraft={savedSearchLabelDraft}
              onLabelDraftChange={setSavedSearchLabelDraft}
              inputRef={savedSearchInputRef}
              chipRefs={helperChipRefs}
              savedOffset={savedSearchOffset}
              onApplyPreset={applySearchPreset}
              onChipKeyDown={handleHelperChipKeyDown}
              onStartRename={startSavedSearchRename}
              onSubmitRename={submitSavedSearchRename}
              onCancelRename={cancelSavedSearchRename}
              onTogglePin={handleSavedSearchPinToggle}
              onDelete={handleSavedSearchDelete}
              onClearAll={handleClearSavedSearches}
            />
          </div>
        </DiscoverHero>

        {isIdleDiscover ? (
          <DiscoverStarterLanes counts={laneCounts} onLaneClick={applySearchPreset} />
        ) : null}

        {hasDiscoverFilters ? (
          <DiscoverActiveFilters
            query={query}
            committedQuery={hasCommittedQuery}
            activeTag={tag}
            activeScope={scope}
            activeTitleType={titleType}
            isBroadQuery={searchIntent.isBroad}
            onClearTag={() => setTag('')}
            onClearScope={() => setScope('all')}
            onClearTitleType={() => setTitleType('all')}
          />
        ) : null}

        <section ref={browseSectionRef} className="dv2-results">
          <DiscoverResultsToolbar
            heading={currentHeading}
            subtitle={currentSubtitle}
            showTitleControls={scope === 'all' || scope === 'titles'}
            visibleCount={visibleTitleCount}
            totalCount={titleScopeCount}
            sortBy={sortBy}
            onSortChange={setSortBy}
            hideSeen={hideSeen}
            onHideSeenChange={setHideSeen}
          />

          {scope === 'all' && !noResultsEverywhere && !isIdleDiscover ? (
            <DiscoverResultsOverview counts={laneCounts} onScopeChange={setScope} />
          ) : null}

          <DiscoverResults
            scope={scope}
            query={query}
            locale={locale}
            titles={rankedTitles}
            titleTotal={titleScopeCount}
            posts={posts}
            profiles={profiles}
            tierlists={tierlists}
            loading={loading}
            error={error}
            noResultsEverywhere={noResultsEverywhere}
            crossLaneFallback={crossLaneFallback}
            emptyAction={emptyStateAction}
            onRetry={retry}
            onResultClick={analytics.trackResultClick}
            onScopeChange={setScope}
            pagination={scope === 'titles' ? {
              page,
              totalPages: titlesState.totalPages,
              onChange: handleBrowsePageChange,
            } : null}
          />
        </section>
      </div>
    </div>
  );
}

export default Discover;
