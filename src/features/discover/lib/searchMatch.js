import { MOODS } from '../../../shared/data/moods';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[×✕✖]/g, ' x ')
    .replace(/&/g, ' and ')
    .replace(/['’`´]/g, '')
    .replace(/[_./\\|:+;!?()[\]{}-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const BROAD_DISCOVER_TERMS = new Set([
  'action',
  'adventure',
  'all',
  'anime',
  'bittersweet',
  'best',
  'comedy',
  'community',
  'cozy',
  'cute',
  'dark',
  'drama',
  'fantasy',
  'funny',
  'healing',
  'horror',
  'isekai',
  'light',
  'manga',
  'manhwa',
  'new',
  'people',
  'popular',
  'post',
  'posts',
  'profile',
  'profiles',
  'romance',
  'romantic',
  'sad',
  'search',
  'tier list',
  'tier lists',
  'tierlist',
  'tierlists',
  'thriller',
  'top',
  ...MOODS.flatMap((mood) => [mood.id, ...(mood.tags || [])].map(normalizeSearchText)),
]);

export function getSearchPhrase(query) {
  return normalizeSearchText(query);
}

export function getSearchTokens(query) {
  return [...new Set(
    normalizeSearchText(query)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 6)
  )];
}

export function getSearchTerms(query) {
  const tokens = getSearchTokens(query);
  const phrase = getSearchPhrase(query);
  const terms = [];

  if (phrase.length >= 2 && tokens.length >= 2) {
    terms.push({
      kind: 'phrase',
      value: phrase,
      pattern: escapeRegExp(phrase).replace(/\s+/g, '\\s+'),
    });
  }

  tokens.forEach((token) => {
    if (!terms.some((term) => term.value === token)) {
      terms.push({
        kind: 'token',
        value: token,
        pattern: escapeRegExp(token),
      });
    }
  });

  return terms;
}

export function buildSearchPattern(query) {
  const terms = getSearchTerms(query);
  if (terms.length === 0) {
    return null;
  }

  return new RegExp(`(${terms.map((term) => term.pattern).join('|')})`, 'gi');
}

// Detect the dominant script of the query to enable language-aware ranking.
// Returns 'thai' | 'latin' | 'mixed'.
function detectQueryScript(raw) {
  const thaiCount = (raw.match(/[\u0E00-\u0E7F]/g) || []).length;
  const latinCount = (raw.match(/[a-zA-Z]/g) || []).length;
  if (thaiCount === 0 && latinCount === 0) return 'mixed';
  if (thaiCount > 0 && latinCount === 0) return 'thai';
  if (thaiCount === 0 && latinCount > 0) return 'latin';
  // Mixed: dominant script wins at a 2:1 ratio, otherwise 'mixed'
  if (thaiCount >= latinCount * 2) return 'thai';
  if (latinCount >= thaiCount * 2) return 'latin';
  return 'mixed';
}

export function getSearchIntent(query) {
  const raw = String(query || '').trim();
  const phrase = getSearchPhrase(query);
  const tokens = getSearchTokens(query);
  const isEmpty = raw.length === 0;
  const isShort = !isEmpty && raw.length < 2;
  const isBroad = BROAD_DISCOVER_TERMS.has(phrase);

  return {
    raw,
    phrase,
    tokens,
    isEmpty,
    isShort,
    isBroad,
    shouldUseFallback: isShort || isBroad,
    mode: isEmpty ? 'idle' : isShort ? 'short' : isBroad ? 'broad' : 'focused',
    queryScript: detectQueryScript(raw),
  };
}

export function textMatchesQuery(text, query, options = {}) {
  const tokens = Array.isArray(query) ? query : getSearchTokens(query);
  const phrase = Array.isArray(query) ? '' : getSearchPhrase(query);
  const content = normalizeSearchText(text);

  if (!content || tokens.length === 0) {
    return false;
  }

  if (phrase && tokens.length >= 2 && content.includes(phrase)) {
    return true;
  }

  return tokens.some((token) => {
    if (content.includes(token)) {
      return true;
    }

    if (!options.allowTypo || token.length < 4) {
      return false;
    }

    const bestDistance = getBestFuzzyDistance(token, getComparableWords(content, options.maxWordCount), resolveTypoDistance(token));
    return Number.isFinite(bestDistance);
  });
}

export function collectMatchReasonKeys(query, candidates = [], limit = 3) {
  const tokens = getSearchTokens(query);
  const phrase = getSearchPhrase(query);

  if (tokens.length === 0) {
    return [];
  }

  return candidates
    .map((candidate) => {
      const texts = Array.isArray(candidate?.texts) ? candidate.texts : [];
      const score = texts.reduce((best, text) => (
        Math.max(best, scoreSingleText(text, tokens, phrase))
      ), 0);

      return {
        reasonKey: candidate?.reasonKey,
        score,
      };
    })
    .filter((candidate) => candidate.reasonKey && candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((candidate) => candidate.reasonKey)
    .slice(0, limit);
}

function resolveMatchWeights(matchWeights = {}) {
  return {
    exactPhrase: 180,
    prefixPhrase: 120,
    containsPhrase: 80,
    exactToken: 70,
    wordBoundary: 42,
    prefixToken: 30,
    containsToken: 16,
    typoToken: 14,
    ...matchWeights,
  };
}

function getComparableWords(content, maxWordCount = 28) {
  return [...new Set(
    String(content || '')
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .slice(0, maxWordCount)
  )];
}

function resolveTypoDistance(token) {
  if (token.length >= 8) return 2;
  return 1;
}

function damerauLevenshteinWithinLimit(left, right, limit) {
  if (left === right) return 0;
  if (!left || !right) return Math.abs(left.length - right.length);
  if (Math.abs(left.length - right.length) > limit) return Infinity;

  const rows = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    let smallestInRow = Infinity;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost
      );

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        value = Math.min(value, rows[i - 2][j - 2] + cost);
      }

      rows[i][j] = value;
      smallestInRow = Math.min(smallestInRow, value);
    }

    if (smallestInRow > limit) {
      return Infinity;
    }
  }

  return rows[left.length][right.length] <= limit ? rows[left.length][right.length] : Infinity;
}

