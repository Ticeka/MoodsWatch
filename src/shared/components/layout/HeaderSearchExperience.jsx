import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useSearchAutocomplete } from '@/features/discover/hooks/useSearchAutocomplete';
import { recordAutocompleteSelection } from '@/features/discover/lib/autocompleteFeedback';
import { trackDiscoverEvent } from '@/features/discover/api/discoverAnalyticsApi';
import { readRecentSearches, removeRecentSearch, writeRecentSearches } from '@/features/discover/lib/discoverSearchState';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';
import { useLanguage } from '@/shared/contexts/LanguageContext';

function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());

  const refreshRecentSearches = useCallback(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  const rememberRecentSearch = useCallback((term) => {
    const normalizedTerm = String(term || '').trim();
    if (normalizedTerm.length < 2) {
      return;
    }

    setRecentSearches((current) => writeRecentSearches([
      normalizedTerm,
      ...current.filter((entry) => entry.toLowerCase() !== normalizedTerm.toLowerCase()),
    ]));
  }, []);

  const handleRemoveRecentSearch = useCallback((term) => {
    setRecentSearches(removeRecentSearch(term));
  }, []);

  useEffect(() => {
    const handleRecentSearchSync = () => {
      refreshRecentSearches();
    };

    window.addEventListener('focus', handleRecentSearchSync);
    window.addEventListener('storage', handleRecentSearchSync);

    return () => {
      window.removeEventListener('focus', handleRecentSearchSync);
      window.removeEventListener('storage', handleRecentSearchSync);
    };
  }, [refreshRecentSearches]);

  return {
    recentSearches,
    refreshRecentSearches,
    rememberRecentSearch,
    handleRemoveRecentSearch,
  };
}

