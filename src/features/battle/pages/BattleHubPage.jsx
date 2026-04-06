import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Layers, Play, Plus, Swords, Trophy } from 'lucide-react';
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
import { getBattleDeckMeta } from '@/features/battle/lib/battleDeckPresentation';
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
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { getAllTitles } from '@/features/discover/lib/recommend';
import './Battle.css';

const RECENT_BATTLE_SESSION_LIMIT = 4;
const PUBLIC_DECK_PAGE_SIZE = 8;

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

function BattlePresetRow({ preset, deck, disabled, onApply }) {
  const { t } = useLanguage();
  const requestedSize = Number(preset?.filters?.size || 0);
  const canStart = deck ? (deck?.titles?.length || 0) >= 8 : requestedSize >= 8;
  const artTile = deck?.titles?.[0];

  return (
    <button
      type="button"
      className={`battle-preset-row${!canStart ? ' is-disabled' : ''}`}
      onClick={() => onApply(preset, deck)}
      disabled={disabled || !canStart}
    >
      <div className="battle-preset-row-art">
        {artTile ? (
          <img src={getTitleArtwork(artTile)} alt="" loading="lazy" />
        ) : (
          <Play size={16} />
        )}
      </div>
      <div className="battle-preset-row-info">
        <strong>{preset.label}</strong>
        <span>{(preset.filters.type || 'all').toUpperCase()} · {t('battle.titlesReady', { count: deck?.titles?.length || 0 })}</span>
      </div>
      <span className="battle-preset-row-cta">
        {disabled ? '···' : canStart ? t('battle.startInstantly') : t('battle.needMoreTitles')}
      </span>
    </button>
  );
}

function BattleSavedDeckRow({ deck, disabled, onStart }) {
  const { t } = useLanguage();
  const canStart = (deck?.titles?.length || 0) >= 8;
  const artTile = deck?.titles?.[0];
  const ownerLabel = deck?.ownerUsername || deck?.ownerDisplayName || '';
  const ownerProfilePath = buildOwnerProfilePath(deck?.ownerUsername);

  return (
    <div className={`battle-preset-row${!canStart ? ' is-disabled' : ''}`}>
      <div className="battle-preset-row-art">
        {artTile ? (
          <img src={getTitleArtwork(artTile)} alt="" loading="lazy" />
        ) : (
          <Play size={16} />
        )}
      </div>
      <div className="battle-preset-row-info">
        <strong>{deck.label}</strong>
        <span>
          {ownerLabel ? t('battle.publicDeckBy', { owner: ownerLabel }) : getBattleDeckMeta(deck)}
          {ownerProfilePath ? (
            <>
              {' · '}
              <Link to={ownerProfilePath} className="battle-owner-profile-link">
                {t('layout.profile')}
              </Link>
            </>
          ) : null}
        </span>
      </div>
      <button
        type="button"
        className="battle-preset-row-cta-btn"
        onClick={() => onStart(deck)}
        disabled={disabled || !canStart}
      >
        <Play size={13} />
        {t('battle.startInstantly')}
      </button>
    </div>
  );
}

