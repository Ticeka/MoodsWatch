/**
 * Tests for discoverSearchState.js
 *
 * All functions that touch localStorage are tested with an in-memory stub so
 * the suite runs cleanly in the Node/jsdom environment used by Vitest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_RECENT_SEARCHES,
  MAX_SAVED_SEARCHES,
  areSearchPresetsEqual,
  clearRecentSearches,
  clearSavedSearches,
  hasSeededSavedSearches,
  markSavedSearchesSeeded,
  normalizeSavedSearches,
  readRecentSearches,
  readSavedSearches,
  removeRecentSearch,
  sanitizeRecentSearch,
  sanitizeSavedSearch,
  sortSavedSearches,
  writeSavedSearches,
  writeRecentSearches,
} from '../discoverSearchState';

// ── localStorage stub ──────────────────────────────────────────────────────

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store,
  };
}

let mockStorage;

beforeEach(() => {
  mockStorage = createMockLocalStorage();
  vi.stubGlobal('window', { localStorage: mockStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── sanitizeRecentSearch ───────────────────────────────────────────────────

describe('sanitizeRecentSearch', () => {
  it('returns trimmed string for a valid term', () => {
    expect(sanitizeRecentSearch('  Frieren  ')).toBe('Frieren');
  });

  it('returns empty string for a single-character term', () => {
    expect(sanitizeRecentSearch('a')).toBe('');
  });

  it('returns empty string for blank input', () => {
    expect(sanitizeRecentSearch('   ')).toBe('');
    expect(sanitizeRecentSearch('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeRecentSearch(null)).toBe('');
    expect(sanitizeRecentSearch(undefined)).toBe('');
  });

  it('accepts exactly 2-character term', () => {
    expect(sanitizeRecentSearch('HX')).toBe('HX');
  });

  it('coerces numbers to string', () => {
    expect(sanitizeRecentSearch(42)).toBe('42');
  });
});

// ── writeRecentSearches / readRecentSearches ───────────────────────────────

describe('writeRecentSearches + readRecentSearches', () => {
  it('round-trips a list of terms', () => {
    writeRecentSearches(['Frieren', 'Naruto', 'Bleach']);
    expect(readRecentSearches()).toEqual(['Frieren', 'Naruto', 'Bleach']);
  });

  it('trims whitespace and drops single-char terms on write', () => {
    const result = writeRecentSearches(['  Bleach  ', 'x', 'One Piece']);
    expect(result).toEqual(['Bleach', 'One Piece']);
  });

  it(`caps stored list at MAX_RECENT_SEARCHES (${MAX_RECENT_SEARCHES})`, () => {
    const long = Array.from({ length: MAX_RECENT_SEARCHES + 5 }, (_, i) => `title-${i}`);
    const result = writeRecentSearches(long);
    expect(result).toHaveLength(MAX_RECENT_SEARCHES);
  });

  it('returns empty array when storage is empty', () => {
    expect(readRecentSearches()).toEqual([]);
  });

  it('returns empty array when stored JSON is corrupted', () => {
    mockStorage.setItem('moodswatch-discover-recent-searches', '{bad json');
    expect(readRecentSearches()).toEqual([]);
  });

  it('returns empty array when stored value is not an array', () => {
    mockStorage.setItem('moodswatch-discover-recent-searches', '"just a string"');
    expect(readRecentSearches()).toEqual([]);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(() => writeRecentSearches(['Frieren'])).not.toThrow();
    expect(readRecentSearches()).toEqual([]);
  });

  it('does not throw when setItem throws (quota exceeded)', () => {
    mockStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => writeRecentSearches(['Frieren'])).not.toThrow();
  });
});

// ── removeRecentSearch ─────────────────────────────────────────────────────

describe('removeRecentSearch', () => {
  beforeEach(() => {
    writeRecentSearches(['Frieren', 'Naruto', 'Bleach']);
  });

  it('removes a matching term (case-insensitive)', () => {
    const result = removeRecentSearch('NARUTO');
    expect(result).toEqual(['Frieren', 'Bleach']);
  });

  it('removes an exact-match term', () => {
    const result = removeRecentSearch('Frieren');
    expect(result).not.toContain('Frieren');
  });

  it('is a no-op for a term not in the list', () => {
    const result = removeRecentSearch('One Piece');
    expect(result).toHaveLength(3);
  });

  it('is a no-op for blank input', () => {
    const result = removeRecentSearch('');
    expect(result).toHaveLength(3);
  });
});

// ── clearRecentSearches ────────────────────────────────────────────────────

describe('clearRecentSearches', () => {
  it('removes all stored recent searches', () => {
    writeRecentSearches(['Frieren', 'Naruto']);
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });

  it('does not throw when storage is already empty', () => {
    expect(() => clearRecentSearches()).not.toThrow();
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(() => clearRecentSearches()).not.toThrow();
  });
});

// ── sanitizeSavedSearch ────────────────────────────────────────────────────

describe('sanitizeSavedSearch', () => {
  it('replaces legacy non-uuid ids with uuid-safe ids', () => {
    const result = sanitizeSavedSearch({
      id: 'starter-frieren',
      query: 'Frieren',
      scope: 'titles',
      titleType: 'anime',
    });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.id).not.toBe('starter-frieren');
  });

  it('keeps valid uuid ids intact', () => {
    const existingId = '550e8400-e29b-41d4-a716-446655440000';
    const result = sanitizeSavedSearch({
      id: existingId,
      query: 'Frieren',
      scope: 'titles',
      titleType: 'anime',
    });

    expect(result.id).toBe(existingId);
  });

  it('returns null for null/undefined input', () => {
    expect(sanitizeSavedSearch(null)).toBeNull();
    expect(sanitizeSavedSearch(undefined)).toBeNull();
    expect(sanitizeSavedSearch('string')).toBeNull();
  });

  it('returns null for an entry with no meaningful filters', () => {
    // Empty query, no tag, scope=all, titleType=all → useless, should be null
    expect(sanitizeSavedSearch({ query: '', scope: 'all', titleType: 'all' })).toBeNull();
  });

  it('accepts tag-only saved searches', () => {
    const result = sanitizeSavedSearch({ query: '', tag: 'action', scope: 'titles', titleType: 'all' });
    expect(result).not.toBeNull();
    expect(result.tag).toBe('action');
  });

  it('normalises tag to lowercase and trims it', () => {
    const result = sanitizeSavedSearch({ query: 'q', tag: '  Action  ', scope: 'titles' });
    expect(result.tag).toBe('action');
  });

  it('falls back to scope="all" for unrecognised scope value', () => {
    const result = sanitizeSavedSearch({ query: 'test', scope: 'invalid-scope' });
    expect(result.scope).toBe('all');
  });

  it('falls back to titleType="all" for unrecognised titleType', () => {
    const result = sanitizeSavedSearch({ query: 'test', scope: 'titles', titleType: 'unknown' });
    expect(result.titleType).toBe('all');
  });

  it('ignores titleType when scope is people (non-title scope)', () => {
    // titleType should fall back to 'all' since people scope doesn't support title filters
    const result = sanitizeSavedSearch({ query: 'alice', scope: 'people', titleType: 'anime' });
    expect(result.titleType).toBe('all');
  });

  it('preserves pinned flag as boolean', () => {
    expect(sanitizeSavedSearch({ query: 'q', pinned: 1 }).pinned).toBe(true);
    expect(sanitizeSavedSearch({ query: 'q', pinned: false }).pinned).toBe(false);
  });

  it('defaults position to 0 for non-numeric position', () => {
    const result = sanitizeSavedSearch({ query: 'q', position: 'banana' });
    expect(result.position).toBe(0);
  });

  it('preserves numeric position', () => {
    const result = sanitizeSavedSearch({ query: 'q', position: 3 });
    expect(result.position).toBe(3);
  });
});

// ── sortSavedSearches ──────────────────────────────────────────────────────

describe('sortSavedSearches', () => {
  it('puts pinned items before unpinned items', () => {
    const items = [
      { id: 'a', query: 'alpha', pinned: false, position: 0, label: '', tag: '' },
      { id: 'b', query: 'beta', pinned: true, position: 1, label: '', tag: '' },
    ];
    const sorted = sortSavedSearches(items);
    expect(sorted[0].id).toBe('b');
  });

  it('sorts by position within the same pinned group', () => {
    const items = [
      { id: 'a', query: 'alpha', pinned: true, position: 2, label: '', tag: '' },
      { id: 'b', query: 'beta', pinned: true, position: 0, label: '', tag: '' },
      { id: 'c', query: 'gamma', pinned: true, position: 1, label: '', tag: '' },
    ];
    const sorted = sortSavedSearches(items);
    expect(sorted.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to alphabetical label sort when position is equal', () => {
    const items = [
      { id: 'z', label: 'Zzz', query: '', pinned: false, position: 0, tag: '' },
      { id: 'a', label: 'Aaa', query: '', pinned: false, position: 0, tag: '' },
    ];
    const sorted = sortSavedSearches(items);
    expect(sorted[0].id).toBe('a');
  });

  it('returns a new array (does not mutate input)', () => {
    const items = [{ id: 'x', query: 'x', pinned: false, position: 0, label: '', tag: '' }];
    const sorted = sortSavedSearches(items);
    expect(sorted).not.toBe(items);
  });

  it('returns empty array for empty input', () => {
    expect(sortSavedSearches([])).toEqual([]);
  });
});

// ── normalizeSavedSearches ─────────────────────────────────────────────────

describe('normalizeSavedSearches', () => {
  it(`caps the list at MAX_SAVED_SEARCHES (${MAX_SAVED_SEARCHES})`, () => {
    const many = Array.from({ length: MAX_SAVED_SEARCHES + 4 }, (_, i) => ({
      query: `query-${i}`,
      scope: 'all',
    }));
    const result = normalizeSavedSearches(many);
    expect(result).toHaveLength(MAX_SAVED_SEARCHES);
  });

  it('drops invalid entries (null returns from sanitizeSavedSearch)', () => {
    const items = [
      null,
      { query: 'Frieren', scope: 'titles' },
      'invalid',
    ];
    const result = normalizeSavedSearches(items);
    expect(result).toHaveLength(1);
  });

  it('reassigns sequential positions starting from 0', () => {
    const items = [
      { query: 'Frieren', scope: 'titles', position: 99 },
      { query: 'Naruto', scope: 'titles', position: 50 },
    ];
    const result = normalizeSavedSearches(items);
    const positions = result.map((i) => i.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1]);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeSavedSearches('bad')).toEqual([]);
    expect(normalizeSavedSearches(null)).toEqual([]);
  });
});

// ── readSavedSearches / writeSavedSearches ─────────────────────────────────

describe('readSavedSearches + writeSavedSearches', () => {
  it('round-trips a list with userId scoping', () => {
    const userId = 'user-123';
    writeSavedSearches(userId, [{ query: 'Frieren', scope: 'titles', titleType: 'anime' }]);
    const result = readSavedSearches(userId);
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe('Frieren');
  });

  it('does not bleed between different user ids', () => {
    writeSavedSearches('user-a', [{ query: 'Frieren', scope: 'titles' }]);
    writeSavedSearches('user-b', [{ query: 'Naruto', scope: 'titles' }]);

    const a = readSavedSearches('user-a');
    const b = readSavedSearches('user-b');

    expect(a[0].query).toBe('Frieren');
    expect(b[0].query).toBe('Naruto');
  });

  it('returns empty array when no saved searches exist for a user', () => {
    expect(readSavedSearches('unknown-user')).toEqual([]);
  });

  it('returns empty array when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(readSavedSearches('user-x')).toEqual([]);
  });

  it('returns empty array when stored JSON is corrupted', () => {
    mockStorage.setItem('moodswatch-discover-saved-searches:user-y', '{{corrupt');
    expect(readSavedSearches('user-y')).toEqual([]);
  });

  it('does not throw when setItem throws on write', () => {
    mockStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => writeSavedSearches('user-z', [{ query: 'x', scope: 'titles' }])).not.toThrow();
  });
});

// ── clearSavedSearches ─────────────────────────────────────────────────────

describe('clearSavedSearches', () => {
  it('removes saved searches for the given user', () => {
    writeSavedSearches('user-1', [{ query: 'Frieren', scope: 'titles' }]);
    clearSavedSearches('user-1');
    expect(readSavedSearches('user-1')).toEqual([]);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(() => clearSavedSearches('user-2')).not.toThrow();
  });
});

// ── hasSeededSavedSearches / markSavedSearchesSeeded ──────────────────────

describe('hasSeededSavedSearches + markSavedSearchesSeeded', () => {
  it('returns false before seeding', () => {
    expect(hasSeededSavedSearches('user-seed')).toBe(false);
  });

  it('returns true after marking as seeded', () => {
    markSavedSearchesSeeded('user-seed');
    expect(hasSeededSavedSearches('user-seed')).toBe(true);
  });

  it('is scoped per userId (does not bleed between users)', () => {
    markSavedSearchesSeeded('user-a');
    expect(hasSeededSavedSearches('user-b')).toBe(false);
  });

  it('returns false when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(hasSeededSavedSearches('user-x')).toBe(false);
  });

  it('does not throw when localStorage is unavailable on mark', () => {
    vi.stubGlobal('window', undefined);
    expect(() => markSavedSearchesSeeded('user-x')).not.toThrow();
  });
});

// ── areSearchPresetsEqual ──────────────────────────────────────────────────

describe('areSearchPresetsEqual', () => {
  const base = { query: 'Frieren', scope: 'titles', titleType: 'anime', tag: '' };

  it('returns true for identical presets', () => {
    expect(areSearchPresetsEqual(base, { ...base })).toBe(true);
  });

  it('is case-insensitive on query', () => {
    expect(areSearchPresetsEqual(base, { ...base, query: 'FRIEREN' })).toBe(true);
  });

  it('returns false when scope differs', () => {
    expect(areSearchPresetsEqual(base, { ...base, scope: 'posts' })).toBe(false);
  });

  it('returns false when titleType differs', () => {
    expect(areSearchPresetsEqual(base, { ...base, titleType: 'manga' })).toBe(false);
  });

  it('returns false when tag differs', () => {
    expect(areSearchPresetsEqual(base, { ...base, tag: 'action' })).toBe(false);
  });

  it('returns false when query differs', () => {
    expect(areSearchPresetsEqual(base, { ...base, query: 'Naruto' })).toBe(false);
  });

  it('returns false when either argument is null/undefined', () => {
    expect(areSearchPresetsEqual(null, base)).toBe(false);
    expect(areSearchPresetsEqual(base, undefined)).toBe(false);
    expect(areSearchPresetsEqual(null, null)).toBe(false);
  });
});

// ── unauthenticated user (userId = null) ───────────────────────────────────

describe('unauthenticated user (no userId)', () => {
  it('reads and writes saved searches without userId', () => {
    writeSavedSearches(null, [{ query: 'Frieren', scope: 'titles' }]);
    expect(readSavedSearches(null)).toHaveLength(1);
  });

  it('scopes seed flag correctly for null userId', () => {
    markSavedSearchesSeeded(null);
    expect(hasSeededSavedSearches(null)).toBe(true);
  });

  it('anon and authed users do not share saved searches', () => {
    writeSavedSearches(null, [{ query: 'anon-query', scope: 'titles' }]);
    writeSavedSearches('user-123', [{ query: 'authed-query', scope: 'titles' }]);

    expect(readSavedSearches(null)[0].query).toBe('anon-query');
    expect(readSavedSearches('user-123')[0].query).toBe('authed-query');
  });
});
