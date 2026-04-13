import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Copy,
  LibrarySquare,
  Link2,
  Loader2,
  Sparkles,
  TimerReset,
  Users2,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  PARTY_VOTE_PLAYBACK_MODES,
  createPartySettings,
  getPartyCurrentRound,
  getPartyPresetById,
} from '@/features/party/lib/partyEngine';
import { resumePartyAudioContext } from '@/features/party/lib/partyAudio';
import { broadcastPartyRoomEvent } from '@/features/party/api/partyRealtimeApi';
import {
  closePartyRoom,
  extendPartyQuestionPhase,
  fetchPartyRoomBundle,
  fetchPartyTemplates,
  fetchPartyTemplateDetail,
  fetchPartyTemplateSongPool,
  fetchPartyTemplateSongPoolForVote,
  fetchPublishedPartySongPresets,
  fetchPartyTitleGuessSets,
  getPartyBackendHint,
  getPartyGuestToken,
  joinPartyRoom,
  leavePartyRoom,
  readPartyProfile,
  resetPartyRoom,
  startPartyMatch,
  submitPartyAnswer,
  subscribeToPartyRoom,
  togglePartyMemberReady,
  updatePartyRoomSettings,
} from '@/features/party/api/partyRemoteApi';
import {
  analyzePartyTemplateCompatibility,
} from '@/features/party/lib/partyTemplateUtils';
import {
  getPartyRoomSettingsDraftKey,
  readPartyDraft,
  writePartyDraft,
} from '@/features/party/lib/partyDraftStorage';
import {
  buildPartyProfile,
  getCountdownSeconds,
  getPartyPrefetchPreloadValue,
  getPartyPrefetchRound,
  playPartyCountdownAlert,
  readPartyAudioVolume,
} from '@/features/party/lib/partyRoomUtils';
import { getPartyTemplateReasonText, serializePartySettingsSnapshot } from '@/features/party/lib/partyRoomPresentation';
import { useCurrentPartyMember } from '@/features/party/lib/usePartyRoomSelectors';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import {
  PartyAutoAdvance,
  PartyCountdownDisplay,
  PartyIdentityAvatar,
  PresetCard,
} from '@/features/party/components/PartyRoomShared';
import { fetchPublicBattleDecks } from '@/features/battle/api/battleRemoteApi';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { PartyFinalView } from './PartyFinal';
import { PartyLobbyView } from './PartyLobby';
import { PartyQuestionView } from './PartyQuestion';
import { PartyRevealView } from './PartyReveal';
import { PartyVoteRoomView } from '../components/PartyVoteRoomView';
import '../styles/Party.css';

const PARTY_LOBBY_AUTOSAVE_DELAY_MS = 900;

function mapBattleDeckToPartyPool(deck = {}) {
  const titles = Array.isArray(deck?.titles) ? deck.titles : [];
  return titles.map((title, index) => {
    const hasYouTube = title.trailer_video_id && (!title.trailer_site || title.trailer_site === 'youtube');
    const directUrl = title.video_url || title.trailer_url || '';
    const hasMedia = !!(hasYouTube || directUrl);

    return {
      id: 0,
      templateItemId: Number(title.id || index + 1),
      themeType: title.theme_type || '',
      songTitle: title.song_title || title.title_en || title.name_full || '',
      artistName: title.artist_name || '',
      mediaUrl: hasYouTube ? '' : directUrl,
      sourceTitleId: Number(title.id || 0),
      sourceTitleName: title.title_en || title.name_full || '',
      coverUrl: getTitleArtwork(title),
      provider: hasYouTube ? 'youtube' : 'catalog',
      providerMediaId: hasYouTube ? title.trailer_video_id : null,
      isImageOnly: !hasMedia,
    };
  });
}

async function fetchBattleDeckById(deckId) {
  const targetId = String(deckId || '').trim();
  if (!targetId) {
    return null;
  }

  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const decks = await fetchPublicBattleDecks({ limit: pageSize, offset });
    if (!Array.isArray(decks) || decks.length === 0) {
      return null;
    }

    const matchedDeck = decks.find((deck) => String(deck?.id || '') === targetId);
    if (matchedDeck) {
      return matchedDeck;
    }

    if (decks.length < pageSize) {
      return null;
    }
  }

  return null;
}

