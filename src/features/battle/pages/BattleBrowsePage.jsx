import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Layers, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { BattleReadyDeckCard } from '@/features/battle/components/BattleReadyDeckCard';
import {
  enrichPublicDeckOwners,
  renderBattleDeckOwnerSubtitle,
} from '@/features/battle/lib/battleOwnerPresentation';
import {
  createBattleSession,
  incrementStoredBattleDeckPlayCount,
  saveBattleSession,
} from '@/features/battle/lib/battleStore';
import {
  fetchPublicBattleDecks,
  incrementRemotePublicBattleDeckPlayCount,
  persistRemoteBattleSession,
} from '@/features/battle/api/battleRemoteApi';
import '../styles/Battle.css';

const BROWSE_INITIAL_FETCH = 192;
const BROWSE_LOAD_MORE = 96;
const BROWSE_PAGE_SIZE = 12;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const [publicDecks, setPublicDecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreDecks, setHasMoreDecks] = useState(false);
  const [error, setError] = useState('');

  // Filter/search/page state persisted in URL so browser back restores it
  const query = searchParams.get('q') || '';
  const typeFilter = searchParams.get('type') || 'all';
  const entityFilter = searchParams.get('entity') || 'all';
  const sortBy = searchParams.get('sort') || 'updated';
  const page = Math.max(0, Number(searchParams.get('page') || '0'));

  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || value === 'all') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      if (!('page' in updates)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadBrowseData() {
      setIsLoading(true);
      setError('');

      try {
        const fetched = await fetchPublicBattleDecks({
          limit: BROWSE_INITIAL_FETCH + 1,
          offset: 0,
        });
        if (cancelled) return;

        const hasMore = fetched.length > BROWSE_INITIAL_FETCH;
        const initial = hasMore ? fetched.slice(0, BROWSE_INITIAL_FETCH) : fetched;
        const enriched = await enrichPublicDeckOwners(initial);
        if (cancelled) return;

        setPublicDecks(enriched);
        setHasMoreDecks(hasMore);
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

  const handleLoadMoreDecks = useCallback(async () => {
    if (isLoadingMore || !hasMoreDecks) return;
    setIsLoadingMore(true);
    try {
      const fetched = await fetchPublicBattleDecks({
        limit: BROWSE_LOAD_MORE + 1,
        offset: publicDecks.length,
      });
      const hasMore = fetched.length > BROWSE_LOAD_MORE;
      const next = hasMore ? fetched.slice(0, BROWSE_LOAD_MORE) : fetched;
      const enriched = await enrichPublicDeckOwners(next);
      setPublicDecks((prev) => {
        const seen = new Set(prev.map((deck) => deck.id));
        return [...prev, ...enriched.filter((deck) => !seen.has(deck.id))];
      });
      setHasMoreDecks(hasMore);
    } catch {
      // keep current list on error
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreDecks, isLoadingMore, publicDecks.length]);

  const deckOptions = useMemo(() => ({
    hiddenTitleIds,
    excludeAdult: !showAdult,
    onlyAdult: showAdult,
  }), [hiddenTitleIds, showAdult]);

  const visibleDecks = useMemo(
    () => filterDecksForAgeGate(publicDecks, showAdult).filter((deck) => (deck?.titles?.length || deck?.titleIds?.length || 0) >= 8),
    [publicDecks, showAdult]
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

    if (sortBy === 'updated' || sortBy === 'oldest') {
      const tsMap = new Map(nextDecks.map((d) => [d.id, Date.parse(d?.updatedAt || d?.createdAt || '') || 0]));
      nextDecks = [...nextDecks].sort((a, b) =>
        sortBy === 'oldest' ? tsMap.get(a.id) - tsMap.get(b.id) : tsMap.get(b.id) - tsMap.get(a.id)
      );
    } else if (sortBy === 'size') {
      nextDecks = [...nextDecks].sort((a, b) =>
        (b?.titles?.length || b?.titleIds?.length || 0) - (a?.titles?.length || a?.titleIds?.length || 0)
      );
    } else if (sortBy === 'name') {
      nextDecks = [...nextDecks].sort((a, b) => String(a?.label || '').localeCompare(String(b?.label || '')));
    }

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

    if (deck?.id) {
      incrementStoredBattleDeckPlayCount(deck.id);
      if (deck.isPublic) {
        incrementRemotePublicBattleDeckPlayCount(deck.id);
      }
    }

    let session = saveBattleSession(createBattleSession(deck, {
      catalogCount: Number(deck?.sourceCount || deck?.titles?.length || 0),
      hiddenExcludedCount: 0,
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
    updateParams({ q: null, type: null, entity: null, sort: null, page: null });
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
                    updateParams({ q: event.target.value || null });
                  }}
                  placeholder={t('battle.browseSearchPlaceholder')}
                  aria-label={t('battle.browseSearchLabel')}
                />
                {query ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => updateParams({ q: null })}
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
                  updateParams({ type: event.target.value });
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
                  updateParams({ entity: event.target.value });
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
                updateParams({ sort: value === 'updated' ? null : value });
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
                  <button type="button" className="battle-browse-chip" onClick={() => updateParams({ type: null })}>
                    {typeFilter} <X size={12} />
                  </button>
                ) : null}
                {entityFilter !== 'all' ? (
                  <button type="button" className="battle-browse-chip" onClick={() => updateParams({ entity: null })}>
                    {getEntityFilterLabel(entityFilter, t)} <X size={12} />
                  </button>
                ) : null}
                {query ? (
                  <button type="button" className="battle-browse-chip" onClick={() => updateParams({ q: null })}>
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
                    subtitle={renderBattleDeckOwnerSubtitle(deck, t)}
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
                      onClick={() => updateParams({ page: Math.max(0, visiblePage - 1) === 0 ? null : Math.max(0, visiblePage - 1) })}
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
                      onClick={() => updateParams({ page: Math.min(totalPages - 1, visiblePage + 1) })}
                      disabled={visiblePage >= totalPages - 1}
                      aria-label={t('common.next')}
                    >
                      <ChevronRight size={20} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ) : null}

              {hasMoreDecks && visiblePage >= totalPages - 1 ? (
                <div className="battle-pagination-footer">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleLoadMoreDecks}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? t('common.loading') : t('battle.browseMoreStages')}
                  </Button>
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
