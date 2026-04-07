import { supabase } from '@/shared/lib/supabase';

export async function searchSocialPostTitles(query, limit = 6) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('canonical_titles')
    .select('id, canonical_title, slug, cover_image, banner_image, type')
    .ilike('canonical_title', `%${normalizedQuery}%`)
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function uploadSocialPostImage(userId, file) {
  if (!userId || !file || !supabase) {
    return null;
  }

  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from('post-images')
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('post-images').getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function createSocialPost({ userId, content, titleId = null, imageUrl = null }) {
  if (!userId || !supabase) {
    throw new Error('Social post creation is not available');
  }

  const { error } = await supabase
    .from('social_posts')
    .insert({
      user_id: userId,
      content,
      title_id: titleId,
      image_url: imageUrl,
    });

  if (error) {
    throw error;
  }
}

export async function fetchPostsFeed(userId, limit = 20, offset = 0) {
  if (!userId || !supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_posts_feed', {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchSocialActivityFeed(userId, limit = 40) {
  if (!userId || !supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_social_feed', {
    p_user_id: userId,
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchSocialPostById(postId) {
  if (!postId || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('social_posts')
    .select('id, user_id, content, image_url, title_id, created_at')
    .eq('id', postId)
    .single();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function likeSocialPost(postId, userId) {
  if (!postId || !userId || !supabase) {
    return;
  }

  const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  if (error) {
    throw error;
  }
}

export async function unlikeSocialPost(postId, userId) {
  if (!postId || !userId || !supabase) {
    return;
  }

  const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) {
    throw error;
  }
}

export async function fetchSocialPostComments(postId) {
  if (!postId || !supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_post_comments', { p_post_id: postId });
  if (error) {
    throw error;
  }

  return data || [];
}

export async function createSocialPostComment({ postId, userId, content }) {
  if (!postId || !userId || !supabase) {
    throw new Error('Post comment creation is not available');
  }

  const { error } = await supabase.from('post_comments').insert({ post_id: postId, user_id: userId, content });
  if (error) {
    throw error;
  }
}

export async function deleteSocialPost(postId) {
  if (!postId || !supabase) {
    return;
  }

  const { error } = await supabase.from('social_posts').delete().eq('id', postId);
  if (error) {
    throw error;
  }
}

export async function fetchFollowState(profileUserId, viewerUserId = null) {
  if (!profileUserId || !supabase) {
    return {
      followersCount: 0,
      followingCount: 0,
      isFollowing: false,
    };
  }

  const [countsResult, followResult] = await Promise.all([
    supabase.rpc('get_follow_counts', { p_user_id: profileUserId }),
    viewerUserId
      ? supabase.from('user_follows')
          .select('id')
          .eq('follower_id', viewerUserId)
          .eq('following_id', profileUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (countsResult.error) {
    throw countsResult.error;
  }

  if (followResult?.error) {
    throw followResult.error;
  }

  const row = Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data;
  return {
    followersCount: Number(row?.followers_count ?? 0),
    followingCount: Number(row?.following_count ?? 0),
    isFollowing: Boolean(followResult?.data),
  };
}

export async function followUser(viewerUserId, profileUserId, profileUsername = null) {
  if (!viewerUserId || !profileUserId || !supabase) {
    throw new Error('Follow is not available');
  }

  const { error } = await supabase
    .from('user_follows')
    .insert({ follower_id: viewerUserId, following_id: profileUserId });

  if (error) {
    throw error;
  }

  void supabase.from('user_activity').insert({
    user_id: viewerUserId,
    action_type: 'followed',
    title_id: null,
    metadata: { followed_user_id: profileUserId, followed_username: profileUsername ?? null },
  });
}

export async function unfollowUser(viewerUserId, profileUserId) {
  if (!viewerUserId || !profileUserId || !supabase) {
    throw new Error('Unfollow is not available');
  }

  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', viewerUserId)
    .eq('following_id', profileUserId);

  if (error) {
    throw error;
  }
}
