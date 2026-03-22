import { describe, expect, it } from 'vitest';
import { getSearchIntent, sortBySearchRelevance, textMatchesQuery } from '../searchMatch';

describe('getSearchIntent', () => {
  it('marks single-character queries as short fallback searches', () => {
    const intent = getSearchIntent('a');
    expect(intent.isShort).toBe(true);
    expect(intent.shouldUseFallback).toBe(true);
    expect(intent.mode).toBe('short');
  });

  it('marks broad tag-like queries as broad fallback searches', () => {
    const intent = getSearchIntent('action');
    expect(intent.isBroad).toBe(true);
    expect(intent.shouldUseFallback).toBe(true);
    expect(intent.mode).toBe('broad');
  });

  it('treats common mood queries as broad searches', () => {
    const intent = getSearchIntent(' sad ');
    expect(intent.isBroad).toBe(true);
    expect(intent.mode).toBe('broad');
  });
});

describe('sortBySearchRelevance', () => {
  it('keeps exact title matches above caption-only matches', () => {
    const items = [
      {
        id: 'caption',
        title: 'Another Story',
        caption: 'Frieren is incredible in this post',
      },
      {
        id: 'title',
        title: 'Frieren',
        caption: 'A different caption',
      },
    ];

    const result = sortBySearchRelevance(items, 'Frieren', (item) => ([
      {
        weight: 5,
        texts: [item.title],
        matchWeights: {
          exactPhrase: 280,
          prefixPhrase: 180,
          containsPhrase: 96,
          exactToken: 96,
          wordBoundary: 58,
          prefixToken: 36,
          containsToken: 18,
        },
      },
      {
        weight: 1,
        texts: [item.caption],
      },
    ]));

    expect(result[0].id).toBe('title');
  });

  it('matches normalized symbols like SPY×FAMILY against "spy x family"', () => {
    expect(textMatchesQuery('SPY×FAMILY', 'spy x family', { allowTypo: true })).toBe(true);
  });

  it('ranks alias matches above description-only matches', () => {
    const items = [
      {
        id: 'description-only',
        title: 'Another Story',
        aliases: [],
        description: 'Fans of Steins Gate should read this.',
      },
      {
        id: 'alias',
        title: 'Steins;Gate',
        aliases: ['Steins Gate'],
        description: 'Time travel thriller',
      },
    ];

    const result = sortBySearchRelevance(items, 'steins gate', (item) => ([
      {
        weight: 5,
        texts: [item.title, ...(item.aliases || [])],
        allowTypo: true,
      },
      {
        weight: 0.9,
        texts: [item.description],
        longTextPenalty: {
          threshold: 80,
          floor: 0.2,
        },
      },
    ]));

    expect(result[0].id).toBe('alias');
  });

  it('supports typo-tolerant ranking for close title matches', () => {
    const items = [
      { id: 'frieren', title: 'Frieren' },
      { id: 'fire-force', title: 'Fire Force' },
    ];

    const result = sortBySearchRelevance(items, 'Frerien', (item) => ([
      {
        weight: 5,
        texts: [item.title],
        allowTypo: true,
      },
    ]));

    expect(result[0].id).toBe('frieren');
  });

  it('de-emphasizes long text matches against shorter focused text', () => {
    const items = [
      {
        id: 'focused',
        description: 'romance recommendations from the community',
      },
      {
        id: 'rambling',
        description: `This is a very long bio about many genres, many moods, and many recommendations where romance appears
        somewhere in a wall of text that keeps going and going with lots of extra words to simulate a noisy caption.`,
      },
    ];

    const result = sortBySearchRelevance(items, 'romance', (item) => ([
      {
        weight: 1,
        texts: [item.description],
        longTextPenalty: {
          threshold: 60,
          floor: 0.18,
        },
      },
    ]));

    expect(result[0].id).toBe('focused');
  });
});

// ── Thai / mixed-language queries ──────────────────────────────────────────

describe('Thai and mixed-language queries', () => {
  it('matches Thai title against Thai query', () => {
    expect(textMatchesQuery('ฮันเตอร์ x ฮันเตอร์', 'ฮันเตอร์', { allowTypo: false })).toBe(true);
  });

  it('handles mixed Thai–English query tokens correctly', () => {
    expect(textMatchesQuery('anime romance ซึ้งใจ', 'anime ซึ้ง', { allowTypo: false })).toBe(true);
  });

  it('ranks Thai-titled result above description-only match', () => {
    const items = [
      { id: 'desc-only', title: 'Some Anime', description: 'นี่คือแอนิเมะสุดซึ้ง' },
      { id: 'thai-title', title: 'แอนิเมะสุดซึ้ง', description: 'An anime' },
    ];

    const result = sortBySearchRelevance(items, 'แอนิเมะ', (item) => ([
      { weight: 5, texts: [item.title] },
      { weight: 0.8, texts: [item.description] },
    ]));

    expect(result[0].id).toBe('thai-title');
  });
});

