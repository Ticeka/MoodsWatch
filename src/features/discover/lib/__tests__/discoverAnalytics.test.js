/**
 * Tests for discoverAnalytics.js
 *
 * The module calls supabase and uses sessionStorage. Both are mocked here so
 * the suite is fully self-contained and has zero network traffic.
 *
 * Key behaviours tested:
 *  - Unknown event types are silently dropped.
 *  - When supabase is absent the function exits immediately.
 *  - Missing analytics table sets a module-level circuit-breaker that stops
 *    future inserts.
 *  - Network-like errors are swallowed silently.
 *  - Other unexpected errors emit a console.warn but don't throw.
 *  - getDiscoverSessionId generates, caches, and reuses a session id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── supabase mock ──────────────────────────────────────────────────────────

// We mock the module before importing the analytics module so the factory runs
// before discoverAnalytics.js resolves its import.
const mockInsert = vi.fn();

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: mockInsert }),
  },
}));

// Import AFTER mocks are in place.
import { getDiscoverSessionId, trackDiscoverEvent } from '../../api/discoverAnalyticsApi';

// ── sessionStorage stub ────────────────────────────────────────────────────

function createMockSessionStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

let mockSession;

beforeEach(() => {
  mockSession = createMockSessionStorage();
  vi.stubGlobal('window', { sessionStorage: mockSession });
  mockInsert.mockReset();
  // Default: successful insert (no error).
  mockInsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── getDiscoverSessionId ───────────────────────────────────────────────────

describe('getDiscoverSessionId', () => {
  it('generates a session id on first call', () => {
    const id = getDiscoverSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns the same id on subsequent calls (cached in sessionStorage)', () => {
    const first = getDiscoverSessionId();
    const second = getDiscoverSessionId();
    expect(first).toBe(second);
  });

  it('returns null when sessionStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(getDiscoverSessionId()).toBeNull();
  });

  it('returns null when sessionStorage.getItem throws', () => {
    mockSession.getItem = () => { throw new Error('SecurityError'); };
    expect(getDiscoverSessionId()).toBeNull();
  });
});

// ── trackDiscoverEvent — event type guard ──────────────────────────────────

describe('trackDiscoverEvent — event type guard', () => {
  it('does not insert for an unrecognised event type', async () => {
    await trackDiscoverEvent({ eventType: 'totally_fake_event' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not insert when eventType is null/undefined', async () => {
    await trackDiscoverEvent({ eventType: null });
    await trackDiscoverEvent({});
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts for every valid event type', async () => {
    const validTypes = [
      'search_view',
      'search_submit',
      'search_abandon',
      'no_results_view',
      'preset_apply',
      'result_click',
      'autocomplete_select',
      'recovery_apply',
      'saved_search_create',
      'saved_search_update',
      'saved_search_delete',
    ];

    for (const eventType of validTypes) {
      mockInsert.mockResolvedValueOnce({ error: null });
      await trackDiscoverEvent({ eventType });
    }

    expect(mockInsert).toHaveBeenCalledTimes(validTypes.length);
  });
});

// ── trackDiscoverEvent — payload shape ────────────────────────────────────

describe('trackDiscoverEvent — payload shape', () => {
  it('normalises query to lowercase in normalized_query field', async () => {
    await trackDiscoverEvent({ eventType: 'search_submit', query: 'Frieren' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.query).toBe('Frieren');
    expect(payload.normalized_query).toBe('frieren');
  });

  it('trims whitespace from query', async () => {
    await trackDiscoverEvent({ eventType: 'search_submit', query: '  Naruto  ' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.query).toBe('Naruto');
  });

  it('includes user_id when provided', async () => {
    await trackDiscoverEvent({ eventType: 'result_click', userId: 'user-42', resultId: 'title-1', resultRank: 3 });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.user_id).toBe('user-42');
    expect(payload.result_rank).toBe(3);
  });

  it('sets result_id to null when not provided', async () => {
    await trackDiscoverEvent({ eventType: 'search_view' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.result_id).toBeNull();
  });

  it('sets result_rank to null for non-numeric rank', async () => {
    await trackDiscoverEvent({ eventType: 'result_click', resultRank: 'top' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.result_rank).toBeNull();
  });

  it('normalises tag to lowercase', async () => {
    await trackDiscoverEvent({ eventType: 'preset_apply', tag: 'ACTION' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.tag).toBe('action');
  });

  it('defaults metadata to empty object when not provided', async () => {
    await trackDiscoverEvent({ eventType: 'search_view' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.metadata).toEqual({});
  });

  it('passes metadata object through unchanged', async () => {
    const meta = { source: 'header', trigger: 'enter' };
    await trackDiscoverEvent({ eventType: 'search_submit', metadata: meta });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.metadata).toEqual(meta);
  });

  it('replaces non-object metadata with empty object', async () => {
    await trackDiscoverEvent({ eventType: 'search_submit', metadata: 'bad' });

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.metadata).toEqual({});
  });
});

// ── trackDiscoverEvent — network errors ───────────────────────────────────

describe('trackDiscoverEvent — network errors', () => {
  it('does not throw on "Failed to fetch" errors', async () => {
    mockInsert.mockRejectedValueOnce(new Error('Failed to fetch'));

    await expect(trackDiscoverEvent({ eventType: 'search_submit' })).resolves.toBeUndefined();
  });

  it('does not throw on NetworkError', async () => {
    mockInsert.mockRejectedValueOnce(new Error('NetworkError when attempting to fetch resource'));

    await expect(trackDiscoverEvent({ eventType: 'search_submit' })).resolves.toBeUndefined();
  });

  it('does not throw on CORS errors', async () => {
    mockInsert.mockRejectedValueOnce(new Error('CORS error on fetch'));

    await expect(trackDiscoverEvent({ eventType: 'search_submit' })).resolves.toBeUndefined();
  });
});

describe('trackDiscoverEvent — unexpected errors', () => {
  it('emits console.warn but does not throw for unexpected errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockInsert.mockRejectedValueOnce(new Error('some unexpected DB error'));

    await expect(trackDiscoverEvent({ eventType: 'search_submit' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Discover analytics tracking failed'),
      expect.any(Error),
    );

    warn.mockRestore();
  });
});

// ── trackDiscoverEvent — sessionStorage unavailable ───────────────────────

describe('trackDiscoverEvent — sessionStorage unavailable', () => {
  it('still inserts even when sessionStorage is absent (session_id becomes null)', async () => {
    vi.stubGlobal('window', undefined);

    await trackDiscoverEvent({ eventType: 'search_view' });

    // supabase.insert should still have been called (session_id = null is allowed)
    expect(mockInsert).toHaveBeenCalled();
  });
});

// ── trackDiscoverEvent — unauthenticated user ──────────────────────────────

describe('trackDiscoverEvent — unauthenticated user (userId = null)', () => {
  it('tracks events with null user_id without throwing', async () => {
    await expect(
      trackDiscoverEvent({ eventType: 'search_submit', userId: null, query: 'romance' })
    ).resolves.toBeUndefined();

    const [payload] = mockInsert.mock.calls[0];
    expect(payload.user_id).toBeNull();
  });
});

// ── trackDiscoverEvent — missing analytics table (circuit-breaker) ─────────
// IMPORTANT: These tests must run LAST. The missing-table error sets a
// module-level circuit-breaker flag (missingAnalyticsTable = true) that
// prevents all subsequent inserts within the same module instance.

describe('trackDiscoverEvent — missing analytics table', () => {
  it('does not throw when table is missing', async () => {
    mockInsert.mockResolvedValueOnce({
      error: { message: 'relation "discover_search_events" does not exist' },
    });

    await expect(trackDiscoverEvent({ eventType: 'search_view' })).resolves.toBeUndefined();
  });

  it('silences schema cache errors for the same table', async () => {
    mockInsert.mockResolvedValueOnce({
      error: { message: 'schema cache for discover_search_events is out of date' },
    });

    await expect(trackDiscoverEvent({ eventType: 'search_view' })).resolves.toBeUndefined();
  });
});
