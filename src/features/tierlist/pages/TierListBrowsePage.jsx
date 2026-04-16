import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  TierListBrowseContent,
  TierListBrowseHeader,
  TierListBrowseSidebar,
  TierListBrowseTabs,
  TierListErrorPanel,
} from '@/features/tierlist/components';
import { BROWSE_ENTITY_LIST_LIMIT, BROWSE_PAGE_SIZE, ENTITY_TYPE_OPTIONS } from '@/features/tierlist/constants';
import { buildTierListFromTemplate, cleanupDuplicateTierLists, dedupeTierTemplatesByIdentity, findTierTemplate, loadTierLibrary, loadTierTemplates, saveTierTemplate, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getEntityTypeLabel, getTierCategoryLabel } from '@/features/tierlist/lib/tierlistLabels';
import { buildEntityMaps, createEmptyBrowseVisibility, getBrowseHydrationEntryKey, matchesListMetadataAgeGate, matchesTemplateMetadataAgeGate, matchesTierEntryAgeGate, mergeBrowseVisibilityState, mergeEntitiesByTypeAndId, resolveTierBrowseEntitiesForEntries, resolveTierBrowsePreviewEntitiesForEntries } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { buildRemixedTierList, getCurrentUsername, hasMeaningfulTierRanking, paginate, sortListsByRecentAndPopularity, sortTemplates } from '@/features/tierlist/lib/tierlistPageUtils';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import { supabase } from '@/shared/lib/supabase';
import '../styles/TierList.css';