// ── Emoji and special character queries ───────────────────────────────────

describe('emoji and special characters', () => {
  it('does not match a pure-emoji query (no comparable tokens)', () => {
    const result = textMatchesQuery('Naruto', '🍜🥷', { allowTypo: false });
    expect(result).toBe(false);
  });

  it('ignores zero-width spaces in query', () => {
    expect(textMatchesQuery('Frieren', 'Frie\u200Bren', { allowTypo: false })).toBe(true);
  });

  it('handles × symbol in title (SPY×FAMILY normalization)', () => {
    expect(textMatchesQuery('SPY×FAMILY', 'spy family', { allowTypo: false })).toBe(true);
  });

  it('handles & in query (normalized to "and")', () => {
    expect(textMatchesQuery('Romeo and Juliet', 'Romeo & Juliet', { allowTypo: false })).toBe(true);
  });

  it('strips curly quotes from query', () => {
    expect(textMatchesQuery("Steins;Gate", "Steins\u2019Gate", { allowTypo: false })).toBe(true);
  });

  it('treats repeated punctuation as whitespace', () => {
    expect(textMatchesQuery('Re: Zero', 're zero', { allowTypo: false })).toBe(true);
  });
});

// ── Whitespace edge cases ──────────────────────────────────────────────────

describe('whitespace edge cases', () => {
  it('matches query with leading/trailing spaces', () => {
    expect(textMatchesQuery('Frieren', '  Frieren  ', { allowTypo: false })).toBe(true);
  });

  it('matches query with multiple internal spaces', () => {
    expect(textMatchesQuery('Attack on Titan', 'attack   on   titan', { allowTypo: false })).toBe(true);
  });

  it('returns false for blank query', () => {
    expect(textMatchesQuery('Frieren', '   ', { allowTypo: false })).toBe(false);
  });

  it('returns false for empty query', () => {
    expect(textMatchesQuery('Frieren', '', { allowTypo: false })).toBe(false);
  });

  it('returns false when text is empty', () => {
    expect(textMatchesQuery('', 'Frieren', { allowTypo: false })).toBe(false);
  });

  it('tab and newline in query are treated as word separators', () => {
    expect(textMatchesQuery('Demon Slayer', 'Demon\tSlayer', { allowTypo: false })).toBe(true);
  });
});

// ── getSearchIntent edge cases ─────────────────────────────────────────────

describe('getSearchIntent edge cases', () => {
  it('returns idle mode for null input', () => {
    const intent = getSearchIntent(null);
    expect(intent.isEmpty).toBe(true);
    expect(intent.mode).toBe('idle');
  });

  it('returns idle mode for undefined input', () => {
    const intent = getSearchIntent(undefined);
    expect(intent.isEmpty).toBe(true);
    expect(intent.mode).toBe('idle');
  });

  it('returns focused mode for a specific title query', () => {
    const intent = getSearchIntent('Vinland Saga');
    expect(intent.mode).toBe('focused');
    expect(intent.shouldUseFallback).toBe(false);
  });
});

// ── sortBySearchRelevance with missing/deleted entity fields ──────────────

describe('sortBySearchRelevance with missing fields', () => {
  it('does not throw when items have undefined title', () => {
    const items = [
      { id: 'a', title: undefined },
      { id: 'b', title: null },
      { id: 'c', title: 'Frieren' },
    ];

    expect(() => {
      sortBySearchRelevance(items, 'Frieren', (item) => ([
        { weight: 5, texts: [item.title ?? ''] },
      ]));
    }).not.toThrow();
  });

  it('ranks items with matching title above items with undefined title', () => {
    const items = [
      { id: 'missing', title: undefined },
      { id: 'found', title: 'Frieren' },
    ];

    const result = sortBySearchRelevance(items, 'Frieren', (item) => ([
      { weight: 5, texts: [item.title ?? ''] },
    ]));

    expect(result[0].id).toBe('found');
  });

  it('handles empty items array without throwing', () => {
    expect(() => sortBySearchRelevance([], 'test', () => [])).not.toThrow();
  });

  it('handles single-item array without throwing', () => {
    expect(() => sortBySearchRelevance([{ id: 'x', title: 'Test' }], 'test', (i) => ([
      { weight: 1, texts: [i.title] },
    ]))).not.toThrow();
  });
});
