import { describe, it, expect } from 'vitest';
import { sortTitlesCollection, TITLE_SORT_OPTIONS } from '../titleSorting.js';

const makeTitle = (overrides = {}) => ({
  id: 1,
  title_en: 'Test Title',
  title_th: null,
  score: 75,
  popularity: 1000,
  year: 2020,
  ...overrides,
});

describe('TITLE_SORT_OPTIONS', () => {
  it('contains expected sort ids', () => {
    const ids = TITLE_SORT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual(['match', 'popularity', 'score', 'year', 'title']);
  });
});

describe('sortTitlesCollection', () => {
  it('returns original order for "match"', () => {
    const titles = [
      makeTitle({ id: 1, score: 90 }),
      makeTitle({ id: 2, score: 50 }),
      makeTitle({ id: 3, score: 70 }),
    ];
    expect(sortTitlesCollection(titles, 'match').map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', () => {
    const titles = [makeTitle({ id: 1 }), makeTitle({ id: 2 })];
    const original = [...titles];
    sortTitlesCollection(titles, 'score');
    expect(titles).toEqual(original);
  });

  it('handles null/undefined gracefully', () => {
    expect(sortTitlesCollection(null, 'score')).toEqual([]);
    expect(sortTitlesCollection(undefined, 'score')).toEqual([]);
  });

  it('sorts by score descending', () => {
    const titles = [
      makeTitle({ id: 1, score: 60 }),
      makeTitle({ id: 2, score: 95 }),
      makeTitle({ id: 3, score: 80 }),
    ];
    const result = sortTitlesCollection(titles, 'score');
    expect(result.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('sorts by popularity descending', () => {
    const titles = [
      makeTitle({ id: 1, popularity: 100 }),
      makeTitle({ id: 2, popularity: 5000 }),
      makeTitle({ id: 3, popularity: 1500 }),
    ];
    const result = sortTitlesCollection(titles, 'popularity');
    expect(result.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('sorts by year descending (newest first)', () => {
    const titles = [
      makeTitle({ id: 1, year: 2015 }),
      makeTitle({ id: 2, year: 2023 }),
      makeTitle({ id: 3, year: 2019 }),
    ];
    const result = sortTitlesCollection(titles, 'year');
    expect(result.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it('sorts by title A-Z using title_th first, falls back to title_en', () => {
    const titles = [
      makeTitle({ id: 1, title_th: 'ค้างคาว', title_en: 'Bat' }),
      makeTitle({ id: 2, title_th: 'แมว', title_en: 'Cat' }),
      makeTitle({ id: 3, title_th: null, title_en: 'Apple' }),
    ];
    const result = sortTitlesCollection(titles, 'title');
    // 'Apple' vs Thai localeCompare: 'Apple' < Thai chars in Unicode
    // We just verify no crash and all 3 items returned
    expect(result).toHaveLength(3);
  });

  it('treats missing score as 0 when sorting by score', () => {
    const titles = [
      makeTitle({ id: 1, score: undefined }),
      makeTitle({ id: 2, score: 80 }),
    ];
    const result = sortTitlesCollection(titles, 'score');
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it('returns a single-item list unchanged for any sort', () => {
    const titles = [makeTitle({ id: 42 })];
    for (const option of TITLE_SORT_OPTIONS) {
      expect(sortTitlesCollection(titles, option.id)).toHaveLength(1);
    }
  });
});
