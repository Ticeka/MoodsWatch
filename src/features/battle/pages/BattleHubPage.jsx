import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import {
  Crown, 
  CheckCircle2,
  X,
  Globe, 
  Layers, 
  Play, 
  Plus, 
  Trophy, 
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Vote,
  BarChart3
} from 'lucide-react';

import {
  buildBattleDeck,
  createBattleSession,
  dedupeBattleSessionsByRecency,
  getBattlePresets,
  incrementStoredBattleDeckPlayCount,
  getStoredBattleDecks,
  getStoredBattleSessions,
  saveBattleSession,
} from '@/features/battle/lib/battleStore';
import {
  fetchPublicBattleDecks,
  fetchRemoteBattleSessions,
  incrementRemotePublicBattleDeckPlayCount,
  persistRemoteBattleSession,
} from '@/features/battle/api/battleRemoteApi';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import { fetchBattleTitlesPage } from '@/features/battle/api/battleCatalogApi';
import { BattleReadyDeckCard } from '@/features/battle/components/BattleReadyDeckCard';
import { BattleVsIcon } from '@/shared/components/icons/BattleVsIcon';
import {
  enrichPublicDeckOwners,
  renderBattleDeckOwnerSubtitle,
} from '@/features/battle/lib/battleOwnerPresentation';
import '../styles/Battle.css';

const RECENT_BATTLE_SESSION_LIMIT = 4;
const PUBLIC_DECK_PAGE_SIZE = 8; // keep community stages to a manageable multi-row page
const TODAY = new Date().toISOString().slice(0, 10);

function mergeRecentBattleSessions(localSessions = [], remoteSessions = []) {
  return dedupeBattleSessionsByRecency([...localSessions, ...remoteSessions])
    .slice(0, RECENT_BATTLE_SESSION_LIMIT);
}

function BattlePresetCardSkeleton() {
  return (
    <div className="battle-preset-card-skeleton" aria-hidden="true" style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
      <div className="battle-skeleton-block" style={{ height: '164px', borderRadius: '0', width: '100%' }} />
      <div className="battle-skeleton-body" style={{ padding: '1rem' }}>
        <div className="battle-skeleton-block" style={{ height: '1.3rem', width: '38%', borderRadius: '999px', marginBottom: '0.5rem' }} />
        <div className="battle-skeleton-block" style={{ height: '1.1rem', width: '82%', marginBottom: '0.5rem' }} />
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '92%' }} />
      </div>
    </div>
  );
}

