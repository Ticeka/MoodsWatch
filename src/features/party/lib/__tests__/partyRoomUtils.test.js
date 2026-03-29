import { describe, expect, it } from 'vitest';
import {
  getPartyBufferedPreviewMs,
  getPartyPlaybackLeadBufferMs,
  getPartyPrefetchRound,
  isPartyPlaybackReady,
} from '../../pages/partyRoomUtils.js';

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
});
