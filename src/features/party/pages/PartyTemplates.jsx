import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ChevronLeft, ChevronRight, LibrarySquare, Loader2, Music, Plus } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { fetchPartyTemplates, fetchPartyTitleGuessSets } from '@/features/party/api/partyRemoteApi';
import { fetchPublicBattleDecks } from '@/features/battle/api/battleRemoteApi';
import { fetchRemoteTemplates } from '@/features/tierlist/api/tierlistRemoteQueriesApi';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { getYoutubeItemThumbnail, parseYoutubeVideoId } from '@/features/party/lib/partyYoutube';
import { PartyTemplateCard } from '../components/PartyTemplateCard';
import { PartyTemplateFilters } from '../components/PartyTemplateFilters';
import '../components/PartyTemplates.css';
import '../styles/Party.css';

const PAGE_SIZE = 12;
const FETCH_LIMIT = 200;

function getTierlistCustomItemArtwork(item = {}) {
  const directArtwork = String(
    item?.imageUrl
    || item?.image_url
    || item?.cover
    || item?.coverUrl
    || item?.cover_url
    || item?.trailerThumbnailUrl
    || item?.trailer_thumbnail_url
    || '',
  ).trim();
  if (directArtwork) {
    return directArtwork;
  }

  const videoId = String(
    item?.trailerVideoId
    || item?.trailer_video_id
    || item?.providerMediaId
    || item?.provider_media_id
    || '',
  ).trim() || parseYoutubeVideoId(item?.providerUrl || item?.provider_url || item?.url || item?.trailerUrl || '');

  return videoId ? getYoutubeItemThumbnail(videoId, 'hq') : '';
}

function getTierlistTemplateCoverUrl(template = {}) {
  const explicitCover = String(template?.previewArtworkUrl || template?.manualPreviewArtworkUrl || '').trim();
  if (explicitCover) {
    return explicitCover;
  }

  return (Array.isArray(template?.customItems) ? template.customItems : [])
    .map(getTierlistCustomItemArtwork)
    .find(Boolean) || '';
}

function getTierlistTemplateItemCount(template = {}) {
  const titleCount = Array.isArray(template?.titleIds) ? template.titleIds.length : 0;
  const customCount = Array.isArray(template?.customItems)
    ? template.customItems.filter((item) => getTierlistCustomItemArtwork(item)).length
    : 0;
  return titleCount + customCount;
}

function useDebounce(value, delay = 500) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

function normalizeListingItems(songTemplates = [], titleGuessSets = [], battleDecks = [], tierlistTemplates = []) {
  const normalizedSongTemplates = (songTemplates || []).map((template) => ({
    ...template,
    id: `song:${template.id}`,
    contentId: template.id,
    contentType: 'song-set',
    likes: Number(template?.likes || 0),
    playCount: Number(template?.viewCount || 0),
    itemCount: Number(template?.itemCount || 0),
  }));

  const normalizedTitleGuessSets = (titleGuessSets || []).map((template) => ({
    ...template,
    id: `title-guess:${template.id}`,
    contentId: template.id,
    contentType: 'title-guess',
    modeScope: 'title-guess',
    likes: Number(template?.likeCount || 0),
    itemCount: Number(template?.questionCount || 0),
    tags: [],
  }));

  const normalizedBattleDecks = (battleDecks || []).map((deck) => {
    const titles = Array.isArray(deck.titles) ? deck.titles : [];
    const firstCover = titles.map(getTitleArtwork).find((url) => url && !url.endsWith('.svg'));
    return {
      id: `battle:${deck.id}`,
      contentId: deck.id,
      contentType: 'battle-deck',
      name: deck.label || 'Battle Deck',
      description: '',
      coverUrl: firstCover || '',
      creatorName: deck.ownerDisplayName || deck.ownerUsername || '',
      ownerUserId: deck.ownerUserId || '',
      modeScope: 'vote',
      isOfficial: false,
      likes: 0,
      playCount: Math.max(0, Number(deck.playCount || 0)),
      itemCount: titles.length,
      tags: ['battle'],
      updatedAt: deck.updatedAt || deck.createdAt || '',
    };
  });

  const normalizedTierlistTemplates = (tierlistTemplates || [])
    .filter((t) => {
      return getTierlistTemplateItemCount(t) > 0;
    })
    .map((template) => ({
      ...template,
      id: `tierlist:${template.id}`,
      contentId: template.id,
      contentType: 'tierlist',
      name: template.title || '',
      description: template.description || '',
      coverUrl: getTierlistTemplateCoverUrl(template),
      creatorName: '',
      modeScope: 'tierlist',
      isOfficial: Boolean(template.isSystem),
      likes: 0,
      playCount: Number(template.plays || 0),
      itemCount: getTierlistTemplateItemCount(template),
      tags: [],
      updatedAt: template.updatedAt || template.createdAt || '',
      defaultRows: template.defaultRows || [],
    }));

  return [...normalizedSongTemplates, ...normalizedTitleGuessSets, ...normalizedBattleDecks, ...normalizedTierlistTemplates];
}