export function TierListBrowsePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const browseHydrationEpochRef = useRef(0);
  const hydratedBrowseEntryKeysRef = useRef(new Set());
  const pendingBrowseEntryKeysRef = useRef(new Set());
  const failedBrowseEntryKeysRef = useRef(new Set());
  const hydrationRetryAttemptsRef = useRef(0);
  const isBrowseMountedRef = useRef(true);
  const [titles, setTitles] = useState([]);
  const [songEntities, setSongEntities] = useState([]);

  // Filter/search/page state persisted in URL so browser back restores it
  const query = searchParams.get('q') || '';
  const entityTypeFilter = searchParams.get('type') || 'all';
  const category = searchParams.get('cat') || 'all';
  const sortBy = searchParams.get('sort') || 'popular';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || value === 'all') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      if (!('page' in updates)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isCatalogHydrating, setIsCatalogHydrating] = useState(true);
  const [hydrationRetryKey, setHydrationRetryKey] = useState(0);
  const [browseVisibility, setBrowseVisibility] = useState(() => createEmptyBrowseVisibility());
  const [loadError, setLoadError] = useState('');
  const [ownerProfiles, setOwnerProfiles] = useState(() => new Map());

  useEffect(() => () => {
    isBrowseMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      browseHydrationEpochRef.current += 1;
      hydratedBrowseEntryKeysRef.current = new Set();
      pendingBrowseEntryKeysRef.current = new Set();
      failedBrowseEntryKeysRef.current = new Set();
      hydrationRetryAttemptsRef.current = 0;
      setIsLoading(true);
      setIsCatalogHydrating(true);
      setLoadError('');
      setTitles([]);
      setSongEntities([]);
      setOwnerProfiles(new Map());
      setBrowseVisibility(createEmptyBrowseVisibility());
      // Step 1: load library fast (no full catalog needed) and show content immediately
      const fastTemplatesPromise = loadTierTemplates([], {
        userId: user?.id || null,
        includeOwned: false,
        showAdult,
      });
      const libraryPromise = loadTierLibrary([], {
        userId: user?.id || null,
        includeOwned: false,
        fetchTemplates: false,
        publicListLimit: BROWSE_ENTITY_LIST_LIMIT,
        showAdult,
      });
      const fastTemplates = await fastTemplatesPromise;
      if (cancelled) return;
      setLibrary((current) => ({ ...current, templates: fastTemplates }));
      setIsLoading(false);

      const nextLibrary = await libraryPromise;
      if (cancelled) return;
      setLibrary((current) => ({
        ...nextLibrary,
        templates: current.templates,
      }));
      setIsCatalogHydrating(false);
    }
    load().catch((error) => {
      if (!cancelled) {
        setLoadError(error?.message || pick('โหลดหน้าเทียร์ลิสต์ไม่สำเร็จ', 'Failed to load tier lists'));
        setIsLoading(false);
        setIsCatalogHydrating(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult, user?.id, isAuthLoading]);

  const publicTemplates = useMemo(
    () => dedupeTierTemplatesByIdentity(
      library.templates
        .filter((template) => (
          template.isPublic &&
          matchesTemplateMetadataAgeGate(template, showAdult)
        ))
        .map((template) => {
          const profile = ownerProfiles.get(String(template?.ownerUserId || ''));
          if (!profile) {
            return template;
          }

          return {
            ...template,
            ownerName: profile.name || template.ownerName,
            ownerUsername: profile.username || template.ownerUsername,
            ownerAvatarUrl: profile.avatar_url || template.ownerAvatarUrl || '',
          };
        })
    ),
    [library.templates, ownerProfiles, showAdult]
  );
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return publicTemplates.filter((template) => {
      if (entityTypeFilter !== 'all' && normalizeCatalogEntityType(template.entityType) !== entityTypeFilter) return false;
      if (category !== 'all' && template.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = `${template.title} ${template.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, entityTypeFilter, publicTemplates, query]);

  const pagedTemplates = useMemo(() => {
    const sorted = sortTemplates(filteredTemplates, sortBy);
    return paginate(sorted, page, BROWSE_PAGE_SIZE);
  }, [filteredTemplates, page, sortBy]);

  const trendingTemplates = useMemo(
    () => sortTemplates(publicTemplates, 'popular').slice(0, 6),
    [publicTemplates]
  );
  const communityPreviewCandidates = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        matchesListMetadataAgeGate(list, showAdult)
      ))
    ).slice(0, 8),
    [library.lists, showAdult]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerProfiles() {
      const ownerIds = [...new Set(
        [
          ...communityPreviewCandidates.map((list) => list?.ownerUserId),
          ...library.templates.map((template) => template?.ownerUserId),
        ]
          .map((ownerId) => String(ownerId || '').trim())
          .filter(Boolean)
      )];

      if (!ownerIds.length) {
        setOwnerProfiles(new Map());
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, username, name, avatar_url')
          .in('id', ownerIds);

        if (error) throw error;
        if (cancelled) return;

        setOwnerProfiles(new Map(
          (data || []).map((profile) => [String(profile.id), profile])
        ));
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load tierlist owner profiles:', error?.message || error);
        }
      }
    }

    loadOwnerProfiles();
    return () => {
      cancelled = true;
    };
  }, [communityPreviewCandidates, library.templates]);
  const previewHydrationEntries = useMemo(() => {
    const seen = new Set();
    return [
      ...pagedTemplates.items,
      ...trendingTemplates,
      ...communityPreviewCandidates,
    ].filter((entry) => {
      const key = `${entry?.rows ? 'list' : 'template'}:${entry?.id || ''}`;
      if (!entry?.id || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [communityPreviewCandidates, pagedTemplates.items, trendingTemplates]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    async function hydrateBrowseEntities() {
      if (previewHydrationEntries.length === 0 && pendingBrowseEntryKeysRef.current.size === 0) {
        setIsCatalogHydrating(false);
        return;
      }

      const epoch = browseHydrationEpochRef.current;
      const entriesToHydrate = previewHydrationEntries.filter((entry) => {
        const key = getBrowseHydrationEntryKey(entry);
        return key
          && !hydratedBrowseEntryKeysRef.current.has(key)
          && !pendingBrowseEntryKeysRef.current.has(key)
          && !failedBrowseEntryKeysRef.current.has(key);
      });

      if (entriesToHydrate.length === 0) {
        if (pendingBrowseEntryKeysRef.current.size === 0) {
          setIsCatalogHydrating(false);
        }
        return;
      }

      const pendingKeys = entriesToHydrate
        .map((entry) => getBrowseHydrationEntryKey(entry))
        .filter(Boolean);

      pendingKeys.forEach((key) => pendingBrowseEntryKeysRef.current.add(key));
      setIsCatalogHydrating(true);

      let willRetry = false;
      try {
        const nonCharacterTemplateEntries = entriesToHydrate.filter((entry) => (
          !entry?.rows && normalizeCatalogEntityType(entry?.entityType) !== CHARACTER_ENTITY_TYPE
        ));
        const characterTemplateEntries = entriesToHydrate.filter((entry) => (
          !entry?.rows && normalizeCatalogEntityType(entry?.entityType) === CHARACTER_ENTITY_TYPE
        ));
        const communityListEntries = entriesToHydrate.filter((entry) => Boolean(entry?.rows));
        const batches = [
          { entries: nonCharacterTemplateEntries, resolver: resolveTierBrowsePreviewEntitiesForEntries, includeVisibility: false },
          { entries: characterTemplateEntries, resolver: resolveTierBrowsePreviewEntitiesForEntries, includeVisibility: false },
          { entries: communityListEntries, resolver: resolveTierBrowseEntitiesForEntries, includeVisibility: true },
        ];

        for (const batch of batches) {
          if (batch.entries.length === 0) {
            continue;
          }

          const batchKeys = batch.entries
            .map((entry) => getBrowseHydrationEntryKey(entry))
            .filter(Boolean);

          const result = await batch.resolver(batch.entries, { showAdult });
          if (!isBrowseMountedRef.current || browseHydrationEpochRef.current !== epoch) {
            return;
          }

          batchKeys.forEach((key) => {
            hydratedBrowseEntryKeysRef.current.add(key);
            pendingBrowseEntryKeysRef.current.delete(key);
          });

          setTitles((current) => mergeEntitiesByTypeAndId(current, result.titles));
          setSongEntities((current) => mergeEntitiesByTypeAndId(current, result.songEntities));

          if (batch.includeVisibility) {
            setBrowseVisibility((current) => mergeBrowseVisibilityState(current, result.visibility));
          }
        }
      } catch (error) {
        if (!isBrowseMountedRef.current || browseHydrationEpochRef.current !== epoch) {
          return;
        }
        console.warn('Failed to hydrate tierlist browse previews:', error?.message || error);
        const MAX_HYDRATION_RETRIES = 2;
        if (pendingBrowseEntryKeysRef.current.size > 0 && hydrationRetryAttemptsRef.current < MAX_HYDRATION_RETRIES) {
          hydrationRetryAttemptsRef.current += 1;
          willRetry = true;
          setHydrationRetryKey((n) => n + 1);
          return;
        }
        // Max retries reached — mark keys as permanently failed so we stop trying
        [...pendingBrowseEntryKeysRef.current].forEach((key) => {
          failedBrowseEntryKeysRef.current.add(key);
          pendingBrowseEntryKeysRef.current.delete(key);
        });
      } finally {
        if (!willRetry) {
          if (isBrowseMountedRef.current && browseHydrationEpochRef.current === epoch && pendingBrowseEntryKeysRef.current.size === 0) {
            setIsCatalogHydrating(false);
          }
        }
      }
    }

    hydrateBrowseEntities();
  }, [isLoading, previewHydrationEntries, showAdult, hydrationRetryKey]);

  const browseCustomItems = useMemo(
    () => [
      ...communityPreviewCandidates.flatMap((list) => list?.customItems || []),
      ...library.templates.flatMap((template) => template?.customItems || []),
    ],
    [communityPreviewCandidates, library.templates]
  );
  const entityMaps = useMemo(
    () => buildEntityMaps([...titles, ...songEntities], browseCustomItems),
    [browseCustomItems, songEntities, titles]
  );
  const publicLists = useMemo(
    () => {
      if (isCatalogHydrating) {
        return [];
      }

      return communityPreviewCandidates.filter((list) => (
        matchesTierEntryAgeGate(list, entityMaps, showAdult, browseVisibility)
      ));
    },
    [browseVisibility, communityPreviewCandidates, entityMaps, isCatalogHydrating, showAdult]
  );
  const recentCommunityLists = useMemo(
    () => sortListsByRecentAndPopularity(publicLists)
      .slice(0, 8)
      .map((list) => {
        const profile = ownerProfiles.get(String(list?.ownerUserId || ''));
        if (!profile) {
          return list;
        }

        return {
          ...list,
          ownerName: profile.name || list.ownerName,
          ownerUsername: profile.username || list.ownerUsername,
          ownerAvatarUrl: profile.avatar_url || list.ownerAvatarUrl || '',
        };
      }),
    [ownerProfiles, publicLists]
  );

  const handlePlayTemplate = async (template) => {
    try {
      const currentLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        includeOwned: true,
        showAdult,
      });
      const cleanupResult = await cleanupDuplicateTierLists(currentLibrary, {
        userId: user?.id || null,
      });
      const workingLibrary = cleanupResult.library;
      const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
      const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, workingLibrary, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
      const normalizedSavedTemplate = normalizeCatalogEntityType(savedTemplate?.entityType) === THEME_SONG_ENTITY_TYPE
        ? { ...savedTemplate, entityType: THEME_SONG_ENTITY_TYPE }
        : savedTemplate;
      const list = buildTierListFromTemplate(normalizedSavedTemplate);
      const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
      const ownerUsername = getCurrentUsername(user);
      const nextList = {
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      };
      setLibrary(libraryAfterTemplate);
      navigate(`/tierlist/play/${nextList.id}`, {
        state: {
          initialTierList: nextList,
          initialLibrary: libraryAfterTemplate,
        },
      });
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemixList = async (list) => {
    try {
      const ownerUsername = getCurrentUsername(user);
      const nextList = seedPoolFromCatalog({
        ...buildRemixedTierList(list, user),
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, [
        ...(list?.poolTitleIds || []),
        ...((list?.rows || []).flatMap((row) => row?.titleIds || [])),
      ]);
      navigate(`/tierlist/play/${nextList.id}`, {
        state: {
          initialTierList: nextList,
          initialLibrary: library,
        },
      });
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  const categoryOptions = ['all', ...new Set(
    publicTemplates
      .filter((template) => entityTypeFilter === 'all' || normalizeCatalogEntityType(template.entityType) === entityTypeFilter)
      .map((template) => template.category)
      .filter(Boolean)
  )];
  const hasActiveFilters = entityTypeFilter !== 'all' || category !== 'all' || query.trim().length > 0 || sortBy !== 'popular';
  const activeTabValue = category !== 'all' ? `cat:${category}` : entityTypeFilter;

  const handleBrowseTabSelect = (tabValue) => {
    const isEntityTab = tabValue === 'all' || ENTITY_TYPE_OPTIONS.some((option) => option.value === tabValue);
    if (isEntityTab) {
      updateParams({ type: tabValue, cat: null });
    } else if (tabValue.startsWith('cat:')) {
      updateParams({ cat: tabValue.replace('cat:', '') });
    }
  };

  const handleBrowseQueryChange = (nextQuery) => {
    updateParams({ q: nextQuery || null });
  };

  const handleBrowseSortChange = (nextSort) => {
    updateParams({ sort: nextSort === 'popular' ? null : nextSort });
  };

  const handleClearBrowseFilters = () => {
    updateParams({ type: null, cat: null, q: null, sort: null, page: null });
  };

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับหน้าแรก', 'Back home')}
            backTo="/"
          />
        </section>
      </div>
    );
  }

  const tabItems = [
    { value: 'all', label: pick('ทั้งหมด', 'All'), icon: <Layers size={14} /> },
    ...ENTITY_TYPE_OPTIONS.map((option) => ({ value: option.value, label: getEntityTypeLabel(option.value, pick), icon: null })),
    ...categoryOptions
      .filter((cat) => cat !== 'all')
      .map((cat) => ({ value: `cat:${cat}`, label: getTierCategoryLabel(cat, pick), icon: null })),
  ];

  return (
    <div className="tierlist-page">
      <TierListBrowseHeader
        pick={pick}
        userId={user?.id || null}
      />

      <TierListBrowseTabs
        activeTabValue={activeTabValue}
        onSelectTab={handleBrowseTabSelect}
        tabItems={tabItems}
      />

      <div className="container tierlist-browse-layout">
        <TierListBrowseContent
          entityMaps={entityMaps}
          filteredTemplatesCount={filteredTemplates.length}
          hasActiveFilters={hasActiveFilters}
          handlePlayTemplate={handlePlayTemplate}
          handleRemixList={handleRemixList}
          isCatalogHydrating={isCatalogHydrating}
          isLoading={isLoading}
          onClearFilters={handleClearBrowseFilters}
          onNextPage={() => updateParams({ page: Math.min(pagedTemplates.totalPages, page + 1) })}
          onPreviousPage={() => updateParams({ page: Math.max(1, page - 1) === 1 ? null : Math.max(1, page - 1) })}
          onQueryChange={handleBrowseQueryChange}
          onSortByChange={handleBrowseSortChange}
          pagedTemplates={pagedTemplates}
          pick={pick}
          query={query}
          recentCommunityLists={recentCommunityLists}
          sortBy={sortBy}
        />

        <TierListBrowseSidebar
          entityMaps={entityMaps}
          pick={pick}
          trendingTemplates={trendingTemplates}
        />
      </div>
    </div>
  );
}

export default TierListBrowsePage;
