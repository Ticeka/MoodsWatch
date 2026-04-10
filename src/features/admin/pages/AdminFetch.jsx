import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Download, Play, Square, RefreshCw,
  CheckCircle2, XCircle, SkipForward, Info,
  TrendingUp, Star, Flame, Clock, CalendarDays, Hash, Users, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ANILIST_CHARACTER_ROLE_OPTIONS,
  buildFilteredAniListCharStaffMedia,
  buildStoredCharacterKeySet,
  fetchAniListCharStaff,
  isAniListRateLimitError,
  buildResolvedTrailerPatch,
  buildAniListTrailerPatch,
  buildPreferredTitleSearchNames,
  fetchAdminAniListCharStaffTargets,
  fetchAdminJikanPage,
  fetchAdminPornhwaDbPage,
  fetchAdminPornhwaCharacterTargets,
  fetchAdminThemeTargets,
  fetchAdminTrailerTargets,
  fetchAniListTrailerById,
  fetchPornhwaDbCharactersViaProxy as fetchPornhwaDbCharactersViaProxyApi,
  fetchExistingTitleCharStaffState,
  getOrderedAliasValues,
  getMediaDisplayTitle,
  isBoysLovePornhwaEntry,
  normalizeMedia as normalizeMediaApi,
  normalizeJikanMangaEntry,
  normalizePornhwaDbEntry,
  replaceTitleThemeSongs as replaceTitleThemeSongsApi,
  resolveAdminTrailerFromFallbackSources,
  resolveAniListTrailerBySearch,
  resolveAnimeThemesMatch,
  updateAdminTitleTrailerPatch,
  upsertAdminTitleSourceRef,
  upsertCharStaff as upsertCharStaffApi,
  upsertJikanTitle as upsertJikanTitleApi,
  upsertPornhwaDbCharacters as upsertPornhwaDbCharactersApi,
  upsertPornhwaDbTitle as upsertPornhwaDbTitleApi,
  upsertTitle as upsertTitleApi,
} from '@/features/admin/api';
import { Chip, Section, Stepper, Toggle } from '@/features/admin/components/AdminFetchPrimitives';
import { supabase } from '@/shared/lib/supabase';
import { fetchAniListGraphQL } from '@/shared/lib/anilist';
import { useLanguage } from '@/shared/contexts/LanguageContext';

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── AniList ─────────────────────────────────────────────────────────────────

const GQL = `query($page:Int!$perPage:Int!$type:MediaType!$sort:[MediaSort!]$formatIn:[MediaFormat!]$status:MediaStatus$countryOfOrigin:CountryCode$averageScoreGreater:Int$popularityGreater:Int){Page(page:$page,perPage:$perPage){pageInfo{currentPage hasNextPage}media(type:$type,sort:$sort,isAdult:false,format_in:$formatIn,status:$status,countryOfOrigin:$countryOfOrigin,averageScore_greater:$averageScoreGreater,popularity_greater:$popularityGreater){id type format status seasonYear episodes duration chapters volumes countryOfOrigin isAdult popularity averageScore description(asHtml:false)siteUrl title{romaji english native}synonyms coverImage{extraLarge large}bannerImage genres tags{name rank} trailer{id site thumbnail}}}}`;

async function fetchAniListPage(vars, signal) {
  const data = await fetchAniListGraphQL(GQL, vars, { signal });
  return data?.Page;
}

const ANILIST_RATE_LIMIT_TITLE_COOLDOWN_MS = 8000;

function hasPornhwaDbNextPage(pageData, page, perPage) {
  const pagination = pageData?.pagination || {};
  if (typeof pagination.hasNextPage === 'boolean') return pagination.hasNextPage;
  if (typeof pagination.has_next_page === 'boolean') return pagination.has_next_page;

  const totalPages = Number(pagination.totalPages || pagination.total_pages || 0);
  if (totalPages > 0) return page < totalPages;

  const total = Number(pagination.total || pagination.totalItems || pagination.total_items || 0);
  if (total > 0) return page * perPage < total;

  return Array.isArray(pageData?.data) && pageData.data.length >= perPage;
}

// ─── Config options ───────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'POPULARITY_DESC', labelKey: 'admin.fetch.sortPopularity', icon: TrendingUp },
  { value: 'SCORE_DESC', labelKey: 'admin.fetch.sortScore', icon: Star },
  { value: 'TRENDING_DESC', labelKey: 'admin.fetch.sortTrending', icon: Flame },
  { value: 'UPDATED_AT_DESC', labelKey: 'admin.fetch.sortUpdated', icon: Clock },
  { value: 'START_DATE_DESC', labelKey: 'admin.fetch.sortStartDate', icon: CalendarDays },
  { value: 'ID_DESC', labelKey: 'admin.fetch.sortIdDesc', icon: Hash },
];

const ANIME_FORMATS = [
  { value: '', labelKey: 'admin.fetch.formatAll' },
  { value: 'TV', labelKey: 'admin.fetch.formatTv' },
  { value: 'MOVIE', labelKey: 'admin.fetch.formatMovie' },
  { value: 'OVA', labelKey: 'admin.fetch.formatOva' },
  { value: 'ONA', labelKey: 'admin.fetch.formatOna' },
  { value: 'SPECIAL', labelKey: 'admin.fetch.formatSpecial' },
];

const MANGA_SUBTYPES = [
  { value: '', labelKey: 'admin.fetch.subtypeAll', country: '', format: '' },
  { value: 'JP', labelKey: 'admin.fetch.subtypeMangaJp', country: 'JP', format: '' },
  { value: 'KR', labelKey: 'admin.fetch.subtypeManhwaKr', country: 'KR', format: '' },
  { value: 'CN', labelKey: 'admin.fetch.subtypeManhuaCn', country: 'CN', format: '' },
  { value: 'NOVEL', labelKey: 'admin.fetch.subtypeNovel', country: '', format: 'NOVEL' },
  { value: 'ONE_SHOT', labelKey: 'admin.fetch.subtypeOneShot', country: '', format: 'ONE_SHOT' },
];

const STATUS_OPTIONS = [
  { value: '', labelKey: 'admin.fetch.statusAll' },
  { value: 'RELEASING', labelKey: 'admin.fetch.statusReleasing' },
  { value: 'FINISHED', labelKey: 'admin.fetch.statusFinished' },
  { value: 'NOT_YET_RELEASED', labelKey: 'admin.fetch.statusNotYetReleased' },
  { value: 'HIATUS', labelKey: 'admin.fetch.statusHiatus' },
  { value: 'CANCELLED', labelKey: 'admin.fetch.statusCancelled' },
];

const LOG_ICON = {
  imported: <CheckCircle2 size={12} />,
  updated: <RefreshCw size={12} />,
  skipped: <SkipForward size={12} />,
  error: <XCircle size={12} />,
  info: <Info size={12} />,
  success: <CheckCircle2 size={12} />,
};
const LOG_COLOR = {
  imported: '#16a34a', updated: '#2563eb', skipped: '#9ca3af',
  error: '#dc2626', info: 'var(--text-tertiary)', success: '#16a34a',
};

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  type: 'ANIME',
  sort: 'POPULARITY_DESC',
  animeFormat: '',
  mangaSubtype: '',   // '' | 'JP' | 'KR' | 'CN' | 'NOVEL' | 'ONE_SHOT'
  status: '',
  minScore: '',
  minPopularity: '',
  pages: 3,
  perPage: 25,
};

