import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AudioLines,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  Disc3,
  Headphones,
  Loader2,
  Mic2,
  Music2,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  TimerReset,
  Users2,
  Volume2,
  VolumeX,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  PARTY_AVATAR_OPTIONS,
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  buildPartyLeaderboard,
  countPartyRoundAnswers,
  createPartySettings,
  getPartyCurrentRound,
  getPartyPresetById,
} from '@/features/party/lib/partyEngine';
import {
  advancePartyRoom,
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
import './Party.css';

const PARTY_AUDIO_VOLUME_KEY = 'moodtoon-party-audio-volume';

function readPartyAudioVolume() {
  if (typeof window === 'undefined') {
    return 85;
  }

  const raw = Number(window.localStorage.getItem(PARTY_AUDIO_VOLUME_KEY));
  if (!Number.isFinite(raw)) {
    return 85;
  }

  return Math.min(100, Math.max(0, raw));
}

function formatCountdown(ms, pick) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return pick('0 วินาที', '0s');
  }

  const seconds = Math.ceil(ms / 1000);
  return pick(`${seconds} วินาที`, `${seconds}s`);
}

function formatFastest(ms, pick) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return pick('ยังไม่มี', '—');
  }

  return pick(`${(ms / 1000).toFixed(2)} วิ`, `${(ms / 1000).toFixed(2)}s`);
}

function formatClipSeconds(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0.0s';
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function playPartyCountdownAlert(audioContext, volume = 85, step = 3) {
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0)) / 100;
  const accent = Math.max(0, Math.min(1, normalizedVolume * 0.54));
  const targetStep = Math.max(1, Number(step) || 1);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(targetStep === 1 ? 1120 : targetStep === 2 ? 980 : 860, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.001, accent), now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.2);
}

function getAvatarTone(avatarKey) {
  return PARTY_AVATAR_OPTIONS.find((avatar) => avatar.id === avatarKey)?.tone || PARTY_AVATAR_OPTIONS[0].tone;
}

function hashPartySeed(value = '') {
  return Array.from(String(value || '')).reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getPartyProfileName(user, savedProfile) {
  return String(
    user?.profile?.name
    || user?.profile?.username
    || user?.email?.split('@')[0]
    || savedProfile?.displayName
    || 'Guest'
  ).trim();
}

function getPartyProfileAvatarKey(user, savedProfile) {
  if (user?.id || user?.profile?.username || user?.profile?.name || user?.email) {
    const seed = user?.id || user?.profile?.username || user?.profile?.name || user?.email || '';
    return PARTY_AVATAR_OPTIONS[hashPartySeed(seed) % PARTY_AVATAR_OPTIONS.length]?.id || PARTY_AVATAR_OPTIONS[0].id;
  }

  if (PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === savedProfile?.avatarKey)) {
    return savedProfile.avatarKey;
  }

  return PARTY_AVATAR_OPTIONS[0].id;
}

function buildPartyProfile(user, savedProfile) {
  return {
    displayName: getPartyProfileName(user, savedProfile),
    avatarKey: getPartyProfileAvatarKey(user, savedProfile),
    avatarUrl: String(user?.profile?.avatar_url || '').trim(),
  };
}

function PartyIdentityAvatar({ profile, className = '' }) {
  const label = String(profile?.displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.avatarUrl]);

  if (profile?.avatarUrl && !imageFailed) {
    return (
      <div className={`party-player-avatar party-profile-avatar has-image ${className}`.trim()}>
        <img src={profile.avatarUrl} alt="" className="party-profile-avatar-image" onError={() => setImageFailed(true)} />
      </div>
    );
  }

  return (
    <div className={`party-player-avatar party-profile-avatar tone-${getAvatarTone(profile?.avatarKey)} ${className}`.trim()}>
      <span>{label}</span>
    </div>
  );
}

