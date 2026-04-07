import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, MessageSquare, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import {
  formatProfileCommentDate,
  formatProfileDate,
  PROFILE_TYPE_LABELS,
} from '@/features/profile/lib/profilePageUtils';
import { getTitleDisplayName, TOP_TITLE_TYPE_OPTIONS } from '@/features/profile/lib/profileStore';
import {
  createProfileNotification,
  createPublicProfileComment,
  fetchPublicProfileByUsername,
  fetchPublicProfileComments,
  fetchPublicProfileWatchStats,
  fetchWatchlistOverlap,
} from '@/features/profile/api/publicProfileApi';
import { FollowButton } from '@/features/social/components/FollowButton';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import '../styles/PublicProfile.css';

const DEFAULT_WATCH_STATS = {
  total: 0,
  seen: 0,
  watching: 0,
  reading: 0,
  completed: 0,
};

export function PublicProfile() {
  const { user } = useAuth();
  const { username: routeUsername = '' } = useParams();
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const normalizedUsername = String(routeUsername || '').trim().toLowerCase();

  const [profile, setProfile] = useState(null);
  const [sections, setSections] = useState([]);
  const [watchStats, setWatchStats] = useState(DEFAULT_WATCH_STATS);
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSuccess, setCommentSuccess] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  const [replyError, setReplyError] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [overlap, setOverlap] = useState(null);
  const [overlapTitles, setOverlapTitles] = useState([]);
  const [isOverlapLoading, setIsOverlapLoading] = useState(false);
  const replyInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setIsLoading(true);
      setErrorMessage('');
      setComments([]);
      setWatchStats(DEFAULT_WATCH_STATS);
      setNotFound(false);

      if (!normalizedUsername) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchPublicProfileByUsername(normalizedUsername);

        if (!data) {
          if (!cancelled) setNotFound(true);
          return;
        }

        const topTitlesPayload = data.top_titles && typeof data.top_titles === 'object' ? data.top_titles : {};
        const titleIds = [...new Set(
          TOP_TITLE_TYPE_OPTIONS.flatMap((typeId) => (
            Array.isArray(topTitlesPayload[typeId]) ? topTitlesPayload[typeId].map(Number).filter(Boolean) : []
          ))
        )];
        const titles = titleIds.length ? await getTitlesByIds(titleIds) : [];
        const titleMap = new Map(titles.map((title) => [Number(title.id), title]));
        const statsRow = await fetchPublicProfileWatchStats(data.id) || DEFAULT_WATCH_STATS;

        const nextSections = TOP_TITLE_TYPE_OPTIONS.map((typeId) => ({
          typeId,
          label: PROFILE_TYPE_LABELS[typeId]?.[language] || typeId,
          titles: filterTitlesForAgeGate((topTitlesPayload[typeId] || [])
            .map((titleId) => titleMap.get(Number(titleId)))
            .filter(Boolean), showAdult),
        }));

        if (!cancelled) {
          setProfile(data);
          setWatchStats({
            total: Number(statsRow.total || 0),
            seen: Number(statsRow.seen || 0),
            watching: Number(statsRow.watching || 0),
            reading: Number(statsRow.reading || 0),
            completed: Number(statsRow.completed || 0),
          });
          setSections(nextSections);
        }
      } catch {
        if (!cancelled) setErrorMessage(t('profile.publicLoadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadProfile();
    return () => { cancelled = true; };
  }, [language, normalizedUsername, showAdult, t]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      if (!profile?.id || !profile.allow_profile_comments) {
        setComments([]);
        return;
      }

      setIsCommentsLoading(true);
      setCommentError('');
      try {
        const data = await fetchPublicProfileComments(profile.id);
        if (!cancelled) setComments(data || []);
      } catch {
        if (!cancelled) setCommentError(t('profile.publicCommentLoadFailed'));
      } finally {
        if (!cancelled) setIsCommentsLoading(false);
      }
    }

    loadComments();
    return () => { cancelled = true; };
  }, [profile?.allow_profile_comments, profile?.id, t]);

  useEffect(() => {
    let cancelled = false;
    async function loadOverlap() {
      if (!user?.id || !profile?.id || user.id === profile.id) return;
      setIsOverlapLoading(true);
      try {
        const rows = await fetchWatchlistOverlap(user.id, profile.id);
        if (cancelled) return;
        setOverlap(rows);
        const ids = [...new Set(rows.map((r) => r.title_id).filter(Boolean))];
        if (ids.length) {
          const titles = await getTitlesByIds(ids.slice(0, 20));
          if (!cancelled) setOverlapTitles(filterTitlesForAgeGate(titles, showAdult));
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setIsOverlapLoading(false);
      }
    }
    loadOverlap();
    return () => { cancelled = true; };
  }, [user?.id, profile?.id, showAdult]);

  const totalPinned = useMemo(
    () => sections.reduce((count, section) => count + section.titles.length, 0),
    [sections]
  );
  const canComment = Boolean(profile?.allow_profile_comments);
  const canPostComment = Boolean(user?.id && canComment && profile?.id);
  const profileInitial = (profile?.name || profile?.username || 'M').charAt(0).toUpperCase();

  const fireProfileNotifications = (savedParentEntry) => {
    const actorName = user?.profile?.name || user?.profile?.username || t('profile.publicCommentAnonymous');
    const notifInserts = [];
    if (profile.id !== user.id) {
      notifInserts.push(createProfileNotification({
        user_id: profile.id,
        type: savedParentEntry ? 'comment_reply' : 'profile_comment',
        reference_id: profile.username,
        actor_user_id: user.id,
        message: savedParentEntry
          ? `${actorName} ${language === 'th' ? 'ตอบกลับคอมเมนต์บนโปรไฟล์ของคุณ' : 'replied to a comment on your profile'}`
          : `${actorName} ${language === 'th' ? 'คอมเมนต์บนโปรไฟล์ของคุณ' : 'commented on your profile'}`,
      }));
    }
    if (savedParentEntry?.author_user_id && savedParentEntry.author_user_id !== user.id && savedParentEntry.author_user_id !== profile.id) {
      notifInserts.push(createProfileNotification({
        user_id: savedParentEntry.author_user_id,
        type: 'comment_reply',
        reference_id: profile.username,
        actor_user_id: user.id,
        message: `${actorName} ${language === 'th' ? 'ตอบกลับคอมเมนต์ของคุณ' : 'replied to your comment'}`,
      }));
    }
    if (notifInserts.length) Promise.allSettled(notifInserts);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!canPostComment) return;

    const commentBody = String(commentDraft || '').trim();
    if (!commentBody) {
      setCommentError(t('profile.publicCommentRequired'));
      setCommentSuccess('');
      return;
    }
    if (commentBody.length > 500) {
      setCommentError(t('profile.publicCommentTooLong'));
      setCommentSuccess('');
      return;
    }

    setIsSubmittingComment(true);
    setCommentError('');
    setCommentSuccess('');
    try {
      const data = await createPublicProfileComment({
        profileUserId: profile.id,
        authorUserId: user.id,
        parentCommentId: null,
        commentBody,
      });
      setComments((current) => [...current, data]);
      setCommentDraft('');
      setCommentSuccess(t('profile.publicCommentSuccess'));
      fireProfileNotifications(null);
    } catch {
      setCommentError(t('profile.publicCommentSubmitFailed'));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const submitReply = async (event, parentEntry) => {
    event.preventDefault();
    if (!canPostComment) return;
    const body = String(replyDraft || '').trim();
    if (!body || body.length > 500) { setReplyError(t('profile.publicCommentTooLong')); return; }
    setIsSubmittingComment(true);
    setReplyError('');
    try {
      const data = await createPublicProfileComment({
        profileUserId: profile.id,
        authorUserId: user.id,
        parentCommentId: parentEntry.id,
        commentBody: body,
      });
      setComments((current) => [...current, data]);
      setReplyDraft('');
      setActiveReplyId(null);
      setExpandedReplies((prev) => new Set([...prev, parentEntry.id]));
      fireProfileNotifications(parentEntry);
    } catch {
      setReplyError(t('profile.publicCommentSubmitFailed'));
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleReplyClick = (entry) => {
    const isSame = activeReplyId === entry.id;
    setActiveReplyId(isSame ? null : entry.id);
    setReplyDraft('');
    setReplyError('');
    if (!isSame) {
      setExpandedReplies((prev) => new Set([...prev, entry.id]));
      setTimeout(() => replyInputRef.current?.focus(), 50);
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <section className="section">
        <div className="container public-profile-state">
          <Loader2 size={28} className="animate-spin" />
          <p>{t('profile.publicLoading')}</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="section">
        <div className="container public-profile-state">
          <p>{errorMessage}</p>
          <Link to="/" className="public-profile-link">{t('profile.goHome')}</Link>
        </div>
      </section>
    );
  }

  if (notFound || !profile) {
    return (
      <section className="section">
        <div className="container public-profile-state">
          <UserRound size={28} />
          <h1>{t('profile.publicNotFoundTitle')}</h1>
          <p>{t('profile.publicNotFoundBody')}</p>
          <Link to="/" className="public-profile-link">{t('profile.goHome')}</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container public-profile-wrap animate-fade-in">
        <header className="public-profile-hero">
          <div className="public-profile-avatar-wrap">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="public-profile-avatar" />
            ) : (
              <div className="public-profile-avatar fallback">{profileInitial}</div>
            )}
          </div>
          <div className="public-profile-copy">
            <span className="public-profile-kicker">{t('profile.publicKicker')}</span>
            <h1>{profile.name || profile.username}</h1>
            <p className="public-profile-username">@{profile.username}</p>
            <p>{profile.bio || t('profile.publicNoBio')}</p>
            <div className="public-profile-meta">
              <span>{t('profile.memberSince', { date: formatProfileDate(profile.created_at, locale) })}</span>
              <span>{t('profile.publicPinnedCount', { count: totalPinned })}</span>
            </div>
            <FollowButton profileUserId={profile.id} profileUsername={profile.username} />
          </div>
        </header>

        <section className="public-profile-stats-grid">
          <article className="public-profile-stat-card">
            <span>{t('profile.seen')}</span>
            <strong>{watchStats.seen}</strong>
            <small>{t('profile.completedOrDropped')}</small>
          </article>
          <article className="public-profile-stat-card">
            <span>{t('profile.watching')}</span>
            <strong>{watchStats.watching}</strong>
            <small>{t('profile.animeInProgress')}</small>
          </article>
          <article className="public-profile-stat-card">
            <span>{t('profile.reading')}</span>
            <strong>{watchStats.reading}</strong>
            <small>{t('profile.readingProgress')}</small>
          </article>
          <article className="public-profile-stat-card">
            <span>{t('profile.completed')}</span>
            <strong>{watchStats.completed}</strong>
            <small>{t('profile.finishedTitles')}</small>
          </article>
        </section>

        <article className="public-profile-card">
          <div className="public-profile-card-head">
            <h2>{t('profile.publicTopTitle')}</h2>
            <span>{t('profile.publicPinnedCount', { count: totalPinned })}</span>
          </div>
          <div className="public-profile-grid">
            {sections.map((section) => (
              <section key={section.typeId} className="public-profile-type-block">
                <div className="public-profile-type-head">
                  <strong>{section.label}</strong>
                  <span>{section.titles.length} / 5</span>
                </div>
                {section.titles.length > 0 ? (
                  <div className="public-profile-title-list">
                    {section.titles.map((title, index) => (
                      <Link key={`${section.typeId}-${title.id}`} to={`/title/${title.slug}`} className="public-profile-title-row">
                        <span className="public-profile-rank">#{index + 1}</span>
                        <img src={title.cover || ''} alt="" className="public-profile-thumb" />
                        <div>
                          <strong>{getTitleDisplayName(title)}</strong>
                          <small>{t('profile.publicScore', { score: title.score ?? '-' })}</small>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="public-profile-empty">
                    <Sparkles size={16} />
                    <span>{t('profile.publicTopEmpty')}</span>
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>

        {user?.id && user.id !== profile.id && (
          <article className="public-profile-card">
            <div className="public-profile-card-head">
              <h2>{t('social.watchlistOverlapTitle')}</h2>
              {overlap !== null && <span>{t('social.watchlistOverlapCount').replace('{count}', overlapTitles.length)}</span>}
            </div>
            {isOverlapLoading && (
              <div className="public-profile-state compact">
                <Loader2 size={18} className="animate-spin" />
              </div>
            )}
            {!isOverlapLoading && overlap !== null && overlapTitles.length === 0 && (
              <div className="public-profile-empty">
                <span>{t('social.watchlistOverlapEmpty')}</span>
              </div>
            )}
            {!isOverlapLoading && overlapTitles.length > 0 && (
              <div className="public-profile-title-list">
                {overlapTitles.slice(0, 10).map((title) => {
                  const row = overlap.find((r) => r.title_id === Number(title.id));
                  return (
                    <Link key={title.id} to={`/title/${title.slug}`} className="public-profile-title-row overlap-row">
                      <img src={title.cover || ''} alt="" className="public-profile-thumb" />
                      <div>
                        <strong>{getTitleDisplayName(title)}</strong>
                        <small className="overlap-statuses">
                          {row?.status_a && <span className="overlap-badge">{t('social.youLabel')}: {row.status_a}</span>}
                          {row?.status_b && <span className="overlap-badge">{profile.name || profile.username}: {row.status_b}</span>}
                        </small>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </article>
        )}

        <article className="public-profile-card">
          <div className="public-profile-card-head">
            <h2>{t('profile.publicCommentsTitle')}</h2>
            <span>{comments.length}</span>
          </div>

          {!canComment && (
            <div className="public-profile-empty">
              <span>{t('profile.publicCommentsDisabled')}</span>
            </div>
          )}

          {canComment && (
            <>
              <form className="public-profile-comment-form" onSubmit={submitComment}>
                <textarea
                  id="profile-comment-input"
                  value={commentDraft}
                  onChange={(event) => {
                    setCommentDraft(event.target.value);
                    setCommentError('');
                    setCommentSuccess('');
                  }}
                  placeholder={t('profile.publicCommentPlaceholder')}
                  disabled={!canPostComment || isSubmittingComment}
                  maxLength={500}
                  rows={3}
                />
                <div className="public-profile-comment-form-row">
                  <small>{commentDraft.length}/500</small>
                  {!user?.id && <span className="public-profile-form-note">{t('profile.publicCommentLoginRequired')}</span>}
                  {commentError && <span className="public-profile-form-error">{commentError}</span>}
                  {commentSuccess && <span className="public-profile-form-success">{commentSuccess}</span>}
                  <Button type="submit" size="sm" variant="primary" disabled={!canPostComment || isSubmittingComment}>
                    {isSubmittingComment ? t('profile.publicCommentSubmitting') : t('profile.publicCommentSubmit')}
                  </Button>
                </div>
              </form>

              {isCommentsLoading ? (
                <div className="public-profile-state compact">
                  <Loader2 size={20} className="animate-spin" />
                  <p>{t('profile.publicCommentsLoading')}</p>
                </div>
              ) : (() => {
                const topLevel = comments.filter((c) => !c.parent_comment_id);
                const repliesMap = {};
                comments.filter((c) => c.parent_comment_id).forEach((c) => {
                  if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = [];
                  repliesMap[c.parent_comment_id].push(c);
                });

                const renderThread = (entry) => {
                  const author = entry.author_profile || {};
                  const authorName = author.name || author.username || t('profile.publicCommentAnonymous');
                  const authorInitial = authorName.charAt(0).toUpperCase();
                  const replies = repliesMap[entry.id] || [];
                  const hasReplies = replies.length > 0;
                  const isExpanded = expandedReplies.has(entry.id);
                  const isReplyFormOpen = activeReplyId === entry.id;

                  return (
                    <div key={entry.id} className="public-profile-comment-thread">
                      <article className="public-profile-comment-item">
                        <div className="public-profile-comment-avatar-wrap">
                          {author.avatar_url ? (
                            <img src={author.avatar_url} alt="" className="public-profile-comment-avatar" />
                          ) : (
                            <div className="public-profile-comment-avatar fallback">{authorInitial}</div>
                          )}
                        </div>
                        <div className="public-profile-comment-copy">
                          <div className="public-profile-comment-meta">
                            {author.username
                              ? <Link to={`/u/${author.username}`} className="public-profile-comment-author-link"><strong>{authorName}</strong></Link>
                              : <strong>{authorName}</strong>}
                            <span>{formatProfileCommentDate(entry.created_at, locale)}</span>
                          </div>
                          <p>{entry.comment_body}</p>
                          {user?.id && (
                            <button type="button" className="public-profile-reply-btn" onClick={() => handleReplyClick(entry)}>
                              <MessageSquare size={12} /> {t('profile.replyBtn')}
                            </button>
                          )}
                        </div>
                      </article>

                      {(hasReplies || isReplyFormOpen) && (
                        <div className="public-profile-thread-indent">
                          {hasReplies && (
                            <button
                              type="button"
                              className="public-profile-show-replies-btn"
                              onClick={() => toggleReplies(entry.id)}
                            >
                              <span className={`public-profile-reply-chevron${isExpanded ? ' expanded' : ''}`}>▶</span>
                              {isExpanded
                                ? t('profile.hideReplies') || (language === 'th' ? 'ซ่อนการตอบกลับ' : 'Hide replies')
                                : language === 'th'
                                  ? `${replies.length} การตอบกลับ`
                                  : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                            </button>
                          )}

                          {isExpanded && (
                            <div className="public-profile-replies">
                              {replies.map((reply) => {
                                const rAuthor = reply.author_profile || {};
                                const rAuthorName = rAuthor.name || rAuthor.username || t('profile.publicCommentAnonymous');
                                const rAuthorInitial = rAuthorName.charAt(0).toUpperCase();
                                return (
                                  <article key={reply.id} className="public-profile-comment-item public-profile-comment-item-reply">
                                    <div className="public-profile-comment-avatar-wrap">
                                      {rAuthor.avatar_url ? (
                                        <img src={rAuthor.avatar_url} alt="" className="public-profile-comment-avatar public-profile-comment-avatar-sm" />
                                      ) : (
                                        <div className="public-profile-comment-avatar fallback public-profile-comment-avatar-sm">{rAuthorInitial}</div>
                                      )}
                                    </div>
                                    <div className="public-profile-comment-copy">
                                      <div className="public-profile-comment-meta">
                                        {rAuthor.username
                                          ? <Link to={`/u/${rAuthor.username}`} className="public-profile-comment-author-link"><strong>{rAuthorName}</strong></Link>
                                          : <strong>{rAuthorName}</strong>}
                                        <span>{formatProfileCommentDate(reply.created_at, locale)}</span>
                                      </div>
                                      <p>{reply.comment_body}</p>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}

                          {isReplyFormOpen && (
                            <form className="public-profile-inline-reply-form" onSubmit={(e) => submitReply(e, entry)}>
                              <textarea
                                ref={replyInputRef}
                                value={replyDraft}
                                onChange={(e) => { setReplyDraft(e.target.value); setReplyError(''); }}
                                placeholder={language === 'th' ? `ตอบกลับ ${authorName}...` : `Reply to ${authorName}...`}
                                maxLength={500}
                                rows={2}
                                disabled={isSubmittingComment}
                                className="public-profile-inline-reply-textarea"
                              />
                              <div className="public-profile-inline-reply-actions">
                                <small>{replyDraft.length}/500</small>
                                {replyError && <span className="public-profile-form-error">{replyError}</span>}
                                <button
                                  type="button"
                                  className="public-profile-cancel-btn"
                                  onClick={() => { setActiveReplyId(null); setReplyDraft(''); }}
                                >
                                  {language === 'th' ? 'ยกเลิก' : 'Cancel'}
                                </button>
                                <Button type="submit" size="sm" variant="primary" disabled={isSubmittingComment || !replyDraft.trim()}>
                                  {isSubmittingComment
                                    ? t('profile.publicCommentSubmitting')
                                    : (language === 'th' ? 'ตอบกลับ' : 'Reply')}
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };

                return topLevel.length > 0 ? (
                  <div className="public-profile-comments-list">
                    {topLevel.map((entry) => renderThread(entry))}
                  </div>
                ) : (
                  <div className="public-profile-empty">
                    <span>{t('profile.publicCommentsEmpty')}</span>
                  </div>
                );
              })()}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

export default PublicProfile;
