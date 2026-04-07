import { supabase } from '@/shared/lib/supabase';
import { CANONICAL_TITLE_BROWSE_SELECT } from '@/shared/lib/catalog';

export async function persistRemoteWatchlistSnapshot(userId, rows = [], timeoutMs, withTimeout) {
  if (!userId || !supabase || rows.length === 0) {
    return;
  }

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { error } = await withTimeout(
      supabase.from('user_lists').upsert(chunk, { onConflict: 'user_id, title_id' }),
      timeoutMs,
      'Watchlist sync'
    );

    if (error) {
      throw error;
    }
  }
}

export async function fetchRemoteWatchlist(userId, timeoutMs, withTimeout) {
  if (!userId || !supabase) {
    return [];
  }

  const { data, error } = await withTimeout(
    supabase
      .from('user_lists')
      .select(`
        title_id,
        list_status,
        progress_episode,
        progress_chapter,
        score,
        note,
        created_at,
        updated_at,
        last_consumed_at,
        target_episode,
        target_chapter,
        rewatch_count,
        metadata
      `)
      .eq('user_id', userId),
    timeoutMs,
    'Watchlist fetch'
  );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchRemoteWatchlistTitles(titleIds, timeoutMs, withTimeout) {
  if (!supabase || titleIds.length === 0) {
    return [];
  }

  const { data, error } = await withTimeout(
    supabase
      .from('canonical_titles')
      .select(CANONICAL_TITLE_BROWSE_SELECT)
      .in('id', titleIds),
    timeoutMs,
    'Watchlist titles fetch'
  );

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchRemoteWatchlistHistory(userId) {
  if (!userId || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('user_title_history')
    .select('id, title_id, event_type, from_status, to_status, progress_episode, progress_chapter, score, note, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function insertRemoteWatchlistHistory(userId, historyItem, timeoutMs, withTimeout) {
  if (!userId || !supabase || !historyItem) {
    return;
  }

  const { error } = await withTimeout(
    supabase.from('user_title_history').insert({
      user_id: userId,
      title_id: historyItem.titleId,
      event_type: historyItem.eventType,
      from_status: historyItem.fromStatus,
      to_status: historyItem.toStatus,
      progress_episode: historyItem.progressEpisode,
      progress_chapter: historyItem.progressChapter,
      score: historyItem.score,
      note: historyItem.note,
      metadata: historyItem.metadata,
      created_at: historyItem.createdAt,
    }),
    timeoutMs,
    'History insert'
  );

  if (error) {
    throw error;
  }
}

export async function insertRemoteUserActivity(userId, actionType, titleId, metadata = {}) {
  if (!userId || !supabase || !titleId) {
    return;
  }

  const { error } = await supabase.from('user_activity').insert({
    user_id: userId,
    action_type: actionType,
    title_id: titleId,
    metadata,
  });

  if (error) {
    throw error;
  }
}

export async function insertRemoteConsumptionSession(userId, payload, timeoutMs, withTimeout) {
  if (!userId || !payload || !supabase) {
    return;
  }

  const { error } = await withTimeout(
    supabase.from('user_consumption_sessions').insert({
      user_id: userId,
      ...payload,
    }),
    timeoutMs,
    'Consumption session insert'
  );

  if (error) {
    throw error;
  }
}

export async function upsertRemoteWatchlistItem(userId, row, timeoutMs, withTimeout) {
  if (!userId || !row || !supabase) {
    return;
  }

  const { error } = await withTimeout(
    supabase.from('user_lists').upsert(row, { onConflict: 'user_id, title_id' }),
    timeoutMs,
    'Watchlist add'
  );

  if (error) {
    throw error;
  }
}

export async function deleteRemoteWatchlistItem(userId, titleId, timeoutMs, withTimeout) {
  if (!userId || !titleId || !supabase) {
    return;
  }

  const { error } = await withTimeout(
    supabase
      .from('user_lists')
      .delete()
      .eq('user_id', userId)
      .eq('title_id', titleId),
    timeoutMs,
    'Watchlist delete'
  );

  if (error) {
    throw error;
  }
}

export async function updateRemoteWatchlistItem(userId, titleId, updates, timeoutMs, withTimeout) {
  if (!userId || !titleId || !supabase) {
    return;
  }

  const { error } = await withTimeout(
    supabase
      .from('user_lists')
      .update(updates)
      .eq('user_id', userId)
      .eq('title_id', titleId),
    timeoutMs,
    'Watchlist update'
  );

  if (error) {
    throw error;
  }
}
