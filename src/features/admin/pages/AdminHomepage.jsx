import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Layout, RefreshCw, PlusSquare, ListOrdered, Settings } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  buildHomepageBlockPayload,
} from '@/shared/lib/editorial';
import {
  deleteHomepageBlock,
  fetchHomepageAdminCollections,
  fetchHomepageBlockDetail,
  fetchHomepageBlockSummaries,
  saveHomepageBlock,
} from '@/features/admin/api/homepageAdminApi';
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
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const blocksQuery = useQuery({
    queryKey: ['admin-homepage-block-summaries'],
    queryFn: fetchHomepageBlockSummaries,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const collectionsQuery = useQuery({
    queryKey: ['admin-homepage-collections'],
    queryFn: fetchHomepageAdminCollections,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const blocks = useMemo(() => blocksQuery.data || [], [blocksQuery.data]);
  const collections = useMemo(() => collectionsQuery.data || [], [collectionsQuery.data]);

  const selectedBlockQuery = useQuery({
    queryKey: ['admin-homepage-block-detail', selectedId || null],
    queryFn: () => fetchHomepageBlockDetail(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const selectedBlock = useMemo(
    () => selectedBlockQuery.data || blocks.find((block) => block.id === selectedId) || null,
    [blocks, selectedBlockQuery.data, selectedId]
  );

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage('');
      const [blocksResult, collectionsResult, selectedResult] = await Promise.all([
        blocksQuery.refetch(),
        collectionsQuery.refetch(),
        selectedId ? selectedBlockQuery.refetch() : Promise.resolve({ error: null }),
      ]);

      if (blocksResult.error) throw blocksResult.error;
      if (collectionsResult.error) throw collectionsResult.error;
      if (selectedResult?.error) throw selectedResult.error;
    } catch (error) {
      console.error('Failed to load homepage blocks', error);
      const message = error.message || t('admin.homepage.loadFailed');
      setErrorMessage(message);
      toast.error(message);
    }
  }, [blocksQuery, collectionsQuery, selectedBlockQuery, selectedId, t]);

  useEffect(() => {
    if (!blocks.length) {
      setSelectedId(null);
      setForm(EMPTY_FORM);
      return;
    }

    if (!selectedId || !blocks.some((block) => block.id === selectedId)) {
      setSelectedId(blocks[0].id);
    }
  }, [blocks, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (selectedBlockQuery.data) {
      setForm(mapForm(selectedBlockQuery.data));
    }
  }, [selectedBlockQuery.data, selectedId]);

  useEffect(() => {
    const nextMessage =
      blocksQuery.error?.message
      || collectionsQuery.error?.message
      || selectedBlockQuery.error?.message
      || '';

    if (!nextMessage) return;

    setErrorMessage(nextMessage);
    toast.error(nextMessage);
  }, [blocksQuery.error, collectionsQuery.error, selectedBlockQuery.error]);

  const handleFormChange = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSelect = (block) => {
    setSelectedId(block.id);
    setForm(EMPTY_FORM);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (event) => {
    event.preventDefault();

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
      toast.error(t('admin.homepage.blockKeyTitleRequired'));
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(selectedId ? t('admin.homepage.savingBlock') : t('admin.homepage.creatingBlock'));
    try {
      const savedId = await saveHomepageBlock(selectedId, payload, user?.id || null);
      await queryClient.invalidateQueries({ queryKey: ['admin-homepage-block-summaries'] });
      if (savedId) {
        await queryClient.invalidateQueries({ queryKey: ['admin-homepage-block-detail', savedId] });
        setSelectedId(savedId);
      }
      toast.success(t('admin.homepage.blockSaved'), { id: toastId });
    } catch (error) {
      console.error('Failed to save homepage block', error);
      toast.error(error.message || t('admin.homepage.saveFailed'), { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (block) => {
    if (!window.confirm(t('admin.homepage.confirmDelete', { title: block.title }))) return;

    const toastId = toast.loading(t('admin.homepage.deletingBlock'));
    try {
      await deleteHomepageBlock(block.id);
      await queryClient.invalidateQueries({ queryKey: ['admin-homepage-block-summaries'] });
      await queryClient.removeQueries({ queryKey: ['admin-homepage-block-detail', block.id] });
      if (selectedId === block.id) {
        setSelectedId(null);
        setForm(EMPTY_FORM);
      }
      toast.success(t('admin.homepage.blockDeleted'), { id: toastId });
    } catch (error) {
      console.error('Failed to delete block', error);
      toast.error(error.message || t('admin.homepage.deleteFailed'), { id: toastId });
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

          {blocksQuery.isLoading ? (
            <AdminStatePanel title={t('admin.homepage.loadingTitle')} description={t('admin.homepage.loadingHint')} />
          ) : errorMessage ? (
            <AdminStatePanel title={t('admin.homepage.errorTitle')} description={errorMessage} actionLabel={t('common.retry')} onAction={fetchData} tone="error" />
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

          {selectedId && selectedBlockQuery.isLoading ? (
            <AdminStatePanel title={t('admin.homepage.loadingTitle')} description={t('admin.homepage.loadingHint')} />
          ) : (
            <>
          <div className="admin-form-grid">
            <label>
              <span className="form-label">{t('admin.homepage.fieldTitle')}</span>
              <input className="form-input" value={form.title} onChange={handleFormChange('title')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldKey')}</span>
              <input className="form-input" value={form.blockKey} onChange={handleFormChange('blockKey')} placeholder={t('admin.homepage.fieldKeyPlaceholder')} />
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
              <select
                className="form-select"
                value={form.collectionId}
                onChange={handleFormChange('collectionId')}
                disabled={collectionsQuery.isLoading}
              >
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
              <input className="form-input" value={form.ctaLabel} onChange={handleFormChange('ctaLabel')} placeholder={t('admin.homepage.fieldCtaLabelPlaceholder')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldCtaHref')}</span>
              <input className="form-input" value={form.ctaHref} onChange={handleFormChange('ctaHref')} placeholder={t('admin.homepage.fieldCtaHrefPlaceholder')} />
            </label>
            <label>
              <span className="form-label">{t('admin.homepage.fieldAccent')}</span>
              <input className="form-input" value={form.accent} onChange={handleFormChange('accent')} placeholder={t('admin.homepage.fieldAccentPlaceholder')} />
            </label>
            <label className="admin-form-grid-wide">
              <span className="form-label">{t('admin.homepage.fieldEmptyState')}</span>
              <input className="form-input" value={form.emptyState} onChange={handleFormChange('emptyState')} placeholder={t('admin.homepage.fieldEmptyStatePlaceholder')} />
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
            <p>{form.subtitle || t('admin.homepage.subtitlePreviewFallback')}</p>
            <div className="admin-preview-meta">
              <span>{t('admin.homepage.positionPreview', { position: form.position || 0 })}</span>
              <span>{form.collectionId ? t('admin.homepage.collectionLinked') : t('admin.homepage.standaloneBlock')}</span>
              <span>{form.ctaLabel ? t('admin.homepage.ctaPreview', { label: form.ctaLabel }) : t('admin.homepage.noCta')}</span>
            </div>
          </div>

            <div className="admin-form-actions">
              <button className="primary-btn" type="submit" disabled={isSaving}>
                {isSaving ? t('admin.common.saving') : selectedId ? t('admin.homepage.saveChanges') : t('admin.homepage.createTitle')}
              </button>
            </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default AdminHomepage;
