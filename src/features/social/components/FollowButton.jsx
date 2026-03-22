import React, { useCallback, useEffect, useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import './FollowButton.css';

export function FollowButton({ profileUserId, profileUsername, onCountChange }) {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!profileUserId || !supabase) { setIsLoading(false); return; }

      try {
        const [countsResult, followResult] = await Promise.all([
          supabase.rpc('get_follow_counts', { p_user_id: profileUserId }),
          user?.id
            ? supabase.from('user_follows')
                .select('id')
                .eq('follower_id', user.id)
                .eq('following_id', profileUserId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (cancelled) return;

        const row = Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data;
        const fc = Number(row?.followers_count ?? 0);
        const fg = Number(row?.following_count ?? 0);
        setFollowersCount(fc);
        setFollowingCount(fg);
        setIsFollowing(Boolean(followResult.data));
        onCountChange?.({ followersCount: fc, followingCount: fg });
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [profileUserId, user?.id, onCountChange]);

  const toggle = useCallback(async () => {
    if (!user?.id || isBusy || !supabase) return;

    setIsBusy(true);
    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowersCount((n) => n + (wasFollowing ? -1 : 1));

    try {
      if (wasFollowing) {
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profileUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: user.id, following_id: profileUserId });
        if (error) throw error;
        void supabase.from('user_activity').insert({
          user_id: user.id,
          action_type: 'followed',
          title_id: null,
          metadata: { followed_user_id: profileUserId, followed_username: profileUsername ?? null },
        });
      }
    } catch {
      // Revert on failure
      setIsFollowing(wasFollowing);
      setFollowersCount((n) => n + (wasFollowing ? 1 : -1));
    } finally {
      setIsBusy(false);
    }
  }, [user?.id, isBusy, isFollowing, profileUserId]);

  const isOwnProfile = user?.id === profileUserId;
  if (isOwnProfile || !profileUserId) return null;

  return (
    <div className="follow-block">
      <div className="follow-counts">
        <span><strong>{followersCount}</strong> {t('social.followers')}</span>
        <span><strong>{followingCount}</strong> {t('social.following')}</span>
      </div>

      {user?.id && (
        <button
          type="button"
          className={`follow-btn${isFollowing ? ' follow-btn--following' : ''}`}
          onClick={toggle}
          disabled={isLoading || isBusy}
          aria-label={isFollowing ? t('social.unfollow') : t('social.follow')}
        >
          {isFollowing
            ? <><UserCheck size={14} /> {t('social.following')}</>
            : <><UserPlus size={14} /> {t('social.follow')}</>}
        </button>
      )}
    </div>
  );
}

export default FollowButton;
