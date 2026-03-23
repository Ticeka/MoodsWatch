import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { getSimilarTitles, getTitleBySlug } from '@/features/discover/lib/recommend';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useTopTitles } from '@/features/profile/hooks/useTopTitles';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { buildContentReportPayload, CONTENT_REPORT_ISSUE_OPTIONS } from '@/shared/lib/contentReports';
import { normalizeTrailer } from '@/shared/lib/trailers';
import { TrailerModal } from '@/shared/components/ui/TrailerModal';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { LIST_STATUS_OPTIONS, getLocalizedLabel } from '@/shared/data/moods';
import { matchesAgeGateMode } from '@/shared/lib/ageGate';
import { supabase } from '@/shared/lib/supabase';
import { getTitleTypeMeta, isEpisodeBasedType } from '@/shared/lib/titleType';
import { ChevronLeft, ChevronRight, ExternalLink, Flag, Link as LinkIcon, Music, Play, PlayCircle, Plus, Star, Trash2, Trophy } from 'lucide-react';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import { TitleReviews } from '@/features/titles/components/TitleReviews';
import './TitleDetail.css';

const PLATFORM_OPTIONS = [
  'Netflix', 'Bilibili', 'iQIYI', 'Crunchyroll', 'Disney+', 'YouTube',
  'Ani-One', 'Muse Thailand', 'MANGA Plus', 'WEBTOON', 'Kakao Webtoon',
  'Tapas', 'Tappytoon', 'Lezhin Comics', 'Comikey', 'Pocket Comics',
  'Toomics', 'Viz', 'Shonen Jump', 'Line Webtoon', 'Community Scan',
  'Fan Translation', 'Mirror Site', 'Reading Portal', 'Other',
];

const PLATFORM_DISPLAY_NAME_MAP = {
  'Up-Manga': 'Reading Portal',
  ReadToon: 'Reading Portal',
};

function getPlatformDisplayName(platform, t) {
  const baseName = PLATFORM_DISPLAY_NAME_MAP[platform.name] || platform.name;
  return platform.isSearchFallback ? `${baseName} ${t('titleDetail.searchLabel')}` : baseName;
}