function filterListingItems(items = [], { setType = 'all', filterMode = 'all' } = {}) {
  return items.filter((item) => {
    if (setType !== 'all') {
      if (setType === 'battle-deck') {
        if (item.contentType !== 'battle-deck') return false;
      } else if (setType === 'tierlist') {
        if (item.contentType !== 'tierlist') return false;
      } else if (item.contentType === 'battle-deck' || item.contentType === 'tierlist') {
        return false;
      } else if (item.contentType !== setType) {
        return false;
      }
    }

    if (filterMode === 'all') {
      return true;
    }

    if (filterMode === 'tierlist') {
      return item.contentType === 'tierlist';
    }

    if (filterMode === 'title-guess') {
      return item.contentType === 'title-guess';
    }

    // Hide tierlist items from non-tierlist filter modes
    if (item.contentType === 'tierlist') {
      return false;
    }

    if (item.contentType === 'title-guess') {
      return false;
    }

    if (filterMode === 'mixed') {
      return item.modeScope === 'all';
    }

    if (filterMode === 'quiz') {
      if (item.contentType === 'battle-deck') return false;
      return item.modeScope === 'quiz' || item.modeScope === 'all';
    }

    if (filterMode === 'vote') {
      return item.modeScope === 'vote' || item.modeScope === 'all' || item.contentType === 'battle-deck';
    }

    return true;
  });
}

function sortListingItems(items = [], sortBy = 'recent') {
  const sorted = [...items];

  const tsMap = sortBy === 'recent'
    ? new Map(items.map((item) => [item, Date.parse(item?.updatedAt || '') || 0]))
    : null;

  sorted.sort((left, right) => {
    if (sortBy === 'popular') {
      const likeDiff = Number(right?.likes || 0) - Number(left?.likes || 0);
      if (likeDiff !== 0) {
        return likeDiff;
      }
    } else if (sortBy === 'plays') {
      const playDiff = Number(right?.playCount || 0) - Number(left?.playCount || 0);
      if (playDiff !== 0) {
        return playDiff;
      }
    } else if (sortBy === 'name') {
      const nameDiff = String(left?.name || '').localeCompare(String(right?.name || ''));
      if (nameDiff !== 0) {
        return nameDiff;
      }
    } else {
      const updatedDiff = tsMap.get(right) - tsMap.get(left);
      if (updatedDiff !== 0) {
        return updatedDiff;
      }
    }

    if (Boolean(right?.isOfficial) !== Boolean(left?.isOfficial)) {
      return Number(Boolean(right?.isOfficial)) - Number(Boolean(left?.isOfficial));
    }

    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });

  return sorted;
}

function buildRoomReturnSelectionUrl(returnTo, template) {
  const separator = returnTo.includes('?') ? '&' : '?';
  if (template.contentType === 'tierlist') {
    return `${returnTo}${separator}templateId=${encodeURIComponent(template.contentId)}&templateName=${encodeURIComponent(template.name || '')}&modeType=tierlist`;
  }

  if (template.contentType === 'title-guess') {
    return `${returnTo}${separator}titleGuessSetId=${encodeURIComponent(template.contentId)}&modeType=title-guess`;
  }

  if (template.contentType === 'battle-deck') {
    return `${returnTo}${separator}battleDeckId=${encodeURIComponent(template.contentId)}&modeType=vote`;
  }

  return `${returnTo}${separator}templateId=${encodeURIComponent(template.contentId)}`;
}

