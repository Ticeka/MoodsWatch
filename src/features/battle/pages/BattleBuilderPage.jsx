import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Globe, Image as ImageIcon, Layers, Link2, Loader2, Lock, Music, Play, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
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
  CUSTOM_IMAGE_ENTITY_TYPE,
  CUSTOM_VIDEO_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  buildThemeSongEntity,
  getCatalogEntityMeta,
  getCatalogEntityName,
  isCustomImageEntity,
  isCustomVideoEntity,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { buildTrailerUrl, normalizeTrailer, parseTrailerUrl } from '@/shared/lib/trailers';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import '../styles/Battle.css';

const TYPE_OPTIONS = [
  { value: 'all', translationKey: 'battle.allEntries' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];
const ENTITY_TYPE_OPTIONS = [
  { value: TITLE_ENTITY_TYPE, translationKey: 'battle.entryUnitTitles' },
  { value: CHARACTER_ENTITY_TYPE, translationKey: 'battle.entryUnitCharacters' },
  { value: THEME_SONG_ENTITY_TYPE, translationKey: 'battle.entryUnitSongs' },
  { value: TRAILER_ENTITY_TYPE, translationKey: 'battle.entryUnitTrailers' },
  { value: CUSTOM_IMAGE_ENTITY_TYPE, label: 'Custom images' },
  { value: CUSTOM_VIDEO_ENTITY_TYPE, label: 'Custom videos' },
];
const SIZE_OPTIONS = [8, 16, 24, 32, 48];
const BATTLE_CATALOG_PAGE_SIZE = 6;
const TITLE_DRAG_MIME = 'application/x-battle-title-id';
const SLOT_DRAG_MIME = 'application/x-battle-slot-index';
const CUSTOM_BATTLE_LINK_TIMEOUT_MS = 8000;
const EMPTY_FILTER_OPTIONS = {
  genres: [],
  tags: [],
  moods: [],
  trailerProviders: [],
};

function getDisplayName(title) { return getCatalogEntityName(title); }
function getMetaLine(title) { return getCatalogEntityMeta(title); }
function getLocalizedEntryUnitLabel(entityType, t, options = {}) {
  const label = getEntryUnitLabel(entityType, options);
  return label.startsWith('battle.') ? t(label) : label;
}

function getEntryUnitLabel(entityType, options = {}) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) return options.singular ? 'battle.entryUnitCharacter' : 'battle.entryUnitCharacters';
  if (normalized === THEME_SONG_ENTITY_TYPE) return options.singular ? 'battle.entryUnitSong' : 'battle.entryUnitSongs';
  if (normalized === CUSTOM_IMAGE_ENTITY_TYPE) return options.singular ? 'image' : 'images';
  if (normalized === CUSTOM_VIDEO_ENTITY_TYPE) return options.singular ? 'video' : 'videos';
  return options.singular ? 'battle.entryUnitTitle' : 'battle.entryUnitTitles';
}

function getAnyTypeLabel(entityType, t) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) return t('battle.allCharacters');
  if (normalized === THEME_SONG_ENTITY_TYPE) return t('battle.allSongs');
  if (normalized === CUSTOM_IMAGE_ENTITY_TYPE) return 'Custom images';
  if (normalized === CUSTOM_VIDEO_ENTITY_TYPE) return 'Custom videos';
  return t('battle.allTitles');
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
  return title?.theme_label || title?.role || '';
}

function hasBattleMedia(title) {
  if (isCustomImageEntity(title)) return Boolean(title?.cover);
  if (isCustomVideoEntity(title)) return Boolean(normalizeTrailer(title || {})?.watchUrl || title?.trailer_url);
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
      { tone: 'song', label: getBattleSongRoleLabel(title) || t('battle.songThemeLabel') },
      { tone: title.video_url ? 'ready' : 'missing', label: title.video_url ? t('battle.previewReady') : t('battle.noPreview') },
    ];
    if (!options.compact && title.episodes_text) badges.push({ tone: 'default', label: title.episodes_text });
    if (!options.compact && title.is_creditless) badges.push({ tone: 'song', label: t('battle.creditless') });
    if (!options.compact && title.is_spoiler) badges.push({ tone: 'warning', label: t('battle.spoiler') });
    if (!options.compact && title.is_nsfw) badges.push({ tone: 'warning', label: t('battle.nsfw') });
    return badges;
  }
  if (isCustomImageEntity(title)) {
    return [
      { tone: 'ready', label: 'Custom image' },
      { tone: title?.cover ? 'ready' : 'missing', label: title?.cover ? 'Link verified' : 'Missing image' },
    ];
  }
  if (isCustomVideoEntity(title)) {
    const trailer = normalizeTrailer(title || {});
    const providerLabel = formatTrailerProviderLabel(trailer?.provider || title?.trailer_site || 'external', t);
    return [
      { tone: 'song', label: 'Custom video' },
      { tone: trailer?.watchUrl ? 'ready' : 'missing', label: trailer?.watchUrl ? providerLabel : 'Missing video' },
    ];
  }
  const trailerBadge = getBattleTrailerBadge(title, t);
  return trailerBadge ? [trailerBadge] : [];
}

function countBattleReadyMedia(titles = []) {
  return (titles || []).filter((title) => hasBattleMedia(title)).length;
}

