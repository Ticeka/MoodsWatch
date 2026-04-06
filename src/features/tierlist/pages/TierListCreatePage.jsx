import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Music, Pencil, Play, Search, RotateCcw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getCharactersPage, getTitlesPage } from '@/features/discover/lib/recommend';
import { getTierItemTitleFromFilename, uploadTierlistImage } from '@/features/tierlist/api';
import { TierListArtworkImage as ArtworkImage, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { CREATE_CATEGORY_OPTIONS, CREATE_SORT_OPTIONS, CREATE_STATUS_OPTIONS, ENTITY_TYPE_OPTIONS } from '@/features/tierlist/constants';
import { buildTierListFromTemplate, createTemplateFromCatalog, cleanupDuplicateTierLists, findTierTemplate, loadTierLibrary, saveTierTemplate, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getCatalogTypeChipLabel, getCreateSortLabel, getDisplayName, getEntityModeSummary, getEntityTypeLabel, getMediaTypeLabel, getMetaLine, getStatusLabel, getTierCategoryLabel, matchesCharacterName, matchesSongQuery, matchesStatusFilter } from '@/features/tierlist/lib/tierlistLabels';
import { fetchSongsForTitle, preloadSongsForTitle, splitByAdultFlag, toCustomTierEntity } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { getCurrentUsername } from '@/features/tierlist/lib/tierlistPageUtils';
import { areTemplatePreviewTransformsEqual, clampTemplatePreviewOffset, getContainedImageRect, getTemplatePreviewMediaStyle, getTemplatePreviewOffsetFromViewportOrigin, getTemplatePreviewScaleFromViewportWidth, getTemplatePreviewViewportBounds, getTemplatePreviewViewportHeightForWidth, getTemplatePreviewViewportWidthForScale, getTierEntityArtworkSource, normalizeTemplatePreviewScale, TEMPLATE_PREVIEW_ASPECT_RATIO, TEMPLATE_PREVIEW_MAX_OFFSET, TEMPLATE_PREVIEW_MAX_SCALE, TEMPLATE_PREVIEW_MIN_SCALE } from '@/features/tierlist/lib/tierlistPreviewUtils';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, getCatalogEntityName, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
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
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageScale, setCoverImageScale] = useState(TEMPLATE_PREVIEW_MIN_SCALE);
  const [coverImageOffsetX, setCoverImageOffsetX] = useState(0);
  const [coverImageOffsetY, setCoverImageOffsetY] = useState(0);
  const [draftCoverImageScale, setDraftCoverImageScale] = useState(TEMPLATE_PREVIEW_MIN_SCALE);
  const [draftCoverImageOffsetX, setDraftCoverImageOffsetX] = useState(0);
  const [draftCoverImageOffsetY, setDraftCoverImageOffsetY] = useState(0);
  const [isCoverEditorOpen, setIsCoverEditorOpen] = useState(false);
  const [customItems, setCustomItems] = useState([]);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
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
  const coverPreviewDragRef = useRef(null);
  const coverFileInputRef = useRef(null);
  const coverStageRef = useRef(null);
  const [coverStageSize, setCoverStageSize] = useState({ width: 0, height: 0 });
  const [coverImageNaturalSize, setCoverImageNaturalSize] = useState({ width: 0, height: 0 });

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

  useEffect(() => {
    if (!coverImageUrl) {
      setCoverImageNaturalSize({ width: 0, height: 0 });
      setCoverStageSize({ width: 0, height: 0 });
      coverPreviewDragRef.current = null;
    }
  }, [coverImageUrl]);

  useEffect(() => {
    if (!isCoverEditorOpen) {
      return undefined;
    }

    const stageNode = coverStageRef.current;
    if (!stageNode) {
      return undefined;
    }

    const updateStageSize = () => {
      const bounds = stageNode.getBoundingClientRect();
      setCoverStageSize({
        width: bounds.width || 0,
        height: bounds.height || 0,
      });
    };

    updateStageSize();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => updateStageSize());
      observer.observe(stageNode);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, [coverImageUrl, isCoverEditorOpen]);

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
  const hasPendingCoverFrameChanges = useMemo(
    () => !areTemplatePreviewTransformsEqual(
      {
        previewArtworkScale: draftCoverImageScale,
        previewArtworkOffsetX: draftCoverImageOffsetX,
        previewArtworkOffsetY: draftCoverImageOffsetY,
      },
      {
        previewArtworkScale: coverImageScale,
        previewArtworkOffsetX: coverImageOffsetX,
        previewArtworkOffsetY: coverImageOffsetY,
      }
    ),
    [
      coverImageOffsetX,
      coverImageOffsetY,
      coverImageScale,
      draftCoverImageOffsetX,
      draftCoverImageOffsetY,
      draftCoverImageScale,
    ]
  );
  const savedCoverPreviewStyle = useMemo(
    () => getTemplatePreviewMediaStyle({
      previewArtworkFit: 'cover',
      previewArtworkPosition: 'center',
      previewArtworkScale: coverImageScale,
      previewArtworkOffsetX: coverImageOffsetX,
      previewArtworkOffsetY: coverImageOffsetY,
    }),
    [coverImageOffsetX, coverImageOffsetY, coverImageScale]
  );
  const draftCoverPreviewStyle = useMemo(
    () => getTemplatePreviewMediaStyle({
      previewArtworkFit: 'cover',
      previewArtworkPosition: 'center',
      previewArtworkScale: draftCoverImageScale,
      previewArtworkOffsetX: draftCoverImageOffsetX,
      previewArtworkOffsetY: draftCoverImageOffsetY,
    }),
    [draftCoverImageOffsetX, draftCoverImageOffsetY, draftCoverImageScale]
  );
  const draftCoverViewportBounds = useMemo(
    () => getTemplatePreviewViewportBounds({
      imageWidth: coverImageNaturalSize.width,
      imageHeight: coverImageNaturalSize.height,
      previewArtworkScale: draftCoverImageScale,
      previewArtworkOffsetX: draftCoverImageOffsetX,
      previewArtworkOffsetY: draftCoverImageOffsetY,
    }),
    [
      coverImageNaturalSize.height,
      coverImageNaturalSize.width,
      draftCoverImageOffsetX,
      draftCoverImageOffsetY,
      draftCoverImageScale,
    ]
  );
  const draftCoverStageCropRect = useMemo(() => {
    if (!draftCoverViewportBounds) {
      return null;
    }

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );

    if (!imageRect) {
      return null;
    }

    return {
      left: imageRect.left + (draftCoverViewportBounds.originX * imageRect.width),
      top: imageRect.top + (draftCoverViewportBounds.originY * imageRect.height),
      width: draftCoverViewportBounds.viewportWidth * imageRect.width,
      height: draftCoverViewportBounds.viewportHeight * imageRect.height,
    };
  }, [coverStageSize.height, coverStageSize.width, draftCoverViewportBounds]);

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

  const handleUploadCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!user?.id) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูป', 'Please sign in before uploading images'));
      event.target.value = '';
      return;
    }

    setIsUploadingCover(true);
    try {
      const uploadedUrl = await uploadTierlistImage(file, user.id, 'tierlist-cover');
      setCoverImageUrl(uploadedUrl);
      setCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
      setCoverImageOffsetX(0);
      setCoverImageOffsetY(0);
      setDraftCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
      setDraftCoverImageOffsetX(0);
      setDraftCoverImageOffsetY(0);
      setIsCoverEditorOpen(true);
      setCoverImageNaturalSize({ width: 0, height: 0 });
      setCoverStageSize({ width: 0, height: 0 });
      toast.success(pick('อัปโหลดรูปหน้าปกแล้ว', 'Cover image uploaded'));
    } catch (error) {
      toast.error(error?.message || pick('อัปโหลดรูปหน้าปกไม่สำเร็จ', 'Failed to upload cover image'));
    } finally {
      setIsUploadingCover(false);
      event.target.value = '';
    }
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

  const switchAudienceMode = (nextAdultMode) => {
    if (Boolean(nextAdultMode) !== Boolean(showAdult)) {
      setIsAudienceSwitching(true);
      toggleAdult();
      setCatalogPage(1);
    }
  };

  const resetCoverPreviewFrame = () => {
    setDraftCoverImageScale(TEMPLATE_PREVIEW_MIN_SCALE);
    setDraftCoverImageOffsetX(0);
    setDraftCoverImageOffsetY(0);
  };

  const openCoverEditor = () => {
    setDraftCoverImageScale(coverImageScale);
    setDraftCoverImageOffsetX(coverImageOffsetX);
    setDraftCoverImageOffsetY(coverImageOffsetY);
    setIsCoverEditorOpen(true);
  };

  const closeCoverEditor = () => {
    setDraftCoverImageScale(coverImageScale);
    setDraftCoverImageOffsetX(coverImageOffsetX);
    setDraftCoverImageOffsetY(coverImageOffsetY);
    setIsCoverEditorOpen(false);
    coverPreviewDragRef.current = null;
  };

  const saveCoverPreviewFrame = () => {
    if (!coverImageUrl) {
      return;
    }

    const nextScale = normalizeTemplatePreviewScale(draftCoverImageScale);
    const nextOffsetX = clampTemplatePreviewOffset(draftCoverImageOffsetX);
    const nextOffsetY = clampTemplatePreviewOffset(draftCoverImageOffsetY);
    setCoverImageScale(nextScale);
    setCoverImageOffsetX(nextOffsetX);
    setCoverImageOffsetY(nextOffsetY);
    setDraftCoverImageScale(nextScale);
    setDraftCoverImageOffsetX(nextOffsetX);
    setDraftCoverImageOffsetY(nextOffsetY);
    setIsCoverEditorOpen(false);
    coverPreviewDragRef.current = null;
    toast.success(pick('บันทึกการครอปรูปแล้ว', 'Cover crop saved'));
  };

  const handleCoverPreviewPointerDown = (event) => {
    if (!coverImageUrl || !isCoverEditorOpen || !draftCoverViewportBounds) {
      return;
    }

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );
    if (!imageRect) {
      return;
    }

    coverPreviewDragRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOriginX: draftCoverViewportBounds.originX,
      startOriginY: draftCoverViewportBounds.originY,
      maxOriginX: draftCoverViewportBounds.maxOriginX,
      maxOriginY: draftCoverViewportBounds.maxOriginY,
      width: imageRect.width || 1,
      height: imageRect.height || 1,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCoverPreviewResizePointerDown = (event, corner) => {
    if (!coverImageUrl || !isCoverEditorOpen || !draftCoverViewportBounds) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const imageRect = getContainedImageRect(
      coverStageSize.width,
      coverStageSize.height,
      draftCoverViewportBounds.imageAspect
    );
    if (!imageRect) {
      return;
    }

    coverPreviewDragRef.current = {
      mode: 'resize',
      corner,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      imageRectWidth: imageRect.width || 1,
      imageRectHeight: imageRect.height || 1,
      imageAspect: draftCoverViewportBounds.imageAspect,
      startViewportWidth: draftCoverViewportBounds.viewportWidth,
      minViewportWidth: getTemplatePreviewViewportWidthForScale(
        draftCoverViewportBounds.imageAspect,
        TEMPLATE_PREVIEW_MAX_SCALE
      ),
      maxViewportWidth: getTemplatePreviewViewportWidthForScale(
        draftCoverViewportBounds.imageAspect,
        TEMPLATE_PREVIEW_MIN_SCALE
      ),
      fixedLeft: corner === 'ne' || corner === 'se' ? draftCoverViewportBounds.originX : null,
      fixedRight: corner === 'nw' || corner === 'sw'
        ? draftCoverViewportBounds.originX + draftCoverViewportBounds.viewportWidth
        : null,
      fixedTop: corner === 'sw' || corner === 'se' ? draftCoverViewportBounds.originY : null,
      fixedBottom: corner === 'nw' || corner === 'ne'
        ? draftCoverViewportBounds.originY + draftCoverViewportBounds.viewportHeight
        : null,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleCoverPreviewPointerMove = (event) => {
    const dragState = coverPreviewDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    if (dragState.mode === 'resize') {
      const horizontalDelta = (event.clientX - dragState.startX) / (dragState.imageRectWidth || 1);
      const verticalDelta = (event.clientY - dragState.startY) / (dragState.imageRectHeight || 1);
      const verticalWidthDelta = verticalDelta * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect);
      let widthDeltaFromX = 0;
      let widthDeltaFromY = 0;

      switch (dragState.corner) {
        case 'ne':
          widthDeltaFromX = horizontalDelta;
          widthDeltaFromY = -verticalWidthDelta;
          break;
        case 'nw':
          widthDeltaFromX = -horizontalDelta;
          widthDeltaFromY = -verticalWidthDelta;
          break;
        case 'sw':
          widthDeltaFromX = -horizontalDelta;
          widthDeltaFromY = verticalWidthDelta;
          break;
        case 'se':
        default:
          widthDeltaFromX = horizontalDelta;
          widthDeltaFromY = verticalWidthDelta;
          break;
      }

      const widthDelta = Math.abs(widthDeltaFromX) >= Math.abs(widthDeltaFromY)
        ? widthDeltaFromX
        : widthDeltaFromY;
      const lowerBound = dragState.minViewportWidth;
      let upperBound = dragState.maxViewportWidth;

      if (Number.isFinite(dragState.fixedLeft)) {
        upperBound = Math.min(upperBound, 1 - dragState.fixedLeft);
      }
      if (Number.isFinite(dragState.fixedRight)) {
        upperBound = Math.min(upperBound, dragState.fixedRight);
      }
      if (Number.isFinite(dragState.fixedTop)) {
        upperBound = Math.min(
          upperBound,
          (1 - dragState.fixedTop) * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect)
        );
      }
      if (Number.isFinite(dragState.fixedBottom)) {
        upperBound = Math.min(
          upperBound,
          dragState.fixedBottom * (TEMPLATE_PREVIEW_ASPECT_RATIO / dragState.imageAspect)
        );
      }

      const effectiveLowerBound = Math.min(lowerBound, upperBound);
      const nextViewportWidth = Math.max(
        effectiveLowerBound,
        Math.min(upperBound, dragState.startViewportWidth + widthDelta)
      );
      const nextViewportHeight = getTemplatePreviewViewportHeightForWidth(
        dragState.imageAspect,
        nextViewportWidth
      );
      const nextOriginX = Number.isFinite(dragState.fixedLeft)
        ? dragState.fixedLeft
        : dragState.fixedRight - nextViewportWidth;
      const nextOriginY = Number.isFinite(dragState.fixedTop)
        ? dragState.fixedTop
        : dragState.fixedBottom - nextViewportHeight;

      setDraftCoverImageScale(
        getTemplatePreviewScaleFromViewportWidth(dragState.imageAspect, nextViewportWidth)
      );
      setDraftCoverImageOffsetX(
        getTemplatePreviewOffsetFromViewportOrigin(nextOriginX, Math.max(0, 1 - nextViewportWidth))
      );
      setDraftCoverImageOffsetY(
        getTemplatePreviewOffsetFromViewportOrigin(nextOriginY, Math.max(0, 1 - nextViewportHeight))
      );
      return;
    }

    const deltaX = (event.clientX - dragState.startX) / dragState.width;
    const deltaY = (event.clientY - dragState.startY) / dragState.height;
    const nextOriginX = Math.max(0, Math.min(dragState.maxOriginX, dragState.startOriginX + deltaX));
    const nextOriginY = Math.max(0, Math.min(dragState.maxOriginY, dragState.startOriginY + deltaY));
    setDraftCoverImageOffsetX(getTemplatePreviewOffsetFromViewportOrigin(nextOriginX, dragState.maxOriginX));
    setDraftCoverImageOffsetY(getTemplatePreviewOffsetFromViewportOrigin(nextOriginY, dragState.maxOriginY));
  };

  const handleCoverPreviewPointerUp = (event) => {
    if (coverPreviewDragRef.current?.pointerId === event.pointerId) {
      coverPreviewDragRef.current = null;
    }
  };

  const handleCoverStageImageLoad = (event) => {
    setCoverImageNaturalSize({
      width: event.currentTarget.naturalWidth || 0,
      height: event.currentTarget.naturalHeight || 0,
    });
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
      <section className="container tierlist-hero tierlist-create-hero tierlist-create-rail">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}</span>
          <h1>{modeSummary.title}</h1>
          <p>{modeSummary.description}</p>
          <div className="tierlist-create-hero-meta" aria-label={pick('ภาพรวมการสร้าง', 'Creation summary')}>
            <span className="tierlist-create-meta-pill">
              <strong>{minimumRequired}</strong>
              {isSongMode
                ? pick(' ขั้นต่ำที่ต้องเลือก', ' minimum picks')
                : pick(' ขั้นต่ำก่อนสร้าง', ' minimum to create')}
            </span>
            <span className="tierlist-create-meta-pill">
              <strong>{selectedItems.length}</strong>
              {pick(' รายการที่เลือก', ' selected')}
            </span>
          </div>
        </div>
      </section>

      <section className="container tierlist-create-mode-row tierlist-create-rail">
        {ENTITY_TYPE_OPTIONS.map((option) => {
          const active = option.value === entityType;
          return (
            <button
              key={option.value}
              type="button"
              className={`glass-heavy tierlist-create-mode-card${active ? ' is-active' : ''}`}
              onClick={() => {
                setEntityType(normalizeCatalogEntityType(option.value));
                setSelectedIds(new Set());
                setSelectedEntityCache(new Map());
                setBrowsingTitle(null);
                setCategory(option.value === CHARACTER_ENTITY_TYPE ? 'characters' : option.value === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
                resetCreateFilters();
              }}
              aria-pressed={active}
            >
              <strong>{getEntityTypeLabel(option.value, pick)}</strong>
              <span>
                {option.value === TITLE_ENTITY_TYPE
                  ? pick('คัดชื่อเรื่องตรง ๆ พร้อมตัวกรองเพิ่ม', 'Curate titles directly with richer filtering')
                  : option.value === CHARACTER_ENTITY_TYPE
                    ? pick('แยกค้นหาชื่อเรื่องต้นทางกับชื่อตัวละครออกจากกัน', 'Keep source-title search and character-name search separate')
                    : pick('เลือกเรื่องก่อน แล้วค่อยเจาะ OP/ED ด้านใน', 'Pick a title first, then drill into its OP/ED tracks')}
              </span>
            </button>
          );
        })}
      </section>

      <section className="container tierlist-create-toolbar-shell tierlist-create-rail">
        <div className="tierlist-toolbar glass-heavy tierlist-create-toolbar">
        <div className="tierlist-create-audience-row" role="group" aria-label={pick('โหมดคอนเทนต์', 'Audience mode')}>
          <button
            type="button"
            className={`tierlist-create-audience-pill${!showAdult ? ' is-active' : ''}`}
            onClick={() => switchAudienceMode(false)}
            aria-pressed={!showAdult}
            disabled={isAudienceSwitching}
          >
            {pick('ทั่วไป', 'General')}
          </button>
          <button
            type="button"
            className={`tierlist-create-audience-pill${showAdult ? ' is-active' : ''}`}
            onClick={() => switchAudienceMode(true)}
            aria-pressed={showAdult}
            disabled={isAudienceSwitching}
          >
            18+
          </button>
          <span className="tierlist-create-audience-note">
            {showAdult
              ? pick('ตอนนี้ manhwa 18+ จะถูกดึงตรงตามโหมดผู้ใหญ่', '18+ manhwa is now fetched through the adult catalog mode.')
              : pick('ตอนนี้จะแสดงเฉพาะคอนเทนต์ทั่วไป', 'General-only catalog is active right now.')}
          </span>
        </div>

        <label className="tierlist-field">
          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={pick('เช่น Best Romance 2026', 'e.g. Best Romance 2026')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('คำอธิบาย', 'Description')}</span>
          <input
            value={templateDesc}
            onChange={(event) => setTemplateDesc(event.target.value)}
            placeholder={pick('อธิบายสั้น ๆ ว่าเทมเพลตนี้เหมาะกับอะไร', 'Add a short description for this template')}
          />
        </label>

        <div className="tierlist-create-external-panel glass-heavy">
          <div className="tierlist-create-external-head">
            <strong>{pick('อัปโหลดรูป', 'Upload Images')}</strong>
            <span>{pick('อัปโหลดไฟล์สำหรับหน้าปกและรูปใน pool ได้เลย โดยไม่ต้องตั้งชื่อเอง', 'Upload files for the cover and pool items without naming them manually')}</span>
          </div>
          <div className="tierlist-create-external-grid">
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปหน้าปก', 'Cover image')}</span>
              <label className={`tierlist-upload-button${isUploadingCover ? ' is-uploading' : ''}`}>
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCover}
                  disabled={isUploadingCover || isSaving}
                />
                <span>{isUploadingCover ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหน้าปก', 'Choose cover image')}</span>
              </label>
              <small>{coverImageUrl ? pick('อัปโหลดแล้ว พร้อมใช้เป็นหน้าปก', 'Uploaded and ready as the cover') : pick('ใช้รูปเดียวสำหรับหน้าปกเทมเพลต', 'Use a single image as the template cover')}</small>
            </label>
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปสำหรับ pool', 'Pool images')}</span>
              <label className={`tierlist-upload-button${isUploadingPoolItems ? ' is-uploading' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadPoolItems}
                  disabled={isUploadingPoolItems || isSaving}
                />
                <span>{isUploadingPoolItems ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหลายไฟล์', 'Choose multiple images')}</span>
              </label>
              <small>{pick('ระบบจะเพิ่มเข้าพูลให้อัตโนมัติ', 'Files will be added to the pool automatically')}</small>
            </label>
          </div>
          <div className="tierlist-create-external-status">
            <span className="tierlist-chip">{coverImageUrl ? pick('มีหน้าปกแล้ว', 'Cover ready') : pick('ยังไม่มีหน้าปก', 'No cover yet')}</span>
            <span className="tierlist-chip">{pick(`${customItems.length} รูปในพูล`, `${customItems.length} pool images`)}</span>
          </div>
          {coverImageUrl ? (
            <div className="tierlist-create-cover-shell">
              <div className="tierlist-create-cover-summary">
                <div className="tierlist-create-cover-summary-media" style={savedCoverPreviewStyle}>
                  <img src={coverImageUrl} alt={pick('หน้าปกที่บันทึกแล้ว', 'Saved cover preview')} loading="lazy" />
                </div>
                <div className="tierlist-create-cover-summary-copy">
                  <div className="tierlist-create-cover-stage-head">
                    <strong>{pick('หน้าปกที่ใช้จริง', 'Saved cover')}</strong>
                    <span>
                      {isCoverEditorOpen
                        ? pick('กำลังแก้ไขครอปอยู่ กดบันทึกการครอปเพื่ออัปเดตหน้าปกจริง', 'You are editing the crop. Save it to update the actual cover.')
                        : pick('รูปนี้จะถูกใช้เป็นหน้าปกเทมเพลตหลังจากกดสร้าง', 'This saved frame will be used as the template cover when you create it.')}
                    </span>
                  </div>
                  <div className="tierlist-create-cover-summary-status">
                    <span className={`tierlist-chip${hasPendingCoverFrameChanges ? ' tierlist-chip-warning' : ' tierlist-chip-success'}`}>
                      {hasPendingCoverFrameChanges ? pick('มีการแก้ไขที่ยังไม่บันทึก', 'Unsaved crop changes') : pick('บันทึกครอปแล้ว', 'Crop saved')}
                    </span>
                    <span className="tierlist-chip">{pick('อัตราส่วน 5:3', '5:3 cover')}</span>
                  </div>
                </div>
                <div className="tierlist-create-cover-summary-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    icon={<Pencil size={14} />}
                    onClick={openCoverEditor}
                    disabled={isSaving || isUploadingCover || isCoverEditorOpen}
                  >
                    {isCoverEditorOpen ? pick('กำลังแก้ไขครอป', 'Editing crop') : pick('แก้ไขครอป', 'Edit crop')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw size={14} />}
                    onClick={() => coverFileInputRef.current?.click()}
                    disabled={isSaving || isUploadingCover}
                  >
                    {pick('เปลี่ยนรูป', 'Change image')}
                  </Button>
                </div>
              </div>
              {isCoverEditorOpen ? (
                <div className="tierlist-create-cover-editor-card">
                  <div className="tierlist-create-cover-controls">
                    <div className="tierlist-create-cover-control-group">
                      <span className="tierlist-create-cover-control-label">{pick('เลื่อนซ้ายขวา', 'Horizontal position')}</span>
                      <div className="tierlist-create-cover-slider-row">
                        <input
                          className="tierlist-create-cover-slider"
                          type="range"
                          min={-TEMPLATE_PREVIEW_MAX_OFFSET}
                          max={TEMPLATE_PREVIEW_MAX_OFFSET}
                          step="0.5"
                          value={draftCoverImageOffsetX}
                          onChange={(event) => setDraftCoverImageOffsetX(clampTemplatePreviewOffset(event.target.value))}
                          disabled={isSaving}
                          aria-label={pick('เลื่อนรูปแนวนอน', 'Move image horizontally')}
                        />
                        <strong>{Math.round(draftCoverImageOffsetX)}%</strong>
                      </div>
                    </div>
                    <div className="tierlist-create-cover-control-group">
                      <span className="tierlist-create-cover-control-label">{pick('เลื่อนบนล่าง', 'Vertical position')}</span>
                      <div className="tierlist-create-cover-slider-row">
                        <input
                          className="tierlist-create-cover-slider"
                          type="range"
                          min={-TEMPLATE_PREVIEW_MAX_OFFSET}
                          max={TEMPLATE_PREVIEW_MAX_OFFSET}
                          step="0.5"
                          value={draftCoverImageOffsetY}
                          onChange={(event) => setDraftCoverImageOffsetY(clampTemplatePreviewOffset(event.target.value))}
                          disabled={isSaving}
                          aria-label={pick('เลื่อนรูปแนวตั้ง', 'Move image vertically')}
                        />
                        <strong>{Math.round(draftCoverImageOffsetY)}%</strong>
                      </div>
                    </div>
                    <small className="tierlist-create-cover-control-hint">
                      {pick('ลากทั้งกรอบเพื่อย้ายตำแหน่ง หรือดึงที่มุมกรอบเพื่อย่อขยายขนาดได้เลย จากนั้นค่อยกดบันทึกการครอป', 'Drag the frame to reposition it, or pull its corners to resize it before saving.')}
                    </small>
                  </div>
                  <div className="tierlist-create-cover-editor">
                    <div className="tierlist-create-cover-stage-panel">
                      <div className="tierlist-create-cover-stage-head">
                        <strong>{pick('แก้ไขครอป', 'Crop editor')}</strong>
                        <span>{pick('ภาพเต็มอยู่ด้านหลัง ส่วนกรอบคือพื้นที่ที่จะถูกใช้จริง', 'The full image stays in the background, and the frame shows what will actually be used.')}</span>
                      </div>
                      <div className="tierlist-create-cover-stage" ref={coverStageRef}>
                        <img
                          className="tierlist-create-cover-stage-base"
                          src={coverImageUrl}
                          alt={pick('รูปต้นฉบับ', 'Original image')}
                          loading="lazy"
                          draggable={false}
                          onLoad={handleCoverStageImageLoad}
                        />
                        {draftCoverStageCropRect ? (
                          <div
                            className="tierlist-create-cover-stage-crop"
                            style={draftCoverStageCropRect}
                            onPointerDown={handleCoverPreviewPointerDown}
                            onPointerMove={handleCoverPreviewPointerMove}
                            onPointerUp={handleCoverPreviewPointerUp}
                            onPointerCancel={handleCoverPreviewPointerUp}
                            aria-label={pick('กรอบครอปรูปหน้าปก', 'Cover crop frame')}
                          >
                            {['nw', 'ne', 'sw', 'se'].map((corner) => (
                              <button
                                key={corner}
                                type="button"
                                className={`tierlist-create-cover-stage-handle is-${corner}`}
                                onPointerDown={(event) => handleCoverPreviewResizePointerDown(event, corner)}
                                onPointerMove={handleCoverPreviewPointerMove}
                                onPointerUp={handleCoverPreviewPointerUp}
                                onPointerCancel={handleCoverPreviewPointerUp}
                                aria-label={pick('ลากเพื่อย่อขยายกรอบครอป', 'Drag to resize the crop frame')}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="tierlist-create-cover-preview-panel">
                      <div className="tierlist-create-cover-stage-head">
                        <strong>{pick('ตัวอย่างหลังบันทึก', 'Saved result preview')}</strong>
                        <span>{pick('พอกดบันทึกการครอป หน้าปกจริงจะอัปเดตเป็นมุมนี้', 'Once you save the crop, the actual cover will update to this framing.')}</span>
                      </div>
                      <div
                        className="tierlist-create-cover-preview"
                        style={draftCoverPreviewStyle}
                      >
                        <img src={coverImageUrl} alt={pick('ตัวอย่างหน้าปก', 'Cover preview')} loading="lazy" />
                      </div>
                    </div>
                  </div>
                  <div className="tierlist-create-cover-actions tierlist-create-cover-actions-editor">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => coverFileInputRef.current?.click()}
                      disabled={isSaving || isUploadingCover}
                    >
                      {pick('เปลี่ยนรูป', 'Change image')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={resetCoverPreviewFrame} disabled={isSaving}>
                      {pick('รีเซ็ตเฟรม', 'Reset framing')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={closeCoverEditor} disabled={isSaving}>
                      {pick('ยกเลิก', 'Cancel')}
                    </Button>
                    <Button type="button" size="sm" variant="primary" icon={<Save size={14} />} onClick={saveCoverPreviewFrame} disabled={isSaving}>
                      {hasPendingCoverFrameChanges ? pick('บันทึกการครอป', 'Save crop') : pick('ใช้เฟรมนี้', 'Use this frame')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="tierlist-create-summary is-visible">
            <div className="tierlist-create-summary-head">
              <strong>{pick('พูลที่เลือกแล้ว', 'Selected pool')}</strong>
              <div className="tierlist-create-summary-meta">
                <span>{pick(`${selectedItems.length} รายการพร้อมใช้`, `${selectedItems.length} items ready`)}</span>
                <span>{pick(`${customItems.length} รูปจากการอิมพอร์ต`, `${customItems.length} imported images`)}</span>
              </div>
            </div>
            {selectedItems.length > 0 ? (
              <div className="tierlist-create-summary-list">
                {selectedItems.map((entry) => {
                  const artworkSource = getTierEntityArtworkSource(entry);
                  const metaLine = entry?.isCustomTierItem
                    ? pick('อิมพอร์ตจากข้างนอก', 'Imported from outside')
                    : getMetaLine(entry) || pick('เลือกจากคลังในเว็บ', 'Selected from the site catalog');
                  return (
                    <article key={`selected-pool-${entry.id}`} className="tierlist-create-summary-item">
                      <div className="tierlist-create-summary-thumb">
                        {artworkSource ? <img src={artworkSource} alt={getDisplayName(entry)} loading="lazy" /> : null}
                      </div>
                      <div className="tierlist-create-summary-copy">
                        <div className="tierlist-create-summary-item-tags">
                          <span className="tierlist-chip">
                            {entry?.isCustomTierItem
                              ? pick('อิมพอร์ต', 'Imported')
                              : pick('จากเว็บ', 'Catalog')}
                          </span>
                          {entry?.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                        </div>
                        <strong>{getDisplayName(entry)}</strong>
                        <span>{metaLine}</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSelectedPoolItem(entry)}
                      >
                        <Trash2 size={14} /> {pick('เอาออก', 'Remove')}
                      </Button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="tierlist-create-summary-empty">
                {pick('พอเลือกจากในเว็บหรืออิมพอร์ตจากข้างนอกแล้ว รายการทั้งหมดจะมาโชว์รวมกันตรงนี้', 'Once you pick items from the site or import them, everything will appear together here.')}
              </p>
            )}
          </div>
        </div>

        {!isSongMode && (
          <label className="tierlist-field">
            <span>{pick('หมวดหมู่', 'Category')}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CREATE_CATEGORY_OPTIONS
                .filter((option) => !isCharacterMode || option.value !== 'anime')
                .map((option) => (
                  <option key={option.value} value={option.value}>{getTierCategoryLabel(option.value, pick)}</option>
                ))}
            </select>
          </label>
        )}

        <label className="tierlist-field">
          <span>{pick('แคตตาล็อก', 'Catalog')}</span>
          <select
            value={entityType}
            onChange={(event) => {
              const nextType = normalizeCatalogEntityType(event.target.value);
              setEntityType(nextType);
              setSelectedIds(new Set());
              setSelectedEntityCache(new Map());
              setBrowsingTitle(null);
              setCategory(nextType === CHARACTER_ENTITY_TYPE ? 'characters' : nextType === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
              setTypeFilter('all');
              setTitleQuery('');
              setCatalogPage(1);
            }}
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getEntityTypeLabel(option.value, pick)}</option>
            ))}
          </select>
        </label>

        <div className="tierlist-toolbar-actions">
          <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={isLoading || isSaving || selectedItems.length < minimumRequired}
          >
            {isSaving
              ? pick('กำลังสร้าง...', 'Creating...')
              : `${pick('สร้างและเล่น', 'Create & Play')}${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`}
          </Button>
        </div>
        </div>
      </section>

      {/* Song picker (song mode only) */}
      {isSongMode ? (
        <section className="container tierlist-section tierlist-create-rail">
          {browsingTitle ? (
            // Song drill-down: songs of the selected title
            <>
              <div className="tierlist-section-head">
                <div className="tierlist-songs-drilldown-head">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowsingTitle(null)}
                  >
                    <ChevronLeft size={14} /> {pick('กลับเลือกเรื่อง', 'Back to titles')}
                  </button>
                  <h2>
                    {getCatalogEntityName(browsingTitle)}
                    <span className="tierlist-count">
                      &nbsp;•&nbsp;
                      {currentBrowseSongs.filter((s) => selectedIds.has(s.id)).length}/{currentBrowseSongs.length} {pick('เพลงที่เลือก', 'songs selected')}
                    </span>
                  </h2>
                </div>
                <div className="tierlist-picker-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.add(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.length === 0}
                  >
                    {pick('เลือกทั้งหมด', 'Select All')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.delete(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.every((s) => !selectedIds.has(s.id))}
                  >
                    {pick('ยกเลิกทั้งหมด', 'Deselect All')}
                  </button>
                </div>
              </div>

              <div className="tierlist-picker-filterbar">
                <div className="tierlist-picker-filterbar-top">
                  <div className="tierlist-picker-search-wrap">
                    <input
                      className="tierlist-picker-search"
                      value={songQuery}
                      onChange={(event) => setSongQuery(event.target.value)}
                      placeholder={pick('ค้นหาเพลง ศิลปิน หรือ OP/ED...', 'Search by song, artist, or OP/ED...')}
                      aria-label={pick('ค้นหาเพลง', 'Search songs')}
                    />
                    {songQuery ? (
                      <button type="button" className="tierlist-picker-search-clear" onClick={() => setSongQuery('')}>
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                  <span className="tierlist-picker-result-count">{filteredBrowseSongs.length} {pick('เพลง', 'songs')}</span>
                </div>
              </div>

              {isSongsLoading ? (
                <TierListEmptyPanel
                  icon={<Loader2 size={24} className="animate-spin" />}
                  title={pick('กำลังโหลดเพลง', 'Loading songs')}
                  message={pick('กำลังดึงรายการเพลงสำหรับเรื่องนี้', 'Fetching song list for this title.')}
                />
              ) : filteredBrowseSongs.length === 0 ? (
                <TierListEmptyPanel
                  icon={<Music size={24} />}
                  title={pick('ไม่พบเพลงสำหรับเรื่องนี้', 'No songs found for this title')}
                  message={pick('เรื่องนี้ยังไม่มีข้อมูลเพลงในระบบ', 'This title has no song data in the database.')}
                />
              ) : (
                <div className="tierlist-adult-split-wrap">
                  {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                    <section key={group.key} className="tierlist-adult-split-block">
                      <h3>{group.label} <span>{groupedFilteredBrowseSongs[group.key].length}</span></h3>
                      <div className="tierlist-song-picker-list">
                        {groupedFilteredBrowseSongs[group.key].length === 0 ? (
                          <p className="tierlist-pool-state">{pick('ไม่มีรายการฝั่งนี้', 'No items in this side')}</p>
                        ) : groupedFilteredBrowseSongs[group.key].map((song) => {
                          const selected = selectedIds.has(song.id);
                          return (
                            <button
                              key={song.id}
                              type="button"
                              className={`tierlist-song-picker-row${selected ? ' is-selected' : ''}`}
                              onClick={() => toggleTitle(song.id)}
                              aria-pressed={selected}
                            >
                              <div className="tierlist-song-picker-thumb">
                                <ArtworkImage entity={song} alt="" loading="lazy" />
                              </div>
                              <div className="tierlist-song-picker-info">
                                <strong>{song.song_title || getCatalogEntityName(song)}</strong>
                                <span>{[song.theme_label, song.artist_name].filter(Boolean).join(' | ')}</span>
                                {song.episodes_text ? <small>{song.episodes_text}</small> : null}
                              </div>
                              <span className="tierlist-song-picker-check" aria-hidden="true">
                                {selected ? <span className="tierlist-picker-check-dot is-on" /> : <span className="tierlist-picker-check-dot" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          ) : (
            // Title browser: pick which title to drill into
            <>
              <div className="tierlist-section-head">
                <h2>
                  {pick('เลือกเรื่องที่ต้องการเพลง', 'Pick a title to browse songs')}
                  {selectedIds.size > 0 && (
                    <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('เพลงที่เลือกแล้ว', 'songs selected')}</span>
                  )}
                </h2>
              </div>

              <div className="tierlist-picker-filterbar">
                <div className="tierlist-picker-filterbar-top">
                  <div className="tierlist-picker-type-pills" role="toolbar">
                    {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                        onClick={() => setTypeFilter(type)}
                        aria-pressed={typeFilter === type}
                      >
                        {getMediaTypeLabel(type, pick)}
                      </button>
                    ))}
                  </div>
                  <SortSelect
                    value={sortBy}
                    onChange={(value) => {
                      setSortBy(value);
                      setCatalogPage(1);
                    }}
                    label={pick('เรียง', 'Sort')}
                    className="results-sorter"
                  >
                    {CREATE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
                    ))}
                  </SortSelect>
                  <div className="tierlist-picker-search-wrap">
                    <input
                      className="tierlist-picker-search"
                      value={titleQuery}
                      onChange={(e) => setTitleQuery(e.target.value)}
                      placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
                    />
                    {titleQuery && (
                      <button type="button" className="tierlist-picker-search-clear" onClick={() => setTitleQuery('')}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <span className="tierlist-picker-result-count">{filteredForSongBrowse.length} {pick('เรื่อง', 'titles')}</span>
                </div>
              </div>

              {isLoading ? (
                <TierListEmptyPanel
                  icon={<Loader2 size={28} className="animate-spin" />}
                  title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
                  message={pick('กำลังเตรียมรายชื่อเรื่อง', 'Preparing titles.')}
                />
              ) : filteredForSongBrowse.length === 0 ? (
                <TierListEmptyPanel
                  icon={<Search size={28} />}
                  title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
                  message={pick('ลองล้างคำค้นหา', 'Try clearing the search.')}
                />
              ) : (
                <>
                  <div className="tierlist-adult-split-wrap">
                    {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                      <section key={group.key} className="tierlist-adult-split-block">
                        <h3>{group.label} <span>{groupedFilteredForSongBrowse[group.key].length}</span></h3>
                        <div className="tierlist-picker-grid">
                          {groupedFilteredForSongBrowse[group.key].map((title) => {
                            const titleSongs = songEntityCache.get(Number(title.id)) || [];
                            const selectedCount = titleSongs.filter((s) => selectedIds.has(s.id)).length;
                            return (
                              <button
                                key={title.id}
                                type="button"
                                className={`tierlist-picker-card${selectedCount > 0 ? ' is-selected' : ''}`}
                                onClick={() => setBrowsingTitle(title)}
                                onMouseEnter={() => preloadSongsForTitle(title)}
                                onFocus={() => preloadSongsForTitle(title)}
                                title={getDisplayName(title)}
                              >
                                <div className="tierlist-picker-thumb">
                                  <ArtworkImage entity={title} alt="" loading="lazy" />
                                  {selectedCount > 0 && (
                                    <div className="tierlist-picker-check">
                                      <Music size={10} /> {selectedCount}
                                    </div>
                                  )}
                                </div>
                                <div className="tierlist-picker-card-body">
                                  <div className="tierlist-picker-card-tags">
                                    <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                                    {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                                  </div>
                                  <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                                  <span className="tierlist-picker-card-subtitle">{getMetaLine(title) || getStatusLabel(title.status, pick)}</span>
                                  <small className="tierlist-picker-card-footnote">
                                    {pick('กดเพื่อเข้าไปเลือก OP / ED ของเรื่องนี้', 'Open this title to pick its OP / ED tracks')}
                                  </small>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                  {catalogTotalPages > 1 && (
                    <div className="tierlist-picker-pagination">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={catalogPage <= 1}
                        onClick={() => setCatalogPage((p) => p - 1)}
                      >
                        <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
                      </Button>
                      <span className="tierlist-picker-page-info">
                        {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={catalogPage >= catalogTotalPages}
                        onClick={() => setCatalogPage((p) => p + 1)}
                      >
                        {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      ) : (
        /* Normal title/character picker */
        <section className="container tierlist-section tierlist-create-rail">
          <div className="tierlist-section-head">
            <h2>
              {isCharacterMode
                ? pick('เลือก Character โดยแยกจาก Source Title ชัดเจน', 'Pick characters with source titles clearly separated')
                : pick('เลือกเรื่อง', 'Select Titles')}
              {selectedIds.size > 0 && (
                <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('รายการที่เลือก', 'selected')}</span>
              )}
            </h2>
            <div className="tierlist-picker-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const toAdd = filtered.filter((t) => !selectedIds.has(Number(t.id)));
                  setSelectedIds((prev) => { const n = new Set(prev); toAdd.forEach((t) => n.add(Number(t.id))); return n; });
                  setSelectedEntityCache((prev) => { const n = new Map(prev); toAdd.forEach((t) => n.set(Number(t.id), t)); return n; });
                }}
                disabled={filtered.length === 0}
              >
                {pick('เลือกทั้งหมด', 'Select All')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelectedIds(new Set()); setSelectedEntityCache(new Map()); }}
                disabled={selectedIds.size === 0}
              >
                {pick('ล้าง', 'Clear')}
              </button>
            </div>
          </div>

          <div className="tierlist-picker-filterbar">
            <div className="tierlist-picker-filterbar-top">
              <div className="tierlist-picker-type-pills" role="toolbar" aria-label={pick('กรองตามประเภท', 'Filter by type')}>
                {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                    onClick={() => { setTypeFilter(type); setCatalogPage(1); }}
                    aria-pressed={typeFilter === type}
                  >
                    {getMediaTypeLabel(type, pick)}
                  </button>
                ))}
              </div>
              <SortSelect
                value={sortBy}
                onChange={(value) => {
                  setSortBy(value);
                  setCatalogPage(1);
                }}
                label={pick('เรียง', 'Sort')}
                className="results-sorter"
              >
                {CREATE_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
                ))}
              </SortSelect>
              <SortSelect
                value={statusFilter}
                onChange={setStatusFilter}
                label={pick('สถานะ', 'Status')}
                className="results-sorter"
              >
                {CREATE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{getStatusLabel(status, pick)}</option>
                ))}
              </SortSelect>
              <div className="tierlist-picker-search-wrap">
                <input
                  className="tierlist-picker-search"
                  value={titleQuery}
                  onChange={(event) => setTitleQuery(event.target.value)}
                  placeholder={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง...', 'Search character or source title...') : pick('ค้นหาเรื่อง...', 'Search titles...')}
                  aria-label={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง', 'Search character or source title') : pick('ค้นหาเรื่อง', 'Search titles')}
                />
                {titleQuery && (
                  <button
                    type="button"
                    className="tierlist-picker-search-clear"
                    onClick={() => setTitleQuery('')}
                    aria-label={pick('ล้างคำค้นหา', 'Clear search')}
                  ><X size={14} /></button>
                )}
              </div>
              <span className="tierlist-picker-result-count">
                {isCharacterMode ? filtered.length : catalogTotal} {pick('รายการ', 'items')}
              </span>
            </div>
          </div>

          {isLoading ? (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
              message={pick('กำลังเตรียมรายการเรื่องให้เลือกสำหรับสร้างเทมเพลต', 'Preparing titles you can use in this template.')}
            />
          ) : filtered.length === 0 ? (
            <TierListEmptyPanel
              icon={<Search size={28} />}
              title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
              message={
                hasActiveFilters
                  ? pick('ลองล้างคำค้นหา ปิดตัวกรองบางตัว หรือเลือกทุกประเภท', 'Try clearing search, relaxing filters, or switching back to all types.')
                  : pick('ยังไม่มีข้อมูลเรื่องให้เลือกในตอนนี้', 'There are no titles available to pick right now.')
              }
              action={hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetCreateFilters}
                >
                  {pick('ล้างตัวกรอง', 'Clear filters')}
                </Button>
              ) : null}
            />
          ) : (
            <>
              <div className="tierlist-adult-split-wrap">
                {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
                  <section key={group.key} className="tierlist-adult-split-block">
                    <h3>{group.label} <span>{groupedFiltered[group.key].length}</span></h3>
                    <div className="tierlist-picker-grid">
                      {groupedFiltered[group.key].map((title) => {
                        const selected = selectedIds.has(Number(title.id));
                        return (
                          <button
                            key={title.id}
                            type="button"
                            className={`tierlist-picker-card${selected ? ' is-selected' : ''}`}
                            onClick={() => toggleTitle(Number(title.id), title)}
                            title={getDisplayName(title)}
                            aria-pressed={selected}
                          >
                            <div className="tierlist-picker-thumb">
                              <ArtworkImage entity={title} alt="" loading="lazy" />
                              {selected && <div className="tierlist-picker-check">{pick('เลือกแล้ว', 'Selected')}</div>}
                            </div>
                            <div className="tierlist-picker-card-body">
                              <div className="tierlist-picker-card-tags">
                                <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                                {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                                {isCharacterMode && title.role ? <span className="tierlist-chip">{title.role}</span> : null}
                              </div>
                              <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                              <span className="tierlist-picker-card-subtitle">
                                {isCharacterMode
                                  ? `${title.sourceTitleName || pick('ไม่ทราบเรื่องต้นทาง', 'Unknown source title')}${title.voice_actor_name ? ` • ${title.voice_actor_name}` : ''}`
                                  : getMetaLine(title)}
                              </span>
                              <small className="tierlist-picker-card-footnote">
                                {isCharacterMode
                                  ? pick('บรรทัดบนคือชื่อตัวละคร บรรทัดล่างคือชื่อเรื่องต้นทาง', 'Top line is the character name, bottom line is the source title')
                                  : getStatusLabel(title.status, pick)}
                              </small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {catalogTotalPages > 1 && (
                <div className="tierlist-picker-pagination">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={catalogPage <= 1}
                    onClick={() => setCatalogPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
                  </Button>
                  <span className="tierlist-picker-page-info">
                    {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={catalogPage >= catalogTotalPages}
                    onClick={() => setCatalogPage((p) => p + 1)}
                  >
                    {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default TierListCreatePage;
