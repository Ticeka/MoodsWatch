import { useState, useEffect } from 'react';
import { fetchPartyTemplates } from '@/features/party/api/partyTemplateApi';
import { fetchPublicBattleDecks } from '@/features/battle/api/battleRemoteApi';
import { fetchRemoteTemplates } from '@/features/tierlist/api/tierlistRemoteQueriesApi';
import { getTrendingTitles } from '@/features/discover/api/discoverTitleCatalogApi';
import { buildEntityMaps, getBestEntityMapForIds, resolveTierBrowsePreviewEntitiesForEntries } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { fetchPublishedHomepageBlocks } from '@/features/titles/api/homepageApi';
import { getTemplatePreviewArtworkSource } from '@/features/tierlist/lib/tierlistPreviewUtils';

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

        const { titles, songEntities } = await resolveTierBrowsePreviewEntitiesForEntries(templates).catch(() => ({
          titles: [],
          songEntities: [],
        }));

        return templates.map((template) => {
          if (template?.manualPreviewArtworkUrl) {
            return template;
          }

          const entityMaps = buildEntityMaps(
            [...(titles || []), ...(songEntities || [])],
            template?.customItems || [],
            template?.entityType
          );
          const entityById = getBestEntityMapForIds(entityMaps, template?.titleIds || [], template?.entityType);
          const fallbackEntity = (template?.titleIds || [])
            .map((id) => entityById.get(Number(id)))
            .find(Boolean) || null;
          const fallbackPreview = getTemplatePreviewArtworkSource({
            ...template,
            previewArtworkUrl: '',
          }, fallbackEntity) || '';

          return {
            ...template,
            previewArtworkUrl: fallbackPreview,
          };
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
