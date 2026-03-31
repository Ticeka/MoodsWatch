import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, RefreshCw, Swords, Volume2, VolumeX, Zap } from 'lucide-react';
import { resumePartyAudioContext } from '@/features/party/lib/partyAudio';
import { PartyYouTubePlayer } from './PartyYouTubePlayer';
import {
  formatClipSeconds,
  getPartyBufferedPreviewMs,
  isPartyPlaybackReady,
  playPartyClashAlert,
  playPartyCountdownAlert,
  playPartyRevealImpactAlert,
  playPartyRevealSuspenseAlert,
  playPartyWinAlert,
  readPartyAudioVolume,
  shouldPartyForceMediaLoad,
} from '../pages/partyRoomUtils';

export function BattleCountdown({ battleIndex, totalBattles, currentMatch, secondsLeft, pick }) {
  const [audioCtx] = useState(() => typeof window !== 'undefined' && window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null);
  const displaySeconds = Number.isFinite(secondsLeft) ? Math.max(0, secondsLeft) : 0;

  useEffect(() => {
    if (secondsLeft > 0 && secondsLeft <= 3) {
      if (audioCtx?.state === 'suspended') audioCtx.resume();
      playPartyCountdownAlert(audioCtx, readPartyAudioVolume(), secondsLeft);
    }
  }, [audioCtx, secondsLeft]);

  return (
    <div className="vote-phase-countdown">
      <div className="vote-countdown-topbar">
        <span className="battle-badge">
          <Swords size={16} /> BATTLE {battleIndex} / {totalBattles}
        </span>
        <span className="queue-badge">
          {currentMatch.queue.length + 2} {pick('เพลงที่ยังอยู่ในการแข่ง', 'Contenders Remaining')}
        </span>
      </div>
      <div className="vote-countdown-center">
        <h2>{pick('GET READY FOR THE NEXT BATTLE', 'GET READY FOR THE NEXT BATTLE')}</h2>
        <div className="vote-countdown-number pulse-heavy">{displaySeconds}</div>
      </div>
    </div>
  );
}

export function TrackIntroCard({ songKey, songData, pick }) {
  const isA = songKey === 'A';
  const [audioCtx] = useState(() => typeof window !== 'undefined' && window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null);

  useEffect(() => {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    playPartyClashAlert(audioCtx, readPartyAudioVolume());
  }, [audioCtx]);

  return (
    <div className={`vote-phase-intro is-${songKey.toLowerCase()}`}>
      {isA ? null : <div className="clash-vs-glitch">V.S.</div>}
      <div className={`track-intro-card slide-in-heavy-${isA ? 'left' : 'right'}`}>
        <div className="track-intro-label">
          {pick(`TRACK ${songKey}`, `TRACK ${songKey}`)}
        </div>
        <div className="track-intro-cover">
          {songData?.coverUrl ? <img src={songData.coverUrl} alt="Cover" /> : <div className="cover-placeholder" />}
        </div>
        <div className="track-intro-info">
          <h3>{songData?.songTitle || 'Unknown Track'}</h3>
          <p>{songData?.sourceTitleName || 'Unknown Source'} - {songData?.artistName || 'Unknown Artist'}</p>
        </div>
      </div>
    </div>
  );
}