export function BattleHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
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
          mergedSessions.forEach((session) => {
            saveBattleSession(session);
          });
          setRecentSessions(getStoredBattleSessions());
          setSavedDecks(getStoredBattleDecks());
          const hasNext = remotePublicDecks.length > PUBLIC_DECK_PAGE_SIZE;
          setPublicDecks(hasNext ? remotePublicDecks.slice(0, PUBLIC_DECK_PAGE_SIZE) : remotePublicDecks);
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
    return () => {
      cancelled = true;
    };
  }, [t, user?.id]);

  const handlePublicDecksPage = async (newPage) => {
    if (isLoadingMore || newPage < 0) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const fetched = await fetchPublicBattleDecks({
        limit: PUBLIC_DECK_PAGE_SIZE + 1,
        offset: newPage * PUBLIC_DECK_PAGE_SIZE,
      });
      const hasNext = fetched.length > PUBLIC_DECK_PAGE_SIZE;
      setPublicDecks(hasNext ? fetched.slice(0, PUBLIC_DECK_PAGE_SIZE) : fetched);
      setHasNextPublicPage(hasNext);
      setPublicDecksPage(newPage);
    } catch {
      // Keep current page on fetch failure.
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
      readySavedDecks
        .filter((deck) => deck.isPublic)
        .map((deck) => [deck.id, deck])
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

  return (
    <div className="battle-page">
      <div className="battle-hub-header-wrap">
        <div className="battle-hub-header container">
          <div className="battle-hub-header-content">
            <div>
              <h1 className="battle-hub-title">
                <Swords size={20} />
                {t('battle.heroTitle')}
              </h1>
              <p className="battle-hub-subtitle">{t('battle.heroSubtitle')}</p>
            </div>
            <div className="battle-hub-header-actions">
              <Link className="btn btn-primary" to="/battle/build">
                <Plus size={15} />
                {t('battle.buildDeck')}
              </Link>
              <Link className="btn btn-secondary" to="/battle/decks">
                <Layers size={15} />
                {t('battle.manageDecks')}
              </Link>
            </div>
          </div>
          {!isLoading && (
            <div className="battle-hub-stats">
              <span><Layers size={12} /> {publicSavedDecks.length + (isPresetsLoading ? 0 : readyPresetDecks.length)} {t('battle.readyDecks')}</span>
              <span><Swords size={12} /> {recentSessions.length} {t('battle.savedRuns')}</span>
              {!isPresetsLoading && (
                <span><Play size={12} /> {visibleCatalogTitles.length} {t('battle.visibleCatalogTitles')}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container battle-hub-nav">
        <Link to="/battle/daily" className="battle-hub-nav-item">
          <CalendarDays size={15} />
          {t('dailyChallenge.todayTheme')}
        </Link>
        <Link to="/battle/leaderboard" className="battle-hub-nav-item">
          <Trophy size={15} />
          {t('leaderboard.title')}
        </Link>
      </div>

      <div className="container battle-hub-section">
        <h2 className="battle-hub-section-title">{t('battle.quickPresets')}</h2>
        {isPresetsLoading || isComputingPresets ? (
          <div className="battle-preset-list">
            {[0, 1, 2, 3].map((i) => <div key={i} className="battle-preset-row-skeleton battle-skeleton-block" />)}
          </div>
        ) : readyPresetDecks.length === 0 ? (
          <p className="battle-hub-empty">{t('battle.noPresetReady')}</p>
        ) : (
          <div className="battle-preset-list">
            {readyPresetDecks.map(({ preset, deck }) => (
              <BattlePresetRow
                key={preset.id}
                preset={preset}
                deck={deck}
                disabled={isPresetsLoading}
                onApply={(_, readyDeck) => startBattle(readyDeck)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="container battle-hub-section">
        <div className="battle-hub-section-header">
          <h2 className="battle-hub-section-title">{t('battle.publicDecks')}</h2>
          {(publicDecksPage > 0 || hasNextPublicPage) && !isLoading && (
            <div className="battle-hub-pagination">
              <button
                type="button"
                className="battle-hub-page-btn"
                onClick={() => handlePublicDecksPage(publicDecksPage - 1)}
                disabled={publicDecksPage === 0 || isLoadingMore}
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="battle-hub-page-label">{publicDecksPage + 1}</span>
              <button
                type="button"
                className="battle-hub-page-btn"
                onClick={() => handlePublicDecksPage(publicDecksPage + 1)}
                disabled={!hasNextPublicPage || isLoadingMore}
                aria-label="หน้าถัดไป"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="battle-preset-list">
            {[0, 1, 2].map((i) => <div key={i} className="battle-preset-row-skeleton battle-skeleton-block" />)}
          </div>
        ) : publicSavedDecks.length === 0 ? (
          <p className="battle-hub-empty">
            {t('battle.noPublicDeck')} <Link to="/battle/decks" className="battle-hub-empty-link">{t('battle.manageDecks')}</Link>
          </p>
        ) : (
          <div className={`battle-preset-list${isLoadingMore ? ' is-paging' : ''}`}>
            {publicSavedDecks.map((deck) => (
              <BattleSavedDeckRow
                key={deck.id}
                deck={deck}
                disabled={isLoading || Boolean(error)}
                onStart={startBattle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BattleHub;
