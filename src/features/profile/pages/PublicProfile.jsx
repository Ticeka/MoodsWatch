import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, MessageSquare, UserRound, X } from 'lucide-react';
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
import { FollowListModal } from '@/features/social/components/FollowListModal';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { getLocalizedMoodName, getMoodOptionsForAgeGate } from '@/shared/data/moods';
import '../styles/PublicProfile.css';
import '../styles/Profile.css';

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
        const [titles, statsRow] = await Promise.all([
          titleIds.length ? getTitlesByIds(titleIds) : Promise.resolve([]),
          fetchPublicProfileWatchStats(data.id),
        ]);
        const titleMap = new Map(titles.map((title) => [Number(title.id), title]));

        const nextSections = TOP_TITLE_TYPE_OPTIONS.map((typeId) => ({
          typeId,
          label: PROFILE_TYPE_LABELS[typeId]?.[language] || typeId,
          titles: filterTitlesForAgeGate((topTitlesPayload[typeId] || [])
            .map((titleId) => titleMap.get(Number(titleId)))
            .filter(Boolean), showAdult),
        }));

        const resolvedStats = statsRow || DEFAULT_WATCH_STATS;
        if (!cancelled) {
          setProfile(data);
          setWatchStats({
            total: Number(resolvedStats.total || 0),
            seen: Number(resolvedStats.seen || 0),
            watching: Number(resolvedStats.watching || 0),
            reading: Number(resolvedStats.reading || 0),
            completed: Number(resolvedStats.completed || 0),
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

  const tier = useMemo(() => {
    const n = watchStats.total;
    if (n >= 500) return { key: 'legend',    icon: '✨', th: 'ตำนาน',       en: 'Legend' };
    if (n >= 200) return { key: 'diamond',   icon: '💎', th: 'ไดมอนด์',      en: 'Diamond' };
    if (n >= 100) return { key: 'platinum',  icon: '🏆', th: 'แพลทินัม',    en: 'Platinum' };
    if (n >= 50)  return { key: 'gold',      icon: '🥇', th: 'โกลด์',        en: 'Gold' };
    if (n >= 20)  return { key: 'silver',    icon: '🥈', th: 'ซิลเวอร์',    en: 'Silver' };
    if (n >= 5)   return { key: 'bronze',    icon: '🥉', th: 'บรอนซ์',      en: 'Bronze' };
    return                 { key: 'rookie',  icon: '🌱', th: 'มือใหม่',     en: 'Rookie' };
  }, [watchStats.total]);

  const selectableMoods = useMemo(() => getMoodOptionsForAgeGate(showAdult), [showAdult]);

  const favoriteMoodObjects = useMemo(() => {
    const ids = Array.isArray(profile?.favorite_moods) ? profile.favorite_moods : [];
    const idSet = new Set(ids);
    return selectableMoods.filter((mood) => idSet.has(mood.id));
  }, [profile?.favorite_moods, selectableMoods]);

  const completionRatio = watchStats.total
    ? Math.round((watchStats.completed / watchStats.total) * 100)
    : 0;

  const topTypeGroups = useMemo(
    () => sections.filter((section) => section.titles.length > 0),
    [sections]
  );

  const [followCounts, setFollowCounts] = useState({ followersCount: 0, followingCount: 0 });
  const handleFollowCountChange = React.useCallback((next) => setFollowCounts(next), []);
  const [followListKind, setFollowListKind] = useState(null);

  const [openTopType, setOpenTopType] = useState(null);
  const activeTopGroup = useMemo(
    () => topTypeGroups.find((section) => section.typeId === openTopType) || null,
    [openTopType, topTypeGroups]
  );

  useEffect(() => {
    if (!activeTopGroup) return;
    const onKey = (event) => { if (event.key === 'Escape') setOpenTopType(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTopGroup]);

  const getTypeLabel = (typeId) => PROFILE_TYPE_LABELS[typeId]?.[language] || typeId;

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
        {/* Editorial hero */}
        <div className="profile-hero-mw">
          <div className="profile-mw-avatar-wrap">
            <div className="profile-mw-avatar-ring">
              <div className="profile-mw-avatar-inner">
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="" className="profile-mw-avatar-img" />
                  : <div className="profile-mw-avatar-img profile-mw-avatar-fallback">{profileInitial}</div>}
              </div>
            </div>
            <div className={`profile-mw-tier-badge profile-mw-tier-${tier.key}`}>
              <span>{tier.icon}</span>
              <span>{language === 'th' ? tier.th : tier.en}</span>
            </div>
          </div>

          <div className="profile-mw-identity">
            <div className="profile-mw-handle-row">
              <h1 className="profile-mw-handle">{profile.name || profile.username}</h1>
              <FollowButton profileUserId={profile.id} profileUsername={profile.username} onCountChange={handleFollowCountChange} />
            </div>

            <div className="profile-mw-stats">
              {[
                { value: watchStats.total,            label: language === 'th' ? 'เรื่อง' : 'titles', onClick: null },
                { value: followCounts.followersCount, label: language === 'th' ? 'ผู้ติดตาม' : 'followers', onClick: () => setFollowListKind('followers') },
                { value: followCounts.followingCount, label: language === 'th' ? 'กำลังติดตาม' : 'following', onClick: () => setFollowListKind('following') },
                { value: watchStats.completed,        label: t('profile.completed'), onClick: null },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`profile-mw-stat${s.onClick ? ' is-clickable' : ''}`}
                  onClick={s.onClick || undefined}
                  role={s.onClick ? 'button' : undefined}
                  tabIndex={s.onClick ? 0 : undefined}
                  onKeyDown={s.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick(); } } : undefined}
                >
                  <strong>{s.value}</strong>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            <div className="profile-mw-bio">
              <p className="public-profile-username" style={{ margin: 0, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.82rem' }}>@{profile.username}</p>
              {profile.bio
                ? <p>{profile.bio}</p>
                : <p className="profile-mw-bio-placeholder">{t('profile.publicNoBio')}</p>}
              <span className="profile-mw-meta">
                {t('profile.memberSince', { date: formatProfileDate(profile.created_at, locale) })}
              </span>
              <div className="profile-mw-pills">
                <span className="profile-mw-pill tier">{tier.icon} {language === 'th' ? tier.th : tier.en}</span>
                {watchStats.total > 0 && (
                  <span className="profile-mw-pill rate">★ {completionRatio}% {language === 'th' ? 'ดูจบ' : 'completed'}</span>
                )}
                {favoriteMoodObjects.length > 0 && (
                  <span className="profile-mw-pill mood">{favoriteMoodObjects.length} {language === 'th' ? 'มู้ดที่ชอบ' : 'favorite moods'}</span>
                )}
                {totalPinned > 0 && (
                  <span className="profile-mw-pill neutral">🏆 {totalPinned} {language === 'th' ? 'เรื่องโปรด' : 'pinned'}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Highlights strip: top-5 groups + favorite moods */}
        {(favoriteMoodObjects.length > 0 || topTypeGroups.length > 0) && (
          <div className="profile-mw-highlights">
            {topTypeGroups.map((section) => {
              const leadTitle = section.titles[0];
              const typeIcon = section.typeId === 'anime' ? '📺' : section.typeId === 'manga' ? '📖' : section.typeId === 'manhwa' ? '📱' : '🏆';
              return (
                <button
                  type="button"
                  key={`group-${section.typeId}`}
                  className="profile-mw-highlight is-top"
                  onClick={() => setOpenTopType(section.typeId)}
                >
                  <div className="profile-mw-highlight-ring profile-mw-top-ring">
                    <div className="profile-mw-highlight-inner">
                      {leadTitle?.cover
                        ? <img src={leadTitle.cover} alt="" className="profile-mw-highlight-cover" />
                        : <div className="profile-mw-highlight-icon">{typeIcon}</div>}
                    </div>
                    <span className="profile-mw-medal profile-mw-medal-1">🥇</span>
                  </div>
                  <div className="profile-mw-highlight-label">
                    Top 5 {getTypeLabel(section.typeId)}
                  </div>
                </button>
              );
            })}
            {favoriteMoodObjects.map((mood) => (
              <div key={mood.id} className="profile-mw-highlight">
                <div className="profile-mw-highlight-ring" style={{ background: `linear-gradient(135deg, ${mood.color}, var(--rose-500))` }}>
                  <div className="profile-mw-highlight-inner">
                    <div className="profile-mw-highlight-icon">{mood.icon}</div>
                  </div>
                </div>
                <div className="profile-mw-highlight-label">{getLocalizedMoodName(mood, language)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top 5 list modal */}
        {activeTopGroup && (
          <div className="profile-story-backdrop" onClick={() => setOpenTopType(null)}>
            <button
              type="button"
              className="profile-story-close"
              onClick={(event) => { event.stopPropagation(); setOpenTopType(null); }}
              aria-label={t('common.close')}
            >
              <X size={22} />
            </button>
            <article className="profile-top5-card" onClick={(event) => event.stopPropagation()}>
              <header className="profile-top5-header">
                <div className="profile-top5-kicker">{language === 'th' ? 'อันดับเรื่องโปรด' : 'Top pick'}</div>
                <h2 className="profile-top5-title">
                  Top 5 <span className="profile-top5-title-accent">{getTypeLabel(activeTopGroup.typeId)}</span>
                </h2>
              </header>
              <ol className="profile-top5-list">
                {activeTopGroup.titles.map((title, index) => {
                  const rank = index + 1;
                  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                  return (
                    <li key={title.id} className={`profile-top5-item profile-top5-rank-${rank}`}>
                      <Link to={`/title/${title.slug}`} style={{ display: 'contents', color: 'inherit', textDecoration: 'none' }} onClick={() => setOpenTopType(null)}>
                        <div className={`profile-top5-medal profile-top5-medal-${rank}`}>
                          {rankIcon ? <span className="profile-top5-medal-emoji">{rankIcon}</span> : <span className="profile-top5-medal-num">#{rank}</span>}
                        </div>
                        {title.cover
                          ? <img src={title.cover} alt="" className="profile-top5-cover" />
                          : <div className="profile-top5-cover profile-top5-cover-fallback">{getTitleDisplayName(title).charAt(0)}</div>}
                        <div className="profile-top5-copy">
                          <strong>{getTitleDisplayName(title)}</strong>
                          <div className="profile-top5-meta">
                            {title.year ? <span>{title.year}</span> : null}
                            {title.score ? <span>★ {title.score}</span> : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </article>
          </div>
        )}

        {/* Taste dashboard */}
        <div className="profile-mw-dashboard">
          <div className="profile-mw-taste-card">
            <div className="profile-mw-taste-kicker">{language === 'th' ? 'รสนิยม' : 'Their taste'}</div>
            <div className="profile-mw-taste-quote">
              {profile.bio
                ? `"${profile.bio}"`
                : (language === 'th' ? '"ยังไม่มีคำอธิบาย"' : '"no bio yet"')}
            </div>
            {favoriteMoodObjects.length > 0 && (
              <div className="profile-mw-taste-chips">
                {favoriteMoodObjects.slice(0, 6).map((mood) => (
                  <span key={mood.id} className="profile-mw-taste-chip" style={{ background: `${mood.color}22`, color: mood.color }}>
                    <span>{mood.icon}</span>
                    <span>{getLocalizedMoodName(mood, language)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {[
            { value: watchStats.total, label: language === 'th' ? 'เรื่องทั้งหมด' : 'Titles watched' },
            { value: watchStats.watching + watchStats.reading, label: language === 'th' ? 'กำลังดู' : 'In progress' },
            { value: watchStats.completed, label: language === 'th' ? 'ดูจบแล้ว' : 'Completed' },
            { value: `${completionRatio}%`, label: language === 'th' ? 'อัตราดูจบ' : 'Completion rate' },
          ].map((s) => (
            <div key={s.label} className="profile-mw-stat-tile">
              <div className="profile-mw-stat-value">{s.value}</div>
              <div className="profile-mw-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

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

        {followListKind && (
          <FollowListModal
            profileUserId={profile.id}
            kind={followListKind}
            onClose={() => setFollowListKind(null)}
          />
        )}
      </div>
    </section>
  );
}

export default PublicProfile;
