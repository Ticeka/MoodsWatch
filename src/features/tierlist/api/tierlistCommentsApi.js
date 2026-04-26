import { supabase } from '@/shared/lib/supabase';

const TIERLIST_COMMENT_SELECT = 'id, comment_body, created_at, parent_comment_id, author_user_id, author:user_profiles!tierlist_comments_author_user_id_fkey(id, name, username, avatar_url)';

export async function fetchTierlistComments(listId) {
  if (!supabase || !listId) {
    return [];
  }

  const { data, error } = await supabase
    .from('tierlist_comments')
    .select(TIERLIST_COMMENT_SELECT)
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createTierlistComment({ listId, userId, body, parentCommentId = null }) {
  if (!supabase || !listId || !userId || !String(body || '').trim()) {
    throw new Error('Invalid tierlist comment request');
  }

  const { data, error } = await supabase
    .from('tierlist_comments')
    .insert({
      list_id: listId,
      author_user_id: userId,
      parent_comment_id: parentCommentId,
      comment_body: String(body).trim(),
    })
    .select(TIERLIST_COMMENT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function notifyTierlistCommentParticipants({ commentId, language = 'en' }) {
  if (!supabase || !commentId) {
    return;
  }

  void supabase.rpc('notify_tierlist_comment', {
    p_comment_id: commentId,
    p_language: language,
  });
}