export function TitleDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();
  const { user } = useAuth();
  const { watchlist, addToList, removeFromList, updateItem, getStatus, advanceProgress, setConsumptionTarget } = useWatchlist();
  const { hiddenFromRecommendationIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const { isInTopTitles, addToTopTitles, removeFromTopTitles, getRank, limit } = useTopTitles();

  const [title, setTitle] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAgeGateBlocked, setIsAgeGateBlocked] = useState(false);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportForm, setReportForm] = useState({ issueType: 'metadata', description: '' });
  const [canScrollSimilarPrev, setCanScrollSimilarPrev] = useState(false);
  const [canScrollSimilarNext, setCanScrollSimilarNext] = useState(false);
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [addLinkForm, setAddLinkForm] = useState({ platform_name: '', url: '', region_code: '' });
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [castTab, setCastTab] = useState('characters');
  const [titleStats, setTitleStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [canScrollCastPrev, setCanScrollCastPrev] = useState(false);
  const [canScrollCastNext, setCanScrollCastNext] = useState(false);
  const [trailerModalOpen, setTrailerModalOpen] = useState(false);
  const [themeSongs, setThemeSongs] = useState([]);
  const [activeSongTab, setActiveSongTab] = useState('OP');
  const [activeSong, setActiveSong] = useState(null);
  const [songPage, setSongPage] = useState(0);
  const similarRailRef = useRef(null);
  const castRailRef = useRef(null);

  const status = title ? getStatus(title.id) : null;
  const watchlistItem = title ? watchlist.find((item) => item.titleId === title.id) : null;
  const typeMeta = title ? getTitleTypeMeta(title.type, language) : null;
  const isAdmin = user?.profile?.role === 'admin' || user?.profile?.role === 'editor';

  useEffect(() => {
    window.scrollTo(0, 0);
    setTrailerModalOpen(false);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setIsAgeGateBlocked(false);
      try {
        const nextTitle = await getTitleBySlug(slug);
        if (!cancelled) {
          if (nextTitle && !matchesAgeGateMode(nextTitle, showAdult)) {
            setTitle(null);
            setIsAgeGateBlocked(true);
          } else {
            setTitle(nextTitle);
          }
        }
      } catch (error) {
        console.error('Failed to load title:', error);
        if (!cancelled) {
          setTitle(null);
          setIsAgeGateBlocked(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [showAdult, slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadSimilarTitles() {
      if (!title?.id) {
        setSimilar([]);
        return;
      }

      try {
        const nextSimilar = await getSimilarTitles(title.id, 8, {
          watchlist,
          preferences: prefs,
          hiddenTitleIds: hiddenFromRecommendationIds,
          showAdult,
        });

        if (!cancelled) {
          setSimilar(nextSimilar);
        }
      } catch (error) {
        console.error('Failed to load similar titles:', error);
        if (!cancelled) {
          setSimilar([]);
        }
      }
    }

    loadSimilarTitles();
    return () => { cancelled = true; };
  }, [title?.id, watchlist, prefs, hiddenFromRecommendationIds, showAdult]);

  useEffect(() => {
    if (castTab !== 'stats' || !title?.id) return undefined;
    let cancelled = false;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const { data, error } = await supabase
          .rpc('get_title_status_counts', { p_title_id: title.id });
        if (error) throw error;
        if (!cancelled && data) {
          const counts = {};
          data.forEach((row) => {
            counts[row.list_status] = Number(row.count);
          });
          setTitleStats(counts);
        }
      } catch (err) {
        console.error('Failed to load title stats:', err);
        if (!cancelled) setTitleStats({});
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [castTab, title?.id]);

  useEffect(() => {
    if (!title?.id) return undefined;
    let cancelled = false;

    async function fetchThemeSongs() {
      const { data, error } = await supabase
        .from('title_theme_songs')
        .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
        .eq('canonical_title_id', title.id)
        .order('display_order');

      if (error) {
        console.error('[ThemeSongs] fetch error:', error);
        return;
      }
      if (!cancelled) {
        setThemeSongs(data || []);
        setSongPage(0);
        if (data?.length) {
          const hasOp = data.some((s) => s.theme_type === 'OP');
          setActiveSongTab(hasOp ? 'OP' : 'ED');
        }
      }
    }

    fetchThemeSongs();
    return () => { cancelled = true; };
  }, [title?.id]);

  useEffect(() => {
    if (castTab === 'stats') return undefined;
    const rail = castRailRef.current;
    if (!rail) return undefined;

    const updateCastNavState = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      setCanScrollCastPrev(rail.scrollLeft > 8);
      setCanScrollCastNext(max - rail.scrollLeft > 8);
    };

    updateCastNavState();
    rail.addEventListener('scroll', updateCastNavState, { passive: true });
    window.addEventListener('resize', updateCastNavState);
    return () => {
      rail.removeEventListener('scroll', updateCastNavState);
      window.removeEventListener('resize', updateCastNavState);
    };
  }, [castTab, title?.characters, title?.staff]);

  const scrollCastRail = (direction) => {
    const rail = castRailRef.current;
    if (!rail) return;
    rail.scrollBy({ left: rail.clientWidth * 0.85 * direction, behavior: 'smooth' });
  };

  useEffect(() => {
    const rail = similarRailRef.current;
    if (!rail) return undefined;

    const updateSimilarNavState = () => {
      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      setCanScrollSimilarPrev(rail.scrollLeft > 8);
      setCanScrollSimilarNext(maxScrollLeft - rail.scrollLeft > 8);
    };

    updateSimilarNavState();
    rail.addEventListener('scroll', updateSimilarNavState, { passive: true });
    window.addEventListener('resize', updateSimilarNavState);

    return () => {
      rail.removeEventListener('scroll', updateSimilarNavState);
      window.removeEventListener('resize', updateSimilarNavState);
    };
  }, [similar]);

  if (isLoading) {
    return (
      <div className="detail-loading">
        <div className="detail-loading-spinner">{t('titleDetail.loadingLabel')}</div>
        <h3>{t('titleDetail.loadingTitle')}</h3>
      </div>
    );
  }

  if (!title) {
    return (
      <div className="detail-not-found">
        <span className="not-found-icon">{t(isAgeGateBlocked ? 'titleDetail.ageGateBlockedLabel' : 'titleDetail.titleNotFoundLabel')}</span>
        <h2>{t(isAgeGateBlocked ? 'titleDetail.ageGateBlockedTitle' : 'titleDetail.titleNotFound')}</h2>
        <p>{t(isAgeGateBlocked ? 'titleDetail.ageGateBlockedHint' : 'titleDetail.titleNotFoundHint')}</p>
        <Button onClick={() => navigate('/')}>{t('titleDetail.backHome')}</Button>
      </div>
    );
  }

  const rawSynopsis = (title.synopsis || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const shouldTruncate = rawSynopsis.length > 300;
  const displaySynopsis = shouldTruncate && !showFullSynopsis ? `${rawSynopsis.slice(0, 300)}...` : rawSynopsis;
  const primaryTitle = title.title_th || title.title_en;
  const trailerTitle = primaryTitle || title.title_romaji || title.title_native || title.slug;
  const secondaryTitle = [title.title_en, title.title_native]
    .filter(Boolean)
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .filter((entry) => entry !== primaryTitle)
    .join(' / ');
  const synopsisParagraphs = displaySynopsis
    ? displaySynopsis.split(/(?<=[.!?])\s+/).reduce((groups, sentence, index) => {
      if (!sentence) return groups;
      const groupIndex = Math.floor(index / 2);
      groups[groupIndex] = groups[groupIndex] ? `${groups[groupIndex]} ${sentence}` : sentence;
      return groups;
    }, [])
    : [];
  const trailer = normalizeTrailer(title);

  const statusOption = status ? LIST_STATUS_OPTIONS.find((option) => option.id === status) : null;
  const progressEpisode = watchlistItem?.progressEpisode ?? '';
  const progressChapter = watchlistItem?.progressChapter ?? '';
  const targetEpisode = watchlistItem?.targetEpisode ?? '';
  const targetChapter = watchlistItem?.targetChapter ?? '';
  const userScore = watchlistItem?.score != null ? Math.round(watchlistItem.score / 10) : null;
  const inTopTitles = isInTopTitles(title);
  const topTitleRank = getRank(title);

  const orderedPlatforms = (title.platforms || [])
    .map((platform) => ({
      ...platform,
      displayName: getPlatformDisplayName(platform, t),
    }))
    .sort((left, right) => {
      const platformPriority = {
        Netflix: 0,
        Crunchyroll: 1,
        'Disney+': 2,
        Bilibili: 3,
        iQIYI: 4,
        YouTube: 5,
        'Ani-One': 6,
        'Muse Thailand': 7,
        'MANGA Plus': 8,
        WEBTOON: 9,
        [`WEBTOON ${t('titleDetail.searchLabel')}`]: 10,
        'Kakao Webtoon': 11,
        'Line Webtoon': 12,
        Tapas: 13,
        Tappytoon: 14,
        'Lezhin Comics': 15,
        Comikey: 16,
        'Pocket Comics': 17,
        Toomics: 18,
        Viz: 19,
        'Shonen Jump': 20,
        'Community Scan': 90,
        'Fan Translation': 91,
        'Mirror Site': 92,
        'Reading Portal': 93,
      };
      const leftPriority = platformPriority[left.displayName] ?? 99;
      const rightPriority = platformPriority[right.displayName] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left.displayName || '').localeCompare(String(right.displayName || ''));
    });

  const officialPlatforms = orderedPlatforms.filter((platform) => !platform.isSearchFallback);
  const fallbackPlatforms = orderedPlatforms.filter((platform) => platform.isSearchFallback);

  const scrollSimilarByPage = (direction) => {
    const rail = similarRailRef.current;
    if (!rail) return;
    const amount = Math.max(rail.clientWidth * 0.9, 280) * direction;
    rail.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handleToggleTopTitle = async () => {
    try {
      if (inTopTitles) {
        await removeFromTopTitles(title);
        toast.success(t('card.removedFromTopTitles', { type: title.type }));
        return;
      }

      const result = await addToTopTitles(title);
      if (!result.ok && result.reason === 'limit') {
        toast.error(t('card.topTitlesFull', { limit, type: title.type }));
        return;
      }

      toast.success(t('card.addedToTopTitles', { type: title.type }));
    } catch (error) {
      console.error(error);
      toast.error(t('card.failedTopTitlesUpdate'));
    }
  };

  const handleSaveLink = async () => {
    if (!addLinkForm.platform_name || !addLinkForm.url) {
      toast.error(t('titleDetail.selectPlatformAndUrl'));
      return;
    }

    setIsSavingLink(true);
    try {
      const { error } = await supabase.from('title_availability').insert({
        canonical_title_id: title.id,
        platform_name: addLinkForm.platform_name,
        url: addLinkForm.url,
        region_code: addLinkForm.region_code || null,
        is_official: true,
      });
      if (error) throw error;

      toast.success(t('titleDetail.linkSaved'));
      setShowAddLinkForm(false);
      setAddLinkForm({ platform_name: '', url: '', region_code: '' });
      setTitle(await getTitleBySlug(slug));
    } catch (error) {
      toast.error(error.message || t('titleDetail.linkSaveFailed'));
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleDeleteLink = async (platform) => {
    try {
      const { error } = await supabase
        .from('title_availability')
        .delete()
        .eq('canonical_title_id', title.id)
        .eq('platform_name', platform.name)
        .eq('url', platform.url);
      if (error) throw error;

      toast.success(t('titleDetail.linkDeleted'));
      setTitle(await getTitleBySlug(slug));
    } catch (error) {
      toast.error(error.message || t('titleDetail.linkDeleteFailed'));
    }
  };

  const handleSubmitReport = async (event) => {
    event.preventDefault();
    if (!title?.id) return;

    if (!user) {
      toast.error(t('titleDetail.signInToReport'));
      navigate('/login', { state: { from: { pathname: `/title/${slug}` } } });
      return;
    }

    if (!supabase) {
      toast.error(t('titleDetail.reportServiceUnavailable'));
      return;
    }

    setIsSubmittingReport(true);
    try {
      const { error } = await supabase
        .from('content_reports')
        .insert(buildContentReportPayload(reportForm, user.id, title.id, 'title_detail'));
      if (error) throw error;

      toast.success(t('titleDetail.reportSubmitted'));
      setReportForm({ issueType: 'metadata', description: '' });
      setShowReportForm(false);
    } catch (error) {
      console.error('Failed to submit report:', error);
      toast.error(t('titleDetail.reportFailed'));
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="title-detail animate-fade-in">
      <div className="banner-bg" style={{ backgroundImage: `url(${title.banner || title.cover})` }}>
        <div className="banner-overlay"></div>
      </div>

      <div className="container relative z-10 detail-content">
        <div className="detail-header">
          <div className="cover-wrapper animate-scale-in">
            <img src={title.cover} alt={title.title_en || title.title_th} className="detail-cover" />
            <div className="cover-score-bar">
              <div className="score-item">
                <span className="score-label">{t('titleDetail.score')}</span>
                <span className="score-value">{title.score || '-'}</span>
              </div>
              <div className="score-divider"></div>
              <div className="score-item">
                <span className="score-label">{t('titleDetail.popularity')}</span>
                <span className="score-value">{title.popularity ? `${(title.popularity / 1000).toFixed(1)}K` : '-'}</span>
              </div>
            </div>
          </div>

          <div className="detail-info">
            <div className="badges-row">
              <span className="badge type-badge detail-badge">{typeMeta?.displayLabel}</span>
              <span className="badge status-badge detail-badge">
                {title.status === 'completed' ? t('titleDetail.completed') : t('titleDetail.releasing')}
              </span>
              <span className="badge year-badge detail-badge">{title.year}</span>
              {title.episodes && <span className="badge detail-badge ep-badge">{title.episodes} EP</span>}
              {title.chapters && <span className="badge detail-badge ep-badge">{title.chapters} CH</span>}
              {title.duration && <span className="badge detail-badge ep-badge">{title.duration} min/ep</span>}
            </div>

            <div className="detail-title-row">
              <h1 className="title-primary">{primaryTitle}</h1>
              <button
                type="button"
                className={`report-icon-btn ${showReportForm ? 'active' : ''}`}
                onClick={() => setShowReportForm((current) => !current)}
                aria-label={showReportForm ? t('titleDetail.hideReportFormForTitle', { title: primaryTitle }) : t('titleDetail.reportIssueForTitle', { title: primaryTitle })}
                title={showReportForm ? t('titleDetail.hideReportFormForTitle', { title: primaryTitle }) : t('titleDetail.reportIssueForTitle', { title: primaryTitle })}
              >
                <Flag size={15} />
              </button>
            </div>

            {secondaryTitle && <h2 className="title-secondary">{secondaryTitle}</h2>}

            <div className="genres-row">
              {(title.genres || []).map((genre) => <span key={genre} className="genre-pill">{genre}</span>)}
            </div>

            <div className="action-row">
              <button className={`top-title-chip ${inTopTitles ? 'active' : ''}`} onClick={handleToggleTopTitle} type="button">
                <Trophy size={18} fill={inTopTitles ? 'currentColor' : 'none'} />
                <span>{inTopTitles ? t('card.top', { rank: topTitleRank }) : t('card.addToTopTitles', { type: title.type })}</span>
              </button>

              <div className="watchlist-actions">
                {status ? (
                  <>
                    <div className="status-selector-wrapper">
                      <div className="current-status" style={{ '--status-color': statusOption?.color }}>
                        <span>{statusOption?.icon}</span>
                        <span>{getLocalizedLabel(statusOption, language)}</span>
                      </div>
                      <select
                        value={status}
                        onChange={(event) => updateItem(title.id, { status: event.target.value }, { title })}
                        className="status-select"
                      >
                        {LIST_STATUS_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>{option.icon} {getLocalizedLabel(option, language)}</option>
                        ))}
                      </select>
                      <button className="remove-btn" onClick={() => removeFromList(title.id)} type="button" aria-label={t('titleDetail.removeFromListForTitle', { title: primaryTitle })}>
                        {t('titleDetail.remove')}
                      </button>
                    </div>

                    {(status === 'watching' || status === 'reading') && (
                      <div className="progress-editor">
                        <label className="progress-field">
                          <span>{status === 'watching' ? t('titleDetail.episode') : t('titleDetail.chapter')}</span>
                          <input
                            type="number"
                            min="0"
                            aria-label={status === 'watching' ? t('titleDetail.progressInputEpisode', { title: primaryTitle }) : t('titleDetail.progressInputChapter', { title: primaryTitle })}
                            value={status === 'watching' ? progressEpisode : progressChapter}
                            onChange={(event) => updateItem(
                              title.id,
                              status === 'watching'
                                ? {
                                  progressEpisode: event.target.value === '' ? null : Number(event.target.value),
                                  lastConsumedAt: new Date().toISOString(),
                                  metadata: { ...(watchlistItem?.metadata || {}), sessionSource: 'manual' },
                                }
                                : {
                                  progressChapter: event.target.value === '' ? null : Number(event.target.value),
                                  lastConsumedAt: new Date().toISOString(),
                                  metadata: { ...(watchlistItem?.metadata || {}), sessionSource: 'manual' },
                                },
                              { title }
                            )}
                          />
                        </label>
                        <button
                          className="progress-chip"
                          type="button"
                          aria-label={status === 'watching' ? t('titleDetail.addOneEpisode', { title: primaryTitle }) : t('titleDetail.addOneChapter', { title: primaryTitle })}
                          onClick={async () => {
                            try {
                              await advanceProgress(title, 1);
                            } catch (error) {
                              console.error(error);
                              toast.error(t('titleDetail.failedUpdateProgress'));
                            }
                          }}
                        >
                          +1 {status === 'watching' ? 'EP' : 'CH'}
                        </button>
                        <label className="progress-field">
                          <span>{t('common.target')}</span>
                          <input
                            type="number"
                            min="0"
                            aria-label={t('titleDetail.targetInputForTitle', { title: primaryTitle })}
                            value={status === 'watching' ? targetEpisode : targetChapter}
                            onChange={(event) => setConsumptionTarget(title, event.target.value === '' ? null : Number(event.target.value))}
                          />
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="add-actions">
                    <Button onClick={() => addToList(title.id, 'planned')}>{t('titleDetail.addToList')}</Button>
                    <Button variant="secondary" onClick={() => addToList(title.id, 'completed')}>{t('titleDetail.markCompleted')}</Button>
                    <Button variant="ghost" onClick={() => addToList(title.id, isEpisodeBasedType(title.type) ? 'watching' : 'reading')}>
                      {t('titleDetail.startNow')}
                    </Button>
                  </div>
                )}
              </div>

              {user && (
                <div className="score-editor">
                  <span className="score-editor-label">
                    <Star size={13} aria-hidden="true" />
                    {t('titleDetail.myScore')}
                    {userScore !== null && <span className="score-editor-value">{userScore}/10</span>}
                  </span>
                  <div className="score-pips">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`score-pip${userScore !== null && n <= userScore ? ' active' : ''}${userScore === n ? ' selected' : ''}`}
                        onClick={async () => {
                          if (!status) await addToList(title.id, 'planned');
                          await updateItem(title.id, { score: n === userScore ? null : n * 10 }, { title });
                        }}
                        aria-label={`${t('titleDetail.myScore')} ${n}`}
                        aria-pressed={userScore === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showReportForm && (
                <section className="report-panel">
                  <form className="report-form" onSubmit={handleSubmitReport}>
                    <label className="report-field">
                      <span>{t('titleDetail.reportIssueType')}</span>
                      <select
                        value={reportForm.issueType}
                        onChange={(event) => setReportForm((current) => ({ ...current, issueType: event.target.value }))}
                      >
                        {CONTENT_REPORT_ISSUE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="report-field report-field-wide">
                      <span>{t('titleDetail.reportDescriptionLabel')}</span>
                      <textarea
                        value={reportForm.description}
                        onChange={(event) => setReportForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder={t('titleDetail.reportDescriptionPlaceholder')}
                        aria-label={t('titleDetail.reportDescriptionForTitle', { title: primaryTitle })}
                        rows={4}
                      />
                    </label>
                    <div className="report-actions">
                      <span className="report-helper">{user ? t('titleDetail.reportHelperSignedIn') : t('titleDetail.reportHelperSignedOut')}</span>
                      <button type="submit" className="report-submit-btn" disabled={isSubmittingReport}>
                        {isSubmittingReport ? t('titleDetail.reportSubmitting') : t('titleDetail.reportSubmit')}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          </div>
        </div>

        <div className="detail-body-row">
          {rawSynopsis && (
            <section className="detail-synopsis-panel">
              <h3 className="detail-section-heading">{t('titleDetail.synopsis')}</h3>
              <div className="synopsis-copy">
                {synopsisParagraphs.map((paragraph, index) => (
                  <p key={`${title.id}-synopsis-${index}`} className="synopsis">{paragraph}</p>
                ))}
              </div>
              {shouldTruncate && (
                <button className="synopsis-toggle" onClick={() => setShowFullSynopsis((current) => !current)} type="button">
                  {showFullSynopsis ? t('titleDetail.showLess') : t('titleDetail.readMore')}
                </button>
              )}
            </section>
          )}

          <aside className="detail-body-aside">
            {trailer && (
              <div className="aside-card trailer-aside-card">
                <div className="aside-card-head">
                  <h3 className="detail-section-heading aside-section-heading">{t('titleDetail.metaTrailer')}</h3>
                  {trailer.watchUrl && (
                    <a href={trailer.watchUrl} target="_blank" rel="noreferrer" className="aside-trailer-ext-link">
                      <ExternalLink size={12} />
                      {t('titleDetail.openTrailer')}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="detail-trailer-launcher aside-frame-shape"
                  onClick={() => setTrailerModalOpen(true)}
                  aria-label={t('titleDetail.playTrailerForTitle', { title: trailerTitle })}
                >
                  {trailer.thumbnailUrl ? (
                    <img src={trailer.thumbnailUrl} alt={t('titleDetail.trailerPreviewAlt', { title: trailerTitle })} className="detail-trailer-poster" />
                  ) : (
                    <div className="detail-trailer-poster detail-trailer-poster--empty" aria-hidden="true" />
                  )}
                  <div className="detail-trailer-overlay">
                    <span className="detail-trailer-play">
                      <PlayCircle size={18} />
                      {t('titleDetail.playTrailer')}
                    </span>
                  </div>
                </button>
                {(trailer.site || trailer.source) && (
                  <div className="detail-trailer-meta">
                    {trailer.site && <span>{t('titleDetail.trailerSiteMeta', { site: trailer.site })}</span>}
                    {trailer.source && <span>{t('titleDetail.trailerSourceMeta', { source: trailer.source })}</span>}
                  </div>
                )}
              </div>
            )}
            <div className={`aside-card platforms-card${orderedPlatforms.length === 0 ? ' platforms-card--empty' : ''}`}>
              <div className="platforms-card-head">
                <span className="platform-label">{t('titleDetail.availableOn')}</span>
                {isAdmin && (
                  <button
                    type="button"
                    className="platform-admin-add-btn"
                    onClick={() => setShowAddLinkForm((current) => !current)}
                    title={t('titleDetail.addPlatformLink')}
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>

              {isAdmin && showAddLinkForm && (
                <div className="platform-add-form">
                  <select
                    className="platform-add-select"
                    value={addLinkForm.platform_name}
                    onChange={(event) => setAddLinkForm((current) => ({ ...current, platform_name: event.target.value }))}
                  >
                    <option value="">{t('titleDetail.selectPlatform')}</option>
                    {PLATFORM_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <input
                    className="platform-add-input"
                    placeholder="URL"
                    value={addLinkForm.url}
                    onChange={(event) => setAddLinkForm((current) => ({ ...current, url: event.target.value }))}
                  />
                  <input
                    className="platform-add-input platform-add-input--sm"
                    placeholder={t('titleDetail.regionPlaceholder')}
                    value={addLinkForm.region_code}
                    onChange={(event) => setAddLinkForm((current) => ({ ...current, region_code: event.target.value.toUpperCase() }))}
                  />
                  <button type="button" className="platform-admin-save-btn" onClick={handleSaveLink} disabled={isSavingLink}>
                    {isSavingLink ? t('common.loading') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    className="platform-admin-cancel-btn"
                    onClick={() => {
                      setShowAddLinkForm(false);
                      setAddLinkForm({ platform_name: '', url: '', region_code: '' });
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}

              {orderedPlatforms.length > 0 ? (
                <div className="platform-groups">
                  {officialPlatforms.length > 0 && (
                    <div className="platform-group">
                      {fallbackPlatforms.length > 0 && (
                        <span className="platform-group-label">{t('titleDetail.officialLabel')}</span>
                      )}
                      <div className="platforms">
                        {officialPlatforms.map((platform) => (
                          <div key={`${platform.name}-${platform.url}`} className="platform-link-wrap">
                            <a href={platform.url} target="_blank" rel="noreferrer" className="platform-link">
                              <span className="platform-link-name">{platform.displayName}</span>
                              {platform.region && <span className="platform-link-region">{platform.region}</span>}
                            </a>
                            {isAdmin && (
                              <button type="button" className="platform-admin-del-btn" onClick={() => handleDeleteLink(platform)} title={t('titleDetail.remove')}>
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {fallbackPlatforms.length > 0 && (
                    <div className="platform-group">
                      {officialPlatforms.length > 0 && (
                        <span className="platform-group-label">{t('titleDetail.searchLabel')}</span>
                      )}
                      <div className="platforms">
                        {fallbackPlatforms.map((platform) => (
                          <a key={`${platform.name}-${platform.url}`} href={platform.url} target="_blank" rel="noreferrer" className="platform-link platform-link-fallback">
                            <span className="platform-link-name">{platform.displayName}</span>
                            <span className="platform-link-tag">{t('titleDetail.searchLabel')}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="platforms-empty-state">
                  <span className="platforms-empty-icon"><LinkIcon size={14} /></span>
                  <span className="platforms-empty-text">{t('titleDetail.noPlatformLinks')}</span>
                </div>
              )}
            </div>
          {themeSongs.length > 0 && (() => {
              const SONGS_PER_PAGE = 5;
              const opSongs = themeSongs.filter((s) => s.theme_type === 'OP');
              const edSongs = themeSongs.filter((s) => s.theme_type === 'ED');
              const hasBoth = opSongs.length > 0 && edSongs.length > 0;
              const filteredSongs = hasBoth ? themeSongs.filter((s) => s.theme_type === activeSongTab) : themeSongs;
              const totalPages = Math.ceil(filteredSongs.length / SONGS_PER_PAGE);
              const pagedSongs = filteredSongs.slice(songPage * SONGS_PER_PAGE, (songPage + 1) * SONGS_PER_PAGE);

              return (
                <div className="aside-card theme-songs-aside-card">
                  <div className="theme-songs-header">
                    <span className="platform-label">
                      <Music size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                      {t('titleDetail.themeSongsHeading')}
                    </span>
                    <div className="song-header-right">
                      {hasBoth && (
                      <div className="song-type-tabs">
                        <button type="button" className={`song-type-tab${activeSongTab === 'OP' ? ' active' : ''}`} onClick={() => { setActiveSongTab('OP'); setSongPage(0); }}>
                          {t('titleDetail.opTab')}
                          <span className="song-tab-count">{opSongs.length}</span>
                        </button>
                        <button type="button" className={`song-type-tab${activeSongTab === 'ED' ? ' active' : ''}`} onClick={() => { setActiveSongTab('ED'); setSongPage(0); }}>
                          {t('titleDetail.edTab')}
                          <span className="song-tab-count">{edSongs.length}</span>
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                  <div className="song-list">
                    {pagedSongs.map((song) => (
                      <button
                        key={song.id}
                        type="button"
                        className="song-row"
                        onClick={() => song.video_url && setActiveSong(song)}
                        style={{ cursor: song.video_url ? 'pointer' : 'default' }}
                      >
                        <span className="song-type-badge">
                          {song.theme_type}{song.theme_sequence > 1 ? ` ${song.theme_sequence}` : ''}
                        </span>
                        <div className="song-info">
                          <span className="song-title">{song.song_title}</span>
                          {song.artist_name && <span className="song-artist">{song.artist_name}</span>}
                        </div>
                        {song.video_url
                          ? <Play size={14} className="song-play-icon" />
                          : <span className="song-no-video" />
                        }
                      </button>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="song-pager">
                      <button
                        type="button"
                        className="song-pager-btn"
                        onClick={() => setSongPage((p) => p - 1)}
                        disabled={songPage === 0}
                        aria-label="Previous"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="song-pager-label">{songPage + 1} / {totalPages}</span>
                      <button
                        type="button"
                        className="song-pager-btn"
                        onClick={() => setSongPage((p) => p + 1)}
                        disabled={songPage >= totalPages - 1}
                        aria-label="Next"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </aside>
        </div>

        {(title.characters?.length > 0 || title.staff?.length > 0) && (
          <section className="detail-cast-section">
            <div className="cast-section-title-row">
              <h3 className="cast-section-main-title">Cast & Staff</h3>
            </div>
            <div className="cast-header">
              <div className="cast-tabs" role="tablist">
                {title.characters?.length > 0 && (
                  <button
                    role="tab"
                    type="button"
                    className={`cast-tab${castTab === 'characters' ? ' cast-tab--active' : ''}`}
                    aria-selected={castTab === 'characters'}
                    onClick={() => setCastTab('characters')}
                  >
                    {t('titleDetail.characters')}
                    <span className="cast-tab-count">{title.characters.length}</span>
                  </button>
                )}
                {title.staff?.length > 0 && (
                  <button
                    role="tab"
                    type="button"
                    className={`cast-tab${castTab === 'staff' ? ' cast-tab--active' : ''}`}
                    aria-selected={castTab === 'staff'}
                    onClick={() => setCastTab('staff')}
                  >
                    {t('titleDetail.staff')}
                    <span className="cast-tab-count">{title.staff.length}</span>
                  </button>
                )}
                <button
                  role="tab"
                  type="button"
                  className={`cast-tab${castTab === 'stats' ? ' cast-tab--active' : ''}`}
                  aria-selected={castTab === 'stats'}
                  onClick={() => setCastTab('stats')}
                >
                  {t('titleDetail.statsTab')}
                </button>
              </div>

              {castTab !== 'stats' && (
                <div className="cast-nav">
                  <button
                    type="button"
                    className="cast-nav-btn"
                    onClick={() => scrollCastRail(-1)}
                    disabled={!canScrollCastPrev}
                    aria-label="Previous"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="cast-nav-btn"
                    onClick={() => scrollCastRail(1)}
                    disabled={!canScrollCastNext}
                    aria-label="Next"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {castTab === 'characters' && title.characters?.length > 0 && (
              <div className="cast-rail" role="tabpanel" ref={castRailRef}>
                {title.characters.map((char) => (
                  <div
                    key={char.anilist_id ?? char.name_full}
                    className={`cast-card${char.role === 'MAIN' ? ' cast-card--main' : ''}`}
                  >
                    <div className="cast-img-wrap">
                      {char.image_url
                        ? <img src={char.image_url} alt={char.name_full} className="cast-img" loading="lazy" />
                        : <div className="cast-img cast-img--placeholder" aria-hidden="true" />
                      }
                      {char.role === 'MAIN' && (
                        <span className="cast-role-badge">{t('titleDetail.roleMain')}</span>
                      )}
                    </div>
                    <div className="cast-body">
                      <span className="cast-name">{char.name_full}</span>
                      {char.name_native && <span className="cast-sub">{char.name_native}</span>}
                    </div>
                    {char.voice_actor_name && (
                      <div className="cast-va">
                        {char.voice_actor_image
                          ? <img src={char.voice_actor_image} alt={char.voice_actor_name} className="va-avatar" loading="lazy" />
                          : <div className="va-avatar va-avatar--placeholder" aria-hidden="true" />
                        }
                        <div className="va-info">
                          <span className="va-label">{t('titleDetail.voiceActor')}</span>
                          <span className="va-name">{char.voice_actor_name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {castTab === 'staff' && title.staff?.length > 0 && (
              <div className="cast-rail" role="tabpanel" ref={castRailRef}>
                {title.staff.map((person) => (
                  <div key={person.anilist_id ?? person.name_full} className="cast-card">
                    <div className="cast-img-wrap">
                      {person.image_url
                        ? <img src={person.image_url} alt={person.name_full} className="cast-img" loading="lazy" />
                        : <div className="cast-img cast-img--placeholder" aria-hidden="true" />
                      }
                    </div>
                    <div className="cast-body">
                      <span className="cast-name">{person.name_full}</span>
                      {person.role && <span className="cast-sub">{person.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {castTab === 'stats' && (() => {
              const STATUS_ROWS = [
                { key: 'planned',   labelKey: 'statusPlanned',   color: '#60a5fa' },
                { key: 'watching',  labelKey: 'statusCurrent',   color: '#34d399' },
                { key: 'reading',   labelKey: 'statusCurrent',   color: '#34d399' },
                { key: 'completed', labelKey: 'statusCompleted', color: '#a78bfa' },
                { key: 'paused',    labelKey: 'statusPaused',    color: '#fbbf24' },
                { key: 'dropped',   labelKey: 'statusDropped',   color: '#f87171' },
              ];
              const counts = titleStats || {};
              const totalUsers = Object.values(counts).reduce((s, n) => s + n, 0);
              const maxCount = Math.max(1, ...Object.values(counts));
              const topTags = [...(title.tagDetails || [])]
                .filter((tag) => tag.weight)
                .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                .slice(0, 8);
              const activeRows = STATUS_ROWS.filter((row) => counts[row.key] > 0);

              return (
                <div className="stats-panel" role="tabpanel">
                  {statsLoading ? (
                    <div className="stats-loading">{t('common.loading')}</div>
                  ) : (
                    <>
                      {/* Score & Popularity chips */}
                      {(title.score || title.popularity || title.favorites_count) && (
                        <div className="stats-scores">
                          {title.score && (
                            <div className="stats-score-chip">
                              <span className="stats-score-value">{title.score}</span>
                              <span className="stats-score-label">{t('titleDetail.metaScore')}</span>
                            </div>
                          )}
                          {title.popularity > 0 && (
                            <div className="stats-score-chip">
                              <span className="stats-score-value">
                                {title.popularity >= 1000 ? `${(title.popularity / 1000).toFixed(1)}K` : title.popularity}
                              </span>
                              <span className="stats-score-label">{t('titleDetail.metaPopularity')}</span>
                            </div>
                          )}
                          {title.favorites_count > 0 && (
                            <div className="stats-score-chip">
                              <span className="stats-score-value">{title.favorites_count.toLocaleString()}</span>
                              <span className="stats-score-label">{t('titleDetail.metaFavorites')}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Community status distribution */}
                      <div className="stats-block">
                        <div className="stats-block-header">
                          <span className="stats-block-title">{t('titleDetail.statusDistribution')}</span>
                          {totalUsers > 0 && (
                            <span className="stats-block-total">{totalUsers.toLocaleString()} {t('titleDetail.communityUsers')}</span>
                          )}
                        </div>
                        {totalUsers === 0 ? (
                          <p className="stats-empty">{t('titleDetail.statsNoData')}</p>
                        ) : (
                          <div className="stats-status-list">
                            {activeRows.map((row) => {
                              const count = counts[row.key] || 0;
                              const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                              const barPct = Math.round((count / maxCount) * 100);
                              return (
                                <div key={row.key} className="stats-status-row">
                                  <span className="stats-status-dot" style={{ background: row.color }} />
                                  <span className="stats-status-label">{t(`titleDetail.${row.labelKey}`)}</span>
                                  <div className="stats-bar-wrap">
                                    <div className="stats-bar" style={{ width: `${barPct}%`, background: row.color }} />
                                  </div>
                                  <span className="stats-status-count">{count.toLocaleString()}</span>
                                  <span className="stats-status-pct">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Top tags */}
                      {topTags.length > 0 && (
                        <div className="stats-block">
                          <span className="stats-block-title">{t('titleDetail.tagsHeading')}</span>
                          <div className="stats-tags">
                            {topTags.map((tag) => {
                              const maxWeight = topTags[0].weight ?? 1;
                              const opacity = 0.45 + 0.55 * ((tag.weight ?? 0) / maxWeight);
                              return (
                                <span key={tag.name} className="stats-tag" style={{ opacity }}>
                                  {tag.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {title?.id && (
          <TitleReviews titleId={title.id} />
        )}

        {similar.length > 0 && (
          <div className="similar-section-detail">
            <div className="similar-header">
              <h3 className="section-title">{t('titleDetail.similarTitles')}</h3>
              <div className="similar-nav">
                <button
                  type="button"
                  className="similar-nav-btn"
                  onClick={() => scrollSimilarByPage(-1)}
                  disabled={!canScrollSimilarPrev}
                  aria-label={t('titleDetail.previousSimilar')}
                  title={t('titleDetail.previousSimilar')}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="similar-nav-btn"
                  onClick={() => scrollSimilarByPage(1)}
                  disabled={!canScrollSimilarNext}
                  aria-label={t('titleDetail.nextSimilar')}
                  title={t('titleDetail.nextSimilar')}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="similar-rail" ref={similarRailRef}>
              {similar.map((entry) => (
                <div key={entry.id} className="similar-rail-item">
                  <TitleCard title={entry} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {activeSong && (
        <ThemeSongModal
          song={activeSong}
          onClose={() => setActiveSong(null)}
        />
      )}
      {trailerModalOpen && trailer && (
        <TrailerModal
          embedUrl={trailer.embedUrl || null}
          watchUrl={trailer.watchUrl || null}
          title={trailerTitle}
          onClose={() => setTrailerModalOpen(false)}
        />
      )}
    </div>
  );
}

export default TitleDetail;
