import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Layers, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  getCatalogEntities,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import { supabase } from '@/shared/lib/supabase';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { BattleReadyDeckCard } from '@/features/battle/components/BattleReadyDeckCard';
import { getAllTitles } from '@/features/discover/lib/recommend';
import {
  createBattleSession,
  saveBattleSession,
} from '@/features/battle/lib/battleStore';
import {
  fetchPublicBattleDecks,
  persistRemoteBattleSession,
} from '@/features/battle/lib/battleRemote';
import './Battle.css';

const BROWSE_BATCH_SIZE = 96;
const BROWSE_PAGE_SIZE = 12;

function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
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

function BattleBrowseCardSkeleton() {
  return (
    <div className="battle-preset-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ height: '164px', borderRadius: '0', width: '100%' }} />
      <div className="battle-skeleton-body" style={{ padding: '1rem' }}>
        <div className="battle-skeleton-block" style={{ height: '1.3rem', width: '42%', borderRadius: '999px', marginBottom: '0.5rem' }} />
        <div className="battle-skeleton-block" style={{ height: '1.1rem', width: '88%', marginBottom: '0.5rem' }} />
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '64%' }} />
      </div>
    </div>
  );
}

function getEntityFilterLabel(value, t) {
  const normalized = normalizeCatalogEntityType(value);
  if (normalized === CHARACTER_ENTITY_TYPE) return t('battle.unitCharacters');
  if (normalized === THEME_SONG_ENTITY_TYPE) return t('battle.unitSongs');
  if (normalized === TRAILER_ENTITY_TYPE) return t('battle.browseEntityTrailers');
  return t('battle.unitTitles');
}

