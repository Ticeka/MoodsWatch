import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Layout, RefreshCw, PlusSquare, ListOrdered, Settings } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  buildHomepageBlockPayload,
  HOMEPAGE_BLOCK_SELECT,
  mapHomepageBlock,
} from '@/shared/lib/editorial';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const EMPTY_FORM = {
  blockKey: '',
  title: '',
  subtitle: '',
  blockType: 'collection',
  status: 'draft',
  visibility: 'public',
  position: 0,
  collectionId: '',
  startsAt: '',
  endsAt: '',
  ctaLabel: '',
  ctaHref: '',
  maxItems: 12,
  accent: '',
  emptyState: '',
};

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function mapForm(block) {
  const config = block.config || {};
  return {
    blockKey: block.blockKey || '',
    title: block.title || '',
    subtitle: block.subtitle || '',
    blockType: block.blockType || 'collection',
    status: block.status || 'draft',
    visibility: block.visibility || 'public',
    position: block.position ?? 0,
    collectionId: block.collectionId ? String(block.collectionId) : '',
    startsAt: formatDateTimeLocal(block.startsAt),
    endsAt: formatDateTimeLocal(block.endsAt),
    ctaLabel: config.ctaLabel || '',
    ctaHref: config.ctaHref || '',
    maxItems: config.maxItems ?? 12,
    accent: config.accent || '',
    emptyState: config.emptyState || '',
  };
}

