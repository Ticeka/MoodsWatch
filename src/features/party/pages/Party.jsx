import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Copy,
  Loader2,
  Radio,
  Sparkles,
  TimerReset,
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
  createPartySettings,
  getPartyCurrentRound,
  getPartyPresetById,
} from '@/features/party/lib/partyEngine';
import { resumePartyAudioContext } from '@/features/party/lib/partyAudio';
import {
  closePartyRoom,
  createPartyRoom,
  fetchPartyRoomBundle,
  fetchPublishedPartySongPresets,
  getPartyBackendHint,
  getPartyGuestToken,
  joinPartyRoom,
  readPartyProfile,
  resetPartyRoom,
  startPartyMatch,
  submitPartyAnswer,
  subscribeToPartyRoom,
  togglePartyMemberReady,
} from '@/features/party/lib/partyRemote';
import { useCurrentPartyMember } from '@/features/party/lib/usePartyRoomSelectors';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { PartyFinalView } from './PartyFinal';
import { PartyLobbyView } from './PartyLobby';
import { PartyQuestionView } from './PartyQuestion';
import { PartyRevealView } from './PartyReveal';
import {
  PartyAutoAdvance,
  PartyCountdownDisplay,
  PartyIdentityAvatar,
  PresetCard,
} from './PartyRoomShared';
import {
  buildPartyProfile,
  getCountdownSeconds,
  getPartyPrefetchRound,
  playPartyCountdownAlert,
  readPartyAudioVolume,
} from './partyRoomUtils';
import './Party.css';

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [songPresetOptions, setSongPresetOptions] = useState([]);
  const [settings, setSettings] = useState(createPartySettings({
    presetId: PARTY_PRESETS[0].id,
    roundCount: 10,
    timePerRoundSec: 12,
    revealSec: 12,
    categoryId: 'all',
    keyword: '',
    showLiveScores: true,
    randomOrder: true,
  }));
  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const selectedPreset = getPartyPresetById(settings.presetId);
  const selectedPoolLabel = settings.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolLabelTh = settings.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.labelTh
    || PARTY_CATEGORY_OPTIONS[0].labelTh;
  const songPoolSelectValue = settings.songPresetId ? `preset:${settings.songPresetId}` : settings.categoryId;

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
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create');
      const room = await createPartyRoom({ profile: partyProfile, settings });
      toast.success(pick('สร้างห้องเรียบร้อยแล้ว', 'Room created'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('join');
      const room = await joinPartyRoom(joinCode, partyProfile);
      toast.success(pick('เข้าห้องเรียบร้อยแล้ว', 'Joined the room'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="party-page is-modern">
      <section className="party-hero container party-hub-shell">
        <header className="party-hero-copy party-hero-copy--refresh party-hub-header">
          <span className="party-kicker"><Radio size={16} />Music Guess Party</span>
          <h1>{pick('Music Guess Party', 'Music Guess Party')}</h1>
          <p>{pick('สร้างห้องแล้วเริ่มเดาเพลงได้ทันที', 'Create a room and start guessing instantly.')}</p>
        </header>

        <form className="party-join-strip card-modern" onSubmit={handleJoin}>
          <div className="party-join-strip-copy">
            <strong>{pick('เข้าร่วมห้อง', 'Join Room')}</strong>
          </div>
          <div className="party-join-inline-form">
            <input
              type="text"
              className="party-room-code-input party-room-code-input--compact"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              aria-label={pick('รหัสห้อง', 'Room code')}
            />
            <Button className="party-gradient-action party-gradient-action--join" size="large" type="submit" disabled={busyAction === 'join' || joinCode.trim().length < 6}>
              {busyAction === 'join' ? pick('กำลังเข้า...', 'Joining...') : pick('Join Room', 'Join Room')}
            </Button>
          </div>
        </form>

        <div className="party-builder-layout party-builder-layout--refresh">
          <form className="party-builder-panel card-modern party-builder-panel--refresh" onSubmit={handleCreate}>
            <h2 className="party-builder-title">{pick('สร้างห้องใหม่', 'Create New Room')}</h2>

            <div className="party-field">
              <span>{pick('โหมดเกม', 'Game mode')}</span>
              <div className="party-preset-showcase">
                {PARTY_PRESETS.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    selected={settings.presetId === preset.id}
                    pick={pick}
                    onSelect={(presetId) => setSettings((current) => ({ ...current, presetId }))}
                  />
                ))}
              </div>
            </div>

            <div className="party-inline-fields">
              <label className="party-field">
                <span>{pick('หมวดเพลง', 'Song pool')}</span>
                <select
                  value={songPoolSelectValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue.startsWith('preset:')) {
                      const presetId = Number(nextValue.replace('preset:', '')) || 0;
                      const preset = songPresetOptions.find((entry) => entry.id === presetId);
                      setSettings((current) => ({
                        ...current,
                        categoryId: 'all',
                        songPresetId: preset ? String(preset.id) : '',
                        songPresetName: preset?.name || '',
                      }));
                      return;
                    }

                    setSettings((current) => ({
                      ...current,
                      categoryId: nextValue,
                      songPresetId: '',
                      songPresetName: '',
                    }));
                  }}
                >
                  {PARTY_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{pick(option.labelTh, option.label)}</option>
                  ))}
                  {songPresetOptions.length > 0 ? (
                    <optgroup label={pick('Preset เพลง', 'Song presets')}>
                      {songPresetOptions.map((option) => (
                        <option key={option.id} value={`preset:${option.id}`}>{option.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('จำนวนรอบ', 'Rounds')}</span>
                <select
                  value={settings.roundCount}
                  onChange={(event) => setSettings((current) => ({ ...current, roundCount: Number(event.target.value) }))}
                >
                  {[5, 10, 15, 20].map((count) => (
                    <option key={count} value={count}>{count} {pick('รอบ', 'rounds')}</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('เวลาเล่นเพลง', 'Clip time')}</span>
                <select
                  value={settings.timePerRoundSec}
                  onChange={(event) => setSettings((current) => ({ ...current, timePerRoundSec: Number(event.target.value) }))}
                >
                  {[8, 10, 12, 15, 20].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} {pick('วินาที', 'sec')}</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('เวลาเฉลย', 'Reveal time')}</span>
                <select
                  value={settings.revealSec}
                  onChange={(event) => setSettings((current) => ({ ...current, revealSec: Number(event.target.value) }))}
                >
                  {[6, 8, 10, 12, 15, 20].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} {pick('วินาที', 'sec')}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="party-field">
              <span>{pick('ตัวเลือกเสริม', 'Extra rules')}</span>
              <div className="party-toggle-grid">
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.showLiveScores}
                    onChange={(event) => setSettings((current) => ({ ...current, showLiveScores: event.target.checked }))}
                  />
                  <span>{pick('แสดงคะแนนสด', 'Live scores')}</span>
                  <small>{pick('เห็นอันดับหลังจบแต่ละรอบ', 'Show standings after each round')}</small>
                </label>
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.randomOrder}
                    onChange={(event) => setSettings((current) => ({ ...current, randomOrder: event.target.checked }))}
                  />
                  <span>{pick('สุ่มลำดับเพลง', 'Shuffle songs')}</span>
                  <small>{pick('สลับเพลย์ลิสต์ก่อนเริ่มเกม', 'Randomize the playlist before the match begins')}</small>
                </label>
              </div>
            </div>

            <div className="party-settings-summary party-settings-summary--compact">
              <article className="party-stat-pill">
                <strong>{pick(selectedPreset.labelTh, selectedPreset.label)}</strong>
                <span>{pick('preset', 'preset')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{pick(selectedPoolLabelTh, selectedPoolLabel)}</strong>
                <span>{pick('pool', 'pool')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.roundCount}</strong>
                <span>{pick('รอบ', 'rounds')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.timePerRoundSec}</strong>
                <span>{pick('วิเล่นเพลง', 'clip sec')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.revealSec}</strong>
                <span>{pick('วิเฉลย', 'reveal sec')}</span>
              </article>
            </div>

            <Button className="party-gradient-action" size="large" type="submit" disabled={busyAction === 'create'}>
              {busyAction === 'create' ? pick('กำลังสร้างห้อง...', 'Creating room...') : pick('Create Room', 'Create Room')}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

export function PartyRoomPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
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
  const [playbackEndedAtMs, setPlaybackEndedAtMs] = useState(null);
  const [revealPlaybackStartedAtMs, setRevealPlaybackStartedAtMs] = useState(null);
  const [revealPrefetchReady, setRevealPrefetchReady] = useState(false);
  const countdownAlertedSecondRef = useRef(null);
  const answerAlertedSecondRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const activeRoomCodeRef = useRef(roomCode);
  const activePhaseRef = useRef(null);
  const hasRealtimeSubscriptionRef = useRef(false);
  const shouldResyncOnSubscribeRef = useRef(false);
  const lastResyncAtRef = useRef(0);
  const hiddenAtRef = useRef(0);

  useEffect(() => {
    activeRoomCodeRef.current = roomCode;
  }, [roomCode]);

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
            syncError: status === 'CHANNEL_ERROR' ? pick('Realtime มีปัญหา กำลังเชื่อมต่อใหม่', 'Realtime connection dropped. Reconnecting...') : '',
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
        syncError: pick('การเชื่อมต่อหลุดชั่วคราว ข้อมูลอาจยังไม่ล่าสุด', 'Connection lost temporarily. Data may be stale.'),
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
  const prefetchedRound = useMemo(
    () => getPartyPrefetchRound(currentMatch, { revealPrefetchReady }),
    [currentMatch, revealPrefetchReady]
  );
  const selectedPoolName = room?.settings?.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolNameTh = room?.settings?.songPresetName
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
  }, [currentMatch?.id, currentMatch?.phase, currentRound?.id]);

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
      toast.success(pick('เข้าห้องเรียบร้อยแล้ว', 'Joined the room'));
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

  const handleStartMatch = async () => {
    if (!room || !isHost) {
      return;
    }

    const members = usePartyRoomStore.getState().members;

    try {
      setBusyAction('start');
      const nextRoom = await startPartyMatch(room, members);
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
      toast.success(pick('คัดลอก room code แล้ว', 'Room code copied'));
    } catch {
      toast.error(pick('คัดลอกไม่สำเร็จ', 'Could not copy the room code'));
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
          room: resetRoom,
        },
      });
      toast.success(pick('กลับไปที่ lobby แล้ว', 'Returned to the lobby'));
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

  if (loading) {
    return (
      <div className="party-page is-modern">
        <section className="party-room-shell container">
          <div className="party-loading-card card-modern">
            <Loader2 size={28} className="party-spin" />
            <strong>{pick('กำลังโหลดห้องเพลง...', 'Loading the party room...')}</strong>
          </div>
        </section>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="party-page is-modern">
        <section className="party-room-shell container">
          <ErrorState message={errorMessage} onRetry={() => void loadBundle()} className="party-error-card card-modern" />
        </section>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="party-page is-modern">
        <section className="party-room-shell container">
          <EmptyState
            icon={<XCircle size={24} />}
            title={pick('ไม่พบห้องนี้', 'Room not found')}
            message={pick('เช็ก code ให้ตรงอีกครั้ง หรือกลับไปสร้างห้องใหม่', 'Check the room code again or create a new room.')}
            action={<Link to="/party" className="party-text-link">{pick('กลับไปหน้า Party', 'Back to Party')}</Link>}
            className="party-empty-card card-modern"
          />
        </section>
      </div>
    );
  }

  if (!currentMember && room.status !== 'lobby') {
    return (
      <div className="party-page is-modern">
        <section className="party-room-shell container">
          <EmptyState
            icon={<Radio size={24} />}
            title={pick('แมตช์นี้กำลังเล่นอยู่', 'This match is already in progress')}
            message={pick('ตอนนี้ยังไม่มี spectator mode ให้รอ rematch ก่อนแล้วค่อยเข้าห้องอีกครั้ง', 'Spectator mode is not wired yet in this slice. Wait for the rematch to join the room.')}
            action={<Link to="/party" className="party-text-link">{pick('กลับไปหน้า Party', 'Back to Party')}</Link>}
            className="party-empty-card card-modern"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="party-page is-modern">
      <section className="party-room-shell container">
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
              payload: {
                room: nextRoom,
              },
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
            preload="auto"
            muted
            playsInline
            className="party-hidden-media"
            aria-hidden="true"
          />
        ) : null}
        <div className="party-room-top card-modern header-only">
          <div className="party-room-title">
            <h1>{pick('ห้อง', 'Room')} {room.room_code}</h1>
            <p>{pick(currentPreset.labelTh, currentPreset.label)} • {pick('หมวด', 'Category')} {pick(selectedPoolNameTh, selectedPoolName)}</p>
          </div>
          <div className="party-room-actions">
            <button type="button" className="party-code-btn" onClick={handleCopyCode}>
              <Copy size={15} />
              {pick('คัดลอกโค้ด', 'Copy code')}
            </button>
            <Link to="/party" className="party-code-btn subtle">{pick('กลับหน้า Party', 'Back to Party')}</Link>
          </div>
        </div>

        {showSyncBanner ? (
          <div className={`party-sync-banner card-modern ${syncState === 'stale' || syncState === 'error' ? 'is-stale' : ''}`}>
            <div className="party-sync-banner-copy">
              <strong>
                {syncState === 'syncing'
                  ? pick('กำลังซิงก์ห้องล่าสุด', 'Syncing latest room state')
                  : syncState === 'reconnecting'
                    ? pick('Realtime หลุด กำลังเชื่อมต่อใหม่', 'Realtime connection dropped. Reconnecting')
                    : syncState === 'stale'
                      ? pick('สถานะห้องอาจไม่ล่าสุด', 'Room state may be stale')
                      : pick('ซิงก์ห้องมีปัญหา', 'Room sync hit an issue')}
              </strong>
              <span>
                {syncError
                  || (lastSyncedLabel
                    ? pick(`ซิงก์ล่าสุด ${lastSyncedLabel}`, `Last synced at ${lastSyncedLabel}`)
                    : pick('ระบบจะดึงข้อมูลเต็มอีกครั้งเมื่อเชื่อมต่อกลับมา', 'The app will perform a full re-sync when the connection returns.'))}
              </span>
            </div>
            <div className="party-sync-banner-icon" aria-hidden="true">
              {syncState === 'syncing' ? <Loader2 size={18} className="party-spin" /> : <Radio size={18} />}
            </div>
          </div>
        ) : null}

        {!currentMember ? (
          <div className="party-inline-join card-modern party-inline-join--refresh">
            <div className="party-panel-head">
              <strong>{pick('เข้าห้องนี้', 'Join this room')}</strong>
              <span>{pick('ใช้โปรไฟล์ปัจจุบันของคุณแล้วเข้าล็อบบี้ได้ทันที', 'Use your current profile and jump straight into the lobby.')}</span>
            </div>
            <div className="party-profile-preview party-profile-preview--inline">
              <PartyIdentityAvatar profile={partyProfile} />
              <div className="party-profile-copy">
                <strong>{partyProfile.displayName}</strong>
                <span>{pick('ไม่มีขั้นตอนกรอกชื่อหรือเลือกสีแล้ว', 'No extra name or avatar step anymore')}</span>
              </div>
            </div>
            <Button variant="primary" onClick={handleInlineJoin} disabled={busyAction === 'inline-join'}>
              {busyAction === 'inline-join' ? pick('กำลังเข้าห้อง...', 'Joining...') : pick('เข้าห้องด้วยโปรไฟล์นี้', 'Join this room with my profile')}
            </Button>
          </div>
        ) : null}

        {room.status === 'lobby' || !currentMatch ? (
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
            <div className="party-phase-banner card-modern header-only">
              <span className="party-chip">
                <TimerReset size={14} />
                {currentMatch.phase === 'countdown'
                  ? pick('กำลังนับถอยหลัง', 'Countdown')
                  : currentMatch.phase === 'question'
                    ? pick('กำลังเปิดคำถาม', 'Question open')
                    : pick('กำลังเฉลย', 'Reveal')}
              </span>
              <strong>
                {currentMatch.phase === 'countdown'
                  ? pick('เตรียมตัวให้พร้อม รอบถัดไปกำลังเริ่ม', 'Get ready, the next round is about to start')
                  : currentMatch.phase === 'question'
                    ? pick('เพลงเริ่มแล้ว รีบตอบก่อนหมดเวลา', 'The audio is live. Lock your answer before time runs out')
                    : pick('ดูเฉลยและตารางคะแนนก่อนขึ้นรอบถัดไป', 'Review the answer and standings before the next round')}
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
                <section className="party-countdown-card card-modern">
                  <span className="party-chip"><Sparkles size={14} />{pick('อีกครู่เดียว', 'Coming up')}</span>
                  <h2>{pick('เตรียมพร้อมสำหรับรอบถัดไป', 'Prepare for the next round')}</h2>
                  <p>{pick('ระบบกำลังจัด cue และเตรียมเปิดเพลงถัดไป', 'The room is lining up the next cue and getting the next mystery audio ready.')}</p>
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
                  onPlaybackComplete={setPlaybackEndedAtMs}
                  onSubmit={handleSubmitAnswer}
                  pick={pick}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
