import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, LibrarySquare, LayoutGrid, Loader2, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { fetchPartyTemplates } from '@/features/party/lib/partyRemote';
import { PartyTemplateCard } from '../components/PartyTemplateCard';
import { PartyTemplateFilters } from '../components/PartyTemplateFilters';
import '../components/PartyTemplates.css';
import '../pages/Party.css';

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
  const { pick } = useLanguage();
  const { user } = useAuth();

  const [currentTab, setCurrentTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const debouncedSearch = useDebounce(searchQuery, 500);

  const loadTemplates = useCallback(() => {
    let ignore = false;
    setLoading(true);
    setFetchError(null);

    fetchPartyTemplates({
      tab: currentTab,
      mode: filterMode,
      search: debouncedSearch,
      userId: user?.id,
    })
      .then((data) => {
        if (!ignore) setTemplates(data);
      })
      .catch((err) => {
        if (!ignore) {
          setFetchError(err?.message || 'Failed to load templates');
          setTemplates([]);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [currentTab, filterMode, debouncedSearch, user?.id]);

  useEffect(() => {
    const cleanup = loadTemplates();
    return cleanup;
  }, [loadTemplates]);

  // Client-side filter for search (instant feel while server catches up)
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter((tpl) =>
      tpl.name.toLowerCase().includes(q) ||
      (tpl.description || '').toLowerCase().includes(q) ||
      (tpl.tags || []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [templates, searchQuery]);

  return (
    <div className="party-page is-hub">
      <div className="party-templates-page">
        <header className="party-templates-header">
          <div>
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
          onTabChange={setCurrentTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
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
        ) : filteredTemplates.length > 0 ? (
          <div className="party-template-grid">
            {filteredTemplates.map((template) => (
              <PartyTemplateCard
                key={template.id}
                template={template}
                pick={pick}
                onClick={() => navigate(`/party/templates/${template.id}`)}
              />
            ))}
          </div>
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
