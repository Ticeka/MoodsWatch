import { setTimeout as sleep } from 'node:timers/promises';

const JIKAN_API_URL = 'https://api.jikan.moe/v4';

function appendParams(url, params = {}) {
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
}

async function fetchJikan(path, { params, signal, maxRetries = 3 } = {}) {
  const url = new URL(path.replace(/^\//, ''), `${JIKAN_API_URL}/`);
  appendParams(url, params);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal,
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfterHeader = Number(response.headers.get('retry-after') || 0);
      const retryAfterMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : 1500 * (attempt + 1);
      await sleep(retryAfterMs);
      continue;
    }

    let message = `Jikan request failed with ${response.status}`;
    try {
      const error = await response.json();
      if (error?.message) {
        message = `${message}: ${error.message}`;
      }
    } catch {
      // Ignore JSON parsing errors and keep the fallback status-based message.
    }

    throw new Error(message);
  }

  throw new Error('Jikan request exhausted all retries');
}

export async function fetchJikanMangaPage({
  page = 1,
  limit = 25,
  type = 'manhwa',
  genres = '49',
  genresExclude,
  orderBy = 'start_date',
  direction = 'desc',
  signal,
} = {}) {
  return fetchJikan('/manga', {
    signal,
    params: {
      page,
      limit,
      type,
      genres,
      genres_exclude: genresExclude,
      order_by: orderBy,
      sort: direction,
    },
  });
}