export function TrackPlayback({
  songKey,
  songData,
  isPlaying,
  playbackMode = 'preview',
  totalSec,
  onPlaybackComplete,
  sideAction = null,
  pick,
}) {
  const isYouTubeSong = songData?.provider === 'youtube' && Boolean(songData?.providerMediaId);
  const videoRef = useRef(null);
  const progressFillRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytTimerRef = useRef(null);
  const ytStartedAtRef = useRef(null);
  const ytCompletedRef = useRef(false);
  const ytDurationMsRef = useRef(Math.max(1, Number(totalSec || 12)) * 1000);
  const [volume, setVolume] = useState(() => readPartyAudioVolume());
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [bufferReady, setBufferReady] = useState(false);
  const [bufferPercent, setBufferPercent] = useState(0);
  const [bufferingPlayback, setBufferingPlayback] = useState(false);
  const [slowNetwork, setSlowNetwork] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [playbackElapsedMs, setPlaybackElapsedMs] = useState(0);
  const [ytPlaying, setYtPlaying] = useState(false);
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0));
  const isMuted = normalizedVolume <= 0;
  const playbackModeValue = playbackMode === 'full' ? 'full' : 'preview';
  const fallbackDurationMs = Math.max(1, Number(totalSec || 12)) * 1000;
  const [displayDurationMs, setDisplayDurationMs] = useState(fallbackDurationMs);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('moodtoon-party-audio-volume', String(normalizedVolume));
  }, [normalizedVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = normalizedVolume / 100;
    video.muted = isMuted;
  }, [isMuted, normalizedVolume]);

  useEffect(() => {
    setDisplayDurationMs(fallbackDurationMs);
  }, [fallbackDurationMs, playbackModeValue, songData?.mediaUrl, songData?.providerMediaId]);

  // Reset YouTube timer state when song changes
  useEffect(() => {
    if (!isYouTubeSong) return;
    ytPlayerRef.current = null;
    ytDurationMsRef.current = fallbackDurationMs;
    ytStartedAtRef.current = null;
    ytCompletedRef.current = false;
    setYtPlaying(false);
    setPlaybackElapsedMs(0);
    if (ytTimerRef.current) window.clearInterval(ytTimerRef.current);
    if (progressFillRef.current) progressFillRef.current.style.transform = 'scaleX(0)';
    return () => { if (ytTimerRef.current) window.clearInterval(ytTimerRef.current); };
  }, [fallbackDurationMs, isYouTubeSong, songData?.providerMediaId]);

  const resolveYtDurationMs = useCallback((player = ytPlayerRef.current) => {
    if (playbackModeValue !== 'full') {
      ytDurationMsRef.current = fallbackDurationMs;
      return fallbackDurationMs;
    }

    const resolvedSec = Number(player?.getDuration?.() || 0);
    if (Number.isFinite(resolvedSec) && resolvedSec > 0) {
      const resolvedMs = Math.max(1, Math.round(resolvedSec * 1000));
      ytDurationMsRef.current = resolvedMs;
      setDisplayDurationMs((current) => (current === resolvedMs ? current : resolvedMs));
      return resolvedMs;
    }

    ytDurationMsRef.current = fallbackDurationMs;
    return fallbackDurationMs;
  }, [fallbackDurationMs, playbackModeValue]);

  const markYtPlaybackComplete = useCallback(() => {
    if (ytCompletedRef.current) {
      return;
    }

    ytCompletedRef.current = true;
    if (ytTimerRef.current) {
      window.clearInterval(ytTimerRef.current);
    }
    setYtPlaying(false);
    setPlaybackElapsedMs(resolveYtDurationMs());
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = 'scaleX(1)';
    }
    onPlaybackComplete?.(Date.now());
  }, [onPlaybackComplete, resolveYtDurationMs]);

  const handleYtReadyVote = useCallback((player) => {
    ytPlayerRef.current = player || null;
    const initialDurationMs = resolveYtDurationMs(player);
    if (ytStartedAtRef.current || ytCompletedRef.current) return;
    ytStartedAtRef.current = Date.now();
    setYtPlaying(true);
    if (ytTimerRef.current) window.clearInterval(ytTimerRef.current);
    ytTimerRef.current = window.setInterval(() => {
      if (!ytStartedAtRef.current || ytCompletedRef.current) return;
      const durationMs = resolveYtDurationMs();
      const elapsed = Date.now() - ytStartedAtRef.current;
      const clamped = Math.min(durationMs, elapsed);
      setPlaybackElapsedMs(clamped);
      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${Math.min(1, clamped / durationMs)})`;
      }
      if (elapsed >= durationMs) {
        markYtPlaybackComplete();
      }
    }, 80);
    setDisplayDurationMs(initialDurationMs);
  }, [markYtPlaybackComplete, resolveYtDurationMs]);

  const handleYtErrorVote = useCallback(() => {
    setPlaybackFailed(true);
    setYtPlaying(false);
  }, []);

  const handleYtEndedVote = useCallback(() => {
    markYtPlaybackComplete();
  }, [markYtPlaybackComplete]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !songData?.mediaUrl || !isPlaying) {
      return undefined;
    }

    let cancelled = false;
    let playbackStartedAtMs = null;
    let playbackRequested = false;
    let playbackCompleted = false;
    let frameId = null;
    let intervalId = null;
    let lastRenderedElapsedMs = -1;
    const loadingStartedAtMs = Date.now();
    const previewStartSec = 0;

    const resolvePlaybackTargetMs = () => {
      if (playbackModeValue !== 'full') {
        return fallbackDurationMs;
      }

      const resolvedDurationSec = Number(video.duration || 0);
      if (Number.isFinite(resolvedDurationSec) && resolvedDurationSec > 0) {
        const resolvedDurationMs = Math.max(1, Math.round(resolvedDurationSec * 1000));
        if (!cancelled) {
          setDisplayDurationMs((current) => (current === resolvedDurationMs ? current : resolvedDurationMs));
        }
        return resolvedDurationMs;
      }

      return fallbackDurationMs;
    };

    const updateBufferState = () => {
      const playbackTargetMs = resolvePlaybackTargetMs();
      const ranges = [];
      if (video.buffered) {
        for (let index = 0; index < video.buffered.length; index += 1) {
          ranges.push([
            Number(video.buffered.start(index) || 0),
            Number(video.buffered.end(index) || 0),
          ]);
        }
      }

      const bufferedPreviewMs = getPartyBufferedPreviewMs(
        ranges,
        video.currentTime,
        previewStartSec,
        playbackTargetMs,
      );
      const nextPercent = playbackTargetMs > 0
        ? Math.min(100, Math.round((bufferedPreviewMs / playbackTargetMs) * 100))
        : 100;
      const nextReady = isPartyPlaybackReady({
        bufferedPreviewMs,
        previewDurationMs: playbackTargetMs,
        readyState: video.readyState,
      });

      if (!cancelled) {
        setBufferPercent(nextPercent);
        setBufferReady(nextReady);
      }

      return nextReady;
    };

    const syncProgress = () => {
      if (cancelled || playbackCompleted) {
        return;
      }

      const playbackTargetMs = resolvePlaybackTargetMs();
      const elapsedMs = Math.max(0, (Number(video.currentTime || 0) - previewStartSec) * 1000);
      const clampedElapsedMs = Math.min(playbackTargetMs, elapsedMs);
      const progressRatio = playbackTargetMs > 0
        ? Math.min(1, clampedElapsedMs / playbackTargetMs)
        : 0;

      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${progressRatio})`;
      }

      if (
        lastRenderedElapsedMs < 0
        || Math.abs(clampedElapsedMs - lastRenderedElapsedMs) >= 80
        || clampedElapsedMs >= playbackTargetMs
      ) {
        lastRenderedElapsedMs = clampedElapsedMs;
        setPlaybackElapsedMs(clampedElapsedMs);
      }

      if (elapsedMs >= playbackTargetMs - 80) {
        playbackCompleted = true;
        video.pause();
        setBufferingPlayback(false);
        setPlaybackElapsedMs(playbackTargetMs);
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = 'scaleX(1)';
        }
        onPlaybackComplete?.(Date.now());
        return;
      }

      frameId = window.requestAnimationFrame(syncProgress);
    };

    const tryPlay = async ({ force = false } = {}) => {
      if (playbackRequested || playbackCompleted || cancelled) {
        return;
      }

      if (!force && !updateBufferState()) {
        return;
      }

      playbackRequested = true;
      try {
        await video.play();
        if (!cancelled) {
          setPlaybackBlocked(false);
          setBufferingPlayback(false);
          setPlaybackFailed(false);
          setBufferReady(true);
        }
      } catch (error) {
        playbackRequested = false;
        if (!cancelled) {
          setPlaybackBlocked(true);
          console.warn('Vote playback autoplay blocked, waiting for user gesture.', error);
        }
      }
    };

    video.currentTime = previewStartSec;
    video.preload = 'auto';
    if (retryNonce > 0 || shouldPartyForceMediaLoad(video.currentSrc || video.src, songData.mediaUrl, video.readyState)) {
      video.load();
    }
    video.volume = Math.max(0, Math.min(1, readPartyAudioVolume() / 100));
    video.muted = readPartyAudioVolume() <= 0;
    setPlaybackBlocked(false);
    setBufferReady(false);
    setBufferPercent(0);
    setBufferingPlayback(false);
    setSlowNetwork(false);
    setPlaybackFailed(false);
    setPlaybackElapsedMs(0);
    setDisplayDurationMs(fallbackDurationMs);
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = 'scaleX(0)';
    }
    onPlaybackComplete?.(null);

    const handlePlaying = () => {
      if (!playbackStartedAtMs && !playbackCompleted) {
        playbackStartedAtMs = Date.now();
        frameId = window.requestAnimationFrame(syncProgress);
      }
      setBufferingPlayback(false);
      setPlaybackBlocked(false);
      setBufferReady(true);
      setSlowNetwork(false);
    };

    const handleWaiting = () => {
      if (!playbackCompleted) {
        setBufferingPlayback(true);
      }
      updateBufferState();
    };

    const handleProgress = () => {
      if (updateBufferState()) {
        void tryPlay();
      }
    };

    const handleCanPlayThrough = () => {
      if (!cancelled) {
        setBufferReady(true);
        setBufferPercent(100);
      }
      void tryPlay();
    };

    const handleLoadedMetadata = () => {
      resolvePlaybackTargetMs();
      updateBufferState();
    };

    const handleEnded = () => {
      if (playbackCompleted) {
        return;
      }
      playbackCompleted = true;
      setPlaybackElapsedMs(resolvePlaybackTargetMs());
      onPlaybackComplete?.(Date.now());
    };

    const handleError = () => {
      if (!cancelled) {
        setPlaybackFailed(true);
        setBufferingPlayback(false);
      }
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleWaiting);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('canplay', handleProgress);
    video.addEventListener('loadeddata', handleProgress);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleLoadedMetadata);
    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    intervalId = window.setInterval(() => {
      const ready = updateBufferState();

      if (!playbackStartedAtMs && Date.now() - loadingStartedAtMs >= 2500 && !ready) {
        setSlowNetwork(true);
      }

      const playbackTargetMs = resolvePlaybackTargetMs();

      if (playbackStartedAtMs && Date.now() >= playbackStartedAtMs + playbackTargetMs) {
        if (!playbackCompleted) {
          playbackCompleted = true;
          video.pause();
          setPlaybackElapsedMs(playbackTargetMs);
          if (progressFillRef.current) {
            progressFillRef.current.style.transform = 'scaleX(1)';
          }
          onPlaybackComplete?.(Date.now());
        }
        return;
      }

      if (!playbackStartedAtMs) {
        void tryPlay();
      }
    }, 200);

    updateBufferState();
    void tryPlay();

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleWaiting);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('canplay', handleProgress);
      video.removeEventListener('loadeddata', handleProgress);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleLoadedMetadata);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.pause();
    };
  }, [fallbackDurationMs, isPlaying, onPlaybackComplete, playbackModeValue, retryNonce, songData?.mediaUrl]);

  const previewDurationMs = displayDurationMs;
  const progressLabel = formatClipSeconds(playbackElapsedMs);
  const totalLabel = formatClipSeconds(previewDurationMs);
  const isWaitingForStart = !bufferReady && !playbackBlocked && !playbackFailed;
  const showRetry = slowNetwork || playbackFailed;

  return (
    <div className={`vote-phase-playback is-${songKey.toLowerCase()}`}>
      <div className="track-playback-card playback-pulse">
        <div className="track-playback-header">
          <Zap size={20} className="playback-icon" />
          <span>{pick(`กำลังเล่น TRACK ${songKey}`, `NOW PLAYING TRACK ${songKey}`)}</span>
        </div>

        {isYouTubeSong ? (
          <div className="track-playback-video-wrapper">
            <PartyYouTubePlayer
              key={`yt-vote-${songData.providerMediaId}`}
              videoId={songData.providerMediaId}
              playing={isPlaying && ytPlaying}
              seekOffsetSec={0}
              volume={normalizedVolume}
              muted={isMuted}
              allowPointerEvents={false}
              onReady={handleYtReadyVote}
              onError={handleYtErrorVote}
              onEnded={handleYtEndedVote}
            />
            {playbackFailed ? (
              <div className="track-playback-video-overlay" aria-live="polite">
                <div className="track-playback-status-card is-error">
                  <RefreshCw size={18} />
                  <strong>{pick('โหลดคลิปไม่สำเร็จ', 'Clip failed to load')}</strong>
                </div>
              </div>
            ) : !ytPlaying && !ytCompletedRef.current ? (
              <div className="track-playback-video-overlay" aria-live="polite">
                <div className="track-playback-status-card">
                  <Loader2 size={18} className="party-spin" />
                  <strong>{pick('กำลังโหลด YouTube...', 'Loading YouTube…')}</strong>
                </div>
              </div>
            ) : null}
          </div>
        ) : songData?.mediaUrl ? (
          <div className={`track-playback-video-wrapper ${isWaitingForStart ? 'is-loading' : ''} ${bufferingPlayback ? 'is-buffering' : ''} ${playbackFailed ? 'is-failed' : ''}`}>
            <video
              ref={videoRef}
              src={songData.mediaUrl}
              className="track-playback-video"
              playsInline
              preload="metadata"
            />
            <div className="track-playback-video-overlay" aria-live="polite">
              {isWaitingForStart ? (
                <div className="track-playback-status-card">
                  <Loader2 size={18} className="party-spin" />
                  <strong>{pick('กำลังเตรียมคลิปให้พร้อม', 'Preparing the clip')}</strong>
                  <span>{pick(`บัฟเฟอร์ ${bufferPercent}% ก่อนเริ่มเล่นจริง`, `Buffering ${bufferPercent}% before playback starts`)}</span>
                </div>
              ) : null}
              {bufferingPlayback ? (
                <div className="track-playback-status-card is-warning">
                  <Loader2 size={18} className="party-spin" />
                  <strong>{pick('สัญญาณช้าลงเล็กน้อย', 'Playback is catching up')}</strong>
                  <span>{pick('รอบัฟเฟอร์สักครู่ ระบบจะเล่นต่อให้อัตโนมัติ', 'Waiting for more buffer. Playback will resume automatically.')}</span>
                </div>
              ) : null}
              {playbackFailed ? (
                <div className="track-playback-status-card is-error">
                  <RefreshCw size={18} />
                  <strong>{pick('โหลดคลิปไม่สำเร็จ', 'Clip failed to load')}</strong>
                  <span>{pick('ลองกดรีโหลดคลิปอีกครั้ง', 'Try reloading the clip again.')}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="track-playback-body">
          {songData?.coverUrl ? <img src={songData.coverUrl} alt="Cover" className="playback-cover" /> : <div className="playback-cover placeholder" />}
          <div className="playback-details">
            <h4 title={songData?.songTitle}>{songData?.songTitle || 'Unknown'}</h4>
            <p title={songData?.sourceTitleName}>{songData?.sourceTitleName || 'Source'}</p>
            <div className="track-playback-meta">
              <span className={`track-buffer-pill ${bufferReady ? 'is-ready' : ''}`}>
                {bufferReady
                  ? pick('คลิปพร้อมแล้ว', 'Clip ready')
                  : pick(`บัฟเฟอร์ ${bufferPercent}%`, `Buffer ${bufferPercent}%`)}
              </span>
              {slowNetwork && !playbackFailed ? (
                <span className="track-buffer-pill is-warning">
                  {pick('เน็ตช้า กำลังรอบัฟเฟอร์เพิ่ม', 'Slow network, waiting for more buffer')}
                </span>
              ) : null}
            </div>
          </div>
          {sideAction ? (
            <div className="track-playback-side-action">
              {sideAction}
            </div>
          ) : null}
        </div>

        <div className="track-playback-progress">
          <div ref={progressFillRef} className="progress-bar-fill" />
        </div>

        <div className="track-playback-controls-row">
          <span className="track-playback-time">{progressLabel} / {totalLabel}</span>
          <div className="track-playback-volume">
            <button
              type="button"
              className="track-playback-volume-toggle"
              onClick={() => setVolume((current) => (Number(current || 0) > 0 ? 0 : 85))}
              aria-label={pick(isMuted ? 'เปิดเสียง' : 'ปิดเสียง', isMuted ? 'Unmute' : 'Mute')}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={normalizedVolume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="track-playback-volume-slider"
              aria-label={pick('ระดับเสียง', 'Volume')}
            />
            <span className="track-playback-volume-value">{normalizedVolume}%</span>
          </div>
        </div>

        {bufferingPlayback ? (
          <div className="vote-casted-toast" role="status">{pick('กำลังบัฟเฟอร์คลิปอยู่...', 'Buffering clip...')}</div>
        ) : null}

        {playbackBlocked ? (
          <button
            type="button"
            className="vote-start-btn"
            onClick={() => {
              const video = videoRef.current;
              if (!video) {
                setRetryNonce((current) => current + 1);
                return;
              }

              setPlaybackBlocked(false);
              setPlaybackFailed(false);
              void video.play()
                .then(() => {
                  setSlowNetwork(false);
                })
                .catch(() => {
                  setPlaybackBlocked(true);
                  setRetryNonce((current) => current + 1);
                });
            }}
          >
            <Play size={18} />
            {pick('แตะเพื่อเริ่มเล่นคลิป', 'Tap to play clip')}
          </button>
        ) : null}

        {showRetry && !playbackBlocked ? (
          <button
            type="button"
            className="vote-start-btn vote-start-btn--secondary"
            onClick={() => setRetryNonce((current) => current + 1)}
          >
            <RefreshCw size={18} />
            {pick('ลองโหลดคลิปใหม่', 'Retry clip')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function VoteFaceoff({ battle, allSongs, hasVoted, selectedSongId, onVote, isSubmitting, secondsLeft, pick }) {
  const songA = allSongs[battle.songA];
  const songB = allSongs[battle.songB];
  const votedA = selectedSongId === battle.songA;
  const votedB = selectedSongId === battle.songB;

  return (
    <div className="vote-phase-faceoff">
      <div className="faceoff-header">
        <span>{pick('เลือกเพลงที่ควรเข้ารอบ', 'VOTE THE BEST TRACK')}</span>
        <div className="faceoff-timer" aria-label={pick(`เหลือเวลา ${secondsLeft} วินาที`, `${secondsLeft} seconds left`)}>{secondsLeft}s</div>
      </div>
      <div className="faceoff-arena">
        <div className={`faceoff-side side-a ${hasVoted && !votedA ? 'is-dimmed' : ''}`}>
          <div className={`faceoff-card ${votedA ? 'is-selected' : ''}`}>
            {votedA ? <div className="vote-picked-badge">{pick('YOUR PICK', 'YOUR PICK')}</div> : null}
            {songA?.coverUrl && <img src={songA.coverUrl} alt={songA.songTitle || 'Track A'} />}
            <div className="faceoff-info">
              <h4 title={songA?.songTitle}>{songA?.songTitle}</h4>
              <p title={songA?.sourceTitleName}>{songA?.sourceTitleName}</p>
            </div>
          </div>
          <button
            id="vote-btn-a"
            className={`vote-btn btn-a ${votedA ? 'is-voted' : ''}`}
            onClick={() => onVote('A', battle.songA)}
            disabled={isSubmitting}
            aria-pressed={votedA}
          >
            {isSubmitting && votedA ? '...' : votedA ? pick('VOTED A', 'VOTED A') : pick('VOTE A', 'VOTE A')}
          </button>
        </div>

        <div className="faceoff-vs glow-flash" aria-hidden="true">V.S.</div>

        <div className={`faceoff-side side-b ${hasVoted && !votedB ? 'is-dimmed' : ''}`}>
          <div className={`faceoff-card ${votedB ? 'is-selected' : ''}`}>
            {votedB ? <div className="vote-picked-badge">{pick('YOUR PICK', 'YOUR PICK')}</div> : null}
            {songB?.coverUrl && <img src={songB.coverUrl} alt={songB.songTitle || 'Track B'} />}
            <div className="faceoff-info">
              <h4 title={songB?.songTitle}>{songB?.songTitle}</h4>
              <p title={songB?.sourceTitleName}>{songB?.sourceTitleName}</p>
            </div>
          </div>
          <button
            id="vote-btn-b"
            className={`vote-btn btn-b ${votedB ? 'is-voted' : ''}`}
            onClick={() => onVote('B', battle.songB)}
            disabled={isSubmitting}
            aria-pressed={votedB}
          >
            {isSubmitting && votedB ? '...' : votedB ? pick('VOTED B', 'VOTED B') : pick('VOTE B', 'VOTE B')}
          </button>
        </div>
      </div>
      {hasVoted ? (
        <div className="vote-casted-toast" role="status">
          {pick('ส่งโหวตแล้ว เปลี่ยนใจได้จนกว่าจะหมดเวลา', 'Vote sent. You can still change it before time runs out.')}
        </div>
      ) : null}
    </div>
  );
}

export function RevealResult({ battle, allSongs, secondsLeft, revealSec, freezeMs, pick }) {
  const songA = allSongs[battle.songA];
  const songB = allSongs[battle.songB];
  const summary = battle.voteSummary || {};
  const songAVotes = Number(summary.songA_votes ?? 0);
  const songBVotes = Number(summary.songB_votes ?? 0);
  const suspensePlayedRef = useRef(false);
  const impactPlayedRef = useRef(false);

  const totalRevealMs = (revealSec || 6) * 1000;
  const freeze = freezeMs ?? 1800;
  const elapsedMs = Math.max(0, totalRevealMs - secondsLeft * 1000);
  const isFrozen = elapsedMs < freeze;

  const winnerSongId = battle.winnerSongId;
  const isAWin = winnerSongId === battle.songA;
  const isBWin = winnerSongId === battle.songB;

  useEffect(() => {
    suspensePlayedRef.current = false;
    impactPlayedRef.current = false;
  }, [battle?.songA, battle?.songB, battle?.winnerSongId]);

  useEffect(() => {
    let cancelled = false;

    void resumePartyAudioContext().then((audioContext) => {
      if (cancelled || !audioContext) {
        return;
      }

      const volume = readPartyAudioVolume();
      if (isFrozen && !suspensePlayedRef.current) {
        suspensePlayedRef.current = true;
        playPartyRevealSuspenseAlert(audioContext, volume);
        return;
      }

      if (!isFrozen && !impactPlayedRef.current) {
        impactPlayedRef.current = true;
        playPartyRevealImpactAlert(audioContext, volume, Boolean(summary.is_tie));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isFrozen, summary.is_tie]);

  if (isFrozen) {
    return (
      <div className="vote-phase-reveal frozen" role="status">
        <div className="reveal-tension-backdrop" aria-hidden="true">
          <span className="reveal-tension-ring ring-a" />
          <span className="reveal-tension-ring ring-b" />
          <span className="reveal-tension-ring ring-c" />
          <span className="reveal-tension-scan" />
        </div>
        <h2 className="tension-text glitch-effect">{pick('กำลังตัดสินผลโหวต...', 'CALCULATING RESULTS...')}</h2>
      </div>
    );
  }

  return (
    <div className="vote-phase-reveal resolved">
      <div className="reveal-impact-burst" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="reveal-impact-shard" style={{ '--impact-index': index }} />
        ))}
      </div>
      <h2 className="reveal-title effect-pop">
        {summary.is_tie
          ? pick('TIE BREAKER!', 'TIE BREAKER!')
          : pick(`TRACK ${isAWin ? 'A' : 'B'} WINS!`, `TRACK ${isAWin ? 'A' : 'B'} WINS!`)}
      </h2>
      <div className="faceoff-arena reveal-arena">
        <div className={`faceoff-side side-a ${isAWin ? 'winner-scale' : 'loser-dim'}`}>
          <div className="faceoff-card">
            {songA?.coverUrl && <img src={songA.coverUrl} alt={songA.songTitle || 'Track A'} />}
            {!isAWin ? <div className="out-stamp" aria-hidden="true">OUT</div> : null}
          </div>
          <div className="reveal-score score-a">{songAVotes}</div>
        </div>

        <div className="faceoff-vs reveal-vs" aria-hidden="true">-</div>

        <div className={`faceoff-side side-b ${isBWin ? 'winner-scale' : 'loser-dim'}`}>
          <div className="faceoff-card">
            {songB?.coverUrl && <img src={songB.coverUrl} alt={songB.songTitle || 'Track B'} />}
            {!isBWin ? <div className="out-stamp" aria-hidden="true">OUT</div> : null}
          </div>
          <div className="reveal-score score-b">{songBVotes}</div>
        </div>
      </div>
    </div>
  );
}

export function ChampionShowcase({ championId, allSongs, onRematch, pick, isHost }) {
  const champion = allSongs[championId];
  const isYouTubeChampion = champion?.provider === 'youtube' && Boolean(champion?.providerMediaId);
  const [audioCtx] = useState(() => typeof window !== 'undefined' && window.AudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null);
  const champVideoRef = useRef(null);

  useEffect(() => {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    playPartyWinAlert(audioCtx, readPartyAudioVolume());
  }, [audioCtx]);

  useEffect(() => {
    const video = champVideoRef.current;
    if (!video) {
      return;
    }

    const savedVolume = readPartyAudioVolume();
    video.volume = Math.max(0, Math.min(1, savedVolume / 100));
    video.muted = savedVolume <= 0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.warn('Autoplay with sound blocked on champion. Trying muted...', error);
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, []);

  return (
    <div className="vote-phase-champion hero-aurora">
      <div className="champion-backdrop" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="champion-backdrop-burst" />
        ))}
      </div>
      <div className="champion-fireworks" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="champion-firework" style={{ '--spark-index': index }} />
        ))}
      </div>
      <div className="champion-header">
        <h1>{pick('ULTIMATE CHAMPION', 'ULTIMATE CHAMPION')}</h1>
        <p className="champion-subtitle">{pick('เพลงสุดท้ายที่ยืนอยู่ในแบทเทิลนี้', 'The last track standing in this battle')}</p>
      </div>
      <div className="champion-card shine-effect">
        {isYouTubeChampion ? (
          <div className="champion-media-frame">
            <PartyYouTubePlayer
              key={`yt-champion-${champion.providerMediaId}`}
              videoId={champion.providerMediaId}
              playing
              seekOffsetSec={0}
              volume={readPartyAudioVolume()}
              muted={readPartyAudioVolume() <= 0}
              className="champion-cover-video"
            />
          </div>
        ) : champion?.mediaUrl ? (
          <div className="champion-media-frame">
            <video ref={champVideoRef} src={champion.mediaUrl} loop playsInline controls className="champion-cover-video" />
          </div>
        ) : champion?.coverUrl ? (
          <div className="champion-media-frame">
            <img src={champion.coverUrl} alt="Cover" className="champion-cover" />
          </div>
        ) : null}
        <h2>{champion?.songTitle || 'Undisputed Track'}</h2>
        <h3>{champion?.sourceTitleName || 'Source'}</h3>
        <p>{champion?.artistName || 'Artist'}</p>
      </div>
      {isHost ? (
        <button className="rematch-btn mt-6" onClick={onRematch}>
          {pick('เริ่มใหม่ (Rematch)', 'Rematch')}
        </button>
      ) : null}
    </div>
  );
}