export function AdminFetch() {
  const { t, language } = useLanguage();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('titles');
  const [csConfig, setCsConfig] = useState({
    onlyMissing: true,
    limit: 50,
    titleSort: 'popular',
    allowedRoles: [...ANILIST_CHARACTER_ROLE_OPTIONS],
    imageOnly: false,
    maxCharactersPerTitle: 0,
    delayMs: 1200,
    skipSatisfied: true,
  });
  const [jikanConfig, setJikanConfig] = useState({ sort: 'score', pages: 3, perPage: 25 });
  const [pornhwaConfig, setPornhwaConfig] = useState({
    sort: 'updated_at',
    status: 'On Going',
    orientation: '',
    tags: '',
    pages: 5,
    perPage: 50,
    minRatings: 3,
    apiKey: localStorage.getItem('admin-pornhwadb-api-key') || '',
  });
  const [pornhwaCharsConfig, setPornhwaCharsConfig] = useState({
    onlyMissing: true,
    limit: 50,
    delayMs: 800,
  });
  const [trailerConfig, setTrailerConfig] = useState({
    mode: 'batch',
    onlyMissing: true,
    category: 'all',
    limit: 100,
    delayMs: 1200,
    titleQuery: '',
  });
  const [themeConfig, setThemeConfig] = useState({ onlyMissing: true, limit: 100, delayMs: 1200 });
  const abortRef = useRef(null);
  const logContainerRef = useRef(null);

  const set = useCallback((key, value) => setConfig((p) => ({ ...p, [key]: value })), []);

  const addLog = useCallback((type, message) => {
    const locale = language === 'th' ? 'th-TH' : 'en-US';
    const entry = { id: `${Date.now()}-${Math.random()}`, type, message, time: new Date().toLocaleTimeString(locale) };
    setLogs((p) => { const n = [...p, entry]; return n.length > 200 ? n.slice(-200) : n; });
  }, [language]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('admin-pornhwadb-api-key', pornhwaConfig.apiKey || '');
  }, [pornhwaConfig.apiKey]);

  // Build AniList variables from config
  const buildVars = useCallback((page) => {
    const mangaSub = MANGA_SUBTYPES.find((s) => s.value === config.mangaSubtype) || MANGA_SUBTYPES[0];
    return {
      type: config.type,
      sort: [config.sort],
      perPage: config.perPage,
      page,
      ...(config.type === 'ANIME' && config.animeFormat ? { formatIn: [config.animeFormat] } : {}),
      ...(config.type === 'MANGA' && mangaSub.format ? { formatIn: [mangaSub.format] } : {}),
      ...(config.type === 'MANGA' && mangaSub.country ? { countryOfOrigin: mangaSub.country } : {}),
      ...(config.status ? { status: config.status } : {}),
      ...(config.minScore ? { averageScoreGreater: Number(config.minScore) } : {}),
      ...(config.minPopularity ? { popularityGreater: Number(config.minPopularity) } : {}),
    };
  }, [config]);

  const trailerCategoryOptions = [
    { value: 'all', label: t('admin.titles.allSubtypes') },
    { value: 'anime', label: t('admin.titles.subtypeAnime') },
    { value: 'manga', label: t('admin.titles.subtypeManga') },
    { value: 'manhwa', label: t('admin.titles.subtypeManhwa') },
    { value: 'manhua', label: t('admin.titles.subtypeManhua') },
    { value: 'webtoon', label: t('admin.titles.subtypeWebtoon') },
  ];

  const handleFetch = async () => {
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: config.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });

    const sortLabel = t(SORT_OPTIONS.find((s) => s.value === config.sort)?.labelKey || 'admin.fetch.sortPopularity');
    addLog('info', t('admin.fetch.logStart', { type: config.type, sort: sortLabel }));

    try {
      for (let page = 1; page <= config.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', t('admin.fetch.logPage', { page, total: config.pages }));

        let pageData;
        try {
          pageData = await fetchAniListPage(buildVars(page), abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', t('admin.fetch.logFetchFailed', { message: err.message }));
          break;
        }

        const items = pageData.media || [];
        addLog('info', t('admin.fetch.logItemsReceived', { count: items.length }));

        for (const media of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeMediaApi(media);
          try {
            const result = await upsertTitleApi(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported'
              ? t('admin.fetch.resultImported')
              : result === 'updated'
                ? t('admin.fetch.resultUpdated')
                : t('admin.fetch.resultSkipped');
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pageInfo?.hasNextPage) { addLog('info', t('admin.fetch.logNoNextPage')); break; }
        if (page < config.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 1200));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.logFinished'));
        toast.success(t('admin.fetch.fetchFinished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleCharStaff = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog('info', t('admin.fetch.cs.logStart'));

      const targets = await fetchAdminAniListCharStaffTargets({
        onlyMissing: csConfig.onlyMissing,
        titleSort: csConfig.titleSort,
        limit: csConfig.limit,
      });

      addLog('info', t('admin.fetch.cs.logTotal', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, chars: 0, staff: 0, skipped: 0, errors: 0 });
      let rateLimitCooldownMs = 0;

      for (const ref of targets) {
        if (abortRef.current.signal.aborted) break;
        try {
          const titleName = (Array.isArray(ref.canonical_titles)
            ? ref.canonical_titles[0]
            : ref.canonical_titles)?.canonical_title || `#${ref.canonical_title_id}`;
          const { charRows: existingRows, existingStaffCount } = await fetchExistingTitleCharStaffState(ref.canonical_title_id);
          const totalExistingCount = existingRows.length;
          const targetCharacterCount = csConfig.maxCharactersPerTitle > 0 ? csConfig.maxCharactersPerTitle : 0;
          if (rateLimitCooldownMs > 0) {
            addLog('info', `พัก ${rateLimitCooldownMs}ms หลังเจอ rate limit ก่อนดึง ${titleName}`);
            await sleep(rateLimitCooldownMs);
            rateLimitCooldownMs = 0;
          }
          if (csConfig.skipSatisfied) {
            const skipThreshold = csConfig.maxCharactersPerTitle > 0
              ? csConfig.maxCharactersPerTitle
              : 0;
            const charsSatisfied = skipThreshold > 0 && totalExistingCount >= skipThreshold;
            const staffSatisfied = (existingStaffCount || 0) >= 25;

            if (charsSatisfied && staffSatisfied) {
              setProgress((p) => ({ ...p, done: p.done + 1, skipped: (p.skipped || 0) + 1 }));
              addLog(
                'skipped',
                `[${ref.canonical_title_id}] ${titleName} — skip (chars ${totalExistingCount}/${skipThreshold}, staff ${existingStaffCount}/25)`,
              );
              continue;
            }
          }
          const missingCount = targetCharacterCount > 0
            ? Math.max(0, targetCharacterCount - totalExistingCount)
            : null;
          addLog(
            'info',
            targetCharacterCount > 0
              ? `กำลังดึงตัวละคร: ${titleName} (have ${totalExistingCount}/${targetCharacterCount}, missing ${missingCount})`
              : `กำลังดึงตัวละคร: ${titleName}`,
          );
          const media = await fetchAniListCharStaff(Number(ref.external_id), abortRef.current.signal, {
            ...csConfig,
            targetCharacterCount,
            existingCharacterKeys: buildStoredCharacterKeySet(existingRows, {
              allowedRoles: ANILIST_CHARACTER_ROLE_OPTIONS,
              imageOnly: false,
            }),
          });
          const rawCount = media?.characters?.edges?.length || 0;
          const filteredMedia = buildFilteredAniListCharStaffMedia(media, csConfig);
          const filteredCount = filteredMedia?.characters?.edges?.length || 0;
          const result = await upsertCharStaffApi(ref.canonical_title_id, filteredMedia, {
            pruneStaleCharacters: !filteredMedia?.syncMeta?.partialCharacterSync,
          });
          setProgress((p) => ({ ...p, done: p.done + 1, chars: p.chars + result.chars, staff: p.staff + result.staff }));
          const filterNote = filteredCount !== rawCount ? ` (filtered ${rawCount} -> ${filteredCount})` : '';
          const partialNote = filteredMedia?.syncMeta?.partialCharacterSync ? ' [partial top-up]' : '';
          addLog('imported', `[${ref.canonical_title_id}] ${titleName} — chars:${result.chars} staff:${result.staff}${filterNote}${partialNote}`);
          rateLimitCooldownMs = 0;
        } catch (err) {
          if (err.name === 'AbortError') break;
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `[${ref.canonical_title_id}] ${err.message}`);
          if (isAniListRateLimitError(err)) {
            rateLimitCooldownMs = Math.max(rateLimitCooldownMs, ANILIST_RATE_LIMIT_TITLE_COOLDOWN_MS);
          }
        }
        if (!abortRef.current.signal.aborted && csConfig.delayMs > 0) {
          await new Promise((r) => setTimeout(r, csConfig.delayMs));
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.cs.logFinished'));
        toast.success(t('admin.fetch.cs.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleTrailerBackfill = async () => {
    if (!supabase) {
      toast.error(t('admin.fetch.trailers.supabaseUnavailable'));
      return;
    }

    const explicitTitleQuery = String(trailerConfig.titleQuery || '').trim();
    if (trailerConfig.mode === 'search' && !explicitTitleQuery) {
      toast.error(t('admin.fetch.trailers.titleQueryRequired'));
      return;
    }

    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog(
        'info',
        t('admin.fetch.trailers.logStart', {
          mode: trailerConfig.mode === 'search'
            ? t('admin.fetch.trailers.modeSearch')
            : trailerConfig.onlyMissing
              ? t('admin.fetch.trailers.modeMissing')
              : t('admin.fetch.trailers.modeRefresh'),
          delayMs: trailerConfig.delayMs,
        })
      );

      if (trailerConfig.mode === 'search') {
        addLog('info', t('admin.fetch.trailers.logSearchQuery', { query: explicitTitleQuery }));
      }

      const targets = await fetchAdminTrailerTargets({
        mode: trailerConfig.mode,
        onlyMissing: trailerConfig.onlyMissing,
        category: trailerConfig.category,
        limit: trailerConfig.limit,
        titleQuery: explicitTitleQuery,
      });

      addLog('info', t('admin.fetch.trailers.logTargets', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, updated: 0, noTrailer: 0, noMatch: 0, errors: 0 });

      if (targets.length === 0) {
        if (trailerConfig.mode === 'search') {
          addLog('success', t('admin.fetch.trailers.logNoLocalMatch', { query: explicitTitleQuery }));
          toast.success(t('admin.fetch.trailers.noLocalMatch'));
        } else {
          addLog('success', t('admin.fetch.trailers.logNothingToDo'));
          toast.success(t('admin.fetch.trailers.nothingToDo'));
        }
        return;
      }

      for (const target of targets) {
        if (abortRef.current.signal.aborted) break;

        const titleRecord = Array.isArray(target.canonical_titles)
          ? target.canonical_titles[0]
          : target.canonical_titles;
        const fallbackTitle = titleRecord?.canonical_title || `#${target.canonical_title_id}`;

        try {
          let media = null;
          let resolvedTrailer = null;

          if (target.external_id) {
            media = await fetchAniListTrailerById(Number(target.external_id), abortRef.current.signal);
          } else {
            const searchResult = await resolveAniListTrailerBySearch(
              titleRecord,
              abortRef.current.signal,
              trailerConfig.mode === 'search' ? explicitTitleQuery : ''
            );
            media = searchResult.media;
          }

          if (abortRef.current.signal.aborted) break;

          if (media?.id) {
            await upsertAdminTitleSourceRef({
              canonical_title_id: target.canonical_title_id,
              provider: 'anilist',
              external_id: String(media.id),
              external_url: media?.siteUrl || null,
              source_priority: titleRecord?.type === 'anime' ? 10 : 20,
              raw_payload: media,
              last_synced_at: new Date().toISOString(),
              fetched_at: new Date().toISOString(),
            });
          }

          if (!media?.trailer?.id) {
            resolvedTrailer = await resolveAdminTrailerFromFallbackSources({
              titleRecord,
              preferredSearchName: trailerConfig.mode === 'search' ? explicitTitleQuery : '',
              searchNames: buildPreferredTitleSearchNames(
                titleRecord,
                trailerConfig.mode === 'search' ? [explicitTitleQuery] : []
              ),
              aliases: getOrderedAliasValues(titleRecord),
            });
          }

          if (!media && !resolvedTrailer) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noMatch: current.noMatch + 1,
            }));
            addLog('skipped', t('admin.fetch.trailers.logNoMatch', { title: fallbackTitle }));
          } else if (!media?.trailer?.id && !resolvedTrailer) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noTrailer: current.noTrailer + 1,
            }));
            addLog('skipped', t('admin.fetch.trailers.logNoTrailer', { title: getMediaDisplayTitle(media) || fallbackTitle }));
          } else {
            const patch = media?.trailer?.id
              ? buildAniListTrailerPatch(media)
              : buildResolvedTrailerPatch(resolvedTrailer);
            const updateLabel = media?.trailer?.id
              ? getMediaDisplayTitle(media) || fallbackTitle
              : fallbackTitle;
            await updateAdminTitleTrailerPatch(target.canonical_title_id, patch);

            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              updated: current.updated + 1,
            }));
            addLog(
              'updated',
              t('admin.fetch.trailers.logUpdated', {
                title: updateLabel,
                site: patch.trailer_source || patch.trailer_site || 'external',
              })
            );
          }
        } catch (error) {
          if (error.name === 'AbortError') break;
          setProgress((current) => ({
            ...current,
            done: current.done + 1,
            errors: current.errors + 1,
          }));
          addLog('error', `[${fallbackTitle}] ${error.message}`);
        }

        if (!abortRef.current.signal.aborted && trailerConfig.delayMs > 0) {
          await sleep(trailerConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.trailers.logFinished'));
        toast.success(t('admin.fetch.trailers.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        addLog('error', error.message);
        toast.error(error.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleThemeBackfill = async () => {
    if (!supabase) {
      toast.error(t('admin.fetch.themes.supabaseUnavailable'));
      return;
    }

    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog(
        'info',
        t('admin.fetch.themes.logStart', {
          mode: themeConfig.onlyMissing
            ? t('admin.fetch.themes.modeMissing')
            : t('admin.fetch.themes.modeRefresh'),
          delayMs: themeConfig.delayMs,
        })
      );

      const targets = await fetchAdminThemeTargets({
        onlyMissing: themeConfig.onlyMissing,
        limit: themeConfig.limit,
      });

      addLog('info', t('admin.fetch.themes.logTargets', { count: targets.length }));
      setProgress({ total: targets.length, done: 0, synced: 0, rows: 0, noMatch: 0, errors: 0 });

      if (targets.length === 0) {
        addLog('success', t('admin.fetch.themes.logNothingToDo'));
        toast.success(t('admin.fetch.themes.nothingToDo'));
        return;
      }

      for (const titleRecord of targets) {
        if (abortRef.current.signal.aborted) break;

        const fallbackTitle = titleRecord?.canonical_title || `#${titleRecord?.id}`;

        try {
          const matched = await resolveAnimeThemesMatch(titleRecord, abortRef.current.signal);

          if (!matched?.candidate) {
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              noMatch: current.noMatch + 1,
            }));
            addLog('skipped', t('admin.fetch.themes.logNoMatch', { title: fallbackTitle }));
          } else {
            const result = await replaceTitleThemeSongsApi(titleRecord.id, matched);
            setProgress((current) => ({
              ...current,
              done: current.done + 1,
              synced: current.synced + 1,
              rows: current.rows + result.rows,
            }));

            addLog(
              result.rows > 0 ? 'updated' : 'skipped',
              t(
                result.rows > 0 ? 'admin.fetch.themes.logSynced' : 'admin.fetch.themes.logNoThemes',
                {
                  title: fallbackTitle,
                  rows: result.rows,
                  match: matched.candidate?.name || fallbackTitle,
                }
              )
            );
          }
        } catch (error) {
          if (error.name === 'AbortError') break;
          setProgress((current) => ({
            ...current,
            done: current.done + 1,
            errors: current.errors + 1,
          }));
          addLog('error', `[${fallbackTitle}] ${error.message}`);
        }

        if (!abortRef.current.signal.aborted && themeConfig.delayMs > 0) {
          await sleep(themeConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', t('admin.fetch.themes.logFinished'));
        toast.success(t('admin.fetch.themes.finished'));
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        addLog('error', error.message);
        toast.error(error.message);
      }
    } finally {
      setRunning(false);
    }
  };

  const handlePornhwaCharsFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress(null);

    try {
      addLog('info', 'เริ่ม fetch Characters สำหรับ PornhwaDB titles...');

      const targets = await fetchAdminPornhwaCharacterTargets({
        onlyMissing: pornhwaCharsConfig.onlyMissing,
        limit: pornhwaCharsConfig.limit,
      });

      addLog('info', `พบ ${targets.length} titles ที่ต้องดึง characters`);
      setProgress({ total: targets.length, done: 0, chars: 0, errors: 0 });

      for (const ref of targets) {
        if (abortRef.current.signal.aborted) break;
        const titleName = (Array.isArray(ref.canonical_titles)
          ? ref.canonical_titles[0]
          : ref.canonical_titles)?.canonical_title || `#${ref.canonical_title_id}`;
        const slug = ref.raw_payload?.slug;
        if (!slug) {
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `${titleName}: ไม่พบ slug ใน raw_payload`);
          continue;
        }
        try {
          const result = await fetchPornhwaDbCharactersViaProxyApi(
            slug,
            pornhwaConfig.apiKey,
            abortRef.current.signal,
          );
          const count = await upsertPornhwaDbCharactersApi(ref.canonical_title_id, result?.data || []);
          setProgress((p) => ({ ...p, done: p.done + 1, chars: p.chars + count }));
          addLog('imported', `${titleName} — ${count} characters`);
        } catch (err) {
          if (err.name === 'AbortError') break;
          setProgress((p) => ({ ...p, done: p.done + 1, errors: p.errors + 1 }));
          addLog('error', `${titleName}: ${err.message}`);
        }
        if (!abortRef.current.signal.aborted && pornhwaCharsConfig.delayMs > 0) {
          await sleep(pornhwaCharsConfig.delayMs);
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'PornhwaDB Characters fetch เสร็จสมบูรณ์');
        toast.success('PornhwaDB Characters fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handleJikanFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: jikanConfig.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });
    addLog('info', `เริ่ม fetch Manhwa Adult จาก Jikan — ${jikanConfig.pages} หน้า, ${jikanConfig.perPage}/หน้า (ไม่มี BL)`);

    try {
      for (let page = 1; page <= jikanConfig.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${jikanConfig.pages}`);

        let pageData;
        try {
          pageData = await fetchAdminJikanPage(page, jikanConfig, abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `Fetch ล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.data || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const item of items) {
          if (abortRef.current.signal.aborted) break;
          const norm = normalizeJikanMangaEntry(item);
          try {
            const result = await upsertJikanTitleApi(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'นำเข้า' : result === 'updated' ? 'อัปเดต' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!pageData.pagination?.has_next_page) { addLog('info', 'ไม่มีหน้าถัดไป'); break; }
        // Jikan rate limit ~3 req/s — wait 400ms between pages
        if (page < jikanConfig.pages && !abortRef.current.signal.aborted) await new Promise((r) => setTimeout(r, 400));
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'Fetch เสร็จสมบูรณ์');
        toast.success('Jikan fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const handlePornhwaFetch = async () => {
    if (!supabase) { toast.error('Supabase unavailable'); return; }
    abortRef.current = new AbortController();
    setRunning(true);
    setLogs([]);
    setProgress({ page: 0, totalPages: pornhwaConfig.pages, fetched: 0, imported: 0, updated: 0, skipped: 0, errors: 0 });
    addLog('info', `เริ่ม fetch Adult Manhwa จาก PornhwaDB - ${pornhwaConfig.pages} หน้า, ${pornhwaConfig.perPage}/หน้า`);

    try {
      for (let page = 1; page <= pornhwaConfig.pages; page++) {
        if (abortRef.current.signal.aborted) break;
        setProgress((p) => ({ ...p, page }));
        addLog('info', `หน้า ${page}/${pornhwaConfig.pages}`);

        let pageData;
        try {
          pageData = await fetchAdminPornhwaDbPage(page, pornhwaConfig, abortRef.current.signal);
        } catch (err) {
          if (err.name === 'AbortError') break;
          addLog('error', `Fetch ล้มเหลว: ${err.message}`);
          break;
        }

        const items = pageData.data || [];
        addLog('info', `ได้รับ ${items.length} รายการ`);

        for (const item of items) {
          if (abortRef.current.signal.aborted) break;
          if (isBoysLovePornhwaEntry(item)) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, skipped: p.skipped + 1 }));
            addLog('skipped', `[ข้าม BL/Yaoi] ${item.title || item.id}`);
            continue;
          }
          const norm = normalizePornhwaDbEntry(item);
          try {
            const result = await upsertPornhwaDbTitleApi(norm, skipDuplicates);
            setProgress((p) => ({
              ...p, fetched: p.fetched + 1,
              imported: result === 'imported' ? p.imported + 1 : p.imported,
              updated: result === 'updated' ? p.updated + 1 : p.updated,
              skipped: result === 'skipped' ? p.skipped + 1 : p.skipped,
            }));
            const label = result === 'imported' ? 'นำเข้า' : result === 'updated' ? 'อัปเดต' : 'ข้าม';
            addLog(result, `[${label}] ${norm.displayTitle}`);
          } catch (err) {
            setProgress((p) => ({ ...p, fetched: p.fetched + 1, errors: p.errors + 1 }));
            addLog('error', `${norm.displayTitle}: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, 0));
        }

        if (!hasPornhwaDbNextPage(pageData, page, pornhwaConfig.perPage)) {
          addLog('info', 'ไม่มีหน้าถัดไป');
          break;
        }

        if (page < pornhwaConfig.pages && !abortRef.current.signal.aborted) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }

      if (!abortRef.current.signal.aborted) {
        addLog('success', 'PornhwaDB fetch เสร็จสมบูรณ์');
        toast.success('PornhwaDB fetch เสร็จสมบูรณ์');
      } else {
        addLog('info', t('admin.fetch.logStoppedByUser'));
        toast(t('admin.fetch.stopped'));
      }
    } catch (err) {
      if (err.name !== 'AbortError') { addLog('error', err.message); toast.error(err.message); }
    } finally {
      setRunning(false);
    }
  };

  const totalEstimate = config.pages * config.perPage;
  const pageProgress = progress ? Math.min(((progress.page - 1) / progress.totalPages) * 100, 100) : 0;

  return (
    <div className="admin-page-content">

      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            <Download size={24} /> {t('admin.fetch.pageTitle')}
          </h1>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {activeTab === 'titles'
              ? t('admin.fetch.pageSubtitle')
              : activeTab === 'themes'
                ? t('admin.fetch.themes.tabSubtitle')
                : activeTab === 'trailers'
                  ? t('admin.fetch.trailers.tabSubtitle')
                  : activeTab === 'pornhwa'
                    ? 'ดึง Adult Manhwa จาก PornhwaDB ผ่าน proxy'
                    : activeTab === 'pornhwa-chars'
                      ? 'ดึง Characters สำหรับ PornhwaDB titles ที่นำเข้าแล้ว'
                      : activeTab === 'jikan'
                        ? 'ดึง Manhwa Adult จาก MyAnimeList (ไม่มี BL)'
                        : t('admin.fetch.cs.tabSubtitle')}
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-default)', paddingBottom: 'var(--space-3)' }}>
        {[
          { id: 'titles', label: t('admin.fetch.tabTitles'), Icon: Download },
          { id: 'themes', label: t('admin.fetch.themes.tabTitle'), Icon: Hash },
          { id: 'trailers', label: t('admin.fetch.trailers.tabTitle'), Icon: RefreshCw },
          { id: 'pornhwa', label: 'PornhwaDB', Icon: Flame },
          { id: 'pornhwa-chars', label: 'PWDB Chars', Icon: Users },
          { id: 'jikan', label: 'Jikan (MAL)', Icon: Globe },
          { id: 'charstaff', label: t('admin.fetch.cs.tabTitle'), Icon: Users },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={running}
            onClick={() => { setActiveTab(id); setProgress(null); setLogs([]); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', borderRadius: 999, border: 'none',
              background: activeTab === id ? 'var(--primary-500)' : 'transparent',
              color: activeTab === id ? 'white' : 'var(--text-secondary)',
              fontWeight: 700, fontSize: '0.88rem',
              cursor: running ? 'default' : 'pointer', opacity: running ? 0.6 : 1,
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-5)', alignItems: 'start' }}>

        {/* ── Left: Config ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {activeTab === 'titles' ? (
            <>
              {/* 1. Type */}
              <Section title={t('admin.fetch.typeLabel')}>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  {[
                    { value: 'ANIME', label: t('admin.fetch.typeAnime'), emoji: '🎌' },
                    { value: 'MANGA', label: t('admin.fetch.typeManga'), emoji: '📚' },
                  ].map((tp) => (
                    <button
                      key={tp.value}
                      type="button"
                      disabled={running}
                      onClick={() => setConfig((p) => ({ ...p, type: tp.value, animeFormat: '', mangaSubtype: '' }))}
                      style={{
                        flex: 1, padding: 'var(--space-4)', borderRadius: 18, cursor: 'pointer',
                        border: `2px solid ${config.type === tp.value ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: config.type === tp.value
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s',
                        opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{tp.emoji}</div>
                      <div style={{ fontWeight: 700, color: config.type === tp.value ? 'var(--primary-700)' : 'var(--text-primary)', fontSize: '0.92rem' }}>
                        {tp.label}
                      </div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* 2. Subtype / Format */}
              <Section title={config.type === 'ANIME' ? t('admin.fetch.formatLabel') : t('admin.fetch.subtypeLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {config.type === 'ANIME'
                    ? ANIME_FORMATS.map((f) => (
                      <Chip key={f.value} active={config.animeFormat === f.value} disabled={running}
                        onClick={() => set('animeFormat', f.value)}>
                        {t(f.labelKey)}
                      </Chip>
                    ))
                    : MANGA_SUBTYPES.map((s) => (
                      <Chip key={s.value} active={config.mangaSubtype === s.value} disabled={running}
                        onClick={() => set('mangaSubtype', s.value)}>
                        {t(s.labelKey)}
                      </Chip>
                    ))
                  }
                </div>
                {config.type === 'MANGA' && config.mangaSubtype && (
                  <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {config.mangaSubtype === 'KR' && t('admin.fetch.subtypeHintKr')}
                    {config.mangaSubtype === 'CN' && t('admin.fetch.subtypeHintCn')}
                    {config.mangaSubtype === 'JP' && t('admin.fetch.subtypeHintJp')}
                    {config.mangaSubtype === 'NOVEL' && t('admin.fetch.subtypeHintNovel')}
                    {config.mangaSubtype === 'ONE_SHOT' && t('admin.fetch.subtypeHintOneShot')}
                  </p>
                )}
              </Section>

              {/* 3. Sort */}
              <Section title={t('admin.fetch.sortLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {SORT_OPTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Chip key={s.value} active={config.sort === s.value} disabled={running}
                        onClick={() => set('sort', s.value)}>
                        <Icon size={13} />
                        {t(s.labelKey)}
                      </Chip>
                    );
                  })}
                </div>
              </Section>

              {/* 4. Status */}
              <Section title={t('admin.fetch.statusLabel')}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {STATUS_OPTIONS.map((s) => (
                    <Chip key={s.value} active={config.status === s.value} disabled={running}
                      onClick={() => set('status', s.value)}>
                      {t(s.labelKey)}
                    </Chip>
                  ))}
                </div>
              </Section>

              {/* 5. Score / Popularity filter */}
              <Section title={t('admin.fetch.extraFilters')}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Star size={13} /> {t('admin.fetch.scoreMin')}
                      <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(0–100)</span>
                    </label>
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} max={100} value={config.minScore} disabled={running}
                      onChange={(e) => set('minScore', e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp size={13} /> {t('admin.fetch.popularityMin')}
                    </label>
                    <input type="number" className="form-input" placeholder={t('admin.fetch.noLimitPlaceholder')}
                      min={0} value={config.minPopularity} disabled={running}
                      onChange={(e) => set('minPopularity', e.target.value)} />
                  </div>
                </div>
              </Section>
            </>
          ) : activeTab === 'themes' ? (
            <>
              <Section title={t('admin.fetch.themes.modeLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: true,
                      label: t('admin.fetch.themes.modeMissing'),
                      hint: t('admin.fetch.themes.modeMissingHint'),
                    },
                    {
                      key: false,
                      label: t('admin.fetch.themes.modeRefresh'),
                      hint: t('admin.fetch.themes.modeRefreshHint'),
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setThemeConfig((current) => ({ ...current, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${themeConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: themeConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: themeConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.sourceLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ padding: 'var(--space-4)', borderRadius: 18, background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                      {t('admin.fetch.themes.sourceTitle')}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
                      {t('admin.fetch.themes.sourceHint')}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={themeConfig.limit}
                    onChange={(value) => setThemeConfig((current) => ({ ...current, limit: value }))}
                    min={0}
                    max={1000}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.themes.limitHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.themes.delayLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={themeConfig.delayMs}
                    onChange={(value) => setThemeConfig((current) => ({ ...current, delayMs: value }))}
                    min={250}
                    max={5000}
                    step={250}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.themes.delayHint')}
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'trailers' ? (
            <>
              <Section title={t('admin.fetch.trailers.targetLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: 'batch',
                      label: t('admin.fetch.trailers.targetBatch'),
                      hint: t('admin.fetch.trailers.targetBatchHint'),
                    },
                    {
                      key: 'search',
                      label: t('admin.fetch.trailers.targetSearch'),
                      hint: t('admin.fetch.trailers.targetSearchHint'),
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={key}
                      type="button"
                      disabled={running}
                      onClick={() => setTrailerConfig((current) => ({ ...current, mode: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${trailerConfig.mode === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: trailerConfig.mode === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: trailerConfig.mode === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {trailerConfig.mode === 'batch' ? (
                <Section title={t('admin.fetch.trailers.modeLabel')}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {[
                      {
                        key: true,
                        label: t('admin.fetch.trailers.modeMissing'),
                        hint: t('admin.fetch.trailers.modeMissingHint'),
                      },
                      {
                        key: false,
                        label: t('admin.fetch.trailers.modeRefresh'),
                        hint: t('admin.fetch.trailers.modeRefreshHint'),
                      },
                    ].map(({ key, label, hint }) => (
                      <button
                        key={String(key)}
                        type="button"
                        disabled={running}
                        onClick={() => setTrailerConfig((current) => ({ ...current, onlyMissing: key }))}
                        style={{
                          padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                          border: `2px solid ${trailerConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                          background: trailerConfig.onlyMissing === key
                            ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                            : 'var(--bg-primary)',
                          textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: trailerConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                          {label}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                      </button>
                    ))}
                  </div>
                </Section>
              ) : (
                <Section title={t('admin.fetch.trailers.titleQueryLabel')}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={trailerConfig.titleQuery}
                      onChange={(event) => setTrailerConfig((current) => ({ ...current, titleQuery: event.target.value }))}
                      placeholder={t('admin.fetch.trailers.titleQueryPlaceholder')}
                      disabled={running}
                    />
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                      {t('admin.fetch.trailers.titleQueryHint')}
                    </p>
                  </div>
                </Section>
              )}

              <Section title={t('admin.fetch.trailers.categoryLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {trailerCategoryOptions.map((option) => (
                      <Chip
                        key={option.value}
                        active={trailerConfig.category === option.value}
                        disabled={running}
                        onClick={() => setTrailerConfig((current) => ({ ...current, category: option.value }))}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.categoryHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.limitLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.limit}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, limit: value }))}
                    min={0}
                    max={1000}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.limitHint')}
                  </p>
                </div>
              </Section>

              <Section title={t('admin.fetch.trailers.delayLabel')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={trailerConfig.delayMs}
                    onChange={(value) => setTrailerConfig((current) => ({ ...current, delayMs: value }))}
                    min={250}
                    max={5000}
                    step={250}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    {t('admin.fetch.trailers.delayHint')}
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'pornhwa' ? (
            <>
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Flame size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>PornhwaDB via Supabase Edge Function</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Adult manhwa metadata แบบ secure proxy สำหรับ admin/editor เท่านั้น
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="PornhwaDB API Key">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="pwdb_xxxxxxxxxxxxx"
                    value={pornhwaConfig.apiKey}
                    onChange={(event) => setPornhwaConfig((current) => ({ ...current, apiKey: event.target.value }))}
                    disabled={running}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Paste key ที่นี่ได้เลย ระบบจะใช้ค่านี้ก่อน secret ฝั่ง Supabase และ key ต้องขึ้นต้นด้วย <code>pwdb_</code>
                  </p>
                </div>
              </Section>

              <Section title="เรียงลำดับ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'updated_at', label: 'Updated', Icon: Clock },
                    { value: 'average_rating', label: 'Rating', Icon: Star },
                    { value: 'release_year', label: 'Release Year', Icon: CalendarDays },
                    { value: 'total_ratings', label: 'Ratings Count', Icon: Users },
                  ].map(({ value, label, Icon }) => (
                    <Chip key={value} active={pornhwaConfig.sort === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, sort: value }))}>
                      <Icon size={13} /> {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="สถานะ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: '', label: 'All' },
                    { value: 'On Going', label: 'On Going' },
                    { value: 'Completed', label: 'Completed' },
                    { value: 'Hiatus', label: 'Hiatus' },
                  ].map(({ value, label }) => (
                    <Chip key={label} active={pornhwaConfig.status === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, status: value }))}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Orientation">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: '', label: 'All' },
                    { value: 'yuri', label: 'Yuri' },
                  ].map(({ value, label }) => (
                    <Chip key={label} active={pornhwaConfig.orientation === value} disabled={running}
                      onClick={() => setPornhwaConfig((p) => ({ ...p, orientation: value }))}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="Genre Tag (filter)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="เช่น Harem, Romance, Vanilla (เว้นว่างเพื่อดึงทั้งหมด)"
                    value={pornhwaConfig.tags}
                    onChange={(e) => setPornhwaConfig((p) => ({ ...p, tags: e.target.value }))}
                    disabled={running}
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {['', 'Harem', 'Romance', 'Vanilla', 'Office', 'Milf', 'Incest', 'NTR', 'Isekai', 'Fantasy', 'System', 'Netorare', 'Revenge', 'College', 'Action'].map((tag) => (
                      <Chip key={tag || 'all'} active={pornhwaConfig.tags === tag} disabled={running}
                        onClick={() => setPornhwaConfig((p) => ({ ...p, tags: tag }))}>
                        {tag || 'All'}
                      </Chip>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="ขั้นต่ำจำนวนเรต">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={pornhwaConfig.minRatings}
                    onChange={(v) => setPornhwaConfig((p) => ({ ...p, minRatings: v }))}
                    min={0}
                    max={500}
                    disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    ลดข้อมูลบางเกินไปก่อนนำเข้าฐาน
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'pornhwa-chars' ? (
            <>
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Users size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>PornhwaDB — Characters</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      ดึง characters ของ PornhwaDB titles ผ่าน proxy (ใช้ API Key จาก tab PornhwaDB)
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="โหมด">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    { key: true, label: 'เฉพาะที่ยังไม่มี characters', hint: 'ข้าม titles ที่มี characters ในฐานข้อมูลแล้ว' },
                    { key: false, label: 'Refresh ทั้งหมด', hint: 'ดึงซ้ำแม้จะมีข้อมูลอยู่แล้ว' },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setPornhwaCharsConfig((p) => ({ ...p, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${pornhwaCharsConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: pornhwaCharsConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: pornhwaCharsConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="จำนวนสูงสุด">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={pornhwaCharsConfig.limit}
                    onChange={(v) => setPornhwaCharsConfig((p) => ({ ...p, limit: v }))}
                    min={0} max={500} disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    0 = ไม่จำกัด — แต่ละ title ใช้ 1 API call
                  </p>
                </div>
              </Section>

              <Section title="Delay ระหว่าง title">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {[400, 800, 1200, 2000].map((ms) => (
                      <Chip key={ms} active={pornhwaCharsConfig.delayMs === ms} disabled={running}
                        onClick={() => setPornhwaCharsConfig((p) => ({ ...p, delayMs: ms }))}>
                        {ms}ms
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    ป้องกัน rate limit — แนะนำ 800ms+
                  </p>
                </div>
              </Section>
            </>
          ) : activeTab === 'jikan' ? (
            <>
              {/* Jikan — Source info */}
              <Section title="แหล่งข้อมูล">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}>
                  <Globe size={28} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Jikan API v4 (MyAnimeList)</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      Manhwa - Erotica (genre 49) - ไม่มี BL/Yaoi (genre 28, 26) - เรียงตาม Score
                    </div>
                  </div>
                </div>
              </Section>

              {/* Jikan — Sort */}
              <Section title="เรียงลำดับ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'score', label: 'Score', Icon: Star },
                    { value: 'scored_by', label: 'Most Rated', Icon: Users },
                    { value: 'popularity', label: 'Popularity', Icon: TrendingUp },
                    { value: 'start_date', label: 'Start Date', Icon: CalendarDays },
                  ].map(({ value, label, Icon }) => (
                    <Chip key={value} active={jikanConfig.sort === value} disabled={running}
                      onClick={() => setJikanConfig((p) => ({ ...p, sort: value }))}>
                      <Icon size={13} /> {label}
                    </Chip>
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* Characters & Staff — Mode */}
              <Section title="วิธีอัปเดตตัวละคร">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {[
                    {
                      key: true,
                      label: 'ดึงเฉพาะเรื่องที่ยังไม่มีตัวละคร',
                      hint: 'เร็วที่สุด เหมาะกับเติมฐานครั้งแรก ข้ามเรื่องที่มีตัวละครอยู่แล้วทั้งหมด',
                    },
                    {
                      key: false,
                      label: 'รีเช็กทุกเรื่องตามกติกาปัจจุบัน',
                      hint: 'ใช้ตอนต้องการเติมให้ครบตาม filter / max per title หรืออัปเดตข้อมูลเดิม',
                    },
                  ].map(({ key, label, hint }) => (
                    <button
                      key={String(key)}
                      type="button"
                      disabled={running}
                      onClick={() => setCsConfig((p) => ({ ...p, onlyMissing: key }))}
                      style={{
                        padding: 'var(--space-4)', borderRadius: 18, cursor: running ? 'default' : 'pointer',
                        border: `2px solid ${csConfig.onlyMissing === key ? 'var(--primary-500)' : 'var(--border-default)'}`,
                        background: csConfig.onlyMissing === key
                          ? 'color-mix(in srgb, var(--primary-500) 10%, transparent)'
                          : 'var(--bg-primary)',
                        textAlign: 'left', transition: 'all 0.15s', opacity: running ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: csConfig.onlyMissing === key ? 'var(--primary-700)' : 'var(--text-primary)', marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{hint}</div>
                    </button>
                  ))}
                </div>
              </Section>

              {/* Characters & Staff — Limit */}
              <Section title="จำนวนเรื่องสูงสุดต่อรอบ">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <Stepper
                    value={csConfig.limit}
                    onChange={(v) => setCsConfig((p) => ({ ...p, limit: v }))}
                    min={0} max={500} disabled={running}
                  />
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    0 = ไม่จำกัด แต่แนะนำแบ่งรันเป็นล็อตเล็กๆ เวลาทดสอบหรือเจอ rate limit
                  </p>
                </div>
              </Section>

              <Section title="ลำดับเรื่องที่จะวิ่งก่อน">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    { value: 'popular', label: 'Popular' },
                    { value: 'rated', label: 'Rated' },
                    { value: 'latest', label: 'Latest' },
                    { value: 'az', label: 'A-Z' },
                    { value: 'id', label: 'ID' },
                  ].map(({ value, label }) => (
                    <Chip
                      key={value}
                      active={csConfig.titleSort === value}
                      disabled={running}
                      onClick={() => setCsConfig((p) => ({ ...p, titleSort: value }))}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
                <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  ใช้กำหนดคิวเริ่มต้นของงาน เช่นอยากเก็บเรื่องดัง เรื่องคะแนนสูง หรือไล่ตามชื่อก่อน
                </p>
              </Section>

              <Section title="ชุดตั้งค่าสำเร็จรูป">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {[
                    {
                      label: 'เก็บให้ครบที่สุด',
                      apply: () => setCsConfig((p) => ({
                        ...p,
                        allowedRoles: [...ANILIST_CHARACTER_ROLE_OPTIONS],
                        imageOnly: false,
                        maxCharactersPerTitle: 0,
                        delayMs: 1200,
                      })),
                    },
                    {
                      label: 'เติมให้พร้อมทำเกม',
                      apply: () => setCsConfig((p) => ({
                        ...p,
                        allowedRoles: ['MAIN', 'SUPPORTING'],
                        imageOnly: true,
                        maxCharactersPerTitle: 24,
                        delayMs: 1200,
                      })),
                    },
                    {
                      label: 'เน้นตัวรองสำหรับเกมยาก',
                      apply: () => setCsConfig((p) => ({
                        ...p,
                        allowedRoles: ['SUPPORTING', 'BACKGROUND'],
                        imageOnly: true,
                        maxCharactersPerTitle: 20,
                        delayMs: 1200,
                      })),
                    },
                  ].map(({ label, apply }) => (
                    <Chip key={label} disabled={running} onClick={apply}>
                      {label}
                    </Chip>
                  ))}
                </div>
              </Section>

              <Section title="เลือกชนิดตัวละครที่จะเก็บ">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {ANILIST_CHARACTER_ROLE_OPTIONS.map((role) => {
                    const active = csConfig.allowedRoles.includes(role);
                    return (
                      <Chip
                        key={role}
                        active={active}
                        disabled={running}
                        onClick={() => setCsConfig((p) => {
                          const nextRoles = active
                            ? p.allowedRoles.filter((item) => item !== role)
                            : [...p.allowedRoles, role];
                          return {
                            ...p,
                            allowedRoles: nextRoles.length ? nextRoles : [role],
                          };
                        })}
                      >
                        {role}
                      </Chip>
                    );
                  })}
                </div>
                <p style={{ margin: 'var(--space-3) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  ใช้คุมว่ารอบนี้จะเก็บตัวหลัก ตัวรอง หรือตัวประกอบระดับไหนลงฐาน
                </p>
              </Section>

              <Section title="กติกาการเติมข้อมูล">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>ข้ามเรื่องที่มีครบตามเป้าแล้ว</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        ถ้ามีตัวละครครบตาม role / รูป / จำนวนที่ตั้งไว้แล้ว จะไม่ยิง AniList ซ้ำ
                      </div>
                    </div>
                    <Toggle
                      checked={csConfig.skipSatisfied}
                      onChange={(value) => setCsConfig((p) => ({ ...p, skipSatisfied: value }))}
                      disabled={running}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>เก็บเฉพาะตัวละครที่มีรูป</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                        เหมาะกับงานที่ต้องใช้ภาพจริง เช่น Title Guess หรือหน้าเลือกตัวละคร
                      </div>
                    </div>
                    <Toggle
                      checked={csConfig.imageOnly}
                      onChange={(value) => setCsConfig((p) => ({ ...p, imageOnly: value }))}
                      disabled={running}
                    />
                  </div>

                  <div>
                    <label className="form-label">เป้าหมายจำนวนตัวละครต่อเรื่อง</label>
                    <Stepper
                      value={csConfig.maxCharactersPerTitle}
                      onChange={(v) => setCsConfig((p) => ({ ...p, maxCharactersPerTitle: v }))}
                      min={0}
                      max={300}
                      disabled={running}
                    />
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                      0 = ไม่ตั้งเป้า ถ้าตั้งเลขไว้ ระบบจะพยายามเติมให้ถึงเลขนี้แล้วหยุด
                    </p>
                  </div>
                </div>
              </Section>

              <Section title="พักระหว่างแต่ละเรื่อง">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    {[0, 500, 1200, 2000, 3000].map((ms) => (
                      <Chip
                        key={ms}
                        active={csConfig.delayMs === ms}
                        disabled={running}
                        onClick={() => setCsConfig((p) => ({ ...p, delayMs: ms }))}
                      >
                        {ms === 0 ? 'No delay' : `${ms}ms`}
                      </Chip>
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    ใช้คุมความเร็วของ batch เพื่อลดโอกาสโดน rate limit แนะนำ 1200ms+ ถ้าดึงล็อตใหญ่
                  </p>
                </div>
              </Section>
            </>
          )}

        </div>

        {/* ── Right: Options + Action ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'calc(var(--header-height) + 1rem)' }}>

          {/* Pages + Per page (titles + pornhwa + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && (
            <Section title={t('admin.fetch.volumeLabel')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label className="form-label">{t('admin.fetch.pages')}</label>
                  {activeTab === 'titles'
                    ? <Stepper value={config.pages} onChange={(v) => set('pages', v)} min={1} max={20} disabled={running} />
                    : activeTab === 'jikan'
                      ? <Stepper value={jikanConfig.pages} onChange={(v) => setJikanConfig((p) => ({ ...p, pages: v }))} min={1} max={20} disabled={running} />
                      : <Stepper value={pornhwaConfig.pages} onChange={(v) => setPornhwaConfig((p) => ({ ...p, pages: v }))} min={1} max={20} disabled={running} />
                  }
                </div>
                <div>
                  <label className="form-label">{t('admin.fetch.perPage')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {(activeTab === 'jikan' ? [10, 25] : activeTab === 'pornhwa' ? [25, 50, 100] : [10, 25, 50]).map((n) => (
                      <Chip
                        key={n}
                        active={activeTab === 'titles' ? config.perPage === n : activeTab === 'jikan' ? jikanConfig.perPage === n : pornhwaConfig.perPage === n}
                        disabled={running}
                        onClick={() => activeTab === 'titles'
                          ? set('perPage', n)
                          : activeTab === 'jikan'
                            ? setJikanConfig((p) => ({ ...p, perPage: n }))
                            : setPornhwaConfig((p) => ({ ...p, perPage: n }))}
                      >
                        {n}
                      </Chip>
                    ))}
                  </div>
                  {activeTab === 'jikan' && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                      Jikan จำกัด 25 items/หน้า
                    </p>
                  )}
                  {activeTab === 'pornhwa' && (
                    <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                      PornhwaDB proxy รองรับได้ถึง 100 items/หน้า
                    </p>
                  )}
                </div>
                <div style={{
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  textAlign: 'center',
                }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ~{activeTab === 'titles'
                      ? totalEstimate
                      : activeTab === 'jikan'
                        ? jikanConfig.pages * jikanConfig.perPage
                        : pornhwaConfig.pages * pornhwaConfig.perPage}
                  </span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{t('admin.fetch.willFetch')}</p>
                </div>
              </div>
            </Section>
          )}

          {/* Duplicate mode (titles + pornhwa + jikan tabs) */}
          {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && (
            <Section title={t('admin.fetch.duplicateLabel')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', cursor: running ? 'default' : 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('admin.fetch.skipDuplicates')}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {skipDuplicates ? t('admin.fetch.skipOn') : t('admin.fetch.skipOff')}
                    </div>
                  </div>
                  <Toggle checked={skipDuplicates} onChange={setSkipDuplicates} disabled={running} />
                </label>
                <div style={{
                  fontSize: '0.78rem', color: 'var(--text-tertiary)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  lineHeight: 1.55,
                }}>
                  {skipDuplicates ? t('admin.fetch.skipHintOn') : t('admin.fetch.skipHintOff')}
                </div>
              </div>
            </Section>
          )}

          {/* Action button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!running ? (
              <button type="button" className="primary-btn"
                onClick={
                  activeTab === 'titles'
                    ? handleFetch
                    : activeTab === 'themes'
                      ? handleThemeBackfill
                      : activeTab === 'trailers'
                        ? handleTrailerBackfill
                        : activeTab === 'pornhwa'
                          ? handlePornhwaFetch
                          : activeTab === 'pornhwa-chars'
                            ? handlePornhwaCharsFetch
                            : activeTab === 'jikan'
                              ? handleJikanFetch
                              : handleCharStaff
                }
                style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-4)' }}>
                <Play size={16} /> {
                  activeTab === 'titles'
                    ? t('admin.fetch.fetchBtn')
                    : activeTab === 'themes'
                      ? t('admin.fetch.themes.startBtn')
                      : activeTab === 'trailers'
                        ? trailerConfig.mode === 'search'
                          ? t('admin.fetch.trailers.startSearchBtn')
                          : t('admin.fetch.trailers.startBtn')
                        : activeTab === 'pornhwa'
                          ? 'Fetch PornhwaDB'
                          : activeTab === 'pornhwa-chars'
                            ? 'Fetch PWDB Characters'
                            : activeTab === 'jikan'
                              ? 'Fetch Manhwa Adult'
                              : t('admin.fetch.cs.startBtn')
                }
              </button>
            ) : (
              <button type="button" onClick={() => abortRef.current?.abort()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  padding: 'var(--space-4)', background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                  color: 'white', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.95rem',
                  cursor: 'pointer', boxShadow: '0 8px 20px rgba(220,38,38,0.3)',
                }}>
                <Square size={16} /> {t('admin.fetch.stopBtn')}
              </button>
            )}
            {progress && !running && (
              <button type="button" className="action-btn" onClick={() => { setProgress(null); setLogs([]); }}
                style={{ width: '100%', justifyContent: 'center' }}>
                {t('admin.fetch.clearResults')}
              </button>
            )}
          </div>

          {/* Progress stats */}
          {progress && (
            <Section title={running ? t('admin.fetch.runningTitle') : t('admin.fetch.resultTitle')}>
              {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan') && running && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.pageProgress', { page: progress.page, total: progress.totalPages })}</span>
                    <span>{t('admin.fetch.itemsProgress', { count: progress.fetched })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${pageProgress}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {(activeTab === 'charstaff' || activeTab === 'pornhwa-chars') && running && progress?.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{progress.done}/{progress.total}</span>
                    {activeTab === 'pornhwa-chars' && <span>{pornhwaCharsConfig.delayMs}ms delay</span>}
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {activeTab === 'trailers' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.trailers.progress', { done: progress.done, total: progress.total })}</span>
                    <span>{t('admin.fetch.trailers.delayProgress', { delayMs: trailerConfig.delayMs })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              {activeTab === 'themes' && running && progress.total > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                    <span>{t('admin.fetch.themes.progress', { done: progress.done, total: progress.total })}</span>
                    <span>{t('admin.fetch.themes.delayProgress', { delayMs: themeConfig.delayMs })}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      background: 'linear-gradient(90deg, var(--primary-500), var(--accent-500))',
                      width: `${Math.round((progress.done / progress.total) * 100)}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {(activeTab === 'titles' || activeTab === 'pornhwa' || activeTab === 'jikan'
                  ? [
                    { label: t('admin.fetch.statNew'), value: progress.imported, color: '#16a34a' },
                    { label: t('admin.fetch.statUpdated'), value: progress.updated, color: '#2563eb' },
                    { label: t('admin.fetch.statSkipped'), value: progress.skipped, color: 'var(--text-tertiary)' },
                    { label: t('admin.fetch.statErrors'), value: progress.errors, color: '#dc2626' },
                  ]
                  : activeTab === 'pornhwa-chars'
                    ? [
                      { label: 'Done', value: progress.done, color: '#2563eb' },
                      { label: 'Characters', value: progress.chars, color: '#16a34a' },
                      { label: 'Errors', value: progress.errors, color: '#dc2626' },
                      { label: 'Total', value: progress.total, color: 'var(--text-tertiary)' },
                    ]
                    : activeTab === 'themes'
                      ? [
                        { label: t('admin.fetch.themes.statSynced'), value: progress.synced, color: '#16a34a' },
                        { label: t('admin.fetch.themes.statRows'), value: progress.rows, color: '#2563eb' },
                        { label: t('admin.fetch.themes.statNoMatch'), value: progress.noMatch, color: 'var(--text-tertiary)' },
                        { label: t('admin.fetch.themes.statErrors'), value: progress.errors, color: '#dc2626' },
                      ]
                      : activeTab === 'trailers'
                        ? [
                          { label: t('admin.fetch.trailers.statDone'), value: progress.done, color: '#2563eb' },
                          { label: t('admin.fetch.trailers.statUpdated'), value: progress.updated, color: '#16a34a' },
                          { label: t('admin.fetch.trailers.statNoTrailer'), value: progress.noTrailer, color: 'var(--text-tertiary)' },
                          { label: t('admin.fetch.trailers.statNoMatch'), value: progress.noMatch, color: '#a16207' },
                          { label: t('admin.fetch.trailers.statErrors'), value: progress.errors, color: '#dc2626' },
                        ]
                        : [
                          { label: t('admin.fetch.cs.statDone'), value: progress.done, color: '#2563eb' },
                          { label: t('admin.fetch.cs.statChars'), value: progress.chars, color: '#16a34a' },
                          { label: t('admin.fetch.cs.statStaff'), value: progress.staff, color: '#7c3aed' },
                          { label: 'Skipped', value: progress.skipped, color: '#a16207' },
                          { label: t('admin.fetch.cs.statErrors'), value: progress.errors, color: '#dc2626' },
                        ]
                ).map((stat) => (
                  <div key={stat.label} style={{
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: stat.color }}>{stat.value ?? 0}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 1 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      </div>

      {/* ── Log ── */}
      {logs.length > 0 && (
        <div style={{
          marginTop: 'var(--space-5)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--paper-tint) 96%, transparent), color-mix(in srgb, var(--bg-elevated) 98%, transparent))',
          border: '1px solid color-mix(in srgb, var(--ink-900) 8%, transparent)',
          borderRadius: 24, padding: 'var(--space-5)',
          overflowAnchor: 'none',
        }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logTitle')}
          </p>
          <div ref={logContainerRef} style={{
            maxHeight: 320, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
            fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace', fontSize: '0.76rem',
            overflowAnchor: 'none',
          }}>
            {logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem', padding: '0.18rem 0.2rem', color: LOG_COLOR[log.type] }}>
                <span style={{ flexShrink: 0 }}>{LOG_ICON[log.type]}</span>
                <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, fontSize: '0.7rem' }}>{log.time}</span>
                <span style={{ wordBreak: 'break-word', color: LOG_COLOR[log.type] }}>{log.message}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>
            {t('admin.fetch.logItems', { count: logs.length })}
          </p>
        </div>
      )}

      {/* ── Empty state ── */}
      {!progress && logs.length === 0 && (
        <div className="admin-empty-state" style={{ marginTop: 'var(--space-5)' }}>
          <Download size={26} style={{ color: 'var(--text-tertiary)', marginBottom: '0.75rem' }} />
          <span className="admin-state-title">{t('admin.fetch.readyTitle')}</span>
          <p className="admin-state-description">
            {t('admin.fetch.readyHint')}
          </p>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default AdminFetch;
