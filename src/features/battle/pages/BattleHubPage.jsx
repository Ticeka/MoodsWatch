import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
  Swords, 
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
  getStoredBattleDecks,
  getStoredBattleSessions,
  saveBattleSession,
} from '@/features/battle/lib/battleStore';
import {
  fetchPublicBattleDecks,
  fetchRemoteBattleSessions,
  persistRemoteBattleSession,
} from '@/features/battle/lib/battleRemote';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  getCatalogEntities,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import { getAllTitles } from '@/features/discover/lib/recommend';
import { BattleReadyDeckCard } from '@/features/battle/components/BattleReadyDeckCard';
import './Battle.css';

const RECENT_BATTLE_SESSION_LIMIT = 4;
const PUBLIC_DECK_PAGE_SIZE = 8; // keep community stages to a manageable multi-row page
const TODAY = new Date().toISOString().slice(0, 10);

function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
}

function mergeRecentBattleSessions(localSessions = [], remoteSessions = []) {
  return dedupeBattleSessionsByRecency([...localSessions, ...remoteSessions])
    .slice(0, RECENT_BATTLE_SESSION_LIMIT);
}

async function enrichPublicDeckOwners(decks = []) {
  if (!decks.length) return decks;

  const ownerIds = [...new Set(decks.map((deck) => String(deck?.ownerUserId || '').trim()).filter(Boolean))];
  if (!ownerIds.length) return decks;

  try {
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('id, username, name, avatar_url')
      .in('id', ownerIds);

    if (error) throw error;

    if (profiles?.length) {
      const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));
      return decks.map((deck) => {
        const profile = profileMap.get(String(deck?.ownerUserId || ''));
        if (!profile) {
          return deck;
        }

        return {
          ...deck,
          ownerAvatarUrl: profile.avatar_url || deck.ownerAvatarUrl || '',
          ownerUsername: profile.username || deck.ownerUsername || '',
          ownerDisplayName: profile.name || deck.ownerDisplayName || profile.username || '',
        };
      });
    }
  } catch (err) {
    console.error('Failed to fetch public deck owners', err);
  }
  return decks;
}

function getOwnerLabel(deck) {
  return deck?.ownerDisplayName || deck?.ownerUsername || '';
}

function getOwnerInitial(label) {
  return String(label || '?').trim().charAt(0).toUpperCase() || '?';
}

