import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ChevronLeft, ChevronRight, LibrarySquare, Loader2, Music, Sparkles } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { fetchPartyTemplates, fetchPartyTitleGuessSets } from '@/features/party/api/partyRemoteApi';
import { PartyTemplateCard } from '../components/PartyTemplateCard';
import { PartyTemplateFilters } from '../components/PartyTemplateFilters';
import '../components/PartyTemplates.css';
import '../styles/Party.css';

const PAGE_SIZE = 12;
const FETCH_LIMIT = 200;

function useDebounce(value, delay = 500) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

function normalizeListingItems(songTemplates = [], titleGuessSets = []) {
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

  return [...normalizedSongTemplates, ...normalizedTitleGuessSets];
}

function filterListingItems(items = [], { setType = 'all', filterMode = 'all' } = {}) {
  return items.filter((item) => {
    if (setType !== 'all' && item.contentType !== setType) {
      return false;
    }

    if (filterMode === 'all') {
      return true;
    }

    if (filterMode === 'title-guess') {
      return item.contentType === 'title-guess';
    }

    if (item.contentType === 'title-guess') {
      return false;
    }

    if (filterMode === 'mixed') {
      return item.modeScope === 'all';
    }

    if (filterMode === 'quiz') {
      return item.modeScope === 'quiz' || item.modeScope === 'all';
    }

    if (filterMode === 'vote') {
      return item.modeScope === 'vote' || item.modeScope === 'all';
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
  if (template.contentType === 'title-guess') {
    return `${returnTo}${separator}titleGuessSetId=${encodeURIComponent(template.contentId)}&modeType=title-guess`;
  }

  return `${returnTo}${separator}templateId=${encodeURIComponent(template.contentId)}`;
}

export function PartyTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const returnTo = searchParams.get('returnTo') || '';
  const requestedMode = String(searchParams.get('mode') || 'all').trim().toLowerCase();

  const [currentTab, setCurrentTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState(
    ['quiz', 'vote', 'mixed', 'title-guess'].includes(requestedMode) ? requestedMode : 'all'
  );
  const [setType, setSetType] = useState(requestedMode === 'title-guess' ? 'title-guess' : 'all');
  const [sortBy, setSortBy] = useState('recent');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const debouncedSearch = useDebounce(searchQuery, 500);

  const loadTemplates = useCallback(() => {
    let ignore = false;
    setLoading(true);
    setFetchError(null);

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
    ])
      .then(([songResult, titleGuessSets]) => {
        if (!ignore) {
          setItems(normalizeListingItems(songResult?.templates || [], titleGuessSets || []));
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
  }, [currentTab, debouncedSearch, user?.id]);

  useEffect(() => {
    setPage(1);
  }, [currentTab, debouncedSearch, filterMode, setType, sortBy]);

  useEffect(() => {
    const cleanup = loadTemplates();
    return cleanup;
  }, [loadTemplates]);

  const filteredItems = useMemo(
    () => sortListingItems(filterListingItems(items, { setType, filterMode }), sortBy),
    [filterMode, items, setType, sortBy],
  );

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const handleCardClick = useCallback((template) => {
    if (template.contentType === 'song-set') {
      navigate(`/party/templates/${template.contentId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}&mode=${encodeURIComponent(filterMode)}` : ''}`, { viewTransition: true });
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
  }, [filterMode, navigate, pick, returnTo, user?.id]);

  const backDestination = returnTo || '/party';
  const backLabel = returnTo ? pick('กลับไปห้อง', 'Back to room') : pick('ย้อนกลับ', 'Back');
  const createSetUrl = returnTo
    ? `/party/templates/create?returnTo=${encodeURIComponent(returnTo)}`
    : '/party/templates/create';
  const buildTitleGuessEditUrl = useCallback(
    (setId) => `/party/templates/create?mode=title-guess&edit=${encodeURIComponent(setId)}`,
    [],
  );

  return (
    <div className="party-page is-hub party-route-fade">
      <div className="party-templates-page">
        <header className="party-templates-header party-shared-hero">
          <div>
            <button className="party-back-btn party-shared-back" onClick={() => navigate(backDestination, { replace: true, viewTransition: true })} aria-label={backLabel}>
              <ChevronLeft size={18} />
              {backLabel}
            </button>
            <div className="party-shared-badge">
              <span className="party-shared-badge-icon"><Sparkles size={12} fill="currentColor" /></span>
              {pick('เลือกแล้วกลับไปเล่นต่อได้เลย', 'Choose and jump back in')}
            </div>
            <span className="party-kicker party-shared-kicker"><LibrarySquare size={16} /> {pick('เซ็ตปาร์ตี้', 'Party Sets')}</span>
            <h1 className="party-shared-title">{pick('เลือกเซ็ตสำหรับปาร์ตี้', 'Choose a set for your party')}</h1>
            <p className="party-shared-sub">{pick('ดูได้ทั้งชุดเพลงและชุดทายชื่อเรื่อง พร้อมแยกกรองตามรูปแบบการเล่นที่ต้องการ', 'Browse song sets and Guess the Title sets, then filter by the kind of play experience you want.')}</p>
          </div>
          <button
            className="btn-play-now"
            style={{ padding: '0.75rem 1.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            onClick={() => navigate(createSetUrl, { viewTransition: true })}
          >
            {pick('+ สร้างเซ็ต', '+ Create Set')}
          </button>
        </header>

        <PartyTemplateFilters
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterMode={filterMode}
          onFilterModeChange={(nextMode) => {
            setFilterMode(nextMode);
            if (nextMode === 'title-guess') {
              setSetType('title-guess');
            }
          }}
          setType={setType}
          onSetTypeChange={(nextType) => {
            setSetType(nextType);
            if (nextType === 'title-guess' && filterMode !== 'title-guess') {
              setFilterMode('title-guess');
            } else if (nextType === 'song-set' && filterMode === 'title-guess') {
              setFilterMode('all');
            }
          }}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" style={{ opacity: 0.4, margin: '0 auto' }} />
          </div>
        ) : fetchError ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--color-surface-hover)', borderRadius: '12px' }}>
            <AlertTriangle size={40} style={{ opacity: 0.4, marginBottom: '1rem', color: 'var(--color-error, #E53E3E)' }} />
            <h3>{pick('โหลดรายการเซ็ตไม่สำเร็จ', 'Could not load sets')}</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>{fetchError}</p>
            <button className="btn-secondary" onClick={loadTemplates}>
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
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .filter((pageNumber) => pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 2)
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
                          className={`pt-page-btn ${pageItem === page ? 'is-active' : ''}`}
                          onClick={() => setPage(pageItem)}
                        >
                          {pageItem}
                        </button>
                      )
                  ))}

                <button
                  className="pt-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
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
          <div style={{ padding: '4rem', textAlign: 'center', background: 'var(--color-surface-hover)', borderRadius: '12px' }}>
            <Music size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <h3>{pick('ยังไม่พบเซ็ตที่ตรงกัน', 'No sets found')}</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              {searchQuery
                ? pick('ลองเปลี่ยนคำค้นหา ตัวกรองประเภทชุด หรือการเรียงลำดับ', 'Try a different search, set type filter, or sort option.')
                : pick('ยังไม่มีเซ็ตในหมวดนี้ ลองสร้างเซ็ตแรกได้เลย', 'There are no sets here yet. Create the first one.')}
            </p>
            {!searchQuery && (
              <button className="btn-play-now" style={{ display: 'inline-flex', padding: '0.75rem 1.5rem' }} onClick={() => navigate(createSetUrl, { viewTransition: true })}>
                {pick('สร้างเซ็ต', 'Create Set')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
