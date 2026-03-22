import { describe, expect, it } from 'vitest';
import { filterTitlesForAgeGate, matchesAgeGateMode } from '../ageGate.js';

describe('matchesAgeGateMode', () => {
  it('shows only non-adult titles when 18+ mode is off', () => {
    expect(matchesAgeGateMode({ is_adult: false }, false)).toBe(true);
    expect(matchesAgeGateMode({ is_adult: true }, false)).toBe(false);
  });

  it('shows only adult titles when 18+ mode is on', () => {
    expect(matchesAgeGateMode({ is_adult: true }, true)).toBe(true);
    expect(matchesAgeGateMode({ is_adult: false }, true)).toBe(false);
  });
});

describe('filterTitlesForAgeGate', () => {
  const titles = [
    { id: 1, is_adult: false },
    { id: 2, is_adult: true },
    { id: 3, is_adult: false },
  ];

  it('keeps only normal titles when 18+ mode is off', () => {
    expect(filterTitlesForAgeGate(titles, false).map((title) => title.id)).toEqual([1, 3]);
  });

  it('keeps only adult titles when 18+ mode is on', () => {
    expect(filterTitlesForAgeGate(titles, true).map((title) => title.id)).toEqual([2]);
  });
});
