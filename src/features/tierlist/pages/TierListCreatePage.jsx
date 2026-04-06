import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getCharactersPage, getTitlesPage } from '@/features/discover/lib/recommend';
import { getTierItemTitleFromFilename, uploadTierlistImage } from '@/features/tierlist/api';
import {
  TierListCreateCatalogPickerSection,
  TierListEmptyPanel,
  TierListErrorPanel,
  TierListCreateHero,
  TierListCreateModeSelector,
  TierListCreateSongPickerSection,
  TierListCreateToolbar,
} from '@/features/tierlist/components';
import { useTierListCreateCoverEditor } from '@/features/tierlist/hooks';
import { buildTierListFromTemplate, createTemplateFromCatalog, cleanupDuplicateTierLists, findTierTemplate, loadTierLibrary, saveTierTemplate, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getDisplayName, getEntityModeSummary, matchesCharacterName, matchesSongQuery, matchesStatusFilter } from '@/features/tierlist/lib/tierlistLabels';
import { fetchSongsForTitle, preloadSongsForTitle, splitByAdultFlag, toCustomTierEntity } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { getCurrentUsername } from '@/features/tierlist/lib/tierlistPageUtils';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import './TierList.css';

export function TierListCreatePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult, toggleAdult } = useAgeGate();
  const [pagedEntries, setPagedEntries] = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [customItems, setCustomItems] = useState([]);
  const [isUploadingPoolItems, setIsUploadingPoolItems] = useState(false);
  const [category, setCategory] = useState('anime');
  const [entityType, setEntityType] = useState(TITLE_ENTITY_TYPE);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [statusFilter, setStatusFilter] = useState('all');
  const [titleQuery, setTitleQuery] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedEntityCache, setSelectedEntityCache] = useState(new Map());
  // Song-specific state
  const [browsingTitle, setBrowsingTitle] = useState(null);
  const [songEntityCache, setSongEntityCache] = useState(new Map());
  const [isSongsLoading, setIsSongsLoading] = useState(false);
  const [isAudienceSwitching, setIsAudienceSwitching] = useState(false);
  const {
    closeCoverEditor,
    coverFileInputRef,
    coverImageOffsetX,
    coverImageOffsetY,
    coverImageScale,
    coverImageUrl,
    coverStageRef,
    draftCoverImageOffsetX,
    draftCoverImageOffsetY,
    draftCoverPreviewStyle,
    draftCoverStageCropRect,
    handleCoverPreviewPointerDown,
    handleCoverPreviewPointerMove,
    handleCoverPreviewPointerUp,
    handleCoverPreviewResizePointerDown,
    handleCoverStageImageLoad,
    handleDraftCoverImageOffsetXChange,
    handleDraftCoverImageOffsetYChange,
    handleUploadCover,
    hasPendingCoverFrameChanges,
    isCoverEditorOpen,
    isUploadingCover,
    openCoverEditor,
    resetCoverPreviewFrame,
    saveCoverPreviewFrame,
    savedCoverPreviewStyle,
  } = useTierListCreateCoverEditor({
    pick,
    userId: user?.id || null,
  });

  // Initialise library in background (no catalog needed)
  useEffect(() => {
    if (isAuthLoading) return;
    loadTierLibrary([], {
      userId: user?.id || null,
      includePublic: false,
      fetchTemplates: false,
      showAdult,
    }).catch(() => { });
  }, [showAdult, user?.id, isAuthLoading]);

  // Debounce search query and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(
        normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE
          ? ''
          : titleQuery
      );
      setCatalogPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [entityType, titleQuery]);

  // Server-side paginated fetch for all entity types (title, character, song)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    const isCharMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
    const fetchFn = isCharMode ? getCharactersPage : getTitlesPage;
    fetchFn({
      type: typeFilter === 'all' ? undefined : typeFilter,
      query: debouncedQuery,
      sortBy,
      page: catalogPage,
      pageSize: 30,
      showAdult,
    }).then((result) => {
      if (cancelled) return;
      setPagedEntries(result.items);
      setCatalogTotalPages(result.totalPages);
      setCatalogTotal(result.total);
      setIsLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลดแคตตาล็อกสำหรับสร้างเทมเพลตไม่สำเร็จ', 'Failed to load the catalog for template creation'));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [entityType, typeFilter, debouncedQuery, sortBy, catalogPage, showAdult, pick]);

  useEffect(() => {
    if (!isLoading) {
      setIsAudienceSwitching(false);
    }
  }, [isLoading]);

  // Load songs when user drills into a title (song picker mode)
  useEffect(() => {
    const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;
    if (!isSongMode || !browsingTitle) return undefined;
    const titleId = Number(browsingTitle.id);
    if (songEntityCache.has(titleId)) return undefined;
    let cancelled = false;
    setIsSongsLoading(true);
    fetchSongsForTitle(browsingTitle)
      .then((entities) => {
        if (cancelled) return;
        setIsSongsLoading(false);
        setSongEntityCache((prev) => {
          const next = new Map(prev);
          next.set(titleId, entities);
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setIsSongsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [browsingTitle, entityType, songEntityCache]);

  const isCharacterMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
  // Derived above together with the other create-page mode flags.
  const modeSummary = useMemo(() => getEntityModeSummary(entityType, pick), [entityType, pick]);

  const catalogEntries = useMemo(() => pagedEntries, [pagedEntries]);

  const filtered = useMemo(
    () => catalogEntries.filter((entry) => (
      matchesStatusFilter(entry, statusFilter) && (!isCharacterMode || matchesCharacterName(entry, titleQuery))
    )),
    [catalogEntries, statusFilter, isCharacterMode, titleQuery]
  );
  const groupedFiltered = useMemo(
    () => splitByAdultFlag(filtered),
    [filtered]
  );

  const selectedTitles = useMemo(
    () => Array.from(selectedIds).map((id) => selectedEntityCache.get(id)).filter(Boolean),
    [selectedIds, selectedEntityCache]
  );

  const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;

  // Titles for browsing in song mode; already filtered server-side
  const filteredForSongBrowse = useMemo(() => {
    if (!isSongMode) return [];
    return pagedEntries;
  }, [isSongMode, pagedEntries]);
  const groupedFilteredForSongBrowse = useMemo(
    () => splitByAdultFlag(filteredForSongBrowse),
    [filteredForSongBrowse]
  );

  // Songs currently shown in the drill-down panel
  const currentBrowseSongs = useMemo(() => {
    if (!isSongMode || !browsingTitle) return [];
    return songEntityCache.get(Number(browsingTitle.id)) || [];
  }, [isSongMode, browsingTitle, songEntityCache]);

  const filteredBrowseSongs = useMemo(
    () => currentBrowseSongs.filter((song) => matchesSongQuery(song, songQuery)),
    [currentBrowseSongs, songQuery]
  );
  const groupedFilteredBrowseSongs = useMemo(
    () => splitByAdultFlag(filteredBrowseSongs),
    [filteredBrowseSongs]
  );

  // All selected song entities (accumulated across titles)
  const selectedSongEntities = useMemo(() => {
    if (!isSongMode) return [];
    const result = [];
    for (const songs of songEntityCache.values()) {
      songs.forEach((s) => { if (selectedIds.has(s.id)) result.push(s); });
    }
    return result;
  }, [isSongMode, selectedIds, songEntityCache]);

  const selectedCustomEntities = useMemo(
    () => Array.from(selectedIds)
      .map((id) => selectedEntityCache.get(id))
      .filter((entry) => entry?.isCustomTierItem),
    [selectedEntityCache, selectedIds]
  );

  const selectedItems = isSongMode ? [...selectedSongEntities, ...selectedCustomEntities] : selectedTitles;
  const minimumRequired = isSongMode ? 2 : 8;
  const hasActiveFilters = typeFilter !== 'all'
    || sortBy !== 'popularity'
    || statusFilter !== 'all'
    || titleQuery.trim().length > 0
    || songQuery.trim().length > 0;

  const toggleTitle = (id, entity) => {
    const numId = Number(id);
    const isCurrentlySelected = selectedIds.has(numId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) next.delete(numId);
      else next.add(numId);
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      if (isCurrentlySelected) next.delete(numId);
      else if (entity) next.set(numId, entity);
      return next;
    });
  };

  const handleUploadPoolItems = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    if (!user?.id) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป', 'Please sign in before uploading images'));
      event.target.value = '';
      return;
    }

    setIsUploadingPoolItems(true);
    try {
      const uploadedItems = [];
      for (const file of files) {
        const imageUrl = await uploadTierlistImage(file, user.id, 'tierlist-item');
        const customId = -(Date.now() + Math.floor(Math.random() * 1000) + uploadedItems.length);
        const title = getTierItemTitleFromFilename(file.name, pick);
        uploadedItems.push({
          id: customId,
          title,
          subtitle: '',
          imageUrl,
        });
      }

      setCustomItems((prev) => [...prev, ...uploadedItems]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        uploadedItems.forEach((item) => next.add(Number(item.id)));
        return next;
      });
      setSelectedEntityCache((prev) => {
        const next = new Map(prev);
        uploadedItems.forEach((item) => {
          next.set(Number(item.id), toCustomTierEntity(item, entityType));
        });
        return next;
      });
      toast.success(
        uploadedItems.length === 1
          ? pick('เพิ่มรูปเข้า pool แล้ว', 'Added image to the pool')
          : pick(`เพิ่มรูปเข้า pool แล้ว ${uploadedItems.length} รูป`, `Added ${uploadedItems.length} images to the pool`)
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปโหลดรูปเข้า pool ไม่สำเร็จ', 'Failed to upload pool images'));
    } finally {
      setIsUploadingPoolItems(false);
      event.target.value = '';
    }
  };

  const removeCustomItem = (itemId) => {
    const normalizedId = Number(itemId);
    setCustomItems((prev) => prev.filter((item) => Number(item.id) !== normalizedId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(normalizedId);
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      next.delete(normalizedId);
      return next;
    });
  };

  const removeSelectedPoolItem = (entry) => {
    const normalizedId = Number(entry?.id);
    if (!Number.isFinite(normalizedId)) {
      return;
    }

    if (entry?.isCustomTierItem) {
      removeCustomItem(normalizedId);
      return;
    }

    toggleTitle(normalizedId, entry);
  };

  const handleCreate = async () => {
    const entitiesToUse = selectedItems;
    if (coverImageUrl && isCoverEditorOpen && hasPendingCoverFrameChanges) {
      toast.error(pick('กดบันทึกการครอปรูปหน้าปกก่อนสร้างเทมเพลต', 'Save the cover crop before creating the template'));
      return;
    }
    if (entitiesToUse.length < minimumRequired) {
      toast.error(
        isSongMode
          ? pick('กรุณาเลือกอย่างน้อย 2 เพลง', 'Please select at least 2 songs')
          : pick('กรุณาเลือกอย่างน้อย 8 เรื่อง', 'Please select at least 8 titles')
      );
      return;
    }

    setIsSaving(true);
    try {
      const externalPoolItems = entitiesToUse
        .filter((entry) => entry?.isCustomTierItem)
        .map((entry) => ({
          id: Number(entry.id),
          title: getDisplayName(entry),
          subtitle: entry.subtitle || entry.sourceTitleName || '',
          imageUrl: entry.cover || entry.image_url || '',
        }));
      const catalogItems = entitiesToUse.filter((entry) => !entry?.isCustomTierItem);
      const template = createTemplateFromCatalog(catalogItems, {
        title: templateName.trim() || (isSongMode ? pick('เทมเพลตเพลงใหม่', 'New Song Template') : pick('เทมเพลตใหม่', 'New Template')),
        description: templateDesc.trim(),
        category: isSongMode ? 'songs' : category,
        entityType,
        isPublic: true,
        isSystem: false,
        defaultRows: ['S', 'A', 'B', 'C', 'D'],
        previewArtworkUrl: coverImageUrl.trim(),
        previewArtworkFit: 'cover',
        previewArtworkPosition: 'center',
        previewArtworkScale: coverImageScale,
        previewArtworkOffsetX: coverImageOffsetX,
        previewArtworkOffsetY: coverImageOffsetY,
        customItems: externalPoolItems,
        ownerUserId: user?.id || null,
      });

      const currentLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        showAdult,
      });
      const cleanupResult = await cleanupDuplicateTierLists(currentLibrary, {
        userId: user?.id || null,
      });
      const workingLibrary = cleanupResult.library;
      const libraryAfterTemplate = await saveTierTemplate(template, workingLibrary, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(template.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || template;
      const normalizedSavedTemplate = isSongMode
        ? { ...savedTemplate, entityType: THEME_SONG_ENTITY_TYPE }
        : savedTemplate;
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog({
        ...list,
        entityType: isSongMode ? THEME_SONG_ENTITY_TYPE : list.entityType,
      }, entitiesToUse.map((e) => Number(e.id)));
      const ownerUsername = getCurrentUsername(user);
      const nextList = {
        ...seeded,
        templateId: normalizedSavedTemplate.id,
        entityType: isSongMode ? THEME_SONG_ENTITY_TYPE : seeded.entityType,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      };
      navigate(`/tierlist/play/${nextList.id}`, {
        state: {
          initialTierList: nextList,
          initialLibrary: libraryAfterTemplate,
        },
      });
    } catch (error) {
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetCreateFilters = () => {
    setTypeFilter('all');
    setSortBy('popularity');
    setStatusFilter('all');
    setTitleQuery('');
    setSongQuery('');
    setCatalogPage(1);
  };

  const handleModeEntityTypeChange = (nextValue) => {
    const nextType = normalizeCatalogEntityType(nextValue);
    setEntityType(nextType);
    setSelectedIds(new Set());
    setSelectedEntityCache(new Map());
    setBrowsingTitle(null);
    setCategory(nextType === CHARACTER_ENTITY_TYPE ? 'characters' : nextType === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
    resetCreateFilters();
  };

  const handleCatalogEntityTypeChange = (nextValue) => {
    const nextType = normalizeCatalogEntityType(nextValue);
    setEntityType(nextType);
    setSelectedIds(new Set());
    setSelectedEntityCache(new Map());
    setBrowsingTitle(null);
    setCategory(nextType === CHARACTER_ENTITY_TYPE ? 'characters' : nextType === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
    setTypeFilter('all');
    setTitleQuery('');
    setCatalogPage(1);
  };

  const handleTypeFilterChange = (nextValue) => {
    setTypeFilter(nextValue);
    setCatalogPage(1);
  };

  const handleSortByChange = (nextValue) => {
    setSortBy(nextValue);
    setCatalogPage(1);
  };

  const handleClearTitleQuery = () => {
    setTitleQuery('');
  };

  const handleSelectAllFiltered = () => {
    const toAdd = filtered.filter((entry) => !selectedIds.has(Number(entry.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      toAdd.forEach((entry) => next.add(Number(entry.id)));
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      toAdd.forEach((entry) => next.set(Number(entry.id), entry));
      return next;
    });
  };

  const handleClearSelectedItems = () => {
    setSelectedIds(new Set());
    setSelectedEntityCache(new Map());
  };

  const handleNextCatalogPage = () => {
    setCatalogPage((page) => page + 1);
  };

  const handlePreviousCatalogPage = () => {
    setCatalogPage((page) => page - 1);
  };

  const handleBackToSongTitles = () => {
    setBrowsingTitle(null);
  };

  const handleClearSongQuery = () => {
    setSongQuery('');
  };

  const handleSelectAllCurrentBrowseSongs = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      currentBrowseSongs.forEach((song) => next.add(song.id));
      return next;
    });
  };

  const handleDeselectAllCurrentBrowseSongs = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      currentBrowseSongs.forEach((song) => next.delete(song.id));
      return next;
    });
  };

  const switchAudienceMode = (nextAdultMode) => {
    if (Boolean(nextAdultMode) !== Boolean(showAdult)) {
      setIsAudienceSwitching(true);
      toggleAdult();
      setCatalogPage(1);
    }
  };

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <TierListCreateHero
        isSongMode={isSongMode}
        minimumRequired={minimumRequired}
        modeSummary={modeSummary}
        pick={pick}
        selectedItemsCount={selectedItems.length}
      />

      <TierListCreateModeSelector
        entityType={entityType}
        onSelectEntityType={handleModeEntityTypeChange}
        pick={pick}
      />

      <TierListCreateToolbar
        category={category}
        coverFileInputRef={coverFileInputRef}
        coverImageUrl={coverImageUrl}
        coverStageRef={coverStageRef}
        customItemsCount={customItems.length}
        draftCoverImageOffsetX={draftCoverImageOffsetX}
        draftCoverImageOffsetY={draftCoverImageOffsetY}
        draftCoverPreviewStyle={draftCoverPreviewStyle}
        draftCoverStageCropRect={draftCoverStageCropRect}
        entityType={entityType}
        hasPendingCoverFrameChanges={hasPendingCoverFrameChanges}
        isAudienceSwitching={isAudienceSwitching}
        isCharacterMode={isCharacterMode}
        isCoverEditorOpen={isCoverEditorOpen}
        isLoading={isLoading}
        isSaving={isSaving}
        isSongMode={isSongMode}
        isUploadingCover={isUploadingCover}
        isUploadingPoolItems={isUploadingPoolItems}
        minimumRequired={minimumRequired}
        onCatalogEntityTypeChange={handleCatalogEntityTypeChange}
        onCategoryChange={setCategory}
        onCloseCoverEditor={closeCoverEditor}
        onCreate={handleCreate}
        onCoverPreviewPointerDown={handleCoverPreviewPointerDown}
        onCoverPreviewPointerMove={handleCoverPreviewPointerMove}
        onCoverPreviewPointerUp={handleCoverPreviewPointerUp}
        onCoverPreviewResizePointerDown={handleCoverPreviewResizePointerDown}
        onCoverStageImageLoad={handleCoverStageImageLoad}
        onDraftCoverImageOffsetXChange={handleDraftCoverImageOffsetXChange}
        onDraftCoverImageOffsetYChange={handleDraftCoverImageOffsetYChange}
        onRemoveSelectedPoolItem={removeSelectedPoolItem}
        onResetCoverPreviewFrame={resetCoverPreviewFrame}
        onSaveCoverPreviewFrame={saveCoverPreviewFrame}
        onSwitchAudienceMode={switchAudienceMode}
        onTemplateDescChange={setTemplateDesc}
        onTemplateNameChange={setTemplateName}
        onUploadCover={handleUploadCover}
        onUploadPoolItems={handleUploadPoolItems}
        openCoverEditor={openCoverEditor}
        pick={pick}
        savedCoverPreviewStyle={savedCoverPreviewStyle}
        selectedItems={selectedItems}
        showAdult={showAdult}
        templateDesc={templateDesc}
        templateName={templateName}
      />

      {/* Song picker (song mode only) */}
      {isSongMode ? (
        <TierListCreateSongPickerSection
          browsingTitle={browsingTitle}
          catalogPage={catalogPage}
          catalogTotalPages={catalogTotalPages}
          currentBrowseSongs={currentBrowseSongs}
          filteredBrowseSongs={filteredBrowseSongs}
          filteredForSongBrowse={filteredForSongBrowse}
          groupedFilteredBrowseSongs={groupedFilteredBrowseSongs}
          groupedFilteredForSongBrowse={groupedFilteredForSongBrowse}
          isLoading={isLoading}
          isSongsLoading={isSongsLoading}
          onBackToTitles={handleBackToSongTitles}
          onClearSongQuery={handleClearSongQuery}
          onClearTitleQuery={handleClearTitleQuery}
          onDeselectAllCurrentSongs={handleDeselectAllCurrentBrowseSongs}
          onNextPage={handleNextCatalogPage}
          onOpenTitle={setBrowsingTitle}
          onPreviousPage={handlePreviousCatalogPage}
          onSelectAllCurrentSongs={handleSelectAllCurrentBrowseSongs}
          onSongQueryChange={setSongQuery}
          onSortByChange={handleSortByChange}
          onTitleQueryChange={setTitleQuery}
          onToggleSong={toggleTitle}
          onTypeFilterChange={handleTypeFilterChange}
          pick={pick}
          preloadSongsForTitle={preloadSongsForTitle}
          selectedIds={selectedIds}
          songEntityCache={songEntityCache}
          songQuery={songQuery}
          sortBy={sortBy}
          titleQuery={titleQuery}
          typeFilter={typeFilter}
        />
      ) : (
        /* Normal title/character picker */
        <TierListCreateCatalogPickerSection
          catalogPage={catalogPage}
          catalogTotal={catalogTotal}
          catalogTotalPages={catalogTotalPages}
          filtered={filtered}
          groupedFiltered={groupedFiltered}
          hasActiveFilters={hasActiveFilters}
          isCharacterMode={isCharacterMode}
          isLoading={isLoading}
          onClearSelection={handleClearSelectedItems}
          onClearTitleQuery={handleClearTitleQuery}
          onNextPage={handleNextCatalogPage}
          onPreviousPage={handlePreviousCatalogPage}
          onResetFilters={resetCreateFilters}
          onSelectAllFiltered={handleSelectAllFiltered}
          onSortByChange={handleSortByChange}
          onStatusFilterChange={setStatusFilter}
          onTitleQueryChange={setTitleQuery}
          onToggleTitle={toggleTitle}
          onTypeFilterChange={handleTypeFilterChange}
          pick={pick}
          selectedIds={selectedIds}
          sortBy={sortBy}
          statusFilter={statusFilter}
          titleQuery={titleQuery}
          typeFilter={typeFilter}
        />
      )}
    </div>
  );
}

export default TierListCreatePage;
