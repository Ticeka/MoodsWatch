import { supabase } from '@/shared/lib/supabase';

export const PROFILE_REQUEST_TIMEOUT_MS = 15000;
const AUTH_USER_PROFILE_SELECT = `
  id,
  name,
  username,
  avatar_url,
  bio,
  role,
  is_profile_public,
  allow_profile_comments,
  favorite_moods,
  hide_seen_by_default,
  prioritize_unseen,
  exclude_completed_from_recs,
  exclude_dropped_from_recs,
  hide_adult_content,
  recommendation_types,
  recommendation_subtypes,
  recommendation_progress_states,
  force_unseen_only,
  min_recommendation_score,
  recommendation_length,
  top_titles,
  created_at,
  updated_at
`;

const profileRequestCache = new Map();

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

export async function fetchAuthUserProfile(userId) {
  if (!userId || !supabase) return null;

  if (profileRequestCache.has(userId)) {
    return profileRequestCache.get(userId);
  }

  const request = withTimeout(
    supabase
      .from('user_profiles')
      .select(AUTH_USER_PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle(),
    PROFILE_REQUEST_TIMEOUT_MS,
    'Profile fetch'
  )
    .then(({ data, error }) => {
      if (error) {
        console.warn('Error fetching user profile:', error.message);
        return null;
      }

      return data ?? null;
    })
    .finally(() => {
      profileRequestCache.delete(userId);
    });

  profileRequestCache.set(userId, request);
  return request;
}

export async function ensureAuthUserProfile(userId) {
  if (!userId || !supabase) return null;

  const profile = await fetchAuthUserProfile(userId);
  if (profile) return profile;

  const { data, error } = await withTimeout(
    supabase
      .from('user_profiles')
      .insert({ id: userId, is_profile_public: true })
      .select(AUTH_USER_PROFILE_SELECT)
      .maybeSingle(),
    PROFILE_REQUEST_TIMEOUT_MS,
    'Profile create'
  );

  if (error) {
    if (error.code === '23505') {
      return fetchAuthUserProfile(userId);
    }

    console.warn('Error creating user profile:', error.message);
    return null;
  }

  return data ?? { id: userId };
}

export async function updateAuthUserProfile(userId, updates) {
  if (!userId || !supabase) {
    throw new Error('User not available');
  }

  const payload = Object.fromEntries(
    Object.entries(updates || {}).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(payload).length === 0) return null;

  const { data, error } = await withTimeout(
    supabase
      .from('user_profiles')
      .upsert({ id: userId, ...payload }, { onConflict: 'id' })
      .select(AUTH_USER_PROFILE_SELECT)
      .maybeSingle(),
    PROFILE_REQUEST_TIMEOUT_MS,
    'Profile update'
  );

  if (error) throw error;

  return data ?? { id: userId, ...payload };
}
