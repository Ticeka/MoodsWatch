import { supabase } from '@/shared/lib/supabase';

const PUBLIC_PROFILE_SELECT = 'id, name, avatar_url, bio, username, top_titles, favorite_moods, created_at, allow_profile_comments';
const PROFILE_COMMENT_SELECT = `
  id,
  comment_body,
  created_at,
  author_user_id,
  parent_comment_id,
  author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
`;

export async function fetchPublicProfileByUsername(username) {
  if (!supabase || !username) {
    return null;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select(PUBLIC_PROFILE_SELECT)
    .eq('username', username)
    .eq('is_profile_public', true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function fetchPublicProfileWatchStats(profileUserId) {
  if (!supabase || !profileUserId) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_public_profile_watch_stats', {
    p_profile_user_id: profileUserId,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

export async function fetchPublicProfileComments(profileUserId) {
  if (!supabase || !profileUserId) {
    return [];
  }

  const { data, error } = await supabase
    .from('profile_comments')
    .select(PROFILE_COMMENT_SELECT)
    .eq('profile_user_id', profileUserId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchWatchlistOverlap(userA, userB) {
  if (!supabase || !userA || !userB) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_watchlist_overlap', {
    p_user_a: userA,
    p_user_b: userB,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createPublicProfileComment({ profileUserId, authorUserId, parentCommentId = null, commentBody }) {
  if (!supabase || !profileUserId || !authorUserId || !commentBody) {
    throw new Error('Profile comment creation is not available');
  }

  const { data, error } = await supabase
    .from('profile_comments')
    .insert({
      profile_user_id: profileUserId,
      author_user_id: authorUserId,
      parent_comment_id: parentCommentId,
      comment_body: commentBody,
    })
    .select(PROFILE_COMMENT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function notifyProfileComment({ commentId, language = 'en' }) {
  if (!supabase || !commentId) {
    return;
  }

  const { error } = await supabase.rpc('notify_profile_comment', {
    p_comment_id: commentId,
    p_language: language,
  });

  if (error) {
    throw error;
  }
}
