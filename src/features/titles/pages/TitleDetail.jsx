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
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { LIST_STATUS_OPTIONS, getLocalizedLabel } from '@/shared/data/moods';
import { supabase } from '@/shared/lib/supabase';
import { getTitleTypeMeta, isEpisodeBasedType } from '@/shared/lib/titleType';
import { ChevronLeft, ChevronRight, Flag, Link as LinkIcon, Plus, Trash2, Trophy } from 'lucide-react';
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
  const { user } = useAuth();
  const { watchlist, addToList, removeFromList, updateItem, getStatus, advanceProgress, setConsumptionTarget } = useWatchlist();
  const { hiddenFromRecommendationIds } = useHiddenTitles();
  const { prefs } = useProfilePreferences();
  const { isInTopTitles, addToTopTitles, removeFromTopTitles, getRank, limit } = useTopTitles();

  const [title, setTitle] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportForm, setReportForm] = useState({ issueType: 'metadata', description: '' });
  const [canScrollSimilarPrev, setCanScrollSimilarPrev] = useState(false);
  const [canScrollSimilarNext, setCanScrollSimilarNext] = useState(false);
  const [showAddLinkForm, setShowAddLinkForm] = useState(false);
  const [addLinkForm, setAddLinkForm] = useState({ platform_name: '', url: '', region_code: '' });
  const [isSavingLink, setIsSavingLink] = useState(false);
  const similarRailRef = useRef(null);

  const status = title ? getStatus(title.id) : null;
  const watchlistItem = title ? watchlist.find((item) => item.titleId === title.id) : null;
  const typeMeta = title ? getTitleTypeMeta(title.type, language) : null;
  const isAdmin = user?.profile?.role === 'admin' || user?.profile?.role === 'editor';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      try {
        const nextTitle = await getTitleBySlug(slug);
        if (!cancelled) {
          setTitle(nextTitle);
        }
      } catch (error) {
        console.error('Failed to load title:', error);
        if (!cancelled) {
          setTitle(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [slug]);

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
  }, [title?.id, watchlist, prefs, hiddenFromRecommendationIds]);

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
        <span className="not-found-icon">{t('titleDetail.titleNotFoundLabel')}</span>
        <h2>{t('titleDetail.titleNotFound')}</h2>
        <p>{t('titleDetail.titleNotFoundHint')}</p>
        <Button onClick={() => navigate('/')}>{t('titleDetail.backHome')}</Button>
      </div>
    );
  }

  const rawSynopsis = (title.synopsis || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const shouldTruncate = rawSynopsis.length > 300;
  const displaySynopsis = shouldTruncate && !showFullSynopsis ? `${rawSynopsis.slice(0, 300)}...` : rawSynopsis;
  const primaryTitle = title.title_th || title.title_en;
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

  const statusOption = status ? LIST_STATUS_OPTIONS.find((option) => option.id === status) : null;
  const progressEpisode = watchlistItem?.progressEpisode ?? '';
  const progressChapter = watchlistItem?.progressChapter ?? '';
  const targetEpisode = watchlistItem?.targetEpisode ?? '';
  const targetChapter = watchlistItem?.targetChapter ?? '';
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
                aria-label={showReportForm ? t('titleDetail.closeReportForm') : t('titleDetail.openReportForm')}
                title={showReportForm ? t('titleDetail.closeReportForm') : t('titleDetail.reportIssue')}
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
                      <button className="remove-btn" onClick={() => removeFromList(title.id)} type="button">
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

              <div className={`platforms-card${orderedPlatforms.length === 0 ? ' platforms-card--empty' : ''}`}>
                <div className="platforms-card-head">
                  <div>
                    <span className="platform-label">{t('titleDetail.availableOn')}</span>
                    {orderedPlatforms.length > 0 && (
                      <div className="platform-caption">{t('titleDetail.linksAvailable', { count: orderedPlatforms.length })}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {orderedPlatforms.length > 0 && <span className="platform-count-pill">{orderedPlatforms.length}</span>}
                    {isAdmin && (
                      <button
                        type="button"
                        className="platform-admin-add-btn"
                        onClick={() => setShowAddLinkForm((current) => !current)}
                        title={t('titleDetail.addPlatformLink')}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
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
                        <span className="platform-group-label">{t('titleDetail.officialLabel')}</span>
                        <div className="platforms">
                          {officialPlatforms.map((platform) => (
                            <div key={`${platform.name}-${platform.url}`} className="platform-link-wrap">
                              <a href={platform.url} target="_blank" rel="noreferrer" className="platform-link">
                                <span className="platform-link-name">{platform.displayName}</span>
                                {platform.region && <span className="platform-link-region">{platform.region}</span>}
                              </a>
                              {isAdmin && (
                                <button type="button" className="platform-admin-del-btn" onClick={() => handleDeleteLink(platform)} title={t('titleDetail.remove')}>
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {fallbackPlatforms.length > 0 && (
                      <div className="platform-group">
                        <span className="platform-group-label">{t('titleDetail.searchLabel')}</span>
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
                    <span className="platforms-empty-icon"><LinkIcon size={15} /></span>
                    <span className="platforms-empty-text">{t('titleDetail.noPlatformLinks')}</span>
                  </div>
                )}
              </div>

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

        {rawSynopsis && (
          <section className="detail-synopsis-panel">
            <div className="synopsis-wrapper">
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
            </div>
          </section>
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
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="similar-nav-btn"
                  onClick={() => scrollSimilarByPage(1)}
                  disabled={!canScrollSimilarNext}
                  aria-label={t('titleDetail.nextSimilar')}
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
    </div>
  );
}

export default TitleDetail;
