import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Compass, Layers, Loader2, Monitor, Music, Plus, Search } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { TierListCommunityCard, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { BROWSE_ENTITY_IDS_PER_TEMPLATE, BROWSE_ENTITY_LIST_LIMIT, BROWSE_PAGE_SIZE, ENTITY_TYPE_OPTIONS } from '@/features/tierlist/constants';
import { buildTierListFromTemplate, cleanupDuplicateTierLists, dedupeTierTemplatesByIdentity, findTierTemplate, loadTierLibrary, loadTierTemplates, saveTierTemplate, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getEntityTypeLabel, getTemplateExplorerSummary, getTierCategoryLabel } from '@/features/tierlist/lib/tierlistLabels';
import { buildEntityMaps, createEmptyBrowseVisibility, getBestEntityMapForIds, getBrowseHydrationEntryKey, getEntityMap, matchesListMetadataAgeGate, matchesTemplateMetadataAgeGate, matchesTierEntryAgeGate, mergeBrowseVisibilityState, mergeEntitiesByTypeAndId, resolveTierBrowseEntitiesForEntries, resolveTierBrowsePreviewEntitiesForEntries } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { buildRemixedTierList, getCurrentUsername, hasMeaningfulTierRanking, paginate, sortListsByRecentAndPopularity, sortTemplates } from '@/features/tierlist/lib/tierlistPageUtils';
import { getTemplatePreviewArtworkSource, getTemplatePreviewMediaStyle, normalizeTemplatePreviewFit } from '@/features/tierlist/lib/tierlistPreviewUtils';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import './TierList.css';

export function TierListBrowsePage() {
  const navigate = useNavigate();
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
  const [query, setQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [page, setPage] = useState(1);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isCatalogHydrating, setIsCatalogHydrating] = useState(true);
  const [hydrationRetryKey, setHydrationRetryKey] = useState(0);
  const [browseVisibility, setBrowseVisibility] = useState(() => createEmptyBrowseVisibility());
  const [loadError, setLoadError] = useState('');

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
        setLoadError(error?.message || pick('โหลดหน้า Tier List ไม่สำเร็จ', 'Failed to load tier lists'));
        setIsLoading(false);
        setIsCatalogHydrating(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult, user?.id, isAuthLoading]);

  const publicTemplates = useMemo(
    () => dedupeTierTemplatesByIdentity(library.templates.filter((template) => (
      template.isPublic &&
      matchesTemplateMetadataAgeGate(template, showAdult)
    ))),
    [library.templates, showAdult]
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
    () => sortListsByRecentAndPopularity(publicLists).slice(0, 8),
    [publicLists]
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
      <div className="container tierlist-browse-title-row">
        <div className="tierlist-browse-title-row-left">
          <h1>{pick('ศูนย์รวม Tier List', 'Tier List Explorer')}</h1>
        </div>
        <div className="tierlist-browse-title-row-actions">
          {user?.id ? (
            <Link className="tierlist-browse-manage-btn" to="/tierlist/me">
              <Monitor size={14} /> {pick('จัดการของฉัน', 'Manage Mine')}
            </Link>
          ) : null}
          <Link className="tierlist-browse-create-btn" to="/tierlist/create">
            <Plus size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}
          </Link>
        </div>
      </div>

      <nav className="container tierlist-browse-tabs">
        {tabItems.map((tab) => {
          const isEntityTab = tab.value === 'all' || ENTITY_TYPE_OPTIONS.some((o) => o.value === tab.value);
          const isCatTab = tab.value.startsWith('cat:');
          const isActive = isEntityTab
            ? (entityTypeFilter === tab.value && category === 'all')
            : (isCatTab && category === tab.value.replace('cat:', ''));

          return (
            <button
              key={tab.value}
              type="button"
              className={`tierlist-browse-tab${isActive ? ' is-active' : ''}`}
              onClick={() => {
                if (isEntityTab) {
                  setEntityTypeFilter(tab.value);
                  setCategory('all');
                } else if (isCatTab) {
                  setCategory(tab.value.replace('cat:', ''));
                }
                setPage(1);
              }}
            >
              {tab.icon}{tab.label}
            </button>
          );
        })}
      </nav>

      <div className="container tierlist-browse-layout">
        <div className="tierlist-browse-main">
          <div className="tierlist-browse-search-bar" role="group" aria-label={pick('ควบคุมการค้นหาเทมเพลต', 'Template search controls')}>
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder={pick('ค้นหา tier lists...', 'Search tier lists...')}
              aria-label={pick('ค้นหาเทมเพลต', 'Search templates')}
            />
            <button type="button" className="tierlist-browse-search-icon" aria-hidden="true">
              <Search size={16} />
            </button>
          </div>

          <div className="tierlist-browse-sort-row">
            {!isLoading && (
              <span className="tierlist-browse-result-count">{filteredTemplates.length} {pick('เทมเพลต', 'templates')}</span>
            )}
            <SortSelect
              value={sortBy}
              onChange={(value) => { setSortBy(value); setPage(1); }}
              label={pick('เรียงลำดับ', 'Sort')}
              className="tierlist-browse-sorter"
            >
              <option value="popular">{pick('ยอดนิยม', 'Popular')}</option>
              <option value="newest">{pick('ใหม่ล่าสุด', 'Newest')}</option>
              <option value="alphabet">{pick('ก-ฮ', 'A-Z')}</option>
            </SortSelect>
          </div>

          <section className="tierlist-browse-content">
            {isLoading ? (
              <TierListEmptyPanel
                icon={<Loader2 size={28} className="animate-spin" />}
                title={pick('กำลังโหลดเทมเพลต', 'Loading templates')}
                message={pick('กำลังเตรียมเทมเพลตและอันดับล่าสุดจากชุมชน', 'Fetching templates and recent community rankings.')}
              />
            ) : pagedTemplates.items.length === 0 ? (
              <TierListEmptyPanel
                icon={<Compass size={28} />}
                title={pick('ยังไม่พบเทมเพลตที่ตรง', 'No matching templates')}
                message={
                  hasActiveFilters
                    ? pick('ลองล้างคำค้นหา เปลี่ยนหมวดหมู่ หรือสลับการเรียงลำดับ', 'Try clearing your search, switching categories, or changing the sort order.')
                    : pick('ยังไม่มีเทมเพลตสาธารณะในตอนนี้', 'There are no public templates yet.')
                }
                action={hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEntityTypeFilter('all');
                      setCategory('all');
                      setQuery('');
                      setSortBy('popular');
                      setPage(1);
                    }}
                  >
                    {pick('ล้างตัวกรอง', 'Clear filters')}
                  </Button>
                ) : null}
              />
            ) : (
              <div className="tierlist-browse-grid">
                {pagedTemplates.items.map((template, index) => {
                  const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
                  const cover = template.titleIds
                    .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
                    .map((id) => entityById.get(Number(id)))
                    .filter(Boolean);
                  const coverArtwork = getTemplatePreviewArtworkSource(template, cover[0]);
                  const explorerSummary = getTemplateExplorerSummary(template, pick);

                  return (
                    <article key={template.id} className="tierlist-explorer-card">
                      <div
                        className={`tierlist-explorer-card-cover${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                        style={getTemplatePreviewMediaStyle(template)}
                      >
                        {coverArtwork
                          ? (
                            <img
                              src={coverArtwork}
                              alt={template.title}
                              draggable={false}
                              loading={index < 3 ? 'eager' : 'lazy'}
                              decoding="async"
                              fetchPriority={index < 3 ? 'high' : 'auto'}
                            />
                          )
                          : isCatalogHydrating
                            ? <div className="tierlist-explorer-card-cover-loading" />
                            : <div className="tierlist-explorer-card-cover-empty" />}
                        <span className="tierlist-explorer-card-count">
                          {template.titleIds.length} {pick('เรื่อง', 'titles')}
                        </span>
                      </div>
                      <div className="tierlist-explorer-card-body">
                        <div className="tierlist-explorer-card-meta">
                          <span className="tierlist-explorer-card-tag">{explorerSummary.categoryLabel}</span>
                          <span className="tierlist-explorer-card-stat">{explorerSummary.statLine}</span>
                        </div>
                        <h3>{template.title}</h3>
                        <p className="tierlist-explorer-card-description">{explorerSummary.playsLabel}</p>
                        <div className="tierlist-explorer-card-actions">
                          <Button size="sm" variant="primary" className="tierlist-explorer-btn-rank" onClick={() => handlePlayTemplate(template)}>
                            {pick('จัดอันดับ', 'Rank')}
                          </Button>
                          <Link className="tierlist-explorer-btn-view" to={`/tierlist/template/${template.id}`}>
                            {pick('ดู', 'View')}
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {pagedTemplates.totalPages > 1 && (
              <div className="tierlist-pagination">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ChevronLeft size={14} />}
                  disabled={pagedTemplates.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  {pick('ก่อนหน้า', 'Previous')}
                </Button>
                <span>{pagedTemplates.page} / {pagedTemplates.totalPages}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconRight={<ChevronRight size={14} />}
                  disabled={pagedTemplates.page >= pagedTemplates.totalPages}
                  onClick={() => setPage((current) => Math.min(pagedTemplates.totalPages, current + 1))}
                >
                  {pick('ถัดไป', 'Next')}
                </Button>
              </div>
            )}
          </section>

          <section className="tierlist-browse-songs-section">
            <Link className="tierlist-songs-banner glass-heavy" to="/tierlist/songs">
              <div className="tierlist-songs-banner-icon"><Music size={28} /></div>
              <div className="tierlist-songs-banner-copy">
                <h2>{pick('จัดอันดับเพลงเปิด-ปิด', 'Rank Opening & Ending Songs')}</h2>
                <p>{pick('เลือกเรื่องที่มีข้อมูลเพลง แล้วจัดอันดับ OP/ED ในแบบของคุณเอง', 'Pick a title with song data and build your own OP/ED tier list.')}</p>
              </div>
              <span className="btn btn-primary btn-sm">
                {pick('ดูลิสต์จัดอันดับเพลง', 'Explore Song Tier Lists')} <ArrowRight size={13} />
              </span>
            </Link>
          </section>

          {recentCommunityLists.length > 0 && (
            <section className="tierlist-browse-community-section">
              <div className="tierlist-section-head">
                <h2>{pick('อันดับชุมชนล่าสุด', 'Fresh Community Rankings')}</h2>
              </div>
              <div className="tierlist-browse-grid">
                {recentCommunityLists.map((list) => (
                  <TierListCommunityCard
                    key={list.id}
                    list={list}
                    titleById={getEntityMap(entityMaps, list.entityType)}
                    pick={pick}
                    primaryLabel={pick('เปิดอันดับ', 'Open ranking')}
                    primaryTo={`/tierlist/play/${list.id}`}
                    secondaryLabel={pick('รีมิกซ์', 'Remix')}
                    onSecondaryClick={() => handleRemixList(list)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="tierlist-browse-sidebar">
          <div className="tierlist-browse-sidebar-card">
            <h3>{pick('เทมเพลตยอดนิยม', 'Trending Templates')}</h3>
            <ul className="tierlist-trending-list">
              {trendingTemplates.map((template, index) => {
                const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
                const fallbackEntity = template.titleIds
                  .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
                  .map((id) => entityById.get(Number(id)))
                  .filter(Boolean)[0] || null;
                const coverArtwork = getTemplatePreviewArtworkSource(template, fallbackEntity);

                return (
                  <li key={template.id}>
                    <Link className="tierlist-trending-item" to={`/tierlist/template/${template.id}`}>
                      <span className="tierlist-trending-rank">{index + 1}.</span>
                      {coverArtwork ? (
                        <img
                          className={`tierlist-trending-thumb${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                          style={getTemplatePreviewMediaStyle(template)}
                          src={coverArtwork}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      ) : (
                        <span className="tierlist-trending-thumb tierlist-trending-thumb-empty" />
                      )}
                      <span className="tierlist-trending-name">{template.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TierListBrowsePage;