function PresetCard({ preset, selected, pick, onSelect }) {
  const icon = preset.id === 'party-classic'
    ? <Radio size={18} />
    : preset.id === 'song-typing'
      ? <Mic2 size={18} />
      : <WandSparkles size={18} />;

  return (
    <button
      type="button"
      className={`party-preset-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-pressed={selected}
    >
      <span className="party-preset-icon">{icon}</span>
      <strong>{pick(preset.labelTh, preset.label)}</strong>
      <p>{pick(preset.descriptionTh, preset.description)}</p>
      <span className="party-preset-tag">
        {preset.answerMode === 'choice'
          ? pick('4 ตัวเลือก', '4 choices')
          : preset.answerMode === 'typing'
            ? pick('พิมพ์ชื่อเพลง', 'Type song title')
            : pick('พิมพ์ 2 คำตอบ', 'Dual input')}
      </span>
    </button>
  );
}

function PartyPlayerList({ members = [], hostToken = '', currentToken = '', pick }) {
  return (
    <div className="party-player-list">
      {members.map((member) => {
        const isHost = String(member.member_token || '') === String(hostToken || '');
        const isCurrent = String(member.member_token || '') === String(currentToken || '');
        return (
          <article key={member.id || member.member_token} className="party-player-card">
            <PartyIdentityAvatar
              profile={{
                displayName: member.display_name,
                avatarKey: member.avatar_key,
                avatarUrl: member.avatar_url,
              }}
            />
            <div className="party-player-copy">
              <strong>
                {member.display_name}
                {isCurrent ? ` ${pick('(คุณ)', '(You)')}` : ''}
              </strong>
              <span>
                {isHost
                  ? pick('Host ของห้องนี้', 'Room host')
                  : member.is_ready
                    ? pick('พร้อมแล้ว', 'Ready')
                    : pick('กำลังเตรียมตัว', 'Waiting')}
              </span>
            </div>
            <div className="party-player-badges">
              {isHost ? <span className="party-mini-pill"><Crown size={12} />Host</span> : null}
              {member.is_ready ? <span className="party-mini-pill success"><CheckCircle2 size={12} />{pick('พร้อม', 'Ready')}</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PartyLeaderboard({ leaderboard = [], currentToken = '', pick, compact = false }) {
  if (leaderboard.length === 0) {
    return (
      <EmptyState
        icon={<Disc3 size={22} />}
        title={pick('ยังไม่มีคะแนน', 'No scores yet')}
        message={pick('เมื่อเริ่มเกมแล้วคะแนนรวมจะขึ้นตรงนี้', 'Scores will show up here once the round starts.')}
        className="party-empty-card"
      />
    );
  }

  return (
    <div className={`party-leaderboard ${compact ? 'is-compact' : ''}`}>
      {leaderboard.map((entry, index) => (
        <article key={entry.memberToken} className={`party-leaderboard-row ${entry.memberToken === currentToken ? 'is-current' : ''}`}>
          <div className="party-leaderboard-rank">#{index + 1}</div>
          <PartyIdentityAvatar
            profile={{
              displayName: entry.memberName,
              avatarKey: entry.avatarKey,
              avatarUrl: entry.avatarUrl,
            }}
          />
          <div className="party-leaderboard-copy">
            <strong>{entry.memberName}</strong>
            {compact ? (
              <div className="party-leaderboard-metrics">
                <span className="party-leaderboard-metric">
                  {pick('เรื่อง', 'Title')} {entry.titleHits}
                </span>
                <span className="party-leaderboard-metric">
                  {pick('เพลง', 'Song')} {entry.songHits}
                </span>
              </div>
            ) : (
              <span>
                {pick('ถูกชื่อเรื่อง', 'Title hits')}: {entry.titleHits}
                {' • '}
                {pick('ถูกชื่อเพลง', 'Song hits')}: {entry.songHits}
              </span>
            )}
          </div>
          <div className="party-leaderboard-score">{entry.score}</div>
        </article>
      ))}
    </div>
  );
}

function PartyQuestionPlayer({ match, round, graceRemainingMs, onPlaybackComplete, pick }) {
  const mediaRef = useRef(null);
  const [volume, setVolume] = useState(() => readPartyAudioVolume());
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  const isMuted = normalizedVolume <= 0;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PARTY_AUDIO_VOLUME_KEY, String(normalizedVolume));
  }, [normalizedVolume]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    media.volume = normalizedVolume / 100;
    media.muted = isMuted;
  }, [isMuted, normalizedVolume]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !round?.mediaUrl || match?.phase !== 'question') {
      return undefined;
    }

    let stopTimer = null;
    let frameId = null;
    let cancelled = false;
    let playbackCompleted = false;
    let playbackStartedAtMs = null;
    const previewDurationMs = Number(round.previewDurationSec || match.timePerRoundSec || 12) * 1000;

    media.currentTime = Number(round.previewStartSec || 0);
    media.volume = normalizedVolume / 100;
    media.muted = isMuted;
    setPlaybackElapsedMs(0);
    setPlaybackBlocked(false);
    onPlaybackComplete?.(null);

    const markPlaybackStarted = () => {
      if (!playbackStartedAtMs) {
        playbackStartedAtMs = Date.now();
      }
    };

    const markPlaybackComplete = () => {
      if (playbackCompleted) {
        return;
      }

      playbackCompleted = true;
      media.pause();
      setPlaybackElapsedMs(previewDurationMs);
      onPlaybackComplete?.(Date.now());
    };

    const play = async () => {
      try {
        await media.play();
        markPlaybackStarted();
        if (!cancelled) {
          setPlaybackBlocked(false);
        }
      } catch {
        if (!cancelled) {
          setPlaybackBlocked(true);
        }
      }
    };

    void play();

    const syncProgress = () => {
      if (cancelled) {
        return;
      }

      const elapsedFromMedia = Math.max(0, (Number(media.currentTime || 0) - Number(round.previewStartSec || 0)) * 1000);
      const elapsedMs = elapsedFromMedia;

      setPlaybackElapsedMs(Math.min(previewDurationMs, elapsedMs));
      if (elapsedMs >= previewDurationMs - 80) {
        markPlaybackComplete();
        return;
      }

      frameId = window.requestAnimationFrame(syncProgress);
    };

    frameId = window.requestAnimationFrame(syncProgress);

    stopTimer = window.setInterval(() => {
      if (playbackStartedAtMs && Date.now() >= playbackStartedAtMs + previewDurationMs) {
        markPlaybackComplete();
      }
    }, 200);

    const handlePlaying = () => {
      markPlaybackStarted();
      setPlaybackBlocked(false);
    };

    const handleEnded = () => {
      markPlaybackComplete();
    };

    media.addEventListener('playing', handlePlaying);
    media.addEventListener('ended', handleEnded);

    return () => {
      cancelled = true;
      if (stopTimer) {
        window.clearInterval(stopTimer);
      }
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      media.removeEventListener('playing', handlePlaying);
      media.removeEventListener('ended', handleEnded);
      media.pause();
    };
  }, [match?.phase, match?.timePerRoundSec, onPlaybackComplete, round?.id, round?.mediaUrl, round?.previewDurationSec, round?.previewStartSec]);

  const previewDurationMs = Number(round?.previewDurationSec || match?.timePerRoundSec || 12) * 1000;
  const isGracePeriod = Number(graceRemainingMs || 0) > 0;
  const finalCountdown = isGracePeriod ? Math.max(1, Math.ceil(graceRemainingMs / 1000)) : 0;
  const playbackProgress = previewDurationMs > 0
    ? Math.min(100, (playbackElapsedMs / previewDurationMs) * 100)
    : 0;

  return (
    <section className="party-question-stage glass-heavy">
      <div className="party-question-art">
        <div className="party-vinyl-spin">
          <Disc3 size={42} />
        </div>
        <div className="party-question-copy">
          <span className="party-chip subtle"><Headphones size={14} />{pick('กำลังเล่นเพลงปริศนา', 'Mystery audio playing')}</span>
          <h2>{pick('ฟังให้ดี แล้วรีบตอบก่อนหมดเวลา', 'Listen closely and answer before time runs out')}</h2>
          <p>
            {isGracePeriod
              ? pick('เพลงจบแล้ว เหลือเวลาอีกนิดสำหรับล็อกคำตอบสุดท้าย', 'The audio has ended. Final seconds to lock in an answer.')
              : pick('ตอนนี้เราซ่อนทั้งชื่อเรื่องและชื่อเพลงไว้ เฉลยตอนหมดเวลาเท่านั้น', 'Both the title and song name stay hidden until reveal.')}
          </p>
          <div className="party-playback-panel">
            <div className="party-playback-meta">
              <strong>{pick('เวลาเพลงที่เล่นไป', 'Audio playback')}</strong>
              <span>{formatClipSeconds(playbackElapsedMs)} / {formatClipSeconds(previewDurationMs)}</span>
            </div>
            <div className="party-playback-track" aria-hidden="true">
              <span className="party-playback-fill" style={{ width: `${playbackProgress}%` }} />
            </div>
            <div className="party-volume-control">
              <button
                type="button"
                className="party-volume-toggle"
                onClick={() => setVolume((current) => (Number(current || 0) > 0 ? 0 : 85))}
                aria-label={pick(isMuted ? 'เปิดเสียง' : 'ปิดเสียง', isMuted ? 'Unmute audio' : 'Mute audio')}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={normalizedVolume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label={pick('ระดับเสียง', 'Volume')}
                className="party-volume-slider"
              />
              <span className="party-volume-value">{normalizedVolume}%</span>
            </div>
            <small className="party-playback-note">
              {isGracePeriod
                ? pick('ช่วงตอบท้ายคลิป 3 วินาที', '3 second answer grace')
                : pick('เวลานี้นับเฉพาะช่วงที่เพลงกำลังเล่น', 'This timer tracks the audio itself, not the reveal.')}
            </small>
          </div>
        </div>
          <video ref={mediaRef} src={round?.mediaUrl || ''} playsInline preload="auto" className="party-hidden-media" />
      </div>
      {isGracePeriod ? (
        <div className="party-final-warning" role="status" aria-live="assertive">
          <span>{pick('เหลือเวลาตอบอีก', 'Answer ends in')}</span>
          <strong>{finalCountdown}</strong>
        </div>
      ) : null}
      {playbackBlocked ? (
        <button
          type="button"
          className="party-inline-play"
          onClick={() => {
            const media = mediaRef.current;
            if (!media) {
              return;
            }

            media.currentTime = Number(round?.previewStartSec || 0);
            void media.play();
            setPlaybackBlocked(false);
          }}
        >
          <Play size={16} />
          {pick('กดเล่นเพลงอีกครั้ง', 'Tap to play the audio')}
        </button>
      ) : null}
    </section>
  );
}

function PartyAnswerPanel({
  room,
  member,
  round,
  answer,
  answerCount,
  leaderboard,
  timeLeftMs,
  graceRemainingMs,
  onPlaybackComplete,
  onSubmit,
  submitting,
  pick,
}) {
  const preset = getPartyPresetById(room?.current_match?.presetId);
  const [typedTitle, setTypedTitle] = useState(() => answer?.typed_title || '');
  const [typedSong, setTypedSong] = useState(() => answer?.typed_song || '');
  const isGracePeriod = Number(graceRemainingMs || 0) > 0;

  useEffect(() => {
    setTypedTitle(answer?.typed_title || '');
    setTypedSong(answer?.typed_song || '');
  }, [answer?.typed_title, answer?.typed_song, round?.id]);

  const canSubmitChoice = room?.current_match?.phase === 'question' && !answer?.selected_option_id;
  const canSubmitTyping = room?.current_match?.phase === 'question';

  return (
    <div className="party-game-grid">
      <div className="party-game-main">
        <div className="party-status-bar glass">
          <span className="party-chip">
            <Clock3 size={14} />
            {pick('เหลือเวลา', 'Time left')} {formatCountdown(timeLeftMs, pick)}
          </span>
          {isGracePeriod ? (
            <span className="party-chip subtle">
              <TimerReset size={14} />
              {pick('เพลงจบแล้ว กำลังนับถอยหลังเฉลย', 'Audio ended, reveal countdown running')}
            </span>
          ) : null}
          <span className="party-chip subtle">
            <Users2 size={14} />
            {pick('ตอบแล้ว', 'Answered')} {answerCount}
          </span>
          <span className="party-chip subtle">
            <Sparkles size={14} />
            {pick('รอบที่', 'Round')} {Number(room?.current_match?.roundIndex || 0) + 1}/{room?.current_match?.totalRounds || 0}
          </span>
        </div>

        <PartyQuestionPlayer
          match={room?.current_match}
          round={round}
          graceRemainingMs={graceRemainingMs}
          onPlaybackComplete={onPlaybackComplete}
          pick={pick}
        />

        {preset.answerMode === 'choice' ? (
          <section className="party-answer-card glass-heavy">
            <div className="party-answer-head">
              <strong>{pick('เลือกชื่อเรื่องที่คิดว่าใช่', 'Choose the title you think matches')}</strong>
              <span>{answer?.selected_option_id ? pick('คุณล็อกคำตอบแล้ว', 'Your answer is locked in') : pick('กดได้ครั้งเดียวต่อรอบ', 'One tap per round')}</span>
            </div>
            <div className="party-choice-grid">
              {(round?.options || []).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`party-choice-btn ${answer?.selected_option_id === option.id ? 'is-selected' : ''}`}
                  onClick={() => onSubmit({ selectedOptionId: option.id })}
                  disabled={!canSubmitChoice || submitting}
                >
                  <span>{option.label}</span>
                  {answer?.selected_option_id === option.id ? <CheckCircle2 size={16} /> : <ChevronRight size={16} />}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="party-answer-card glass-heavy">
            <div className="party-answer-head">
              <strong>
                {preset.answerMode === 'typing'
                  ? pick('พิมพ์ชื่อเพลงให้ตรงที่สุด', 'Type the exact song title')
                  : pick('พิมพ์คำตอบทั้งสองช่อง', 'Type both answers')}
              </strong>
              <span>{pick('คุณกดส่งซ้ำได้จนกว่าจะหมดเวลา', 'You can resubmit until the timer ends')}</span>
            </div>
            {preset.answerMode === 'dual' ? (
              <div className="party-input-stack">
                <label className="party-field">
                  <span>{pick('ชื่อเรื่อง', 'Source title')}</span>
                  <input
                    type="text"
                    value={typedTitle}
                    onChange={(event) => setTypedTitle(event.target.value)}
                    placeholder={pick('พิมพ์ชื่อเรื่องที่คิดว่าใช่', 'Type the anime title')}
                    disabled={!canSubmitTyping || submitting}
                  />
                </label>
                <label className="party-field">
                  <span>{pick('ชื่อเพลง', 'Song title')}</span>
                  <input
                    type="text"
                    value={typedSong}
                    onChange={(event) => setTypedSong(event.target.value)}
                    placeholder={pick('พิมพ์ชื่อเพลง', 'Type the song title')}
                    disabled={!canSubmitTyping || submitting}
                  />
                </label>
              </div>
            ) : (
              <label className="party-field">
                <span>{pick('ชื่อเพลง', 'Song title')}</span>
                <input
                  type="text"
                  value={typedSong}
                  onChange={(event) => setTypedSong(event.target.value)}
                  placeholder={pick('พิมพ์ชื่อเพลงที่คิดว่าใช่', 'Type the song title')}
                  disabled={!canSubmitTyping || submitting}
                />
              </label>
            )}
            <div className="party-answer-actions">
              <Button
                variant="primary"
                onClick={() => onSubmit({ typedTitle, typedSong })}
                disabled={
                  !canSubmitTyping
                  || submitting
                  || (preset.answerMode === 'dual'
                    ? !typedTitle.trim() && !typedSong.trim()
                    : !typedSong.trim())
                }
              >
                {submitting ? pick('กำลังส่ง...', 'Saving...') : pick('ส่งคำตอบ', 'Submit answer')}
              </Button>
              {answer ? (
                <span className="party-answer-note">
                  <CheckCircle2 size={14} />
                  {pick('บันทึกคำตอบล่าสุดแล้ว', 'Latest answer saved')}
                </span>
              ) : null}
            </div>
          </section>
        )}
      </div>

      <aside className="party-game-side">
        <section className="party-side-panel glass-heavy">
          <div className="party-side-head">
            <strong>{pick('ตารางคะแนนสด', 'Live leaderboard')}</strong>
            <span>{pick('อัปเดตทุกครั้งที่มีคนตอบ', 'Updates as answers come in')}</span>
          </div>
          <PartyLeaderboard leaderboard={leaderboard} currentToken={member?.member_token} pick={pick} compact />
        </section>
      </aside>
    </div>
  );
}

function PartyRevealPanel({ round, answers, leaderboard, memberToken, pick, onPlaybackStarted }) {
  const revealVideoRef = useRef(null);
  const currentAnswer = answers.find((entry) => String(entry.member_token || '') === String(memberToken || ''));
  const revealState = !currentAnswer
    ? pick('ไม่ได้ตอบ', 'No answer')
    : currentAnswer.title_correct || currentAnswer.song_correct
      ? pick('ถูก', 'Correct')
      : pick('ผิด', 'Incorrect');

  useEffect(() => {
    const video = revealVideoRef.current;
    if (!video || !round?.mediaUrl) {
      return;
    }

    const savedVolume = readPartyAudioVolume();
    video.volume = Math.min(1, Math.max(0, savedVolume / 100));
    video.muted = savedVolume <= 0;

    video.preload = 'auto';
    video.load();
    const attemptPlay = () => {
      void video.play().catch(() => {});
    };
    const handlePlaying = () => {
      onPlaybackStarted?.(Date.now());
    };
    const handleVolumeChange = () => {
      if (typeof window === 'undefined') {
        return;
      }

      const nextVolume = video.muted ? 0 : Math.round(Math.min(1, Math.max(0, Number(video.volume) || 0)) * 100);
      window.localStorage.setItem(PARTY_AUDIO_VOLUME_KEY, String(nextVolume));
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('volumechange', handleVolumeChange);

    if (video.readyState >= 2) {
      attemptPlay();
      return () => {
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('volumechange', handleVolumeChange);
      };
    }

    video.addEventListener('canplay', attemptPlay, { once: true });
    return () => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', attemptPlay);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [onPlaybackStarted, round?.id, round?.mediaUrl]);

  return (
    <div className="party-game-grid">
      <div className="party-game-main">
        <section className="party-reveal-card glass-heavy">
          <div className="party-reveal-head">
            <span className="party-chip success"><Sparkles size={14} />{pick('เฉลยรอบนี้', 'Round reveal')}</span>
            <h2>{round?.sourceTitleName || pick('ไม่พบชื่อเรื่อง', 'Missing title')}</h2>
            <p>{round?.songTitle || pick('ไม่พบชื่อเพลง', 'Missing song title')}</p>
            <div className="party-reveal-meta">
              {round?.artistName ? <span>{round.artistName}</span> : null}
              {round?.themeType ? <span>{round.themeType}</span> : null}
            </div>
          </div>
          {round?.mediaUrl ? (
            <div className="party-reveal-video-wrap">
              <video
                ref={revealVideoRef}
                key={round.id || round.mediaUrl}
                src={round.mediaUrl}
                className="party-reveal-video"
                controls
                autoPlay
                playsInline
                preload="auto"
              />
            </div>
          ) : null}
          <div className="party-reveal-outcome">
            <span className={`party-reveal-outcome-pill ${currentAnswer && (currentAnswer.title_correct || currentAnswer.song_correct) ? 'is-correct' : ''}`}>
              {revealState}
            </span>
          </div>
        </section>
      </div>

      <aside className="party-game-side">
        <section className="party-side-panel glass-heavy">
          <div className="party-side-head">
            <strong>{pick('อันดับล่าสุด', 'Current standing')}</strong>
            <span>{pick('หลังเฉลยรอบนี้', 'Updated after reveal')}</span>
          </div>
          <PartyLeaderboard leaderboard={leaderboard} currentToken={memberToken} pick={pick} compact />
        </section>
      </aside>
    </div>
  );
}

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
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [playbackEndedAtMs, setPlaybackEndedAtMs] = useState(null);
  const [revealPlaybackStartedAtMs, setRevealPlaybackStartedAtMs] = useState(null);
  const advancingRef = useRef(false);
  const countdownAlertedSecondRef = useRef(null);
  const answerAlertedSecondRef = useRef(null);
  const countdownAudioContextRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const pendingRefreshRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const activeRoomCodeRef = useRef(roomCode);

  useEffect(() => {
    activeRoomCodeRef.current = roomCode;
  }, [roomCode]);

  const loadBundle = async ({ silent = false, force = false } = {}) => {
    if (loadPromiseRef.current && !force) {
      pendingRefreshRef.current = true;
      return loadPromiseRef.current;
    }

    try {
      if (!silent) {
        setLoading(true);
      }

      const task = fetchPartyRoomBundle(roomCode);
      loadPromiseRef.current = task;
      const nextBundle = await task;

      if (activeRoomCodeRef.current === roomCode) {
        setBundle(nextBundle);
        setErrorMessage('');
      }
    } catch (error) {
      if (activeRoomCodeRef.current === roomCode) {
        setErrorMessage(getPartyBackendHint(error, pick));
      }
    } finally {
      loadPromiseRef.current = null;
      if (!silent) {
        setLoading(false);
      }

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        await loadBundle({ silent: true, force: true });
      }
    }
  };

  const scheduleBundleRefresh = () => {
    pendingRefreshRef.current = true;
    if (refreshTimerRef.current) {
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      if (!pendingRefreshRef.current) {
        return;
      }

      pendingRefreshRef.current = false;
      void loadBundle({ silent: true });
    }, 120);
  };

  useEffect(() => {
    void loadBundle();
  }, [roomCode]);

  useEffect(() => {
    if (!bundle?.room?.id) {
      return undefined;
    }

    const unsubscribe = subscribeToPartyRoom(bundle.room.id, scheduleBundleRefresh);

    return unsubscribe;
  }, [bundle?.room?.id, roomCode]);

  useEffect(() => () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const room = bundle?.room || null;
  const members = useMemo(() => (bundle?.members || []).map((member) => {
    if (String(member.member_token || '') !== String(guestToken || '')) {
      return member;
    }

    return {
      ...member,
      avatar_url: member.avatar_url || partyProfile.avatarUrl || '',
      display_name: member.display_name || partyProfile.displayName || member.display_name,
    };
  }), [bundle?.members, guestToken, partyProfile.avatarUrl, partyProfile.displayName]);
  const answers = bundle?.answers || [];
  const currentMember = members.find((member) => String(member.member_token || '') === String(guestToken || '')) || null;
  const isHost = room && String(room.host_member_token || '') === String(guestToken || '');
  const currentMatch = room?.current_match || null;
  const currentRound = getPartyCurrentRound(currentMatch);
  const currentPreset = getPartyPresetById(currentMatch?.presetId || room?.settings?.presetId);
  const currentRoundAnswers = useMemo(
    () => answers.filter((entry) => String(entry.round_id || '') === String(currentRound?.id || '')),
    [answers, currentRound?.id]
  );
  const currentAnswer = currentRoundAnswers.find((entry) => String(entry.member_token || '') === String(guestToken || '')) || null;
  const leaderboard = useMemo(() => buildPartyLeaderboard(members, answers), [members, answers]);
  const selectedPoolName = room?.settings?.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolNameTh = room?.settings?.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === room?.settings?.categoryId)?.labelTh
    || PARTY_CATEGORY_OPTIONS[0].labelTh;
  const phaseEndsAtMs = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
  const timeLeftMs = phaseEndsAtMs ? Math.max(0, phaseEndsAtMs - clockNow) : 0;
  const answerGraceMs = Number(currentMatch?.answerGraceSec || 0) * 1000;
  const graceRemainingMs = playbackEndedAtMs ? Math.max(0, playbackEndedAtMs + answerGraceMs - clockNow) : 0;
  const readyCount = members.filter((member) => member.is_ready).length;

  useEffect(() => {
    setPlaybackEndedAtMs(null);
    setRevealPlaybackStartedAtMs(null);
  }, [currentMatch?.id, currentMatch?.phase, currentRound?.id]);

  useEffect(() => {
    if (currentMatch?.phase !== 'countdown') {
      countdownAlertedSecondRef.current = null;
      return undefined;
    }

    if (typeof window === 'undefined') {
      return undefined;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return undefined;
    }

    if (!countdownAudioContextRef.current) {
      countdownAudioContextRef.current = new AudioContextCtor();
    }

    const audioContext = countdownAudioContextRef.current;
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {});
    }

    const phaseEndsAt = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
    if (!phaseEndsAt) {
      return undefined;
    }

    countdownAlertedSecondRef.current = null;
    const timeouts = [3, 2, 1].map((second) => {
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

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [currentMatch?.phase, currentMatch?.phaseEndsAt]);

  useEffect(() => {
    if (currentMatch?.phase !== 'question') {
      answerAlertedSecondRef.current = null;
      return;
    }

    if (typeof window === 'undefined') {
      return undefined;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return undefined;
    }

    if (!countdownAudioContextRef.current) {
      countdownAudioContextRef.current = new AudioContextCtor();
    }

    const audioContext = countdownAudioContextRef.current;
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {});
    }
    const phaseEndsAt = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
    if (!phaseEndsAt) {
      return undefined;
    }

    answerAlertedSecondRef.current = null;
    const timeouts = [3, 2, 1].map((second) => {
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

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [currentMatch?.phase, currentMatch?.phaseEndsAt]);

  useEffect(() => {
    if (!isHost || !room || !currentMatch?.phaseEndsAt || currentMatch.phase === 'final') {
      return;
    }

    const phaseEndsAtMs = new Date(currentMatch.phaseEndsAt).getTime();
    const revealAdvanceAtMs = revealPlaybackStartedAtMs
      ? revealPlaybackStartedAtMs + (Number(currentMatch?.revealSec || room?.settings?.revealSec || 12) * 1000)
      : phaseEndsAtMs;
    const advanceAtMs = currentMatch.phase === 'question' && playbackEndedAtMs
      ? playbackEndedAtMs + answerGraceMs
      : currentMatch.phase === 'reveal'
        ? Math.max(phaseEndsAtMs, revealAdvanceAtMs)
        : phaseEndsAtMs;

    if (!advanceAtMs || clockNow < advanceAtMs || advancingRef.current) {
      return;
    }

    advancingRef.current = true;
    void advancePartyRoom(room)
      .catch((error) => {
        toast.error(getPartyBackendHint(error, pick));
      })
      .finally(() => {
        window.setTimeout(() => {
          advancingRef.current = false;
        }, 400);
      });
  }, [answerGraceMs, clockNow, currentMatch?.phase, currentMatch?.phaseEndsAt, currentMatch?.revealSec, isHost, pick, playbackEndedAtMs, revealPlaybackStartedAtMs, room]);

  const handleInlineJoin = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('inline-join');
      await joinPartyRoom(roomCode, partyProfile);
      await loadBundle({ silent: true });
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
      await togglePartyMemberReady(room.id, currentMember.member_token, !currentMember.is_ready);
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

    try {
      setBusyAction('start');
      await startPartyMatch(room, members);
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
      await submitPartyAnswer({ room, member: currentMember, payload });
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
      await resetPartyRoom(room);
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
      await closePartyRoom(room);
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
        {currentRound?.mediaUrl ? (
          <video
            key={`preload-${currentRound.id || currentRound.mediaUrl}`}
            src={currentRound.mediaUrl}
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
          <div className="party-lobby-grid">
            <section className="party-lobby-panel card-modern">
              <div className="party-panel-head">
                <strong>{pick('Lobby', 'Lobby')}</strong>
                <span>{pick('ทุกคนกด Ready ก่อน แล้ว host ค่อยเริ่มเกม', 'Everyone hits Ready, then the host kicks off the match.')}</span>
              </div>
              <PartyPlayerList members={members} hostToken={room.host_member_token} currentToken={guestToken} pick={pick} />
            </section>

            <section className="party-lobby-panel card-modern">
              <div className="party-panel-head">
                <strong>{pick('การตั้งค่าห้อง', 'Room settings')}</strong>
                <span>{pick('สรุปกติกาที่จะใช้ในแมตช์นี้', 'The rule snapshot for this match')}</span>
              </div>
	              <div className="party-settings-summary">
	                <article className="party-stat-pill"><strong>{pick(currentPreset.labelTh, currentPreset.label)}</strong><span>{pick('preset', 'preset')}</span></article>
	                <article className="party-stat-pill"><strong>{pick(selectedPoolNameTh, selectedPoolName)}</strong><span>{pick('pool', 'pool')}</span></article>
	                <article className="party-stat-pill"><strong>{room.settings?.roundCount || 10}</strong><span>{pick('รอบ', 'rounds')}</span></article>
	                <article className="party-stat-pill"><strong>{room.settings?.timePerRoundSec || 12}</strong><span>{pick('วิเล่นเพลง', 'clip sec')}</span></article>
	                <article className="party-stat-pill"><strong>{room.settings?.revealSec || 12}</strong><span>{pick('วิเฉลย', 'reveal sec')}</span></article>
                <article className="party-stat-pill"><strong>{readyCount}/{members.length}</strong><span>{pick('พร้อม', 'ready')}</span></article>
              </div>
              <div className="party-lobby-actions">
                {!isHost ? (
                  <Button variant={currentMember?.is_ready ? 'outline' : 'primary'} onClick={handleToggleReady} disabled={busyAction === 'ready'}>
                    Ready
                  </Button>
                ) : (
                  <Button variant="primary" onClick={handleStartMatch} disabled={busyAction === 'start' || readyCount < Math.min(2, members.length)}>
                    {busyAction === 'start' ? pick('กำลังเตรียมแมตช์...', 'Building the match...') : pick('Start Game', 'Start Game')}
                  </Button>
                )}
                {isHost ? (
                  <Button variant="outline" onClick={handleCloseRoom} disabled={busyAction === 'close'}>
                    {pick('ปิดห้อง', 'Close room')}
                  </Button>
                ) : null}
              </div>
            </section>
          </div>
        ) : currentMatch.phase === 'final' || room.status === 'finished' ? (
          <div className="party-final-grid">
            <section className="party-final-panel card-modern">
              <span className="party-chip success"><Crown size={14} />{pick('แมตช์จบแล้ว', 'Match complete')}</span>
              <h2>{leaderboard[0]?.memberName || pick('ยังไม่มีผู้ชนะ', 'No winner yet')}</h2>
              <p>{pick('นี่คือสรุปผลของห้องนี้จากทุกคำตอบที่ส่งเข้ามา', 'Here is the final result from every submitted answer in the room.')}</p>
              <div className="party-settings-summary">
                <article className="party-stat-pill"><strong>{leaderboard[0]?.score || 0}</strong><span>{pick('คะแนนอันดับ 1', 'Winning score')}</span></article>
                <article className="party-stat-pill"><strong>{leaderboard.length}</strong><span>{pick('ผู้เล่นทั้งหมด', 'Players')}</span></article>
                <article className="party-stat-pill"><strong>{currentMatch.totalRounds || 0}</strong><span>{pick('รอบทั้งหมด', 'Rounds')}</span></article>
                <article className="party-stat-pill"><strong>{formatFastest(leaderboard[0]?.fastestMs, pick)}</strong><span>{pick('เร็วสุดของที่ 1', 'Winner fastest')}</span></article>
              </div>
              <div className="party-lobby-actions">
                {isHost ? (
                  <Button variant="primary" icon={<RotateCcw size={16} />} onClick={handleRematch} disabled={busyAction === 'rematch'}>
                    {busyAction === 'rematch' ? pick('กำลังรีเซ็ตห้อง...', 'Resetting room...') : pick('กลับไป Lobby เพื่อ Rematch', 'Back to lobby for a rematch')}
                  </Button>
                ) : null}
                <Link to="/party" className="party-code-btn subtle">{pick('กลับไปหน้า Party', 'Back to Party')}</Link>
              </div>
            </section>
            <section className="party-final-panel card-modern">
              <div className="party-panel-head">
                <strong>{pick('Top ตารางคะแนน', 'Top leaderboard')}</strong>
                <span>{pick('เรียงจากคะแนนรวมและ tie-breaks', 'Sorted by total score and tie-breaks')}</span>
              </div>
              <PartyLeaderboard leaderboard={leaderboard} currentToken={guestToken} pick={pick} />
            </section>
          </div>
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

            {currentMatch.phase === 'reveal' ? (
              <PartyRevealPanel
                round={currentRound}
                answers={currentRoundAnswers}
                leaderboard={leaderboard}
                memberToken={guestToken}
                pick={pick}
                onPlaybackStarted={setRevealPlaybackStartedAtMs}
              />
            ) : currentMatch.phase === 'countdown' ? (
              <section className="party-countdown-card card-modern">
                <span className="party-chip"><Sparkles size={14} />{pick('อีกครู่เดียว', 'Coming up')}</span>
                <h2>{pick('เตรียมพร้อมสำหรับรอบถัดไป', 'Prepare for the next round')}</h2>
                <p>{pick('ระบบกำลังจัด cue และเตรียมเปิดเพลงถัดไป', 'The room is lining up the next cue and getting the next mystery audio ready.')}</p>
                <div className="party-countdown-bubble">{Math.max(1, Math.ceil(timeLeftMs / 1000))}</div>
              </section>
            ) : (
              <PartyAnswerPanel
                room={room}
                member={currentMember}
                round={currentRound}
                answer={currentAnswer}
                answerCount={countPartyRoundAnswers(answers, currentRound?.id)}
                leaderboard={room.settings?.showLiveScores ? leaderboard : []}
                timeLeftMs={timeLeftMs}
                graceRemainingMs={graceRemainingMs}
                onPlaybackComplete={setPlaybackEndedAtMs}
                onSubmit={handleSubmitAnswer}
                submitting={busyAction === 'answer'}
                pick={pick}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}