export function BattleHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPresetsLoading, setIsPresetsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [savedDecks, setSavedDecks] = useState([]);
  const [publicDecks, setPublicDecks] = useState([]);
  const [presetDecks, setPresetDecks] = useState([]);
  
  const [publicDecksPage, setPublicDecksPage] = useState(0);
  const [hasNextPublicPage, setHasNextPublicPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState('');
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [isDailyChallengeLoading, setIsDailyChallengeLoading] = useState(false);
  const [dailyChallengeCompleted, setDailyChallengeCompleted] = useState(false);
  const [leaderboardPreview, setLeaderboardPreview] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const officialCarouselRef = useRef(null);
  const [canScrollOfficialPrev, setCanScrollOfficialPrev] = useState(false);
  const [canScrollOfficialNext, setCanScrollOfficialNext] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadHub() {
      setIsLoading(true);
      setIsPresetsLoading(true);
      setError('');
      try {
        const [remoteSessions, remotePublicDecks] = await Promise.all([
          user?.id ? fetchRemoteBattleSessions(user.id).catch(() => []) : Promise.resolve([]),
          fetchPublicBattleDecks({ limit: PUBLIC_DECK_PAGE_SIZE + 1, offset: 0 }).catch(() => []),
        ]);
        if (!cancelled) {
          const localSessions = getStoredBattleSessions();
          const mergedSessions = mergeRecentBattleSessions(localSessions, remoteSessions);
          mergedSessions.forEach((session) => saveBattleSession(session));
          setSavedDecks(getStoredBattleDecks());
          
          const hasNext = remotePublicDecks.length > PUBLIC_DECK_PAGE_SIZE;
          const initialDecks = hasNext ? remotePublicDecks.slice(0, PUBLIC_DECK_PAGE_SIZE) : remotePublicDecks;
          setPublicDecks(await enrichPublicDeckOwners(initialDecks));
          setHasNextPublicPage(hasNext);
          setPublicDecksPage(0);
          setIsLoading(false);
        }

        if (cancelled) return;

        const nextPresetEntries = await Promise.all(
          getBattlePresets().map(async (preset) => {
            const filters = preset.filters || {};
            const result = await fetchBattleTitlesPage({
              type: filters.type || 'all',
              tag: filters.tag || '',
              mood: filters.mood || '',
              query: filters.query || '',
              trailerState: filters.trailerState || 'all',
              trailerProvider: filters.trailerProvider || 'all',
              showAdult,
              hiddenTitleIds,
              page: 0,
              pageSize: Math.max(8, Number(filters.size || 32)),
            });
            if (cancelled) return null;
            const deck = buildBattleDeck(result.rows || [], { ...filters, label: preset.label }, {
              hiddenTitleIds,
              excludeAdult: !showAdult,
              onlyAdult: showAdult,
            });

            return {
              preset,
              deck: {
                ...deck,
                sourceCount: Number(result.total || deck.sourceCount || 0),
              },
            };
          })
        );

        if (!cancelled) {
          const presetTitleMap = new Map();
          nextPresetEntries.forEach(({ deck }) => {
            (deck?.titles || []).forEach((title) => {
              if (title?.id != null) presetTitleMap.set(Number(title.id), title);
            });
          });
          setPresetDecks(nextPresetEntries);
          setTitles([...presetTitleMap.values()]);
          setIsPresetsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t('battle.loadCatalogFailed'));
          setSavedDecks(getStoredBattleDecks());
          setPublicDecks([]);
          setHasNextPublicPage(false);
          setIsLoading(false);
          setIsPresetsLoading(false);
        }
      }
    }

    loadHub();
    return () => { cancelled = true; };
  }, [hiddenTitleIds, showAdult, t, user?.id]);

  useEffect(() => {
    if (!activeOverlay) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activeOverlay]);

  const loadDailyChallengePreview = async (signal) => {
    if (!supabase) {
      setDailyChallenge(null);
      return;
    }

    setIsDailyChallengeLoading(true);
    try {
      const [challengeResult, completionResult] = await Promise.all([
        supabase
          .from('daily_challenges')
          .select('id, challenge_date, theme_name_th, theme_name_en, theme_icon, deck_id')
          .eq('challenge_date', TODAY)
          .maybeSingle(),
        user?.id
          ? supabase
              .from('daily_challenge_completions')
              .select('id')
              .eq('user_id', user.id)
              .eq('challenge_date', TODAY)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (signal?.aborted) return;

      if (challengeResult.error) throw challengeResult.error;

      setDailyChallenge(challengeResult.data || null);
      setDailyChallengeCompleted(Boolean(completionResult.data));
    } catch (fetchError) {
      if (signal?.aborted) return;
      console.warn('Failed to load daily challenge preview', fetchError);
      setDailyChallenge(null);
      setDailyChallengeCompleted(false);
    } finally {
      if (!signal?.aborted) setIsDailyChallengeLoading(false);
    }
  };

  const loadLeaderboardPreview = async (signal) => {
    if (!supabase) {
      setLeaderboardPreview([]);
      return;
    }

    setIsLeaderboardLoading(true);
    try {
      const { data, error: leaderboardError } = await supabase
        .from('battle_title_stats')
        .select(`
          title_id,
          wins,
          losses,
          total_votes,
          win_rate,
          elo_score,
          canonical_titles!inner(
            id, canonical_title, slug, cover_image, type, is_adult
          )
        `)
        .gte('total_votes', 3)
        .eq('canonical_titles.is_adult', showAdult)
        .order('elo_score', { ascending: false })
        .range(0, 4);

      if (signal?.aborted) return;
      if (leaderboardError) throw leaderboardError;

      const normalized = (data || [])
        .map((row) => ({
          titleId: row.title_id,
          wins: row.wins,
          totalVotes: row.total_votes,
          winRate: row.win_rate,
          elo: Math.round(row.elo_score),
          title: row.canonical_titles,
        }))
        .filter((entry) => entry?.title?.id);

      setLeaderboardPreview(normalized);
    } catch (fetchError) {
      if (signal?.aborted) return;
      console.warn('Failed to load leaderboard preview', fetchError);
      setLeaderboardPreview([]);
    } finally {
      if (!signal?.aborted) setIsLeaderboardLoading(false);
    }
  };

  const openOverlay = async (type) => {
    setActiveOverlay(type);
    const controller = new AbortController();
    if (type === 'daily') {
      await loadDailyChallengePreview(controller.signal);
    }
    if (type === 'leaderboard') {
      await loadLeaderboardPreview(controller.signal);
    }
  };

  const handleDailyPlay = () => {
    if (dailyChallenge?.deck_id) {
      navigate(`/battle/session?deck=${dailyChallenge.deck_id}&daily=${TODAY}`);
      return;
    }
    navigate('/battle');
  };

  const handlePublicDecksPage = async (newPage) => {
    if (isLoadingMore || newPage < 0) return;
    setIsLoadingMore(true);
    try {
      const fetched = await fetchPublicBattleDecks({
        limit: PUBLIC_DECK_PAGE_SIZE + 1,
        offset: newPage * PUBLIC_DECK_PAGE_SIZE,
      });
      const hasNext = fetched.length > PUBLIC_DECK_PAGE_SIZE;
      const newPageDecks = hasNext ? fetched.slice(0, PUBLIC_DECK_PAGE_SIZE) : fetched;
      setPublicDecks(await enrichPublicDeckOwners(newPageDecks));
      setHasNextPublicPage(hasNext);
      setPublicDecksPage(newPage);
    } catch {
      // Keep current page on error
    } finally {
      setIsLoadingMore(false);
    }
  };

  const titleLookup = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );
  
  const hiddenExcludedCount = 0;
  const isComputingPresets = false;
  
  const readyPresetDecks = useMemo(
    () => presetDecks.filter(({ deck }) => (deck?.titles?.length || 0) >= 8),
    [presetDecks]
  );
  const readySavedDecks = useMemo(
    () => savedDecks.filter((deck) => (deck?.titles?.length || 0) >= 8),
    [savedDecks]
  );
  const publicSavedDecks = useMemo(() => {
    const readyLocalDeckMap = new Map(
      readySavedDecks.filter((deck) => deck.isPublic).map((deck) => [deck.id, deck])
    );

    const mergedDecks = [...publicDecks];
    readyLocalDeckMap.forEach((deck, deckId) => {
      if (!mergedDecks.some((entry) => entry.id === deckId)) {
        mergedDecks.unshift(deck);
      }
    });

    const visibleDecks = filterDecksForAgeGate(mergedDecks, showAdult, titleLookup);
    return visibleDecks.filter((deck) => (deck?.titles?.length || deck?.titleIds?.length || 0) >= 8);
  }, [publicDecks, readySavedDecks, showAdult, titleLookup]);

  useEffect(() => {
    const node = officialCarouselRef.current;
    if (!node) {
      setCanScrollOfficialPrev(false);
      setCanScrollOfficialNext(false);
      return undefined;
    }

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      setCanScrollOfficialPrev(node.scrollLeft > 8);
      setCanScrollOfficialNext(node.scrollLeft < maxScrollLeft - 8);
    };

    updateScrollState();
    node.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      node.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [readyPresetDecks.length, isPresetsLoading, isComputingPresets]);

  const startBattle = async (deck) => {
    if ((deck?.titles?.length || 0) < 8) {
      toast.error(t('battle.needAtLeastEight'));
      return;
    }

    if (deck?.id) {
      incrementStoredBattleDeckPlayCount(deck.id);
      if (deck.isPublic) {
        incrementRemotePublicBattleDeckPlayCount(deck.id);
      }
    }

    let session = saveBattleSession(createBattleSession(deck, {
      catalogCount: Number(deck?.sourceCount || deck?.titles?.length || 0),
      hiddenExcludedCount,
      excludesAdultContent: !showAdult,
    }));
    if (user?.id) {
      try {
        session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
      } catch (saveError) {
        console.warn('Failed to persist battle session remotely', saveError);
        toast.error(t('battle.savedLocalCloudFailed'));
      }
    }
    navigate(`/battle/${session.id}`);
  };

  const handleOfficialCarouselStep = (direction) => {
    const node = officialCarouselRef.current;
    if (!node) return;
    const step = Math.max(node.clientWidth * 0.8, 280);
    node.scrollBy({
      left: direction * step,
      behavior: 'smooth',
    });
  };

  const showPublicDeckPagination = (publicDecksPage > 0 || hasNextPublicPage) && !isLoading;

  const displayDailyDate = new Date(`${TODAY}T00:00:00`).toLocaleDateString(
    language === 'th' ? 'th-TH' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' }
  );

  return (
    <div className="battle-page battle-hub-page">
      <div className="battle-hub-shell">
        
        {/* ── Vibrant Hero ── */}
        <header className="battle-hub-hero">
          <div className="container battle-hub-hero-container">
            <div className="battle-hero-badge animate-fade-in-up">
              <span className="battle-hero-badge-icon"><BattleVsIcon size={15} /></span>
              {t('battle.hubFormats')}
            </div>
            <h1 className="battle-hub-title animate-fade-in-up">{t('battle.hubDisplayTitle')}</h1>
            <p className="battle-hub-tagline animate-fade-in-up" style={{ animationDelay: '0.1s' }}>{t('battle.hubTagline')}</p>
            <div className="battle-hub-hero-actions">
              <Link className="battle-btn-primary action-pulse" to="/battle/build">
                <Plus size={18} />
                {t('battle.buildDeck')}
              </Link>
              <Link className="battle-btn-secondary highlight" to="/battle/browse">
                <Globe size={18} />
                {t('battle.browseMoreStages')}
              </Link>
              <Link className="battle-btn-secondary" to="/battle/decks">
                <Layers size={18} />
                {t('battle.manageDecks')}
              </Link>
            </div>
            
            {/* 3-Step Guide (Less Text, Visual) */}
            <div className="battle-steps-guide animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="battle-step-item">
                <div className="battle-step-icon"><Layers size={20}/></div>
                <span>{t('battle.stepChooseCategory')}</span>
              </div>
              <ChevronRight size={16} className="battle-step-divider"/>
              <div className="battle-step-item">
                <div className="battle-step-icon"><Vote size={20}/></div>
                <span>{t('battle.stepVoteWinner')}</span>
              </div>
              <ChevronRight size={16} className="battle-step-divider"/>
              <div className="battle-step-item">
                <div className="battle-step-icon"><BarChart3 size={20}/></div>
                <span>{t('battle.stepViewResults')}</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Medal Shortcuts ── */}
        <section className="container battle-medals-section">
          <button type="button" className="battle-medal-card battle-medal-daily" onClick={() => openOverlay('daily')}>
            <div className="battle-medal-shine"></div>
            <div className="battle-medal-content">
              <div className="battle-medal-icon-wrap">
                <Crown size={32} strokeWidth={2.5} />
              </div>
              <div className="battle-medal-info">
                <span className="battle-medal-tag">{t('battle.dailyMedalTag')}</span>
                <strong className="battle-medal-title">{t('dailyChallenge.todayTheme')}</strong>
                <span className="battle-medal-desc">{t('battle.dailyMedalDesc')}</span>
              </div>
            </div>
            <div className="battle-medal-countdown">
              <CalendarDays size={14} /> {t('battle.dailyMedalPill')}
            </div>
          </button>

          <button type="button" className="battle-medal-card battle-medal-leaderboard" onClick={() => openOverlay('leaderboard')}>
            <div className="battle-medal-shine"></div>
            <div className="battle-medal-content">
              <div className="battle-medal-icon-wrap">
                <Trophy size={32} strokeWidth={2.5} />
              </div>
              <div className="battle-medal-info">
                <span className="battle-medal-tag">{t('battle.leaderboardMedalTag')}</span>
                <strong className="battle-medal-title">{t('leaderboard.title')}</strong>
                <span className="battle-medal-desc">{t('battle.leaderboardMedalDesc')}</span>
              </div>
            </div>
          </button>
        </section>

        {/* ── Minigame Deck Selection (Game Modes Grid) ── */}
        <div className="container battle-hub-section">
          <div className="battle-hub-section-header">
            <h2 className="battle-hub-section-title"><Play size={18} fill="currentColor" /> {t('battle.featuredStages')}</h2>
            {!isPresetsLoading && !isComputingPresets && readyPresetDecks.length > 1 ? (
              <div className="battle-hub-pagination pagination-gamey">
                <button
                  type="button"
                  className="game-page-btn"
                  onClick={() => handleOfficialCarouselStep(-1)}
                  disabled={!canScrollOfficialPrev}
                  aria-label={t('common.previous')}
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                <button
                  type="button"
                  className="game-page-btn"
                  onClick={() => handleOfficialCarouselStep(1)}
                  disabled={!canScrollOfficialNext}
                  aria-label={t('common.next')}
                >
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>
            ) : null}
          </div>
          {isPresetsLoading || isComputingPresets ? (
            <div className="battle-carousel-container battle-carousel-container-official">
              <div
                ref={officialCarouselRef}
                className="battle-preset-carousel battle-preset-carousel-official"
              >
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="carousel-item">
                    <BattlePresetCardSkeleton />
                  </div>
                ))}
              </div>
            </div>
          ) : readyPresetDecks.length === 0 ? (
            <p className="battle-hub-empty">{t('battle.noPresetReady')}</p>
          ) : (
            <div className="battle-carousel-container battle-carousel-container-official">
              <div
                ref={officialCarouselRef}
                className="battle-preset-carousel battle-preset-carousel-official"
              >
                {readyPresetDecks.map(({ preset, deck }) => (
                  <div className="carousel-item" key={preset.id}>
                    <BattleReadyDeckCard
                      title={preset.label}
                      subtitle={(preset.filters.type || 'all').toUpperCase()}
                      badge={t('battle.officialStage')}
                      badgeClassName="game-badge official"
                      deck={deck}
                      variant="preset"
                      disabled={isPresetsLoading}
                      onStart={() => startBattle(deck)}
                      actionLabel={t('battle.startGame')}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Public Decks (Large List) ── */}
        <div className="container battle-hub-section">
          <div className="battle-hub-section-header">
            <h2 className="battle-hub-section-title"><Globe size={18} /> {t('battle.communityStages')}</h2>
            <div className="battle-hub-section-actions">
              <Link className="btn btn-secondary btn-sm" to="/battle/browse">
                <Globe size={14} /> {t('battle.browseMoreStages')}
              </Link>
              {showPublicDeckPagination && (
                <div className="battle-hub-pagination pagination-gamey">
                  <button
                    type="button"
                    className="game-page-btn"
                    onClick={() => handlePublicDecksPage(publicDecksPage - 1)}
                    disabled={publicDecksPage === 0 || isLoadingMore}
                    aria-label="หน้าก่อนหน้า"
                  >
                    <ChevronLeft size={20} strokeWidth={3} />
                  </button>
                  <span className="game-page-indicator">{t('common.page')} {publicDecksPage + 1}</span>
                  <button
                    type="button"
                    className="game-page-btn"
                    onClick={() => handlePublicDecksPage(publicDecksPage + 1)}
                    disabled={!hasNextPublicPage || isLoadingMore}
                    aria-label="หน้าถัดไป"
                  >
                    <ChevronRight size={20} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {isLoading ? (
            <div className="battle-deck-list-grid">
              {[0, 1, 2, 3].map((i) => <BattlePresetCardSkeleton key={i} />)}
            </div>
          ) : publicSavedDecks.length === 0 ? (
            <p className="battle-hub-empty">
              {t('battle.noPublicDeck')} <Link to="/battle/decks" className="battle-hub-empty-link">{t('battle.manageDecks')}</Link>
            </p>
          ) : (
            <>
              <div className={`battle-deck-list-grid ${isLoadingMore ? 'is-loading' : ''}`}>
                {publicSavedDecks.map((deck) => (
                  <BattleReadyDeckCard
                    key={deck.id}
                    title={deck.label}
                    subtitle={renderBattleDeckOwnerSubtitle(deck, t)}
                    badge={t('battle.customStage')}
                    badgeClassName="game-badge community"
                    deck={deck}
                    variant="preset"
                    disabled={isLoading || Boolean(error)}
                    onStart={() => startBattle(deck)}
                    actionLabel={t('battle.startGame')}
                  />
                ))}
              </div>
              {showPublicDeckPagination ? (
                <div className="battle-pagination-footer">
                  <div className="battle-hub-pagination pagination-gamey">
                    <button
                      type="button"
                      className="game-page-btn"
                      onClick={() => handlePublicDecksPage(publicDecksPage - 1)}
                      disabled={publicDecksPage === 0 || isLoadingMore}
                      aria-label="หน้าก่อนหน้า"
                    >
                      <ChevronLeft size={20} strokeWidth={3} />
                    </button>
                    <span className="game-page-indicator">{t('common.page')} {publicDecksPage + 1}</span>
                    <button
                      type="button"
                      className="game-page-btn"
                      onClick={() => handlePublicDecksPage(publicDecksPage + 1)}
                      disabled={!hasNextPublicPage || isLoadingMore}
                      aria-label="หน้าถัดไป"
                    >
                      <ChevronRight size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {activeOverlay ? (
        <div className="battle-overlay-backdrop" onClick={() => setActiveOverlay('')}>
          <div
            className="battle-overlay-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="battle-overlay-header">
              <div>
                <span className="battle-overlay-kicker">
                  {activeOverlay === 'daily' ? t('dailyChallenge.todayTheme') : t('leaderboard.title')}
                </span>
                <h2 className="battle-overlay-title">
                  {activeOverlay === 'daily' ? t('battle.overlayDailyTitle') : t('battle.overlayRankTitle')}
                </h2>
              </div>
              <button
                type="button"
                className="battle-overlay-close"
                onClick={() => setActiveOverlay('')}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>

            {activeOverlay === 'daily' ? (
              <div className="battle-overlay-body">
                {isDailyChallengeLoading ? (
                  <div className="battle-overlay-empty">{t('common.loading')}</div>
                ) : !dailyChallenge ? (
                  <div className="battle-overlay-empty">{t('dailyChallenge.noChallengeHint')}</div>
                ) : (
                  <div className="battle-overlay-panel battle-overlay-panel-daily">
                    <div className="battle-overlay-badge-row">
                      <span className="battle-overlay-date-pill">
                        <CalendarDays size={14} /> {displayDailyDate}
                      </span>
                      {dailyChallengeCompleted ? (
                        <span className="battle-overlay-complete-pill">
                          <CheckCircle2 size={14} /> {t('dailyChallenge.completedTitle')}
                        </span>
                      ) : null}
                    </div>
                    <div className="battle-overlay-theme-lockup">
                      <span className="battle-overlay-theme-icon">{dailyChallenge.theme_icon || '🏅'}</span>
                      <div>
                        <span className="battle-overlay-theme-label">{t('dailyChallenge.todayTheme')}</span>
                        <strong className="battle-overlay-theme-name">
                          {language === 'th' ? dailyChallenge.theme_name_th : dailyChallenge.theme_name_en}
                        </strong>
                      </div>
                    </div>
                    <p className="battle-overlay-copy">
                      {dailyChallengeCompleted ? t('dailyChallenge.completedHint') : t('battle.overlayDailyHint')}
                    </p>
                    <div className="battle-overlay-actions">
                      <button
                        type="button"
                        className="battle-overlay-primary"
                        onClick={handleDailyPlay}
                        disabled={!user}
                      >
                        <BattleVsIcon size={18} />
                        {user ? t('dailyChallenge.playNow') : t('dailyChallenge.loginToPlay')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="battle-overlay-body">
                {isLeaderboardLoading ? (
                  <div className="battle-overlay-empty">{t('common.loading')}</div>
                ) : leaderboardPreview.length === 0 ? (
                  <div className="battle-overlay-empty">{t('leaderboard.noData')}</div>
                ) : (
                  <div className="battle-overlay-panel battle-overlay-panel-rank">
                    <div className="battle-overlay-ranking-list">
                      {leaderboardPreview.map((entry, index) => (
                        <div key={entry.titleId} className="battle-overlay-ranking-row">
                          <span className="battle-overlay-ranking-index">{index + 1}</span>
                          <div className="battle-overlay-ranking-title">
                            {entry.title?.cover_image ? (
                              <img src={entry.title.cover_image} alt="" loading="lazy" />
                            ) : (
                              <div className="battle-overlay-ranking-cover-fallback" aria-hidden="true" />
                            )}
                            <div>
                              <strong>{entry.title?.canonical_title || t('battle.untitledFallback')}</strong>
                              <span>{t('battle.winsShort', { count: entry.wins })} · {Math.round((entry.winRate || 0) * 100)}%</span>
                            </div>
                          </div>
                          <span className="battle-overlay-ranking-elo">
                            <TrendingUp size={14} /> {entry.elo}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="battle-overlay-actions">
                      <Link to="/battle/leaderboard" className="battle-overlay-secondary" onClick={() => setActiveOverlay('')}>
                        <Trophy size={16} />
                        {t('battle.viewLeaderboard')}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BattleHub;
