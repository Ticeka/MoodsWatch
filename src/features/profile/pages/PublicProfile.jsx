import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { getTitleDisplayName, TOP_TITLE_TYPE_OPTIONS } from '@/features/profile/lib/profileStore';
import { supabase } from '@/shared/lib/supabase';
import './PublicProfile.css';

const TYPE_LABELS = {
  anime: { en: 'Anime', th: 'อนิเมะ' },
  manga: { en: 'Manga', th: 'มังงะ' },
  manhwa: { en: 'Manhwa', th: 'มันฮวา' },
};

const DEFAULT_WATCH_STATS = {
  total: 0,
  seen: 0,
  watching: 0,
  reading: 0,
  completed: 0,
};

function formatJoinDate(value, locale) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  } catch {
    return '-';
  }
}

function formatCommentDate(value, locale) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '-';
  }
}

export function PublicProfile() {
  const { user } = useAuth();
  const { username: routeUsername = '' } = useParams();
  const { language, t } = useLanguage();
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
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [notFound, setNotFound] = useState(false);

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

      if (!supabase) {
        setErrorMessage(t('profile.publicLoadFailed'));
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, name, avatar_url, bio, username, top_titles, favorite_moods, created_at, allow_profile_comments')
          .eq('username', normalizedUsername)
          .eq('is_profile_public', true)
          .maybeSingle();

        if (error) throw error;

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
        const { data: statsRows, error: statsError } = await supabase.rpc('get_public_profile_watch_stats', {
          p_profile_user_id: data.id,
        });

        if (statsError) throw statsError;
        const statsRow = Array.isArray(statsRows) ? (statsRows[0] || DEFAULT_WATCH_STATS) : (statsRows || DEFAULT_WATCH_STATS);

        const nextSections = TOP_TITLE_TYPE_OPTIONS.map((typeId) => ({
          typeId,
          label: TYPE_LABELS[typeId]?.[language] || typeId,
          titles: (topTitlesPayload[typeId] || [])
            .map((titleId) => titleMap.get(Number(titleId)))
            .filter(Boolean),
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
  }, [language, normalizedUsername, t]);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      if (!profile?.id || !profile.allow_profile_comments || !supabase) {
        setComments([]);
        return;
      }

      setIsCommentsLoading(true);
      setCommentError('');
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
          .eq('profile_user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
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

  const totalPinned = useMemo(
    () => sections.reduce((count, section) => count + section.titles.length, 0),
    [sections]
  );
  const canComment = Boolean(profile?.allow_profile_comments);
  const canPostComment = Boolean(user?.id && canComment && profile?.id);
  const profileInitial = (profile?.name || profile?.username || 'M').charAt(0).toUpperCase();

  const submitComment = async (event) => {
    event.preventDefault();
    if (!canPostComment || !supabase) return;

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
      const { data, error } = await supabase
        .from('profile_comments')
        .insert({
          profile_user_id: profile.id,
          author_user_id: user.id,
          comment_body: commentBody,
        })
        .select(`
          id,
          comment_body,
          created_at,
          author_user_id,
          author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      setComments((current) => [data, ...current]);
      setCommentDraft('');
      setCommentSuccess(t('profile.publicCommentSuccess'));
    } catch {
      setCommentError(t('profile.publicCommentSubmitFailed'));
    } finally {
      setIsSubmittingComment(false);
    }
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
              <span>{t('profile.memberSince', { date: formatJoinDate(profile.created_at, locale) })}</span>
              <span>{t('profile.publicPinnedCount', { count: totalPinned })}</span>
            </div>
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
                <label htmlFor="profile-comment-input">{t('profile.publicCommentLabel')}</label>
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
                <small>{t('profile.publicCommentHint')}</small>
                {!user?.id && <p className="public-profile-form-note">{t('profile.publicCommentLoginRequired')}</p>}
                {commentError && <p className="public-profile-form-error">{commentError}</p>}
                {commentSuccess && <p className="public-profile-form-success">{commentSuccess}</p>}
                <Button type="submit" disabled={!canPostComment || isSubmittingComment}>
                  {isSubmittingComment ? t('profile.publicCommentSubmitting') : t('profile.publicCommentSubmit')}
                </Button>
              </form>

              {isCommentsLoading ? (
                <div className="public-profile-state compact">
                  <Loader2 size={20} className="animate-spin" />
                  <p>{t('profile.publicCommentsLoading')}</p>
                </div>
              ) : comments.length > 0 ? (
                <div className="public-profile-comments-list">
                  {comments.map((entry) => {
                    const author = entry.author_profile || {};
                    const authorName = author.name || author.username || t('profile.publicCommentAnonymous');
                    const authorInitial = authorName.charAt(0).toUpperCase();
                    return (
                      <article key={entry.id} className="public-profile-comment-item">
                        <div className="public-profile-comment-avatar-wrap">
                          {author.avatar_url ? (
                            <img src={author.avatar_url} alt="" className="public-profile-comment-avatar" />
                          ) : (
                            <div className="public-profile-comment-avatar fallback">{authorInitial}</div>
                          )}
                        </div>
                        <div className="public-profile-comment-copy">
                          <div className="public-profile-comment-meta">
                            <strong>{authorName}</strong>
                            <span>{formatCommentDate(entry.created_at, locale)}</span>
                          </div>
                          <p>{entry.comment_body}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="public-profile-empty">
                  <span>{t('profile.publicCommentsEmpty')}</span>
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

export default PublicProfile;
