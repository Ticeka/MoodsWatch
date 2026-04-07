import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, Rss, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitleDisplayName } from '@/features/profile/lib/profileStore';
import { fetchSocialPostById } from '@/features/social/api/socialApi';
import { useSocialPostsFeed, useSocialActivityFeed } from '@/features/social/hooks/useSocialFeed';
import { PostComposer } from '@/features/social/components/PostComposer';
import { PostCard } from '@/features/social/components/PostCard';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import '../styles/Feed.css';

const ACTION_ICONS = {
  added: '📋',
  completed: '✅',
  dropped: '🗑️',
  rated: '⭐',
  reviewed: '📝',
  followed: '👤',
};

function formatRelativeTime(value, language) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (language === 'th') {
    if (mins < 1) return 'เมื่อกี้';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
    return `${days} วันที่แล้ว`;
  }
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function ActivityItem({ item, titleMap, language, t }) {
  const title = item.title_id ? titleMap.get(item.title_id) : null;
  const actor = item.actor_username ? (
    <Link to={`/u/${item.actor_username}`} className="feed-actor-link">
      {item.actor_name || item.actor_username}
    </Link>
  ) : (
    <span>{item.actor_name || t('profile.publicCommentAnonymous')}</span>
  );

  const titleEl = title ? (
    <Link to={`/title/${title.slug}`} className="feed-title-link">
      {getTitleDisplayName(title)}
    </Link>
  ) : null;

  const actionText = () => {
    const score = item.metadata?.score;
    switch (item.action_type) {
      case 'added':     return titleEl ? <>{actor} {t('social.activityAdded')} {titleEl}</> : null;
      case 'completed': return titleEl ? <>{actor} {t('social.activityCompleted')} {titleEl}</> : null;
      case 'dropped':   return titleEl ? <>{actor} {t('social.activityDropped')} {titleEl}</> : null;
      case 'rated':     return titleEl ? <>{actor} {t('social.activityRated').replace('{score}', score ?? '?')} {titleEl}</> : null;
      case 'reviewed':  return titleEl ? <>{actor} {t('social.activityReviewed')} {titleEl}</> : null;
      case 'followed': {
        const followedUsername = item.metadata?.followed_username;
        const followedEl = followedUsername
          ? <Link to={`/u/${followedUsername}`} className="feed-actor-link">{followedUsername}</Link>
          : null;
        return followedEl ? <>{actor} {t('social.activityFollowed')} {followedEl}</> : <>{actor} {t('social.activityFollowed')} {t('social.someone')}</>;
      }
      default: return null;
    }
  };

  const text = actionText();
  if (!text) return null;

  const initial = (item.actor_name || item.actor_username || '?').charAt(0).toUpperCase();

  return (
    <article className="feed-item">
      <div className="feed-item-avatar-wrap">
        {item.actor_avatar_url ? (
          <img src={item.actor_avatar_url} alt="" className="feed-item-avatar" />
        ) : (
          <div className="feed-item-avatar fallback">{initial}</div>
        )}
        <span className="feed-item-action-icon">{ACTION_ICONS[item.action_type] || '•'}</span>
      </div>
      <div className="feed-item-body">
        <p className="feed-item-text">{text}</p>
        {title?.cover && (
          <Link to={`/title/${title.slug}`} className="feed-item-cover-wrap">
            <img src={title.cover} alt="" className="feed-item-cover" />
          </Link>
        )}
        <time className="feed-item-time">
          {formatRelativeTime(item.created_at, language)}
        </time>
      </div>
    </article>
  );
}

