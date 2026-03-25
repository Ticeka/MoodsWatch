const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const allowedParams = [
  'page',
  'limit',
  'status',
  'orientation',
  'dataStatus',
  'search',
  'minRating',
  'minRatings',
  'sort',
  'order',
  'tags',
  'releaseYear[gte]',
  'releaseYear[lte]',
];
const allowedCharacterParams = [
  'name', 'page', 'limit', 'sort', 'order', 'tags', 'tagMode', 'pornhwaId', 'pornhwaSlug',
];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function buildUpstreamUrl(body: Record<string, unknown>, apiKey?: string) {
  const url = new URL('https://pornhwadb.com/api/v1/pornhwa');

  for (const key of allowedParams) {
    const value = body[key];
    if (value === undefined || value === null || value === '') continue;

    if (key === 'limit') {
      const clamped = Math.min(100, Math.max(1, Number(value) || 1));
      url.searchParams.set(key, String(clamped));
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  if (apiKey) {
    url.searchParams.set('api_key', apiKey);
  }

  return url;
}

function buildCharacterSearchUrl(body: Record<string, unknown>, apiKey?: string) {
  const url = new URL('https://pornhwadb.com/api/v1/characters');
  for (const key of allowedCharacterParams) {
    const value = body[key];
    if (value === undefined || value === null || value === '') continue;
    if (key === 'limit') {
      const clamped = Math.min(100, Math.max(1, Number(value) || 1));
      url.searchParams.set(key, String(clamped));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  if (apiKey) url.searchParams.set('api_key', apiKey);
  return url;
}

function normalizePornhwaTag(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeApiKey(value: string | undefined) {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '');
}

function isBoysLovePornhwa(entry: Record<string, unknown>) {
  const rawGenreTags = Array.isArray(entry.genreTags) ? entry.genreTags : [];
  const rawTags = Array.isArray(entry.tags) ? entry.tags : [];
  const tags = [entry.orientation, ...rawGenreTags, ...rawTags].map(normalizePornhwaTag);

  return tags.some((tag) => ['yaoi', 'boys love', 'boys-love', 'bl', 'shounen ai', 'shonen ai'].includes(tag));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const storedPornhwaDbApiKey = normalizeApiKey(Deno.env.get('PORNHWADB_API_KEY'));

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const pornhwaDbApiKey = normalizeApiKey(
    typeof body.apiKey === 'string' && body.apiKey
      ? body.apiKey
      : storedPornhwaDbApiKey
  );

  if (!pornhwaDbApiKey) {
    return jsonResponse({ error: 'Missing PornhwaDB API key' }, 400);
  }

  if (!pornhwaDbApiKey.startsWith('pwdb_')) {
    return jsonResponse({ error: 'PornhwaDB API key must start with pwdb_' }, 400);
  }

  const requestPath = typeof body.path === 'string' ? body.path.trim() : 'list';

  if (requestPath === 'characters') {
    const upstreamUrl = buildCharacterSearchUrl(body, pornhwaDbApiKey);
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { accept: 'application/json' },
    });
    const responseText = await upstreamResponse.text();
    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (requestPath === 'title-characters') {
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!slug) return jsonResponse({ error: 'slug is required for title-characters' }, 400);
    const url = new URL(`https://pornhwadb.com/api/v1/pornhwa/${encodeURIComponent(slug)}/characters`);
    if (pornhwaDbApiKey) url.searchParams.set('api_key', pornhwaDbApiKey);
    const upstreamResponse = await fetch(url, { headers: { accept: 'application/json' } });
    const responseText = await upstreamResponse.text();
    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (normalizePornhwaTag(body.orientation) === 'yaoi') {
    return jsonResponse({ error: 'Yaoi requests are blocked by policy' }, 400);
  }

  const upstreamUrl = buildUpstreamUrl(body, pornhwaDbApiKey);
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      accept: 'application/json',
    },
  });

  const responseText = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }

  if (payload && Array.isArray(payload.data)) {
    payload = {
      ...payload,
      data: payload.data.filter((entry) => !isBoysLovePornhwa(entry as Record<string, unknown>)),
    };
    return jsonResponse(payload, upstreamResponse.status);
  }

  return new Response(responseText, {
    status: upstreamResponse.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
});
