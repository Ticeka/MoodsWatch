import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Globe, Layers, Lock, Music, Play, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
  fetchBattleCharactersPage,
  fetchBattleTitleBySlug,
  fetchBattleTitleFacets,
  fetchBattleTrailersPage,
  fetchBattleTitlesPage,
  fetchBattleThemeSongsPage,
  hydrateBattleEntriesByIds,
} from '@/features/battle/api/battleCatalogApi';
import {
  createBattleSession,
  createStoredBattleDeck,
  getStoredBattleDecks,
  incrementStoredBattleDeckPlayCount,
  saveBattleSession,
  saveStoredBattleDeck,
} from '@/features/battle/lib/battleStore';
import {
  deleteRemotePublicBattleDeck,
  incrementRemotePublicBattleDeckPlayCount,
  persistRemoteBattleSession,
  persistRemotePublicBattleDeck,
} from '@/features/battle/api/battleRemoteApi';
import { fetchBattleTitleThemeSongs } from '@/features/battle/api/battleThemeSongsApi';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  buildThemeSongEntity,
  getCatalogEntityMeta,
  getCatalogEntityName,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { normalizeTrailer } from '@/shared/lib/trailers';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import '../styles/Battle.css';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All entries' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];
const ENTITY_TYPE_OPTIONS = [
  { value: TITLE_ENTITY_TYPE, label: 'Titles' },
  { value: CHARACTER_ENTITY_TYPE, label: 'Characters' },
  { value: THEME_SONG_ENTITY_TYPE, label: 'Songs' },
  { value: TRAILER_ENTITY_TYPE, label: 'Trailers' },
];
const SIZE_OPTIONS = [8, 16, 24, 32, 48];
const BATTLE_CATALOG_PAGE_SIZE = 6;
const TITLE_DRAG_MIME = 'application/x-battle-title-id';
const SLOT_DRAG_MIME = 'application/x-battle-slot-index';
const EMPTY_FILTER_OPTIONS = {
  genres: [],
  tags: [],
  moods: [],
  trailerProviders: [],
};

function getDisplayName(title) { return getCatalogEntityName(title); }
function getMetaLine(title) { return getCatalogEntityMeta(title); }

function getEntryUnitLabel(entityType, options = {}) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) return options.singular ? 'character' : 'characters';
  if (normalized === THEME_SONG_ENTITY_TYPE) return options.singular ? 'song' : 'songs';
  return options.singular ? 'title' : 'titles';
}

function getAnyTypeLabel(entityType) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) return 'All characters';
  if (normalized === THEME_SONG_ENTITY_TYPE) return 'All songs';
  return 'All titles';
}

function formatTrailerProviderLabel(provider, t) {
  const normalized = normalizeBattleText(provider);
  if (!normalized) return t('battle.trailerPlatformUnknown');
  if (normalized === 'youtube') return 'YouTube';
  if (normalized === 'dailymotion') return 'Dailymotion';
  if (normalized === 'external') return t('battle.trailerPlatformExternal');
  return provider[0].toUpperCase() + provider.slice(1);
}

function getBattleSongRoleLabel(title) {
  return title?.theme_label || title?.role || 'Theme song';
}

function hasBattleMedia(title) {
  if (isThemeSongEntity(title)) return Boolean(title?.video_url);
  return Boolean(normalizeTrailer(title || {}));
}

function getBattleTrailerBadge(title, t) {
  const trailer = normalizeTrailer(title || {});
  if (!trailer) return { tone: 'missing', label: t('battle.trailerNone') };
  return {
    tone: 'ready',
    label: t('battle.trailerProviderBadge', {
      provider: formatTrailerProviderLabel(trailer.provider || trailer.site || '', t),
    }),
  };
}

function getBattleEntryBadges(title, t, options = {}) {
  if (!title) return [];
  if (isThemeSongEntity(title)) {
    const badges = [
      { tone: 'song', label: getBattleSongRoleLabel(title) },
      { tone: title.video_url ? 'ready' : 'missing', label: title.video_url ? 'Preview ready' : 'No preview' },
    ];
    if (!options.compact && title.episodes_text) badges.push({ tone: 'default', label: title.episodes_text });
    if (!options.compact && title.is_creditless) badges.push({ tone: 'song', label: 'Creditless' });
    if (!options.compact && title.is_spoiler) badges.push({ tone: 'warning', label: 'Spoiler' });
    if (!options.compact && title.is_nsfw) badges.push({ tone: 'warning', label: 'NSFW' });
    return badges;
  }
  const trailerBadge = getBattleTrailerBadge(title, t);
  return trailerBadge ? [trailerBadge] : [];
}

function countBattleReadyMedia(titles = []) {
  return (titles || []).filter((title) => hasBattleMedia(title)).length;
}

