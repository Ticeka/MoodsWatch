import { supabase } from '@/shared/lib/supabase';
import { getBattleDecisionCount } from '@/features/battle/lib/battleStore';

function hasRemote(userId) {
  return Boolean(userId && supabase);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return '00000000-0000-4000-8000-000000000000';
}

function buildDeckFingerprintFallback(row) {
  const titleIds = Array.isArray(row?.title_ids)
    ? row.title_ids
    : Array.isArray(row?.titles_snapshot)
      ? row.titles_snapshot.map((title) => title?.id)
      : [];

  return titleIds
    .map((value) => Number(value))
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join(':');
}

function getMissingColumn(error, tableName) {
  const message = String(error?.message || '');
  const match = message.match(/Could not find the '([^']+)' column of '([^']+)'/i);

  if (!match) {
    return '';
  }

  const [, columnName, sourceTable] = match;
  if (tableName && sourceTable !== tableName) {
    return '';
  }

  return columnName;
}

function isMissingRelation(error, relationName) {
  const message = String(error?.message || '');
  return (
    Number(error?.status || 0) === 404
    || message.includes(`'${relationName}'`)
    || message.includes(`"${relationName}"`)
  );
}

function mapRowToSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    deckKey: row.deck_key,
    deckFingerprint: row.deck_fingerprint || buildDeckFingerprintFallback(row),
    deckLabel: row.deck_label,
    filters: row.filters || {},
    titles: Array.isArray(row.titles_snapshot) ? row.titles_snapshot : [],
    titleIds: Array.isArray(row.title_ids) ? row.title_ids : [],
    targetRounds: Number(row.target_rounds || 0),
    history: Array.isArray(row.history) ? row.history : [],
    ratings: row.ratings || {},
    ranking: Array.isArray(row.ranking) ? row.ranking : null,
    tiers: Array.isArray(row.tiers) ? row.tiers : null,
    winnerId: row.winner_title_id || null,
    snapshot: row.snapshot || {},
    fastState: row.snapshot?.battleState || null,
    status: row.status || 'active',
    currentPair: row.current_pair || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
  };
}

function buildSessionPayload(userId, session) {
  const snapshot = {
    ...(session.snapshot || {}),
    battleState: session.fastState || null,
  };

  return {
    id: session.id,
    user_id: userId,
    deck_key: session.deckKey,
    deck_fingerprint: session.deckFingerprint || '',
    deck_label: session.deckLabel,
    filters: session.filters || {},
    title_ids: session.titleIds || (session.titles || []).map((title) => title.id),
    titles_snapshot: session.titles || [],
    target_rounds: session.targetRounds || 0,
    status: session.status || 'active',
    current_pair: session.currentPair || null,
    ratings: session.ratings || {},
    history: session.history || [],
    ranking: session.ranking || null,
    tiers: session.tiers || null,
    winner_title_id: session.winnerId || null,
    snapshot,
    comparison_count: getBattleDecisionCount(session),
    created_at: session.createdAt || new Date().toISOString(),
    updated_at: session.updatedAt || new Date().toISOString(),
    completed_at: session.completedAt || null,
  };
}

function buildVoteRows(userId, session) {
  return (session.history || []).map((vote, index) => ({
    id: isUuid(vote.id) ? vote.id : createUuid(),
    session_id: session.id,
    user_id: userId,
    sequence_index: index,
    left_title_id: vote.leftId,
    right_title_id: vote.rightId,
    result: vote.result,
    created_at: vote.createdAt || new Date().toISOString(),
    metadata: {},
  }));
}

function getOwnerDisplayName(user) {
  return String(
    user?.profile?.username
    || user?.user_metadata?.username
    || user?.user_metadata?.full_name
    || user?.email
    || ''
  ).trim();
}

