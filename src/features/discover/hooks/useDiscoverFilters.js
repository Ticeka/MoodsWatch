import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

const INITIAL_FILTERS = {
  scope: 'all',
  titleType: 'all',
  tag: '',
  page: 1,
  sortBy: 'popularity',
};

export function useDiscoverFilters() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const suppressUrlSyncRef = useRef(false);
  const lastGlobalSearchRef = useRef(0);

  const syncQueryToUrl = useCallback((nextQuery) => {
    suppressUrlSyncRef.current = true;
    const nextParams = new URLSearchParams(searchParams);
    if (nextQuery) nextParams.set('q', nextQuery);
    else nextParams.delete('q');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateQuery = useCallback((nextQuery, { resetPage = true, syncUrl = true } = {}) => {
    setQuery(nextQuery);
    if (resetPage) setFilters((prev) => ({ ...prev, page: 1 }));
    if (syncUrl) syncQueryToUrl(nextQuery);
  }, [syncQueryToUrl]);

  const setScope = useCallback((scope) => {
    setFilters((prev) => ({ ...prev, scope, page: 1 }));
  }, []);

  const setTitleType = useCallback((titleType) => {
    setFilters((prev) => ({ ...prev, titleType, page: 1 }));
  }, []);

  const setTag = useCallback((tag) => {
    setFilters((prev) => ({ ...prev, tag, page: 1 }));
  }, []);

  const toggleTag = useCallback((tag) => {
    setFilters((prev) => ({ ...prev, tag: prev.tag === tag ? '' : tag, page: 1 }));
  }, []);

  const setPage = useCallback((page) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const setSortBy = useCallback((sortBy) => {
    setFilters((prev) => ({ ...prev, sortBy, page: 1 }));
  }, []);

  const applyPreset = useCallback((preset) => {
    setFilters({
      scope: preset.scope || 'all',
      titleType: preset.titleType || 'all',
      tag: preset.tag || '',
      page: 1,
      sortBy: INITIAL_FILTERS.sortBy,
    });
    updateQuery(preset.query || '');
  }, [updateQuery]);

  const resetAll = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    updateQuery('');
  }, [updateQuery]);

  useEffect(() => {
    if (suppressUrlSyncRef.current) {
      suppressUrlSyncRef.current = false;
      return;
    }
    const nextUrlQuery = new URLSearchParams(location.search).get('q') || '';
    setQuery(nextUrlQuery);
    setFilters((prev) => ({ ...prev, scope: 'all', titleType: 'all', tag: '', page: 1 }));
  }, [location.search]);

  useEffect(() => {
    const globalSearch = location.state?.globalSearch;
    if (!globalSearch?.submittedAt || lastGlobalSearchRef.current === globalSearch.submittedAt) {
      return;
    }
    lastGlobalSearchRef.current = globalSearch.submittedAt;
    updateQuery(globalSearch.query || '', { syncUrl: false });
    setFilters((prev) => ({ ...prev, scope: 'all', titleType: 'all', tag: '', page: 1 }));
  }, [location.state, updateQuery]);

  return {
    query,
    setQuery,
    updateQuery,
    ...filters,
    setScope,
    setTitleType,
    setTag,
    toggleTag,
    setPage,
    setSortBy,
    applyPreset,
    resetAll,
  };
}
