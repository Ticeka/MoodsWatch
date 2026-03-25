import { describe, expect, it } from 'vitest';
import { MOODS, getMoodOptionsForAgeGate } from '../../../../shared/data/moods.js';

const explicitMoodIds = new Set(
  MOODS.filter((mood) => mood.matchMode === 'explicit').map((mood) => mood.id)
);

const EXPLICIT_MOOD_FALLBACKS = {
  'adult-harem': {
    tagKeywords: ['harem', 'reverse harem', 'love polygon', 'multiple heroines', 'harem protagonist'],
    textKeywords: ['harem', 'reverse harem', 'multiple lovers', 'many girls', 'many boys', 'love triangle', 'harem route'],
  },
  'adult-ntr': {
    tagKeywords: ['ntr', 'netorare', 'cheating', 'cuckold', 'affair', 'infidelity', 'adultery'],
    textKeywords: ['ntr', 'netorare', 'cheating', 'cuckold', 'affair', 'infidelity', 'adultery', 'stolen', 'cheated', 'cheats on'],
  },
  'adult-office': {
    tagKeywords: ['office', 'ceo', 'boss', 'secretary', 'workplace', 'contract marriage', 'contract relationship', 'deal', 'power gap'],
    textKeywords: ['ceo', 'boss', 'secretary', 'contract marriage', 'contract relationship', 'deal', 'workplace', 'office', 'executive', 'employee', 'master servant', 'power gap', 'arranged marriage'],
  },
  'adult-forbidden': {
    tagKeywords: ['taboo', 'forbidden', 'forbidden love', 'secret relationship', 'affair', 'teacher student', 'hidden relationship'],
    textKeywords: ['forbidden', 'taboo', 'secret relationship', 'affair', 'scandal', 'cheat', 'cheating', 'hidden love', 'teacher student', 'can never be together', 'must not fall in love'],
  },
  'adult-yandere': {
    tagKeywords: ['yandere', 'obsessive', 'possessive', 'obsession', 'stalker', 'controlling', 'yandere love'],
    textKeywords: ['yandere', 'obsession', 'obsessed', 'possessive', 'fixated', 'clingy', 'stalker', "can't let go", 'controlling', 'mine alone', 'only for me'],
  },
  'adult-femdom': {
    tagKeywords: ['femdom', 'female dominant', 'dominant woman', 'submissive male', 'female led'],
    textKeywords: ['femdom', 'female dominant', 'dominant woman', 'submissive man', 'submissive male', 'female led', 'she controls', 'she dominates'],
  },
  'adult-revenge': {
    tagKeywords: ['revenge', 'blackmail', 'manipulation', 'betrayal', 'vengeance', 'grudge'],
    textKeywords: ['revenge', 'blackmail', 'manipulation', 'betray', 'betrayal', 'vengeance', 'grudge', 'payback', 'get back at', 'use her', 'use him', 'trap'],
  },
  'adult-dark': {
    tagKeywords: ['dark', 'dark romance', 'violence', 'trauma', 'toxic relationship', 'psychological', 'abuse', 'non-consensual'],
    textKeywords: ['dark', 'violence', 'violent', 'abuse', 'abusive', 'trauma', 'toxic', 'manipulation', 'murder', 'kill', 'blood', 'prison', 'blackmail', 'non-con', 'force', 'forced', 'midnight', 'cursed', 'curse'],
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

  it('shows only adult moods when 18+ mode is on', () => {
    const moods = getMoodOptionsForAgeGate(true);
    expect(moods.length).toBeGreaterThan(0);
    expect(moods.every((mood) => mood.isAdult)).toBe(true);
  });
});

describe('matchesMoodSelection', () => {
  it('does not match explicit adult moods for non-adult titles', () => {
    const title = {
      is_adult: false,
      moods: ['romantic'],
      genres: ['Romance'],
      tags: ['office'],
      synopsis: 'A sweet office romance.',
    };

    expect(matchesMoodSelection(title, 'adult-office')).toBe(false);
  });

  it('matches new adult mood fallbacks from text and tag signals', () => {
    const title = {
      is_adult: true,
      moods: [],
      genres: ['Drama', 'Romance'],
      tags: ['yandere', 'ceo'],
      synopsis: 'A CEO starts a secret relationship that turns obsessive fast.',
    };

    expect(matchesMoodSelection(title, 'adult-forbidden')).toBe(true);
    expect(matchesMoodSelection(title, 'adult-yandere')).toBe(true);
    expect(matchesMoodSelection(title, 'adult-office')).toBe(true);
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
