import { MOODS, isExplicitMood } from '@/shared/data/moods';
import { getSearchIntent } from '@/features/discover/lib/searchMatch';

const moodGenres = {};
MOODS.forEach((mood) => {
  moodGenres[mood.id] = mood.tags || [];
});

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

function normalizeFranchiseIdentityPart(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, ' ')
    .trim();
}

function getTitleFranchiseIdentity(title = {}, fallbackIndex = 0) {
  const franchiseId = Number(title?.franchise_id || 0);
  if (franchiseId > 0) return `franchise-id:${franchiseId}`;

  const franchiseSlug = normalizeFranchiseIdentityPart(title?.franchise_slug);
  if (franchiseSlug) return `franchise-slug:${franchiseSlug}`;

  const franchiseName = normalizeFranchiseIdentityPart(title?.franchise_name);
  if (franchiseName) return `franchise-name:${franchiseName}`;

  const titleId = Number(title?.id || 0);
  if (titleId > 0) return `title-id:${titleId}`;

  const titleSlug = normalizeFranchiseIdentityPart(title?.slug);
  if (titleSlug) return `title-slug:${titleSlug}`;

  return `title-fallback:${fallbackIndex}`;
}

export function collapseTitlesByFranchise(titles = []) {
  const seen = new Set();
  const deduped = [];

  titles.forEach((title, index) => {
    const franchiseKey = getTitleFranchiseIdentity(title, index);
    if (seen.has(franchiseKey)) return;
    seen.add(franchiseKey);
    deduped.push(title);
  });

  return deduped;
}

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
  if (!title?.is_adult) return false;
  if ((title.moods || []).includes(moodId)) return true;

  const fallback = EXPLICIT_MOOD_FALLBACKS[moodId];
  if (!fallback) return false;

  const { tags, text } = getTitleSignalBag(title);
  const hasTagMatch = fallback.tagKeywords.some((keyword) => tags.includes(keyword));
  const hasTextMatch = fallback.textKeywords.some((keyword) => text.includes(keyword));

  return hasTagMatch || hasTextMatch;
}

export function matchesMoodSelection(title, moodId) {
  if (!moodId) return false;
  if ((title?.moods || []).includes(moodId)) return true;
  return isExplicitMood(moodId)
    ? matchesExplicitMoodFallback(title, moodId)
    : false;
}

export function buildTitleSearchCandidates(title, intent = getSearchIntent('')) {
  return [
    {
      weight: 5.3,
      texts: [title.title_en, title.title_th, title.title_native],
      allowTypo: true,
      matchWeights: { exactPhrase: 328, prefixPhrase: 202, containsPhrase: 112, exactToken: 102, wordBoundary: 66, prefixToken: 44, containsToken: 18, typoToken: 18 },
    },
    {
      weight: 4.8,
      texts: [title.title_romaji, ...(title.aliases || [])],
      allowTypo: true,
      matchWeights: { exactPhrase: 304, prefixPhrase: 188, containsPhrase: 104, exactToken: 94, wordBoundary: 60, prefixToken: 40, containsToken: 16, typoToken: 16 },
    },
    {
      weight: 4.6,
      texts: [title.slug],
      allowTypo: true,
      matchWeights: { exactPhrase: 292, prefixPhrase: 184, containsPhrase: 98, exactToken: 94, wordBoundary: 58, prefixToken: 38, containsToken: 16, typoToken: 16 },
    },
    {
      weight: intent.isBroad ? 1.9 : 1.3,
      texts: [title.type, title.subtype, title.format],
      matchWeights: { exactPhrase: 204, prefixPhrase: 132, containsPhrase: 74, exactToken: 58, wordBoundary: 36, prefixToken: 22, containsToken: 10 },
    },
    {
      weight: intent.isBroad ? 2.8 : 1.8,
      texts: title.genres || [],
      matchWeights: { exactPhrase: 224, prefixPhrase: 138, containsPhrase: 80, exactToken: 66, wordBoundary: 44, prefixToken: 24, containsToken: 12 },
    },
    {
      weight: intent.isBroad ? 2.5 : 1.5,
      texts: title.tags || [],
      matchWeights: { exactPhrase: 214, prefixPhrase: 132, containsPhrase: 76, exactToken: 62, wordBoundary: 40, prefixToken: 22, containsToken: 10 },
    },
    {
      weight: intent.isBroad ? 2.2 : 1.35,
      texts: title.moods || [],
      matchWeights: { exactPhrase: 196, prefixPhrase: 124, containsPhrase: 72, exactToken: 58, wordBoundary: 36, prefixToken: 20, containsToken: 10 },
    },
    {
      weight: 0.55,
      texts: [title.synopsis],
      longTextPenalty: { threshold: 96, floor: 0.22 },
      matchWeights: { containsPhrase: 54, exactToken: 40, wordBoundary: 24, prefixToken: 14, containsToken: 7 },
    },
  ];
}