export function Feed() {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const focusPostId = new URLSearchParams(location.search).get('post') ?? location.state?.focusPostId ?? null;
  const postsSectionRef = useRef(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  const {
    data: postsData,
    isFetching: postsLoading,
    refetch: refetchPosts,
  } = useSocialPostsFeed(user?.id);

  const {
    data: activityData,
    isFetching: activityLoading,
    error: activityError,
  } = useSocialActivityFeed(user?.id);

  const rawPosts = postsData?.feed ?? [];
  const postTitleMap = postsData?.titleMap ?? new Map();
  const rawItems = activityData?.feed ?? [];
  const titleMap = activityData?.titleMap ?? new Map();
  const error = activityError ? t('social.feedLoadFailed') : '';

  const applyAdultFilter = useCallback((feed, map) => {
    if (!map.size) return feed;
    return feed.filter((item) => {
      if (!item.title_id) return true;
      const title = map.get(Number(item.title_id));
      if (!title) return true;
      return showAdult || !title.is_adult;
    });
  }, [showAdult]);

  const posts = useMemo(() => applyAdultFilter(rawPosts, postTitleMap), [applyAdultFilter, rawPosts, postTitleMap]);
  const items = useMemo(() => applyAdultFilter(rawItems, titleMap), [applyAdultFilter, rawItems, titleMap]);

  const loadPosts = useCallback(() => refetchPosts(), [refetchPosts]);

  useEffect(() => {
    if (!focusPostId || postsLoading) return;

    const inFeed = posts.some((p) => String(p.id) === String(focusPostId));
    if (!inFeed) {
      // Post not in feed — fetch it directly and prepend
      fetchSocialPostById(focusPostId)
        .then((data) => {
          if (data) {
            queryClient.setQueryData(['social-posts-feed', user?.id], (prev) => {
              if (!prev) return prev;
              if (prev.feed.some((p) => String(p.id) === String(data.id))) return prev;
              return { ...prev, feed: [data, ...prev.feed] };
            });
          }
        });
      return;
    }

    const section = postsSectionRef.current;
    if (!section) return;
    const target = section.querySelector(`[data-post-id="${focusPostId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedPostId(String(focusPostId));
      setTimeout(() => setHighlightedPostId(null), 2200);
    }
  }, [focusPostId, postsLoading, posts]);

  function handlePostDeleted(id) {
    queryClient.setQueryData(['social-posts-feed', user?.id], (prev) => {
      if (!prev) return prev;
      return { ...prev, feed: prev.feed.filter((p) => p.id !== id) };
    });
  }

  const isLoading = postsLoading && activityLoading;

  return (
    <section className="section">
      <div className="container feed-wrap">
        <header className="feed-header">
          <Rss size={22} />
          <h1>{t('social.feedTitle')}</h1>
        </header>

        {/* Post Composer */}
        {user && (
          <PostComposer onPosted={loadPosts} />
        )}

        {isLoading && (
          <div className="feed-state">
            <Loader2 size={24} className="animate-spin" />
            <p>{t('common.loading')}</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="feed-state">
            <p>{error}</p>
          </div>
        )}

        {!isLoading && posts.length === 0 && items.length === 0 && (
          <div className="feed-empty">
            <Users size={40} className="feed-empty-icon" />
            <h2>{t('social.feedEmpty')}</h2>
            <p>{t('social.feedEmptyHint')}</p>
            <Link to="/discover" className="feed-explore-link">{t('social.exploreUsers')}</Link>
          </div>
        )}

        {/* Posts */}
        {!postsLoading && posts.length > 0 && (
          <div className="feed-posts-section" ref={postsSectionRef}>
            <h2 className="feed-section-label">{t('post.postsLabel')}</h2>
            <div className="feed-posts-list">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  titleMap={postTitleMap}
                  onDelete={handlePostDeleted}
                  isHighlighted={String(post.id) === highlightedPostId}
                />
              ))}
            </div>
          </div>
        )}

        {/* Activity */}
        {!activityLoading && items.length > 0 && (
          <div className="feed-activity-section">
            <h2 className="feed-section-label">{t('social.feedTitle')}</h2>
            <div className="feed-list">
              {items.map((item) => (
                <ActivityItem
                  key={item.id}
                  item={item}
                  titleMap={titleMap}
                  language={language}
                  t={t}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default Feed;