function HeaderSearchField({
  surface = 'header',
  query,
  setQuery,
  enabled = true,
  onEnable,
  onCloseMobileMenu,
  isDiscoverActive = false,
  userId = null,
  showAdult = false,
}) {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(() => Boolean(isDiscoverActive && query.trim()));
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const formRef = useRef(null);
  const {
    recentSearches,
    refreshRecentSearches,
    rememberRecentSearch,
    handleRemoveRecentSearch,
  } = useRecentSearches();
  const {
    groups: autocompleteGroups,
    flatItems: autocompleteItems,
    isLoading: isAutocompleteLoading,
    hasQuery: hasAutocompleteQuery,
    crossLaneNote: autocompleteCrossLaneNote,
  } = useSearchAutocomplete(query, {
    enabled: enabled && isOpen,
    userId,
    recentSearches,
    surface: 'header',
    showAdult,
  });

  const closeAutocomplete = useCallback((reason = 'dismiss') => {
    const trimmedQuery = query.trim();

    if (reason === 'dismiss' && trimmedQuery.length >= 2) {
      void trackDiscoverEvent({
        eventType: 'search_abandon',
        userId,
        query: trimmedQuery,
        metadata: {
          surface,
          query_length: trimmedQuery.length,
        },
      });
    }

    setIsOpen(false);
    setHighlightedSuggestionIndex(-1);
  }, [query, surface, userId]);

  const performGlobalSearch = useCallback((nextQuery = query.trim()) => {
    const normalizedQuery = String(nextQuery || '').trim();
    const nextParams = new URLSearchParams();

    if (normalizedQuery) {
      nextParams.set('q', normalizedQuery);
      rememberRecentSearch(normalizedQuery);
      void trackDiscoverEvent({
        eventType: 'search_submit',
        userId,
        query: normalizedQuery,
        metadata: {
          surface,
          query_length: normalizedQuery.length,
        },
      });
    }

    navigate(
      {
        pathname: '/discover',
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      {
        state: {
          globalSearch: {
            query: normalizedQuery,
            submittedAt: Date.now(),
          },
        },
      }
    );

    closeAutocomplete('submit');
    onCloseMobileMenu?.();
  }, [closeAutocomplete, navigate, onCloseMobileMenu, query, rememberRecentSearch, surface, userId]);

  const submitGlobalSearch = useCallback((event) => {
    event.preventDefault();
    performGlobalSearch();
  }, [performGlobalSearch]);

  const clearGlobalSearch = useCallback(() => {
    setQuery('');
    closeAutocomplete('submit');

    if (isDiscoverActive) {
      performGlobalSearch('');
    }
  }, [closeAutocomplete, isDiscoverActive, performGlobalSearch, setQuery]);

  const handleSuggestionSelect = useCallback((item = null) => {
    const nextRecentTerm = item?.searchTerm || query.trim();

    if (nextRecentTerm) {
      rememberRecentSearch(nextRecentTerm);
    }

    if (item?.id) {
      recordAutocompleteSelection({ query, itemId: item.id });
      void trackDiscoverEvent({
        eventType: 'autocomplete_select',
        userId,
        query,
        scope: 'all',
        resultType: item.groupId || item.kind || 'unknown',
        resultId: item.entityId || item.id,
        metadata: {
          surface,
          href: item.href || null,
          isRecent: item.groupId === 'recent',
          selected_group: item.groupId || item.kind || null,
          query_length: query.trim().length,
        },
      });
    }

    closeAutocomplete('select');
    onCloseMobileMenu?.();
  }, [closeAutocomplete, onCloseMobileMenu, query, rememberRecentSearch, surface, userId]);

  const handleGlobalSearchKeyDown = useCallback((event) => {
    const hasSuggestions = autocompleteItems.length > 0;

    if (event.key === 'Escape') {
      closeAutocomplete();
      return;
    }

    if (event.key === 'Tab' && hasSuggestions) {
      event.preventDefault();
      setIsOpen(true);
      if (event.shiftKey) {
        setHighlightedSuggestionIndex((current) => (current <= 0 ? autocompleteItems.length - 1 : current - 1));
      } else {
        setHighlightedSuggestionIndex((current) => (current + 1) % autocompleteItems.length);
      }
      return;
    }

    if (!hasSuggestions) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedSuggestionIndex((current) => (current + 1) % autocompleteItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedSuggestionIndex((current) => (current <= 0 ? autocompleteItems.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedSuggestionIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedSuggestionIndex(autocompleteItems.length - 1);
      return;
    }

    if (event.key === 'Enter' && highlightedSuggestionIndex >= 0) {
      event.preventDefault();
      const selectedItem = autocompleteItems[highlightedSuggestionIndex];

      if (selectedItem?.href) {
        navigate(
          selectedItem.href,
          selectedItem.navigateState ? { state: selectedItem.navigateState } : undefined,
        );
        handleSuggestionSelect(selectedItem);
      }
    }
  }, [autocompleteItems, closeAutocomplete, handleSuggestionSelect, highlightedSuggestionIndex, navigate]);

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      setHighlightedSuggestionIndex(-1);
    }
  }, [enabled]);

  useEffect(() => {
    setHighlightedSuggestionIndex(-1);
  }, [query, isOpen]);

  useEffect(() => {
    const nextSearch = location.pathname === '/discover'
      ? new URLSearchParams(location.search).get('q') || ''
      : '';
    setQuery(nextSearch);
  }, [location.pathname, location.search, setQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (formRef.current && !formRef.current.contains(event.target)) {
        closeAutocomplete();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeAutocomplete]);

  if (surface === 'drawer') {
    return (
      <div ref={formRef} className="drawer-search-wrap">
        <form className="drawer-search" onSubmit={submitGlobalSearch} role="search" aria-label={t('discover.searchInputLabel')}>
          <Search size={16} className="drawer-search-icon" aria-hidden="true" />
          <label htmlFor="drawer-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
          <input
            id="drawer-global-search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="drawer-search-listbox"
            aria-expanded={isOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading) ? true : false}
            aria-activedescendant={highlightedSuggestionIndex >= 0 ? (autocompleteItems[highlightedSuggestionIndex]?.id || undefined) : undefined}
            className="drawer-search-input"
            value={query}
            onChange={(event) => {
              onEnable?.();
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              onEnable?.();
              refreshRecentSearches();
              setIsOpen(true);
            }}
            onKeyDown={handleGlobalSearchKeyDown}
            placeholder={t('discover.searchPlaceholder')}
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="drawer-search-clear"
              onClick={clearGlobalSearch}
              aria-label={t('discover.clearSearch')}
              title={t('discover.clearSearch')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
          <button type="submit" className="drawer-search-submit">
            {t('discover.searchLabel')}
          </button>
        </form>
        <SearchAutocomplete
          groups={autocompleteGroups}
          flatItems={autocompleteItems}
          isLoading={isAutocompleteLoading}
          isOpen={isOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading)}
          highlightedIndex={highlightedSuggestionIndex}
          query={query}
          variant="drawer"
          listboxId="drawer-search-listbox"
          t={t}
          crossLaneNote={autocompleteCrossLaneNote}
          onSelect={handleSuggestionSelect}
          onSearchAll={() => performGlobalSearch()}
          onRemoveRecent={handleRemoveRecentSearch}
        />
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className={`header-search ${isDiscoverActive ? 'is-active' : ''}`}
      onSubmit={submitGlobalSearch}
      role="search"
      aria-label={t('discover.searchInputLabel')}
    >
      <label htmlFor="header-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
      <input
        id="header-global-search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="header-search-listbox"
        aria-expanded={isOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading) ? true : false}
        aria-activedescendant={highlightedSuggestionIndex >= 0 ? (autocompleteItems[highlightedSuggestionIndex]?.id || undefined) : undefined}
        value={query}
        onChange={(event) => {
          onEnable?.();
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          onEnable?.();
          refreshRecentSearches();
          setIsOpen(true);
        }}
        onKeyDown={handleGlobalSearchKeyDown}
        className="header-search-input"
        placeholder={t('discover.searchPlaceholder')}
        autoComplete="off"
      />
      <Search size={16} className="header-search-icon" aria-hidden="true" />
      {query ? (
        <button
          type="button"
          className="header-search-clear"
          onClick={clearGlobalSearch}
          aria-label={t('discover.clearSearch')}
          title={t('discover.clearSearch')}
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
      <button type="submit" className="header-search-submit" aria-label={t('discover.searchLabel')} title={t('discover.searchLabel')}>
        <Search size={17} aria-hidden="true" />
      </button>
      <SearchAutocomplete
        groups={autocompleteGroups}
        flatItems={autocompleteItems}
        isLoading={isAutocompleteLoading}
        isOpen={isOpen && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading)}
        highlightedIndex={highlightedSuggestionIndex}
        query={query}
        variant="header"
        listboxId="header-search-listbox"
        t={t}
        crossLaneNote={autocompleteCrossLaneNote}
        onSelect={handleSuggestionSelect}
        onSearchAll={() => performGlobalSearch()}
        onRemoveRecent={handleRemoveRecentSearch}
      />
    </form>
  );
}

export function HeaderSearchExperience(props) {
  return <HeaderSearchField {...props} />;
}

export default HeaderSearchExperience;
