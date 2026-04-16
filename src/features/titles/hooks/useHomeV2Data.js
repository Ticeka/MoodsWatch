import { useState, useEffect } from 'react';
import { fetchPartyTemplates } from '@/features/party/api/partyTemplateApi';
import { fetchPublicBattleDecks } from '@/features/battle/api/battleRemoteApi';
import { fetchRemoteTemplates } from '@/features/tierlist/api/tierlistRemoteQueriesApi';
import { getTrendingTitles, getTitlesByIds } from '@/features/discover/api/discoverTitleCatalogApi';
import { fetchPublishedHomepageBlocks } from '@/features/titles/api/homepageApi';

const EMPTY = [];

function useFetch(fetcher, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetcher().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}

export function usePartySection(showAdult) {
  const { data, loading } = useFetch(
    () => fetchPartyTemplates({ tab: 'all', page: 1, pageSize: 12 }).then(r => r?.templates || EMPTY),
    [showAdult],
  );
  return { partyTemplates: data || EMPTY, loading };
}

export function useBattleSection() {
  const { data, loading } = useFetch(
    () => fetchPublicBattleDecks({ limit: 12 }),
    [],
  );
  return { battleDecks: data || EMPTY, loading };
}

export function useTierlistSection(showAdult) {
  const { data, loading } = useFetch(
    () => fetchRemoteTemplates(null, { includePublic: true, publicLimit: 12, showAdult })
      .then(async (templates) => {
        if (!templates?.length) return EMPTY;

        // collect first titleId for templates that have no previewArtworkUrl
        const needsCover = templates.filter(t =>
          !t.manualPreviewArtworkUrl && !t.previewArtworkUrl && t.titleIds?.length > 0
        );

        if (needsCover.length === 0) return templates;

        const firstIds = [...new Set(needsCover.map(t => t.titleIds[0]).filter(Boolean))];
        const fetched = await getTitlesByIds(firstIds).catch(() => []);
        const coverMap = Object.fromEntries((fetched || []).map(t => [t.id, t.cover]));

        return templates.map(t => {
          if (t.manualPreviewArtworkUrl || t.previewArtworkUrl) return t;
          const firstId = t.titleIds?.[0];
          return { ...t, previewArtworkUrl: coverMap[firstId] || '' };
        });
      }),
    [showAdult],
  );
  return { tierlistTemplates: data || EMPTY, loading };
}

export function useTrendingSection(showAdult) {
  const { data, loading } = useFetch(
    () => getTrendingTitles(10, { showAdult }),
    [showAdult],
  );
  return { trendingTitles: data || EMPTY, loading };
}

export function useHeroBlock() {
  const { data, loading } = useFetch(
    () => fetchPublishedHomepageBlocks().then(blocks =>
      (blocks || []).find(b => b.blockType === 'hero') || null
    ),
    [],
  );
  return { heroBlock: data, loading };
}