export function resolveWeights(hasMoods, hasLikedTitles) {
  if (hasMoods && hasLikedTitles) return { moodMatch: 0.35, genreTagMatch: 0.20, similarTitle: 0.20, lengthFit: 0.10, quality: 0.12, freshness: 0.03 };
  if (hasMoods) return { moodMatch: 0.48, genreTagMatch: 0.27, similarTitle: 0, lengthFit: 0.12, quality: 0.10, freshness: 0.03 };
  if (hasLikedTitles) return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0.60, lengthFit: 0.10, quality: 0.25, freshness: 0.05 };
  return { moodMatch: 0, genreTagMatch: 0, similarTitle: 0, lengthFit: 0.15, quality: 0.60, freshness: 0.25 };
}

function splitRequestedMoods(moods = []) {
  return moods.reduce((acc, moodId) => {
    if (isExplicitMood(moodId)) acc.explicit.push(moodId);
    else acc.fuzzy.push(moodId);
    return acc;
  }, { explicit: [], fuzzy: [] });
}

function scoreMoodMatch(title, moods) {
  if (!moods || moods.length === 0) return 0;
  const matched = moods.filter((moodId) => matchesMoodSelection(title, moodId)).length;
  return matched / moods.length;
}

function matchesRequestedMoods(title, moods) {
  if (!moods || moods.length === 0) return true;
  const titleMoodIds = new Set(title.moods || []);
  const { explicit, fuzzy } = splitRequestedMoods(moods);
  if (explicit.some((mood) => matchesMoodSelection(title, mood))) return true;
  if (fuzzy.some((mood) => titleMoodIds.has(mood) || matchesMoodSelection(title, mood))) return true;
  const wantedTags = fuzzy.flatMap((mood) => moodGenres[mood] || []).map((tag) => tag.toLowerCase());
  if (wantedTags.length === 0) return false;
  const titleTags = [...(title.genres || []), ...(title.tags || [])].map((tag) => tag.toLowerCase());
  const matchCount = wantedTags.filter((tag) => titleTags.includes(tag)).length;
  const minMatch = wantedTags.length <= 3 ? 1 : 2;
  return matchCount >= minMatch;
}

function scoreGenreTagMatch(title, moods) {
  if (!moods || moods.length === 0) return 0;
  const titleTags = [...(title.genres || []), ...(title.tags || [])].map((t) => t.toLowerCase());
  const { fuzzy } = splitRequestedMoods(moods);
  if (fuzzy.length === 0) return 0;
  const moodScores = fuzzy.map((m) => {
    const tags = (moodGenres[m] || []).map((t) => t.toLowerCase());
    if (tags.length === 0) return 0;
    const matched = tags.filter((t) => titleTags.includes(t)).length;
    return Math.min(matched / tags.length, 1);
  });
  return moodScores.reduce((a, b) => a + b, 0) / moodScores.length;
}

function scoreLengthFit(title, timeOption) {
  if (!timeOption) return 0.5;
  const id = timeOption.id || timeOption;
  if (id === 'completed') return 0.5;
  const eps = title.episodes || title.chapters || 0;
  const ranges = { '20min': [0, 1], '30min': [1, 1], '1hour': [1, 3], tonight: [1, 13], short: [1, 13], long: [24, 9999], '10ch': [1, 10], 'few-vol': [1, 50] };
  const durationBased = { '20min': title.duration ? title.duration <= 24 : null, '30min': title.duration ? title.duration <= 30 : null, '1hour': title.duration ? title.duration <= 60 : null };
  const durResult = durationBased[id];
  if (durResult !== null && durResult !== undefined) return durResult ? 1 : 0.3;
  const [min, max] = ranges[id] || [0, 9999];
  if (eps >= min && eps <= max) return 1;
  if (eps < min) return Math.max(0, 1 - (min - eps) / min);
  return Math.max(0, 1 - (eps - max) / max);
}

export function scoreQuality(title) {
  const s = Number(title.score || 0);
  const pop = Number(title.popularity || 0);
  const qualityScore = s > 0 ? Math.max(0, Math.min((s - 60) / 35, 1)) : 0.25;
  const popularityScore = pop > 0 ? Math.min(Math.log10(pop + 1) / 6, 1) : 0;
  return qualityScore * 0.6 + popularityScore * 0.4;
}

export function scoreFreshness(title) {
  const year = Number(title.year || 0);
  if (!year) return 0.35;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - year);
  return Math.max(0.2, Math.exp(-age / 12));
}

