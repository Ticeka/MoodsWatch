import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';

async function fetchProfileComments(userId) {
  const { data, error } = await supabase
    .from('profile_comments')
    .select(`
      id,
      comment_body,
      created_at,
      author_user_id,
      author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
    `)
    .eq('profile_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw error;
  return data || [];
}

export function useProfileCommentsData(userId, t) {
  const queryClient = useQueryClient();
  const queryKey = ['profile-comments', userId];
  const [profileCommentError, setProfileCommentError] = useState('');

  const { data: profileComments = [], isFetching: isProfileCommentsLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchProfileComments(userId),
    enabled: Boolean(userId && supabase),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  function setProfileComments(updater) {
    queryClient.setQueryData(queryKey, (current = []) =>
      typeof updater === 'function' ? updater(current) : updater
    );
  }

  return {
    profileComments,
    setProfileComments,
    isProfileCommentsLoading,
    profileCommentError: error ? t('profile.profileCommentsLoadFailed') : profileCommentError,
    setProfileCommentError,
  };
}