function getBestFuzzyDistance(token, words, maxDistance) {
  let bestDistance = Infinity;

  words.forEach((word) => {
    if (word.length < 4) {
      return;
    }

    const distance = damerauLevenshteinWithinLimit(token, word, maxDistance);
    if (distance < bestDistance) {
      bestDistance = distance;
    }
  });

  return bestDistance;
}

function applyLongTextPenalty(score, content, config = {}) {
  if (!score || !config?.longTextPenalty) {
    return score;
  }

  const threshold = Number(config.longTextPenalty.threshold || 120);
  const floor = Number(config.longTextPenalty.floor || 0.35);
  if (content.length <= threshold) {
    return score;
  }

  const overflow = Math.min(content.length - threshold, threshold * 2);
  const ratio = overflow / (threshold * 2);
  return score * Math.max(floor, 1 - ratio);
}

function scoreSingleText(text, tokens, phrase, matchWeights = null, config = null) {
  const content = normalizeSearchText(text);

  if (!content || tokens.length === 0) {
    return 0;
  }

  const weights = resolveMatchWeights(matchWeights);
  const comparableWords = config?.allowTypo ? getComparableWords(content, config?.maxWordCount) : [];
  let score = 0;

  if (phrase) {
    if (content === phrase) {
      score += weights.exactPhrase;
    } else if (content.startsWith(phrase)) {
      score += weights.prefixPhrase;
    } else if (content.includes(phrase)) {
      score += weights.containsPhrase;
    }
  }

  tokens.forEach((token) => {
    const tokenPattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');

    if (content === token) {
      score += weights.exactToken;
    } else if (tokenPattern.test(content)) {
      score += weights.wordBoundary;
    } else if (content.startsWith(token)) {
      score += weights.prefixToken;
    } else if (content.includes(token)) {
      score += weights.containsToken;
    } else if (config?.allowTypo && token.length >= 4) {
      const bestDistance = getBestFuzzyDistance(token, comparableWords, resolveTypoDistance(token));
      if (bestDistance === 1) {
        score += weights.typoToken;
      } else if (bestDistance === 2) {
        score += Math.round(weights.typoToken * 0.58);
      }
    }
  });

  return applyLongTextPenalty(score, content, config);
}

export function scoreSearchCandidates(query, candidates = []) {
  const tokens = Array.isArray(query) ? query : getSearchTokens(query);
  const phrase = Array.isArray(query) ? '' : getSearchPhrase(query);

  if (tokens.length === 0) {
    return 0;
  }

  return candidates.reduce((total, candidate) => {
    const weight = Number(candidate?.weight || 1);
    const texts = Array.isArray(candidate?.texts) ? candidate.texts : [];
    const matchWeights = candidate?.matchWeights || null;
    const bestTextScore = texts.reduce((best, text) => (
      Math.max(best, scoreSingleText(text, tokens, phrase, matchWeights, candidate))
    ), 0);

    return total + (bestTextScore * weight);
  }, 0);
}

export function sortBySearchRelevance(items = [], query = '', getCandidates, fallbackCompare = null) {
  const tokens = getSearchTokens(query);

  if (!tokens.length) {
    return [...items];
  }

  return [...items].sort((left, right) => {
    const leftScore = scoreSearchCandidates(query, getCandidates(left));
    const rightScore = scoreSearchCandidates(query, getCandidates(right));

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    if (typeof fallbackCompare === 'function') {
      return fallbackCompare(left, right);
    }

    return 0;
  });
}
