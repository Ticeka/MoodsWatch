import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTitlesByIds } from '@/features/discover/lib/recommend';

export function useProfileLibraryTitles(lookupIds, t) {
  const lookupIdsKey = useMemo(() => lookupIds.join(','), [lookupIds]);
  const requestedIds = useMemo(
    () => lookupIdsKey ? lookupIdsKey.split(',').map((v) => Number(v)).filter(Boolean) : [],
    [lookupIdsKey]
  );

  const { data: libraryTitles = [], isFetching: isLibraryLoading, error } = useQuery({
    queryKey: ['profile-library-titles', lookupIdsKey],
    queryFn: () => getTitlesByIds(requestedIds),
    enabled: requestedIds.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  return {
    libraryTitles,
    isLibraryLoading,
    libraryError: error ? (error.message || t('profile.loadingLibraryFailed')) : '',
  };
}
