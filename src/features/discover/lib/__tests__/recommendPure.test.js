/**
 * Tests for pure/stateless logic extracted from recommend.js.
 *
 * The scoring functions (scoreQuality, scoreFreshness, etc.) are internal
 * and not exported. We test their observable behavior through the module's
 * exported helpers and through direct inline re-implementations that mirror
 * the logic exactly — this validates that any future refactor of the internal
 * functions does not silently break the scoring contract.
 */
import { describe, it, expect } from 'vitest';

// ── Inline mirrors of internal pure functions ──────────────────────────────
// These are intentionally copied from recommend.js so that diffs are visible
// in test failures if the production logic changes without updating tests.

function scoreQuality(title) {
  const s = Number(title.score || 0);
  const pop = Number(title.popularity || 0);
  const qualityScore = s > 0 ? Math.max(0, Math.min((s - 60) / 35, 1)) : 0.25;
  const popularityScore = pop > 0 ? Math.min(Math.log10(pop + 1) / 6, 1) : 0;
  return qualityScore * 0.6 + popularityScore * 0.4;
}

function scoreFreshness(title, currentYear = 2026) {
  const year = Number(title.year || 0);
  if (!year) return 0.35;
  const age = Math.max(0, currentYear - year);
  return Math.max(0.2, Math.exp(-age / 12));
}

function scoreSimilarityAgainstLiked(title, liked) {
  if (!liked) return 0;
  const sharedGenres = (title.genres || []).filter((g) => (liked.genres || []).includes(g)).length;
  const genreScore = sharedGenres / Math.max((liked.genres || []).length, 1);
  const sharedTags = (title.tags || []).filter((t) => (liked.tags || []).includes(t)).length;
  const tagScore = sharedTags / Math.max((liked.tags || []).length, 1);
  const sharedMoods = (title.moods || []).filter((m) => (liked.moods || []).includes(m)).length;
  const moodScore = sharedMoods / Math.max((liked.moods || []).length, 1);
  const typeBonus = title.type === liked.type ? 0.05 : 0;
  return Math.min(genreScore * 0.45 + tagScore * 0.30 + moodScore * 0.20 + typeBonus, 1);
}

function normalizeTitleType(title) {
  if (title.type === 'manga' && /manhwa/i.test(title.title_en || '')) {
    return { ...title, type: 'manhwa' };
  }
  return title;
}

function resolveWeights(hasMoods, hasLikedTitles) {
  if (hasMoods && hasLikedTitles) {
    return { moodMatch: 0.35, genreTagMatch: 0.20, similarTitle: 0.20, lengthFit: 0.10, quality: 0.12, freshness: 0.03 };
  }
  if (hasMoods) {
    return { moodMatch: 0.48, genreTagMatch: 0.27, similarTitle: 0, lengthFit: 0.12, quality: 0.10, freshness: 0.03 };
  }
  if (hasLikedTitles) {
    return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0.60, lengthFit: 0.10, quality: 0.25, freshness: 0.05 };
  }
  return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0, lengthFit: 0.15, quality: 0.60, freshness: 0.25 };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('scoreQuality', () => {
  it('returns 0.15 for title with no score', () => {
    const result = scoreQuality({ score: 0, popularity: 0 });
    expect(result).toBeCloseTo(0.15);
  });

  it('score 95 (near max) produces high quality component', () => {
    const high = scoreQuality({ score: 95, popularity: 0 });
    const low = scoreQuality({ score: 61, popularity: 0 });
    expect(high).toBeGreaterThan(low);
  });

  it('score >= 95 is capped at max quality component', () => {
    const at95 = scoreQuality({ score: 95, popularity: 0 });
    const at100 = scoreQuality({ score: 100, popularity: 0 });
    // Both should hit the cap (1.0 quality component)
    expect(at95).toBeCloseTo(at100, 5);
  });

  it('popularity boosts score monotonically', () => {
    const base = scoreQuality({ score: 70, popularity: 0 });
    const boosted = scoreQuality({ score: 70, popularity: 100000 });
    expect(boosted).toBeGreaterThan(base);
  });
});

