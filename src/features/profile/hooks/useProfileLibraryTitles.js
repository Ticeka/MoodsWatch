import { useEffect, useMemo, useState } from 'react';
import { getTitlesByIds } from '@/features/discover/lib/recommend';

export function useProfileLibraryTitles(lookupIds, t) {
  const [libraryTitles, setLibraryTitles] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const lookupIdsKey = useMemo(() => lookupIds.join(','), [lookupIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadTitles() {
      const requestedIds = lookupIdsKey
        ? lookupIdsKey.split(',').map((value) => Number(value)).filter(Boolean)
        : [];

      if (!requestedIds.length) {
        setLibraryTitles([]);
        setLibraryError('');
        return;
      }

      setIsLibraryLoading(true);
      setLibraryError('');

      try {
        const titles = await getTitlesByIds(requestedIds);
        if (!cancelled) {
          setLibraryTitles(titles);
        }
      } catch (error) {
        if (!cancelled) {
          setLibraryError(error.message || t('profile.loadingLibraryFailed'));
        }
      } finally {
        if (!cancelled) {
          setIsLibraryLoading(false);
        }
      }
    }

    loadTitles();
    return () => {
      cancelled = true;
    };
  }, [lookupIdsKey, t]);

  return {
    libraryTitles,
    isLibraryLoading,
    libraryError,
  };
}
