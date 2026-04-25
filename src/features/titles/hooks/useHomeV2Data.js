import { useState, useEffect, useCallback } from 'react';
import { fetchPartyTemplates } from '@/features/party/api/partyTemplateApi';
import { fetchPublicBattleDecks } from '@/features/battle/api/battleRemoteApi';
import { fetchRemoteTemplates } from '@/features/tierlist/api/tierlistRemoteQueriesApi';
import { getTrendingTitles } from '@/features/discover/api/discoverTitleCatalogApi';
import { buildEntityMaps, getBestEntityMapForIds, resolveTierBrowsePreviewEntitiesForEntries } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { fetchPublishedHomepageBlocks } from '@/features/titles/api/homepageApi';
import { getTemplatePreviewArtworkSource } from '@/features/tierlist/lib/tierlistPreviewUtils';

const EMPTY = [];

function useFetch(fetcher, deps, label) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        // Surface the failure so empty-due-to-error is distinguishable from
        // empty-due-to-no-content in the UI and in the console.
        console.warn(`[HomeV2Data${label ? `:${label}` : ''}] fetch failed:`, err?.message || err);
        setError(err instanceof Error ? err : new Error(String(err?.message || err || 'fetch_failed')));
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const retry = useCallback(() => setReloadToken((t) => t + 1), []);
  return { data, loading, error, retry };
}

// `showAdult` is intentionally unused: fetchPartyTemplates does not filter by
// age-gate, so refetching on toggle would just burn bandwidth (plus a fan-out
// of cover-fallback and creator-profile queries).
export function usePartySection() {
  const { data, loading, error, retry } = useFetch(
    () => fetchPartyTemplates({ tab: 'all', page: 1, pageSize: 12 }).then(r => r?.templates || EMPTY),
    [],
    'party',
  );
  return { partyTemplates: data || EMPTY, loading, error, retry };
}

export function useBattleSection() {
  const { data, loading, error, retry } = useFetch(
    () => fetchPublicBattleDecks({ limit: 12 }),
    [],
    'battle',
  );
  return { battleDecks: data || EMPTY, loading, error, retry };
}

export function useTierlistSection(showAdult) {
  const { data, loading, error, retry } = useFetch(
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
    'tierlist',
  );
  return { tierlistTemplates: data || EMPTY, loading, error, retry };
}

export function useTrendingSection(showAdult) {
  const { data, loading, error, retry } = useFetch(
    () => getTrendingTitles(10, { showAdult }),
    [showAdult],
    'trending',
  );
  return { trendingTitles: data || EMPTY, loading, error, retry };
}

export function useHeroBlock() {
  const { data, loading, error } = useFetch(
    () => fetchPublishedHomepageBlocks().then(blocks =>
      (blocks || []).find(b => b.blockType === 'hero') || null
    ),
    [],
    'hero',
  );
  return { heroBlock: data, loading, error };
}