function getActiveBattleFilterSummary(filters, t) {
  const items = [];
  if (filters.entityType === CUSTOM_IMAGE_ENTITY_TYPE) items.push('Custom images');
  if (filters.entityType === CUSTOM_VIDEO_ENTITY_TYPE) items.push('Custom videos');
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

function createEmptyCustomDraft() {
  return {
    label: '',
    subtitle: '',
    url: '',
  };
}

function stripCustomMediaFileExtension(filename = '') {
  return String(filename || '').replace(/\.[^/.]+$/, '').trim();
}

function readCustomMediaFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error('Unsupported file input.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name || 'this file'}.`));
    reader.readAsDataURL(file);
  });
}

function buildCustomDraftFromFile(file, entityType) {
  const fileLabel = stripCustomMediaFileExtension(file?.name) || (entityType === CUSTOM_IMAGE_ENTITY_TYPE ? 'Custom image' : 'Custom video');
  return {
    label: fileLabel,
    subtitle: 'Uploaded file',
    url: '',
  };
}

function makeCustomBattleEntryId() {
  return -1 * (Date.now() + Math.floor(Math.random() * 100000));
}

function isDirectVideoUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(String(url || '').trim());
}

function loadCustomBattleImage(url, timeoutMs = CUSTOM_BATTLE_LINK_TIMEOUT_MS) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl || typeof Image === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finalize = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finalize(false), timeoutMs);
    image.onload = () => finalize(true);
    image.onerror = () => finalize(false);
    image.src = normalizedUrl;
  });
}