export function BattleBrowsePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [publicDecks, setPublicDecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadBrowseData() {
      setIsLoading(true);
      setError('');

      try {
        const [allTitles, decks] = await Promise.all([
          getAllTitles({ maxRows: Number.POSITIVE_INFINITY }),
          (async () => {
            const collected = [];
            let offset = 0;

            while (true) {
              const batch = await fetchPublicBattleDecks({ limit: BROWSE_BATCH_SIZE, offset });
              collected.push(...batch);

              if (batch.length < BROWSE_BATCH_SIZE) {
                break;
              }

              offset += BROWSE_BATCH_SIZE;
              if (offset >= 480) {
                break;
              }
            }

            return enrichPublicDeckOwners(collected);
          })(),
        ]);

        if (cancelled) return;
        setTitles(allTitles);
        setPublicDecks(decks);
        setIsLoading(false);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError?.message || t('battle.loadCatalogFailed'));
        setIsLoading(false);
      }
    }

    void loadBrowseData();
    return () => {
      cancelled = true;
    };
  }, [t]);

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

  const visibleDecks = useMemo(
    () => filterDecksForAgeGate(publicDecks, showAdult, titleLookup).filter((deck) => (deck?.titles?.length || deck?.titleIds?.length || 0) >= 8),
    [publicDecks, showAdult, titleLookup]
  );

  const filteredDecks = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    let nextDecks = visibleDecks.filter((deck) => {
      const deckType = String(deck?.filters?.type || 'all').toLowerCase();
      const deckEntityType = normalizeCatalogEntityType(deck?.filters?.entityType || TITLE_ENTITY_TYPE);

      if (typeFilter !== 'all' && deckType !== typeFilter) {
        return false;
      }

      if (entityFilter !== 'all' && deckEntityType !== entityFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        deck?.label,
        deck?.ownerDisplayName,
        deck?.ownerUsername,
        deck?.filters?.type,
        deck?.filters?.tag,
        deck?.filters?.mood,
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    nextDecks = [...nextDecks].sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a?.updatedAt || a?.createdAt || 0) - new Date(b?.updatedAt || b?.createdAt || 0);
      }
      if (sortBy === 'size') {
        return (b?.titles?.length || b?.titleIds?.length || 0) - (a?.titles?.length || a?.titleIds?.length || 0);
      }
      if (sortBy === 'name') {
        return String(a?.label || '').localeCompare(String(b?.label || ''));
      }
      return new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0);
    });

    return nextDecks;
  }, [entityFilter, query, sortBy, typeFilter, visibleDecks]);

  const totalPages = Math.max(1, Math.ceil(filteredDecks.length / BROWSE_PAGE_SIZE));
  const visiblePage = Math.min(page, totalPages - 1);
  const pagedDecks = filteredDecks.slice(visiblePage * BROWSE_PAGE_SIZE, (visiblePage + 1) * BROWSE_PAGE_SIZE);

  const startBattle = async (deck) => {
    if ((deck?.titles?.length || 0) < 8) {
      toast.error(t('battle.needAtLeastEight'));
      return;
    }

    const entityType = normalizeCatalogEntityType(deck?.filters?.entityType);
    let session = saveBattleSession(createBattleSession(deck, {
      catalogCount: entityType === CHARACTER_ENTITY_TYPE
        ? visibleCharacterCatalog.length
        : entityType === THEME_SONG_ENTITY_TYPE
          ? Number(deck?.sourceCount || deck?.titles?.length || 0)
          : entityType === TRAILER_ENTITY_TYPE
            ? Number(deck?.sourceCount || deck?.titles?.length || 0)
            : visibleCatalogTitles.length,
      hiddenExcludedCount,
      excludesAdultContent: !showAdult,
      deckOptions,
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

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setEntityFilter('all');
    setSortBy('updated');
    setPage(0);
  };

  return (
    <div className="battle-page battle-browse-page">
      <div className="battle-browse-shell container">
        <section className="battle-browse-hero animate-fade-in-up">
          <div className="battle-browse-hero-copy">
            <span className="battle-kicker"><Globe size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.communityStages')}</span>
            <h1>{t('battle.browseCommunityStagesTitle')}</h1>
            <p>{t('battle.browseCommunityStagesHint')}</p>
          </div>
          <div className="battle-browse-hero-actions">
            <Link className="btn btn-secondary" to="/battle">
              <ChevronLeft size={14} /> {t('battle.backToBattle')}
            </Link>
            <Link className="btn btn-primary" to="/battle/build">
              <Layers size={14} /> {t('battle.openBuilder')}
            </Link>
          </div>
        </section>

        <section className="battle-browse-toolbar glass-heavy">
          <div className="battle-browse-control-grid">
            <label className="battle-browse-search battle-browse-control" role="search">
              <span>{t('battle.browseSearchLabel')}</span>
              <div className="battle-browse-search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                  placeholder={t('battle.browseSearchPlaceholder')}
                  aria-label={t('battle.browseSearchLabel')}
                />
                {query ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setQuery('');
                      setPage(0);
                    }}
                    aria-label={t('battle.clearSearch')}
                  >
                    <X size={14} />
                  </Button>
                ) : null}
              </div>
            </label>

            <label className="battle-browse-select battle-browse-control battle-browse-type">
              <span>{t('battle.browseTypeFilter')}</span>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setTypeFilter(event.target.value);
                  setPage(0);
                }}
                aria-label={t('battle.browseTypeFilter')}
              >
                <option value="all">{t('battle.browseAllTypes')}</option>
                <option value="anime">Anime</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
              </select>
            </label>

            <label className="battle-browse-select battle-browse-control battle-browse-entity">
              <span>{t('battle.browseEntityFilter')}</span>
              <select
                value={entityFilter}
                onChange={(event) => {
                  setEntityFilter(event.target.value);
                  setPage(0);
                }}
                aria-label={t('battle.browseEntityFilter')}
              >
                <option value="all">{t('battle.browseAllEntities')}</option>
                <option value={TITLE_ENTITY_TYPE}>{t('battle.unitTitles')}</option>
                <option value={CHARACTER_ENTITY_TYPE}>{t('battle.unitCharacters')}</option>
                <option value={THEME_SONG_ENTITY_TYPE}>{t('battle.unitSongs')}</option>
                <option value={TRAILER_ENTITY_TYPE}>{t('battle.browseEntityTrailers')}</option>
              </select>
            </label>

            <SortSelect
              value={sortBy}
              onChange={(value) => {
                setSortBy(value);
                setPage(0);
              }}
              label={t('battle.browseSortLabel')}
              className="battle-browse-sorter battle-browse-control battle-browse-sort"
              selectAriaLabel={t('battle.browseSortLabel')}
            >
              <option value="updated">{t('battle.browseSortUpdated')}</option>
              <option value="oldest">{t('battle.browseSortOldest')}</option>
              <option value="size">{t('battle.browseSortLargest')}</option>
              <option value="name">{t('battle.browseSortName')}</option>
            </SortSelect>

            <div className="battle-browse-action battle-browse-control battle-browse-clear">
              <span>{t('battle.clearBrowseFilters')}</span>
              <Button type="button" variant="ghost" onClick={clearFilters} icon={<SlidersHorizontal size={14} />}>
                {t('battle.clearBrowseFilters')}
              </Button>
            </div>
          </div>
        </section>

        <section className="battle-section">
          <div className="battle-browse-results-row">
            <div className="battle-browse-results-copy">
              <strong>{filteredDecks.length} {t('battle.browseResultsLabel')}</strong>
              <span>{t('battle.browseResultsHint', { page: visiblePage + 1, total: totalPages })}</span>
            </div>
            {(query || typeFilter !== 'all' || entityFilter !== 'all') ? (
              <div className="battle-browse-active-filters">
                {typeFilter !== 'all' ? (
                  <button type="button" className="battle-browse-chip" onClick={() => setTypeFilter('all')}>
                    {typeFilter} <X size={12} />
                  </button>
                ) : null}
                {entityFilter !== 'all' ? (
                  <button type="button" className="battle-browse-chip" onClick={() => setEntityFilter('all')}>
                    {getEntityFilterLabel(entityFilter, t)} <X size={12} />
                  </button>
                ) : null}
                {query ? (
                  <button type="button" className="battle-browse-chip" onClick={() => setQuery('')}>
                    "{query}" <X size={12} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {error && !isLoading ? (
            <div className="glass-heavy battle-empty-state">
              <strong>{t('battle.browseLoadFailed')}</strong>
              <p>{error}</p>
              <div className="battle-hero-actions">
                <Button type="button" onClick={() => window.location.reload()}>
                  {t('common.retry')}
                </Button>
                <Link className="btn btn-secondary" to="/battle">
                  {t('battle.backToBattle')}
                </Link>
              </div>
            </div>
          ) : isLoading ? (
            <div className="battle-deck-list-grid">
              {Array.from({ length: 8 }, (_, index) => <BattleBrowseCardSkeleton key={index} />)}
            </div>
          ) : pagedDecks.length === 0 ? (
            <div className="glass-heavy battle-empty-state">
              <strong>{t('battle.browseNoResultsTitle')}</strong>
              <p>{t('battle.browseNoResultsHint')}</p>
              <div className="battle-hero-actions">
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  {t('battle.clearBrowseFilters')}
                </Button>
                <Link className="btn btn-primary" to="/battle/build">
                  {t('battle.openBuilder')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="battle-deck-list-grid stagger-children">
                {pagedDecks.map((deck) => (
                  <BattleReadyDeckCard
                    key={deck.id}
                    title={deck.label}
                    subtitle={renderOwnerSubtitle(deck, t)}
                    badge={t('battle.customStage')}
                    badgeClassName="game-badge community"
                    deck={deck}
                    variant="preset"
                    onStart={() => startBattle(deck)}
                    actionLabel={t('battle.startGame')}
                  />
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="battle-pagination-footer">
                  <div className="battle-hub-pagination pagination-gamey">
                    <button
                      type="button"
                      className="game-page-btn"
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                      disabled={visiblePage === 0}
                      aria-label={t('common.previous')}
                    >
                      <ChevronLeft size={20} strokeWidth={3} />
                    </button>
                    <span className="game-page-indicator">
                      {t('common.page')} {visiblePage + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="game-page-btn"
                      onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                      disabled={visiblePage >= totalPages - 1}
                      aria-label={t('common.next')}
                    >
                      <ChevronRight size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default BattleBrowsePage;
