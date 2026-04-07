import { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';

export function useProfileCommentsData(userId, t) {
  const [profileComments, setProfileComments] = useState([]);
  const [isProfileCommentsLoading, setIsProfileCommentsLoading] = useState(false);
  const [profileCommentError, setProfileCommentError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadProfileComments() {
      if (!userId || !supabase) {
        setProfileComments([]);
        return;
      }

      setIsProfileCommentsLoading(true);
      setProfileCommentError('');

      try {
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

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setProfileComments(data || []);
        }
      } catch {
        if (!cancelled) {
          setProfileCommentError(t('profile.profileCommentsLoadFailed'));
        }
      } finally {
        if (!cancelled) {
          setIsProfileCommentsLoading(false);
        }
      }
    }

    loadProfileComments();
    return () => {
      cancelled = true;
    };
  }, [t, userId]);

  return {
    profileComments,
    setProfileComments,
    isProfileCommentsLoading,
    profileCommentError,
    setProfileCommentError,
  };
}