export function PartyRoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const guestToken = useMemo(() => getPartyGuestToken(), []);
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const room = usePartyRoomStore((state) => state.room);
  const currentMember = useCurrentPartyMember(guestToken, partyProfile);
  const syncState = usePartyRoomStore((state) => state.syncState);
  const syncError = usePartyRoomStore((state) => state.syncError);
  const lastSyncedAt = usePartyRoomStore((state) => state.lastSyncedAt);
  const setBundle = usePartyRoomStore((state) => state.setBundle);
  const clearBundle = usePartyRoomStore((state) => state.clearBundle);
  const applyEvent = usePartyRoomStore((state) => state.applyEvent);
  const setSyncState = usePartyRoomStore((state) => state.setSyncState);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [reactionFeed, setReactionFeed] = useState([]);
  const [roomSettingsDraft, setRoomSettingsDraft] = useState(() => createPartySettings({}));
  const roomSettingsDraftStorageKey = useMemo(() => getPartyRoomSettingsDraftKey(roomCode), [roomCode]);
  const [selectedTemplateIntent, setSelectedTemplateIntent] = useState(null);
  const [songPresetOptions, setSongPresetOptions] = useState([]);
  const [templateOptions, setTemplateOptions] = useState([]);
  const [titleGuessSetOptions, setTitleGuessSetOptions] = useState([]);
  const [titleGuessSetsLoading, setTitleGuessSetsLoading] = useState(false);
  const [draftTemplatePlayablePool, setDraftTemplatePlayablePool] = useState([]);
  const [draftTemplatePoolLoaded, setDraftTemplatePoolLoaded] = useState(false);
  const [playbackEndedAtMs, setPlaybackEndedAtMs] = useState(null);
  const [revealPlaybackStartedAtMs, setRevealPlaybackStartedAtMs] = useState(null);
  const [revealPrefetchReady, setRevealPrefetchReady] = useState(false);
  const countdownAlertedSecondRef = useRef(null);
  const answerAlertedSecondRef = useRef(null);
  const questionPlaybackAdjustedRef = useRef(false);
  const loadPromiseRef = useRef(null);
  const activeRoomCodeRef = useRef(roomCode);
  const activeRoomIdRef = useRef(null);
  const activePhaseRef = useRef(null);
  const hasRealtimeSubscriptionRef = useRef(false);
  const shouldResyncOnSubscribeRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  const hiddenAtRef = useRef(0);
  const pageUnloadRef = useRef(false);
  const lastAppliedRoomSettingsSnapshotRef = useRef('');
  const isAutosavingRef = useRef(false);
  const roomSettingsDraftHydratedKeyRef = useRef('');
  const battleDeckPoolIdRef = useRef('');

  const pendingTemplateSelection = useMemo(() => {
    const templateId = searchParams.get('templateId');
    if (!templateId) {
      return null;
    }

    const templateName = searchParams.get('templateName');
    const modeType = searchParams.get('modeType');
    const modeScope = searchParams.get('modeScope') || 'all';
    const presetId = searchParams.get('presetId');
    const resolvedMode = (modeType === 'vote' || modeType === 'quiz')
      ? modeType
      : modeScope === 'vote'
        ? 'vote'
        : 'quiz';

    return {
      templateId,
      templateName: templateName ? decodeURIComponent(templateName) : '',
      modeType: resolvedMode,
      modeScope,
      presetId: presetId || '',
    };
  }, [searchParams]);

  const pendingTitleGuessSelection = useMemo(() => {
    const titleGuessSetId = searchParams.get('titleGuessSetId');
    if (!titleGuessSetId) {
      return null;
    }

    return {
      titleGuessSetId: String(titleGuessSetId).trim(),
      modeType: 'title-guess',
    };
  }, [searchParams]);

  const pendingBattleDeckId = useMemo(() => {
    const battleDeckId = searchParams.get('battleDeckId');
    return battleDeckId ? String(battleDeckId).trim() : null;
  }, [searchParams]);

  const [battleDeckPool, setBattleDeckPool] = useState(null);

  useEffect(() => {
    activeRoomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    roomSettingsDraftHydratedKeyRef.current = '';
    lastAppliedRoomSettingsSnapshotRef.current = '';
  }, [roomSettingsDraftStorageKey]);

  useEffect(() => {
    if (!roomSettingsDraftStorageKey || roomSettingsDraftHydratedKeyRef.current === roomSettingsDraftStorageKey) {
      return;
    }

    const storedDraft = readPartyDraft(roomSettingsDraftStorageKey);
    if (storedDraft?.settings) {
      setRoomSettingsDraft(createPartySettings(storedDraft.settings));
    }
    if (typeof storedDraft?.appliedSnapshot === 'string') {
      lastAppliedRoomSettingsSnapshotRef.current = storedDraft.appliedSnapshot;
    }

    roomSettingsDraftHydratedKeyRef.current = roomSettingsDraftStorageKey;
  }, [roomSettingsDraftStorageKey]);

  useEffect(() => {
    if (!roomSettingsDraftStorageKey || roomSettingsDraftHydratedKeyRef.current !== roomSettingsDraftStorageKey) {
      return;
    }

    writePartyDraft(roomSettingsDraftStorageKey, {
      settings: roomSettingsDraft,
      appliedSnapshot: lastAppliedRoomSettingsSnapshotRef.current
        || (room?.settings ? serializePartySettingsSnapshot(room.settings) : ''),
    });
  }, [room?.settings, roomSettingsDraft, roomSettingsDraftStorageKey]);

  useEffect(() => {
    activeRoomIdRef.current = room?.id || null;
  }, [room?.id]);

  useEffect(() => {
    if (!pendingTemplateSelection) {
      return;
    }

    setSelectedTemplateIntent(pendingTemplateSelection);
    setBattleDeckPool(null);
    battleDeckPoolIdRef.current = '';
    setRoomSettingsDraft((current) => createPartySettings({
      ...current,
      templateId: pendingTemplateSelection.templateId,
      templateName: pendingTemplateSelection.templateName || current.templateName,
      modeType: pendingTemplateSelection.modeType,
      modeScope: pendingTemplateSelection.modeScope,
      presetId: pendingTemplateSelection.presetId || current.presetId,
      categoryId: 'all',
      songPresetId: '',
      songPresetName: '',
      battleDeckId: '',
    }));

    navigate(`/party/room/${roomCode}`, { replace: true });
  }, [navigate, pendingTemplateSelection, roomCode]);

  useEffect(() => {
    if (!pendingTitleGuessSelection?.titleGuessSetId) {
      return;
    }

    setSelectedTemplateIntent(null);
    setBattleDeckPool(null);
    battleDeckPoolIdRef.current = '';
    setRoomSettingsDraft((current) => createPartySettings({
      ...current,
      modeType: 'title-guess',
      templateId: '',
      templateName: '',
      templateCoverUrl: '',
      templatePlayableCount: 0,
      modeScope: 'all',
      titleGuessSetId: pendingTitleGuessSelection.titleGuessSetId,
    }));

    navigate(`/party/room/${roomCode}`, { replace: true });
  }, [navigate, pendingTitleGuessSelection, roomCode]);

  useEffect(() => {
    if (!pendingBattleDeckId) {
      return;
    }

    let ignore = false;
    setSelectedTemplateIntent(null);
    fetchBattleDeckById(pendingBattleDeckId)
      .then((deck) => {
        if (ignore) return;
        if (!deck || !Array.isArray(deck.titles) || deck.titles.length < 2) {
          toast.error(pick('ไม่พบ Battle Deck หรือมีรายการไม่พอ', 'Battle Deck not found or not enough entries'));
          return;
        }

        const pool = mapBattleDeckToPartyPool(deck);

        setBattleDeckPool(pool);
        battleDeckPoolIdRef.current = String(deck.id || '');
        setRoomSettingsDraft((current) => createPartySettings({
          ...current,
          modeType: 'vote',
          templateId: '',
          templateName: deck.label || 'Battle Deck',
          templateCoverUrl: pool[0]?.coverUrl || '',
          templatePlayableCount: pool.length,
          modeScope: 'vote',
          categoryId: 'all',
          songPresetId: '',
          songPresetName: '',
          battleDeckId: String(deck.id || ''),
        }));
        navigate(`/party/room/${roomCode}`, { replace: true });
      })
      .catch(() => {
        if (!ignore) {
          toast.error(pick('โหลด Battle Deck ไม่สำเร็จ', 'Failed to load Battle Deck'));
          navigate(`/party/room/${roomCode}`, { replace: true });
        }
      });

    return () => { ignore = true; };
  }, [navigate, pendingBattleDeckId, pick, roomCode]);

  const loadBundle = React.useCallback(async ({ silent = false, force = false } = {}) => {
    if (loadPromiseRef.current && !force) {
      return loadPromiseRef.current;
    }

    try {
      setSyncState('syncing', { syncError: '' });
      if (!silent) {
        setLoading(true);
      }

      const task = fetchPartyRoomBundle(roomCode);
      loadPromiseRef.current = task;
      const nextBundle = await task;

      if (activeRoomCodeRef.current === roomCode) {
        setBundle(nextBundle, {
          syncState: 'live',
          syncError: '',
          lastSyncedAt: Date.now(),
        });
        setErrorMessage('');
      }
    } catch (error) {
      if (activeRoomCodeRef.current === roomCode) {
        const nextError = getPartyBackendHint(error, pick);
        const hasExistingRoom = Boolean(usePartyRoomStore.getState().room);
        if (!silent || !hasExistingRoom) {
          setErrorMessage(nextError);
        }
        setSyncState(hasExistingRoom ? 'stale' : 'error', {
          syncError: nextError,
        });
      }
    } finally {
      loadPromiseRef.current = null;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [pick, roomCode, setBundle, setSyncState]);

  const requestRoomResync = React.useCallback(({ reason = 'manual', minIntervalMs = 1200 } = {}) => {
    const now = Date.now();
    if (now - lastResyncAtRef.current < minIntervalMs) {
      return;
    }

    lastResyncAtRef.current = now;
    setSyncState('syncing', { syncError: '' });
    void loadBundle({ silent: true, force: true, reason });
  }, [loadBundle, setSyncState]);

  useEffect(() => {
    clearBundle();
    hasRealtimeSubscriptionRef.current = false;
    shouldResyncOnSubscribeRef.current = false;
    void loadBundle();
  }, [clearBundle, loadBundle, roomCode]);

  useEffect(() => {
    if (!room?.id) {
      return undefined;
    }

    const unsubscribe = subscribeToPartyRoom(
      room.id,
      (event) => {
        if (event?.type === 'REACTION') {
          const entry = {
            id: `reaction-${Date.now()}-${Math.random()}`,
            emoji: String(event.emoji || '🔥'),
            memberName: String(event.memberName || ''),
            x: 10 + Math.random() * 80,
          };
          setReactionFeed((current) => [...current.slice(-8), entry]);
          window.setTimeout(() => {
            setReactionFeed((current) => current.filter((item) => item.id !== entry.id));
          }, 2400);
          return;
        }
        applyEvent(event);
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          if (!hasRealtimeSubscriptionRef.current) {
            hasRealtimeSubscriptionRef.current = true;
            setSyncState('live', { syncError: '' });
            return;
          }

          if (shouldResyncOnSubscribeRef.current) {
            shouldResyncOnSubscribeRef.current = false;
            requestRoomResync({ reason: 'realtime-resubscribed' });
          } else {
            setSyncState('live', { syncError: '' });
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          shouldResyncOnSubscribeRef.current = true;
          setSyncState('reconnecting', {
            syncError: status === 'CHANNEL_ERROR' ? pick('การเชื่อมต่อขาด กำลังเชื่อมใหม่...', 'Realtime connection dropped. Reconnecting...') : '',
          });
        }
      }
    );

    return unsubscribe;
  }, [applyEvent, pick, requestRoomResync, room?.id, setSyncState]);

  useEffect(() => {
    if (typeof window === 'undefined' || !room?.id) {
      return undefined;
    }

    const handleOffline = () => {
      shouldResyncOnSubscribeRef.current = true;
      setSyncState('stale', {
        syncError: pick('ขาดการเชื่อมต่อชั่วคราว ข้อมูลอาจไม่อัปเดต', 'Connection lost temporarily. Data may be stale.'),
      });
    };

    const handleOnline = () => {
      shouldResyncOnSubscribeRef.current = true;
      requestRoomResync({ reason: 'browser-online', minIntervalMs: 0 });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [pick, requestRoomResync, room?.id, setSyncState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handlePageHide = () => {
      pageUnloadRef.current = true;
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !room?.id) {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenDurationMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = 0;
      if (hiddenDurationMs >= 10000 || syncState !== 'live') {
        shouldResyncOnSubscribeRef.current = true;
        requestRoomResync({ reason: 'tab-visible', minIntervalMs: 0 });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestRoomResync, room?.id, syncState]);

  const isHost = room && String(room.host_member_token || '') === String(guestToken || '');
  const currentMatch = room?.current_match || null;
  const currentRound = getPartyCurrentRound(currentMatch);
  const currentPreset = getPartyPresetById(currentMatch?.presetId || room?.settings?.presetId);
  const draftPreset = getPartyPresetById(roomSettingsDraft?.presetId || room?.settings?.presetId);
  const isDraftTitleGuessMode = roomSettingsDraft.modeType === 'title-guess';
  const draftSupportsLongClipTime = roomSettingsDraft.modeType === 'vote';
  const draftClipTimeOptions = isDraftTitleGuessMode
    ? [4, 5, 6, 7, 8, 10, 12, 15]
    : draftSupportsLongClipTime
      ? [8, 10, 12, 15, 20, 30, 45, 60, 90, 120, 150, 180]
      : [8, 10, 12, 15, 20];
  const draftSongPoolSelectValue = roomSettingsDraft.songPresetId
    ? `preset:${roomSettingsDraft.songPresetId}`
    : roomSettingsDraft.categoryId;
  const draftSelectedTitleGuessSet = useMemo(
    () => titleGuessSetOptions.find((option) => String(option.id || '') === String(roomSettingsDraft.titleGuessSetId || '')) || null,
    [roomSettingsDraft.titleGuessSetId, titleGuessSetOptions]
  );
  const draftTitleGuessMaxRounds = useMemo(() => {
    if (!isDraftTitleGuessMode) {
      return 0;
    }

    const selectedSetCount = Math.max(0, Number(draftSelectedTitleGuessSet?.questionCount || 0));
    const storedCount = Math.max(0, Number(roomSettingsDraft.titleGuessQuestionCount || 0));
    return selectedSetCount || storedCount || 20;
  }, [
    draftSelectedTitleGuessSet?.questionCount,
    isDraftTitleGuessMode,
    roomSettingsDraft.titleGuessQuestionCount,
  ]);
  const draftTemplatePlayableCount = Math.max(0, Number(roomSettingsDraft.templatePlayableCount || 0));
  const draftTemplateCompatibility = useMemo(() => {
    if (!roomSettingsDraft.templateId || !draftTemplatePoolLoaded) {
      return null;
    }

    return analyzePartyTemplateCompatibility(draftTemplatePlayablePool, roomSettingsDraft);
  }, [draftTemplatePlayablePool, draftTemplatePoolLoaded, roomSettingsDraft]);
  const draftTemplatePresetAvailability = useMemo(
    () => draftTemplateCompatibility?.presetResults || {},
    [draftTemplateCompatibility],
  );
  const draftSuggestedTemplatePresetId = useMemo(
    () => PARTY_PRESETS.find((preset) => draftTemplatePresetAvailability[preset.id]?.compatible)?.id || null,
    [draftTemplatePresetAvailability],
  );
  const draftTemplatePresetMaxRounds = useMemo(() => {
    if (!roomSettingsDraft.templateId || !draftTemplatePoolLoaded || !draftTemplateCompatibility) {
      return {};
    }

    return {
      'party-classic': draftTemplateCompatibility.distinctChoiceAnswerCount >= 4
        ? draftTemplateCompatibility.choiceEligibleCount
        : 0,
      'song-typing': draftTemplateCompatibility.songTypingEligibleCount,
    };
  }, [draftTemplateCompatibility, draftTemplatePoolLoaded, roomSettingsDraft.templateId]);
  const draftQuizRoundOptions = useMemo(() => {
    if (!roomSettingsDraft.templateId || roomSettingsDraft.modeType !== 'quiz') {
      return [2, 5, 10, 15, 20];
    }

    const presetCap = Number(draftTemplatePresetMaxRounds[roomSettingsDraft.presetId] || 0);
    const maxRounds = Math.max(2, presetCap || draftTemplatePlayableCount);
    const options = [2, 5, 10, 15, 20].filter((count) => count <= maxRounds);
    if (!options.includes(maxRounds)) {
      options.push(maxRounds);
    }
    return [...new Set(options)].sort((a, b) => a - b);
  }, [draftTemplatePlayableCount, draftTemplatePresetMaxRounds, roomSettingsDraft.modeType, roomSettingsDraft.presetId, roomSettingsDraft.templateId]);
  const draftTitleGuessRoundOptions = useMemo(() => {
    if (!isDraftTitleGuessMode) {
      return [];
    }

    const maxRounds = Math.max(1, draftTitleGuessMaxRounds || 20);
    const options = [3, 5, 8, 10, 12, 15, 20].filter((count) => count <= maxRounds);
    const currentRoundCount = Math.max(1, Number(roomSettingsDraft.roundCount || 10));

    if (!options.includes(currentRoundCount) && currentRoundCount <= maxRounds) {
      options.push(currentRoundCount);
    }

    if (!options.includes(maxRounds)) {
      options.push(maxRounds);
    }

    return [...new Set(options)].sort((a, b) => a - b);
  }, [draftTitleGuessMaxRounds, isDraftTitleGuessMode, roomSettingsDraft.roundCount]);
  const draftVoteEntrantOptions = useMemo(() => {
    const battlePoolSize = Array.isArray(battleDeckPool) ? battleDeckPool.length : 0;
    const effectivePoolSize = battlePoolSize > 0 ? battlePoolSize : draftTemplatePlayableCount;

    if (roomSettingsDraft.modeType !== 'vote' || effectivePoolSize <= 0) {
      if (!roomSettingsDraft.templateId) return [2, 4, 8, 16];
    }

    if (effectivePoolSize > 0) {
      const options = [2, 4, 8, 16].filter((count) => count <= effectivePoolSize);
      return options.length > 0 ? options : [2];
    }

    return [2, 4, 8, 16];
  }, [battleDeckPool, draftTemplatePlayableCount, roomSettingsDraft.modeType, roomSettingsDraft.templateId]);
  const draftTemplateValidation = useMemo(() => {
    const targetResult = draftTemplateCompatibility?.targetResult;
    if (!roomSettingsDraft.templateId || !draftTemplatePoolLoaded || !targetResult) {
      return { ok: true, message: '' };
    }

    return {
      ok: targetResult.compatible,
      message: getPartyTemplateReasonText(targetResult.blockingReasons?.[0], pick),
    };
  }, [draftTemplateCompatibility, draftTemplatePoolLoaded, pick, roomSettingsDraft.templateId]);
  const hasPendingRoomSettings = useMemo(() => {
    if (!room?.settings) {
      return false;
    }

    return serializePartySettingsSnapshot(room.settings) !== serializePartySettingsSnapshot(roomSettingsDraft);
  }, [room?.settings, roomSettingsDraft]);
  const prefetchedRound = useMemo(
    () => getPartyPrefetchRound(currentMatch, { revealPrefetchReady }),
    [currentMatch, revealPrefetchReady]
  );
  const selectedPoolName = room?.settings?.modeType === 'title-guess'
    ? (room?.settings?.titleGuessSetName || 'Guess the Title set')
    : room?.settings?.templateName
      || room?.settings?.songPresetName
      || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.label
      || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolNameTh = room?.settings?.modeType === 'title-guess'
    ? (room?.settings?.titleGuessSetName || 'ชุดทายชื่อเรื่อง')
    : room?.settings?.templateName
      || room?.settings?.songPresetName
      || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.labelTh
      || PARTY_CATEGORY_OPTIONS[0].labelTh;
  const phaseEndsAtMs = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
  const answerGraceMs = Number(currentMatch?.answerGraceSec || 0) * 1000;
  const answerGraceEndsAtMs = playbackEndedAtMs ? playbackEndedAtMs + answerGraceMs : 0;
  const showSyncBanner = Boolean(room) && (syncState !== 'live' || syncError);
  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return '';
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(lastSyncedAt);
  }, [lastSyncedAt]);

  useEffect(() => () => {
    const activeRoom = usePartyRoomStore.getState().room;
    const activeMembers = usePartyRoomStore.getState().members || [];
    const selfToken = String(guestToken || '');
    const selfMember = activeMembers.find((member) => String(member?.member_token || '') === selfToken);

    // Keep room membership when navigating within the SPA (for example
    // opening templates/builders from the lobby). Only leave on actual
    // page unload/refresh/tab close.
    if (!pageUnloadRef.current || !activeRoom?.id || activeRoom?.status === 'closed' || !selfMember) {
      return;
    }

    void leavePartyRoom({
      room: activeRoom,
      memberToken: selfMember.member_token,
    }).catch(() => null);
  }, [guestToken]);

  useEffect(() => {
    if (!room?.settings) {
      return;
    }

    const nextSettings = createPartySettings(room.settings);
    const nextSnapshot = serializePartySettingsSnapshot(nextSettings);

    setRoomSettingsDraft((current) => {
      const currentSnapshot = serializePartySettingsSnapshot(current);
      const appliedSnapshot = lastAppliedRoomSettingsSnapshotRef.current;
      const shouldForceApply = !appliedSnapshot || room?.id !== activeRoomIdRef.current;
      const hasLocalEdits = Boolean(appliedSnapshot) && currentSnapshot !== appliedSnapshot;

      if (!shouldForceApply && hasLocalEdits) {
        return current;
      }

      if (!selectedTemplateIntent) {
        lastAppliedRoomSettingsSnapshotRef.current = nextSnapshot;
        return nextSettings;
      }

      const mergedSettings = createPartySettings({
        ...nextSettings,
        templateId: selectedTemplateIntent.templateId,
        templateName: selectedTemplateIntent.templateName || current.templateName || nextSettings.templateName,
        templateCoverUrl: current.templateCoverUrl || nextSettings.templateCoverUrl,
        templatePlayableCount: current.templatePlayableCount || nextSettings.templatePlayableCount,
        modeType: selectedTemplateIntent.modeType,
        modeScope: selectedTemplateIntent.modeScope,
        presetId: selectedTemplateIntent.presetId || current.presetId || nextSettings.presetId,
        categoryId: 'all',
        songPresetId: '',
        songPresetName: '',
        battleDeckId: '',
      });

      lastAppliedRoomSettingsSnapshotRef.current = nextSnapshot;
      return mergedSettings;
    });
  }, [room?.id, room?.settings, selectedTemplateIntent]);

  useEffect(() => {
    let ignore = false;

    fetchPublishedPartySongPresets()
      .then((presets) => {
        if (!ignore) {
          setSongPresetOptions(presets);
        }
      })
      .catch((error) => {
        console.error('Failed to load published party song presets', error);
        toast.error(pick('โหลดชุดเพลงไม่สำเร็จ', 'Failed to load song presets'));
      });

    return () => {
      ignore = true;
    };
  }, [pick]);

  useEffect(() => {
    if (room?.status !== 'lobby') {
      return undefined;
    }

    const shouldLoadTitleGuessSets = roomSettingsDraft.modeType === 'title-guess';
    if (!shouldLoadTitleGuessSets) {
      return undefined;
    }

    let ignore = false;
    setTitleGuessSetsLoading(true);
    fetchPartyTitleGuessSets()
      .then((sets) => {
        if (!ignore) {
          setTitleGuessSetOptions(sets);
        }
      })
      .catch((error) => {
        console.error('Failed to load title guess sets', error);
        toast.error(pick('โหลดชุดทายชื่อเรื่องไม่สำเร็จ', 'Failed to load Guess the Title sets'));
        if (!ignore) {
          setTitleGuessSetOptions([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setTitleGuessSetsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isHost, pick, room?.status, roomSettingsDraft.modeType]);

  useEffect(() => {
    if (room?.status !== 'lobby') {
      return undefined;
    }

    if (roomSettingsDraft.modeType === 'title-guess') {
      setTemplateOptions([]);
      return undefined;
    }

    let ignore = false;
    fetchPartyTemplates({
      tab: 'all',
      mode: roomSettingsDraft.modeType || 'all',
      page: 1,
      pageSize: 24,
    })
      .then((result) => {
        if (!ignore) {
          setTemplateOptions(result?.templates || []);
        }
      })
      .catch((error) => {
        console.error('Failed to load room template options', error);
        toast.error(pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load templates'));
      });

    return () => {
      ignore = true;
    };
  }, [pick, room?.status, roomSettingsDraft.modeType]);

  useEffect(() => {
    if (!isDraftTitleGuessMode || !draftSelectedTitleGuessSet) {
      return;
    }

    const maxQuestions = Math.max(1, Number(draftSelectedTitleGuessSet.questionCount || 1));
    setRoomSettingsDraft((current) => {
      if (
        current.modeType !== 'title-guess'
        || String(current.titleGuessSetId || '') !== String(draftSelectedTitleGuessSet.id || '')
      ) {
        return current;
      }

      const nextRoundCount = Math.min(Math.max(1, Number(current.roundCount || 10)), maxQuestions);
      if (
        current.titleGuessSetName === draftSelectedTitleGuessSet.name
        && Number(current.titleGuessQuestionCount || 0) === maxQuestions
        && Number(current.roundCount || 0) === nextRoundCount
      ) {
        return current;
      }

      return {
        ...current,
        titleGuessSetName: draftSelectedTitleGuessSet.name,
        titleGuessQuestionCount: maxQuestions,
        roundCount: nextRoundCount,
      };
    });
  }, [draftSelectedTitleGuessSet, isDraftTitleGuessMode]);

  useEffect(() => {
    const activeBattleDeckId = String(roomSettingsDraft.battleDeckId || '').trim();
    if (!activeBattleDeckId) {
      setBattleDeckPool(null);
      battleDeckPoolIdRef.current = '';
      return undefined;
    }

    if (
      battleDeckPoolIdRef.current === activeBattleDeckId
      && Array.isArray(battleDeckPool)
      && battleDeckPool.length > 0
    ) {
      return undefined;
    }

    let ignore = false;
    fetchBattleDeckById(activeBattleDeckId)
      .then((deck) => {
        if (ignore) {
          return;
        }

        if (!deck || !Array.isArray(deck.titles) || deck.titles.length < 2) {
          setBattleDeckPool(null);
          return;
        }

        const pool = mapBattleDeckToPartyPool(deck);
        setBattleDeckPool(pool);
        battleDeckPoolIdRef.current = String(deck.id || '');
        setRoomSettingsDraft((current) => {
          if (String(current.battleDeckId || '').trim() !== activeBattleDeckId) {
            return current;
          }

          return createPartySettings({
            ...current,
            modeType: 'vote',
            templateId: '',
            templateName: deck.label || current.templateName || 'Battle Deck',
            templateCoverUrl: pool[0]?.coverUrl || current.templateCoverUrl || '',
            templatePlayableCount: pool.length,
            modeScope: 'vote',
          });
        });
      })
      .catch(() => {
        if (!ignore) {
          setBattleDeckPool(null);
          battleDeckPoolIdRef.current = '';
        }
      });

    return () => {
      ignore = true;
    };
  }, [battleDeckPool, roomSettingsDraft.battleDeckId]);

  useEffect(() => {
    if (!roomSettingsDraft.templateId) {
      setDraftTemplatePlayablePool([]);
      setDraftTemplatePoolLoaded(false);
      return undefined;
    }

    let ignore = false;
    setDraftTemplatePoolLoaded(false);

    Promise.all([
      fetchPartyTemplateDetail(roomSettingsDraft.templateId).catch(() => null),
      (roomSettingsDraft.modeType === 'vote'
        ? fetchPartyTemplateSongPoolForVote(roomSettingsDraft.templateId)
        : fetchPartyTemplateSongPool(roomSettingsDraft.templateId)
      ).catch(() => []),
    ]).then(([templateDetail, playablePool]) => {
      if (ignore) {
        return;
      }

      const playableCount = Array.isArray(playablePool) ? playablePool.length : 0;
      setDraftTemplatePlayablePool(Array.isArray(playablePool) ? playablePool : []);
      setDraftTemplatePoolLoaded(true);
      setRoomSettingsDraft((current) => {
        if (String(current.templateId || '') !== String(roomSettingsDraft.templateId || '')) {
          return current;
        }

        const next = {
          ...current,
          templateName: templateDetail?.name || current.templateName,
          templateCoverUrl: templateDetail?.coverUrl || current.templateCoverUrl || '',
          templatePlayableCount: playableCount,
          modeScope: templateDetail?.modeScope || current.modeScope || 'all',
          presetId: current.modeType === 'vote'
            ? current.presetId
            : (templateDetail?.presetId || current.presetId),
        };

        if (next.modeType === 'quiz' && playableCount > 0) {
          const maxRounds = Math.max(2, playableCount);
          next.roundCount = Math.min(Number(next.roundCount || 10), maxRounds);
        }

        if (next.modeType === 'vote' && playableCount > 0) {
          const allowedEntrants = [2, 4, 8, 16].filter((count) => count <= playableCount);
          if (allowedEntrants.length > 0) {
            next.entrantCount = allowedEntrants.includes(Number(next.entrantCount || 0))
              ? Number(next.entrantCount || 0)
              : allowedEntrants[allowedEntrants.length - 1];
          }
        }

        return next;
      });
    });

    return () => {
      ignore = true;
    };
  }, [roomSettingsDraft.modeType, roomSettingsDraft.templateId]);

  useEffect(() => {
    if (!roomSettingsDraft.templateId || draftTemplatePlayableCount <= 0) {
      return;
    }

    setRoomSettingsDraft((current) => {
      if (!current.templateId) {
        return current;
      }

      if (current.modeType === 'quiz') {
        const presetCap = Number(draftTemplatePresetMaxRounds[current.presetId] || 0);
        const maxRounds = Math.max(2, presetCap || draftTemplatePlayableCount);
        const nextRoundCount = Math.min(Number(current.roundCount || 10), maxRounds);
        return nextRoundCount === current.roundCount ? current : { ...current, roundCount: nextRoundCount };
      }

      const allowedEntrants = [2, 4, 8, 16].filter((count) => count <= draftTemplatePlayableCount);
      if (allowedEntrants.length === 0) {
        return current;
      }

      const nextEntrantCount = allowedEntrants.includes(Number(current.entrantCount || 0))
        ? Number(current.entrantCount || 0)
        : allowedEntrants[allowedEntrants.length - 1];

      return nextEntrantCount === current.entrantCount ? current : { ...current, entrantCount: nextEntrantCount };
    });
  }, [draftTemplatePlayableCount, draftTemplatePresetMaxRounds, roomSettingsDraft.templateId]);

  useEffect(() => {
    if (!isDraftTitleGuessMode) {
      return;
    }

    const maxQuestions = Math.max(1, draftTitleGuessMaxRounds || 1);
    setRoomSettingsDraft((current) => {
      if (current.modeType !== 'title-guess') {
        return current;
      }

      const nextRoundCount = Math.min(Math.max(1, Number(current.roundCount || 10)), maxQuestions);
      return nextRoundCount === Number(current.roundCount || 0)
        ? current
        : { ...current, roundCount: nextRoundCount };
    });
  }, [draftTitleGuessMaxRounds, isDraftTitleGuessMode]);

  useEffect(() => {
    if (!roomSettingsDraft.templateId || roomSettingsDraft.modeType !== 'quiz' || !draftTemplatePoolLoaded) {
      return;
    }

    const currentPresetAvailability = draftTemplatePresetAvailability[roomSettingsDraft.presetId];
    if (currentPresetAvailability?.compatible) {
      return;
    }

    const fallbackPreset = PARTY_PRESETS.find((preset) => draftTemplatePresetAvailability[preset.id]?.compatible);
    if (!fallbackPreset || fallbackPreset.id === roomSettingsDraft.presetId) {
      return;
    }

    setRoomSettingsDraft((current) => {
      if (!current.templateId || current.modeType !== 'quiz' || current.presetId !== roomSettingsDraft.presetId) {
        return current;
      }
      return { ...current, presetId: fallbackPreset.id };
    });
  }, [draftTemplatePoolLoaded, draftTemplatePresetAvailability, roomSettingsDraft.modeType, roomSettingsDraft.presetId, roomSettingsDraft.templateId]);

  // Scroll to top on every phase/status transition
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentMatch?.phase, room?.status]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!currentMatch?.phase || currentMatch.phase === 'final') {
      return;
    }

    const node = activePhaseRef.current;
    if (!node) {
      return;
    }

    window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [currentMatch?.id, currentMatch?.phase]);

  useEffect(() => {
    setPlaybackEndedAtMs(null);
    setRevealPlaybackStartedAtMs(null);
    questionPlaybackAdjustedRef.current = false;
  }, [currentMatch?.id, currentMatch?.phase, currentRound?.id]);

  const handleQuestionPlaybackStarted = React.useCallback(async (startedAtMs) => {
    if (
      !isHost
      || questionPlaybackAdjustedRef.current
      || currentMatch?.phase !== 'question'
      || !room
      || !currentRound?.id
    ) {
      return;
    }

    const phaseStartedAtMs = new Date(currentMatch.phaseStartedAt || 0).getTime();
    if (!phaseStartedAtMs) {
      return;
    }

    const startupDelayMs = Math.max(0, Math.round(Number(startedAtMs || 0) - phaseStartedAtMs));
    if (startupDelayMs < 700) {
      return;
    }

    questionPlaybackAdjustedRef.current = true;
    try {
      const nextRoom = await extendPartyQuestionPhase({
        room,
        expectedMatchId: currentMatch.id,
        expectedRoundId: currentRound.id,
        extraMs: startupDelayMs,
      });

      if (nextRoom) {
        applyEvent({
          type: 'ROOM_UPDATED',
          payload: {
            room: nextRoom,
          },
        });
      }
    } catch (error) {
      questionPlaybackAdjustedRef.current = false;
      console.error('Failed to extend party question phase for playback buffering', error);
    }
  }, [applyEvent, currentMatch, currentRound?.id, isHost, room]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (currentMatch?.phase !== 'reveal') {
      setRevealPrefetchReady(false);
      return undefined;
    }

    if (revealPlaybackStartedAtMs) {
      setRevealPrefetchReady(true);
      return undefined;
    }

    setRevealPrefetchReady(false);
    const timeoutId = window.setTimeout(() => {
      setRevealPrefetchReady(true);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentMatch?.id, currentMatch?.phase, currentRound?.id, revealPlaybackStartedAtMs]);

  useEffect(() => {
    if (currentMatch?.phase !== 'countdown') {
      countdownAlertedSecondRef.current = null;
      return undefined;
    }

    let cancelled = false;
    let timeouts = [];

    void resumePartyAudioContext().then((audioContext) => {
      if (cancelled || !audioContext) {
        return;
      }

      const phaseEndsAt = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
      if (!phaseEndsAt) {
        return;
      }

      countdownAlertedSecondRef.current = null;
      timeouts = [3, 2, 1].map((second) => {
        const delay = Math.max(0, phaseEndsAt - Date.now() - (second * 1000));
        return window.setTimeout(() => {
          if (currentMatch?.phase !== 'countdown') {
            return;
          }

          if (countdownAlertedSecondRef.current === second) {
            return;
          }

          countdownAlertedSecondRef.current = second;
          playPartyCountdownAlert(audioContext, readPartyAudioVolume(), second);
        }, delay);
      });
    });

    return () => {
      cancelled = true;
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [currentMatch?.phase, currentMatch?.phaseEndsAt]);

  useEffect(() => {
    if (currentMatch?.phase !== 'question') {
      answerAlertedSecondRef.current = null;
      return undefined;
    }

    let cancelled = false;
    let timeouts = [];

    void resumePartyAudioContext().then((audioContext) => {
      if (cancelled || !audioContext) {
        return;
      }

      const phaseEndsAt = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
      if (!phaseEndsAt) {
        return;
      }

      answerAlertedSecondRef.current = null;
      timeouts = [3, 2, 1].map((second) => {
        const delay = Math.max(0, phaseEndsAt - Date.now() - (second * 1000));
        return window.setTimeout(() => {
          if (currentMatch?.phase !== 'question') {
            return;
          }

          if (answerAlertedSecondRef.current === second) {
            return;
          }

          answerAlertedSecondRef.current = second;
          playPartyCountdownAlert(audioContext, readPartyAudioVolume(), second);
        }, delay);
      });
    });

    return () => {
      cancelled = true;
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [currentMatch?.phase, currentMatch?.phaseEndsAt]);

  const handleInlineJoin = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('inline-join');
      const joinedRoom = await joinPartyRoom(roomCode, partyProfile);
      if (!room) {
        await loadBundle({ silent: true, force: true });
      } else if (joinedRoom) {
        applyEvent({
          type: 'ROOM_UPDATED',
          payload: {
            room: joinedRoom,
          },
        });
      }
      toast.success(pick('เข้าร่วมห้องแล้ว', 'Joined the room'));
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleToggleReady = async () => {
    if (!room?.id || !currentMember) {
      return;
    }

    try {
      setBusyAction('ready');
      const member = await togglePartyMemberReady(room.id, currentMember.member_token, !currentMember.is_ready);
      applyEvent({
        type: 'MEMBER_UPSERTED',
        payload: {
          member,
        },
      });
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleRoomSettingsChange = React.useCallback((updater) => {
    setRoomSettingsDraft((current) => {
      const nextSettings = createPartySettings(typeof updater === 'function' ? updater(current) : updater);
      if (selectedTemplateIntent && String(nextSettings.templateId || '') !== String(selectedTemplateIntent.templateId || '')) {
        setSelectedTemplateIntent(null);
      }
      return nextSettings;
    });
  }, [selectedTemplateIntent]);

  const handleResetRoomSettingsDraft = React.useCallback(() => {
    if (!room?.settings) {
      return;
    }

    const nextSettings = createPartySettings(room.settings);
    setSelectedTemplateIntent(null);
    lastAppliedRoomSettingsSnapshotRef.current = serializePartySettingsSnapshot(nextSettings);
    setRoomSettingsDraft(nextSettings);
  }, [room?.settings]);

  const handleSaveRoomSettings = React.useCallback(async ({ silent = false } = {}) => {
    if (!room || !isHost || room.status !== 'lobby') {
      return;
    }

    try {
      if (silent) {
        isAutosavingRef.current = true;
      } else {
        setBusyAction('save-settings');
      }
      if (roomSettingsDraft.modeType === 'title-guess') {
        const selectedSetId = String(roomSettingsDraft.titleGuessSetId || '').trim();
        const maxQuestionCount = Math.max(
          0,
          Number(draftSelectedTitleGuessSet?.questionCount || roomSettingsDraft.titleGuessQuestionCount || 0)
        );

        if (!selectedSetId) {
          toast.error(pick('เลือกชุดทายชื่อเรื่องก่อนบันทึก', 'Choose a Guess the Title set before saving'));
          return;
        }

        if (maxQuestionCount > 0 && Number(roomSettingsDraft.roundCount || 0) > maxQuestionCount) {
          toast.error(
            pick(
              `จำนวนรอบต้องไม่เกิน ${maxQuestionCount} จากชุดที่เลือก`,
              `Rounds cannot exceed ${maxQuestionCount} for the selected set`,
            )
          );
          return;
        }
      }

      if (roomSettingsDraft.templateId) {
        const pool = draftTemplatePlayablePool.length > 0 || draftTemplatePoolLoaded
          ? draftTemplatePlayablePool
          : await (roomSettingsDraft.modeType === 'vote'
              ? fetchPartyTemplateSongPoolForVote(roomSettingsDraft.templateId)
              : fetchPartyTemplateSongPool(roomSettingsDraft.templateId)
            ).catch(() => null);
        if (pool !== null) {
          const compatibility = analyzePartyTemplateCompatibility(pool, roomSettingsDraft);
          if (!compatibility.targetResult?.compatible) {
            toast.error(getPartyTemplateReasonText(compatibility.targetResult?.blockingReasons?.[0], pick));
            return;
          }
        }
      }

      const nextRoom = await updatePartyRoomSettings(room, roomSettingsDraft);
      lastAppliedRoomSettingsSnapshotRef.current = serializePartySettingsSnapshot(nextRoom?.settings || roomSettingsDraft);
      applyEvent({
        type: 'ROOM_UPDATED',
        payload: {
          room: nextRoom,
        },
      });
      setSelectedTemplateIntent(null);
      if (!silent) {
      toast.success(pick('บันทึกการตั้งค่าห้องแล้ว', 'Room settings saved'));
      }
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      if (silent) {
        isAutosavingRef.current = false;
      } else {
        setBusyAction('');
      }
    }
  }, [
    applyEvent,
    draftTemplatePlayablePool,
    draftTemplatePoolLoaded,
    draftSelectedTitleGuessSet?.questionCount,
    isHost,
    pick,
    room,
    roomSettingsDraft,
  ]);

  useEffect(() => {
    if (!room || !isHost || room.status !== 'lobby') {
      return undefined;
    }

    if (!hasPendingRoomSettings || busyAction === 'save-settings' || isAutosavingRef.current) {
      return undefined;
    }

    if (roomSettingsDraft.templateId && (!draftTemplatePoolLoaded || !draftTemplateValidation.ok)) {
      return undefined;
    }

    if (roomSettingsDraft.modeType === 'title-guess' && !String(roomSettingsDraft.titleGuessSetId || '').trim()) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void handleSaveRoomSettings({ silent: true });
    }, PARTY_LOBBY_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    busyAction,
    draftTemplatePoolLoaded,
    draftTemplateValidation.ok,
    handleSaveRoomSettings,
    hasPendingRoomSettings,
    isHost,
    room,
    room?.status,
    roomSettingsDraft.modeType,
    roomSettingsDraft.templateId,
    roomSettingsDraft.titleGuessSetId,
  ]);

  const handleStartMatch = async () => {
    if (!room || !isHost) {
      return;
    }

    const members = usePartyRoomStore.getState().members;

    try {
      setBusyAction('start');
      const nextRoom = await startPartyMatch(room, {
        prebuiltPool: roomSettingsDraft.battleDeckId ? battleDeckPool : null,
      });
      applyEvent({
        type: 'ROOM_UPDATED',
        payload: {
          room: nextRoom,
        },
      });
      applyEvent({
        type: 'MEMBERS_PATCHED',
        payload: {
          memberTokens: members
            .filter((member) => String(member.member_token || '') !== String(room.host_member_token || ''))
            .map((member) => String(member.member_token || ''))
            .filter(Boolean),
          patch: { is_ready: false },
        },
      });
      toast.success(pick('เริ่มแมตช์แล้ว', 'Match started'));
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleReaction = React.useCallback((emoji) => {
    if (!room?.id) return;
    const memberName = String(partyProfile?.displayName || currentMember?.member_name || '').trim();
    // Show immediately for the sender (Supabase broadcast doesn't loop back to self)
    const entry = {
      id: `reaction-self-${Date.now()}-${Math.random()}`,
      emoji: String(emoji || '🔥'),
      memberName,
      x: 10 + Math.random() * 80,
    };
    setReactionFeed((current) => [...current.slice(-8), entry]);
    window.setTimeout(() => {
      setReactionFeed((current) => current.filter((item) => item.id !== entry.id));
    }, 2400);
    void broadcastPartyRoomEvent(room.id, { type: 'REACTION', emoji, memberName });
  }, [currentMember?.member_name, partyProfile?.displayName, room?.id]);

  const handleSubmitAnswer = async (payload) => {
    if (!room || !currentMember) {
      return;
    }

    try {
      setBusyAction('answer');
      const answerRecord = await submitPartyAnswer({ room, member: currentMember, payload });
      applyEvent({
        type: 'ANSWER_SUBMITTED',
        payload: {
          answer: answerRecord,
        },
      });
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(String(room?.room_code || roomCode || ''));
      toast.success(pick('คัดลอกรหัสห้องแล้ว', 'Room code copied'));
    } catch {
      toast.error(pick('คัดลอกรหัสห้องไม่สำเร็จ', 'Could not copy the room code'));
    }
  };

  const handleCopyRoomLink = async () => {
    try {
      const resolvedCode = String(room?.room_code || roomCode || '').trim();
      const roomPath = `/party/room/${resolvedCode}`;
      const roomLink = typeof window !== 'undefined'
        ? new URL(roomPath, window.location.origin).toString()
        : roomPath;
      await navigator.clipboard.writeText(roomLink);
      toast.success(pick('คัดลอกลิงก์ห้องแล้ว', 'Room link copied'));
    } catch {
      toast.error(pick('คัดลอกลิงก์ห้องไม่สำเร็จ', 'Could not copy the room link'));
    }
  };

  const handleRematch = async () => {
    if (!room || !isHost) {
      return;
    }

    try {
      setBusyAction('rematch');
      const resetRoom = await resetPartyRoom(room);
      applyEvent({
        type: 'ROOM_RESET',
        payload: {
          room: resetRoom?.room || null,
          members: resetRoom?.members || [],
        },
      });
      toast.success(pick('Returned to the lobby', 'Returned to the lobby'));
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleCloseRoom = async () => {
    if (!room || !isHost) {
      return;
    }

    try {
      setBusyAction('close');
      const closedRoom = await closePartyRoom(room);
      applyEvent({
        type: 'ROOM_CLOSED',
        payload: {
          room: closedRoom,
        },
      });
      toast.success(pick('ปิดห้องแล้ว', 'Room closed'));
      navigate('/party');
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const hostEditor = isHost && room?.status === 'lobby'
    ? {
      settings: roomSettingsDraft,
      currentPreset: draftPreset,
      songPresetOptions,
      templateOptions,
      templatePoolLoaded: draftTemplatePoolLoaded,
      templateCompatibility: draftTemplateCompatibility,
      templateValidation: draftTemplateValidation,
      templatePresetAvailability: draftTemplatePresetAvailability,
      suggestedTemplatePresetId: draftSuggestedTemplatePresetId,
      quizRoundOptions: draftQuizRoundOptions,
      titleGuessRoundOptions: draftTitleGuessRoundOptions,
      voteEntrantOptions: draftVoteEntrantOptions,
      clipTimeOptions: draftClipTimeOptions,
      songPoolSelectValue: draftSongPoolSelectValue,
      titleGuessSetOptions,
      titleGuessSetsLoading,
      selectedTitleGuessSet: draftSelectedTitleGuessSet,
      hasPendingChanges: hasPendingRoomSettings,
      isSaving: busyAction === 'save-settings',
      onChange: handleRoomSettingsChange,
      onSave: handleSaveRoomSettings,
      onReset: handleResetRoomSettingsDraft,
      onClearBattleDeck: () => setBattleDeckPool(null),
    }
    : null;

  if (loading) {
    return (
      <div className="party-page">
        <div className="party-game-canvas">
          <div className="party-loading-card">
            <Loader2 size={28} className="party-spin" />
            <strong>{pick('กำลังโหลดห้องปาร์ตี้...', 'Loading the party room...')}</strong>
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="party-page">
        <div className="party-game-canvas">
          <ErrorState message={errorMessage} onRetry={() => void loadBundle()} className="party-error-card" />
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="party-page">
        <div className="party-game-canvas">
          <EmptyState
            icon={<XCircle size={24} />}
            title={pick('ไม่พบห้อง', 'Room not found')}
            message={pick('ตรวจสอบรหัสห้องอีกครั้ง หรือสร้างห้องใหม่', 'Check the room code again or create a new room.')}
            action={<Link to="/party" className="party-text-link">{pick('กลับหน้า Party', 'Back to Party')}</Link>}
            className="party-empty-card"
          />
        </div>
      </div>
    );
  }

  if (!currentMember && room.status !== 'lobby') {
    return (
      <div className="party-page">
        <div className="party-game-canvas">
          <EmptyState
            icon={<Users2 size={24} />}
            title={pick('แมตช์นี้เริ่มไปแล้ว', 'This match is already in progress')}
            message={pick('ยังไม่รองรับโหมดดู รอแมตช์ถัดไปเพื่อเข้าร่วม', 'Spectator mode is not wired yet in this slice. Wait for the rematch to join the room.')}
            action={<Link to="/party" className="party-text-link">{pick('กลับหน้า Party', 'Back to Party')}</Link>}
            className="party-empty-card"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="party-page">
      <div className="party-room-hud">
        <div className="party-room-hud-title">
          <h1>{pick('ห้อง', 'Room')} {room.room_code}</h1>
          <p>{pick(currentPreset.labelTh, currentPreset.label)} | {pick(selectedPoolNameTh, selectedPoolName)}</p>
        </div>
        <div className="party-room-hud-actions">
          <button type="button" className="party-code-btn" onClick={handleCopyRoomLink}>
            <Link2 size={14} />
            {pick('คัดลอกลิงก์', 'Copy link')}
          </button>
          <button type="button" className="party-code-btn" onClick={handleCopyCode}>
            <Copy size={14} />
            {pick('คัดลอกรหัส', 'Copy code')}
          </button>
          <Link to="/party" className="party-code-btn subtle">{pick('กลับ', 'Back')}</Link>
        </div>
      </div>
      <section className="party-room-shell">
        <PartyAutoAdvance
          isHost={isHost}
          room={room}
          currentMatch={currentMatch}
          playbackEndedAtMs={playbackEndedAtMs}
          revealPlaybackStartedAtMs={revealPlaybackStartedAtMs}
          answerGraceMs={answerGraceMs}
          onAdvanced={(nextRoom) => {
            applyEvent({
              type: 'ROOM_UPDATED',
              payload: { room: nextRoom },
            });
          }}
          onAdvanceError={(error) => {
            toast.error(getPartyBackendHint(error, pick));
          }}
        />
        {prefetchedRound?.mediaUrl ? (
          <video
            key={`preload-${prefetchedRound.id || prefetchedRound.mediaUrl}`}
            src={prefetchedRound.mediaUrl}
            preload={getPartyPrefetchPreloadValue(currentMatch?.phase)} muted playsInline
            className="party-hidden-media" aria-hidden="true"
          />
        ) : null}

        {showSyncBanner ? (
          <div className={`party-sync-banner ${syncState === 'stale' || syncState === 'error' ? 'is-stale' : ''}`}>
            <div className="party-sync-banner-icon" aria-hidden="true">
              {syncState === 'syncing' ? <Loader2 size={16} className="party-spin" /> : <Users2 size={16} />}
            </div>
            <div className="party-sync-banner-copy">
              <strong>
                {syncState === 'syncing' ? pick('กำลังซิงค์...', 'Syncing...') : syncState === 'reconnecting' ? pick('กำลังเชื่อมต่อใหม่...', 'Reconnecting...') : pick('ข้อมูลห้องอาจไม่อัปเดต', 'Room state may be stale')}
              </strong>
              <span>{syncError || (lastSyncedLabel ? pick(`ซิงก์ล่าสุดเมื่อ ${lastSyncedLabel}`, `Last synced at ${lastSyncedLabel}`) : '')}</span>
            </div>
          </div>
        ) : null}

        <div className="party-game-canvas">
        {!currentMember ? (
          <div className="party-inline-join">
            <div className="party-panel-head">
              <strong>{pick('เข้าร่วมห้องนี้', 'Join this room')}</strong>
              <span>{pick('ใช้โปรไฟล์ปัจจุบันเข้าล็อบบี้ได้เลย', 'Use your current profile and jump straight into the lobby.')}</span>
            </div>
            <div className="party-profile-preview">
              <PartyIdentityAvatar profile={partyProfile} />
              <div className="party-profile-copy">
                <strong>{partyProfile.displayName}</strong>
                <span>{pick('ไม่ต้องตั้งชื่อหรืออวตารเพิ่ม', 'No extra name or avatar step anymore')}</span>
              </div>
            </div>
            <Button variant="primary" onClick={handleInlineJoin} disabled={busyAction === 'inline-join'}>
              {busyAction === 'inline-join' ? pick('กำลังเข้าร่วม...', 'Joining...') : pick('เข้าร่วมด้วยโปรไฟล์นี้', 'Join this room with my profile')}
            </Button>
          </div>
        ) : null}

        {room?.settings?.modeType === 'vote' ? (
          <PartyVoteRoomView
            room={room}
            guestToken={guestToken}
            partyProfile={partyProfile}
            currentMember={currentMember}
            isHost={isHost}
            busyAction={busyAction}
            pick={pick}
            onToggleReady={handleToggleReady}
            onCloseRoom={handleCloseRoom}
            onRematch={handleRematch}
            onStartMatch={handleStartMatch}
            hostEditor={hostEditor}
            onPlaybackComplete={setPlaybackEndedAtMs}
          />
        ) : room.status === 'lobby' || !currentMatch ? (
          <PartyLobbyView
            room={room}
            guestToken={guestToken}
            partyProfile={partyProfile}
            currentPreset={currentPreset}
            selectedPoolName={selectedPoolName}
            selectedPoolNameTh={selectedPoolNameTh}
            currentMember={currentMember}
            isHost={isHost}
            busyAction={busyAction}
            onToggleReady={handleToggleReady}
            onStartMatch={handleStartMatch}
            onCloseRoom={handleCloseRoom}
            hostEditor={hostEditor}
            pick={pick}
          />
        ) : currentMatch.phase === 'final' || room.status === 'finished' ? (
          <PartyFinalView
            room={room}
            guestToken={guestToken}
            partyProfile={partyProfile}
            currentMatch={currentMatch}
            isHost={isHost}
            busyAction={busyAction}
            onRematch={handleRematch}
            pick={pick}
          />
        ) : (
          <>
            <div className="party-phase-banner">
              <span className="party-chip">
                <TimerReset size={14} />
                {currentMatch.phase === 'countdown'
                  ? pick('เตรียมพร้อม', 'Countdown')
                  : currentMatch.phase === 'question'
                    ? pick('ทายเพลง', 'Question')
                    : pick('เฉลย', 'Reveal')}
              </span>
              <strong>
                {currentMatch.phase === 'countdown'
                  ? pick('เตรียมพร้อม รอบถัดไปเริ่มแล้ว', 'Get ready, next round starting')
                  : currentMatch.phase === 'question'
                    ? pick('ฟังเพลงแล้วล็อคคำตอบ!', 'Audio is live, lock your answer!')
                    : pick('ดูเฉลยและอันดับ', 'Check the answer and standings')}
              </strong>
            </div>

            <div ref={activePhaseRef} className="party-active-phase">
              {currentMatch.phase === 'reveal' ? (
                <PartyRevealView
                  room={room}
                  guestToken={guestToken}
                  partyProfile={partyProfile}
                  onPlaybackStarted={setRevealPlaybackStartedAtMs}
                  pick={pick}
                />
              ) : currentMatch.phase === 'countdown' ? (
                <section className="party-countdown-stage">
                  <span className="party-chip"><Sparkles size={14} />{pick('Coming up', 'Coming up')}</span>
                  <h2>{pick('Prepare for the next round', 'Prepare for the next round')}</h2>
                  <p>{pick('Lining up the next mystery audio...', 'Lining up the next mystery audio...')}</p>
                  <PartyCountdownDisplay targetTimeMs={phaseEndsAtMs}>
                    {({ secondsLeft }) => (
                      <div className="party-countdown-bubble">{secondsLeft || getCountdownSeconds(phaseEndsAtMs - Date.now())}</div>
                    )}
                  </PartyCountdownDisplay>
                </section>
              ) : (
                <PartyQuestionView
                  room={room}
                  guestToken={guestToken}
                  partyProfile={partyProfile}
                  currentMember={currentMember}
                  busyAction={busyAction}
                  phaseEndsAtMs={phaseEndsAtMs}
                  answerGraceEndsAtMs={answerGraceEndsAtMs}
                  onPlaybackStarted={handleQuestionPlaybackStarted}
                  onPlaybackComplete={setPlaybackEndedAtMs}
                  onSubmit={handleSubmitAnswer}
                  reactionFeed={reactionFeed}
                  onReaction={handleReaction}
                  pick={pick}
                />
              )}
            </div>
          </>
        )}
        </div>
      </section>
    </div>
  );
}