function mapRowToPublicDeck(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: row.owner_display_name || '',
    ownerUsername: row.owner_username || '',
    key: row.deck_key,
    fingerprint: row.deck_fingerprint || buildDeckFingerprintFallback(row),
    label: row.deck_label,
    filters: row.filters || {},
    titleIds: Array.isArray(row.title_ids) ? row.title_ids : [],
    titles: Array.isArray(row.titles_snapshot) ? row.titles_snapshot : [],
    sourceCount: Number(row.source_count || 0),
    isPublic: true,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function buildPublicDeckPayload(user, deck) {
  return {
    id: deck.id,
    owner_user_id: user.id,
    owner_display_name: getOwnerDisplayName(user),
    deck_key: deck.key,
    deck_fingerprint: deck.fingerprint || buildDeckFingerprintFallback({ titles_snapshot: deck.titles }),
    deck_label: deck.label,
    filters: deck.filters || {},
    title_ids: (deck.titles || []).map((title) => title.id),
    titles_snapshot: deck.titles || [],
    title_count: Number(deck?.titles?.length || 0),
    source_count: Number(deck?.sourceCount || deck?.titles?.length || 0),
    created_at: deck.createdAt || new Date().toISOString(),
    updated_at: deck.updatedAt || new Date().toISOString(),
  };
}

export async function fetchRemoteBattleSessions(userId, { limit = 20 } = {}) {
  if (!hasRemote(userId)) {
    return [];
  }

  const { data, error } = await supabase
    .from('battle_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map(mapRowToSession);
}

export async function fetchRemoteBattleSession(userId, sessionId) {
  if (!hasRemote(userId) || !sessionId) {
    return null;
  }

  const { data, error } = await supabase
    .from('battle_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapRowToSession(data);
}

export async function persistRemoteBattleSession(userId, session) {
  if (!hasRemote(userId) || !session) {
    return session;
  }

  let payload = buildSessionPayload(userId, session);
  let sessionError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('battle_sessions')
      .upsert(payload, { onConflict: 'id' });

    if (!error) {
      sessionError = null;
      break;
    }

    const missingColumn = getMissingColumn(error, 'battle_sessions');
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      sessionError = error;
      continue;
    }

    sessionError = error;
    break;
  }

  if (sessionError) {
    throw sessionError;
  }

  const voteRows = buildVoteRows(userId, session);
  const { error: deleteError } = await supabase
    .from('battle_votes')
    .delete()
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .gte('sequence_index', voteRows.length);

  if (deleteError) {
    throw deleteError;
  }

  if (voteRows.length > 0) {
    const { error: voteError } = await supabase
      .from('battle_votes')
      .upsert(voteRows, { onConflict: 'session_id,sequence_index' });

    if (voteError) {
      throw voteError;
    }
  }

  return session;
}

export async function deleteRemoteBattleSession(userId, sessionId) {
  if (!hasRemote(userId) || !sessionId) {
    return;
  }

  const { error } = await supabase
    .from('battle_sessions')
    .delete()
    .eq('user_id', userId)
    .eq('id', sessionId);

  if (error) {
    throw error;
  }
}

export async function fetchBattleCommunityRollup(deckFingerprint) {
  if (!supabase || !deckFingerprint) {
    return null;
  }

  const { data, error } = await supabase
    .from('battle_deck_rollups')
    .select('*')
    .eq('deck_fingerprint', deckFingerprint)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error, 'battle_deck_rollups')) {
      return null;
    }
    throw error;
  }

  return data || null;
}

export async function fetchPublicBattleDecks({ limit = 24 } = {}) {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('battle_public_decks')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error, 'battle_public_decks')) {
      return [];
    }
    throw error;
  }

  const rows = data || [];
  const ownerIds = [...new Set(rows.map((row) => row?.owner_user_id).filter(Boolean))];
  let usernameByOwnerId = new Map();

  if (ownerIds.length > 0) {
    const { data: ownerProfiles } = await supabase
      .from('user_profiles')
      .select('id, username, is_profile_public')
      .in('id', ownerIds);

    usernameByOwnerId = new Map(
      (ownerProfiles || [])
        .filter((profile) => profile?.is_profile_public && profile?.username)
        .map((profile) => [profile.id, String(profile.username).trim().toLowerCase()])
    );
  }

  return rows
    .map((row) => {
      const deck = mapRowToPublicDeck(row);
      if (!deck) return null;
      const ownerUsername = usernameByOwnerId.get(deck.ownerUserId) || '';
      return {
        ...deck,
        ownerUsername,
        ownerDisplayName: ownerUsername || deck.ownerDisplayName,
      };
    })
    .filter(Boolean);
}

export async function persistRemotePublicBattleDeck(user, deck) {
  if (!supabase || !user?.id || !deck?.id) {
    return deck;
  }

  let payload = buildPublicDeckPayload(user, deck);
  let deckError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('battle_public_decks')
      .upsert(payload, { onConflict: 'id' });

    if (!error) {
      deckError = null;
      break;
    }

    const missingColumn = getMissingColumn(error, 'battle_public_decks');
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const nextPayload = { ...payload };
      delete nextPayload[missingColumn];
      payload = nextPayload;
      deckError = error;
      continue;
    }

    if (isMissingRelation(error, 'battle_public_decks')) {
      return deck;
    }

    deckError = error;
    break;
  }

  if (deckError) {
    throw deckError;
  }

  return deck;
}

export async function deleteRemotePublicBattleDeck(userId, deckId) {
  if (!supabase || !userId || !deckId) {
    return;
  }

  const { error } = await supabase
    .from('battle_public_decks')
    .delete()
    .eq('owner_user_id', userId)
    .eq('id', deckId);

  if (error && !isMissingRelation(error, 'battle_public_decks')) {
    throw error;
  }
}
