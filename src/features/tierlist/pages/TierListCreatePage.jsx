import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
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
import { buildTrailerUrl, normalizeTrailer, parseTrailerUrl } from '@/shared/lib/trailers';
import '../styles/TierList.css';

const CUSTOM_YOUTUBE_TIMEOUT_MS = 5000;

async function fetchYoutubeVideoMetadata(url, timeoutMs = CUSTOM_YOUTUBE_TIMEOUT_MS) {
  const parsed = parseTrailerUrl(url);
  if (parsed?.site !== 'youtube' || !parsed?.videoId || typeof fetch !== 'function') {
    return null;
  }

  const watchUrl = buildTrailerUrl({ site: 'youtube', videoId: parsed.videoId }) || String(url || '').trim();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      signal: controller?.signal,
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return {
      title: String(payload?.title || '').trim(),
      authorName: String(payload?.author_name || '').trim(),
      thumbnailUrl: String(payload?.thumbnail_url || '').trim(),
    };
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

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
  const [isSubmittingCustomVideo, setIsSubmittingCustomVideo] = useState(false);
  const [category, setCategory] = useState('anime');
  const [entityType, setEntityType] = useState(TITLE_ENTITY_TYPE);
  const [songCreateMode, setSongCreateMode] = useState('catalog');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('popularity');
  const [statusFilter, setStatusFilter] = useState('all');
  const [titleQuery, setTitleQuery] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [customVideoDraft, setCustomVideoDraft] = useState({
    url: '',
    title: '',
    subtitle: '',
  });
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedEntityCache, setSelectedEntityCache] = useState(new Map());
  // Song-specific state
  const [browsingTitle, setBrowsingTitle] = useState(null);
  const [songEntityCache, setSongEntityCache] = useState(new Map());
  const [isSongsLoading, setIsSongsLoading] = useState(false);
  const [isAudienceSwitching, setIsAudienceSwitching] = useState(false);
  const catalogResponseCacheRef = useRef(new Map());
  const catalogRequestCacheRef = useRef(new Map());
  const previousCatalogPageRef = useRef(1);
  const pickerSectionRef = useRef(null);
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

  const scrollTierlistCatalogToTop = () => {
    if (typeof window === 'undefined' || !pickerSectionRef.current) {
      return;
    }

    const sectionTop = pickerSectionRef.current.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: Math.max(0, sectionTop - 16),
      behavior: 'smooth',
    });
  };

  const getCatalogRequestKey = ({
    nextEntityType,
    nextTypeFilter,
    nextQuery,
    nextSortBy,
    nextPage,
    nextShowAdult,
  }) => JSON.stringify({
    entityType: normalizeCatalogEntityType(nextEntityType),
    typeFilter: nextTypeFilter === 'all' ? 'all' : String(nextTypeFilter || ''),
    query: String(nextQuery || '').trim().toLowerCase(),
    sortBy: String(nextSortBy || 'popularity'),
    page: Math.max(1, Number(nextPage) || 1),
    showAdult: Boolean(nextShowAdult),
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
      setDebouncedQuery(titleQuery);
      setCatalogPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [titleQuery]);

  // Server-side paginated fetch for all entity types (title, character, song)
  useEffect(() => {
    let cancelled = false;
    const isCharMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
    const fetchFn = isCharMode ? getCharactersPage : getTitlesPage;
    const requestParams = {
      type: typeFilter === 'all' ? undefined : typeFilter,
      query: debouncedQuery,
      sortBy,
      page: catalogPage,
      pageSize: 30,
      showAdult,
    };
    const requestKey = getCatalogRequestKey({
      nextEntityType: entityType,
      nextTypeFilter: typeFilter,
      nextQuery: debouncedQuery,
      nextSortBy: sortBy,
      nextPage: catalogPage,
      nextShowAdult: showAdult,
    });
    const cachedResponse = catalogResponseCacheRef.current.get(requestKey);

    if (cachedResponse) {
      setPagedEntries(cachedResponse.items);
      setCatalogTotalPages(cachedResponse.totalPages);
      setCatalogTotal(cachedResponse.total);
      setIsLoading(false);
      setLoadError('');
    } else {
      setIsLoading(true);
      setLoadError('');
    }

    const activeRequest = catalogRequestCacheRef.current.get(requestKey)
      || fetchFn(requestParams);
    catalogRequestCacheRef.current.set(requestKey, activeRequest);

    activeRequest.then((result) => {
      if (cancelled) return;
      catalogResponseCacheRef.current.set(requestKey, result);
      setPagedEntries(result.items);
      setCatalogTotalPages(result.totalPages);
      setCatalogTotal(result.total);
      setIsLoading(false);

      const nextPage = Number(result.page || catalogPage) + 1;
      if (nextPage <= Number(result.totalPages || 1)) {
        const nextRequestKey = getCatalogRequestKey({
          nextEntityType: entityType,
          nextTypeFilter: typeFilter,
          nextQuery: debouncedQuery,
          nextSortBy: sortBy,
          nextPage,
          nextShowAdult: showAdult,
        });

        if (!catalogResponseCacheRef.current.has(nextRequestKey) && !catalogRequestCacheRef.current.has(nextRequestKey)) {
          const prefetchPromise = fetchFn({
            ...requestParams,
            page: nextPage,
          })
            .then((nextResult) => {
              catalogResponseCacheRef.current.set(nextRequestKey, nextResult);
              return nextResult;
            })
            .finally(() => {
              catalogRequestCacheRef.current.delete(nextRequestKey);
            });

          catalogRequestCacheRef.current.set(nextRequestKey, prefetchPromise);
        }
      }
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลดแคตตาล็อกสำหรับสร้างเทมเพลตไม่สำเร็จ', 'Failed to load the catalog for template creation'));
      setIsLoading(false);
    }).finally(() => {
      catalogRequestCacheRef.current.delete(requestKey);
    });
    return () => { cancelled = true; };
  }, [entityType, typeFilter, debouncedQuery, sortBy, catalogPage, showAdult, pick]);

  useEffect(() => {
    if (previousCatalogPageRef.current !== catalogPage) {
      scrollTierlistCatalogToTop();
      previousCatalogPageRef.current = catalogPage;
    }
  }, [catalogPage]);

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

  const handleCustomVideoDraftChange = (field, value) => {
    setCustomVideoDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCreateCustomVideo = async () => {
    const rawUrl = String(customVideoDraft.url || '').trim();
    if (!rawUrl) {
      toast.error(pick('วางลิงก์ YouTube ก่อน', 'Paste a YouTube link first'));
      return;
    }

    const parsed = parseTrailerUrl(rawUrl);
    if (parsed?.site !== 'youtube' || !parsed?.videoId) {
      toast.error(pick('ตอนนี้รองรับลิงก์ YouTube สำหรับ tierlist เพลงก่อน', 'For now, tierlist link import supports YouTube links in song mode'));
      return;
    }

    setIsSubmittingCustomVideo(true);
    try {
      const youtubeMetadata = await fetchYoutubeVideoMetadata(rawUrl);
      const normalizedTrailer = normalizeTrailer({ trailer_url: rawUrl });
      const title = String(customVideoDraft.title || '').trim() || youtubeMetadata?.title || `YouTube ${parsed.videoId}`;
      const subtitle = String(customVideoDraft.subtitle || '').trim()
        || (youtubeMetadata?.authorName ? `YouTube · ${youtubeMetadata.authorName}` : 'YouTube');
      const imageUrl = youtubeMetadata?.thumbnailUrl || normalizedTrailer?.thumbnailUrl || '';

      if (!imageUrl) {
        toast.error(pick('ลิงก์นี้ยังสร้างภาพตัวอย่างไม่ได้ ลองเปลี่ยนลิงก์อีกอัน', 'This link could not produce a preview image. Try another YouTube URL.'));
        return;
      }

      const customId = -(Date.now() + Math.floor(Math.random() * 1000));
      const item = {
        id: customId,
        title,
        subtitle,
        imageUrl,
        sourceUrl: normalizedTrailer?.watchUrl || rawUrl,
        videoUrl: normalizedTrailer?.watchUrl || rawUrl,
        artistName: youtubeMetadata?.authorName || '',
        themeLabel: 'YouTube',
        entityType: THEME_SONG_ENTITY_TYPE,
        trailerSite: normalizedTrailer?.site || 'youtube',
        trailerVideoId: normalizedTrailer?.videoId || parsed.videoId,
        trailerThumbnailUrl: imageUrl,
      };

      setCustomItems((prev) => [...prev, item]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(Number(item.id));
        return next;
      });
      setSelectedEntityCache((prev) => {
        const next = new Map(prev);
        next.set(Number(item.id), toCustomTierEntity(item, THEME_SONG_ENTITY_TYPE));
        return next;
      });
      setCustomVideoDraft({
        url: '',
        title: '',
        subtitle: '',
      });
      toast.success(pick('เพิ่มลิงก์ YouTube เข้า pool แล้ว', 'Added YouTube link to the pool'));
    } catch {
      toast.error(pick('เพิ่มลิงก์ YouTube ไม่สำเร็จ', 'Could not add this YouTube link'));
    } finally {
      setIsSubmittingCustomVideo(false);
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
          sourceUrl: entry.source_url || entry.video_url || '',
          videoUrl: entry.video_url || entry.source_url || '',
          artistName: entry.artist_name || '',
          themeLabel: entry.theme_label || entry.role || '',
          entityType: normalizeCatalogEntityType(entry.entityType || entityType),
          trailerSite: entry.trailer_site || '',
          trailerVideoId: entry.trailer_video_id || '',
          trailerThumbnailUrl: entry.trailer_thumbnail_url || entry.cover || entry.image_url || '',
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
    const isYoutubeMode = nextValue === 'youtube_song';
    const nextType = isYoutubeMode ? THEME_SONG_ENTITY_TYPE : normalizeCatalogEntityType(nextValue);
    setEntityType(nextType);
    setSongCreateMode(isYoutubeMode ? 'youtube' : nextType === THEME_SONG_ENTITY_TYPE ? 'catalog' : 'catalog');
    setSelectedIds(new Set());
    setSelectedEntityCache(new Map());
    setBrowsingTitle(null);
    setCategory(nextType === CHARACTER_ENTITY_TYPE ? 'characters' : nextType === THEME_SONG_ENTITY_TYPE ? 'songs' : 'anime');
    resetCreateFilters();
  };

  const handleCatalogEntityTypeChange = (nextValue) => {
    const nextType = normalizeCatalogEntityType(nextValue);
    setEntityType(nextType);
    setSongCreateMode(nextType === THEME_SONG_ENTITY_TYPE ? 'catalog' : 'catalog');
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
        songCreateMode={songCreateMode}
        pick={pick}
      />

      <TierListCreateToolbar
        category={category}
        coverFileInputRef={coverFileInputRef}
        coverImageUrl={coverImageUrl}
        coverStageRef={coverStageRef}
        customItemsCount={customItems.length}
        customVideoDraft={customVideoDraft}
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
        isSubmittingCustomVideo={isSubmittingCustomVideo}
        isUploadingCover={isUploadingCover}
        isUploadingPoolItems={isUploadingPoolItems}
        minimumRequired={minimumRequired}
        onCustomVideoDraftChange={handleCustomVideoDraftChange}
        onCatalogEntityTypeChange={handleCatalogEntityTypeChange}
        onCategoryChange={setCategory}
        onCloseCoverEditor={closeCoverEditor}
        onCreateCustomVideo={handleCreateCustomVideo}
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
      {isSongMode && songCreateMode !== 'youtube' ? (
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
          sectionRef={pickerSectionRef}
          selectedIds={selectedIds}
          songEntityCache={songEntityCache}
          songQuery={songQuery}
          sortBy={sortBy}
          titleQuery={titleQuery}
          typeFilter={typeFilter}
        />
      ) : isSongMode && songCreateMode === 'youtube' ? (
        <section className="container tierlist-section" ref={pickerSectionRef}>
          <TierListEmptyPanel
            icon={<Link2 size={28} />}
            title={pick('โหมด YouTube พร้อมแล้ว', 'YouTube mode is ready')}
            message={pick('เพิ่มลิงก์ YouTube จากแผงด้านบนได้เลย รายการที่เพิ่มจะเข้า pool ทันที แล้วค่อยกด Create & Play เมื่อครบตามที่ต้องการ', 'Add YouTube links from the panel above. Each link goes straight into the pool, then hit Create & Play when you have enough items.')}
          />
        </section>
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
          sectionRef={pickerSectionRef}
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
