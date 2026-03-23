import { BRAND_NAME } from '@/shared/config/brand';
import { CHARACTER_ENTITY_TYPE, TITLE_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';

const BATTLE_SESSIONS_KEY = 'moodtoon-battle-sessions';
const BATTLE_DECKS_KEY = 'moodtoon-battle-decks';
const RECENT_BATTLE_SESSION_LIMIT = 4;
const DEFAULT_TARGET_ROUNDS = 24;
const MIN_DECK_SIZE = 8;
const MAX_DECK_SIZE = 64;
const BASE_RATING = 1500;
const MIN_K_FACTOR = 16;
const MAX_K_FACTOR = 40;
const MIN_COMPARISONS_PER_TITLE = 2;
const CLOSE_SCORE_GAP = 18;
const TOP_RANK_PLAYOFF_DEPTH = 3;
const FAST_PLAYOFF_SIZE = 8;

const BATTLE_PRESETS = [
  {
    id: 'best-anime',
    label: 'Best Anime',
    description: 'Top anime picks from the full catalog.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'anime', size: 32 },
  },
  {
    id: 'best-manga',
    label: 'Best Manga',
    description: 'Rank manga titles from the current catalog.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'manga', size: 32 },
  },
  {
    id: 'best-manhwa',
    label: 'Best Manhwa',
    description: 'Pick your top manhwa one battle at a time.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'manhwa', size: 32 },
  },
  {
    id: 'romance-anime',
    label: 'Best Romance Anime',
    description: 'Anime filtered to romance-heavy tags and genres.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'anime', tag: 'romance', size: 24 },
  },
  {
    id: 'mystery-picks',
    label: 'Mystery Face-Off',
    description: 'Mystery and thriller titles from the existing catalog.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'all', tag: 'mystery', size: 24 },
  },
  {
    id: 'healing-picks',
    label: 'Healing Picks',
    description: 'Battle through gentle, feel-good titles.',
    filters: { entityType: TITLE_ENTITY_TYPE, type: 'all', mood: 'healing', size: 24 },
  },
];

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function clampDeckSize(size) {
  const numericSize = Number(size) || DEFAULT_TARGET_ROUNDS;
  return Math.min(MAX_DECK_SIZE, Math.max(MIN_DECK_SIZE, numericSize));
}

function buildDeckLabel(filters) {
  const parts = [];
  const entityType = normalizeCatalogEntityType(filters.entityType);
  if (filters.type && filters.type !== 'all') {
    parts.push(filters.type[0].toUpperCase() + filters.type.slice(1));
  } else {
    parts.push(entityType === CHARACTER_ENTITY_TYPE ? 'All characters' : 'All titles');
  }
  if (filters.tag) parts.push(`#${filters.tag}`);
  if (filters.mood) parts.push(filters.mood);
  return parts.join(' • ');
}

function applyBattleVisibilityRules(titles, options = {}) {
  const hiddenTitleIds = new Set((options.hiddenTitleIds || []).map(Number).filter(Boolean));
  const excludeAdult = Boolean(options.excludeAdult);
  const onlyAdult = Boolean(options.onlyAdult);

  return (titles || []).filter((title) => {
    if (hiddenTitleIds.has(title.id)) {
      return false;
    }

    if (excludeAdult && title.is_adult) {
      return false;
    }

    if (onlyAdult && !title.is_adult) {
      return false;
    }

    return true;
  });
}

function sortDeckPool(titles) {
  return [...(titles || [])].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const popularityDiff = Number(b.popularity || 0) - Number(a.popularity || 0);
    if (popularityDiff !== 0) return popularityDiff;
    return String(a.title_en || a.title_th || a.slug || '')
      .localeCompare(String(b.title_en || b.title_th || b.slug || ''));
  });
}