export function scoreSimilarityAgainstLiked(title, liked) {
  if (!liked) return 0;
  const sharedGenres = (title.genres || []).filter((genre) => (liked.genres || []).includes(genre)).length;
  const genreScore = sharedGenres / Math.max((liked.genres || []).length, 1);
  const sharedTags = (title.tags || []).filter((tag) => (liked.tags || []).includes(tag)).length;
  const tagScore = sharedTags / Math.max((liked.tags || []).length, 1);
  const sharedMoods = (title.moods || []).filter((mood) => (liked.moods || []).includes(mood)).length;
  const moodScore = sharedMoods / Math.max((liked.moods || []).length, 1);
  const typeBonus = title.type === liked.type ? 0.05 : 0;
  return Math.min(genreScore * 0.45 + tagScore * 0.30 + moodScore * 0.20 + typeBonus, 1);
}

function scoreSimilarity(title, likedTitles) {
  if (!likedTitles?.length) return 0;
  const similarities = likedTitles.map((liked) => scoreSimilarityAgainstLiked(title, liked)).filter((value) => value > 0).sort((a, b) => b - a);
  if (similarities.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  similarities.forEach((sim, i) => {
    const w = 1 / (i + 1);
    weightedSum += sim * w;
    weightTotal += w;
  });
  return weightedSum / weightTotal;
}

export function buildReason(title, moods, primaryLikedTitle) {
  const parts = [];
  if (moods?.length) {
    const matchedMoodNames = moods
      .filter((m) => matchesMoodSelection(title, m))
      .map((m) => MOODS.find((mood) => mood.id === m)?.name_th)
      .filter(Boolean);
    if (matchedMoodNames.length > 0) parts.push(`ตรงกับโทนเรื่อง ${matchedMoodNames.join(', ')}`);
  }
  const eps = title.episodes || title.chapters || 0;
  if (eps > 0 && eps <= 13) parts.push(`เรื่องสั้น ${eps} ตอน/ตอนอ่าน`);
  if (primaryLikedTitle) {
    const sharedGenres = (title.genres || []).filter((genre) => (primaryLikedTitle.genres || []).includes(genre));
    if (sharedGenres.length) parts.push(`คล้าย ${primaryLikedTitle.title_en || primaryLikedTitle.title_th} ด้าน ${sharedGenres.join(', ')}`);
  }
  if (title.status === 'completed') parts.push('จบแล้ว');
  if (title.score >= 85) parts.push(`คะแนนสูง ${title.score}/100`);
  return parts.join(' | ') || null;
}

export function buildRecommendationBreakdown(title, moods, timeOption, likedTitles, primaryLikedTitle, recommendationState, weights) {
  const moodScore = scoreMoodMatch(title, moods);
  const genreScore = scoreGenreTagMatch(title, moods);
  const lengthScore = scoreLengthFit(title, timeOption);
  const qualityScore = scoreQuality(title);
  const simScore = scoreSimilarity(title, likedTitles);
  const freshnessScore = scoreFreshness(title);
  const matchedMoods = (moods || []).filter((mood) => matchesMoodSelection(title, mood));
  const sharedGenres = primaryLikedTitle ? (title.genres || []).filter((genre) => (primaryLikedTitle.genres || []).includes(genre)) : [];
  const sharedTags = primaryLikedTitle ? (title.tags || []).filter((tag) => (primaryLikedTitle.tags || []).includes(tag)) : [];
  return {
    total:
      weights.moodMatch * moodScore +
      weights.genreTagMatch * genreScore +
      weights.lengthFit * lengthScore +
      weights.quality * qualityScore +
      weights.similarTitle * simScore +
      weights.freshness * freshnessScore,
    scores: { moodMatch: moodScore, genreTagMatch: genreScore, lengthFit: lengthScore, quality: qualityScore, similarTitle: simScore, freshness: freshnessScore },
    weights,
    matchedMoods,
    sharedGenres,
    sharedTags,
    progressState: recommendationState.statusByTitleId.get(title.id) || 'untracked',
    isTracked: recommendationState.trackedTitleIds.has(title.id),
    isExcluded: recommendationState.excludedTitleIds.has(title.id),
  };
}

export function filterTitlesForRecommendationPool(pool, moods, timeOption) {
  let nextPool = [...pool];
  if (moods.length > 0) {
    nextPool = nextPool.filter((title) => matchesRequestedMoods(title, moods));
  }
  const timeId = timeOption?.id || timeOption;
  if (timeId === 'completed') nextPool = nextPool.filter((title) => title.status === 'completed');
  else if (timeId === 'ongoing') nextPool = nextPool.filter((title) => title.status !== 'completed');
  return nextPool;
}
