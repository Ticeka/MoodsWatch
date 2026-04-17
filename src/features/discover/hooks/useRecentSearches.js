import { useCallback, useEffect, useState } from 'react';
import {
  MAX_RECENT_SEARCHES,
  clearRecentSearches as clearRecentSearchesStorage,
  readRecentSearches,
  writeRecentSearches,
} from '../lib/discoverSearchState';

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState([]);

  const refresh = useCallback(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const remember = useCallback((term) => {
    const normalized = String(term || '').trim();
    if (normalized.length < 2) return;

    setRecentSearches((current) => {
      const next = [
        normalized,
        ...current.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecentSearches([]);
    clearRecentSearchesStorage();
  }, []);

  return { recentSearches, remember, clear, refresh };
}