export function AdminHomepage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [blocks, setBlocks] = useState([]);
  const [collections, setCollections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedId) || null,
    [blocks, selectedId]
  );

  const fetchData = useCallback(async () => {
    if (!supabase) {
      const message = 'Unable to connect to Supabase';
      setErrorMessage(message);
      toast.error(message);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const [blocksRes, collectionsRes] = await Promise.all([
        supabase.from('homepage_content_blocks').select(HOMEPAGE_BLOCK_SELECT).order('position', { ascending: true }),
        supabase.from('editor_collections').select('id, slug, name, status, visibility').order('updated_at', { ascending: false }),
      ]);

      if (blocksRes.error) throw blocksRes.error;
      if (collectionsRes.error) throw collectionsRes.error;

      const nextBlocks = (blocksRes.data || []).map(mapHomepageBlock);
      setBlocks(nextBlocks);
      setCollections(collectionsRes.data || []);

      if (nextBlocks.length > 0) {
        const initial = selectedId && nextBlocks.some((item) => item.id === selectedId)
          ? nextBlocks.find((item) => item.id === selectedId)
          : nextBlocks[0];
        setSelectedId(initial.id);
        setForm(mapForm(initial));
      } else {
        setSelectedId(null);
        setForm(EMPTY_FORM);
      }
    } catch (error) {
      console.error('Failed to load homepage blocks', error);
      setErrorMessage(error.message || 'Failed to load homepage blocks');
      toast.error(error.message || 'Failed to load homepage blocks');
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFormChange = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSelect = (block) => {
    setSelectedId(block.id);
    setForm(mapForm(block));
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    const payload = buildHomepageBlockPayload({
      ...form,
      config: {
        ctaLabel: form.ctaLabel.trim() || undefined,
        ctaHref: form.ctaHref.trim() || undefined,
        maxItems: Number(form.maxItems) || 12,
        accent: form.accent.trim() || undefined,
        emptyState: form.emptyState.trim() || undefined,
      },
    }, user?.id);

    if (!payload.block_key || !payload.title) {
      toast.error('Block key and title are required');
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(selectedId ? 'Saving block...' : 'Creating block...');
    try {
      if (selectedId) {
        const { error } = await supabase.from('homepage_content_blocks').update(payload).eq('id', selectedId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('homepage_content_blocks').insert({
          ...payload,
          created_by: user?.id || null,
        });
        if (error) throw error;
      }

      toast.success('Homepage block saved', { id: toastId });
      await fetchData();
    } catch (error) {
      console.error('Failed to save homepage block', error);
      toast.error(error.message || 'Failed to save homepage block', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (block) => {
    if (!supabase) return;
    if (!window.confirm(`Delete block "${block.title}"?`)) return;

    const toastId = toast.loading('Deleting block...');
    try {
      const { error } = await supabase.from('homepage_content_blocks').delete().eq('id', block.id);
      if (error) throw error;
      toast.success('Block deleted', { id: toastId });
      await fetchData();
    } catch (error) {
      console.error('Failed to delete block', error);
      toast.error(error.message || 'Failed to delete block', { id: toastId });
    }
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Layout size={30} color="var(--primary-500)" />
            {t('admin.homepage.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.homepage.pageSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="action-btn" onClick={fetchData} type="button">
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            {t('admin.common.refresh')}
          </button>
          <button className="primary-btn" onClick={handleCreateNew} type="button">
            <PlusSquare size={18} />
            {t('admin.homepage.newBlock')}
          </button>
        </div>
      </div>

      <div className="admin-split-layout">
        <section className="glass-panel">
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ListOrdered size={20} color="var(--primary-500)" />
                {t('admin.homepage.listTitle')}
              </h2>
              <p>{t('admin.homepage.listCount', { count: blocks.length })}</p>
            </div>
          </div>

          {isLoading ? (
            <AdminStatePanel title={t('admin.homepage.loadingTitle')} description={t('admin.homepage.loadingHint')} />
          ) : errorMessage ? (
            <AdminStatePanel title={t('admin.homepage.errorTitle')} description={errorMessage} actionLabel="Retry" onAction={fetchData} tone="error" />
          ) : blocks.length === 0 ? (
            <AdminStatePanel title={t('admin.homepage.noBlocks')} description={t('admin.homepage.noBlocksHint')} />
          ) : (
            <div className="admin-list-stack">
              {blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`admin-record-card ${selectedId === block.id ? 'active' : ''}`}
                  onClick={() => handleSelect(block)}
                >
                  <div className="admin-record-main">
                    <strong>{block.title}</strong>
                    <span>{block.blockKey}</span>
                  </div>
                  <div className="admin-record-meta">
                    <span className="badge badge-user">#{block.position}</span>
                    <span>{block.blockType}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <form className="glass-panel" onSubmit={handleSave}>
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Settings size={20} color="var(--primary-500)" />
                {selectedId ? t('admin.homepage.editTitle') : t('admin.homepage.createTitle')}
              </h2>
              <p>{t('admin.homepage.createHint')}</p>
            </div>
            {selectedBlock && (
              <button className="action-btn" type="button" onClick={() => handleDelete(selectedBlock)}>
                {t('admin.common.delete')}
              </button>
            )}
          </div>

          <div className="admin-form-grid">
            <label>
              <span className="form-label">{t('admin.homepage.fieldTitle')}</span>
              <input className="form-input" value={form.title} onChange={handleFormChange('title')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldKey')}</span>
              <input className="form-input" value={form.blockKey} onChange={handleFormChange('blockKey')} placeholder="hero-main" />
            </label>
            <label className="admin-form-grid-wide">
              <span className="form-label">{t('admin.homepage.fieldSubtitle')}</span>
              <textarea className="form-input" value={form.subtitle} onChange={handleFormChange('subtitle')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldType')}</span>
              <select className="form-select" value={form.blockType} onChange={handleFormChange('blockType')}>
                <option value="hero">{t('admin.homepage.typeHero')}</option>
                <option value="collection">{t('admin.homepage.typeCollection')}</option>
                <option value="manual_list">{t('admin.homepage.typeManualList')}</option>
                <option value="recommendation">{t('admin.homepage.typeRecommendation')}</option>
                <option value="continue">{t('admin.homepage.typeContinue')}</option>
                <option value="trending">{t('admin.homepage.typeTrending')}</option>
              </select>
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldCollection')}</span>
              <select className="form-select" value={form.collectionId} onChange={handleFormChange('collectionId')}>
                <option value="">{t('admin.homepage.noCollection')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name} ({collection.status})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldStatus')}</span>
              <select className="form-select" value={form.status} onChange={handleFormChange('status')}>
                <option value="draft">{t('admin.homepage.statusDraft')}</option>
                <option value="published">{t('admin.homepage.statusPublished')}</option>
                <option value="archived">{t('admin.homepage.statusArchived')}</option>
              </select>
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldVisibility')}</span>
              <select className="form-select" value={form.visibility} onChange={handleFormChange('visibility')}>
                <option value="public">{t('admin.homepage.visibilityPublic')}</option>
                <option value="private">{t('admin.homepage.visibilityPrivate')}</option>
                <option value="unlisted">{t('admin.homepage.visibilityUnlisted')}</option>
              </select>
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldPosition')}</span>
              <input className="form-input" type="number" min="0" value={form.position} onChange={handleFormChange('position')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldMaxItems')}</span>
              <input className="form-input" type="number" min="1" max="50" value={form.maxItems} onChange={handleFormChange('maxItems')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldCtaLabel')}</span>
              <input className="form-input" value={form.ctaLabel} onChange={handleFormChange('ctaLabel')} placeholder="See all" />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldCtaHref')}</span>
              <input className="form-input" value={form.ctaHref} onChange={handleFormChange('ctaHref')} placeholder="/discover" />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldAccent')}</span>
              <input className="form-input" value={form.accent} onChange={handleFormChange('accent')} placeholder="sunrise" />
            </label>
            <label className="admin-form-grid-wide">
              <span className="form-label">{t('admin.homepage.fieldEmptyState')}</span>
              <input className="form-input" value={form.emptyState} onChange={handleFormChange('emptyState')} placeholder="No titles available right now." />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldStartsAt')}</span>
              <input className="form-input" type="datetime-local" value={form.startsAt} onChange={handleFormChange('startsAt')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldEndsAt')}</span>
              <input className="form-input" type="datetime-local" value={form.endsAt} onChange={handleFormChange('endsAt')} />
            </label>
          </div>

          <div className="admin-preview-card">
            <span className="badge badge-editor">{form.blockType}</span>
            <h3>{form.title || t('admin.homepage.untitledBlock')}</h3>
            <p>{form.subtitle || 'Subtitle preview will appear here.'}</p>
            <div className="admin-preview-meta">
              <span>Position #{form.position || 0}</span>
              <span>{form.collectionId ? t('admin.homepage.collectionLinked') : t('admin.homepage.standaloneBlock')}</span>
              <span>{form.ctaLabel ? `CTA: ${form.ctaLabel}` : t('admin.homepage.noCta')}</span>
            </div>
          </div>

          <div className="admin-form-actions">
            <button className="primary-btn" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : selectedId ? t('admin.homepage.saveChanges') : t('admin.homepage.createTitle')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminHomepage;
