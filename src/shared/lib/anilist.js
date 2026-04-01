import { supabase } from '@/shared/lib/supabase';

const DEV_PROXY_URL = '/anilist-gql';
const PROXY_FUNCTION = 'anilist-proxy';

async function parseErrorContext(error) {
  if (typeof error?.context?.json === 'function') {
    try {
      const payload = await error.context.json();
      return payload?.error || payload?.message || null;
    } catch {
      // Ignore parse failure and keep falling back.
    }
  }

  if (typeof error?.context?.text === 'function') {
    try {
      const message = await error.context.text();
      return message || null;
    } catch {
      // Ignore parse failure and keep falling back.
    }
  }

  return null;
}

export async function fetchAniListGraphQL(query, variables = {}, options = {}) {
  const { signal } = options;

  if (import.meta.env.DEV) {
    const response = await fetch(DEV_PROXY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`AniList request failed with ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((item) => item.message).join('; '));
    }

    return payload.data;
  }

  if (!supabase) {
    throw new Error('Supabase unavailable for AniList proxy');
  }

  const { data, error } = await supabase.functions.invoke(PROXY_FUNCTION, {
    body: { query, variables },
    signal,
  });

  if (error) {
    const contextMessage = await parseErrorContext(error);
    throw new Error(contextMessage || error.message || 'AniList proxy request failed');
  }

  if (data?.errors?.length) {
    throw new Error(data.errors.map((item) => item.message).join('; '));
  }

  return data?.data;
}