function pickDeckTitles(titles, filters, options = {}) {
  const normalizedTag = normalizeText(filters.tag);
  const normalizedMood = normalizeText(filters.mood);
  const normalizedQuery = normalizeText(filters.query);
  const size = clampDeckSize(filters.size);

  let pool = applyBattleVisibilityRules(titles, options);

  if (filters.type && filters.type !== 'all') {
    pool = pool.filter((title) => title.type === filters.type);
  }

  if (normalizedMood) {
    pool = pool.filter((title) => (title.moods || []).map(normalizeText).includes(normalizedMood));
  }

  if (normalizedTag) {
    pool = pool.filter((title) => {
      const genres = (title.genres || []).map(normalizeText);
      const tags = (title.tags || []).map(normalizeText);
      return genres.some((genre) => genre.includes(normalizedTag)) || tags.some((tag) => tag.includes(normalizedTag));
    });
  }

  if (normalizedQuery) {
    pool = pool.filter((title) => {
      const haystack = [
        title.title_en,
        title.title_th,
        title.title_native,
        title.slug,
      ].map(normalizeText);
      return haystack.some((entry) => entry.includes(normalizedQuery));
    });
  }

  const sortedPool = sortDeckPool(pool);

  return sortedPool.slice(0, size);
}

function buildDeckSignature(filters) {
  return JSON.stringify({
    entityType: normalizeCatalogEntityType(filters.entityType),
    type: filters.type || 'all',
    tag: normalizeText(filters.tag),
    mood: normalizeText(filters.mood),
    query: normalizeText(filters.query),
    size: clampDeckSize(filters.size),
  });
}

function normalizeDeckFilters(filters = {}) {
  return {
    entityType: normalizeCatalogEntityType(filters.entityType),
    type: filters.type || 'all',
    tag: filters.tag || '',
    mood: filters.mood || '',
    query: filters.query || '',
    size: clampDeckSize(filters.size),
  };
}

function buildDeckFingerprintFromTitles(titles) {
  return (titles || [])
    .map((title) => Number(title?.id || title))
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join(':');
}

