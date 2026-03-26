import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Library, RefreshCw, FolderPlus, Columns, Settings, ListPlus } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { mapEditorCollection, EDITOR_COLLECTION_SELECT, buildCollectionPayload } from '@/shared/lib/editorial';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const EMPTY_FORM = {
  slug: '',
  name: '',
  description: '',
  coverImage: '',
  badgeLabel: '',
  collectionType: 'manual',
  sortMode: 'manual',
  status: 'draft',
  visibility: 'public',
  itemLimit: 12,
  isFeatured: false,
  startsAt: '',
  endsAt: '',
};

function formatDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function mapForm(collection) {
  return {
    slug: collection.slug || '',
    name: collection.name || '',
    description: collection.description || '',
    coverImage: collection.coverImage || '',
    badgeLabel: collection.badgeLabel || '',
    collectionType: collection.collectionType || 'manual',
    sortMode: collection.sortMode || 'manual',
    status: collection.status || 'draft',
    visibility: collection.visibility || 'public',
    itemLimit: collection.itemLimit ?? 12,
    isFeatured: Boolean(collection.isFeatured),
    startsAt: formatDateTimeLocal(collection.startsAt),
    endsAt: formatDateTimeLocal(collection.endsAt),
  };
}

function titleLabel(title) {
  return `${title.name} (${title.type})`;
}

