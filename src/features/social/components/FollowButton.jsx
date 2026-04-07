import React, { useCallback, useEffect, useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { fetchFollowState, followUser, unfollowUser } from '@/features/social/api/socialApi';
import '../styles/FollowButton.css';

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
      if (!profileUserId) { setIsLoading(false); return; }

      try {
        const summary = await fetchFollowState(profileUserId, user?.id || null);
        if (cancelled) return;
        const fc = Number(summary.followersCount ?? 0);
        const fg = Number(summary.followingCount ?? 0);
        setFollowersCount(fc);
        setFollowingCount(fg);
        setIsFollowing(Boolean(summary.isFollowing));
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
    if (!user?.id || isBusy) return;

    setIsBusy(true);
    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowersCount((n) => n + (wasFollowing ? -1 : 1));

    try {
      if (wasFollowing) {
        await unfollowUser(user.id, profileUserId);
      } else {
        await followUser(user.id, profileUserId, profileUsername ?? null);
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
