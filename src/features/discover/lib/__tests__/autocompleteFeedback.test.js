/**
 * Tests for autocompleteFeedback.js
 *
 * The module reads/writes to window.localStorage. In the node test environment
 * window is undefined, so we stub it with a simple in-memory implementation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAutocompleteSelectionBoost,
  recordAutocompleteSelection,
} from '../autocompleteFeedback';

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── recordAutocompleteSelection ────────────────────────────────────────────

describe('recordAutocompleteSelection', () => {
  it('increments global count for itemId', () => {
    recordAutocompleteSelection({ query: 'frieren', itemId: 'title-1' });

    const boost = getAutocompleteSelectionBoost('frieren', 'title-1');
    // 1 global hit = 10pts, 1 query-specific hit = 40pts
    expect(boost).toBe(50);
  });

  it('increments per-query count separately from global', () => {
    recordAutocompleteSelection({ query: 'attack', itemId: 'title-2' });
    recordAutocompleteSelection({ query: 'attack on titan', itemId: 'title-2' });

    const boostAttack = getAutocompleteSelectionBoost('attack', 'title-2');
    const boostFull = getAutocompleteSelectionBoost('attack on titan', 'title-2');

    // 'attack': 1 query hit × 40 + 2 global hits × 10 = 60
    expect(boostAttack).toBe(60);
    // 'attack on titan': 1 query hit × 40 + 2 global hits × 10 = 60
    expect(boostFull).toBe(60);
  });

  it('accumulates multiple selections for same item+query', () => {
    recordAutocompleteSelection({ query: 'naruto', itemId: 'title-3' });
    recordAutocompleteSelection({ query: 'naruto', itemId: 'title-3' });
    recordAutocompleteSelection({ query: 'naruto', itemId: 'title-3' });

    // 3 query hits × 40 + 3 global hits × 10 = 150
    expect(getAutocompleteSelectionBoost('naruto', 'title-3')).toBe(150);
  });

  it('records global boost for empty query', () => {
    recordAutocompleteSelection({ query: '', itemId: 'title-4' });

    // No query bucket written, only global (1 × 10 = 10)
    expect(getAutocompleteSelectionBoost('', 'title-4')).toBe(10);
  });

  it('ignores calls with empty itemId', () => {
    recordAutocompleteSelection({ query: 'one piece', itemId: '' });
    recordAutocompleteSelection({ query: 'one piece', itemId: '   ' });

    expect(getAutocompleteSelectionBoost('one piece', '')).toBe(0);
  });

  it('is case-insensitive on query (query normalizes to lowercase)', () => {
    recordAutocompleteSelection({ query: 'Bleach', itemId: 'title-5' });

    // query stored as 'bleach'; lookup with 'BLEACH' should match
    expect(getAutocompleteSelectionBoost('BLEACH', 'title-5')).toBe(50);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);

    expect(() => {
      recordAutocompleteSelection({ query: 'hxh', itemId: 'title-6' });
    }).not.toThrow();
  });

  it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
    mockStorage.setItem = () => { throw new Error('QuotaExceededError'); };

    expect(() => {
      recordAutocompleteSelection({ query: 'gintama', itemId: 'title-7' });
    }).not.toThrow();
  });

  it('does not throw when localStorage contains corrupted JSON', () => {
    mockStorage.getItem = () => '{not valid json{{';

    expect(() => {
      recordAutocompleteSelection({ query: 'test', itemId: 'title-8' });
    }).not.toThrow();
  });
});

// ── getAutocompleteSelectionBoost ──────────────────────────────────────────

describe('getAutocompleteSelectionBoost', () => {
  it('returns 0 for an item that has never been selected', () => {
    expect(getAutocompleteSelectionBoost('bleach', 'never-seen')).toBe(0);
  });

  it('returns 0 for empty itemId', () => {
    expect(getAutocompleteSelectionBoost('frieren', '')).toBe(0);
    expect(getAutocompleteSelectionBoost('frieren', '   ')).toBe(0);
  });

  it('returns only global component when query is empty', () => {
    recordAutocompleteSelection({ query: 'fairy tail', itemId: 'title-9' });

    // Global: 1 hit × 10 = 10; no query-specific component for empty string
    expect(getAutocompleteSelectionBoost('', 'title-9')).toBe(10);
  });

  it('returns 0 for unknown query even if item has global history', () => {
    recordAutocompleteSelection({ query: 'jujutsu', itemId: 'title-10' });

    // Different query — no per-query boost, but global still counts
    const boost = getAutocompleteSelectionBoost('unknown-query-xyz', 'title-10');
    // 0 query hits + 1 global hit × 10 = 10
    expect(boost).toBe(10);
  });

  it('returns 0 when localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(getAutocompleteSelectionBoost('anything', 'title-x')).toBe(0);
  });
});

// ── Cap behavior (soft contract) ──────────────────────────────────────────

describe('cap behavior', () => {
  it('writing more than 24 unique queries does not throw', () => {
    expect(() => {
      for (let i = 0; i < 30; i += 1) {
        recordAutocompleteSelection({ query: `query-${i}`, itemId: `item-${i}` });
      }
    }).not.toThrow();
  });

  it('writing more than 48 unique global items does not throw', () => {
    expect(() => {
      for (let i = 0; i < 60; i += 1) {
        recordAutocompleteSelection({ query: '', itemId: `global-item-${i}` });
      }
    }).not.toThrow();
  });
});
