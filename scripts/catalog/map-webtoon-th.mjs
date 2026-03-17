import { normalizeCatalogTitle, supabaseAdmin } from './catalog-upsert.mjs';

const WEBTOON_BASE_URL = 'https://www.webtoons.com';
const WEBTOON_SEARCH_URL = `${WEBTOON_BASE_URL}/th/search/originals`;
const DEFAULT_REGION_CODE = 'TH';
const DEFAULT_PLATFORM_NAME = 'WEBTOON';
const MAX_SEARCH_RESULTS = 24;
const MIN_MATCH_SCORE = 0.9;
const REQUEST_TIMEOUT_MS = 15000;
const STOPWORDS = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'is', 'my', 'of', 'on', 'or', 'the', 'to', 'with', 'your']);

function parseArgs(argv) {
  const args = {
    commit: false,
    limit: null,
    query: '',
    titleId: null,
    type: 'manhwa',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--commit') args.commit = true;
    if (value === '--limit') args.limit = Number(argv[index + 1] || 0) || null;
    if (value === '--query') args.query = String(argv[index + 1] || '').trim();
    if (value === '--title-id') args.titleId = Number(argv[index + 1] || 0) || null;
    if (value === '--type') args.type = String(argv[index + 1] || 'manhwa').trim() || 'manhwa';
  }

  return args;
}

function collectAliases(title) {
  const rankedAliases = [
    {
      value: title.canonical_title,
      rank: 0,
      aliasType: 'canonical',
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
      aliasType: item.alias_type || '',
    }))),
  ];

  return rankedAliases
    .map((item) => ({
      ...item,
      value: String(item.value || '').trim(),
    }))
    .filter((item) => item.value && item.value.length >= 2)
    .filter((item) => {
      if (item.aliasType !== 'synonym') {
        return true;
      }

      return tokenize(item.value).length >= 2;
    })
    .sort((left, right) => left.rank - right.rank || right.value.length - left.value.length)
    .map((item) => item.value)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function normalizeForScore(value) {
  return normalizeCatalogTitle(value)
    .replace(/\b(manwha|manhwa|manga|manhua|webtoon|comic|thailand|thai)\b/g, ' ')
    .replace(/\b(a|an|and|at|for|from|in|is|my|of|on|or|the|to|with|your)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeForScore(value)
    .split(' ')
    .filter((token) => token && token.length >= 2 && !STOPWORDS.has(token));
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
      normalizedCandidate.length >= 4 &&
      normalizedAlias.length >= 4 &&
      (
        normalizedCandidate.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedCandidate)
      )
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
  const pattern = /<a href="(https:\/\/www\.webtoons\.com\/th\/[^"]+\/list\?title_no=\d+)"[^>]*class="link _card_item"[^>]*>([\s\S]{0,1200}?)<\/a>/g;
  const results = [];

  for (const match of html.matchAll(pattern)) {
    const title = (match[2].match(/<strong class="title">([^<]+)<\/strong>/) || [])[1] || '';
    results.push({
      url: String(match[1] || '').trim(),
      title: String(title || '').trim(),
    });
    if (results.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }

  return results.filter((result, index, array) => (
    result.url &&
    result.title &&
    array.findIndex((item) => item.url === result.url) === index
  ));
}

async function searchWebtoon(query) {
  const response = await fetch(`${WEBTOON_SEARCH_URL}?keyword=${encodeURIComponent(query)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ProjectPunlan WEBTOON Mapper)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`WEBTOON search failed for "${query}" with status ${response.status}`);
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
  const { data: existingRows, error: selectError } = await supabaseAdmin
    .from('title_availability')
    .select('id, url, is_official')
    .eq('canonical_title_id', titleId)
    .eq('platform_name', DEFAULT_PLATFORM_NAME)
    .eq('region_code', DEFAULT_REGION_CODE)
    .limit(5);

  if (selectError) throw selectError;

  const existingRow = (existingRows || [])[0] || null;

  if (existingRow) {
    if (existingRow.url === url && existingRow.is_official === true) {
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('title_availability')
      .update({
        url,
        is_official: true,
      })
      .eq('id', existingRow.id);

    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('title_availability')
    .insert({
      canonical_title_id: titleId,
      platform_name: DEFAULT_PLATFORM_NAME,
      region_code: DEFAULT_REGION_CODE,
      url,
      is_official: true,
    });

  if (insertError) throw insertError;
}

async function mapTitle(title, commit) {
  const aliases = collectAliases(title);
  const existingWebtoon = (title.availability || []).find((item) => (
    item.platform_name === DEFAULT_PLATFORM_NAME &&
    item.region_code === DEFAULT_REGION_CODE &&
    item.is_official !== false
  ));

  if (existingWebtoon) {
    return {
      titleId: title.id,
      canonicalTitle: title.canonical_title,
      status: 'skipped-existing',
      url: existingWebtoon.url,
      score: 1,
    };
  }

  let bestMatch = null;

  for (const alias of aliases.slice(0, 6)) {
    const results = await searchWebtoon(alias);
    for (const candidate of results) {
      const score = computeMatchScore(candidate.title, aliases);
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

  if (!bestMatch || bestMatch.score < MIN_MATCH_SCORE) {
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