export function AdminCollections() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [collections, setCollections] = useState([]);
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemDraft, setItemDraft] = useState({ titleId: '', position: 0, note: '' });

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedId) || null,
    [collections, selectedId]
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
      const [collectionsRes, titlesRes] = await Promise.all([
        supabase
          .from('editor_collections')
          .select(EDITOR_COLLECTION_SELECT)
          .order('updated_at', { ascending: false }),
        supabase
          .from('canonical_titles')
          .select('id, canonical_title, type, subtype, aliases:aliases_cache')
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(200),
      ]);

      if (collectionsRes.error) throw collectionsRes.error;
      if (titlesRes.error) throw titlesRes.error;

      const nextCollections = (collectionsRes.data || []).map(mapEditorCollection);
      const nextTitles = (titlesRes.data || []).map((record) => ({
        id: record.id,
        name:
          record.aliases?.find((alias) => alias.alias_type === 'english' || alias.language_code === 'en')?.alias ||
          record.canonical_title,
        type: record.subtype === 'manhwa' ? 'manhwa' : record.type,
      }));

      setCollections(nextCollections);
      setTitles(nextTitles);
      if (nextCollections.length > 0) {
        const initial = selectedId && nextCollections.some((item) => item.id === selectedId)
          ? nextCollections.find((item) => item.id === selectedId)
          : nextCollections[0];
        setSelectedId(initial.id);
        setForm(mapForm(initial));
      } else {
        setSelectedId(null);
        setForm(EMPTY_FORM);
      }
    } catch (error) {
      console.error('Failed to load collections', error);
      setErrorMessage(error.message || 'Failed to load collections');
      toast.error(error.message || 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelect = (collection) => {
    setSelectedId(collection.id);
    setForm(mapForm(collection));
    setItemDraft({ titleId: '', position: collection.items.length, note: '' });
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setItemDraft({ titleId: '', position: 0, note: '' });
  };

  const handleFormChange = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    const payload = buildCollectionPayload(form, user?.id);
    if (!payload.slug || !payload.name) {
      toast.error(t('admin.collections.slugRequired'));
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(selectedId ? 'Saving collection...' : 'Creating collection...');
    try {
      if (selectedId) {
        const { error } = await supabase.from('editor_collections').update(payload).eq('id', selectedId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('editor_collections').insert({
          ...payload,
          created_by: user?.id || null,
        });
        if (error) throw error;
      }

      toast.success(t('admin.collections.saved'), { id: toastId });
      await fetchData();
    } catch (error) {
      console.error('Failed to save collection', error);
      toast.error(error.message || 'Failed to save collection', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (collection) => {
    if (!supabase) return;
    if (!window.confirm(`Delete "${collection.name}"?`)) return;

    const toastId = toast.loading('Deleting collection...');
    try {
      const { error } = await supabase.from('editor_collections').delete().eq('id', collection.id);
      if (error) throw error;

      toast.success(t('admin.collections.deleted'), { id: toastId });
      await fetchData();
    } catch (error) {
      console.error('Failed to delete collection', error);
      toast.error(error.message || 'Failed to delete collection', { id: toastId });
    }
  };

  const handleAddItem = async (event) => {
    event.preventDefault();
    if (!supabase || !selectedCollection || !itemDraft.titleId) {
      return;
    }

    const toastId = toast.loading('Adding title...');
    try {
      const { error } = await supabase.from('editor_collection_items').insert({
        collection_id: selectedCollection.id,
        title_id: Number(itemDraft.titleId),
        position: Number(itemDraft.position) || 0,
        note: itemDraft.note.trim() || null,
      });
      if (error) throw error;

      toast.success(t('admin.collections.itemAdded'), { id: toastId });
      setItemDraft({ titleId: '', position: selectedCollection.items.length + 1, note: '' });
      await fetchData();
    } catch (error) {
      console.error('Failed to add item', error);
      toast.error(error.message || 'Failed to add item', { id: toastId });
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!supabase) return;
    const toastId = toast.loading('Removing title...');
    try {
      const { error } = await supabase.from('editor_collection_items').delete().eq('id', itemId);
      if (error) throw error;
      toast.success(t('admin.collections.itemRemoved'), { id: toastId });
      await fetchData();
    } catch (error) {
      console.error('Failed to remove item', error);
      toast.error(error.message || 'Failed to remove item', { id: toastId });
    }
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Library size={30} color="var(--primary-500)" />
            {t('admin.collections.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.collections.pageSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="action-btn" onClick={fetchData} type="button">
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            {t('admin.common.refresh')}
          </button>
          <button className="primary-btn" onClick={handleCreateNew} type="button">
            <FolderPlus size={18} />
            {t('admin.collections.newCollection')}
          </button>
        </div>
      </div>

      <div className="admin-split-layout">
        <section className="glass-panel">
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Columns size={20} color="var(--primary-500)" />
                {t('admin.collections.listTitle')}
              </h2>
              <p>{t('admin.collections.listCount', { count: collections.length })}</p>
            </div>
          </div>

          {isLoading ? (
            <AdminStatePanel title={t('admin.collections.loadingTitle')} description={t('admin.collections.loadingHint')} />
          ) : errorMessage ? (
            <AdminStatePanel title={t('admin.collections.errorTitle')} description={errorMessage} actionLabel="Retry" onAction={fetchData} tone="error" />
          ) : collections.length === 0 ? (
            <AdminStatePanel title={t('admin.collections.noCollections')} description={t('admin.collections.noCollectionsHint')} />
          ) : (
            <div className="admin-list-stack">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={`admin-record-card ${selectedId === collection.id ? 'active' : ''}`}
                  onClick={() => handleSelect(collection)}
                >
                  <div className="admin-record-main">
                    <strong>{collection.name}</strong>
                    <span>{collection.slug}</span>
                  </div>
                  <div className="admin-record-meta">
                    <span className="badge badge-user">{collection.status}</span>
                    <span>{collection.items.length} items</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-form-container">
          <form className="glass-panel" onSubmit={handleSave}>
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Settings size={20} color="var(--primary-500)" />
                  {selectedId ? t('admin.collections.editTitle') : t('admin.collections.createTitle')}
                </h2>
                <p>{t('admin.collections.createHint')}</p>
              </div>
              {selectedCollection && (
                <button className="action-btn" type="button" onClick={() => handleDelete(selectedCollection)}>
                  {t('admin.common.delete')}
                </button>
              )}
            </div>

            <div className="admin-form-grid">
              <label>
                <span className="form-label">{t('admin.collections.fieldName')}</span>
                <input className="form-input" value={form.name} onChange={handleFormChange('name')} />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldSlug')}</span>
                <input className="form-input" value={form.slug} onChange={handleFormChange('slug')} />
              </label>
              <label className="admin-form-grid-wide">
                <span className="form-label">{t('admin.collections.fieldDescription')}</span>
                <textarea className="form-input" value={form.description} onChange={handleFormChange('description')} />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldBadge')}</span>
                <input className="form-input" value={form.badgeLabel} onChange={handleFormChange('badgeLabel')} placeholder={t('admin.collections.fieldBadgePlaceholder')} />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldCover')}</span>
                <input className="form-input" value={form.coverImage} onChange={handleFormChange('coverImage')} placeholder="https://..." />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldType')}</span>
                <select className="form-select" value={form.collectionType} onChange={handleFormChange('collectionType')}>
                  <option value="manual">{t('admin.collections.typeManual')}</option>
                  <option value="dynamic">{t('admin.collections.typeDynamic')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldSortMode')}</span>
                <select className="form-select" value={form.sortMode} onChange={handleFormChange('sortMode')}>
                  <option value="manual">{t('admin.collections.sortManual')}</option>
                  <option value="popularity">{t('admin.collections.sortPopularity')}</option>
                  <option value="score">{t('admin.collections.sortScore')}</option>
                  <option value="recent">{t('admin.collections.sortRecent')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldStatus')}</span>
                <select className="form-select" value={form.status} onChange={handleFormChange('status')}>
                  <option value="draft">{t('admin.collections.statusDraft')}</option>
                  <option value="published">{t('admin.collections.statusPublished')}</option>
                  <option value="archived">{t('admin.collections.statusArchived')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldVisibility')}</span>
                <select className="form-select" value={form.visibility} onChange={handleFormChange('visibility')}>
                  <option value="public">{t('admin.collections.visibilityPublic')}</option>
                  <option value="private">{t('admin.collections.visibilityPrivate')}</option>
                  <option value="unlisted">{t('admin.collections.visibilityUnlisted')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldItemLimit')}</span>
                <input className="form-input" type="number" min="1" max="100" value={form.itemLimit} onChange={handleFormChange('itemLimit')} />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldStartsAt')}</span>
                <input className="form-input" type="datetime-local" value={form.startsAt} onChange={handleFormChange('startsAt')} />
              </label>
              <label>
                <span className="form-label">{t('admin.collections.fieldEndsAt')}</span>
                <input className="form-input" type="datetime-local" value={form.endsAt} onChange={handleFormChange('endsAt')} />
              </label>
            </div>

            <label className="admin-checkbox-row">
              <input type="checkbox" checked={form.isFeatured} onChange={handleFormChange('isFeatured')} />
              <span>{t('admin.collections.isFeatured')}</span>
            </label>

            <div className="admin-form-actions">
              <button className="primary-btn" type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : selectedId ? t('admin.collections.saveChanges') : t('admin.collections.createTitle')}
              </button>
            </div>
          </form>

          <section className="glass-panel">
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <ListPlus size={20} color="var(--primary-500)" />
                  {t('admin.collections.itemsTitle')}
                </h2>
                <p>{selectedCollection ? t('admin.collections.itemsCount', { count: selectedCollection.items.length }) : t('admin.collections.itemsSelectFirst')}</p>
              </div>
            </div>

            {!selectedCollection ? (
              <AdminStatePanel title="No collection selected" description="Create or select a collection to manage its titles." />
            ) : (
              <>
                <form className="admin-inline-form" onSubmit={handleAddItem}>
                  <label className="admin-inline-form-grow">
                    <span className="form-label">{t('admin.collections.fieldTitleSelect')}</span>
                    <select
                      className="form-select"
                      value={itemDraft.titleId}
                      onChange={(event) => setItemDraft((current) => ({ ...current, titleId: event.target.value }))}
                    >
                      <option value="">{t('admin.common.selectTitle')}</option>
                      {titles.map((title) => (
                        <option key={title.id} value={title.id}>{titleLabel(title)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="form-label">{t('admin.collections.fieldPosition')}</span>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      value={itemDraft.position}
                      onChange={(event) => setItemDraft((current) => ({ ...current, position: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className="form-label">{t('admin.collections.fieldNote')}</span>
                    <input
                      className="form-input"
                      value={itemDraft.note}
                      onChange={(event) => setItemDraft((current) => ({ ...current, note: event.target.value }))}
                      placeholder={t('admin.collections.notePlaceholder')}
                    />
                  </label>
                  <button className="primary-btn" type="submit">{t('admin.common.add')}</button>
                </form>

                {selectedCollection.items.length === 0 ? (
                  <AdminStatePanel title={t('admin.collections.noItems')} description={t('admin.collections.noItemsHint')} />
                ) : (
                  <div className="admin-table-container" style={{ marginTop: 'var(--space-4)' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>{t('admin.collections.colPosition')}</th>
                          <th>{t('admin.collections.colTitle')}</th>
                          <th>{t('admin.collections.colType')}</th>
                          <th>{t('admin.collections.colNote')}</th>
                          <th style={{ textAlign: 'right' }}>{t('admin.collections.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCollection.items.map((item) => (
                          <tr key={item.id}>
                            <td>{item.position}</td>
                            <td>{item.title.name}</td>
                            <td>{item.title.type}</td>
                            <td>{item.note || '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="action-btn" type="button" onClick={() => handleRemoveItem(item.id)}>{t('admin.common.remove')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}

export default AdminCollections;
