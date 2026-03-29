import { describe, expect, it } from 'vitest';
import { getPartyBufferedPreviewMs } from '../../pages/partyRoomUtils.js';

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
});