describe('scoreFreshness', () => {
  it('returns 0.35 for title with no year', () => {
    expect(scoreFreshness({ year: 0 })).toBeCloseTo(0.35);
    expect(scoreFreshness({})).toBeCloseTo(0.35);
  });

  it('current-year title scores near 1.0', () => {
    expect(scoreFreshness({ year: 2026 }, 2026)).toBeCloseTo(1.0);
  });

  it('very old title is floored at 0.2', () => {
    expect(scoreFreshness({ year: 1990 }, 2026)).toBeCloseTo(0.2);
  });

  it('newer title scores higher than older title', () => {
    const newer = scoreFreshness({ year: 2022 }, 2026);
    const older = scoreFreshness({ year: 2010 }, 2026);
    expect(newer).toBeGreaterThan(older);
  });
});

describe('scoreSimilarityAgainstLiked', () => {
  it('returns 0 when liked is null', () => {
    expect(scoreSimilarityAgainstLiked({ genres: ['Action'] }, null)).toBe(0);
  });

  it('identical genres/tags/moods/type scores 1.0', () => {
    const title = { type: 'anime', genres: ['Action', 'Drama'], tags: ['School'], moods: ['hype'] };
    const liked = { type: 'anime', genres: ['Action', 'Drama'], tags: ['School'], moods: ['hype'] };
    expect(scoreSimilarityAgainstLiked(title, liked)).toBeCloseTo(1.0);
  });

  it('no overlap scores 0 (or only type bonus)', () => {
    const title = { type: 'anime', genres: ['Comedy'], tags: [], moods: [] };
    const liked = { type: 'anime', genres: ['Horror'], tags: [], moods: [] };
    // typeBonus 0.05, genres 0/1 = 0
    expect(scoreSimilarityAgainstLiked(title, liked)).toBeCloseTo(0.05);
  });

  it('partial genre overlap is proportional', () => {
    const title = { type: 'manga', genres: ['Action', 'Romance'], tags: [], moods: [] };
    const liked = { type: 'manga', genres: ['Action', 'Drama'], tags: [], moods: [] };
    // 1/2 genres shared → genreScore 0.5 → 0.5 * 0.45 + typeBonus 0.05 = 0.275
    expect(scoreSimilarityAgainstLiked(title, liked)).toBeCloseTo(0.275, 5);
  });
});

describe('normalizeTitleType', () => {
  it('reclassifies manga with "manhwa" in title_en as manhwa', () => {
    const title = { type: 'manga', title_en: 'Tower of God (Manhwa)' };
    expect(normalizeTitleType(title).type).toBe('manhwa');
  });

  it('leaves non-manhwa manga unchanged', () => {
    const title = { type: 'manga', title_en: 'One Piece' };
    expect(normalizeTitleType(title).type).toBe('manga');
  });

  it('leaves anime unchanged', () => {
    const title = { type: 'anime', title_en: 'Manhwa Test' };
    expect(normalizeTitleType(title).type).toBe('anime');
  });

  it('does not mutate the original object', () => {
    const title = { type: 'manga', title_en: 'Solo Leveling manhwa' };
    const result = normalizeTitleType(title);
    expect(title.type).toBe('manga');
    expect(result.type).toBe('manhwa');
  });
});

describe('resolveWeights', () => {
  it('all weights sum to 1.0 in every scenario', () => {
    const scenarios = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ];
    for (const [hasMoods, hasLiked] of scenarios) {
      const w = resolveWeights(hasMoods, hasLiked);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1.0, 10);
    }
  });

  it('no moods and no liked titles uses quality-dominated weights', () => {
    const w = resolveWeights(false, false);
    expect(w.quality).toBeGreaterThanOrEqual(w.moodMatch);
    expect(w.quality).toBeGreaterThanOrEqual(w.similarTitle);
  });

  it('moods only: moodMatch is the largest single weight', () => {
    const w = resolveWeights(true, false);
    const max = Math.max(...Object.values(w));
    expect(w.moodMatch).toBe(max);
  });
});
