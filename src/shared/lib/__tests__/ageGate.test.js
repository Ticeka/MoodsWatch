import { describe, expect, it } from 'vitest';
import {
  filterDecksForAgeGate,
  filterTitlesForAgeGate,
  matchesAgeGateMode,
  matchesDeckAgeGateMode,
} from '../ageGate.js';

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

describe('matchesDeckAgeGateMode', () => {
  it('treats decks with adult titles as 18+ decks', () => {
    expect(matchesDeckAgeGateMode({ titles: [{ id: 1, is_adult: true }] }, true)).toBe(true);
    expect(matchesDeckAgeGateMode({ titles: [{ id: 1, is_adult: true }] }, false)).toBe(false);
  });

  it('treats decks without adult titles as normal decks', () => {
    expect(matchesDeckAgeGateMode({ titles: [{ id: 1, is_adult: false }] }, false)).toBe(true);
    expect(matchesDeckAgeGateMode({ titles: [{ id: 1, is_adult: false }] }, true)).toBe(false);
  });

  it('uses the title lookup when the deck only has ids', () => {
    const titleLookup = new Map([
      [1, { id: 1, is_adult: true }],
      [2, { id: 2, is_adult: false }],
    ]);

    expect(matchesDeckAgeGateMode({ titleIds: [1, 2] }, true, titleLookup)).toBe(true);
    expect(matchesDeckAgeGateMode({ titleIds: [1, 2] }, false, titleLookup)).toBe(false);
  });
});

describe('filterDecksForAgeGate', () => {
  const decks = [
    { id: 'safe', titles: [{ id: 1, is_adult: false }] },
    { id: 'adult', titles: [{ id: 2, is_adult: true }] },
    { id: 'mixed', titles: [{ id: 3, is_adult: false }, { id: 4, is_adult: true }] },
  ];

  it('keeps only non-adult decks when 18+ mode is off', () => {
    expect(filterDecksForAgeGate(decks, false).map((deck) => deck.id)).toEqual(['safe']);
  });

  it('keeps decks with adult titles when 18+ mode is on', () => {
    expect(filterDecksForAgeGate(decks, true).map((deck) => deck.id)).toEqual(['adult', 'mixed']);
  });
});
