import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Crown,
  Disc3,
  Headphones,
  Loader2,
  Mic2,
  Play,
  Radio,
  Sparkles,
  TimerReset,
  Users2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import {
  getPartyPresetById,
} from '@/features/party/lib/partyEngine';
import { advancePartyRoom } from '@/features/party/api/partyRemoteApi';
import { PartyYouTubePlayer } from './PartyYouTubePlayer';
import { PartyTimer } from './PartyTimer';
import {
  formatClipSeconds,
  formatCountdown,
  getCountdownSeconds,
  getPartyAvatarTone,
  getPartyBufferedPreviewMs,
  isPartyPlaybackReady,
  readPartyAudioVolume,
  shouldPartyForceMediaLoad,
} from '@/features/party/lib/partyRoomUtils';

export function PartyIdentityAvatar({ profile, className = '' }) {
  const label = String(profile?.displayName || 'P').trim().charAt(0).toUpperCase() || 'P';
  const avatarUrl = String(profile?.avatarUrl || '').trim();
  const [failedImageUrl, setFailedImageUrl] = useState('');

  if (avatarUrl && failedImageUrl !== avatarUrl) {
    return (
      <div className={`party-player-avatar party-profile-avatar has-image ${className}`.trim()}>
        <img src={avatarUrl} alt="" className="party-profile-avatar-image" onError={() => setFailedImageUrl(avatarUrl)} />
      </div>
    );
  }

  return (
    <div className={`party-player-avatar party-profile-avatar tone-${getPartyAvatarTone(profile?.avatarKey)} ${className}`.trim()}>
      <span>{label}</span>
    </div>
  );
}