async function fetchYoutubeVideoMetadata(url, timeoutMs = CUSTOM_BATTLE_LINK_TIMEOUT_MS) {
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

async function resolveCustomVideoDraft(draft) {
  const label = String(draft?.label || '').trim();
  const subtitle = String(draft?.subtitle || '').trim();
  const rawUrl = String(draft?.url || '').trim();
  const parsed = parseTrailerUrl(rawUrl);
  const normalizedTrailer = normalizeTrailer({ trailer_url: rawUrl });
  const youtubeMetadata = await fetchYoutubeVideoMetadata(rawUrl);
  const resolvedLabel = label || youtubeMetadata?.title || '';
  const resolvedSubtitle = subtitle || (
    youtubeMetadata?.authorName
      ? `YouTube · ${youtubeMetadata.authorName}`
      : parsed?.site === 'youtube'
        ? 'YouTube'
        : parsed?.site === 'dailymotion'
          ? 'Dailymotion'
          : 'External video'
  );

  return {
    parsed,
    normalizedTrailer,
    youtubeMetadata,
    resolvedLabel,
    resolvedSubtitle,
    resolvedThumbnailUrl: youtubeMetadata?.thumbnailUrl || normalizedTrailer?.thumbnailUrl || '',
  };
}

async function validateCustomBattleEntry(entityType, draft, existingId = null) {
  const rawUrl = String(draft?.url || '').trim();

  if (!rawUrl) {
    return { ok: false, message: 'Please paste a link before adding this card.' };
  }

  if (entityType === CUSTOM_IMAGE_ENTITY_TYPE) {
    const label = String(draft?.label || '').trim();
    const subtitle = String(draft?.subtitle || '').trim();

    if (!label) {
      return { ok: false, message: 'Please enter a name for this card.' };
    }

    if (parseTrailerUrl(rawUrl)?.videoId) {
      return { ok: false, message: 'This looks like a video link. Switch to Custom videos for YouTube or trailer links.' };
    }

    const imageReady = await loadCustomBattleImage(rawUrl);
    if (!imageReady) {
      return { ok: false, message: 'This image link could not be opened. Check that it is public and directly points to an image.' };
    }

    return {
      ok: true,
      entry: {
        id: Number(existingId) || makeCustomBattleEntryId(),
        entityType: CUSTOM_IMAGE_ENTITY_TYPE,
        slug: `custom-image-${Math.abs(Number(existingId) || Date.now())}`,
        type: 'custom',
        subtype: 'image',
        title_en: label,
        title_th: label,
        title_native: '',
        cover: rawUrl,
        banner: rawUrl,
        synopsis: '',
        score: null,
        popularity: 0,
        is_adult: false,
        genres: [],
        tags: [],
        moods: [],
        role: 'Custom image',
        sourceTitleName: subtitle || 'External image',
      },
      message: 'Image link verified and ready to add.',
    };
  }

  if (entityType === CUSTOM_VIDEO_ENTITY_TYPE) {
    const {
      parsed,
      normalizedTrailer,
      youtubeMetadata,
      resolvedLabel,
      resolvedSubtitle,
      resolvedThumbnailUrl,
    } = await resolveCustomVideoDraft(draft);
    const isSupported = Boolean(parsed?.videoId || isDirectVideoUrl(rawUrl) || normalizedTrailer?.watchUrl);

    if (!isSupported) {
      return { ok: false, message: 'Use a YouTube, Dailymotion, or direct video file link for Custom videos.' };
    }

    if (!resolvedLabel) {
      return { ok: false, message: 'Please enter a name for this card, or use a YouTube link so we can fill it in for you.' };
    }

    return {
      ok: true,
      draft: {
        label: resolvedLabel,
        subtitle: resolvedSubtitle,
        url: rawUrl,
      },
      entry: {
        id: Number(existingId) || makeCustomBattleEntryId(),
        entityType: CUSTOM_VIDEO_ENTITY_TYPE,
        slug: `custom-video-${Math.abs(Number(existingId) || Date.now())}`,
        type: 'custom',
        subtype: 'video',
        title_en: resolvedLabel,
        title_th: resolvedLabel,
        title_native: '',
        cover: resolvedThumbnailUrl,
        banner: resolvedThumbnailUrl,
        synopsis: '',
        score: null,
        popularity: 0,
        is_adult: false,
        genres: [],
        tags: [],
        moods: [],
        role: 'Custom video',
        sourceTitleName: resolvedSubtitle,
        trailer_url: normalizedTrailer?.url || rawUrl,
        trailer_site: normalizedTrailer?.site || (isDirectVideoUrl(rawUrl) ? 'external' : null),
        trailer_video_id: normalizedTrailer?.videoId || null,
        trailer_thumbnail_url: resolvedThumbnailUrl,
        trailer_embed_url: normalizedTrailer?.embedUrl || null,
        trailer_watch_url: normalizedTrailer?.watchUrl || rawUrl,
      },
      message: youtubeMetadata?.title && !String(draft?.label || '').trim()
        ? 'Video link verified and title filled from YouTube. You can still edit it before adding.'
        : 'Video link verified and ready to add.',
    };
  }

  return { ok: false, message: 'Unsupported custom category.' };
}

function createManualBattleDeck({ filters, deckName, deckSlots, sourceCount, t }) {
  const titles = deckSlots.filter(Boolean);
  const entityType = normalizeCatalogEntityType(filters.entityType);
  const normalizedFilters = { ...filters, entityType, size: deckSlots.length };
  return {
    key: JSON.stringify({ ...normalizedFilters, titleIds: titles.map((title) => title.id) }),
    fingerprint: titles.map((title) => Number(title?.id)).filter(Boolean).sort((a, b) => a - b).join(':'),
    label: deckName.trim() || `${t('battle.customDeck')} ${getLocalizedEntryUnitLabel(entityType, t, { singular: true })} ${titles.length}/${deckSlots.length}`,
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
  const [customDraft, setCustomDraft] = useState(createEmptyCustomDraft);
  const [customValidation, setCustomValidation] = useState({ status: 'idle', message: '' });
  const [isValidatingCustomEntry, setIsValidatingCustomEntry] = useState(false);
  const [isImportingCustomFiles, setIsImportingCustomFiles] = useState(false);
  const customFileInputRef = useRef(null);
  const deferredFilters = useDeferredValue(filters);
  const debouncedQuery = useDebouncedValue(filters.query, 300);
  const editDeckId = searchParams.get('deckId');
  const songTitleSlug = searchParams.get('songTitleSlug');
  const normalizedHiddenTitleIds = useMemo(
    () => [...new Set((hiddenTitleIds || []).map(Number).filter(Boolean))],
    [hiddenTitleIds]
  );
  const isCharacterEntity = filters.entityType === CHARACTER_ENTITY_TYPE;
  const isSongEntity = filters.entityType === THEME_SONG_ENTITY_TYPE;
  const isTrailerEntity = filters.entityType === TRAILER_ENTITY_TYPE;
  const isCustomImageEntityType = filters.entityType === CUSTOM_IMAGE_ENTITY_TYPE;
  const isCustomVideoEntityType = filters.entityType === CUSTOM_VIDEO_ENTITY_TYPE;
  const isCustomEntityType = isCustomImageEntityType || isCustomVideoEntityType;
  const activeCustomEntry = isCustomEntityType ? deckSlots[activeSlotIndex] : null;
  const usesRemoteCatalog = !isCustomEntityType;
  const debouncedCatalogFilters = useMemo(() => ({
    ...deferredFilters,
    query: debouncedQuery,
  }), [debouncedQuery, deferredFilters]);
  const customDraftPreviewArtwork = useMemo(() => {
    if (!isCustomEntityType) {
      return '';
    }

    if (isCustomImageEntityType && customDraft.url.trim()) {
      return customDraft.url.trim();
    }

    if (isCustomVideoEntityType && customDraft.url.trim()) {
      return normalizeTrailer({ trailer_url: customDraft.url.trim() })?.thumbnailUrl || '';
    }

    return getTitleArtwork(activeCustomEntry);
  }, [activeCustomEntry, customDraft.url, isCustomEntityType, isCustomImageEntityType, isCustomVideoEntityType]);
  const customDraftTitle = String(customDraft.label || '').trim() || (isCustomImageEntityType ? 'Untitled image card' : 'Untitled video card');
  const customDraftSubtitle = String(customDraft.subtitle || '').trim()
    || (isCustomImageEntityType ? 'Bring in posters, stills, or scans from anywhere.' : 'Use trailers, clips, or uploads that feel battle-worthy.');

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
              query: debouncedCatalogFilters.query || '',
            })
          : isCharacterEntity
            ? await fetchBattleCharactersPage({
                ...params,
                type: debouncedCatalogFilters.type || 'all',
                tag: debouncedCatalogFilters.tag || '',
                mood: debouncedCatalogFilters.mood || '',
                query: debouncedCatalogFilters.query || '',
              })
          : isTrailerEntity
            ? await fetchBattleTrailersPage({
                ...params,
                type: debouncedCatalogFilters.type || 'all',
                tag: debouncedCatalogFilters.tag || '',
                mood: debouncedCatalogFilters.mood || '',
                query: debouncedCatalogFilters.query || '',
                trailerProvider: debouncedCatalogFilters.trailerProvider || 'all',
              })
          : await fetchBattleTitlesPage({
              ...params,
              type: debouncedCatalogFilters.type || 'all',
              tag: debouncedCatalogFilters.tag || '',
              mood: debouncedCatalogFilters.mood || '',
              query: debouncedCatalogFilters.query || '',
              trailerState: debouncedCatalogFilters.trailerState || 'all',
              trailerProvider: debouncedCatalogFilters.trailerProvider || 'all',
            });

        if (!cancelled) {
          setCatalogRows(result.rows || []);
          setCatalogTotal(Number(result.total || 0));

          const nextPage = catalogPage + 1;
          if (nextPage < Math.max(1, Math.ceil(Number(result.total || 0) / BATTLE_CATALOG_PAGE_SIZE))) {
            const nextParams = {
              ...params,
              page: nextPage,
            };

            if (isSongEntity) {
              fetchBattleThemeSongsPage({
                ...nextParams,
                query: debouncedCatalogFilters.query || '',
              }).catch(() => {});
            } else if (isCharacterEntity) {
              fetchBattleCharactersPage({
                ...nextParams,
                type: debouncedCatalogFilters.type || 'all',
                tag: debouncedCatalogFilters.tag || '',
                mood: debouncedCatalogFilters.mood || '',
                query: debouncedCatalogFilters.query || '',
              }).catch(() => {});
            } else if (isTrailerEntity) {
              fetchBattleTrailersPage({
                ...nextParams,
                type: debouncedCatalogFilters.type || 'all',
                tag: debouncedCatalogFilters.tag || '',
                mood: debouncedCatalogFilters.mood || '',
                query: debouncedCatalogFilters.query || '',
                trailerProvider: debouncedCatalogFilters.trailerProvider || 'all',
              }).catch(() => {});
            } else {
              fetchBattleTitlesPage({
                ...nextParams,
                type: debouncedCatalogFilters.type || 'all',
                tag: debouncedCatalogFilters.tag || '',
                mood: debouncedCatalogFilters.mood || '',
                query: debouncedCatalogFilters.query || '',
                trailerState: debouncedCatalogFilters.trailerState || 'all',
                trailerProvider: debouncedCatalogFilters.trailerProvider || 'all',
              }).catch(() => {});
            }
          }
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
  }, [catalogPage, debouncedCatalogFilters, isCharacterEntity, isSongEntity, isTrailerEntity, normalizedHiddenTitleIds, showAdult, songTitleSlug, t, usesRemoteCatalog]);

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
    () => createManualBattleDeck({
      filters,
      deckName,
      deckSlots,
      sourceCount: isCustomEntityType ? deckSlots.filter(Boolean).length : filteredCatalogCount,
      t,
    }),
    [deckName, deckSlots, filteredCatalogCount, filters, isCustomEntityType, t]
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
  const mediaResultsLabel = isSongEntity ? t('battle.songsWithPreview') : t('battle.trailersInResults');
  const mediaDeckLabel = isSongEntity ? t('battle.songsWithPreviewInDeck') : t('battle.trailersInDeck');
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

  useEffect(() => { setCatalogPage(0); }, [debouncedCatalogFilters, filters.entityType, showAdult]);

  useEffect(() => {
    if (catalogPage > totalCatalogPages - 1) setCatalogPage(Math.max(0, totalCatalogPages - 1));
  }, [catalogPage, totalCatalogPages]);

  useEffect(() => {
    if (!isCustomEntityType) {
      setCustomDraft(createEmptyCustomDraft());
      setCustomValidation({ status: 'idle', message: '' });
      return;
    }

    const activeEntry = deckSlots[activeSlotIndex];
    if (activeEntry?.entityType === filters.entityType) {
      setCustomDraft({
        label: getDisplayName(activeEntry) || '',
        subtitle: String(activeEntry?.sourceTitleName || '').trim(),
        url: String(
          activeEntry?.trailer_url
          || activeEntry?.trailer_watch_url
          || activeEntry?.cover
          || ''
        ).trim(),
      });
      setCustomValidation({ status: 'idle', message: '' });
      return;
    }

    setCustomDraft(createEmptyCustomDraft());
    setCustomValidation({ status: 'idle', message: '' });
  }, [activeSlotIndex, deckSlots, filters.entityType, isCustomEntityType]);

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

  const handleValidateCustomEntry = async () => {
    setIsValidatingCustomEntry(true);
    setCustomValidation({ status: 'checking', message: 'Checking link...' });
    try {
      const result = await validateCustomBattleEntry(filters.entityType, customDraft, deckSlots[activeSlotIndex]?.id);
      if (result?.draft) {
        setCustomDraft((current) => ({ ...current, ...result.draft }));
      }
      setCustomValidation({
        status: result.ok ? 'valid' : 'invalid',
        message: result.message,
      });
      return result;
    } finally {
      setIsValidatingCustomEntry(false);
    }
  };

  const handleCustomUrlBlur = async () => {
    if (!isCustomVideoEntityType) {
      return;
    }

    const currentUrl = String(customDraft.url || '').trim();
    if (!currentUrl || String(customDraft.label || '').trim()) {
      return;
    }

    try {
      const resolved = await resolveCustomVideoDraft(customDraft);
      if (!resolved?.resolvedLabel) {
        return;
      }

      setCustomDraft((current) => {
        if (String(current.url || '').trim() !== currentUrl || String(current.label || '').trim()) {
          return current;
        }

        return {
          ...current,
          label: resolved.resolvedLabel,
          subtitle: String(current.subtitle || '').trim() || resolved.resolvedSubtitle,
        };
      });
      setCustomValidation({
        status: 'valid',
        message: 'Filled the video title from YouTube. You can edit it before adding the card.',
      });
    } catch {
      // Best-effort autofill only.
    }
  };

  const handleApplyCustomEntryToSlot = async () => {
    const result = await handleValidateCustomEntry();
    if (!result?.ok || !result.entry) {
      toast.error(result?.message || 'Could not add this custom card.');
      return;
    }

    setDeckSlots((current) => current.map((entry, index) => (
      index === activeSlotIndex ? result.entry : entry
    )));
    toast.success(activeSlotIndex + 1 <= filledSlotCount ? 'Custom card updated.' : 'Custom card added.');
  };

  const handleCustomFilesSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (!selectedFiles.length) {
      return;
    }

    const expectedKind = isCustomImageEntityType ? 'image/' : 'video/';
    const supportedFiles = selectedFiles.filter((file) => String(file?.type || '').startsWith(expectedKind));

    if (!supportedFiles.length) {
      toast.error(isCustomImageEntityType ? 'Please choose image files for Custom images.' : 'Please choose video files for Custom videos.');
      return;
    }

    setIsImportingCustomFiles(true);
    setCustomValidation({
      status: 'checking',
      message: `Preparing ${supportedFiles.length} ${supportedFiles.length === 1 ? 'file' : 'files'}...`,
    });

    try {
      const emptySlotIndexes = deckSlots
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !entry)
        .map(({ index }) => index);
      const prioritizedSlotIndexes = [
        ...emptySlotIndexes.filter((index) => index >= activeSlotIndex),
        ...emptySlotIndexes.filter((index) => index < activeSlotIndex),
      ];

      if (!prioritizedSlotIndexes.length) {
        setCustomValidation({ status: 'invalid', message: 'Deck is full. Clear a slot before importing more files.' });
        toast.error('Deck is full. Clear a slot before importing more files.');
        return;
      }

      const importableFiles = supportedFiles.slice(0, prioritizedSlotIndexes.length);
      const skippedForSpace = supportedFiles.length - importableFiles.length;
      const builtEntries = [];
      const importErrors = [];

      for (const file of importableFiles) {
        try {
          const draft = buildCustomDraftFromFile(file, filters.entityType);
          draft.url = await readCustomMediaFileAsDataUrl(file);
          const result = await validateCustomBattleEntry(filters.entityType, draft);
          if (!result?.ok || !result.entry) {
            importErrors.push(`${file.name}: ${result?.message || 'Could not import this file.'}`);
            continue;
          }
          builtEntries.push(result.entry);
        } catch (error) {
          importErrors.push(`${file.name}: ${error?.message || 'Could not import this file.'}`);
        }
      }

      if (!builtEntries.length) {
        const fallbackMessage = importErrors[0] || 'No files could be imported.';
        setCustomValidation({ status: 'invalid', message: fallbackMessage });
        toast.error(fallbackMessage);
        return;
      }

      setDeckSlots((current) => {
        const nextSlots = [...current];
        builtEntries.forEach((entry, index) => {
          const slotIndex = prioritizedSlotIndexes[index];
          if (slotIndex != null) {
            nextSlots[slotIndex] = entry;
          }
        });
        return nextSlots;
      });
      setActiveSlotIndex(prioritizedSlotIndexes[0] ?? activeSlotIndex);

      const messageParts = [`Added ${builtEntries.length} ${builtEntries.length === 1 ? 'card' : 'cards'} from files.`];
      if (skippedForSpace > 0) {
        messageParts.push(`${skippedForSpace} skipped because the deck is full.`);
      }
      if (importErrors.length > 0) {
        messageParts.push(`${importErrors.length} failed validation.`);
      }
      const finalMessage = messageParts.join(' ');
      setCustomValidation({
        status: importErrors.length > 0 || skippedForSpace > 0 ? 'valid' : 'valid',
        message: finalMessage,
      });
      toast.success(finalMessage);
      if (importErrors.length > 0) {
        toast.error(importErrors[0]);
      }
    } finally {
      setIsImportingCustomFiles(false);
    }
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
    setCustomDraft(createEmptyCustomDraft());
    setCustomValidation({ status: 'idle', message: '' });
    setCatalogPage(0);
  };

  const handleRemoveFromSlot = (slotIndex) => {
    setDeckSlots((current) => current.map((entry, i) => (i === slotIndex ? null : entry)));
    setActiveSlotIndex(slotIndex);
    setCustomValidation({ status: 'idle', message: '' });
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
      toast.error(t('battle.onlyMatchingRightNow', { count: battleDeck.titles.length, unit: getLocalizedEntryUnitLabel(filters.entityType, t) }));
      return;
    }
    if (isCustomEntityType) {
      const invalidEntries = [];

      for (const [index, title] of deckSlots.entries()) {
        if (!title) {
          continue;
        }
        const draft = {
          label: getDisplayName(title),
          subtitle: String(title?.sourceTitleName || '').trim(),
          url: String(title?.trailer_url || title?.trailer_watch_url || title?.cover || '').trim(),
        };
        const validation = await validateCustomBattleEntry(filters.entityType, draft, title?.id);
        if (!validation.ok) {
          invalidEntries.push(`slot ${index + 1}`);
        }
      }

      if (invalidEntries.length > 0) {
        toast.error(`Some custom links failed validation before save: ${invalidEntries.join(', ')}`);
        return;
      }
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
          catalogCount: isCustomEntityType
            ? Number(storedDeck?.sourceCount || storedDeck?.titles?.length || 0)
            : visibleCatalogCount,
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
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.buildDeckTitle')}</h2>
          <p>{t('battle.buildDeckHint')}</p>
        </div>

        <div className="battle-builder-stack">
          {/* Row 1: deck identity + primary actions */}
          <div className="battle-builder-topbar glass-heavy">
            <div className="battle-builder-topbar-left">
              <input
                className="battle-deck-name-input"
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                placeholder={t('battle.deckNamePlaceholder')}
              />
              <select
                className="battle-deck-size-select"
                value={filters.size}
                onChange={(event) => setFilters((current) => ({ ...current, size: Number(event.target.value) }))}
              >
                {SIZE_OPTIONS.map((value) => (<option key={value} value={value}>{value} slots</option>))}
              </select>
              <button
                type="button"
                className={`battle-visibility-toggle ${isPublic ? 'is-public' : 'is-private'}`}
                onClick={() => setIsPublic((current) => !current)}
                aria-pressed={isPublic}
              >
                <span className="battle-visibility-toggle-copy">
                  {isPublic ? <Globe size={14} /> : <Lock size={14} />}
                  <strong>{isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}</strong>
                </span>
              </button>
            </div>
            <div className="battle-builder-topbar-right">
              <Link className="btn btn-ghost btn-sm" to="/battle">{t('battle.backToBattle')}</Link>
              <Button variant="secondary" onClick={() => saveDeck()} disabled={isCatalogBusy || isSaving || Boolean(catalogError)}>{t('battle.saveDeck')}</Button>
              <Button onClick={() => saveDeck({ startAfterSave: true })} disabled={isCatalogBusy || isSaving || Boolean(catalogError)}>{t('battle.saveAndStart')}</Button>
            </div>
          </div>

          {/* Row 2: entity type tabs */}
          <div className="battle-builder-type-bar glass-heavy">
            <span className="battle-builder-type-label">{t('battle.catalogLabel')}</span>
            <div className="battle-builder-type-tabs">
              {ENTITY_TYPE_OPTIONS.map((option) => {
                const label = option.translationKey ? t(option.translationKey) : option.label;
                const isActive = filters.entityType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`battle-type-tab ${isActive ? 'is-active' : ''}`}
                    onClick={() => handleEntityTypeChange(option.value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: filters (hidden for custom types) */}
          {!isCustomEntityType && (
            <div className="battle-builder-filter-bar glass-heavy">
              <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))} disabled={isSongEntity} className="battle-filter-select">
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.value === 'all' ? getAnyTypeLabel(filters.entityType, t) : (option.translationKey ? t(option.translationKey) : option.label)}</option>
                ))}
              </select>
              <select value={filters.tag} onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))} disabled={isSongEntity} className="battle-filter-select">
                <option value="">{t('battle.anyTagGenre')}</option>
                {tagOptions.map((value) => (<option key={value} value={value}>{value}</option>))}
              </select>
              <select value={filters.mood} onChange={(event) => setFilters((current) => ({ ...current, mood: event.target.value }))} disabled={isSongEntity} className="battle-filter-select">
                <option value="">{t('battle.anyMood')}</option>
                {filterOptions.moods.map((mood) => (<option key={mood} value={mood}>{mood}</option>))}
              </select>
              {filters.entityType === TITLE_ENTITY_TYPE && (
                <select
                  value={filters.trailerState}
                  onChange={(event) => setFilters((current) => ({
                    ...current,
                    trailerState: event.target.value,
                    trailerProvider: event.target.value === 'none' ? 'all' : current.trailerProvider,
                  }))}
                  className="battle-filter-select"
                >
                  <option value="all">{t('battle.anyTrailerStatus')}</option>
                  <option value="has">{t('battle.trailerHas')}</option>
                  <option value="none">{t('battle.trailerNone')}</option>
                </select>
              )}
              {(filters.entityType === TITLE_ENTITY_TYPE || filters.entityType === TRAILER_ENTITY_TYPE) && filters.trailerState !== 'none' && trailerProviderOptions.length > 0 && (
                <select
                  value={filters.trailerProvider}
                  onChange={(event) => setFilters((current) => ({ ...current, trailerProvider: event.target.value }))}
                  className="battle-filter-select"
                >
                  <option value="all">{t('battle.anyTrailerPlatform')}</option>
                  {trailerProviderOptions.map((provider) => (
                    <option key={provider} value={provider}>{formatTrailerProviderLabel(provider, t)}</option>
                  ))}
                </select>
              )}
              <div className="battle-filter-search-wrap">
                <Search size={14} className="battle-filter-search-icon" />
                <input
                  className="battle-filter-search"
                  value={filters.query}
                  onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                  placeholder={t('battle.searchPlaceholder')}
                />
              </div>
              <div className="battle-filter-actions">
                <Button variant="ghost" size="sm" onClick={handleAutoFillDeck} disabled={isCatalogBusy || Boolean(catalogError) || filteredCatalogCount === 0}>{t('battle.fillFromFilters')}</Button>
                <Button variant="ghost" size="sm" onClick={handleClearDeck} disabled={isLoading}>{t('battle.clearDeck')}</Button>
              </div>
            </div>
          )}
          {isCustomEntityType && (
            <div className="battle-builder-filter-bar glass-heavy">
              <span className="battle-builder-type-label">Custom media — use the editor on the right to add cards</span>
              <div className="battle-filter-actions" style={{ marginLeft: 'auto' }}>
                <Button variant="ghost" size="sm" onClick={handleClearDeck} disabled={isLoading}>{t('battle.clearDeck')}</Button>
              </div>
            </div>
          )}

          <div className="battle-builder-grid">
            <div className="battle-builder-preview glass-heavy">
              <div className="battle-preview-head">
                <strong>{deckName.trim() || battleDeck.label}</strong>
                <span className={filledSlotCount >= deckSlots.length ? 'battle-deck-count-full' : filledSlotCount >= 8 ? 'battle-deck-count-ready' : ''}>{filledSlotCount} / {deckSlots.length}</span>
              </div>
              <div className="battle-deck-progress-track">
                <div
                  className={`battle-deck-progress-fill ${filledSlotCount >= deckSlots.length ? 'is-full' : filledSlotCount >= 8 ? 'is-ready' : ''}`}
                  style={{ width: `${Math.round((filledSlotCount / deckSlots.length) * 100)}%` }}
                />
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
                  {filledSlotCount === 0 && (
                    <p className="battle-deck-empty-hint">
                      {isCustomEntityType ? 'Use the editor on the right to add cards' : 'Click Add on any item in the catalog →'}
                    </p>
                  )}
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
                <strong>{isCustomEntityType ? 'Custom media editor' : t('battle.filteredCatalog')}</strong>
                <span>{isCustomEntityType ? `${filledSlotCount}/${deckSlots.length} cards ready` : `${filteredCatalogCount} / ${visibleCatalogCount} ${getLocalizedEntryUnitLabel(filters.entityType, t)}`}</span>
              </div>
              {isCustomEntityType ? (
                <div className="battle-custom-builder-panel">
                  <div className="battle-custom-builder-hero">
                    <div className="battle-custom-builder-copy">
                      <span className="battle-builder-filter-summary-label">{isCustomImageEntityType ? 'Custom image studio' : 'Custom video studio'}</span>
                      <h3>Card {activeSlotIndex + 1} of {deckSlots.length}</h3>
                      <p>{isCustomImageEntityType ? 'Drop in posters, visuals, or manga spreads from outside the catalog. You can add one link carefully or batch in several files at once.' : 'Mix in trailers, clips, or your own uploads when the catalog is not enough. Link-based cards and batch file imports both land directly in your deck.'}</p>
                    </div>
                    <div className="battle-custom-preview-card">
                      <div className="battle-custom-preview-art">
                        {customDraftPreviewArtwork ? <img src={customDraftPreviewArtwork} alt="" loading="lazy" /> : <div className="battle-custom-preview-art-placeholder">{isCustomImageEntityType ? <ImageIcon size={20} /> : <Play size={20} />}</div>}
                      </div>
                      <div className="battle-custom-preview-copy">
                        <strong>{customDraftTitle}</strong>
                        <span>{customDraftSubtitle}</span>
                        <div className="battle-custom-preview-chips">
                          <span className="battle-builder-filter-chip">{isCustomImageEntityType ? 'Image card' : 'Video card'}</span>
                          <span className="battle-builder-filter-chip">{activeCustomEntry ? 'Editing filled slot' : 'Empty slot ready'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="battle-custom-builder-note">
                    <div className="battle-custom-builder-note-head">
                      <strong>Two easy ways to add media</strong>
                      <span>{isCustomImageEntityType ? 'Use links for one-offs, or batch import files when you are building a full image deck fast.' : 'Use links for hosted videos, or batch import files straight from your device for quick setup.'}</span>
                    </div>
                    <div className="battle-custom-builder-note-grid">
                      <div className="battle-custom-builder-tip">
                        <span className="battle-custom-builder-tip-icon"><Link2 size={14} /></span>
                        <div>
                          <strong>Paste a link</strong>
                          <p>{isCustomImageEntityType ? 'Best for public direct image URLs.' : 'Best for YouTube, Dailymotion, or direct video URLs.'}</p>
                        </div>
                      </div>
                      <div className="battle-custom-builder-tip">
                        <span className="battle-custom-builder-tip-icon">{isCustomImageEntityType ? <ImageIcon size={14} /> : <Play size={14} />}</span>
                        <div>
                          <strong>Import multiple files</strong>
                          <p>{isCustomImageEntityType ? 'Choose several images and let the builder place them into empty slots for you.' : 'Choose several video files and the builder will line them up across empty slots.'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="battle-custom-builder-form-grid">
                    <label className="battle-field">
                      <span>Card name</span>
                      <input value={customDraft.label} onChange={(event) => { setCustomDraft((current) => ({ ...current, label: event.target.value })); setCustomValidation({ status: 'idle', message: '' }); }} placeholder={isCustomImageEntityType ? 'For example: Best poster reveal' : 'Leave blank for YouTube auto-fill, or type your own title'} />
                    </label>
                    <label className="battle-field">
                      <span>Subtitle</span>
                      <input value={customDraft.subtitle} onChange={(event) => { setCustomDraft((current) => ({ ...current, subtitle: event.target.value })); setCustomValidation({ status: 'idle', message: '' }); }} placeholder="Optional source or note" />
                    </label>
                  </div>
                  <label className="battle-field">
                    <span>External link</span>
                    <input value={customDraft.url} onChange={(event) => { setCustomDraft((current) => ({ ...current, url: event.target.value })); setCustomValidation({ status: 'idle', message: '' }); }} onBlur={handleCustomUrlBlur} placeholder={isCustomImageEntityType ? 'https://...image.jpg' : 'https://youtube.com/watch?v=...'} />
                  </label>
                  <div className="battle-custom-builder-action-grid">
                    <div className="battle-custom-builder-action-panel">
                      <span className="battle-custom-builder-action-label">From link</span>
                      <div className="battle-builder-actions battle-custom-builder-actions">
                        <Button variant="ghost" className="battle-custom-action-btn" onClick={handleValidateCustomEntry} disabled={isValidatingCustomEntry || !customDraft.url.trim() || (isCustomImageEntityType && !customDraft.label.trim())} icon={isValidatingCustomEntry ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}>
                          Check link
                        </Button>
                        <Button className="battle-custom-action-btn" onClick={handleApplyCustomEntryToSlot} disabled={isValidatingCustomEntry || !customDraft.url.trim() || (isCustomImageEntityType && !customDraft.label.trim())} icon={isCustomImageEntityType ? <ImageIcon size={16} /> : <Play size={16} />}>
                          {deckSlots[activeSlotIndex] ? 'Update active slot' : 'Add to active slot'}
                        </Button>
                      </div>
                    </div>
                    <div className="battle-custom-builder-action-panel">
                      <span className="battle-custom-builder-action-label">Batch import</span>
                      <div className="battle-builder-actions battle-custom-builder-actions">
                        <Button
                          variant="ghost"
                          className="battle-custom-action-btn battle-custom-action-btn--import"
                          onClick={() => customFileInputRef.current?.click()}
                          disabled={isImportingCustomFiles || isValidatingCustomEntry}
                          icon={(isImportingCustomFiles || isValidatingCustomEntry) ? <Loader2 size={16} className="animate-spin" /> : (isCustomImageEntityType ? <ImageIcon size={16} /> : <Play size={16} />)}
                        >
                          {isCustomImageEntityType ? 'Choose image files' : 'Choose video files'}
                        </Button>
                        <input
                          ref={customFileInputRef}
                          type="file"
                          style={{ display: 'none' }}
                          accept={isCustomImageEntityType ? 'image/*' : 'video/*'}
                          multiple
                          onChange={handleCustomFilesSelected}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="battle-custom-builder-footer">
                    <small>{isCustomImageEntityType ? 'Tip: tall images usually feel best in battle cards because the slot preview is portrait-first.' : 'Tip: YouTube links create nicer previews, while uploaded files are best when you want private clips in the deck.'}</small>
                    <span className="battle-builder-filter-chip">{filledSlotCount} / {deckSlots.length} slots filled</span>
                  </div>
                  {customValidation.status !== 'idle' ? (
                    <div className={`battle-custom-validation is-${customValidation.status}`}>
                      {customValidation.status === 'valid' ? <CheckCircle2 size={16} /> : null}
                      {customValidation.status === 'invalid' ? <AlertTriangle size={16} /> : null}
                      {customValidation.status === 'checking' ? <Loader2 size={16} className="animate-spin" /> : null}
                      <span>{customValidation.message}</span>
                    </div>
                  ) : null}
                </div>
              ) : isCatalogBusy ? (
                <div className="battle-catalog-grid">
                  {Array.from({ length: 10 }).map((_, i) => <BattleCatalogCardSkeleton key={i} />)}
                </div>
              ) : catalogError ? (
                <p>{catalogError}</p>
              ) : filteredCatalogCount === 0 ? (
                <p>{t('battle.filteredMatchNone', { unit: getLocalizedEntryUnitLabel(filters.entityType, t) })}</p>
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
              {!isCustomEntityType && filteredCatalogCount > 0 ? (
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
