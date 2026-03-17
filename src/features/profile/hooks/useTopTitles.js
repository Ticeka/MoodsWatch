import { useMemo } from 'react';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { TOP_TITLE_LIMIT, TOP_TITLE_TYPE_OPTIONS } from '@/features/profile/lib/profileStore';

function normalizeTypeId(typeId) {
  return TOP_TITLE_TYPE_OPTIONS.includes(typeId) ? typeId : null;
}

export function useTopTitles() {
  const { prefs, savePreferences } = useProfilePreferences();
  const topTitles = useMemo(() => prefs.topTitles || {}, [prefs.topTitles]);

  const topTitleMap = useMemo(
    () => new Map(TOP_TITLE_TYPE_OPTIONS.map((typeId) => [typeId, topTitles[typeId] || []])),
    [topTitles]
  );

  const persistTopTitles = async (nextTopTitles) => {
    const nextPrefs = {
      ...prefs,
      topTitles: nextTopTitles,
    };

    await savePreferences(nextPrefs);
    return nextTopTitles;
  };

  const addToTopTitles = async (title) => {
    const typeId = normalizeTypeId(title?.type);
    const titleId = Number(title?.id);

    if (!typeId || !titleId) {
      return { ok: false, reason: 'invalid' };
    }

    const currentIds = topTitleMap.get(typeId) || [];
    if (currentIds.includes(titleId)) {
      return { ok: true, action: 'exists', typeId };
    }

    if (currentIds.length >= TOP_TITLE_LIMIT) {
      return { ok: false, reason: 'limit', typeId };
    }

    await persistTopTitles({
      ...topTitles,
      [typeId]: [...currentIds, titleId],
    });

    return { ok: true, action: 'added', typeId };
  };

  const removeFromTopTitles = async (title) => {
    const typeId = normalizeTypeId(title?.type);
    const titleId = Number(title?.id);

    if (!typeId || !titleId) {
      return { ok: false, reason: 'invalid' };
    }

    const currentIds = topTitleMap.get(typeId) || [];
    if (!currentIds.includes(titleId)) {
      return { ok: true, action: 'missing', typeId };
    }

    await persistTopTitles({
      ...topTitles,
      [typeId]: currentIds.filter((id) => id !== titleId),
    });

    return { ok: true, action: 'removed', typeId };
  };

  return {
    topTitles,
    limit: TOP_TITLE_LIMIT,
    isInTopTitles: (title) => {
      const typeId = normalizeTypeId(title?.type);
      const titleId = Number(title?.id);
      return !!typeId && !!titleId && (topTitleMap.get(typeId) || []).includes(titleId);
    },
    getTopTitleType: (title) => normalizeTypeId(title?.type),
    getRank: (title) => {
      const typeId = normalizeTypeId(title?.type);
      const titleId = Number(title?.id);
      if (!typeId || !titleId) return null;
      const index = (topTitleMap.get(typeId) || []).indexOf(titleId);
      return index >= 0 ? index + 1 : null;
    },
    addToTopTitles,
    removeFromTopTitles,
  };
}
