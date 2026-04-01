import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  Copy,
  LibrarySquare,
  Loader2,
  Radio,
  Sparkles,
  TimerReset,
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
import {
  closePartyRoom,
  createPartyRoom,
  extendPartyQuestionPhase,
  fetchPartyRoomBundle,
  fetchPartyTemplateDetail,
  fetchPartyTemplateSongPool,
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
import {
  analyzePartyTemplateCompatibility,
  getTemplateCoverUrl,
} from '@/features/party/lib/partyTemplateUtils';
import { useCurrentPartyMember } from '@/features/party/lib/usePartyRoomSelectors';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { PartyFinalView } from './PartyFinal';
import { PartyLobbyView } from './PartyLobby';
import { PartyQuestionView } from './PartyQuestion';
import { PartyRevealView } from './PartyReveal';
import { PartyVoteRoomView } from '../components/PartyVoteRoomView';
import {
  PartyAutoAdvance,
  PartyCountdownDisplay,
  PartyIdentityAvatar,
  PresetCard,
} from './PartyRoomShared';
import {
  buildPartyProfile,
  getCountdownSeconds,
  getPartyPrefetchPreloadValue,
  getPartyPrefetchRound,
  playPartyCountdownAlert,
  readPartyAudioVolume,
} from './partyRoomUtils';
import './Party.css';

function getPartyTemplateReasonText(reason) {
  if (!reason) {
    return '';
  }

  if (reason.code === 'insufficient_playable_songs') {
    return `${reason.label} needs at least ${reason.requiredCount} playable songs, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_distinct_sources') {
    return `${reason.label} needs at least ${reason.requiredCount} distinct source titles with usable metadata, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_answerable_songs') {
    return reason.message;
  }

  if (reason.code === 'missing_source_metadata') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} ${reason.actualCount === 1 ? 'is' : 'are'} still missing a usable source title.`;
  }

  if (reason.code === 'missing_song_titles') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} ${reason.actualCount === 1 ? 'is' : 'are'} still missing a song title.`;
  }

  return reason.message;
}

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [songPresetOptions, setSongPresetOptions] = useState([]);
  const [templatePlayablePool, setTemplatePlayablePool] = useState([]);
  const [templatePoolLoaded, setTemplatePoolLoaded] = useState(false);
  const [settings, setSettings] = useState(createPartySettings({
    modeType: 'quiz',
    presetId: PARTY_PRESETS[0].id,
    roundCount: 10,
    entrantCount: 8,
    clipPlaybackMode: 'preview',
    timePerRoundSec: 12,
    voteSec: 10,
    revealSec: 12,
    categoryId: 'all',
    keyword: '',
    showLiveScores: true,
    randomOrder: true,
  }));
  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const selectedPreset = getPartyPresetById(settings.presetId);
  const supportsLongClipTime = settings.modeType === 'vote';
  const clipTimeOptions = supportsLongClipTime
    ? [8, 10, 12, 15, 20, 30, 45, 60, 90, 120, 150, 180]
    : [8, 10, 12, 15, 20];
  const selectedPoolLabel = settings.songPresetName
    || settings.templateName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolLabelTh = settings.songPresetName
    || settings.templateName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.labelTh
    || PARTY_CATEGORY_OPTIONS[0].labelTh;
  const songPoolSelectValue = settings.songPresetId ? `preset:${settings.songPresetId}` : settings.categoryId;
  const templatePlayableCount = Math.max(0, Number(settings.templatePlayableCount || 0));
  const templateCompatibility = useMemo(() => {
    if (!settings.templateId || !templatePoolLoaded) {
      return null;
    }

    return analyzePartyTemplateCompatibility(templatePlayablePool, settings);
  }, [settings, templatePlayablePool, templatePoolLoaded]);
  const templatePresetAvailability = useMemo(
    () => templateCompatibility?.presetResults || {},
    [templateCompatibility],
  );
  const templatePresetMaxRounds = useMemo(() => {
    if (!settings.templateId || !templatePoolLoaded || !templateCompatibility) {
      return {};
    }

    return {
      'party-classic': templateCompatibility.distinctChoiceAnswerCount >= 4
        ? templateCompatibility.choiceEligibleCount
        : 0,
      'song-typing': templateCompatibility.songTypingEligibleCount,
      'full-recall': templateCompatibility.fullRecallEligibleCount,
    };
  }, [settings.templateId, templateCompatibility, templatePoolLoaded]);
  const quizRoundOptions = useMemo(() => {
    if (!settings.templateId || settings.modeType !== 'quiz') {
      return [2, 5, 10, 15, 20];
    }

    const presetCap = Number(templatePresetMaxRounds[settings.presetId] || 0);
    const maxRounds = Math.max(2, presetCap || templatePlayableCount);
    const options = [2, 5, 10, 15, 20].filter((count) => count <= maxRounds);
    if (!options.includes(maxRounds)) {
      options.push(maxRounds);
    }
    return [...new Set(options)].sort((a, b) => a - b);
  }, [settings.modeType, settings.presetId, settings.templateId, templatePlayableCount, templatePresetMaxRounds]);
  const voteEntrantOptions = useMemo(() => {
    if (!settings.templateId || settings.modeType !== 'vote' || templatePlayableCount <= 0) {
      return [2, 4, 8, 16];
    }

    const options = [2, 4, 8, 16].filter((count) => count <= templatePlayableCount);
    return options.length > 0 ? options : [2];
  }, [settings.modeType, settings.templateId, templatePlayableCount]);
  const suggestedTemplatePresetId = useMemo(
    () => PARTY_PRESETS.find((preset) => templatePresetAvailability[preset.id]?.compatible)?.id || null,
    [templatePresetAvailability],
  );
  const templateValidation = useMemo(() => {
    const targetResult = templateCompatibility?.targetResult;
    if (!settings.templateId || !templatePoolLoaded || !targetResult) {
      return { ok: true, message: '' };
    }

    return {
      ok: targetResult.compatible,
      message: getPartyTemplateReasonText(targetResult.blockingReasons?.[0], pick),
    };
  }, [pick, settings.templateId, templateCompatibility, templatePoolLoaded]);

  useEffect(() => {
    const templateId = searchParams.get('templateId');
    const templateName = searchParams.get('templateName');
    const modeType = searchParams.get('modeType');
    const modeScope = searchParams.get('modeScope') || 'all';
    const presetId = searchParams.get('presetId');

    if (!templateId) {
      return;
    }

    const resolvedMode = (modeType === 'vote' || modeType === 'quiz')
      ? modeType
      : modeScope === 'vote'
        ? 'vote'
        : 'quiz';

    setSettings((current) => ({
      ...current,
      templateId,
      templateName: templateName ? decodeURIComponent(templateName) : '',
      modeType: resolvedMode,
      modeScope,
      presetId: presetId || current.presetId,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (!settings.templateId) {
      setTemplatePlayablePool([]);
      setTemplatePoolLoaded(false);
      return undefined;
    }

    let ignore = false;
    setTemplatePoolLoaded(false);

    Promise.all([
      fetchPartyTemplateDetail(settings.templateId).catch(() => null),
      fetchPartyTemplateSongPool(settings.templateId).catch(() => []),
    ]).then(([templateDetail, playablePool]) => {
      if (ignore) {
        return;
      }

      const playableCount = Array.isArray(playablePool) ? playablePool.length : 0;
      setTemplatePlayablePool(Array.isArray(playablePool) ? playablePool : []);
      setTemplatePoolLoaded(true);
      setSettings((current) => {
        if (String(current.templateId || '') !== String(settings.templateId || '')) {
          return current;
        }

        const next = {
          ...current,
          templateName: templateDetail?.name || current.templateName,
          templateCoverUrl: templateDetail?.coverUrl || current.templateCoverUrl || '',
          templatePlayableCount: playableCount,
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
  }, [settings.templateId]);

  useEffect(() => {
    if (!settings.templateId || templatePlayableCount <= 0) {
      return;
    }

    setSettings((current) => {
      if (!current.templateId) {
        return current;
      }

      if (current.modeType === 'quiz') {
        const presetCap = Number(templatePresetMaxRounds[current.presetId] || 0);
        const maxRounds = Math.max(2, presetCap || templatePlayableCount);
        const nextRoundCount = Math.min(Number(current.roundCount || 10), maxRounds);
        return nextRoundCount === current.roundCount ? current : { ...current, roundCount: nextRoundCount };
      }

      const allowedEntrants = [2, 4, 8, 16].filter((count) => count <= templatePlayableCount);
      if (allowedEntrants.length === 0) {
        return current;
      }

      const nextEntrantCount = allowedEntrants.includes(Number(current.entrantCount || 0))
        ? Number(current.entrantCount || 0)
        : allowedEntrants[allowedEntrants.length - 1];

      return nextEntrantCount === current.entrantCount ? current : { ...current, entrantCount: nextEntrantCount };
    });
  }, [settings.templateId, settings.modeType, templatePlayableCount, templatePresetMaxRounds]);

  useEffect(() => {
    if (!settings.templateId || settings.modeType !== 'quiz' || !templatePoolLoaded) {
      return;
    }

    const currentPresetAvailability = templatePresetAvailability[settings.presetId];
    if (currentPresetAvailability?.compatible) {
      return;
    }

    const fallbackPreset = PARTY_PRESETS.find((preset) => templatePresetAvailability[preset.id]?.compatible);
    if (!fallbackPreset || fallbackPreset.id === settings.presetId) {
      return;
    }

    setSettings((current) => {
      if (!current.templateId || current.modeType !== 'quiz' || current.presetId !== settings.presetId) {
        return current;
      }
      return { ...current, presetId: fallbackPreset.id };
    });
  }, [
    settings.modeType,
    settings.presetId,
    settings.templateId,
    templatePoolLoaded,
    templatePresetAvailability,
  ]);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create');
      if (settings.templateId) {
        const pool = await fetchPartyTemplateSongPool(settings.templateId).catch(() => null);
        if (pool !== null) {
          const compatibility = analyzePartyTemplateCompatibility(pool, settings);
          if (!compatibility.targetResult?.compatible) {
            toast.error(getPartyTemplateReasonText(compatibility.targetResult?.blockingReasons?.[0], pick));
            return;
          }
        }
      }

      const room = await createPartyRoom({ profile: partyProfile, settings });
      toast.success(pick('สร้างห้องสำเร็จ', 'Room created'));
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
      toast.success(pick('เข้าร่วมห้องแล้ว', 'Joined the room'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="party-page is-hub">
      <section className="container party-hub-shell">
        <header className="party-hub-header">
          <span className="party-kicker"><Radio size={16} />Music Guess Party</span>
          <h1>{pick('Music Guess Party', 'Music Guess Party')}</h1>
          <p>{pick('สร้างห้องแล้วเดาเพลงได้เลย', 'Create a room and start guessing instantly.')}</p>
        </header>

        <form className="party-join-strip" onSubmit={handleJoin}>
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
              {busyAction === 'join' ? pick('กำลังเข้าร่วม...', 'Joining...') : pick('เข้าร่วมห้อง', 'Join Room')}
            </Button>
          </div>
        </form>

        <div className="party-builder-layout--refresh">
          <form className="party-builder-panel--refresh" onSubmit={handleCreate}>
            <h2 className="party-builder-title">{pick('สร้างห้องใหม่', 'Create New Room')}</h2>

            {settings.templateId ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(var(--color-primary-rgb), 0.1)', border: '1px solid rgba(var(--color-primary-rgb), 0.35)', borderRadius: '10px', padding: '0.75rem 1rem', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                  <LibrarySquare size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--color-text-muted)' }}>{pick('เทมเพลต:', 'Template:')}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '0.6rem',
                      backgroundImage: `url(${getTemplateCoverUrl(settings.templateCoverUrl)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
                      flexShrink: 0,
                    }}
                  />
                  <strong style={{ color: 'var(--color-text)' }}>{settings.templateName || settings.templateId}</strong>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => navigate('/party/templates')}
                  >
                    {pick('เปลี่ยน', 'Change')}
                  </button>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.3rem' }}
                    onClick={() => setSettings((current) => ({
                      ...current,
                      templateId: '',
                      templateName: '',
                      templateCoverUrl: '',
                      templatePlayableCount: 0,
                    }))}
                    title={pick('ล้างเทมเพลต', 'Clear template')}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary party-template-picker-button"
                onClick={() => navigate('/party/templates')}
              >
                <span className="party-template-picker-button__icon" aria-hidden="true">
                  <LibrarySquare size={18} />
                </span>
                <span className="party-template-picker-button__content">
                  <strong>{pick('เลือกเทมเพลตจากชุมชน', 'Browse Community Templates')}</strong>
                  <small>
                    {pick(
                      'ชุดเพลงที่คนอื่นสร้างไว้ นำมาใช้ได้เลย',
                      'Ready-made song sets created by the community.',
                    )}
                  </small>
                </span>
                <span className="party-template-picker-button__action">
                  {pick('เลือกดู', 'Browse')}
                  <ChevronRight size={16} />
                </span>
              </button>
            )}

            {settings.templateId && templatePoolLoaded && !templateValidation.ok ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#b45309' }}>
                <TimerReset size={15} style={{ flexShrink: 0 }} />
                {templateValidation.message}
              </div>
            ) : null}
            {settings.templateId && templatePoolLoaded && templateValidation.ok && templateCompatibility?.warnings?.[0] ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#b45309' }}>
                <TimerReset size={15} style={{ flexShrink: 0 }} />
                {getPartyTemplateReasonText(templateCompatibility.warnings[0], pick)}
              </div>
            ) : null}
            {settings.templateId && templatePoolLoaded && templateCompatibility ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(var(--color-primary-rgb), 0.06)', border: '1px solid rgba(var(--color-primary-rgb), 0.16)', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>
                  {pick(
                    `${templateCompatibility.playableSongCount} playable songs, ${templateCompatibility.choiceEligibleCount} choice-ready songs, ${templateCompatibility.distinctChoiceAnswerCount} distinct choices.`,
                    `${templateCompatibility.playableSongCount} playable songs, ${templateCompatibility.choiceEligibleCount} choice-ready songs, ${templateCompatibility.distinctChoiceAnswerCount} distinct choices.`,
                  )}
                </span>
                {templateCompatibility.unresolvedSourceCount > 0 ? (
                  <span>
                    {pick(
                      `${templateCompatibility.unresolvedSourceCount} songs are still missing canonical source links; without them, 4-choice falls back to song-title answers.`,
                      `${templateCompatibility.unresolvedSourceCount} songs are still missing canonical source links; without them, 4-choice falls back to song-title answers.`,
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="party-field">
                <span>{pick('ประเภทแมตช์', 'Match Type')}</span>
              <div className="party-toggle-grid">
                <label
                  className="party-toggle--card"
                  style={settings.templateId && settings.modeScope === 'vote' ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                >
                  <input
                    type="radio"
                    name="mainModeType"
                    checked={settings.modeType === 'quiz'}
                    disabled={Boolean(settings.templateId && settings.modeScope === 'vote')}
                    onChange={() => setSettings((current) => ({ ...current, modeType: 'quiz', timePerRoundSec: Math.min(20, Number(current.timePerRoundSec || 12)) }))}
                  />
                  <span>{pick('ทายเพลง', 'Music Quiz')}</span>
                </label>
                <label
                  className="party-toggle--card"
                  style={settings.templateId && settings.modeScope === 'quiz' ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                >
                  <input
                    type="radio"
                    name="mainModeType"
                    checked={settings.modeType === 'vote'}
                    disabled={Boolean(settings.templateId && settings.modeScope === 'quiz')}
                    onChange={() => setSettings((current) => ({ ...current, modeType: 'vote' }))}
                  />
                    <span>{pick('โหวตแบทเทิล', 'Vote Battle')}</span>
                </label>
              </div>
              {settings.templateId && settings.modeScope !== 'all' ? (
                <small style={{ color: 'var(--color-text-muted)', marginTop: '0.4rem', display: 'block' }}>
                  {pick(
                      `Template only supports ${settings.modeScope === 'quiz' ? 'Music Quiz' : 'Vote Battle'}`,
                    `This template only supports ${settings.modeScope === 'quiz' ? 'Music Quiz' : 'Vote Battle'} mode.`,
                  )}
                </small>
              ) : null}
            </div>

            {settings.modeType === 'quiz' && (
              <div className="party-field">
                <span>{pick('โหมดเกม', 'Game mode')}</span>
                <div className="party-preset-showcase">
                  {PARTY_PRESETS.map((preset) => {
                    const availability = templatePresetAvailability[preset.id];
                    const isTemplateBound = settings.templateId && templatePoolLoaded;
                    const helperText = !isTemplateBound
                      ? ''
                      : availability?.compatible
                        ? suggestedTemplatePresetId === preset.id
                    ? pick('แนะนำสำหรับเทมเพลตนี้', 'Recommended for this template')
                          : ''
                        : getPartyTemplateReasonText(availability?.blockingReasons?.[0], pick);
                    return (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        selected={settings.presetId === preset.id}
                        disabled={Boolean(isTemplateBound && availability && !availability.compatible)}
                        helperText={helperText}
                        pick={pick}
                        onSelect={(presetId) => {
                          setSettings((current) => ({
                            ...current,
                            presetId,
                            timePerRoundSec: Math.min(20, Number(current.timePerRoundSec || 12)),
                          }));
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="party-inline-fields">
              {settings.templateId ? (
                <div className="party-field">
                <span>{pick('คลังเพลง', 'Song pool')}</span>
                  <div style={{ padding: '0.55rem 0.75rem', borderRadius: '8px', background: 'rgba(var(--color-primary-rgb), 0.08)', border: '1px solid rgba(var(--color-primary-rgb), 0.25)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                    <LibrarySquare size={14} style={{ display: 'inline', marginRight: '0.4rem', verticalAlign: 'middle', color: 'var(--color-primary)' }} />
                  {pick('เพลงจากเทมเพลต', 'Songs from template')}
                  </div>
                </div>
              ) : (
                <label className="party-field">
                <span>{pick('คลังเพลง', 'Song pool')}</span>
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
                    <optgroup label={pick('ชุดเพลง', 'Song presets')}>
                        {songPresetOptions.map((option) => (
                          <option key={option.id} value={`preset:${option.id}`}>{option.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
              )}
              <label className="party-field">
                <span>{settings.modeType === 'vote' ? pick('เพลงเริ่มต้น', 'Starting songs') : pick('รอบ', 'Rounds')}</span>
                <select
                  value={settings.modeType === 'vote' ? settings.entrantCount : settings.roundCount}
                  onChange={(event) => setSettings((current) => (
                    current.modeType === 'vote'
                      ? { ...current, entrantCount: Number(event.target.value) }
                      : { ...current, roundCount: Number(event.target.value) }
                  ))}
                >
                  {(settings.modeType === 'vote' ? voteEntrantOptions : quizRoundOptions).map((count) => (
                    <option key={count} value={count}>{count} {settings.modeType === 'vote' ? pick('เพลง', 'songs') : pick('รอบ', 'rounds')}</option>
                  ))}
                </select>
                {settings.templateId && settings.templatePlayableCount > 0 ? (
                  <small style={{ color: 'var(--color-text-muted)', marginTop: '0.4rem', display: 'block' }}>
                    {pick(
                      settings.modeType === 'quiz'
                        ? `This preset supports up to ${templatePresetMaxRounds[settings.presetId] || settings.templatePlayableCount} rounds with this template`
                        : `Limited by ${settings.templatePlayableCount} playable songs in this template`,
                      settings.modeType === 'quiz'
                        ? `This preset supports up to ${templatePresetMaxRounds[settings.presetId] || settings.templatePlayableCount} rounds with this template.`
                        : `Limited by ${settings.templatePlayableCount} playable songs in this template.`,
                    )}
                  </small>
                ) : null}
              </label>
              <label className="party-field">
                <span>{supportsLongClipTime ? pick('เวลาเพลงสูงสุด', 'Song max time') : pick('เวลาคลิป', 'Clip time')}</span>
                <select
                  value={settings.timePerRoundSec}
                  onChange={(event) => setSettings((current) => ({ ...current, timePerRoundSec: Number(event.target.value) }))}
                >
                  {clipTimeOptions.map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} {pick('วิ', 'sec')}</option>
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
                    <option key={seconds} value={seconds}>{seconds} {pick('วิ', 'sec')}</option>
                  ))}
                </select>
              </label>
              {settings.modeType === 'vote' ? (
                <label className="party-field">
                  <span>{pick('เวลาโหวต', 'Vote time')}</span>
                  <select
                    value={settings.voteSec}
                    onChange={(event) => setSettings((current) => ({ ...current, voteSec: Number(event.target.value) }))}
                  >
                    {[5, 8, 10, 12, 15, 20].map((seconds) => (
                      <option key={seconds} value={seconds}>{seconds} {pick('วิ', 'sec')}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="party-field">
              <span>{pick('กฎเพิ่มเติม', 'Extra rules')}</span>
              <div className="party-toggle-grid">
                {settings.modeType === 'vote' ? (
                  <label className="party-toggle--card">
                    <input
                      type="checkbox"
                      checked={settings.clipPlaybackMode === 'full'}
                      onChange={(event) => setSettings((current) => ({
                        ...current,
                        clipPlaybackMode: event.target.checked ? 'full' : 'preview',
                      }))}
                    />
                    <span>{pick('เล่นเต็มคลิป', 'Play full clip')}</span>
                    <small>{pick('ปิด = เล่นแค่ช่วงตัวอย่าง, เปิด = เล่นจนจบคลิป', 'Off uses the configured clip preview. On plays until the clip ends naturally.')}</small>
                  </label>
                ) : null}
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.showLiveScores}
                    onChange={(event) => setSettings((current) => ({ ...current, showLiveScores: event.target.checked }))}
                  />
                  <span>{pick('คะแนนเรียลไทม์', 'Live scores')}</span>
                  <small>{pick('แสดงอันดับหลังแต่ละรอบ', 'Show standings after each round')}</small>
                </label>
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.randomOrder}
                    onChange={(event) => setSettings((current) => ({ ...current, randomOrder: event.target.checked }))}
                  />
                  <span>{pick('สุ่มเพลง', 'Shuffle songs')}</span>
                  <small>{pick('สุ่มลำดับเพลงก่อนเริ่มแมตช์', 'Randomize the playlist before the match begins')}</small>
                </label>
              </div>
            </div>

            <div className="party-settings-summary party-settings-summary--compact">
              <article className="party-stat-pill">
                <strong>{pick(selectedPreset.labelTh, selectedPreset.label)}</strong>
                <span>{pick('โหมด', 'preset')}</span>
              </article>
              {settings.templateId ? (
                <article className="party-stat-pill" style={{ background: 'rgba(var(--color-primary-rgb), 0.15)' }}>
                  <strong>{settings.templateName || settings.templateId}</strong>
                  <span>{pick('เทมเพลต', 'template')}</span>
                </article>
              ) : (
                <article className="party-stat-pill">
                  <strong>{pick(selectedPoolLabelTh, selectedPoolLabel)}</strong>
                  <span>{pick('คลังเพลง', 'pool')}</span>
                </article>
              )}
              {settings.templateId && settings.templatePlayableCount > 0 ? (
                <article className="party-stat-pill">
                  <strong>{settings.templatePlayableCount}</strong>
                  <span>{pick('เพลงที่เล่นได้', 'playable songs')}</span>
                </article>
              ) : null}
              <article className="party-stat-pill">
                <strong>{settings.modeType === 'vote' ? settings.entrantCount : settings.roundCount}</strong>
                <span>{settings.modeType === 'vote' ? pick('เพลงเริ่มต้น', 'Starting songs') : pick('รอบ', 'Rounds')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.timePerRoundSec}</strong>
                <span>{supportsLongClipTime ? pick('วิ สูงสุด', 'max sec') : pick('วิ คลิป', 'clip sec')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.revealSec}</strong>
                <span>{pick('วิ เฉลย', 'reveal sec')}</span>
              </article>
              {settings.modeType === 'vote' ? (
                <article className="party-stat-pill">
                  <strong>{settings.voteSec}</strong>
                  <span>{pick('วิ โหวต', 'vote sec')}</span>
                </article>
              ) : null}
            </div>

            <Button className="party-gradient-action" size="large" type="submit" disabled={busyAction === 'create'}>
              {busyAction === 'create' ? pick('กำลังสร้างห้อง...', 'Creating room...') : pick('สร้างห้อง', 'Create Room')}
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
  const questionPlaybackAdjustedRef = useRef(false);
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
  const selectedPoolName = room?.settings?.templateName
    || room?.settings?.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolNameTh = room?.settings?.templateName
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
      toast.success(pick('Match started', 'Match started'));
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
      toast.success(pick('Room code copied', 'Room code copied'));
    } catch {
      toast.error(pick('Could not copy the room code', 'Could not copy the room code'));
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
      toast.success(pick('Room closed', 'Room closed'));
      navigate('/party');
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <div className="party-page">
        <div className="party-game-canvas">
          <div className="party-loading-card">
            <Loader2 size={28} className="party-spin" />
            <strong>{pick('Loading the party room...', 'Loading the party room...')}</strong>
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
            icon={<Radio size={24} />}
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
              {syncState === 'syncing' ? <Loader2 size={16} className="party-spin" /> : <Radio size={16} />}
            </div>
            <div className="party-sync-banner-copy">
              <strong>
                {syncState === 'syncing' ? pick('กำลังซิงค์...', 'Syncing...') : syncState === 'reconnecting' ? pick('กำลังเชื่อมต่อใหม่...', 'Reconnecting...') : pick('ข้อมูลห้องอาจไม่อัปเดต', 'Room state may be stale')}
              </strong>
              <span>{syncError || (lastSyncedLabel ? pick(`Last synced at ${lastSyncedLabel}`, `Last synced at ${lastSyncedLabel}`) : '')}</span>
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