function getActiveBattleFilterSummary(filters, t) {
  const items = [];
  if (filters.type && filters.type !== 'all') items.push(filters.type[0].toUpperCase() + filters.type.slice(1));
  if (filters.tag) items.push(`#${filters.tag}`);
  if (filters.mood) items.push(filters.mood);
  if (filters.query) items.push(`"${filters.query}"`);
  if (filters.trailerState === 'has') items.push(t('battle.trailerHas'));
  else if (filters.trailerState === 'none') items.push(t('battle.trailerNone'));
  if (filters.trailerProvider && filters.trailerProvider !== 'all') {
    items.push(t('battle.trailerProviderBadge', {
      provider: formatTrailerProviderLabel(filters.trailerProvider, t),
    }));
  }
  return items;
}

function normalizeBattleText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildEmptyDeckSlots(size) {
  return Array.from({ length: size }, () => null);
}

function createManualBattleDeck({ filters, deckName, deckSlots, sourceCount }) {
  const titles = deckSlots.filter(Boolean);
  const entityType = normalizeCatalogEntityType(filters.entityType);
  const normalizedFilters = { ...filters, entityType, size: deckSlots.length };
  return {
    key: JSON.stringify({ ...normalizedFilters, titleIds: titles.map((title) => title.id) }),
    fingerprint: titles.map((title) => Number(title?.id)).filter(Boolean).sort((a, b) => a - b).join(':'),
    label: deckName.trim() || `Custom ${getEntryUnitLabel(entityType, { singular: true })} deck ${titles.length}/${deckSlots.length}`,
    filters: normalizedFilters,
    sourceCount,
    titles,
  };
}


function BattleSlotCardSkeleton() {
  return (
    <div className="battle-slot-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ width: '44px', height: '60px', borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '72%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.75rem', width: '46%' }} />
      </div>
    </div>
  );
}

function BattleCatalogCardSkeleton() {
  return (
    <div className="battle-catalog-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ width: '50px', height: '70px', borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '76%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.75rem', width: '50%' }} />
      </div>
      <div className="battle-skeleton-block" style={{ width: '72px', height: '30px', borderRadius: '8px', flexShrink: 0 }} />
    </div>
  );
}

