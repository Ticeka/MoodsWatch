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

export function notifyTierlistCommentParticipants({ listId, listOwnerId, actorUserId, actorName, parentEntry, pick }) {
  if (!supabase || !listId || !actorUserId) {
    return;
  }

  const notifications = [];

  if (listOwnerId && listOwnerId !== actorUserId) {
    notifications.push(supabase.from('notifications').insert({
      user_id: listOwnerId,
      type: parentEntry ? 'comment_reply' : 'tierlist_comment',
      reference_id: listId,
      actor_user_id: actorUserId,
      message: parentEntry
        ? `${actorName} ${pick('ตอบกลับคอมเมนต์บน tierlist ของคุณ', 'replied to a comment on your tierlist')}`
        : `${actorName} ${pick('คอมเมนต์บน tierlist ของคุณ', 'commented on your tierlist')}`,
    }));
  }

  if (
    parentEntry?.author_user_id
    && parentEntry.author_user_id !== actorUserId
    && parentEntry.author_user_id !== listOwnerId
  ) {
    notifications.push(supabase.from('notifications').insert({
      user_id: parentEntry.author_user_id,
      type: 'comment_reply',
      reference_id: listId,
      actor_user_id: actorUserId,
      message: `${actorName} ${pick('ตอบกลับคอมเมนต์ของคุณ', 'replied to your comment')}`,
    }));
  }

  if (notifications.length > 0) {
    void Promise.allSettled(notifications);
  }
}