export function PartyTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const returnTo = searchParams.get('returnTo') || '';
  const requestedMode = String(searchParams.get('mode') || 'all').trim().toLowerCase();

  // Filter/search/page state is persisted in URL so browser back restores it
  const currentTab = searchParams.get('tab') || 'all';
  const searchQuery = searchParams.get('q') || '';
  const filterMode = searchParams.get('filter') !== null
    ? (searchParams.get('filter') || 'all')
    : (['quiz', 'vote', 'mixed', 'title-guess', 'tierlist'].includes(requestedMode) ? requestedMode : 'all');
  const setType = searchParams.get('type') !== null
    ? (searchParams.get('type') || 'all')
    : (requestedMode === 'title-guess' ? 'title-guess' : requestedMode === 'tierlist' ? 'tierlist' : 'all');
  const sortBy = searchParams.get('sort') || 'recent';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || (value === 'all' && key !== 'mode')) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      // Reset page to 1 unless explicitly setting page
      if (!('page' in updates)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const debouncedSearch = useDebounce(searchQuery, 500);

  const loadTemplates = useCallback(() => {
    let ignore = false;

    Promise.all([
      fetchPartyTemplates({
        tab: currentTab,
        mode: 'all',
        search: debouncedSearch,
        userId: user?.id,
        page: 1,
        pageSize: FETCH_LIMIT,
      }),
      fetchPartyTitleGuessSets({
        tab: currentTab,
        search: debouncedSearch,
        userId: user?.id,
        limit: FETCH_LIMIT,
      }),
      fetchPublicBattleDecks({ limit: FETCH_LIMIT, offset: 0 }).catch(() => []),
      fetchRemoteTemplates(user?.id || null, {
        includePublic: true,
        includeOwned: true,
        showAdult: showAdult === true ? true : false,
      }).catch(() => []),
    ])
      .then(([songResult, titleGuessSets, battleDecks, tierlistTemplates]) => {
        if (!ignore) {
          setItems(normalizeListingItems(songResult?.templates || [], titleGuessSets || [], battleDecks || [], tierlistTemplates || []));
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFetchError(err?.message || 'Failed to load sets');
          setItems([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [currentTab, debouncedSearch, showAdult, user?.id]);

  useEffect(() => {
    const cleanup = loadTemplates();
    return cleanup;
  }, [loadTemplates, reloadKey]);

  const filteredItems = useMemo(
    () => sortListingItems(filterListingItems(items, { setType, filterMode }), sortBy),
    [filterMode, items, setType, sortBy],
  );

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredItems]);

  const handleCardClick = useCallback((template) => {
    if (template.contentType === 'song-set') {
      navigate(`/party/templates/${template.contentId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}&mode=${encodeURIComponent(filterMode)}` : ''}`, { viewTransition: true });
      return;
    }

    if (template.contentType === 'battle-deck') {
      if (returnTo) {
        navigate(buildRoomReturnSelectionUrl(returnTo, template), { viewTransition: true });
      } else {
        toast(pick('Battle Deck สามารถเลือกใช้ได้ตอนตั้งค่าห้อง Vote Battle', 'Battle Decks can be selected from the Vote Battle room setup flow.'));
      }
      return;
    }

    if (template.contentType === 'tierlist') {
      if (returnTo) {
        navigate(buildRoomReturnSelectionUrl(returnTo, template), { viewTransition: true });
      } else {
        toast(pick('Tierlist เทมเพลตสามารถเลือกใช้ได้ตอนตั้งค่าห้อง Tierlist Vote', 'Tierlist templates can be selected from the Tierlist Vote room setup flow.'));
      }
      return;
    }

    if (returnTo) {
      navigate(buildRoomReturnSelectionUrl(returnTo, template), { viewTransition: true });
      return;
    }

    if (
      template.contentType === 'title-guess'
      && user?.id
      && !template.isOfficial
      && String(template.ownerUserId || '') === String(user.id)
    ) {
      navigate(`/party/templates/create?mode=title-guess&edit=${encodeURIComponent(template.contentId)}`, { viewTransition: true });
      return;
    }

    toast(pick('ชุดทายชื่อเรื่องสามารถเลือกใช้ได้ตอนตั้งค่าห้อง', 'Guess the Title sets can be selected from the room setup flow.'));
  }, [filterMode, navigate, pick, returnTo, user]);

  const backDestination = returnTo || '/party';
  const backLabel = returnTo ? pick('กลับไปห้อง', 'Back to room') : pick('ย้อนกลับ', 'Back');
  const createSetUrl = returnTo
    ? `/party/templates/create?returnTo=${encodeURIComponent(returnTo)}`
    : '/party/templates/create';
  const buildTitleGuessEditUrl = useCallback(
    (setId) => `/party/templates/create?mode=title-guess&edit=${encodeURIComponent(setId)}`,
    [],
  );
  const triggerReload = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    setReloadKey((current) => current + 1);
  }, []);

  return (
    <div className="party-page is-hub party-route-fade">
      <div className="party-templates-page">
        <header className="party-templates-header party-templates-header--minimal">
          <div className="party-templates-header-copy">
            <button className="party-back-btn party-shared-back" onClick={() => navigate(backDestination, { replace: true, viewTransition: true })} aria-label={backLabel}>
              <ChevronLeft size={18} />
              {backLabel}
            </button>
            <span className="party-kicker party-templates-kicker"><LibrarySquare size={16} /> {pick('เซ็ตปาร์ตี้', 'Party Sets')}</span>
            <h1 className="party-templates-title">{pick('เลือกเซ็ตที่อยากใช้', 'Pick a set to use')}</h1>
            <p className="party-templates-subtitle">{pick('ค้นหา กรอง แล้วเลือกได้เลย ทั้งชุดเพลงและชุดทายชื่อเรื่องอยู่ในที่เดียว', 'Search, filter, and choose in one place. Song sets and Guess the Title sets live together here.')}</p>
          </div>
          <button
            className="party-templates-create-btn"
            onClick={() => navigate(createSetUrl, { viewTransition: true })}
          >
            <Plus size={16} />
            {pick('สร้างเซ็ต', 'Create set')}
          </button>
        </header>

        <PartyTemplateFilters
          currentTab={currentTab}
          onTabChange={(nextTab) => {
            setLoading(true);
            setFetchError(null);
            updateParams({ tab: nextTab });
          }}
          searchQuery={searchQuery}
          onSearchChange={(nextQuery) => {
            setLoading(true);
            setFetchError(null);
            updateParams({ q: nextQuery || null });
          }}
          filterMode={filterMode}
          onFilterModeChange={(nextMode) => {
            const extra = nextMode === 'title-guess' ? { type: 'title-guess' } : {};
            updateParams({ filter: nextMode, ...extra });
          }}
          setType={setType}
          onSetTypeChange={(nextType) => {
            const extraFilter = nextType === 'title-guess' && filterMode !== 'title-guess'
              ? { filter: 'title-guess' }
              : nextType === 'song-set' && filterMode === 'title-guess'
                ? { filter: null }
                : {};
            updateParams({ type: nextType, ...extraFilter });
          }}
          sortBy={sortBy}
          onSortByChange={(nextSort) => {
            updateParams({ sort: nextSort });
          }}
        />

        {loading ? (
          <div className="party-templates-feedback">
            <Loader2 size={32} className="animate-spin" style={{ opacity: 0.4, margin: '0 auto' }} />
          </div>
        ) : fetchError ? (
          <div className="party-templates-feedback party-templates-feedback--panel">
            <AlertTriangle size={40} style={{ opacity: 0.4, marginBottom: '1rem', color: 'var(--color-error, #E53E3E)' }} />
            <h3>{pick('โหลดรายการเซ็ตไม่สำเร็จ', 'Could not load sets')}</h3>
            <p className="party-templates-feedback-copy">{fetchError}</p>
            <button className="btn-secondary" onClick={triggerReload}>
              {pick('ลองใหม่', 'Try again')}
            </button>
          </div>
        ) : visibleItems.length > 0 ? (
          <>
            <div className="party-template-grid">
              {visibleItems.map((template) => (
                <PartyTemplateCard
                  key={template.id}
                  template={template}
                  pick={pick}
                  canEdit={
                    template.contentType === 'title-guess'
                    && user?.id
                    && !template.isOfficial
                    && String(template.ownerUserId || '') === String(user.id)
                  }
                  onEdit={() => navigate(buildTitleGuessEditUrl(template.contentId))}
                  onClick={() => handleCardClick(template)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="party-templates-pagination">
                <button
                  className="pt-page-btn"
                  onClick={() => updateParams({ page: Math.max(1, currentPage - 1) === 1 ? null : Math.max(1, currentPage - 1) })}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - currentPage) <= 2)
                  .reduce((acc, pageNumber, index, pages) => {
                    if (index > 0 && pageNumber - pages[index - 1] > 1) {
                      acc.push('...');
                    }
                    acc.push(pageNumber);
                    return acc;
                  }, [])
                  .map((pageItem, index) => (
                    pageItem === '...'
                      ? <span key={`ellipsis-${index}`} className="pt-page-ellipsis">...</span>
                      : (
                        <button
                          key={pageItem}
                          className={`pt-page-btn ${pageItem === currentPage ? 'is-active' : ''}`}
                          onClick={() => updateParams({ page: pageItem === 1 ? null : pageItem })}
                        >
                          {pageItem}
                        </button>
                      )
                  ))}

                <button
                  className="pt-page-btn"
                  onClick={() => updateParams({ page: Math.min(totalPages, currentPage + 1) })}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>

                <span className="pt-page-info">
                  {pick(`${total} เซ็ต`, `${total} sets`)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="party-templates-feedback party-templates-feedback--panel">
            <Music size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <h3>{pick('ยังไม่พบเซ็ตที่ตรงกัน', 'No sets found')}</h3>
            <p className="party-templates-feedback-copy">
              {searchQuery
                ? pick('ลองเปลี่ยนคำค้นหา ตัวกรองประเภทชุด หรือการเรียงลำดับ', 'Try a different search, set type filter, or sort option.')
                : pick('ยังไม่มีเซ็ตในหมวดนี้ ลองสร้างเซ็ตแรกได้เลย', 'There are no sets here yet. Create the first one.')}
            </p>
            {!searchQuery && (
              <button className="party-templates-create-btn" onClick={() => navigate(createSetUrl, { viewTransition: true })}>
                <Plus size={16} />
                {pick('สร้างเซ็ต', 'Create Set')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
