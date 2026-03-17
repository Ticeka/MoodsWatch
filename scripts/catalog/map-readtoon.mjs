import { normalizeCatalogTitle, supabaseAdmin } from './catalog-upsert.mjs';

const READTOON_BASE_URL = 'https://readtoon.com';
const DEFAULT_REGION_CODE = 'TH';
const DEFAULT_PLATFORM_NAME = 'ReadToon';
const MAX_SEARCH_RESULTS = 24;

function parseArgs(argv) {
  const args = {
    commit: false,
    limit: null,
    query: '',
    titleId: null,
    type: 'all',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--commit') args.commit = true;
    if (value === '--limit') args.limit = Number(argv[index + 1] || 0) || null;
    if (value === '--query') args.query = String(argv[index + 1] || '').trim();
    if (value === '--title-id') args.titleId = Number(argv[index + 1] || 0) || null;
    if (value === '--type') args.type = String(argv[index + 1] || 'all').trim() || 'all';
  }

  return args;
}

function collectAliases(title) {
  const rankedAliases = [
    {
      value: title.canonical_title,
      rank: 0,
    },
    ...((title.aliases || []).map((item) => ({
      value: item.alias,
      rank:
        item.language_code === 'th' ? 1 :
        item.language_code === 'en' ? 2 :
        item.alias_type === 'english' ? 3 :
        item.alias_type === 'localized' ? 4 :
        item.alias_type === 'native' ? 5 :
        item.alias_type === 'romaji' ? 6 :
        7,
    }))),
  ];

  return rankedAliases
    .map((item) => ({
      ...item,
      value: String(item.value || '').trim(),
    }))
    .filter((item) => item.value && item.value.length >= 2)
    .sort((left, right) => left.rank - right.rank || right.value.length - left.value.length)
    .map((item) => item.value)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function normalizeForScore(value) {
  return normalizeCatalogTitle(value)
    .replace(/\b(manwha|manhwa|manga|manhua|webtoon|comic)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeForScore(value).split(' ').filter(Boolean);
}

function computeMatchScore(candidateTitle, aliases) {
  const normalizedCandidate = normalizeForScore(candidateTitle);
  if (!normalizedCandidate) {
    return 0;
  }

  let bestScore = 0;
  for (const alias of aliases) {
    const normalizedAlias = normalizeForScore(alias);
    if (!normalizedAlias) {
      continue;
    }

    if (normalizedCandidate === normalizedAlias) {
      bestScore = Math.max(bestScore, 1);
      continue;
    }

    if (
      normalizedCandidate.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedCandidate)
    ) {
      bestScore = Math.max(bestScore, 0.92);
    }

    const candidateTokens = tokenize(candidateTitle);
    const aliasTokens = tokenize(alias);
    if (!candidateTokens.length || !aliasTokens.length) {
      continue;
    }

    const aliasTokenSet = new Set(aliasTokens);
    const overlap = candidateTokens.filter((token) => aliasTokenSet.has(token)).length;
    if (!overlap) {
      continue;
    }

    const coverage = overlap / Math.max(aliasTokens.length, candidateTokens.length);
    const candidateCoverage = overlap / candidateTokens.length;
    const aliasCoverage = overlap / aliasTokens.length;
    const tokenScore = (coverage * 0.5) + (candidateCoverage * 0.25) + (aliasCoverage * 0.25);
    bestScore = Math.max(bestScore, tokenScore);
  }

  return Number(bestScore.toFixed(4));
}

function extractSearchResults(html) {
  const pattern = /<a[^>]+href="(\/content\/[^"]+)"[^>]*>\s*(?:<img[^>]*alt="([^"]*)"[^>]*>\s*)?<\/a>\s*<div[^>]*>\s*<a[^>]+href="\1"[^>]*><h3[^>]*>([^<]+)<\/h3><\/a>/g;
  const results = [];

  for (const match of html.matchAll(pattern)) {
    results.push({
      path: match[1],
      url: `${READTOON_BASE_URL}${match[1]}`,
      imageAlt: String(match[2] || '').trim(),
      title: String(match[3] || '').trim(),
    });
    if (results.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return results;
}

async function searchReadToon(query) {
  const response = await fetch(`${READTOON_BASE_URL}/?s=${encodeURIComponent(query)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ProjectPunlan ReadToon Mapper)',
    },
  });

  if (!response.ok) {
    throw new Error(`ReadToon search failed for "${query}" with status ${response.status}`);
  }

  const html = await response.text();
  return extractSearchResults(html);
}

async function loadTitles({ limit, query, titleId, type }) {
  let request = supabaseAdmin
    .from('canonical_titles')
    .select(`
      id,
      canonical_title,
      type,
      subtype,
      aliases:title_aliases(alias, language_code, alias_type),
      availability:title_availability(platform_name, url, region_code, is_official)
    `)
    .order('id', { ascending: true });

  if (titleId) {
    request = request.eq('id', titleId);
  }

  if (query) {
    const escaped = query.replace(/[%_,]/g, '').trim();
    request = request.or(`canonical_title.ilike.%${escaped}%`);
  }

  if (type && type !== 'all') {
    if (type === 'manhwa') {
      request = request.eq('type', 'manga').eq('subtype', 'manhwa');
    } else if (type === 'manga') {
      request = request.eq('type', 'manga').neq('subtype', 'manhwa');
    } else {
      request = request.eq('type', type);
    }
  }

  if (limit) {
    request = request.limit(limit);
  }

  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

async function upsertAvailability(titleId, url) {
  const payload = {
    canonical_title_id: titleId,
    platform_name: DEFAULT_PLATFORM_NAME,
    region_code: DEFAULT_REGION_CODE,
    url,
    is_official: false,
  };

  const { error } = await supabaseAdmin
    .from('title_availability')
    .upsert(payload, { onConflict: 'canonical_title_id,platform_name,region_code,url' });

  if (error) throw error;
}

async function mapTitle(title, commit) {
  const aliases = collectAliases(title);
  const existingReadToon = (title.availability || []).find((item) => item.platform_name === DEFAULT_PLATFORM_NAME);
  if (existingReadToon) {
    return {
      titleId: title.id,
      canonicalTitle: title.canonical_title,
      status: 'skipped-existing',
      url: existingReadToon.url,
      score: 1,
    };
  }

  let bestMatch = null;

  for (const alias of aliases.slice(0, 6)) {
    const results = await searchReadToon(alias);
    for (const candidate of results) {
      const score = computeMatchScore(candidate.title || candidate.imageAlt, aliases);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...candidate,
          score,
          query: alias,
        };
      }
    }

    if (bestMatch?.score === 1) {
      break;
    }
  }

  if (!bestMatch || bestMatch.score < 0.86) {
    return {
      titleId: title.id,
      canonicalTitle: title.canonical_title,
      status: 'unmatched',
      score: bestMatch?.score || 0,
      url: bestMatch && bestMatch.score > 0 ? bestMatch.url : null,
      query: bestMatch?.query || aliases[0] || '',
    };
  }

  if (commit) {
    await upsertAvailability(title.id, bestMatch.url);
  }

  return {
    titleId: title.id,
    canonicalTitle: title.canonical_title,
    status: commit ? 'mapped' : 'matched-dry-run',
    score: bestMatch.score,
    url: bestMatch.url,
    query: bestMatch.query,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const titles = await loadTitles(args);

  console.log(`Loaded ${titles.length} title(s)`);
  console.log(args.commit ? 'Mode: commit' : 'Mode: dry-run');

  const summary = {
    mapped: 0,
    skippedExisting: 0,
    unmatched: 0,
  };

  for (const title of titles) {
    try {
      const result = await mapTitle(title, args.commit);
      if (result.status === 'mapped' || result.status === 'matched-dry-run') summary.mapped += 1;
      if (result.status === 'skipped-existing') summary.skippedExisting += 1;
      if (result.status === 'unmatched') summary.unmatched += 1;

      console.log(JSON.stringify(result));
    } catch (error) {
      console.error(JSON.stringify({
        titleId: title.id,
        canonicalTitle: title.canonical_title,
        status: 'error',
        message: error.message,
      }));
    }
  }

  console.log('Summary:', summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
