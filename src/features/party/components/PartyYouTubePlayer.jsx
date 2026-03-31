import React, { useEffect, useRef, useCallback, useState } from 'react';

/**
 * PartyYouTubePlayer
 *
 * Wraps the YouTube IFrame API for use in the party game runtime.
 *
 * Design contract:
 *   • Does NOT own game phase timing — it just plays/pauses/seeks on command.
 *   • Calls onReady() when the player is loaded and ready.
 *   • Calls onError(code) when playback fails (blocked/private/region-lock).
 *   • Seeks to `seekOffsetSec` on load when provided (for late-joiners).
 *   • Calls onEnded() when natural end reached (optional).
 *
 * Props:
 *   videoId      {string}   YouTube video ID
 *   playing      {boolean}  true = play, false = pause
 *   seekOffsetSec{number}   start position in seconds (applied once on ready)
 *   muted        {boolean}  mute audio (default false)
 *   onReady      {function} () => void
 *   onError      {function} (errorCode: number) => void
 *   onEnded      {function} () => void
 *   className    {string}   extra CSS class on wrapper div
 */

const YT_PLAYER_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

let ytApiPromise = null;

function loadYouTubeIframeApi() {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    // Already loaded
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const callbackName = '__partyYtApiReady';
    window[callbackName] = () => {
      resolve(window.YT);
    };

    // If another script already set onYouTubeIframeAPIReady, chain it
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      window[callbackName]?.();
    };

    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

export function PartyYouTubePlayer({
  videoId,
  playing = false,
  seekOffsetSec = 0,
  muted = false,
  volume = 85,
  visualMode = 'visible',
  allowPointerEvents = true,
  onReady,
  onError,
  onEnded,
  className = '',
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const seekAppliedRef = useRef(false);
  const [playerState, setPlayerState] = useState('loading'); // loading | ready | error
  const normalizedVolume = Math.min(100, Math.max(0, Number(volume) || 0));

  const handleReady = useCallback((event) => {
    const player = event.target;
    playerRef.current = player;
    seekAppliedRef.current = false;

    player.setVolume(normalizedVolume);
    if (muted) player.mute();
    else player.unMute();

    if (seekOffsetSec > 0 && !seekAppliedRef.current) {
      player.seekTo(seekOffsetSec, true);
      seekAppliedRef.current = true;
    }

    if (playing) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }

    setPlayerState('ready');
    onReady?.(player);
  }, [muted, normalizedVolume, onReady, playing, seekOffsetSec]);

  const handleStateChange = useCallback((event) => {
    if (event.data === YT_PLAYER_STATES.ENDED) {
      onEnded?.();
    }
  }, [onEnded]);

  const handleError = useCallback((event) => {
    // YouTube error codes: 2=invalid id, 5=html5 error, 100=not found/private,
    // 101/150=embed not allowed
    setPlayerState('error');
    onError?.(event.data);
  }, [onError]);

  // Create/recreate player when videoId changes
  useEffect(() => {
    if (!videoId) return;

    let player = null;
    let destroyed = false;

    setPlayerState('loading');
    seekAppliedRef.current = false;

    loadYouTubeIframeApi().then((YT) => {
      if (destroyed || !containerRef.current) return;

      // Clear previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }

      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: playing ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,   // hide annotations
          modestbranding: 1,
          rel: 0,
          start: seekOffsetSec > 0 ? Math.floor(seekOffsetSec) : undefined,
        },
        events: {
          onReady: handleReady,
          onStateChange: handleStateChange,
          onError: handleError,
        },
      });

      playerRef.current = player;
    });

    return () => {
      destroyed = true;
      try { player?.destroy(); } catch { /* ignore */ }
      if (playerRef.current === player) playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Respond to playing prop changes after player is ready
  useEffect(() => {
    const player = playerRef.current;
    if (!player || playerState !== 'ready') return;

    if (playing) {
      player.playVideo();
    } else {
      player.pauseVideo();
    }
  }, [playing, playerState]);

  // Respond to muted prop changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || playerState !== 'ready') return;
    player.setVolume(normalizedVolume);
  }, [normalizedVolume, playerState]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || playerState !== 'ready') return;
    if (muted) player.mute();
    else player.unMute();
  }, [muted, playerState]);

  return (
    <div className={`party-yt-player-wrapper${allowPointerEvents ? '' : ' is-noninteractive'}${visualMode === 'hidden' ? ' is-visual-hidden' : ''}${className ? ` ${className}` : ''}`}>
      {/* YT API creates an iframe here */}
      <div ref={containerRef} className="party-yt-player-container" />

      {playerState === 'loading' && (
        <div className="party-yt-player-overlay party-yt-player-loading" aria-hidden="true">
          <div className="party-yt-spinner" />
        </div>
      )}

      {playerState === 'error' && (
        <div className="party-yt-player-overlay party-yt-player-error" aria-hidden="true">
          <span className="party-yt-error-icon">⚠</span>
        </div>
      )}
    </div>
  );
}

export default PartyYouTubePlayer;
