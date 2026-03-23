import { describe, expect, it } from 'vitest';
import { MOODS, getMoodOptionsForAgeGate } from '../../../../shared/data/moods.js';

const explicitMoodIds = new Set(
  MOODS.filter((mood) => mood.matchMode === 'explicit').map((mood) => mood.id)
);

const EXPLICIT_MOOD_FALLBACKS = {
  'adult-ecchi': {
    tagKeywords: ['erotica', 'ecchi', 'fanservice', 'adult', 'mature'],
    textKeywords: ['erotic', 'naughty', 'sensual', 'one-night', 'heat', 'teasing', 'playful'],
  },
  'adult-flirty': {
    tagKeywords: ['romance', 'adult', 'mature', 'ecchi'],
    textKeywords: ['seductive', 'temptation', 'attraction', 'chemistry', 'desire', 'flirty', 'teasing', 'sensual'],
  },
  'adult-harem': {
    tagKeywords: ['harem', 'reverse harem'],
    textKeywords: ['harem', 'reverse harem', 'multiple lovers', 'many men', 'many women'],
  },
  'adult-romance': {
    tagKeywords: ['drama', 'romance', 'historical', 'reverse harem'],
    textKeywords: ['love', 'romance', 'romantic', 'marriage', 'married', 'wedding', 'bride', 'groom', 'husband', 'wife', 'dating', 'kiss', 'affair'],
  },
  'adult-forbidden': {
    tagKeywords: ['romance', 'drama', 'mature', 'adult'],
    textKeywords: ['forbidden', 'secret relationship', 'affair', 'scandal', 'cheat', 'cheating', 'taboo', 'hidden love'],
  },
  'adult-power-play': {
    tagKeywords: ['drama', 'romance', 'mature', 'adult'],
    textKeywords: ['ceo', 'boss', 'secretary', 'contract marriage', 'deal', 'power', 'dominant', 'workplace'],
  },
  'adult-obsession': {
    tagKeywords: ['psychological', 'romance', 'mature'],
    textKeywords: ['obsession', 'obsessed', 'possessive', 'fixated', 'clingy', 'stalker', "can't let go"],
  },
  'adult-dark': {
    tagKeywords: ['psychological', 'drama', 'thriller', 'horror'],
    textKeywords: ['revenge', 'curse', 'cursed', 'murder', 'kill', 'killer', 'obsession', 'obsessed', 'abuse', 'violent', 'violence', 'dark', 'secret', 'midnight', 'blood', 'blackmail', 'prison', 'trauma'],
  },
};

function getTitleSignalBag(title = {}) {
  const tags = [...(title.genres || []), ...(title.tags || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const text = [
    title.title_en,
    title.title_th,
    title.title_romaji,
    title.title_native,
    title.synopsis,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  return { tags, text };
}

function matchesExplicitMoodFallback(title, moodId) {
  if (!title?.is_adult) {
    return false;
  }

  if ((title.moods || []).includes(moodId)) {
    return true;
  }

  const fallback = EXPLICIT_MOOD_FALLBACKS[moodId];
  if (!fallback) {
    return false;
  }

  const { tags, text } = getTitleSignalBag(title);
  return fallback.tagKeywords.some((keyword) => tags.includes(keyword))
    || fallback.textKeywords.some((keyword) => text.includes(keyword));
}

function matchesMoodSelection(title, moodId) {
  if (!moodId) {
    return false;
  }

  return explicitMoodIds.has(moodId)
    ? matchesExplicitMoodFallback(title, moodId)
    : (title?.moods || []).includes(moodId);
}

describe('getMoodOptionsForAgeGate', () => {
  it('shows only non-adult moods when 18+ mode is off', () => {
    const moods = getMoodOptionsForAgeGate(false);
    expect(moods.length).toBeGreaterThan(0);
    expect(moods.every((mood) => !mood.isAdult)).toBe(true);
  });

  it('shows both adult and general moods when 18+ mode is on, with adult moods first', () => {
    const moods = getMoodOptionsForAgeGate(true);
    const firstGeneralMoodIndex = moods.findIndex((mood) => !mood.isAdult);
    const lastAdultMoodIndex = moods.map((mood) => Boolean(mood.isAdult)).lastIndexOf(true);

    expect(moods.some((mood) => mood.isAdult)).toBe(true);
    expect(moods.some((mood) => !mood.isAdult)).toBe(true);
    expect(lastAdultMoodIndex).toBeLessThan(firstGeneralMoodIndex);
  });
});

describe('matchesMoodSelection', () => {
  it('does not match explicit adult moods for non-adult titles', () => {
    const title = {
      is_adult: false,
      moods: ['romantic'],
      genres: ['Romance'],
      tags: ['chemistry'],
      synopsis: 'A sweet office romance.',
    };

    expect(matchesMoodSelection(title, 'adult-flirty')).toBe(false);
  });

  it('matches new adult mood fallbacks from text and tag signals', () => {
    const title = {
      is_adult: true,
      moods: [],
      genres: ['Drama', 'Romance'],
      tags: ['mature', 'psychological'],
      synopsis: 'A CEO starts a secret relationship that turns obsessive fast.',
    };

    expect(matchesMoodSelection(title, 'adult-forbidden')).toBe(true);
    expect(matchesMoodSelection(title, 'adult-obsession')).toBe(true);
    expect(matchesMoodSelection(title, 'adult-power-play')).toBe(true);
  });

  it('still matches direct non-adult mood ids exactly', () => {
    const title = {
      is_adult: true,
      moods: ['dark', 'thrilling'],
      genres: ['Thriller'],
      tags: ['revenge'],
      synopsis: 'A dark revenge story.',
    };

    expect(matchesMoodSelection(title, 'dark')).toBe(true);
    expect(matchesMoodSelection(title, 'romantic')).toBe(false);
  });
});
