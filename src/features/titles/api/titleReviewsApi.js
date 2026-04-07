import { supabase } from '@/shared/lib/supabase';

export async function fetchTitleReviews(titleId, limit = 30) {
  if (!titleId || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('title_reviews')
    .select('id, user_id, body, spoiler, score, created_at')
    .eq('title_id', titleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows = data || [];
  const userIds = [...new Set(rows.map((review) => review.user_id).filter(Boolean))];
  let usernameMap = {};

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);

    if (profileError) {
      throw profileError;
    }

    (profiles || []).forEach((profile) => {
      usernameMap[profile.id] = {
        username: profile.username,
        avatar_url: profile.avatar_url,
      };
    });
  }

  return rows.map((review) => ({
    ...review,
    username: usernameMap[review.user_id]?.username || null,
    avatar_url: usernameMap[review.user_id]?.avatar_url || null,
  }));
}

export async function saveTitleReview({ reviewId = null, titleId, userId, body, spoiler }) {
  if (!titleId || !userId || !supabase) {
    throw new Error('Review save is not available');
  }

  const payload = {
    title_id: titleId,
    user_id: userId,
    body,
    spoiler,
  };

  const { error } = reviewId
    ? await supabase.from('title_reviews').update({ body: payload.body, spoiler: payload.spoiler }).eq('id', reviewId)
    : await supabase.from('title_reviews').insert(payload);

  if (error) {
    throw error;
  }

  if (!reviewId) {
    void supabase.from('user_activity').insert({
      user_id: userId,
      action_type: 'reviewed',
      title_id: titleId,
      metadata: {},
    });
  }
}

export async function deleteTitleReview(reviewId) {
  if (!reviewId || !supabase) {
    return;
  }

  const { error } = await supabase.from('title_reviews').delete().eq('id', reviewId);
  if (error) {
    throw error;
  }
}
