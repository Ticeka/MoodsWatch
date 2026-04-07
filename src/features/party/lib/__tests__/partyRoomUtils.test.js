import { describe, expect, it } from 'vitest';
import {
  getPartyBufferedPreviewMs,
  getPartyPrefetchPreloadValue,
  getPartyPlaybackLeadBufferMs,
  getPartyPrefetchRound,
  isPartyPlaybackReady,
  shouldPartyForceMediaLoad,
} from '../partyRoomUtils.js';

describe('partyRoomUtils', () => {
  it('calculates buffered preview time from the active range', () => {
    const bufferedMs = getPartyBufferedPreviewMs([[5, 15]], 6, 5, 8000);
    expect(bufferedMs).toBe(7000);
  });

  it('caps buffered preview time at the preview end', () => {
    const bufferedMs = getPartyBufferedPreviewMs([[5, 30]], 5, 5, 4000);
    expect(bufferedMs).toBe(4000);
  });

  it('returns zero when current time is outside all buffered ranges', () => {
    const bufferedMs = getPartyBufferedPreviewMs([[0, 3], [8, 9]], 5, 5, 6000);
    expect(bufferedMs).toBe(0);
  });

  it('keeps a small lead buffer target instead of waiting for the entire clip', () => {
    expect(getPartyPlaybackLeadBufferMs(12000)).toBe(1400);
    expect(getPartyPlaybackLeadBufferMs(4000)).toBe(480);
  });

  it('allows playback as soon as media has enough data to start', () => {
    expect(isPartyPlaybackReady({
      bufferedPreviewMs: 0,
      previewDurationMs: 12000,
      readyState: 2,
    })).toBe(true);

    expect(isPartyPlaybackReady({
      bufferedPreviewMs: 300,
      previewDurationMs: 12000,
      readyState: 1,
    })).toBe(false);
  });

  it('prefetches the current round during countdown', () => {
    const match = {
      phase: 'countdown',
      roundIndex: 1,
      rounds: [
        { id: 'round-1' },
        { id: 'round-2' },
        { id: 'round-3' },
      ],
    };

    expect(getPartyPrefetchRound(match)).toEqual({ id: 'round-2' });
  });

  it('prefetches the next round during reveal once the reveal media is already underway', () => {
    const match = {
      phase: 'reveal',
      roundIndex: 0,
      rounds: [
        { id: 'round-1' },
        { id: 'round-2' },
      ],
    };

    expect(getPartyPrefetchRound(match, { revealPrefetchReady: false })).toBeNull();
    expect(getPartyPrefetchRound(match, { revealPrefetchReady: true })).toEqual({ id: 'round-2' });
  });

  it('uses aggressive preload only during countdown prefetch', () => {
    expect(getPartyPrefetchPreloadValue('countdown')).toBe('auto');
    expect(getPartyPrefetchPreloadValue('reveal')).toBe('auto');
    expect(getPartyPrefetchPreloadValue('question')).toBe('metadata');
  });

  it('forces media load only when the source changed or media is not ready yet', () => {
    expect(shouldPartyForceMediaLoad('', 'https://cdn.example.com/clip.mp4', 0)).toBe(true);
    expect(shouldPartyForceMediaLoad('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.mp4', 4)).toBe(false);
    expect(shouldPartyForceMediaLoad('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip.mp4', 1)).toBe(true);
    expect(shouldPartyForceMediaLoad('https://cdn.example.com/other.mp4', 'https://cdn.example.com/clip.mp4', 4)).toBe(true);
  });
});
