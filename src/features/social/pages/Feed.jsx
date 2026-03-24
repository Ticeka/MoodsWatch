import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, Rss, Users } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { getTitleDisplayName } from '@/features/profile/lib/profileStore';
import { supabase } from '@/shared/lib/supabase';
import { PostComposer } from '@/features/social/components/PostComposer';
import { PostCard } from '@/features/social/components/PostCard';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import './Feed.css';

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
  const location = useLocation();
  const focusPostId = new URLSearchParams(location.search).get('post') ?? location.state?.focusPostId ?? null;
  const postsSectionRef = useRef(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  const [rawPosts, setRawPosts]         = useState([]);
  const [postTitleMap, setPostTitleMap] = useState(new Map());
  const [postsLoading, setPostsLoading] = useState(true);

  const [rawItems, setRawItems]     = useState([]);
  const [titleMap, setTitleMap]     = useState(new Map());
  const [activityLoading, setActivityLoading] = useState(true);
  const [error, setError]           = useState('');

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

  const loadPosts = useCallback(async () => {
    if (!user?.id || !supabase) { setPostsLoading(false); return; }
    setPostsLoading(true);
    try {
      const { data } = await supabase.rpc('get_posts_feed', {
        p_user_id: user.id,
        p_limit: 20,
        p_offset: 0,
      });
      const feed = data || [];
      const titleIds = [...new Set(feed.map((p) => p.title_id).filter(Boolean))];
      if (titleIds.length) {
        const titles = await getTitlesByIds(titleIds);
        setPostTitleMap(new Map(titles.map((t) => [Number(t.id), t])));
      }
      setRawPosts(feed);
    } finally {
      setPostsLoading(false);
    }
  }, [user?.id]);

  const loadActivity = useCallback(async () => {
    if (!user?.id || !supabase) { setActivityLoading(false); return; }
    setActivityLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_social_feed', {
        p_user_id: user.id,
        p_limit: 40,
      });
      if (rpcError) throw rpcError;
      const feed = data || [];
      const titleIds = [...new Set(feed.map((i) => i.title_id).filter(Boolean))];
      if (titleIds.length) {
        const titles = await getTitlesByIds(titleIds);
        setTitleMap(new Map(titles.map((t) => [Number(t.id), t])));
      }
      setRawItems(feed);
    } catch {
      setError(t('social.feedLoadFailed'));
    } finally {
      setActivityLoading(false);
    }
  }, [user?.id, t]);

  useEffect(() => {
    loadPosts();
    loadActivity();
  }, [loadPosts, loadActivity]);

  useEffect(() => {
    if (!focusPostId || postsLoading) return;

    const inFeed = posts.some((p) => String(p.id) === String(focusPostId));
    if (!inFeed && supabase) {
      // Post not in feed — fetch it directly and prepend
      supabase
        .from('social_posts')
        .select('id, user_id, content, image_url, title_id, created_at')
        .eq('id', focusPostId)
        .single()
        .then(({ data }) => {
          if (data) {
            setRawPosts((prev) => {
              if (prev.some((p) => String(p.id) === String(data.id))) return prev;
              return [data, ...prev];
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
    setRawPosts((prev) => prev.filter((p) => p.id !== id));
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