export const PresetCard = React.memo(function PresetCard({
  preset,
  selected,
  disabled = false,
  helperText = '',
  pick,
  onSelect,
}) {
  const icon = preset.id === 'party-classic'
    ? <Radio size={18} />
    : <Mic2 size={18} />;

  return (
    <button
      type="button"
      className={`party-preset-card ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-pressed={selected}
      disabled={disabled}
      title={helperText || undefined}
    >
      <span className="party-preset-icon">{icon}</span>
      <strong>{pick(preset.labelTh, preset.label)}</strong>
      <p>{pick(preset.descriptionTh, preset.description)}</p>
      <span className="party-preset-tag">
        {preset.answerMode === 'choice'
          ? pick('\u0034 \u0e15\u0e31\u0e27\u0e40\u0e25\u0e37\u0e2d\u0e01', '4 choices')
          : pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Type song title')}
      </span>
      {helperText ? <span className="party-preset-helper">{helperText}</span> : null}
    </button>
  );
});

export const PartyPlayerList = React.memo(function PartyPlayerList({ members = [], hostToken = '', currentToken = '', pick }) {
  const many = members.length > 4;
  return (
    <div className={`party-player-list${many ? ' party-player-list--many' : ''}`}>
      {members.map((member) => {
        const isHost = String(member.member_token || '') === String(hostToken || '');
        const isCurrent = String(member.member_token || '') === String(currentToken || '');
        return (
          <article key={member.id || member.member_token} className={`party-player-card${member.is_ready ? ' is-ready' : ''}`}>
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
                {isCurrent ? ` ${pick('(\u0e04\u0e38\u0e13)', '(You)')}` : ''}
              </strong>
            </div>
            <div className="party-player-badges">
              {isHost ? <span className="party-mini-pill"><Crown size={12} />{pick('\u0e42\u0e2e\u0e2a\u0e15\u0e4c', 'Host')}</span> : null}
              {member.is_ready ? <span className="party-mini-pill success"><CheckCircle2 size={12} />{pick('\u0e1e\u0e23\u0e49\u0e2d\u0e21', 'Ready')}</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
});

export const PartyLeaderboard = React.memo(function PartyLeaderboard({ leaderboard = [], currentToken = '', pick, compact = false }) {
  const rowRefs = useRef(new Map());
  const previousTopRef = useRef(new Map());
  const previousRankRef = useRef(new Map());
  const clearRankMotionRef = useRef(null);
  const [rankMotionByToken, setRankMotionByToken] = useState({});

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const nextRankMotion = {};
    const nextRankMap = new Map();

    leaderboard.forEach((entry, index) => {
      const token = String(entry.memberToken || '');
      if (!token) {
        return;
      }

      nextRankMap.set(token, index);
      const previousRank = previousRankRef.current.get(token);
      if (typeof previousRank === 'number' && previousRank !== index) {
        nextRankMotion[token] = previousRank > index ? 'up' : 'down';
      }

      const node = rowRefs.current.get(token);
      if (!node) {
        return;
      }

      const nextTop = node.getBoundingClientRect().top;
      const previousTop = previousTopRef.current.get(token);
      previousTopRef.current.set(token, nextTop);

      if (reduceMotion || typeof previousTop !== 'number') {
        return;
      }

      const deltaY = previousTop - nextTop;
      if (Math.abs(deltaY) < 1) {
        return;
      }

      node.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: 'translateY(0px)' },
        ],
        {
          duration: 1280,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }
      );
    });

    previousRankRef.current = nextRankMap;

    if (clearRankMotionRef.current) {
      window.clearTimeout(clearRankMotionRef.current);
    }

    if (Object.keys(nextRankMotion).length > 0) {
      setRankMotionByToken(nextRankMotion);
      clearRankMotionRef.current = window.setTimeout(() => {
        setRankMotionByToken({});
        clearRankMotionRef.current = null;
      }, 2100);
    }

    return () => {
      if (clearRankMotionRef.current) {
        window.clearTimeout(clearRankMotionRef.current);
        clearRankMotionRef.current = null;
      }
    };
  }, [leaderboard]);

  if (leaderboard.length === 0) {
    return (
      <EmptyState
        icon={<Disc3 size={22} />}
        title={pick('\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e04\u0e30\u0e41\u0e19\u0e19', 'No scores yet')}
        message={pick('\u0e04\u0e30\u0e41\u0e19\u0e19\u0e08\u0e30\u0e41\u0e2a\u0e14\u0e07\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e23\u0e34\u0e48\u0e21\u0e23\u0e2d\u0e1a', 'Scores will show up here once the round starts.')}
        className="party-empty-card"
      />
    );
  }

  return (
    <div className={`party-leaderboard ${compact ? 'is-compact' : ''}`}>
      {leaderboard.map((entry, index) => {
        const motionState = rankMotionByToken[entry.memberToken] || '';
        return (
          <article
          key={entry.memberToken}
          ref={(node) => {
            if (node) {
              rowRefs.current.set(entry.memberToken, node);
            } else {
              rowRefs.current.delete(entry.memberToken);
            }
          }}
          className={`party-leaderboard-row ${entry.memberToken === currentToken ? 'is-current' : ''} ${motionState ? `is-rank-${motionState}` : ''}`.trim()}
        >
            <div className="party-leaderboard-rank">
              <span>#{index + 1}</span>
              {motionState ? (
                <span className={`party-rank-shift-badge is-${motionState}`} aria-label={motionState === 'up' ? 'Rank up' : 'Rank down'}>
                  {motionState === 'up' ? 'Up' : 'Down'}
                </span>
              ) : null}
            </div>
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
                  {pick('Title', 'Title')} {entry.titleHits}
                </span>
                <span className="party-leaderboard-metric">
                  {pick('Song', 'Song')} {entry.songHits}
                </span>
              </div>
            ) : (
              <span>
                {pick('Title hits', 'Title hits')}: {entry.titleHits}
                {' | '}
                {pick('Song hits', 'Song hits')}: {entry.songHits}
              </span>
            )}
          </div>
          <div className="party-leaderboard-score">{entry.score}</div>
          </article>
        );
      })}
    </div>
  );
});

export const PartyCountdownDisplay = React.memo(function PartyCountdownDisplay({
  targetTimeMs = 0,
  intervalMs = 250,
  children,
}) {
  return (
    <PartyTimer targetTimeMs={targetTimeMs} intervalMs={intervalMs}>
      {({ msLeft, now }) => children({
        msLeft,
        now,
        secondsLeft: getCountdownSeconds(msLeft),
      })}
    </PartyTimer>
  );
});

/**
 * Shows a big glowing number (3 -> 2 -> 1) centered on screen
 * for the last 3 seconds of a phase. pointer-events: none so
 * buttons underneath stay fully clickable.
 */
export const PartyEndCountdownOverlay = React.memo(function PartyEndCountdownOverlay({ targetTimeMs }) {
  return (
    <PartyCountdownDisplay targetTimeMs={targetTimeMs} intervalMs={200}>
      {({ msLeft, secondsLeft }) => {
        if (msLeft <= 0 || secondsLeft > 3) return null;
        return (
          <div className="party-end-countdown-overlay" aria-hidden="true">
            {/* ring expands and fades - key forces re-mount per second for animation */}
            <div key={`ring-${secondsLeft}`} className="party-end-countdown-ring" />
            <div key={`num-${secondsLeft}`}  className="party-end-countdown-number">
              {secondsLeft}
            </div>
          </div>
        );
      }}
    </PartyCountdownDisplay>
  );
});

export function PartyAutoAdvance({
  isHost,
  room,
  currentMatch,
  playbackEndedAtMs,
  revealPlaybackStartedAtMs,
  answerGraceMs,
  onAdvanced,
  onAdvanceError,
}) {
  const advancingRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const isVotePlaybackPhase = currentMatch?.phase === 'play-a' || currentMatch?.phase === 'play-b';

  useEffect(() => {
    if (!isHost || !room || currentMatch?.phase === 'final') {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentMatch?.phase, currentMatch?.phaseEndsAt, isHost, room]);

  const revealAdvanceAtMs = revealPlaybackStartedAtMs
    ? revealPlaybackStartedAtMs + (Number(currentMatch?.revealSec || room?.settings?.revealSec || 12) * 1000)
    : 0;
  const phaseEndsAtMs = currentMatch?.phaseEndsAt ? new Date(currentMatch.phaseEndsAt).getTime() : 0;
  const advanceAtMs = isVotePlaybackPhase && playbackEndedAtMs
    ? playbackEndedAtMs
    : currentMatch?.phase === 'question' && playbackEndedAtMs
    ? playbackEndedAtMs + answerGraceMs
    : currentMatch?.phase === 'reveal'
      ? Math.max(phaseEndsAtMs, revealAdvanceAtMs)
      : phaseEndsAtMs;

  useEffect(() => {
    if (!isHost || !room || currentMatch?.phase === 'final' || !advanceAtMs) {
      return;
    }

    if (now < advanceAtMs || advancingRef.current) {
      return;
    }

    advancingRef.current = true;
    void advancePartyRoom(room)
      .then((nextRoom) => {
        onAdvanced?.(nextRoom);
      })
      .catch((error) => {
        onAdvanceError?.(error);
      })
      .finally(() => {
        window.setTimeout(() => {
          advancingRef.current = false;
        }, 400);
      });
  }, [advanceAtMs, currentMatch?.phase, currentMatch?.phaseEndsAt, isHost, now, onAdvanceError, onAdvanced, room]);

  return null;
}

function getBufferedPreviewMs(media, startSec = 0, previewDurationMs = 0) {
  if (!media?.buffered || previewDurationMs <= 0) {
    return 0;
  }

  const ranges = [];
  for (let index = 0; index < media.buffered.length; index += 1) {
    ranges.push([
      Number(media.buffered.start(index) || 0),
      Number(media.buffered.end(index) || 0),
    ]);
  }

  return getPartyBufferedPreviewMs(ranges, media.currentTime, startSec, previewDurationMs);
}

function PartyYouTubeQuestionPlayer({ match, round, answerGraceEndsAtMs, phaseEndsAtMs, onPlaybackStarted, onPlaybackComplete, pick }) {
  const playbackFillRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const completedRef = useRef(false);
  const [volume, setVolume] = useState(() => readPartyAudioVolume());
  const [ytReady, setYtReady] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  const isMuted = normalizedVolume <= 0;
  const isGracePeriod = Boolean(answerGraceEndsAtMs);
  const previewDurationMs = Number(round?.previewDurationSec || match?.timePerRoundSec || 12) * 1000;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('moodtoon-party-audio-volume', String(normalizedVolume));
  }, [normalizedVolume]);

  // Reset on round change
  useEffect(() => {
    setYtReady(false);
    setPlaybackBlocked(false);
    setPlaybackElapsedMs(0);
    setIsPlaying(false);
    startedAtRef.current = null;
    completedRef.current = false;
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (playbackFillRef.current) playbackFillRef.current.style.transform = 'scaleX(0)';
    onPlaybackComplete?.(null);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  const startProgressTimer = useCallback((durationMs) => {
    if (startedAtRef.current || completedRef.current) return;
    startedAtRef.current = Date.now();
    onPlaybackStarted?.(Date.now());

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (!startedAtRef.current || completedRef.current) return;
      const elapsed = Date.now() - startedAtRef.current;
      const clamped = Math.min(durationMs, elapsed);
      const ratio = durationMs > 0 ? Math.min(1, clamped / durationMs) : 0;
      setPlaybackElapsedMs(clamped);
      if (playbackFillRef.current) playbackFillRef.current.style.transform = `scaleX(${ratio})`;
      if (elapsed >= durationMs) {
        completedRef.current = true;
        window.clearInterval(timerRef.current);
        onPlaybackComplete?.(Date.now());
      }
    }, 80);
  }, [onPlaybackStarted, onPlaybackComplete]);

  const handleYtReady = useCallback(() => {
    setYtReady(true);
    setIsPlaying(true);
    startProgressTimer(previewDurationMs);
  }, [startProgressTimer, previewDurationMs]);

  const handleYtError = useCallback(() => {
    setPlaybackBlocked(true);
    setIsPlaying(false);
  }, []);

  return (
    <section className="party-question-stage">
      <div className="party-question-stage-inner">
        <div className="party-question-header">
          <span className="party-chip subtle party-question-kicker">
            <Headphones size={14} />
            {pick('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e25\u0e48\u0e19\u0e40\u0e1e\u0e25\u0e07\u0e1b\u0e23\u0e34\u0e28\u0e19\u0e32', 'Mystery audio playing')}
          </span>
          <h2>{pick('\u0e1f\u0e31\u0e07\u0e43\u0e2b\u0e49\u0e14\u0e35 \u0e41\u0e25\u0e49\u0e27\u0e23\u0e35\u0e1a\u0e15\u0e2d\u0e1a\u0e01\u0e48\u0e2d\u0e19\u0e2b\u0e21\u0e14\u0e40\u0e27\u0e25\u0e32', 'Listen closely, answer before time runs out')}</h2>
          <p>
            {isGracePeriod
              ? pick('\u0e40\u0e1e\u0e25\u0e07\u0e08\u0e1a\u0e41\u0e25\u0e49\u0e27 \u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e40\u0e27\u0e25\u0e32\u0e2d\u0e35\u0e01\u0e19\u0e34\u0e14\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e25\u0e47\u0e2d\u0e01\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22', 'Audio ended. Final seconds to lock in your answer.')
              : pick('\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e41\u0e25\u0e30\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07\u0e16\u0e39\u0e01\u0e0b\u0e48\u0e2d\u0e19\u0e44\u0e27\u0e49\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e40\u0e27\u0e25\u0e32', 'Title and song are hidden until the reveal.')}
          </p>
        </div>

        <div className="party-waveform" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <span key={i} className="party-waveform-bar" style={{ '--wi': i }} />
          ))}
        </div>

        <div className="party-playback-track" aria-hidden="true">
          <span ref={playbackFillRef} className="party-playback-fill" />
        </div>

        <div className="party-playback-controls-row">
          <span className="party-playback-timestamp">
            {formatClipSeconds(playbackElapsedMs)} / {formatClipSeconds(previewDurationMs)}
          </span>
          {!ytReady && !playbackBlocked && (
            <span className="party-buffering-badge">
              <Loader2 size={12} className="party-spin" />
              {pick('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14...', 'Loading...')}
            </span>
          )}
          <div className="party-volume-control">
            <button
              type="button"
              className="party-volume-toggle"
              onClick={() => setVolume((v) => (Number(v || 0) > 0 ? 0 : 85))}
              aria-label={pick(isMuted ? '\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e2a\u0e35\u0e22\u0e07' : '\u0e1b\u0e34\u0e14\u0e40\u0e2a\u0e35\u0e22\u0e07', isMuted ? 'Unmute' : 'Mute')}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range" min="0" max="100" step="1"
              value={normalizedVolume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label={pick('\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e40\u0e2a\u0e35\u0e22\u0e07', 'Volume')}
              className="party-volume-slider"
            />
            <span className="party-volume-value">{normalizedVolume}%</span>
          </div>
        </div>

        {playbackBlocked && (
          <button
            type="button"
            className="party-inline-play"
            onClick={() => {
              setPlaybackBlocked(false);
              setIsPlaying(true);
              startProgressTimer(previewDurationMs);
            }}
          >
            <Play size={16} />
            {pick('\u0e01\u0e14\u0e40\u0e25\u0e48\u0e19\u0e40\u0e1e\u0e25\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07', 'Tap to play audio')}
          </button>
        )}

        {round?.providerMediaId && match?.phase === 'question' ? (
          <PartyYouTubePlayer
            key={`yt-q-${round.id || round.providerMediaId}`}
            videoId={round.providerMediaId}
            playing={isPlaying && !completedRef.current}
            seekOffsetSec={Number(round.previewStartSec || 0)}
            volume={normalizedVolume}
            muted={isMuted}
            visualMode="hidden"
            onReady={handleYtReady}
            onError={handleYtError}
          />
        ) : null}
      </div>
      <PartyEndCountdownOverlay targetTimeMs={phaseEndsAtMs} />
    </section>
  );
}

function PartyQuestionPlayer({ match, round, answerGraceEndsAtMs, phaseEndsAtMs, onPlaybackStarted, onPlaybackComplete, pick }) {
  const mediaRef = useRef(null);
  const playbackFillRef = useRef(null);
  const [volume, setVolume] = useState(() => readPartyAudioVolume());
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);
  const [, setBufferReady] = useState(false);
  const [, setBufferPercent] = useState(0);
  const [bufferingPlayback, setBufferingPlayback] = useState(false);
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  const isMuted = normalizedVolume <= 0;
  const isGracePeriod = Boolean(answerGraceEndsAtMs);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('moodtoon-party-audio-volume', String(normalizedVolume));
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
    const playbackFill = playbackFillRef.current;
    if (!media || !round?.mediaUrl || match?.phase !== 'question') {
      return undefined;
    }

    let stopTimer = null;
    let frameId = null;
    let cancelled = false;
    let playbackCompleted = false;
    let playbackStartedAtMs = null;
    let playbackRequested = false;
    let lastRenderedElapsedMs = -1;
    const previewDurationMs = Number(round.previewDurationSec || match.timePerRoundSec || 12) * 1000;
    const previewStartSec = Number(round.previewStartSec || 0);

    media.currentTime = previewStartSec;
    media.preload = 'auto';
    if (shouldPartyForceMediaLoad(media.currentSrc || media.src, round.mediaUrl, media.readyState)) {
      media.load();
    }
    if (playbackFill) {
      playbackFill.style.transform = 'scaleX(0)';
    }
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

    const updateBufferState = () => {
      const bufferedPreviewMs = getBufferedPreviewMs(media, previewStartSec, previewDurationMs);
      const nextPercent = previewDurationMs > 0
        ? Math.min(100, Math.round((bufferedPreviewMs / previewDurationMs) * 100))
        : 100;
      const nextReady = isPartyPlaybackReady({
        bufferedPreviewMs,
        previewDurationMs,
        readyState: media.readyState,
      });

      if (!cancelled) {
        setBufferPercent(nextPercent);
        setBufferReady(nextReady);
      }

      return nextReady;
    };

    const playWhenReady = async () => {
      if (playbackRequested || playbackCompleted || cancelled) {
        return;
      }

      if (!updateBufferState()) {
        return;
      }

      playbackRequested = true;
      try {
        await media.play();
        markPlaybackStarted();
        onPlaybackStarted?.(Date.now());
        if (!cancelled) {
          setPlaybackBlocked(false);
          setBufferingPlayback(false);
        }
      } catch {
        playbackRequested = false;
        if (!cancelled) {
          setPlaybackBlocked(true);
        }
      }
    };

    updateBufferState();
    void playWhenReady();

    const syncProgress = () => {
      if (cancelled) {
        return;
      }

      const elapsedMs = Math.max(0, (Number(media.currentTime || 0) - previewStartSec) * 1000);
      const clampedElapsedMs = Math.min(previewDurationMs, elapsedMs);
      const progressRatio = previewDurationMs > 0
        ? Math.min(1, clampedElapsedMs / previewDurationMs)
        : 0;

      if (playbackFill) {
        playbackFill.style.transform = `scaleX(${progressRatio})`;
      }

      if (lastRenderedElapsedMs < 0 || Math.abs(clampedElapsedMs - lastRenderedElapsedMs) >= 80 || clampedElapsedMs >= previewDurationMs) {
        lastRenderedElapsedMs = clampedElapsedMs;
        setPlaybackElapsedMs(clampedElapsedMs);
      }
      if (elapsedMs >= previewDurationMs - 80) {
        markPlaybackComplete();
        return;
      }

      frameId = window.requestAnimationFrame(syncProgress);
    };

    frameId = window.requestAnimationFrame(syncProgress);

    stopTimer = window.setInterval(() => {
      updateBufferState();
      if (playbackStartedAtMs && Date.now() >= playbackStartedAtMs + previewDurationMs) {
        markPlaybackComplete();
      }
      if (!playbackStartedAtMs) {
        void playWhenReady();
      }
    }, 200);

    const handlePlaying = () => {
      markPlaybackStarted();
      onPlaybackStarted?.(Date.now());
      setPlaybackBlocked(false);
      setBufferingPlayback(false);
      setBufferReady(true);
    };

    const handleEnded = () => {
      markPlaybackComplete();
    };

    const handleProgress = () => {
      if (updateBufferState()) {
        void playWhenReady();
      }
    };

    const handleWaiting = () => {
      if (!cancelled) {
        setBufferingPlayback(true);
      }
      updateBufferState();
    };

    const handleCanPlayThrough = () => {
      if (!cancelled) {
        setBufferReady(true);
        setBufferPercent(100);
      }
      void playWhenReady();
    };

    media.addEventListener('playing', handlePlaying);
    media.addEventListener('ended', handleEnded);
    media.addEventListener('progress', handleProgress);
    media.addEventListener('canplay', handleProgress);
    media.addEventListener('loadeddata', handleProgress);
    media.addEventListener('waiting', handleWaiting);
    media.addEventListener('stalled', handleWaiting);
    media.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      cancelled = true;
      if (stopTimer) {
        window.clearInterval(stopTimer);
      }
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (playbackFill) {
        playbackFill.style.transform = 'scaleX(0)';
      }
      media.removeEventListener('playing', handlePlaying);
      media.removeEventListener('ended', handleEnded);
      media.removeEventListener('progress', handleProgress);
      media.removeEventListener('canplay', handleProgress);
      media.removeEventListener('loadeddata', handleProgress);
      media.removeEventListener('waiting', handleWaiting);
      media.removeEventListener('stalled', handleWaiting);
      media.removeEventListener('canplaythrough', handleCanPlayThrough);
      media.pause();
    };
  }, [match?.phase, match?.timePerRoundSec, onPlaybackComplete, onPlaybackStarted, round?.id, round?.mediaUrl, round?.previewDurationSec, round?.previewStartSec]);

  const previewDurationMs = Number(round?.previewDurationSec || match?.timePerRoundSec || 12) * 1000;

  return (
    <section className="party-question-stage">
      <div className="party-question-stage-inner">

        {/* Header */}
        <div className="party-question-header">
          <span className="party-chip subtle party-question-kicker">
            <Headphones size={14} />
            {pick('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e40\u0e25\u0e48\u0e19\u0e40\u0e1e\u0e25\u0e07\u0e1b\u0e23\u0e34\u0e28\u0e19\u0e32', 'Mystery audio playing')}
          </span>
          <h2>{pick('\u0e1f\u0e31\u0e07\u0e43\u0e2b\u0e49\u0e14\u0e35 \u0e41\u0e25\u0e49\u0e27\u0e23\u0e35\u0e1a\u0e15\u0e2d\u0e1a\u0e01\u0e48\u0e2d\u0e19\u0e2b\u0e21\u0e14\u0e40\u0e27\u0e25\u0e32', 'Listen closely, answer before time runs out')}</h2>
          <p>
            {isGracePeriod
              ? pick('\u0e40\u0e1e\u0e25\u0e07\u0e08\u0e1a\u0e41\u0e25\u0e49\u0e27 \u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e40\u0e27\u0e25\u0e32\u0e2d\u0e35\u0e01\u0e19\u0e34\u0e14\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e25\u0e47\u0e2d\u0e01\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e2a\u0e38\u0e14\u0e17\u0e49\u0e32\u0e22', 'Audio ended. Final seconds to lock in your answer.')
              : pick('\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e41\u0e25\u0e30\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07\u0e16\u0e39\u0e01\u0e0b\u0e48\u0e2d\u0e19\u0e44\u0e27\u0e49\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e40\u0e27\u0e25\u0e32', 'Title and song are hidden until the reveal.')}
          </p>
        </div>

        {/* EQ waveform visualizer - pure CSS, decorative */}
        <div className="party-waveform" aria-hidden="true">
          {Array.from({ length: 22 }, (_, i) => (
            <span key={i} className="party-waveform-bar" style={{ '--wi': i }} />
          ))}
        </div>

        {/* Progress track */}
        <div className="party-playback-track" aria-hidden="true">
          <span ref={playbackFillRef} className="party-playback-fill" />
        </div>

        {/* Controls row: timestamp left, volume right */}
        <div className="party-playback-controls-row">
          <span className="party-playback-timestamp">
            {formatClipSeconds(playbackElapsedMs)} / {formatClipSeconds(previewDurationMs)}
          </span>
          {bufferingPlayback ? (
            <span className="party-buffering-badge">
              <Loader2 size={12} className="party-spin" />
              {pick('\u0e1a\u0e31\u0e1f\u0e40\u0e1f\u0e2d\u0e23\u0e4c...', 'Buffering...')}
            </span>
          ) : null}
          <div className="party-volume-control">
            <button
              type="button"
              className="party-volume-toggle"
              onClick={() => setVolume((current) => (Number(current || 0) > 0 ? 0 : 85))}
              aria-label={pick(isMuted ? '\u0e40\u0e1b\u0e34\u0e14\u0e40\u0e2a\u0e35\u0e22\u0e07' : '\u0e1b\u0e34\u0e14\u0e40\u0e2a\u0e35\u0e22\u0e07', isMuted ? 'Unmute' : 'Mute')}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range" min="0" max="100" step="1"
              value={normalizedVolume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label={pick('\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e40\u0e2a\u0e35\u0e22\u0e07', 'Volume')}
              className="party-volume-slider"
            />
            <span className="party-volume-value">{normalizedVolume}%</span>
          </div>
        </div>

        {playbackBlocked ? (
          <button
            type="button"
            className="party-inline-play"
            onClick={() => {
              const media = mediaRef.current;
              if (!media) return;
              media.currentTime = Number(round?.previewStartSec || 0);
              void media.play();
              setPlaybackBlocked(false);
            }}
          >
            <Play size={16} />
            {pick('\u0e01\u0e14\u0e40\u0e25\u0e48\u0e19\u0e40\u0e1e\u0e25\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07', 'Tap to play audio')}
          </button>
        ) : null}

        <video ref={mediaRef} src={round?.mediaUrl || ''} playsInline preload="metadata" className="party-hidden-media" />
      </div>

      {/* Last-3s overlay - sits on the question card, pointer-events: none */}
      <PartyEndCountdownOverlay targetTimeMs={phaseEndsAtMs} />
    </section>
  );
}


export function PartyAnswerPanel({
  room,
  member,
  round,
  answer,
  answerCount,
  leaderboard,
  phaseEndsAtMs,
  answerGraceEndsAtMs,
  onPlaybackStarted,
  onPlaybackComplete,
  onSubmit,
  submitting,
  pick,
}) {
  const preset = getPartyPresetById(room?.current_match?.presetId);
  const activeCountdownTargetMs = answerGraceEndsAtMs || phaseEndsAtMs;
  const [typedTitle, setTypedTitle] = useState(() => answer?.typed_title || '');
  const [typedSong, setTypedSong] = useState(() => answer?.typed_song || '');

  // -- Frozen leaderboard ------------------------------------------
  // Snapshot the board when a new round starts.
  // During the question phase we deliberately do NOT follow live
  // updates so players can't see real-time score shifts as others answer.
  // The board refreshes once the next round begins (reveal gives true scores).
  const [frozenLeaderboard, setFrozenLeaderboard] = useState(() => leaderboard);
  const lastRoundIdRef = useRef(round?.id);
  useEffect(() => {
    if (round?.id !== lastRoundIdRef.current) {
      lastRoundIdRef.current = round?.id;
      setFrozenLeaderboard(leaderboard);
    }
    // intentionally exclude `leaderboard` - we only want to refresh on round change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  const canSubmitChoice = room?.current_match?.phase === 'question' && !answer?.selected_option_id;
  const canSubmitTyping = room?.current_match?.phase === 'question';

  return (
    <div className="party-answer-layout">
      {/* Status bar spans full width above both columns */}
        <div className="party-status-bar">
        <PartyCountdownDisplay targetTimeMs={activeCountdownTargetMs}>
          {({ msLeft }) => (
            <span className="party-chip">
              <Clock3 size={14} />
              {pick('\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e40\u0e27\u0e25\u0e32', 'Time left')} {formatCountdown(msLeft, pick)}
            </span>
          )}
        </PartyCountdownDisplay>
        {answerGraceEndsAtMs ? (
          <PartyCountdownDisplay targetTimeMs={answerGraceEndsAtMs}>
            {({ msLeft }) => (
              msLeft > 0 ? (
                <span className="party-chip subtle">
                  <TimerReset size={14} />
                  {pick('\u0e40\u0e1e\u0e25\u0e07\u0e08\u0e1a\u0e41\u0e25\u0e49\u0e27 \u0e01\u0e33\u0e25\u0e31\u0e07\u0e19\u0e31\u0e1a\u0e16\u0e2d\u0e22\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e09\u0e25\u0e22', 'Audio ended, reveal countdown running')}
                </span>
              ) : null
            )}
          </PartyCountdownDisplay>
        ) : null}
        <span className="party-chip subtle">
          <Users2 size={14} />
          {pick('\u0e15\u0e2d\u0e1a\u0e41\u0e25\u0e49\u0e27', 'Answered')} {answerCount}
        </span>
        <span className="party-chip subtle">
          <Sparkles size={14} />
          {pick('\u0e23\u0e2d\u0e1a', 'Round')} {Number(room?.current_match?.roundIndex || 0) + 1}/{room?.current_match?.totalRounds || 0}
        </span>
      </div>

      {/* Two columns: question left, leaderboard right - both start at top */}
      <div className="party-game-grid">
        <div className="party-game-main">
          {round?.provider === 'youtube' ? (
            <PartyYouTubeQuestionPlayer
              key={round?.id || round?.providerMediaId || 'yt-question-player'}
              match={room?.current_match}
              round={round}
              answerGraceEndsAtMs={answerGraceEndsAtMs}
              phaseEndsAtMs={phaseEndsAtMs}
              onPlaybackStarted={onPlaybackStarted}
              onPlaybackComplete={onPlaybackComplete}
              pick={pick}
            />
          ) : (
            <PartyQuestionPlayer
              key={round?.id || round?.mediaUrl || 'question-player'}
              match={room?.current_match}
              round={round}
              answerGraceEndsAtMs={answerGraceEndsAtMs}
              phaseEndsAtMs={phaseEndsAtMs}
              onPlaybackStarted={onPlaybackStarted}
              onPlaybackComplete={onPlaybackComplete}
              pick={pick}
            />
          )}

          {preset.answerMode === 'choice' ? (
            <section className="party-answer-card">
              <div className="party-answer-head">
                <strong>{round?.choiceTarget === 'song'
                  ? pick('\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07\u0e17\u0e35\u0e48\u0e04\u0e34\u0e14\u0e27\u0e48\u0e32\u0e43\u0e0a\u0e48', 'Choose the song title you think matches')
                  : pick('\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e04\u0e34\u0e14\u0e27\u0e48\u0e32\u0e43\u0e0a\u0e48', 'Choose the title you think matches')}</strong>
                <span>{answer?.selected_option_id ? pick('\u0e04\u0e38\u0e13\u0e25\u0e47\u0e2d\u0e01\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e41\u0e25\u0e49\u0e27', 'Your answer is locked in') : pick('\u0e01\u0e14\u0e44\u0e14\u0e49\u0e04\u0e23\u0e31\u0e49\u0e07\u0e40\u0e14\u0e35\u0e22\u0e27\u0e15\u0e48\u0e2d\u0e23\u0e2d\u0e1a', 'One tap per round')}</span>
              </div>
              <div className="party-choice-grid">
                {(round?.options || []).map((option, index) => {
                  const LABELS = ['A', 'B', 'C', 'D'];
                  const label = LABELS[index] || String(index + 1);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`party-choice-btn ${answer?.selected_option_id === option.id ? 'is-selected' : ''}`}
                      onClick={() => onSubmit({ selectedOptionId: option.id })}
                      disabled={!canSubmitChoice || submitting}
                    >
                      <span className="party-choice-label" aria-hidden="true">{label}</span>
                      <span>{option.label}</span>
                      {answer?.selected_option_id === option.id ? <CheckCircle2 size={16} /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="party-answer-card">
              <div className="party-answer-head">
                <strong>
                  {preset.answerMode === 'typing'
                    ? pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07\u0e43\u0e2b\u0e49\u0e15\u0e23\u0e07\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14', 'Type the exact song title')
                    : pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e17\u0e31\u0e49\u0e07\u0e2a\u0e2d\u0e07\u0e0a\u0e48\u0e2d\u0e07', 'Type both answers')}
                </strong>
                <span>{pick('\u0e04\u0e38\u0e13\u0e01\u0e14\u0e2a\u0e48\u0e07\u0e0b\u0e49\u0e33\u0e44\u0e14\u0e49\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32\u0e08\u0e30\u0e2b\u0e21\u0e14\u0e40\u0e27\u0e25\u0e32', 'You can resubmit until the timer ends')}</span>
              </div>
              {preset.answerMode === 'dual' ? (
                <div className="party-input-stack">
                  <label className="party-field">
                    <span>{pick('\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07', 'Source title')}</span>
                    <input
                      type="text"
                      value={typedTitle}
                      onChange={(event) => setTypedTitle(event.target.value)}
                      placeholder={pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e17\u0e35\u0e48\u0e04\u0e34\u0e14\u0e27\u0e48\u0e32\u0e43\u0e0a\u0e48', 'Type the anime title')}
                      disabled={!canSubmitTyping || submitting}
                    />
                  </label>
                  <label className="party-field">
                    <span>{pick('\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Song title')}</span>
                    <input
                      type="text"
                      value={typedSong}
                      onChange={(event) => setTypedSong(event.target.value)}
                      placeholder={pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Type the song title')}
                      disabled={!canSubmitTyping || submitting}
                    />
                  </label>
                </div>
              ) : (
                <label className="party-field">
                  <span>{pick('\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Song title')}</span>
                  <input
                    type="text"
                    value={typedSong}
                    onChange={(event) => setTypedSong(event.target.value)}
                    placeholder={pick('\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07\u0e17\u0e35\u0e48\u0e04\u0e34\u0e14\u0e27\u0e48\u0e32\u0e43\u0e0a\u0e48', 'Type the song title')}
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
                  {submitting ? pick('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e48\u0e07...', 'Saving...') : pick('\u0e2a\u0e48\u0e07\u0e04\u0e33\u0e15\u0e2d\u0e1a', 'Submit answer')}
                </Button>
                {answer ? (
                  <span className="party-answer-note">
                    <CheckCircle2 size={14} />
                    {pick('\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e33\u0e15\u0e2d\u0e1a\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14\u0e41\u0e25\u0e49\u0e27', 'Latest answer saved')}
                  </span>
                ) : null}
              </div>
            </section>
          )}
        </div>

        <aside className="party-game-side">
          <section className="party-side-panel">
            <div className="party-side-panel-inner">
              <div className="party-side-head">
                <strong>{pick('\u0e15\u0e32\u0e23\u0e32\u0e07\u0e04\u0e30\u0e41\u0e19\u0e19\u0e2a\u0e14', 'Live leaderboard')}</strong>
                <span>{pick('\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e17\u0e38\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07\u0e17\u0e35\u0e48\u0e21\u0e35\u0e04\u0e19\u0e15\u0e2d\u0e1a', 'Updates as answers come in')}</span>
              </div>
              <PartyLeaderboard leaderboard={frozenLeaderboard} currentToken={member?.member_token} pick={pick} compact />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}


export function PartyRevealPanel({ round, answers, leaderboard, memberToken, pick, onPlaybackStarted }) {
  const revealVideoRef = useRef(null);
  const currentAnswer = answers.find((entry) => String(entry.member_token || '') === String(memberToken || ''));
  const revealState = !currentAnswer
    ? pick('\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e15\u0e2d\u0e1a', 'No answer')
    : currentAnswer.title_correct || currentAnswer.song_correct
      ? pick('\u0e16\u0e39\u0e01', 'Correct')
      : pick('\u0e1c\u0e34\u0e14', 'Incorrect');
  const revealHeading = round?.choiceTarget === 'song'
    ? (round?.songTitle || pick('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Song unknown'))
    : (round?.sourceTitleName || pick('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07', 'Title unknown'));
  const revealSubheading = round?.choiceTarget === 'song'
    ? (round?.sourceTitleName || '')
    : (round?.songTitle || pick('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e1e\u0e25\u0e07', 'Song unknown'));

  const isYouTubeRound = round?.provider === 'youtube' && Boolean(round?.providerMediaId);

  useEffect(() => {
    if (isYouTubeRound) return; // handled by PartyYouTubePlayer onReady
    const video = revealVideoRef.current;
    if (!video || !round?.mediaUrl) {
      return;
    }

    const savedVolume = readPartyAudioVolume();
    video.volume = Math.min(1, Math.max(0, savedVolume / 100));
    video.muted = savedVolume <= 0;

    video.preload = 'auto';
    if (shouldPartyForceMediaLoad(video.currentSrc || video.src, round.mediaUrl, video.readyState)) {
      video.load();
    }
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
      window.localStorage.setItem('moodtoon-party-audio-volume', String(nextVolume));
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
  }, [isYouTubeRound, onPlaybackStarted, round?.id, round?.mediaUrl]);

  return (
    <div className="party-game-grid">
      <div className="party-game-main">
        {/* Gradient-border reveal card ? same technique as question stage */}
        <section className="party-reveal-card">
          <div className="party-reveal-card-inner">

            {/* Animated confetti dots (decorative) */}
            <div className="party-reveal-confetti" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="party-reveal-dot" style={{ '--di': i }} />
              ))}
            </div>

            {/* Outcome banner: correct / wrong / no answer */}
            <div className={`party-reveal-outcome-banner ${
              !currentAnswer ? 'is-skipped'
              : currentAnswer.title_correct || currentAnswer.song_correct ? 'is-correct'
              : 'is-wrong'
            }`}>
              <span className="party-reveal-outcome-emoji">
                {!currentAnswer ? '\u2754' : currentAnswer.title_correct || currentAnswer.song_correct ? '\u2705' : '\u274c'}
              </span>
              <span>{revealState}</span>
            </div>

            {/* Song identity */}
            <div className="party-reveal-identity">
              <span className="party-chip subtle">
                <Sparkles size={14} />
                {pick('\u0e40\u0e09\u0e25\u0e22\u0e23\u0e2d\u0e1a\u0e19\u0e35\u0e49', 'Round reveal')}
              </span>
              <h2 className="party-reveal-title">{revealHeading}</h2>
              <p className="party-reveal-song">{revealSubheading}</p>
              <div className="party-reveal-meta">
                {round?.artistName ? <span>{round.artistName}</span> : null}
                {round?.themeType ? <span>{round.themeType}</span> : null}
              </div>
            </div>

            {/* Video player */}
            {isYouTubeRound ? (
              <div className="party-reveal-video-wrap">
                <PartyYouTubePlayer
                  key={`yt-reveal-${round.id || round.providerMediaId}`}
                  videoId={round.providerMediaId}
                  playing
                  seekOffsetSec={0}
                  volume={readPartyAudioVolume()}
                  muted={false}
                  onReady={() => onPlaybackStarted?.(Date.now())}
                />
              </div>
            ) : round?.mediaUrl ? (
              <div className="party-reveal-video-wrap">
                <video
                  ref={revealVideoRef}
                  key={round.id || round.mediaUrl}
                  src={round.mediaUrl}
                  className="party-reveal-video"
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <aside className="party-game-side">
        <section className="party-side-panel">
          <div className="party-side-panel-inner">
            <div className="party-side-head">
              <strong>{pick('\u0e2d\u0e31\u0e19\u0e14\u0e31\u0e1a\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14', 'Current standing')}</strong>
              <span>{pick('\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e2b\u0e25\u0e31\u0e07\u0e40\u0e09\u0e25\u0e22', 'Updated after reveal')}</span>
            </div>
            <PartyLeaderboard leaderboard={leaderboard} currentToken={memberToken} pick={pick} compact />
          </div>
        </section>
      </aside>
    </div>
  );
}