export function BattleBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [songCatalogError, setSongCatalogError] = useState('');
  const [remoteFilterOptions, setRemoteFilterOptions] = useState(EMPTY_FILTER_OPTIONS);
  const [deckName, setDeckName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [filters, setFilters] = useState({
    entityType: TITLE_ENTITY_TYPE,
    type: 'all',
    tag: '',
    mood: '',
    query: '',
    trailerState: 'all',
    trailerProvider: 'all',
    size: 16,
  });
  const [deckSlots, setDeckSlots] = useState(() => buildEmptyDeckSlots(16));
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [editingDeck, setEditingDeck] = useState(null);
  const [hasLoadedEditDeck, setHasLoadedEditDeck] = useState(false);
  const deferredFilters = useDeferredValue(filters);
  const editDeckId = searchParams.get('deckId');
  const songTitleSlug = searchParams.get('songTitleSlug');
  const normalizedHiddenTitleIds = useMemo(
    () => [...new Set((hiddenTitleIds || []).map(Number).filter(Boolean))],
    [hiddenTitleIds]
  );
  const isCharacterEntity = filters.entityType === CHARACTER_ENTITY_TYPE;
  const isSongEntity = filters.entityType === THEME_SONG_ENTITY_TYPE;
  const isTrailerEntity = filters.entityType === TRAILER_ENTITY_TYPE;
  const usesRemoteCatalog = true;

  // Song battle mode: auto-fetch songs for a title and start a battle session
  useEffect(() => {
    if (!songTitleSlug) return undefined;
    let cancelled = false;

    async function startSongBattle() {
      setIsLoading(true);
      setError('');
      try {
        const sourceTitle = await fetchBattleTitleBySlug(songTitleSlug);
        if (cancelled) return;
        if (!sourceTitle) {
          setError('ไม่พบชื่อเรื่องนี้ / Title not found');
          setIsLoading(false);
          return;
        }

        const songData = await fetchBattleTitleThemeSongs(sourceTitle.id);

        if (cancelled) return;
        if (!songData || songData.length < 2) {
          setError('เพลงไม่เพียงพอสำหรับ Battle (ต้องมีอย่างน้อย 2 เพลง) / Not enough songs for battle (need at least 2)');
          setIsLoading(false);
          return;
        }

        const songEntities = songData.map((song) => buildThemeSongEntity(song, sourceTitle));
        const titleName = sourceTitle.title_th || sourceTitle.title_en || sourceTitle.title_native || 'Songs';
        const deck = {
          key: `song-battle:${sourceTitle.id}`,
          fingerprint: songEntities.map((s) => s.id).sort((a, b) => a - b).join(':'),
          label: `เพลงจาก ${titleName}`,
          filters: { entityType: THEME_SONG_ENTITY_TYPE, size: songEntities.length },
          titles: songEntities,
          sourceCount: songEntities.length,
        };

        let session = saveBattleSession(createBattleSession(deck, {}));
        if (user?.id) {
          try {
            session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
          } catch (saveError) {
            console.warn('Failed to persist song battle session remotely', saveError);
          }
        }
        if (!cancelled) {
          navigate(`/battle/${session.id}`);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to start song battle');
          setIsLoading(false);
        }
      }
    }

    startSongBattle();
    return () => { cancelled = true; };
  }, [songTitleSlug, user?.id, navigate]);

  useEffect(() => {
    if (songTitleSlug || (filters.entityType !== TITLE_ENTITY_TYPE && filters.entityType !== CHARACTER_ENTITY_TYPE && filters.entityType !== TRAILER_ENTITY_TYPE)) {
      return undefined;
    }

    let cancelled = false;

    async function loadTitleFacets() {
      try {
        const nextFacets = await fetchBattleTitleFacets({
          showAdult,
          hiddenTitleIds: normalizedHiddenTitleIds,
        });
        if (!cancelled) {
          setRemoteFilterOptions(nextFacets);
        }
      } catch (facetError) {
        if (!cancelled) {
          console.warn('Failed to load battle title facets:', facetError);
          setRemoteFilterOptions(EMPTY_FILTER_OPTIONS);
        }
      }
    }

    loadTitleFacets();
    return () => { cancelled = true; };
  }, [filters.entityType, normalizedHiddenTitleIds, showAdult, songTitleSlug]);

  useEffect(() => {
    if (songTitleSlug || !usesRemoteCatalog) {
      setCatalogRows([]);
      setCatalogTotal(0);
      setIsCatalogLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadRemoteCatalog() {
      setIsCatalogLoading(true);
      setError('');
      setSongCatalogError('');
      try {
        const params = {
          showAdult,
          hiddenTitleIds: normalizedHiddenTitleIds,
          page: catalogPage,
          pageSize: BATTLE_CATALOG_PAGE_SIZE,
        };
        const result = isSongEntity
          ? await fetchBattleThemeSongsPage({
              ...params,
              query: deferredFilters.query || '',
            })
          : isCharacterEntity
            ? await fetchBattleCharactersPage({
                ...params,
                type: deferredFilters.type || 'all',
                tag: deferredFilters.tag || '',
                mood: deferredFilters.mood || '',
                query: deferredFilters.query || '',
              })
          : isTrailerEntity
            ? await fetchBattleTrailersPage({
                ...params,
                type: deferredFilters.type || 'all',
                tag: deferredFilters.tag || '',
                mood: deferredFilters.mood || '',
                query: deferredFilters.query || '',
                trailerProvider: deferredFilters.trailerProvider || 'all',
              })
          : await fetchBattleTitlesPage({
              ...params,
              type: deferredFilters.type || 'all',
              tag: deferredFilters.tag || '',
              mood: deferredFilters.mood || '',
              query: deferredFilters.query || '',
              trailerState: deferredFilters.trailerState || 'all',
              trailerProvider: deferredFilters.trailerProvider || 'all',
            });

        if (!cancelled) {
          setCatalogRows(result.rows || []);
          setCatalogTotal(Number(result.total || 0));
        }
      } catch (loadError) {
        if (!cancelled) {
          if (isSongEntity) {
            setSongCatalogError(loadError.message || 'Failed to load songs catalog');
          } else {
            setError(loadError.message || t('battle.loadCatalogFailed'));
          }
        }
      } finally {
        if (!cancelled) {
          setIsCatalogLoading(false);
        }
      }
    }

    loadRemoteCatalog();
    return () => { cancelled = true; };
  }, [catalogPage, deferredFilters, isCharacterEntity, isSongEntity, isTrailerEntity, normalizedHiddenTitleIds, showAdult, songTitleSlug, t, usesRemoteCatalog]);

  const filteredCatalogTitles = catalogRows;
  const visibleCatalogCount = catalogTotal;
  const filteredCatalogCount = catalogTotal;
  const hiddenExcludedCount = 0;
  const totalCatalogPages = Math.max(1, Math.ceil(catalogTotal / BATTLE_CATALOG_PAGE_SIZE));
  const previewCatalogTitles = catalogRows;
  const filterOptions = useMemo(() => {
    if (isSongEntity) {
      return EMPTY_FILTER_OPTIONS;
    }
    return remoteFilterOptions;
  }, [isSongEntity, remoteFilterOptions]);
  const tagOptions = useMemo(
    () => [...new Set([...filterOptions.genres, ...filterOptions.tags])].slice(0, 80),
    [filterOptions.genres, filterOptions.tags]
  );
  const trailerProviderOptions = useMemo(() => filterOptions.trailerProviders || [], [filterOptions.trailerProviders]);
  const battleDeck = useMemo(
    () => createManualBattleDeck({ filters, deckName, deckSlots, sourceCount: filteredCatalogCount }),
    [deckName, deckSlots, filteredCatalogCount, filters]
  );
  const selectedTitleIds = useMemo(
    () => new Set(deckSlots.filter(Boolean).map((title) => title.id)),
    [deckSlots]
  );
  const filledSlotCount = battleDeck.titles.length;
  const filteredReadyMediaCount = useMemo(() => countBattleReadyMedia(filteredCatalogTitles), [filteredCatalogTitles]);
  const deckReadyMediaCount = useMemo(() => countBattleReadyMedia(battleDeck.titles), [battleDeck.titles]);
  const activeFilterSummary = useMemo(() => getActiveBattleFilterSummary(filters, t), [filters, t]);
  const catalogError = error || (isSongEntity ? songCatalogError : '');
  const isCatalogBusy = isLoading || isCatalogLoading;
  const mediaResultsLabel = isSongEntity ? 'Songs with preview' : t('battle.trailersInResults');
  const mediaDeckLabel = isSongEntity ? 'Songs with preview in deck' : t('battle.trailersInDeck');
  const firstEmptySlotIndex = useMemo(() => deckSlots.findIndex((title) => !title), [deckSlots]);
  const titleById = useMemo(
    () => new Map(previewCatalogTitles.map((title) => [String(title.id), title])),
    [previewCatalogTitles]
  );
  useEffect(() => {
    if (!editDeckId) { setEditingDeck(null); setHasLoadedEditDeck(false); return; }
    const stored = getStoredBattleDecks().find((deck) => deck.id === editDeckId) || null;
    setEditingDeck(stored);
    setHasLoadedEditDeck(false);
  }, [editDeckId]);

  useEffect(() => {
    if (!editingDeck || hasLoadedEditDeck) return undefined;
    let cancelled = false;

    async function hydrateEditDeck() {
      const nextSize = Number(editingDeck.filters?.size || editingDeck.titles?.length || 16);
      const normalizedSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 16;
      const entityType = normalizeCatalogEntityType(editingDeck.filters?.entityType);
      const nextFilters = {
        entityType,
        type: editingDeck.filters?.type || 'all',
        tag: editingDeck.filters?.tag || '',
        mood: editingDeck.filters?.mood || '',
        query: editingDeck.filters?.query || '',
        trailerState: editingDeck.filters?.trailerState || 'all',
        trailerProvider: editingDeck.filters?.trailerProvider || 'all',
        size: normalizedSize,
      };
      const nextSlots = buildEmptyDeckSlots(normalizedSize);
      const deckTitles = editingDeck.titles || [];
      let hydratedEntries = [];

      try {
        hydratedEntries = await hydrateBattleEntriesByIds(deckTitles.map((title) => title?.id), entityType);
      } catch (error) {
        console.warn('Failed to hydrate battle deck entries from RPC, falling back to stored snapshots.', error);
      }

      if (cancelled) return;

      const hydratedById = new Map(hydratedEntries.map((entry) => [String(entry.id), entry]));
      deckTitles.forEach((title, index) => {
        const resolved = hydratedById.get(String(title.id)) || title;
        if (index < nextSlots.length) nextSlots[index] = resolved;
      });

      setDeckName(editingDeck.label || '');
      setIsPublic(Boolean(editingDeck.isPublic));
      setFilters(nextFilters);
      setDeckSlots(nextSlots);
      setActiveSlotIndex(0);
      setHasLoadedEditDeck(true);
    }

    hydrateEditDeck();
    return () => { cancelled = true; };
  }, [editingDeck, hasLoadedEditDeck]);

  useEffect(() => {
    setDeckSlots((current) => {
      if (current.length === filters.size) return current;
      const next = current.slice(0, filters.size);
      while (next.length < filters.size) next.push(null);
      return next;
    });
  }, [filters.size]);

  useEffect(() => {
    if (activeSlotIndex >= deckSlots.length) setActiveSlotIndex(Math.max(0, deckSlots.length - 1));
  }, [activeSlotIndex, deckSlots.length]);

  useEffect(() => { setCatalogPage(0); }, [deferredFilters, filters.entityType, showAdult]);

  useEffect(() => {
    if (catalogPage > totalCatalogPages - 1) setCatalogPage(Math.max(0, totalCatalogPages - 1));
  }, [catalogPage, totalCatalogPages]);

  const assignTitleToSlot = (title, preferredIndex = 0) => {
    if (!title) return false;
    const existingIndex = deckSlots.findIndex((entry) => entry?.id === title.id);
    if (existingIndex >= 0) { setActiveSlotIndex(existingIndex); return true; }
    const normalizedIndex = Math.min(Math.max(preferredIndex, 0), deckSlots.length - 1);
    const candidateIndexes = [normalizedIndex, ...deckSlots.map((_, i) => i).filter((i) => i !== normalizedIndex)];
    const emptyIndex = candidateIndexes.find((i) => !deckSlots[i]);
    if (emptyIndex == null) { toast.error(t('battle.deckFull')); return false; }
    setDeckSlots((current) => current.map((entry, i) => (i === emptyIndex ? title : entry)));
    setActiveSlotIndex(emptyIndex);
    return true;
  };

  const handleAutoFillDeck = async () => {
    try {
      let nextCatalogTitles = filteredCatalogTitles;

      if (usesRemoteCatalog) {
        const collected = [];
        let nextPage = 0;

        while (collected.length < filters.size) {
          const params = {
            showAdult,
            hiddenTitleIds: normalizedHiddenTitleIds,
            page: nextPage,
            pageSize: Math.min(Math.max(filters.size, BATTLE_CATALOG_PAGE_SIZE), 48),
          };
          const result = isSongEntity
            ? await fetchBattleThemeSongsPage({
                ...params,
                query: filters.query || '',
              })
            : isCharacterEntity
              ? await fetchBattleCharactersPage({
                  ...params,
                  type: filters.type || 'all',
                  tag: filters.tag || '',
                  mood: filters.mood || '',
                  query: filters.query || '',
                })
            : isTrailerEntity
              ? await fetchBattleTrailersPage({
                  ...params,
                  type: filters.type || 'all',
                  tag: filters.tag || '',
                  mood: filters.mood || '',
                  query: filters.query || '',
                  trailerProvider: filters.trailerProvider || 'all',
                })
            : await fetchBattleTitlesPage({
                ...params,
                type: filters.type || 'all',
                tag: filters.tag || '',
                mood: filters.mood || '',
                query: filters.query || '',
                  trailerState: filters.trailerState || 'all',
                  trailerProvider: filters.trailerProvider || 'all',
                });

          const rows = result.rows || [];
          collected.push(...rows);
          if (rows.length === 0 || collected.length >= Number(result.total || 0)) {
            break;
          }
          nextPage += 1;
        }

        nextCatalogTitles = collected;
      }

      const nextSlots = buildEmptyDeckSlots(filters.size);
      nextCatalogTitles.slice(0, filters.size).forEach((title, i) => { nextSlots[i] = title; });
      setDeckSlots(nextSlots);
      setActiveSlotIndex(0);
    } catch (fillError) {
      toast.error(fillError?.message || t('battle.loadCatalogFailed'));
    }
  };

  const handleClearDeck = () => { setDeckSlots(buildEmptyDeckSlots(filters.size)); setActiveSlotIndex(0); };

  const handleEntityTypeChange = (nextEntityType) => {
    const normalizedEntityType = normalizeCatalogEntityType(nextEntityType);
    setFilters((current) => ({
      ...current, entityType: normalizedEntityType, type: 'all', tag: '', mood: '', query: '', trailerState: 'all', trailerProvider: 'all',
    }));
    setDeckSlots(buildEmptyDeckSlots(filters.size));
    setActiveSlotIndex(0);
    setCatalogPage(0);
  };

  const handleRemoveFromSlot = (slotIndex) => {
    setDeckSlots((current) => current.map((entry, i) => (i === slotIndex ? null : entry)));
    setActiveSlotIndex(slotIndex);
  };

  const handleDropOnSlot = (event, slotIndex) => {
    event.preventDefault();
    setDragOverSlotIndex(null);
    const draggedSlotIndex = event.dataTransfer.getData(SLOT_DRAG_MIME);
    if (draggedSlotIndex !== '') {
      const sourceIndex = Number(draggedSlotIndex);
      if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < deckSlots.length && sourceIndex !== slotIndex) {
        setDeckSlots((current) => {
          const next = [...current];
          [next[sourceIndex], next[slotIndex]] = [next[slotIndex], next[sourceIndex]];
          return next;
        });
        return;
      }
    }
    const titleId = event.dataTransfer.getData(TITLE_DRAG_MIME);
    if (titleId) {
      const title = titleById.get(titleId);
      if (title) {
        setDeckSlots((current) => current.map((entry, i) => (i === slotIndex ? title : entry)));
        setActiveSlotIndex(slotIndex);
      }
    }
  };

  const saveDeck = async ({ startAfterSave = false } = {}) => {
    if (battleDeck.titles.length < 8) {
      toast.error(`Only ${battleDeck.titles.length} ${getEntryUnitLabel(filters.entityType)} match right now.`);
      return;
    }
    if (isPublic && !user?.id) { toast.error(t('battle.loginToPublishDeck')); return; }
    setIsSaving(true);
    try {
      const baseDeck = createStoredBattleDeck({ ...battleDeck, label: deckName.trim() || battleDeck.label, isPublic });
      let storedDeck = saveStoredBattleDeck({
        ...baseDeck,
        id: editingDeck?.id || baseDeck.id,
        createdAt: editingDeck?.createdAt || baseDeck.createdAt,
        playCount: editingDeck?.playCount ?? baseDeck.playCount,
      });
      if (editingDeck?.isPublic && !storedDeck.isPublic && user?.id) {
        try { await deleteRemotePublicBattleDeck(user.id, storedDeck.id); } catch (e) { console.warn(e); }
      }
      if (storedDeck.isPublic && user?.id) {
        try {
          await persistRemotePublicBattleDeck(user, storedDeck);
        } catch (publishError) {
          console.warn('Failed to persist public battle deck remotely', publishError);
          storedDeck = saveStoredBattleDeck({ ...storedDeck, isPublic: false });
          toast.error(t('battle.publishDeckFailed'));
        }
      }
      if (startAfterSave) {
        if (storedDeck?.id) {
          storedDeck = incrementStoredBattleDeckPlayCount(storedDeck.id) || storedDeck;
          if (storedDeck.isPublic) {
            incrementRemotePublicBattleDeckPlayCount(storedDeck.id);
          }
        }

        let session = saveBattleSession(createBattleSession(storedDeck, {
          catalogCount: visibleCatalogCount,
          hiddenExcludedCount,
          excludesAdultContent: !showAdult,
        }));
        if (user?.id) {
          try {
            session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
          } catch (saveError) {
            console.warn('Failed to persist battle session remotely', saveError);
            toast.error(t('battle.startAfterSaveFailed'));
          }
        }
        toast.success(t('battle.deckSavedAndStarted'));
        navigate(`/battle/${session.id}`);
        return;
      }
      toast.success(t('battle.deckSaved'));
      navigate(storedDeck.isPublic ? '/battle' : '/battle/decks');
    } finally {
      setIsSaving(false);
    }
  };

  if (songTitleSlug) {
    return (
      <div className="battle-page">
        <section className="container battle-section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div className="glass-heavy battle-empty-state">
              <Music size={28} style={{ opacity: 0.4 }} />
              <strong>{error}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                ← กลับ / Back
              </button>
            </div>
          ) : (
            <div className="glass-heavy battle-empty-state">
              <Music size={28} style={{ opacity: 0.6 }} />
              <strong>กำลังเตรียม Song Battle... / Preparing Song Battle...</strong>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="battle-page">
      <section className="container battle-hero battle-builder-hero">
        <div className="battle-hero-copy">
          <span className="battle-kicker"><Wand2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.builderKicker')}</span>
          <h1><Sparkles size={18} style={{ display: 'inline', color: 'var(--primary-500)', verticalAlign: 'middle', marginRight: '0.28rem' }} /> {t('battle.builderHeroTitle')}</h1>
          <p>{t('battle.builderHeroSubtitle')}</p>
        </div>
        <div className="battle-hero-panel glass-heavy">
          <div className="battle-hero-stat">
            <strong>{filledSlotCount}</strong>
            <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {getEntryUnitLabel(filters.entityType)} in deck</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{visibleCatalogCount}</strong>
            <span><Play size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> visible {getEntryUnitLabel(filters.entityType)}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{hiddenExcludedCount}</strong>
            <span><Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.excludedByVisibility')}</span>
          </div>
        </div>
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.buildDeckTitle')}</h2>
          <p>{t('battle.buildDeckHint')}</p>
        </div>

        <div className="battle-builder-stack">
          <div className="battle-builder-toolbar glass-heavy">
            <label className="battle-field">
              <span>{t('battle.deckName')}</span>
              <input value={deckName} onChange={(event) => setDeckName(event.target.value)} placeholder={t('battle.deckNamePlaceholder')} />
            </label>

            <label className="battle-field battle-checkbox-field">
              <span>{t('battle.visibility')}</span>
              <button type="button" className={`battle-visibility-toggle ${isPublic ? 'is-public' : 'is-private'}`} onClick={() => setIsPublic((current) => !current)} aria-pressed={isPublic}>
                <span className="battle-visibility-toggle-copy">
                  {isPublic ? <Globe size={15} /> : <Lock size={15} />}
                  <strong>{isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}</strong>
                </span>
              </button>
            </label>

            <label className="battle-field">
              <span>Catalog</span>
              <select value={filters.entityType} onChange={(event) => handleEntityTypeChange(event.target.value)}>
                {ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.type')}</span>
              <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))} disabled={isSongEntity}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.value === 'all' ? getAnyTypeLabel(filters.entityType) : option.label}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span><Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.tagGenre')}</span>
              <select value={filters.tag} onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))} disabled={isSongEntity}>
                <option value="">{t('battle.anyTagGenre')}</option>
                {tagOptions.map((value) => (<option key={value} value={value}>{value}</option>))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.mood')}</span>
              <select value={filters.mood} onChange={(event) => setFilters((current) => ({ ...current, mood: event.target.value }))} disabled={isSongEntity}>
                <option value="">{t('battle.anyMood')}</option>
                {filterOptions.moods.map((mood) => (<option key={mood} value={mood}>{mood}</option>))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.search')}</span>
              <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder={t('battle.searchPlaceholder')} />
            </label>

            <label className="battle-field">
              <span>{t('battle.trailerStatus')}</span>
              <select
                value={filters.trailerState}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  trailerState: event.target.value,
                  trailerProvider: event.target.value === 'none' ? 'all' : current.trailerProvider,
                }))}
                disabled={filters.entityType !== TITLE_ENTITY_TYPE}
              >
                <option value="all">{t('battle.anyTrailerStatus')}</option>
                <option value="has">{t('battle.trailerHas')}</option>
                <option value="none">{t('battle.trailerNone')}</option>
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.trailerPlatform')}</span>
              <select
                value={filters.trailerProvider}
                onChange={(event) => setFilters((current) => ({ ...current, trailerProvider: event.target.value }))}
                disabled={(filters.entityType !== TITLE_ENTITY_TYPE && filters.entityType !== TRAILER_ENTITY_TYPE) || filters.trailerState === 'none'}
              >
                <option value="all">{t('battle.anyTrailerPlatform')}</option>
                {trailerProviderOptions.map((provider) => (
                  <option key={provider} value={provider}>{formatTrailerProviderLabel(provider, t)}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.deckSize')}</span>
              <select value={filters.size} onChange={(event) => setFilters((current) => ({ ...current, size: Number(event.target.value) }))}>
                {SIZE_OPTIONS.map((value) => (<option key={value} value={value}>{value} {getEntryUnitLabel(filters.entityType)}</option>))}
              </select>
            </label>

            <div className="battle-builder-actions battle-builder-toolbar-actions">
              <Button variant="ghost" onClick={handleAutoFillDeck} disabled={isCatalogBusy || Boolean(catalogError) || filteredCatalogCount === 0}>{t('battle.fillFromFilters')}</Button>
              <Button variant="ghost" onClick={handleClearDeck} disabled={isLoading}>{t('battle.clearDeck')}</Button>
              <Link className="btn btn-ghost" to="/battle">{t('battle.backToBattle')}</Link>
              <Button variant="secondary" onClick={() => saveDeck()} disabled={isCatalogBusy || isSaving || Boolean(catalogError)}>{t('battle.saveDeck')}</Button>
              <Button onClick={() => saveDeck({ startAfterSave: true })} disabled={isCatalogBusy || isSaving || Boolean(catalogError)}>{t('battle.saveAndStart')}</Button>
            </div>
          </div>

          <div className="battle-builder-summary">
            <div className="battle-builder-summary-card">
              <span>{t('battle.filteredResults')}</span>
              <strong>{filteredCatalogCount}</strong>
              <small>{t('battle.builderSummaryHint')}</small>
            </div>
            <div className="battle-builder-summary-card">
              <span>{mediaResultsLabel}</span>
              <strong>{filteredReadyMediaCount}</strong>
              <small>{t('battle.builderSummaryHint')}</small>
            </div>
            <div className="battle-builder-summary-card">
              <span>{mediaDeckLabel}</span>
              <strong>{deckReadyMediaCount}</strong>
              <small>{t('battle.deckComposition', { count: filledSlotCount, size: deckSlots.length })}</small>
            </div>
          </div>

          <div className="battle-builder-filter-summary glass-heavy">
            <span className="battle-builder-filter-summary-label">{t('battle.filterSummary')}</span>
            <div className="battle-builder-filter-chip-row">
              {activeFilterSummary.length > 0 ? activeFilterSummary.map((item) => (
                <span key={item} className="battle-builder-filter-chip">{item}</span>
              )) : (
                <span className="battle-builder-filter-chip is-muted">{t('battle.filterSummaryEmpty')}</span>
              )}
            </div>
          </div>

          <div className="battle-builder-grid">
            <div className="battle-builder-preview glass-heavy">
              <div className="battle-preview-head">
                <strong>{deckName.trim() || battleDeck.label}</strong>
                <span>{t('battle.deckComposition', { count: filledSlotCount, size: deckSlots.length })}</span>
              </div>
              {isLoading ? (
                <div className="battle-slot-focus">
                  <div className="battle-slot-scroller">
                    {Array.from({ length: 8 }).map((_, i) => <BattleSlotCardSkeleton key={i} />)}
                  </div>
                </div>
              ) : catalogError ? (
                <p>{catalogError}</p>
              ) : (
                <div className="battle-slot-focus">
                  <div className="battle-slot-scroller">
                    {deckSlots.map((title, index) => (
                      <div
                        key={`slot-${index}`}
                        className={`battle-slot-card ${title ? 'is-filled' : 'is-empty'} ${dragOverSlotIndex === index ? 'is-drag-over' : ''} ${activeSlotIndex === index ? 'is-active' : ''}`}
                        onClick={() => setActiveSlotIndex(index)}
                        onDragOver={(event) => { event.preventDefault(); }}
                        onDragEnter={() => setDragOverSlotIndex((current) => (current === index ? current : index))}
                        onDragLeave={() => setDragOverSlotIndex((current) => (current === index ? null : current))}
                        onDrop={(event) => handleDropOnSlot(event, index)}
                        draggable={Boolean(title)}
                        onDragStart={(event) => {
                          if (!title) return;
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(SLOT_DRAG_MIME, String(index));
                        }}
                        onDragEnd={() => setDragOverSlotIndex(null)}
                      >
                        <span className="battle-slot-index">{index + 1}</span>
                        {title ? (() => {
                          const entryBadges = getBattleEntryBadges(title, t, { compact: true });
                          return (
                            <>
                              <div className="battle-slot-thumb">
                                <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                              </div>
                              <div className={`battle-slot-copy ${isThemeSongEntity(title) ? 'is-song-entry' : ''}`}>
                                <strong>{getDisplayName(title)}</strong>
                                <small>{getMetaLine(title) || title.type}</small>
                                {entryBadges.length > 0 ? (
                                  <div className="battle-entry-badges">
                                    {entryBadges.map((badge) => (
                                      <span key={`${badge.tone}-${badge.label}`} className={`battle-entry-badge is-${badge.tone || 'default'}`}>{badge.label}</span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <button type="button" className="battle-icon-btn" onClick={(event) => { event.stopPropagation(); handleRemoveFromSlot(index); }} aria-label={t('battle.removeFromDeck')}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          );
                        })() : (
                          <div className="battle-slot-empty" aria-label={t('battle.dropTitleHere')} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="battle-builder-preview glass-heavy">
              <div className="battle-preview-head">
                <strong>{t('battle.filteredCatalog')}</strong>
                <span>{filteredCatalogCount} / {visibleCatalogCount} {getEntryUnitLabel(filters.entityType)}</span>
              </div>
              {isCatalogBusy ? (
                <div className="battle-catalog-grid">
                  {Array.from({ length: 10 }).map((_, i) => <BattleCatalogCardSkeleton key={i} />)}
                </div>
              ) : catalogError ? (
                <p>{catalogError}</p>
              ) : filteredCatalogCount === 0 ? (
                <p>No {getEntryUnitLabel(filters.entityType)} match the current filters.</p>
              ) : (
                <div className="battle-catalog-grid">
                  {previewCatalogTitles.map((title) => {
                    const isSelected = selectedTitleIds.has(title.id);
                    const entryBadges = getBattleEntryBadges(title, t, { compact: true });
                    return (
                      <div
                        key={title.id}
                        className={`battle-catalog-card ${isSelected ? 'is-selected' : ''}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData(TITLE_DRAG_MIME, String(title.id));
                        }}
                      >
                        <div className="battle-catalog-thumb">
                          <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                        </div>
                        <div className={`battle-catalog-copy ${isThemeSongEntity(title) ? 'is-song-entry' : ''}`}>
                          <strong>{getDisplayName(title)}</strong>
                          <small>{getMetaLine(title) || title.type}</small>
                          {entryBadges.length > 0 ? (
                            <div className="battle-entry-badges">
                              {entryBadges.map((badge) => (
                                <span key={`${badge.tone}-${badge.label}`} className={`battle-entry-badge is-${badge.tone || 'default'}`}>{badge.label}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant={isSelected ? 'secondary' : 'primary'}
                          onClick={() => assignTitleToSlot(title, firstEmptySlotIndex >= 0 ? firstEmptySlotIndex : activeSlotIndex)}
                        >
                          {isSelected ? t('battle.inDeck') : t('battle.addToDeck')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredCatalogCount > 0 ? (
                <div className="battle-catalog-pagination">
                  <span className="battle-preview-muted">
                    {t('battle.catalogPage', { current: catalogPage + 1, total: totalCatalogPages })}
                  </span>
                  <div className="battle-catalog-pagination-actions">
                    <Button size="sm" variant="ghost" onClick={() => setCatalogPage((current) => Math.max(0, current - 1))} disabled={catalogPage === 0}>
                      {t('battle.previousPage')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCatalogPage((current) => Math.min(totalCatalogPages - 1, current + 1))} disabled={catalogPage >= totalCatalogPages - 1}>
                      {t('battle.nextPage')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
