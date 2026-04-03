import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Music, LibrarySquare, LayoutGrid, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { fetchPartyTemplates } from '@/features/party/lib/partyRemote';
import { PartyTemplateCard } from '../components/PartyTemplateCard';
import { PartyTemplateFilters } from '../components/PartyTemplateFilters';
import '../components/PartyTemplates.css';
import '../pages/Party.css';

const PAGE_SIZE = 12;

function useDebounce(value, delay = 500) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export function PartyTemplatesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const returnTo = searchParams.get('returnTo') || '';
  const requestedMode = searchParams.get('mode') || 'all';

  const [currentTab, setCurrentTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState(requestedMode === 'quiz' || requestedMode === 'vote' ? requestedMode : 'all');
  const [templates, setTemplates] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const debouncedSearch = useDebounce(searchQuery, 500);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadTemplates = useCallback(() => {
    let ignore = false;
    setLoading(true);
    setFetchError(null);

    fetchPartyTemplates({
      tab: currentTab,
      mode: filterMode,
      search: debouncedSearch,
      userId: user?.id,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(({ templates: data, total: count }) => {
        if (!ignore) {
          setTemplates(data);
          setTotal(count);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setFetchError(err?.message || 'Failed to load templates');
          setTemplates([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [currentTab, filterMode, debouncedSearch, user?.id, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [currentTab, filterMode, debouncedSearch]);

  useEffect(() => {
    const cleanup = loadTemplates();
    return cleanup;
  }, [loadTemplates]);

  return (
    <div className="party-page is-hub">
      <div className="party-templates-page">
        {returnTo ? (
          <div style={{ marginBottom: '1rem' }}>
            <button className="party-back-btn" onClick={() => navigate(returnTo)}>
              <ChevronLeft size={18} />
              {pick('กลับไปห้อง', 'Back to room')}
            </button>
          </div>
        ) : null}
        <header className="party-templates-header">
          <div>
            <button className="party-back-btn" onClick={() => navigate('/party')} aria-label={pick('ย้อนกลับ', 'Back')}>
              <ChevronLeft size={18} />
              {pick('ย้อนกลับ', 'Back')}
            </button>
            <span className="party-kicker"><LibrarySquare size={16} /> Templates</span>
            <h1>{pick('เพลงปาร์ตี้ (Templates)', 'Party Templates')}</h1>
            <p>{pick('ค้นหาแพ็กเพลง สร้างห้องเล่นเกม หรือสร้างเพลย์ลิสต์ของคุณเอง', 'Find song packs, create a room, or build your own playlist.')}</p>
          </div>
          <button
            className="btn-play-now"
            style={{ padding: '0.75rem 1.5rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            onClick={() => navigate('/party/templates/create')}
          >
            <LayoutGrid size={18} />
            {pick('+ สร้าง Template', '+ Create Template')}
          </button>
        </header>

        <PartyTemplateFilters
          currentTab={currentTab}
          onTabChange={(tab) => { setCurrentTab(tab); setPage(1); }}
          searchQuery={searchQuery}
          onSearchChange={(q) => { setSearchQuery(q); setPage(1); }}
          filterMode={filterMode}
          onFilterModeChange={(m) => { setFilterMode(m); setPage(1); }}
        />

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" style={{ opacity: 0.4, margin: '0 auto' }} />
          </div>
        ) : fetchError ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--color-surface-hover)', borderRadius: '12px' }}>
            <AlertTriangle size={40} style={{ opacity: 0.4, marginBottom: '1rem', color: 'var(--color-error, #E53E3E)' }} />
            <h3>{pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load templates')}</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>{fetchError}</p>
            <button className="btn-secondary" onClick={loadTemplates}>
              {pick('ลองใหม่', 'Try again')}
            </button>
          </div>
        ) : templates.length > 0 ? (
          <>
            <div className="party-template-grid">
              {templates.map((template) => (
                <PartyTemplateCard
                  key={template.id}
                  template={template}
                  pick={pick}
                  onClick={() => navigate(`/party/templates/${template.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}&mode=${encodeURIComponent(filterMode)}` : ''}`)}
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

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '…' ? (
                      <span key={`ellipsis-${idx}`} className="pt-page-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        className={`pt-page-btn ${p === page ? 'is-active' : ''}`}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}

                <button
                  className="pt-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>

                <span className="pt-page-info">
                  {pick(`${total} เทมเพลต`, `${total} templates`)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '4rem', textAlign: 'center', background: 'var(--color-surface-hover)', borderRadius: '12px' }}>
            <Music size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <h3>{pick('ยังไม่มีเทมเพลตในหมวดนี้', 'No templates found')}</h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
              {searchQuery
                ? pick('ลองเปลี่ยนคำค้นหา หรือหมวดหมู่', 'Try different search terms or filters.')
                : pick('คุณสามารถสร้างเทมเพลตแรกของหมวดนี้ได้เลย!', 'Be the first to create a template here!')}
            </p>
            {!searchQuery && (
              <button className="btn-play-now" style={{ display: 'inline-flex', padding: '0.75rem 1.5rem' }} onClick={() => navigate('/party/templates/create')}>
                <LayoutGrid size={16} /> {pick('สร้าง Template', 'Create Template')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
