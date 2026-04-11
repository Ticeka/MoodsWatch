import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  createSocialPostComment,
  deleteSocialPost,
  fetchSocialPostComments,
  likeSocialPost,
  unlikeSocialPost,
} from '@/features/social/api/socialApi';
import '../styles/PostCard.css';

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

export function PostCard({ post, titleMap, onDelete, isHighlighted = false }) {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [liked, setLiked]               = useState(post.liked_by_me);
  const [likeCount, setLikeCount]       = useState(Number(post.like_count));
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments]         = useState(null);
  const [commentText, setCommentText]   = useState('');
  const [submitting, setSubmitting]     = useState(false);

  const title  = post.title_id ? titleMap.get(Number(post.title_id)) : null;
  const isOwn  = user?.id === post.author_id;
  const initial = (post.author_name || post.author_username || '?').charAt(0).toUpperCase();

  // Prefer banner_image for blur bg (landscape), fall back to cover_image
  const coverImg  = title?.cover || null;
  const blurImg   = title?.banner_image || coverImg;
  const titleName = title?.canonical_title || '';
  const typeLabel = title?.type ? title.type.charAt(0).toUpperCase() + title.type.slice(1) : '';

  async function toggleLike() {
    if (!user) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      if (next) {
        await likeSocialPost(post.id, user.id);
      } else {
        await unlikeSocialPost(post.id, user.id);
      }
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function loadComments() {
    const data = await fetchSocialPostComments(post.id);
    setComments(data || []);
  }

  function handleToggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) loadComments();
  }

  async function submitComment(e) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body || !user) return;
    setSubmitting(true);
    try {
      await createSocialPostComment({ postId: post.id, userId: user.id, content: body });
      const fresh = await fetchSocialPostComments(post.id);
      setComments(fresh || []);
      setCommentText('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      language === 'th'
        ? 'ลบโพสต์นี้ใช่ไหม?'
        : 'Delete this post?'
    );
    if (!confirmed) return;
    await deleteSocialPost(post.id);
    onDelete?.(post.id);
  }

  return (
    <article className={`post-card${isHighlighted ? ' post-card-highlighted' : ''}`} data-post-id={post.id}>

      {/* ── Header ── */}
      <div className="post-card-header">
        <Link
          to={post.author_username ? `/u/${post.author_username}` : '#'}
          className="post-card-author"
        >
          {post.author_avatar ? (
            <img src={post.author_avatar} alt="" className="post-card-avatar" />
          ) : (
            <div className="post-card-avatar fallback">{initial}</div>
          )}
          <div className="post-card-author-info">
            <span className="post-card-author-name">
              {post.author_name || post.author_username || t('social.someone')}
            </span>
            {post.author_username && (
              <span className="post-card-author-username">@{post.author_username}</span>
            )}
          </div>
        </Link>

        <div className="post-card-meta">
          <time className="post-card-time">
            {formatRelativeTime(post.created_at, language)}
          </time>
          {isOwn && (
            <button
              className="post-card-delete-btn"
              onClick={handleDelete}
              title={t('post.delete')}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* ── Caption text ── */}
      {post.content && (
        <p className="post-card-content">{post.content}</p>
      )}

      {/* ── Post image ── */}
      {post.image_url && (
        <div className="post-card-image-wrap">
          <img
            src={post.image_url}
            alt=""
            className="post-card-image"
            loading="lazy"
          />
        </div>
      )}

      {/* ── Tagged title — full-width media card ── */}
      {title && coverImg && (
        <Link to={`/title/${title.slug}`} className="post-card-title-media">
          {/* blurred background */}
          <div
            className="post-card-title-blur-bg"
            style={{ backgroundImage: `url(${blurImg || coverImg})` }}
          />
          {/* centered poster */}
          <img
            src={coverImg}
            alt={titleName}
            className="post-card-title-cover"
            loading="lazy"
          />
          {/* bottom info overlay */}
          <div className="post-card-title-info">
            <span className="post-card-title-name">{titleName}</span>
            {typeLabel && <span className="post-card-title-badge">{typeLabel}</span>}
          </div>
        </Link>
      )}

      {/* ── Actions ── */}
      <div className="post-card-actions">
        <button
          className={`post-card-action-btn${liked ? ' liked' : ''}`}
          onClick={toggleLike}
          disabled={!user}
          type="button"
          aria-label={liked ? t('post.unlike') : t('post.like')}
        >
          <Heart size={26} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 2} />
          <span>{likeCount > 0 ? likeCount : ''}</span>
        </button>

        <button
          className="post-card-action-btn"
          onClick={handleToggleComments}
          type="button"
          aria-label={t('post.comments')}
        >
          <MessageCircle size={26} />
          <span>{Number(post.comment_count) > 0 ? post.comment_count : ''}</span>
        </button>
      </div>

      {/* Like count line */}
      {likeCount > 0 && (
        <p className="post-card-like-line">
          {likeCount} {likeCount === 1 ? t('post.like') : t('post.likes')}
        </p>
      )}

      {/* ── Comments ── */}
      {showComments && (
        <>
          <div className="post-card-divider" />
          <div className="post-card-comments">
            {comments === null && (
              <p className="post-comments-loading">{t('common.loading')}</p>
            )}
            {comments?.length === 0 && (
              <p className="post-comments-empty">{t('post.noComments')}</p>
            )}
            {comments?.map((c) => {
              const cInitial = (c.author_name || c.author_username || '?').charAt(0).toUpperCase();
              return (
                <div key={c.id} className="post-comment">
                  {c.author_avatar ? (
                    <img src={c.author_avatar} alt="" className="post-comment-avatar" />
                  ) : (
                    <div className="post-comment-avatar fallback">{cInitial}</div>
                  )}
                  <div className="post-comment-body">
                    <span className="post-comment-author">
                      {c.author_name || c.author_username || t('social.someone')}
                    </span>
                    <span className="post-comment-text">{c.content}</span>
                    <time className="post-comment-time">
                      {formatRelativeTime(c.created_at, language)}
                    </time>
                  </div>
                </div>
              );
            })}

            {user && (
              <form className="post-comment-form" onSubmit={submitComment}>
                {user.profile?.avatar_url ? (
                  <img src={user.profile.avatar_url} alt="" className="post-comment-avatar" />
                ) : (
                  <div className="post-comment-avatar fallback">
                    {(user.profile?.name || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <input
                  className="post-comment-input"
                  placeholder={t('post.commentPlaceholder')}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  disabled={submitting}
                />
                <button
                  className="post-comment-submit"
                  type="submit"
                  disabled={!commentText.trim() || submitting}
                  aria-label={t('post.submitComment')}
                >
                  <Send size={14} />
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </article>
  );
}