function renderOwnerSubtitle(deck, t) {
  const ownerLabel = getOwnerLabel(deck);
  const ownerProfilePath = buildOwnerProfilePath(deck?.ownerUsername);

  if (!ownerLabel) {
    return t('battle.communityUserFallback');
  }

  if (!ownerProfilePath) {
    return t('battle.publicDeckBy', { owner: ownerLabel });
  }

  return (
    <Link
      to={ownerProfilePath}
      className="game-owner-link"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={t('battle.publicDeckBy', { owner: ownerLabel })}
    >
      <span className="game-owner-avatar">
        {deck.ownerAvatarUrl ? (
          <img src={deck.ownerAvatarUrl} alt="" loading="lazy" />
        ) : (
          <span>{getOwnerInitial(ownerLabel)}</span>
        )}
      </span>
      {ownerLabel}
    </Link>
  );
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
  
  const [recentSessions, setRecentSessions] = useState([]);
  const [savedDecks, setSavedDecks] = useState([]);
  const [publicDecks, setPublicDecks] = useState([]);
  
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
          setRecentSessions(getStoredBattleSessions());
          setSavedDecks(getStoredBattleDecks());
          
          const hasNext = remotePublicDecks.length > PUBLIC_DECK_PAGE_SIZE;
          const initialDecks = hasNext ? remotePublicDecks.slice(0, PUBLIC_DECK_PAGE_SIZE) : remotePublicDecks;
          setPublicDecks(await enrichPublicDeckOwners(initialDecks));
          setHasNextPublicPage(hasNext);
          setPublicDecksPage(0);
          setIsLoading(false);
        }

        const allTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
        if (!cancelled) {
          setTitles(allTitles);
          setIsPresetsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t('battle.loadCatalogFailed'));
          setRecentSessions(getStoredBattleSessions());
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
  }, [t, user?.id]);

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

  const loadDailyChallengePreview = async () => {
    if (!supabase) {
      setDailyChallenge(null);
      return;
    }

    setIsDailyChallengeLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('daily_challenges')
        .select('id, challenge_date, theme_name_th, theme_name_en, theme_icon, deck_id')
        .eq('challenge_date', TODAY)
        .maybeSingle();

      if (challengeError) {
        throw challengeError;
      }

      setDailyChallenge(challengeData || null);

      if (user?.id && challengeData) {
        const { data: completion } = await supabase
          .from('daily_challenge_completions')
          .select('id')
          .eq('user_id', user.id)
          .eq('challenge_date', TODAY)
          .maybeSingle();
        setDailyChallengeCompleted(Boolean(completion));
      } else {
        setDailyChallengeCompleted(false);
      }
    } catch (fetchError) {
      console.warn('Failed to load daily challenge preview', fetchError);
      setDailyChallenge(null);
      setDailyChallengeCompleted(false);
    } finally {
      setIsDailyChallengeLoading(false);
    }
  };

  const loadLeaderboardPreview = async () => {
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

      if (leaderboardError) {
        throw leaderboardError;
      }

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
      console.warn('Failed to load leaderboard preview', fetchError);
      setLeaderboardPreview([]);
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const openOverlay = async (type) => {
    setActiveOverlay(type);
    if (type === 'daily') {
      await loadDailyChallengePreview();
    }
    if (type === 'leaderboard') {
      await loadLeaderboardPreview();
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

  const deckOptions = useMemo(() => ({
    hiddenTitleIds,
    excludeAdult: !showAdult,
    onlyAdult: showAdult,
  }), [hiddenTitleIds, showAdult]);

  const visibleCatalogTitles = useMemo(
    () => titles.filter((title) => !hiddenTitleIds.includes(title.id) && (showAdult ? title.is_adult : !title.is_adult)),
    [hiddenTitleIds, showAdult, titles]
  );
  const visibleCharacterCatalog = useMemo(
    () => getCatalogEntities(visibleCatalogTitles, CHARACTER_ENTITY_TYPE),
    [visibleCatalogTitles]
  );
  const titleLookup = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );
  
  const hiddenExcludedCount = Math.max(0, titles.length - visibleCatalogTitles.length);
  const deferredCatalogTitlesForPresets = useDeferredValue(visibleCatalogTitles);
  const isComputingPresets = deferredCatalogTitlesForPresets !== visibleCatalogTitles;
  
  const presets = useMemo(() => getBattlePresets(), []);
  const presetDecks = useMemo(
    () => presets.map((preset) => ({
      preset,
      deck: buildBattleDeck(deferredCatalogTitlesForPresets, { ...preset.filters, label: preset.label }, deckOptions),
    })),
    [deckOptions, deferredCatalogTitlesForPresets, presets]
  );

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

    let session = saveBattleSession(createBattleSession(deck, {
      catalogCount: normalizeCatalogEntityType(deck?.filters?.entityType) === CHARACTER_ENTITY_TYPE
        ? visibleCharacterCatalog.length
        : normalizeCatalogEntityType(deck?.filters?.entityType) === THEME_SONG_ENTITY_TYPE
          ? Number(deck?.sourceCount || deck?.titles?.length || 0)
          : normalizeCatalogEntityType(deck?.filters?.entityType) === TRAILER_ENTITY_TYPE
            ? Number(deck?.sourceCount || deck?.titles?.length || 0)
            : visibleCatalogTitles.length,
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
            <h1 className="battle-hub-title"><Swords size={32} /> SOLO BATTLE</h1>
            <p className="battle-hub-tagline">{t('battle.hubTagline')}</p>
            <div className="battle-hub-hero-actions">
              <Link className="battle-btn-primary action-pulse" to="/battle/build">
                <Plus size={18} />
                {t('battle.buildDeck')}
              </Link>
              <Link className="battle-btn-secondary" to="/battle/decks">
                <Layers size={18} />
                {t('battle.manageDecks')}
              </Link>
            </div>
            
            {/* 3-Step Guide (Less Text, Visual) */}
            <div className="battle-steps-guide">
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
                    subtitle={renderOwnerSubtitle(deck, t)}
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
                        <Swords size={16} />
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
