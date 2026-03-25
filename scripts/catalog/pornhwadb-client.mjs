import { setTimeout as sleep } from 'node:timers/promises';
import { loadEnv } from './load-env.mjs';

loadEnv();

const PORNHWADB_API_URL = 'https://pornhwadb.com/api/v1';

function requireApiKey() {
  const apiKey = process.env.PORNHWADB_API_KEY;
  if (!apiKey) {
    throw new Error('Missing PORNHWADB_API_KEY in environment');
  }
  return apiKey;
}

function appendParams(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
}

async function fetchPornhwaDb(path, { params, signal, maxRetries = 3 } = {}) {
  const url = new URL(path.replace(/^\//, ''), `${PORNHWADB_API_URL}/`);
  appendParams(url, params);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-api-key': requireApiKey(),
      },
      signal,
    });

    if (response.ok) {
      return response.json();
    }

    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfterSeconds = Number(errorBody?.retryAfter || response.headers.get('retry-after') || 0);
      const retryAfterMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 2000 * (attempt + 1);
      await sleep(retryAfterMs);
      continue;
    }

    const message = errorBody?.error
      ? `PornhwaDB request failed with ${response.status}: ${errorBody.error}`
      : `PornhwaDB request failed with ${response.status}`;
    throw new Error(message);
  }

  throw new Error('PornhwaDB request exhausted all retries');
}

export async function fetchPornhwaDbList({
  page = 1,
  limit = 50,
  status,
  orientation,
  dataStatus,
  search,
  minRating,
  minRatings,
  sort = 'updated_at',
  order = 'desc',
  releaseYearGte,
  releaseYearLte,
  signal,
} = {}) {
  return fetchPornhwaDb('/pornhwa', {
    signal,
    params: {
      page,
      limit,
      status,
      orientation,
      dataStatus,
      search,
      minRating,
      minRatings,
      sort,
      order,
      'releaseYear[gte]': releaseYearGte,
      'releaseYear[lte]': releaseYearLte,
    },
  });
}

export async function fetchPornhwaDbDetail(slug, { fields, signal } = {}) {
  return fetchPornhwaDb(`/pornhwa/${encodeURIComponent(String(slug))}`, {
    signal,
    params: fields ? { fields } : {},
  });
}

export async function fetchPornhwaDbCharacters(slug, { page = 1, limit = 100, signal } = {}) {
  return fetchPornhwaDb(`/pornhwa/${encodeURIComponent(String(slug))}/characters`, {
    signal,
    params: { page, limit },
  });
}

export async function fetchPornhwaDbCharactersList({
  name,
  pornhwaId,
  pornhwaSlug,
  tags,
  tagMode,
  page = 1,
  limit = 100,
  sort,
  order,
  signal,
} = {}) {
  return fetchPornhwaDb('/characters', {
    signal,
    params: { name, pornhwaId, pornhwaSlug, tags, tagMode, page, limit, sort, order },
  });
}