function serializeTitle(title) {
  return {
    id: title.id,
    slug: title.slug,
    entityType: normalizeCatalogEntityType(title.entityType),
    type: title.type,
    subtype: title.subtype,
    title_en: title.title_en,
    title_th: title.title_th,
    title_native: title.title_native,
    cover: title.cover,
    banner: title.banner,
    synopsis: title.synopsis,
    score: title.score,
    popularity: title.popularity,
    year: title.year,
    is_adult: Boolean(title.is_adult),
    genres: title.genres || [],
    tags: title.tags || [],
    moods: title.moods || [],
    role: title.role || '',
    voice_actor_name: title.voice_actor_name || '',
    voice_actor_image: title.voice_actor_image || '',
    sourceTitleId: title.sourceTitleId || null,
    sourceTitleSlug: title.sourceTitleSlug || '',
    sourceTitleName: title.sourceTitleName || '',
  };
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `battle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialRatings(titles) {
  return Object.fromEntries(
    (titles || []).map((title) => [title.id, {
      score: BASE_RATING,
      wins: 0,
      losses: 0,
      ties: 0,
      skips: 0,
      comparisons: 0,
    }])
  );
}

function buildMatchKey(leftId, rightId) {
  return [leftId, rightId].sort((a, b) => a - b).join(':');
}

function getRatingEntry(ratings, titleId) {
  return {
    score: BASE_RATING,
    wins: 0,
    losses: 0,
    ties: 0,
    skips: 0,
    comparisons: 0,
    ...(ratings?.[titleId] || {}),
  };
}

function getExpectedScore(scoreA, scoreB) {
  return 1 / (1 + (10 ** ((scoreB - scoreA) / 400)));
}

function getKFactor(comparisons) {
  return Math.max(MIN_K_FACTOR, MAX_K_FACTOR - (Math.min(12, Number(comparisons || 0)) * 2));
}

function roundRating(value) {
  return Math.round(value * 100) / 100;
}

export function getBattleDecisionCount(session) {
  return (session?.history || []).filter((entry) => entry?.result && entry.result !== 'skip').length;
}

function createSeedFromText(value) {
  return String(value || '')
    .split('')
    .reduce((accumulator, character) => ((accumulator * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function createSeededComparator(seed) {
  return (leftId, rightId) => {
    const leftWeight = ((Number(leftId) * 1103515245) + seed) % 2147483647;
    const rightWeight = ((Number(rightId) * 1103515245) + seed) % 2147483647;
    return leftWeight - rightWeight;
  };
}

function buildInitialSeedOrder(titles, seedKey) {
  const seed = createSeedFromText(seedKey);
  return (titles || [])
    .map((title) => title.id)
    .sort(createSeededComparator(seed));
}

function buildSeedRankMap(seedOrder = []) {
  return new Map(seedOrder.map((titleId, index) => [titleId, index]));
}

function sortKnockoutSeeds(activeIds, ratings, seedRankMap, preferRating = true) {
  return [...(activeIds || [])].sort((leftId, rightId) => {
    const leftRating = getRatingEntry(ratings, leftId);
    const rightRating = getRatingEntry(ratings, rightId);

    if (preferRating) {
      const scoreDiff = Number(rightRating.score || BASE_RATING) - Number(leftRating.score || BASE_RATING);
      if (scoreDiff !== 0) return scoreDiff;
    }

    return Number(seedRankMap.get(leftId) ?? 0) - Number(seedRankMap.get(rightId) ?? 0);
  });
}

function createKnockoutRound(activeIds, ratings, seedOrder = [], preferRating = true) {
  const seedRankMap = buildSeedRankMap(seedOrder);
  const seededIds = sortKnockoutSeeds(activeIds, ratings, seedRankMap, preferRating);
  const roundPairs = [];
  const autoAdvanceIds = [];
  let start = 0;
  let end = seededIds.length - 1;

  if (seededIds.length % 2 === 1) {
    autoAdvanceIds.push(seededIds[0]);
    start = 1;
  }

  while (start < end) {
    roundPairs.push({
      leftId: seededIds[start],
      rightId: seededIds[end],
    });
    start += 1;
    end -= 1;
  }

  return {
    roundPairs,
    autoAdvanceIds,
  };
}

function createFastState(titles, seedKey) {
  const seedOrder = buildInitialSeedOrder(titles, seedKey);
  const initialRound = createKnockoutRound(seedOrder, createInitialRatings(titles), seedOrder, false);

  return {
    phase: seedOrder.length <= FAST_PLAYOFF_SIZE ? 'playoff' : 'knockout',
    seedOrder,
    activeIds: seedOrder.length <= FAST_PLAYOFF_SIZE ? seedOrder : [...seedOrder],
    roundPairs: seedOrder.length <= FAST_PLAYOFF_SIZE ? [] : initialRound.roundPairs,
    pairIndex: 0,
    roundWinners: seedOrder.length <= FAST_PLAYOFF_SIZE ? [] : initialRound.autoAdvanceIds,
    eliminated: [],
  };
}

function getFastPlayoffDecisionTarget(titleCount) {
  const activeCount = Math.min(FAST_PLAYOFF_SIZE, Math.max(2, Number(titleCount || 0)));
  return Math.max(8, Math.ceil(activeCount * 1.5));
}

function getFastTargetRounds(titleCount) {
  const count = Math.max(MIN_DECK_SIZE, Number(titleCount || 0));
  const knockoutRounds = Math.max(0, count - FAST_PLAYOFF_SIZE);
  return knockoutRounds + getFastPlayoffDecisionTarget(count);
}

function resolveBracketWinner(result, leftId, rightId, ratings, seedRankMap) {
  if (result === 'left') {
    return { winnerId: leftId, loserId: rightId };
  }

  if (result === 'right') {
    return { winnerId: rightId, loserId: leftId };
  }

  const leftScore = Number(getRatingEntry(ratings, leftId).score || BASE_RATING);
  const rightScore = Number(getRatingEntry(ratings, rightId).score || BASE_RATING);

  if (leftScore !== rightScore) {
    return leftScore >= rightScore
      ? { winnerId: leftId, loserId: rightId }
      : { winnerId: rightId, loserId: leftId };
  }

  const leftSeed = Number(seedRankMap.get(leftId) ?? Number.MAX_SAFE_INTEGER);
  const rightSeed = Number(seedRankMap.get(rightId) ?? Number.MAX_SAFE_INTEGER);
  return leftSeed <= rightSeed
    ? { winnerId: leftId, loserId: rightId }
    : { winnerId: rightId, loserId: leftId };
}

function getFastKnockoutPair(session) {
  const fastState = session.fastState || {};
  return fastState.roundPairs?.[fastState.pairIndex] || null;
}

function getPairPriority(leftCandidate, rightCandidate) {
  const leftComparisons = Number(leftCandidate.comparisons || 0);
  const rightComparisons = Number(rightCandidate.comparisons || 0);
  const comparisonBalance = leftComparisons + rightComparisons;
  const scoreGap = Math.abs(Number(leftCandidate.score || BASE_RATING) - Number(rightCandidate.score || BASE_RATING));
  const uncertaintyBoost = (12 - Math.min(12, leftComparisons)) + (12 - Math.min(12, rightComparisons));

  return (uncertaintyBoost * 100) - (comparisonBalance * 8) - scoreGap;
}

function getBattleCoverageTarget(titleCount) {
  return Math.min(
    4,
    Math.max(MIN_COMPARISONS_PER_TITLE, Math.ceil(Math.log2(Math.max(2, Number(titleCount || 0))) - 1)))
}

function _getDynamicTargetRounds(titleCount) {
  const count = Math.max(MIN_DECK_SIZE, Number(titleCount || 0));
  const pairCap = Math.max(DEFAULT_TARGET_ROUNDS, Math.floor((count * (count - 1)) / 2));
  const coverageTarget = getBattleCoverageTarget(count);
  const coverageRounds = Math.ceil((count * coverageTarget) / 2);
  const refinementRounds = Math.ceil(count * 0.5);

  return Math.min(pairCap, Math.max(DEFAULT_TARGET_ROUNDS, coverageRounds + refinementRounds));
}

function getTopRankBoundaryGaps(ranking = []) {
  return ranking
    .slice(0, Math.max(0, TOP_RANK_PLAYOFF_DEPTH - 1))
    .map((title, index) => {
      const nextTitle = ranking[index + 1];
      if (!nextTitle) {
        return null;
      }

      return {
        leftId: title.id,
        rightId: nextTitle.id,
        gap: Math.abs(Number(title.score || BASE_RATING) - Number(nextTitle.score || BASE_RATING)),
      };
    })
    .filter(Boolean);
}

function shouldContinueBattle(session) {
  const activeIds = session?.fastState?.phase === 'playoff'
    ? (session.fastState.activeIds || [])
    : (session?.titles || []).map((title) => title.id);
  const activeTitles = (session?.titles || []).filter((title) => activeIds.includes(title.id));
  const ranking = buildRanking({
    ...session,
    titles: activeTitles,
  });
  const ratings = session.ratings || {};
  const coverageTarget = getBattleCoverageTarget(activeTitles.length || session?.titles?.length || 0);
  const decisionCount = getBattleDecisionCount(session);
  const pairCap = Math.floor((activeTitles.length * Math.max(0, activeTitles.length - 1)) / 2);

  if (decisionCount < session.targetRounds) {
    return true;
  }

  const underComparedCount = activeTitles.filter((title) => {
    const entry = getRatingEntry(ratings, title.id);
    return Number(entry.comparisons || 0) < coverageTarget;
  }).length;

  if (underComparedCount > 0 && decisionCount < pairCap) {
    return true;
  }

  const unresolvedTopBoundary = getTopRankBoundaryGaps(ranking).some((entry) => entry.gap <= CLOSE_SCORE_GAP);
  if (unresolvedTopBoundary && decisionCount < Math.min(pairCap, session.targetRounds + session.titles.length)) {
    return true;
  }

  return false;
}

function choosePlayoffPair(session, activeIds = null) {
  const ratings = session.ratings || {};
  const titleIds = activeIds || session.titles.map((title) => title.id);
  const activeTitles = (session.titles || []).filter((title) => titleIds.includes(title.id));
  const seenPairs = new Set((session.history || []).map((entry) => buildMatchKey(entry.leftId, entry.rightId)));
  const candidates = titleIds
    .map((id) => ({ id, ...getRatingEntry(ratings, id) }))
    .sort((a, b) => {
      const comparisonsDiff = Number(a.comparisons || 0) - Number(b.comparisons || 0);
      if (comparisonsDiff !== 0) return comparisonsDiff;
      return Number(b.score || BASE_RATING) - Number(a.score || BASE_RATING);
    });

  const ranking = buildRanking({
    ...session,
    ratings,
    titles: activeTitles,
  });
  const playoffCandidates = getTopRankBoundaryGaps(ranking)
    .filter((entry) => entry.gap <= CLOSE_SCORE_GAP)
    .sort((a, b) => a.gap - b.gap);

  for (const entry of playoffCandidates) {
    if (!seenPairs.has(buildMatchKey(entry.leftId, entry.rightId))) {
      return {
        leftId: entry.leftId,
        rightId: entry.rightId,
      };
    }
  }

  let bestPair = null;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (const leftCandidate of candidates) {
    const rightOptions = candidates
      .filter((candidate) => candidate.id !== leftCandidate.id)
      .filter((candidate) => !seenPairs.has(buildMatchKey(leftCandidate.id, candidate.id)))
      .sort((a, b) => getPairPriority(leftCandidate, b) - getPairPriority(leftCandidate, a));

    if (rightOptions.length > 0) {
      const priority = getPairPriority(leftCandidate, rightOptions[0]);
      if (priority > bestPriority) {
        bestPriority = priority;
        bestPair = {
          leftId: leftCandidate.id,
          rightId: rightOptions[0].id,
        };
      }
    }
  }

  if (bestPair) {
    return bestPair;
  }

  for (const leftCandidate of candidates) {
    const rightCandidate = candidates.find((candidate) => candidate.id !== leftCandidate.id);
    if (rightCandidate) {
      return {
        leftId: leftCandidate.id,
        rightId: rightCandidate.id,
      };
    }
  }

  return null;
}

function chooseNextPair(session) {
  if (session?.fastState?.phase === 'knockout') {
    return getFastKnockoutPair(session);
  }

  if (session?.fastState?.phase === 'playoff') {
    return choosePlayoffPair(session, session.fastState.activeIds);
  }

  return choosePlayoffPair(session);
}

function applyVoteToRatings(ratings, vote) {
  const nextRatings = { ...ratings };
  const left = { ...getRatingEntry(nextRatings, vote.leftId) };
  const right = { ...getRatingEntry(nextRatings, vote.rightId) };

  if (vote.result === 'skip') {
    left.skips = Number(left.skips || 0) + 1;
    right.skips = Number(right.skips || 0) + 1;
    nextRatings[vote.leftId] = left;
    nextRatings[vote.rightId] = right;
    return nextRatings;
  }

  const leftExpected = getExpectedScore(left.score, right.score);
  const rightExpected = getExpectedScore(right.score, left.score);
  const leftK = getKFactor(left.comparisons);
  const rightK = getKFactor(right.comparisons);
  const actualScore = vote.result === 'left'
    ? { left: 1, right: 0 }
    : vote.result === 'right'
      ? { left: 0, right: 1 }
      : { left: 0.5, right: 0.5 };

  left.comparisons = Number(left.comparisons || 0) + 1;
  right.comparisons = Number(right.comparisons || 0) + 1;

  if (vote.result === 'left') {
    left.wins = Number(left.wins || 0) + 1;
    right.losses = Number(right.losses || 0) + 1;
  } else if (vote.result === 'right') {
    right.wins = Number(right.wins || 0) + 1;
    left.losses = Number(left.losses || 0) + 1;
  } else if (vote.result === 'tie') {
    left.ties = Number(left.ties || 0) + 1;
    right.ties = Number(right.ties || 0) + 1;
  }

  left.score = roundRating(Number(left.score || BASE_RATING) + (leftK * (actualScore.left - leftExpected)));
  right.score = roundRating(Number(right.score || BASE_RATING) + (rightK * (actualScore.right - rightExpected)));

  nextRatings[vote.leftId] = left;
  nextRatings[vote.rightId] = right;
  return nextRatings;
}

function buildRanking(session) {
  const ratings = session.ratings || {};
  return session.titles
    .map((title) => ({
      ...title,
      ...(ratings[title.id] || {}),
    }))
    .sort((a, b) => {
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const winsDiff = Number(b.wins || 0) - Number(a.wins || 0);
      if (winsDiff !== 0) return winsDiff;
      const comparisonDiff = Number(b.comparisons || 0) - Number(a.comparisons || 0);
      if (comparisonDiff !== 0) return comparisonDiff;
      const lossesDiff = Number(a.losses || 0) - Number(b.losses || 0);
      if (lossesDiff !== 0) return lossesDiff;
      return Number(b.popularity || 0) - Number(a.popularity || 0);
    });
}

function buildFastFinalRanking(session) {
  const fastState = session.fastState || {};
  const titleMap = new Map((session.titles || []).map((title) => [title.id, title]));
  const activeIds = fastState.activeIds || [];
  const activeRanking = buildRanking({
    ...session,
    titles: (session.titles || []).filter((title) => activeIds.includes(title.id)),
  });
  const eliminatedRanking = [...(fastState.eliminated || [])]
    .sort((left, right) => {
      const stageDiff = Number(left.stageSize || 0) - Number(right.stageSize || 0);
      if (stageDiff !== 0) return stageDiff;
      const scoreDiff = Number(right.score || BASE_RATING) - Number(left.score || BASE_RATING);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(left.seedRank || 0) - Number(right.seedRank || 0);
    })
    .map((entry) => ({
      ...titleMap.get(entry.titleId),
      ...getRatingEntry(session.ratings, entry.titleId),
    }));

  return [...activeRanking, ...eliminatedRanking];
}

function tierLabel(index, total) {
  if (index === 0) return 'S';
  if (index < Math.ceil(total * 0.2)) return 'A';
  if (index < Math.ceil(total * 0.45)) return 'B';
  if (index < Math.ceil(total * 0.7)) return 'C';
  return 'D';
}

function enrichWithResults(session) {
  const ranking = session?.fastState ? buildFastFinalRanking(session) : buildRanking(session);
  return {
    ...session,
    ranking,
    tiers: ranking.map((title, index) => ({
      titleId: title.id,
      tier: tierLabel(index, ranking.length),
    })),
    winnerId: ranking[0]?.id || null,
  };
}

export function getBattlePresets() {
  return BATTLE_PRESETS;
}

export function buildBattleDeck(titles, filters = {}, options = {}) {
  const visibleTitles = applyBattleVisibilityRules(titles, options);
  const deckTitles = pickDeckTitles(visibleTitles, filters);
  return {
    key: buildDeckSignature(filters),
    fingerprint: buildDeckFingerprintFromTitles(deckTitles),
    label: filters.label || buildDeckLabel(filters),
    filters: normalizeDeckFilters(filters),
    sourceCount: visibleTitles.length,
    titles: deckTitles,
  };
}

export function createStoredBattleDeck(deck, options = {}) {
  const now = new Date().toISOString();
  const titles = (deck?.titles || []).map(serializeTitle);
  const filters = normalizeDeckFilters(deck?.filters || {});
  const label = String(deck?.label || buildDeckLabel(filters) || 'Custom deck').trim();

  return {
    id: makeId(),
    kind: 'custom',
    key: deck?.key || buildDeckSignature(filters),
    fingerprint: deck?.fingerprint || buildDeckFingerprintFromTitles(titles),
    label,
    filters,
    sourceCount: Number(options.sourceCount || deck?.sourceCount || titles.length),
    titles,
    isPublic: Boolean(options.isPublic ?? deck?.isPublic),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBattleSession(deck, options = {}) {
  const titles = (deck.titles || []).map(serializeTitle);
  const now = new Date().toISOString();
  const targetRounds = getFastTargetRounds(titles.length);
  const seedKey = `${deck.fingerprint || buildDeckFingerprintFromTitles(titles)}:${now}:${Math.random().toString(36).slice(2, 10)}`;
  const fastState = createFastState(titles, seedKey);
  const baseSession = {
    id: makeId(),
    deckKey: deck.key,
    deckFingerprint: deck.fingerprint || buildDeckFingerprintFromTitles(titles),
    seedKey,
    deckLabel: deck.label,
    filters: deck.filters,
    titles,
    titleIds: titles.map((title) => title.id),
    targetRounds,
    history: [],
    ratings: createInitialRatings(titles),
    snapshot: {
      catalogCount: Number(options.catalogCount || deck.sourceCount || titles.length),
      hiddenExcludedCount: Number(options.hiddenExcludedCount || 0),
      excludesAdultContent: Boolean(options.excludesAdultContent),
      createdAt: now,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
    currentPair: null,
    fastState,
  };
  const currentPair = chooseNextPair(baseSession);
  return {
    ...baseSession,
    currentPair,
  };
}

export function getStoredBattleSessions() {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(BATTLE_SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getStoredBattleDecks() {
  const storage = safeLocalStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(BATTLE_DECKS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map((deck) => ({
        ...deck,
        isPublic: Boolean(deck?.isPublic),
      }))
      : [];
  } catch {
    return [];
  }
}

export function saveStoredBattleDeck(deck) {
  const storage = safeLocalStorage();
  if (!storage || !deck) return deck;
  const now = new Date().toISOString();
  const normalizedDeck = {
    ...deck,
    updatedAt: now,
    createdAt: deck.createdAt || now,
    filters: normalizeDeckFilters(deck.filters),
    titles: (deck.titles || []).map(serializeTitle),
    isPublic: Boolean(deck.isPublic),
  };
  const decks = getStoredBattleDecks();
  const nextDecks = [normalizedDeck, ...decks.filter((entry) => entry.id !== normalizedDeck.id)].slice(0, 20);
  storage.setItem(BATTLE_DECKS_KEY, JSON.stringify(nextDecks));
  return normalizedDeck;
}

export function deleteStoredBattleDeck(deckId) {
  const storage = safeLocalStorage();
  if (!storage) return;
  const nextDecks = getStoredBattleDecks().filter((deck) => deck.id !== deckId);
  storage.setItem(BATTLE_DECKS_KEY, JSON.stringify(nextDecks));
}

export function getBattleSession(sessionId) {
  return getStoredBattleSessions().find((session) => session.id === sessionId) || null;
}

export function saveBattleSession(session) {
  const storage = safeLocalStorage();
  if (!storage || !session) return session;
  const sessions = getStoredBattleSessions();
  const nextSessions = [session, ...sessions.filter((entry) => entry.id !== session.id)].slice(0, RECENT_BATTLE_SESSION_LIMIT);
  storage.setItem(BATTLE_SESSIONS_KEY, JSON.stringify(nextSessions));
  return session;
}

export function deleteBattleSession(sessionId) {
  const storage = safeLocalStorage();
  if (!storage) return;
  const nextSessions = getStoredBattleSessions().filter((session) => session.id !== sessionId);
  storage.setItem(BATTLE_SESSIONS_KEY, JSON.stringify(nextSessions));
}

export function recordBattleVote(session, result) {
  if (!session?.currentPair) return session;

  const vote = {
    id: makeId(),
    leftId: session.currentPair.leftId,
    rightId: session.currentPair.rightId,
    result,
    createdAt: new Date().toISOString(),
  };
  const updatedRatings = applyVoteToRatings(session.ratings, vote);
  const updatedSession = {
    ...session,
    history: [...(session.history || []), vote],
    ratings: updatedRatings,
    updatedAt: new Date().toISOString(),
  };

  let nextSession = updatedSession;

  if (session.fastState?.phase === 'knockout') {
    const seedRankMap = buildSeedRankMap(session.fastState.seedOrder);
    const resolved = resolveBracketWinner(result, vote.leftId, vote.rightId, updatedRatings, seedRankMap);
    const activeIds = session.fastState.activeIds || [];
    const nextRoundWinners = [...(session.fastState.roundWinners || []), resolved.winnerId];
    const eliminated = [
      ...(session.fastState.eliminated || []),
      {
        titleId: resolved.loserId,
        stageSize: activeIds.length,
        score: getRatingEntry(updatedRatings, resolved.loserId).score,
        seedRank: seedRankMap.get(resolved.loserId) ?? Number.MAX_SAFE_INTEGER,
      },
    ];
    const isRoundComplete = (session.fastState.pairIndex + 1) >= (session.fastState.roundPairs || []).length;

    if (!isRoundComplete) {
      nextSession = {
        ...updatedSession,
        fastState: {
          ...session.fastState,
          pairIndex: session.fastState.pairIndex + 1,
          roundWinners: nextRoundWinners,
          eliminated,
        },
      };
    } else {
      const nextActiveIds = nextRoundWinners;
      if (nextActiveIds.length <= FAST_PLAYOFF_SIZE) {
        nextSession = {
          ...updatedSession,
          fastState: {
            ...session.fastState,
            phase: 'playoff',
            activeIds: nextActiveIds,
            roundPairs: [],
            pairIndex: 0,
            roundWinners: [],
            eliminated,
          },
        };
      } else {
        const nextRound = createKnockoutRound(nextActiveIds, updatedRatings, session.fastState.seedOrder, true);
        nextSession = {
          ...updatedSession,
          fastState: {
            ...session.fastState,
            activeIds: nextActiveIds,
            roundPairs: nextRound.roundPairs,
            pairIndex: 0,
            roundWinners: nextRound.autoAdvanceIds,
            eliminated,
          },
        };
      }
    }
  }

  const nextPair = chooseNextPair(nextSession);
  const shouldComplete = !nextPair || (
    nextSession.fastState?.phase === 'playoff'
      ? !shouldContinueBattle(nextSession)
      : false
  );

  if (shouldComplete) {
    return finalizeBattleSession({
      ...nextSession,
      currentPair: null,
    });
  }

  return {
    ...nextSession,
    currentPair: nextPair,
  };
}

export function undoBattleVote(session) {
  const history = [...(session?.history || [])];
  if (history.length === 0) return session;

  history.pop();
  const rebuiltSession = {
    ...session,
    history: [],
    ratings: createInitialRatings(session.titles),
    status: 'active',
    completedAt: null,
    ranking: null,
    tiers: null,
    winnerId: null,
    fastState: createFastState(session.titles, session.deckFingerprint || buildDeckFingerprintFromTitles(session.titles)),
  };

  const replayed = history.reduce((currentSession, vote) => recordBattleVote(currentSession, vote.result), rebuiltSession);

  return {
    ...replayed,
    currentPair: chooseNextPair(replayed),
    updatedAt: new Date().toISOString(),
  };
}

export function finalizeBattleSession(session) {
  const completedSession = enrichWithResults({
    ...session,
    status: 'completed',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentPair: null,
  });
  return completedSession;
}

export function getLiveBattleRanking(session) {
  if (!session) return [];
  if (session.fastState?.phase === 'playoff') {
    return buildRanking({
      ...session,
      titles: (session.titles || []).filter((title) => (session.fastState.activeIds || []).includes(title.id)),
    });
  }
  return buildRanking(session);
}

export function restartBattleSession(session) {
  return createBattleSession({
    key: session.deckKey,
    fingerprint: session.deckFingerprint || buildDeckFingerprintFromTitles(session.titles),
    label: session.deckLabel,
    filters: session.filters,
    titles: session.titles,
  }, {
    catalogCount: session.snapshot?.catalogCount,
    hiddenExcludedCount: session.snapshot?.hiddenExcludedCount,
    excludesAdultContent: session.snapshot?.excludesAdultContent,
  });
}

export function getBattleSessionSummary(session) {
  if (!session) return null;
  const completedSession = session.status === 'completed' ? session : enrichWithResults(session);
  const winner = completedSession.ranking?.[0] || null;
  return {
    id: completedSession.id,
    deckLabel: completedSession.deckLabel,
    deckKey: completedSession.deckKey,
    winner,
    topThree: completedSession.ranking?.slice(0, 3) || [],
    completedAt: completedSession.completedAt,
    comparisonCount: getBattleDecisionCount(completedSession),
  };
}

export function buildBattleShareText(session) {
  const summary = getBattleSessionSummary(session);
  if (!summary) return '';
  const topLine = summary.topThree
    .map((title, index) => `${index + 1}. ${title.title_th || title.title_en}`)
    .join('\n');
  return `My ${BRAND_NAME} Battle Result\nDeck: ${summary.deckLabel}\nWinner: ${summary.winner?.title_th || summary.winner?.title_en || '-'}\nRounds: ${summary.comparisonCount}\n${topLine}`;
}

export function collectBattleFilters(titles) {
  const genres = uniqueValues((titles || []).flatMap((title) => title.genres || [])).sort();
  const tags = uniqueValues((titles || []).flatMap((title) => title.tags || [])).sort();
  const moods = uniqueValues((titles || []).flatMap((title) => title.moods || [])).sort();
  return {
    genres,
    tags,
    moods,
  };
}
