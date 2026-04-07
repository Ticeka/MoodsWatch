import { supabase } from '@/shared/lib/supabase';

const DISCOVER_SESSION_KEY = 'moodswatch-discover-session-id';
const DISCOVER_EVENT_TYPE_SET = new Set([
  'search_view',
  'search_submit',
  'search_abandon',
  'no_results_view',
  'preset_apply',
  'result_click',
  'autocomplete_select',
  'recovery_apply',
  'saved_search_create',
  'saved_search_update',
  'saved_search_delete',
]);

let missingAnalyticsTable = false;

function safeSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isMissingTableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('discover_search_events') && (
      message.includes('relation') ||
      message.includes('schema cache') ||
      message.includes('does not exist')
    )
  );
}

function isNetworkLikeError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('network request failed') ||
    message.includes('cors')
  );
}

export function getDiscoverSessionId() {
  const storage = safeSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const existing = storage.getItem(DISCOVER_SESSION_KEY);
    if (existing) {
      return existing;
    }

    const nextId = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storage.setItem(DISCOVER_SESSION_KEY, nextId);
    return nextId;
  } catch {
    return null;
  }
}

export async function trackDiscoverEvent({
  eventType,
  userId = null,
  query = '',
  scope = 'all',
  titleType = 'all',
  tag = '',
  presetSource = null,
  resultType = null,
  resultId = null,
  resultRank = null,
  metadata = {},
} = {}) {
  if (!supabase || missingAnalyticsTable || !DISCOVER_EVENT_TYPE_SET.has(eventType)) {
    return;
  }

  const normalizedQuery = String(query || '').trim().toLowerCase();

  try {
    const { error } = await supabase
      .from('discover_search_events')
      .insert({
        user_id: userId,
        session_id: getDiscoverSessionId(),
        event_type: eventType,
        query: String(query || '').trim(),
        normalized_query: normalizedQuery,
        scope,
        title_type: titleType,
        tag: String(tag || '').trim().toLowerCase(),
        preset_source: presetSource,
        result_type: resultType,
        result_id: resultId ? String(resultId) : null,
        result_rank: Number.isFinite(Number(resultRank)) ? Number(resultRank) : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      });

    if (error) {
      throw error;
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      missingAnalyticsTable = true;
      return;
    }

    if (isNetworkLikeError(error)) {
      return;
    }

    console.warn('Discover analytics tracking failed:', error);
  }
}
