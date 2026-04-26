import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import {
  createTierlistComment,
  fetchTierlistComments,
  notifyTierlistCommentParticipants,
} from '@/features/tierlist/api';

function formatCommentDate(value) {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

export function TierListCommentSection({ listId, listOwnerId, pick }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [replyError, setReplyError] = useState('');
  const replyInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      if (!listId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const data = await fetchTierlistComments(listId);
        if (!cancelled) {
          setComments(data);
        }
      } catch {
        if (!cancelled) {
          setComments([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [listId]);

  const submitComment = async (event) => {
    event.preventDefault();

    if (!user?.id || !draft.trim()) {
      return;
    }

    const body = draft.trim();
    if (body.length > 500) {
      setError(pick('คอมเมนต์ยาวเกินไป (สูงสุด 500 ตัวอักษร)', 'Comment too long (max 500 chars)'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const data = await createTierlistComment({
        listId,
        userId: user.id,
        body,
      });
      setComments((current) => [...current, data]);
      setDraft('');
      notifyTierlistCommentParticipants({
        commentId: data.id,
        language: pick('th', 'en'),
        listId,
        listOwnerId,
        actorUserId: user.id,
        actorName: user?.profile?.name || user?.profile?.username || pick('ใครบางคน', 'Someone'),
        parentEntry: null,
        pick,
      });
    } catch {
      setError(pick('โพสต์คอมเมนต์ไม่สำเร็จ', 'Failed to post comment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReply = async (event, parentEntry) => {
    event.preventDefault();

    if (!user?.id || !replyDraft.trim()) {
      return;
    }

    const body = replyDraft.trim();
    if (body.length > 500) {
      setReplyError(pick('คอมเมนต์ยาวเกินไป (สูงสุด 500 ตัวอักษร)', 'Comment too long (max 500 chars)'));
      return;
    }

    setIsSubmitting(true);
    setReplyError('');

    try {
      const data = await createTierlistComment({
        listId,
        userId: user.id,
        body,
        parentCommentId: parentEntry.id,
      });
      setComments((current) => [...current, data]);
      setReplyDraft('');
      setActiveReplyId(null);
      setExpandedReplies((current) => new Set([...current, parentEntry.id]));
      notifyTierlistCommentParticipants({
        commentId: data.id,
        language: pick('th', 'en'),
        listId,
        listOwnerId,
        actorUserId: user.id,
        actorName: user?.profile?.name || user?.profile?.username || pick('ใครบางคน', 'Someone'),
        parentEntry,
        pick,
      });
    } catch {
      setReplyError(pick('โพสต์คอมเมนต์ไม่สำเร็จ', 'Failed to post comment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyClick = (entry) => {
    const isSameReply = activeReplyId === entry.id;
    setActiveReplyId(isSameReply ? null : entry.id);
    setReplyDraft('');
    setReplyError('');

    if (!isSameReply) {
      setExpandedReplies((current) => new Set([...current, entry.id]));
      window.setTimeout(() => replyInputRef.current?.focus(), 50);
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies((current) => {
      const next = new Set(current);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const topLevel = comments.filter((comment) => !comment.parent_comment_id);
  const repliesMap = {};

  comments
    .filter((comment) => comment.parent_comment_id)
    .forEach((comment) => {
      if (!repliesMap[comment.parent_comment_id]) {
        repliesMap[comment.parent_comment_id] = [];
      }

      repliesMap[comment.parent_comment_id].push(comment);
    });

  const renderThread = (entry) => {
    const author = entry.author_profile || entry.author || {};
    const authorName = author.name || author.username || pick('ผู้ใช้', 'User');
    const authorInitial = authorName.charAt(0).toUpperCase();
    const replies = repliesMap[entry.id] || [];
    const hasReplies = replies.length > 0;
    const isExpanded = expandedReplies.has(entry.id);
    const isReplyFormOpen = activeReplyId === entry.id;

    return (
      <div key={entry.id} className="tl-comment-thread">
        <div className="tl-comment">
          <div className="tl-comment-avatar">
            {author.avatar_url
              ? <img src={author.avatar_url} alt="" />
              : <span>{authorInitial}</span>}
          </div>
          <div className="tl-comment-body">
            <div className="tl-comment-meta">
              {author.username
                ? <Link to={`/u/${author.username}`} className="tl-comment-author">{authorName}</Link>
                : <span className="tl-comment-author">{authorName}</span>}
              <span className="tl-comment-date">{formatCommentDate(entry.created_at)}</span>
            </div>
            <p className="tl-comment-text">{entry.comment_body}</p>
            {user?.id ? (
              <button
                type="button"
                className="tl-comment-reply-btn"
                onClick={() => handleReplyClick(entry)}
              >
                {pick('ตอบกลับ', 'Reply')}
              </button>
            ) : null}
          </div>
        </div>

        {hasReplies || isReplyFormOpen ? (
          <div className="tl-comment-thread-indent">
            {hasReplies ? (
              <button
                type="button"
                className="tl-comment-show-replies-btn"
                onClick={() => toggleReplies(entry.id)}
              >
                <span className={`tl-reply-chevron${isExpanded ? ' expanded' : ''}`}>↳</span>
                {isExpanded
                  ? pick('ซ่อนการตอบกลับ', 'Hide replies')
                  : pick(`${replies.length} การตอบกลับ`, `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`)}
              </button>
            ) : null}

            {isExpanded ? (
              <div className="tl-comment-replies">
                {replies.map((reply) => {
                  const replyAuthor = reply.author_profile || reply.author || {};
                  const replyAuthorName = replyAuthor.name || replyAuthor.username || pick('ผู้ใช้', 'User');
                  const replyAuthorInitial = replyAuthorName.charAt(0).toUpperCase();

                  return (
                    <div key={reply.id} className="tl-comment tl-comment-reply">
                      <div className="tl-comment-avatar tl-comment-avatar-sm">
                        {replyAuthor.avatar_url
                          ? <img src={replyAuthor.avatar_url} alt="" />
                          : <span>{replyAuthorInitial}</span>}
                      </div>
                      <div className="tl-comment-body">
                        <div className="tl-comment-meta">
                          {replyAuthor.username
                            ? <Link to={`/u/${replyAuthor.username}`} className="tl-comment-author">{replyAuthorName}</Link>
                            : <span className="tl-comment-author">{replyAuthorName}</span>}
                          <span className="tl-comment-date">{formatCommentDate(reply.created_at)}</span>
                        </div>
                        <p className="tl-comment-text">{reply.comment_body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {isReplyFormOpen ? (
              <form className="tl-comment-inline-form" onSubmit={(event) => submitReply(event, entry)}>
                <textarea
                  ref={replyInputRef}
                  value={replyDraft}
                  onChange={(event) => {
                    setReplyDraft(event.target.value);
                    setReplyError('');
                  }}
                  placeholder={pick(`ตอบกลับ ${authorName}...`, `Reply to ${authorName}...`)}
                  maxLength={500}
                  rows={2}
                  disabled={isSubmitting}
                  className="tl-comment-inline-textarea"
                />
                <div className="tl-comment-inline-actions">
                  <small>{replyDraft.length}/500</small>
                  {replyError ? <span className="tl-comment-error">{replyError}</span> : null}
                  <button
                    type="button"
                    className="tl-comment-cancel-btn"
                    onClick={() => {
                      setActiveReplyId(null);
                      setReplyDraft('');
                    }}
                  >
                    {pick('ยกเลิก', 'Cancel')}
                  </button>
                  <Button type="submit" size="sm" variant="primary" disabled={isSubmitting || !replyDraft.trim()}>
                    {isSubmitting ? pick('กำลังโพสต์...', 'Posting...') : pick('ตอบกลับ', 'Reply')}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="container tl-comments-section">
      <h2 className="tl-comments-title">
        <MessageSquare size={16} />
        {pick('ความคิดเห็น', 'Comments')}
        <span className="tierlist-count">{comments.length}</span>
      </h2>

      {user?.id ? (
        <form className="tl-comment-form" onSubmit={submitComment}>
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError('');
            }}
            placeholder={pick('เขียนความคิดเห็น...', 'Write a comment...')}
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
          />
          <div className="tl-comment-form-row">
            <small>{draft.length}/500</small>
            {error ? <span className="tl-comment-error">{error}</span> : null}
            <Button type="submit" size="sm" variant="primary" disabled={isSubmitting || !draft.trim()}>
              {isSubmitting ? pick('กำลังโพสต์...', 'Posting...') : pick('โพสต์', 'Post')}
            </Button>
          </div>
        </form>
      ) : (
        <p className="tl-comment-login-hint">
          <Link to="/login">{pick('เข้าสู่ระบบ', 'Log in')}</Link> {pick('เพื่อแสดงความคิดเห็น', 'to leave a comment')}
        </p>
      )}

      {isLoading ? (
        <div className="tl-comment-loading"><Loader2 size={18} className="animate-spin" /></div>
      ) : topLevel.length === 0 ? (
        <p className="tl-comment-empty">{pick('ยังไม่มีความคิดเห็น มาเป็นคนแรกได้เลย', 'No comments yet. Be the first!')}</p>
      ) : (
        <div className="tl-comments-list">
          {topLevel.map((entry) => renderThread(entry))}
        </div>
      )}
    </section>
  );
}
