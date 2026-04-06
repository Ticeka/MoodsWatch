import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { buildContinueCards } from '@/features/titles/lib/homePresentation';

export function useHomeContinueWatching({
  watchlist,
  hiddenFromDiscoveryIds,
  showAdult,
  advanceProgress,
  updateItem,
  setConsumptionTarget,
  catchUpToTarget,
  t,
}) {
  const [continueTitles, setContinueTitles] = useState([]);

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

  const continueCards = useMemo(
    () => buildContinueCards(continueTitles),
    [continueTitles]
  );

  const handleContinueAdvance = useCallback(async (title) => {
    try {
      await advanceProgress(title, 1);
      toast.success(t('home.updatedProgress', { unit: title._continueUnitLabel, value: title._continueNextUnit }));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedUpdateProgress'));
    }
  }, [advanceProgress, t]);

  const handleContinueComplete = useCallback(async (title) => {
    try {
      await updateItem(title.id, { status: 'completed' }, { title });
      toast.success(t('home.markedCompleted'));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedUpdateStatus'));
    }
  }, [t, updateItem]);

  const handleSetNextTarget = useCallback(async (title) => {
    try {
      await setConsumptionTarget(title, title._continueNextUnit);
      toast.success(t('home.setTargetSuccess', { unit: title._continueUnitLabel, value: title._continueNextUnit }));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedSetTarget'));
    }
  }, [setConsumptionTarget, t]);

  const handleCatchUpTarget = useCallback(async (title) => {
    try {
      await catchUpToTarget(title);
      toast.success(t('home.caughtUp'));
    } catch (error) {
      console.error(error);
      toast.error(t('home.failedCatchUp'));
    }
  }, [catchUpToTarget, t]);

  return {
    continueCards,
    handleContinueAdvance,
    handleContinueComplete,
    handleSetNextTarget,
    handleCatchUpTarget,
  };
}
