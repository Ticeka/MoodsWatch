import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Pencil, Plus, Trash2, X, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const PLATFORM_OPTIONS = [
  'Netflix', 'Bilibili', 'iQIYI', 'Crunchyroll', 'Disney+', 'YouTube',
  'Ani-One', 'Muse Thailand', 'MANGA Plus', 'WEBTOON', 'Kakao Webtoon',
  'Tapas', 'Tappytoon', 'Lezhin Comics', 'Comikey', 'Pocket Comics',
  'Toomics', 'Viz', 'Shonen Jump', 'Line Webtoon', 'Community Scan',
  'Fan Translation', 'Mirror Site', 'Reading Portal', 'Other',
];

const PAGE_SIZE = 30;
const EMPTY_ADD_FORM = { titleSearch: '', titleId: '', platform_name: '', url: '', region_code: '' };
const EMPTY_QUICK_FORM = { platform_name: '', url: '', region_code: '' };

function TitleSearchDropdown({ value, titleId, suggestions, onChange, onSelect, onClear, t }) {
  if (titleId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ flex: 1, fontSize: '0.85rem', padding: '0.5rem', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
          {value}
        </span>
        <button type="button" className="action-btn" style={{ color: 'var(--error)', flexShrink: 0 }} onClick={onClear} aria-label={t('admin.links.clearSelectedTitle')}>
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" placeholder={t('admin.links.searchTitlePlaceholder')} value={value} onChange={onChange} />
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: 'var(--surface-1)', border: '1px solid var(--border-default)',
          borderRadius: '10px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: '4px',
        }}>
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.85rem', color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              onMouseOver={(event) => { event.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseOut={(event) => { event.currentTarget.style.background = 'none'; }}
              onClick={() => onSelect(item)}
            >
              <div style={{ fontWeight: 600 }}>{item.canonical_title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAddRow({ title, onAdded, t }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_QUICK_FORM);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.platform_name || !form.url) {
      toast.error(t('admin.links.platformUrlRequired'));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('title_availability').insert({
        canonical_title_id: title.id,
        platform_name: form.platform_name,
        url: form.url,
        region_code: form.region_code || null,
        is_official: true,
      });
      if (error) throw error;
      toast.success(t('admin.links.linkAddedForTitle', { title: title.canonical_title }));
      setForm(EMPTY_QUICK_FORM);
      setOpen(false);
      onAdded(title.id);
    } catch (error) {
      toast.error(error.message || t('admin.links.addFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr>
        <td>
          <div className="admin-title-cell">
            <Link to={`/titles/${title.slug}`} target="_blank" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}>
              {title.canonical_title}
            </Link>
          </div>
        </td>
        <td>
          <span className={`badge badge-${title.subtype || title.type}`}>{title.subtype || title.type}</span>
        </td>
        <td style={{ textAlign: 'right' }}>
          <button
            type="button"
            className="action-btn"
            style={{ color: open ? 'var(--accent-primary)' : undefined }}
            onClick={() => setOpen((value) => !value)}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            {t('admin.links.addLink')}
            <ChevronDown size={12} style={{ marginLeft: '4px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        </td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--surface-2)' }}>
          <td colSpan={3} style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ flex: '0 0 160px', fontSize: '0.82rem' }}
                value={form.platform_name}
                onChange={(event) => setForm((current) => ({ ...current, platform_name: event.target.value }))}
              >
                <option value="">{t('admin.links.selectPlatform')}</option>
                {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <input
                className="form-input"
                style={{ flex: '1 1 200px', fontSize: '0.82rem' }}
                placeholder={t('admin.links.urlPlaceholder')}
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              />
              <input
                className="form-input"
                style={{ flex: '0 0 90px', fontSize: '0.82rem' }}
                placeholder={t('admin.links.region')}
                value={form.region_code}
                onChange={(event) => setForm((current) => ({ ...current, region_code: event.target.value.toUpperCase() }))}
              />
              <button type="button" className="primary-btn" style={{ fontSize: '0.82rem', padding: '0 12px', height: '36px' }} onClick={save} disabled={saving}>
                {saving ? t('admin.common.saving') : t('admin.common.save')}
              </button>
              <button type="button" className="action-btn" onClick={() => setOpen(false)}>{t('admin.common.cancel')}</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminLinks() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('links');

  const [links, setLinks] = useState([]);
  const [linksTotal, setLinksTotal] = useState(0);
  const [linksLoading, setLinksLoading] = useState(true);
  const [linksPage, setLinksPage] = useState(1);
  const [searchTitle, setSearchTitle] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ platform_name: '', url: '', region_code: '' });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [noLinkTitles, setNoLinkTitles] = useState([]);
  const [noLinkTotal, setNoLinkTotal] = useState(0);
  const [noLinkLoading, setNoLinkLoading] = useState(false);
  const [noLinkPage, setNoLinkPage] = useState(1);
  const [noLinkSearch, setNoLinkSearch] = useState('');
  const [noLinkType, setNoLinkType] = useState('all');

  const linksTotalPages = Math.max(1, Math.ceil(linksTotal / PAGE_SIZE));
  const noLinkTotalPages = Math.max(1, Math.ceil(noLinkTotal / PAGE_SIZE));

  const fetchLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      let titleIdFilter = null;
      if (searchTitle.trim()) {
        const { data: matched } = await supabase
          .from('canonical_titles')
          .select('id')
          .ilike('canonical_title', `%${searchTitle.trim()}%`);
        titleIdFilter = (matched || []).map((item) => item.id);
        if (titleIdFilter.length === 0) {
          setLinks([]);
          setLinksTotal(0);
          setLinksLoading(false);
          return;
        }
      }

      let query = supabase
        .from('title_availability')
        .select('id, platform_name, url, region_code, is_official, canonical_title_id', { count: 'exact' })
        .order('platform_name', { ascending: true });

      if (filterPlatform !== 'all') query = query.eq('platform_name', filterPlatform);
      if (titleIdFilter !== null) query = query.in('canonical_title_id', titleIdFilter);

      const from = (linksPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      const uniqueIds = [...new Set((data || []).map((row) => row.canonical_title_id))];
      let titlesMap = {};
      if (uniqueIds.length > 0) {
        const { data: titleData } = await supabase.from('canonical_titles').select('id, canonical_title, slug, type').in('id', uniqueIds);
        titlesMap = Object.fromEntries((titleData || []).map((item) => [item.id, item]));
      }

      setLinks((data || []).map((row) => ({ ...row, canonical_titles: titlesMap[row.canonical_title_id] || null })));
      setLinksTotal(count || 0);
    } catch (error) {
      toast.error(error.message || t('admin.links.loadFailed'));
    } finally {
      setLinksLoading(false);
    }
  }, [filterPlatform, linksPage, searchTitle, t]);

  const fetchNoLinks = useCallback(async () => {
    setNoLinkLoading(true);
    try {
      const { data: hasLinks } = await supabase.from('title_availability').select('canonical_title_id');
      const linkedIds = [...new Set((hasLinks || []).map((row) => row.canonical_title_id))];

      let query = supabase
        .from('canonical_titles')
        .select('id, canonical_title, slug, type, subtype', { count: 'exact' })
        .order('canonical_title', { ascending: true });

      if (linkedIds.length > 0) query = query.not('id', 'in', `(${linkedIds.join(',')})`);
      if (noLinkType !== 'all') query = query.eq('subtype', noLinkType);
      if (noLinkSearch.trim()) query = query.ilike('canonical_title', `%${noLinkSearch.trim()}%`);

      const from = (noLinkPage - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      setNoLinkTitles(data || []);
      setNoLinkTotal(count || 0);
    } catch (error) {
      toast.error(error.message || t('admin.links.loadFailed'));
    } finally {
      setNoLinkLoading(false);
    }
  }, [noLinkPage, noLinkSearch, noLinkType, t]);

  useEffect(() => { if (activeTab === 'links') fetchLinks(); }, [activeTab, fetchLinks]);
  useEffect(() => { if (activeTab === 'nolinks') fetchNoLinks(); }, [activeTab, fetchNoLinks]);
  useEffect(() => { setLinksPage(1); }, [filterPlatform, searchTitle]);
  useEffect(() => { setNoLinkPage(1); }, [noLinkSearch, noLinkType]);

  useEffect(() => {
    if (!addForm.titleSearch.trim() || addForm.titleId) {
      setTitleSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('canonical_titles')
        .select('id, canonical_title, slug')
        .ilike('canonical_title', `%${addForm.titleSearch}%`)
        .limit(8);
      setTitleSuggestions(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [addForm.titleId, addForm.titleSearch]);

  const handleDelete = async (link) => {
    if (!window.confirm(t('admin.links.confirmDelete', {
      platform: link.platform_name,
      title: link.canonical_titles?.canonical_title || t('admin.links.unknownTitle'),
    }))) return;
    try {
      const { error } = await supabase.from('title_availability').delete().eq('id', link.id);
      if (error) throw error;
      toast.success(t('admin.links.deleted'));
      fetchLinks();
    } catch (error) {
      toast.error(error.message || t('admin.links.deleteFailed'));
    }
  };

  const handleSaveEdit = async (link) => {
    if (!editForm.platform_name || !editForm.url) {
      toast.error(t('admin.links.platformUrlRequired'));
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('title_availability')
        .update({ platform_name: editForm.platform_name, url: editForm.url, region_code: editForm.region_code || null })
        .eq('id', link.id);
      if (error) throw error;
      toast.success(t('admin.links.saved'));
      setEditingId(null);
      fetchLinks();
    } catch (error) {
      toast.error(error.message || t('admin.links.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!addForm.titleId || !addForm.platform_name || !addForm.url) {
      toast.error(t('admin.links.titlePlatformUrlRequired'));
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from('title_availability').insert({
        canonical_title_id: addForm.titleId,
        platform_name: addForm.platform_name,
        url: addForm.url,
        region_code: addForm.region_code || null,
        is_official: true,
      });
      if (error) throw error;
      toast.success(t('admin.links.added'));
      setShowAddForm(false);
      setAddForm(EMPTY_ADD_FORM);
      fetchLinks();
    } catch (error) {
      toast.error(error.message || t('admin.links.addFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTitleLinked = (titleId) => {
    setNoLinkTitles((current) => current.filter((item) => item.id !== titleId));
    setNoLinkTotal((current) => Math.max(0, current - 1));
  };

  return (
    <div className="admin-page-content">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem' }}>{t('admin.links.pageTitle')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.links.pageSubtitle')}</p>
        </div>
        {activeTab === 'links' && (
          <button type="button" className="primary-btn" onClick={() => { setShowAddForm(true); setAddForm(EMPTY_ADD_FORM); }}>
            <Plus size={16} style={{ marginRight: '6px' }} />{t('admin.links.newLink')}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-default)', paddingBottom: 0 }}>
        {[
          { key: 'links', label: t('admin.links.tabHasLinks', { count: linksTotal }) },
          { key: 'nolinks', label: t('admin.links.tabNoLinks', { count: noLinkTotal }) },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
              background: 'none',
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 700 : 400,
              fontSize: '0.9rem',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'links' && (
        <>
          {showAddForm && (
            <div className="glass-panel" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '1rem', fontWeight: 700 }}>{t('admin.links.newLink')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', alignItems: 'start' }}>
                <div>
                  <span className="form-label">{t('admin.links.title')}</span>
                  <TitleSearchDropdown
                    value={addForm.titleSearch}
                    titleId={addForm.titleId}
                    suggestions={titleSuggestions}
                    onChange={(event) => setAddForm((current) => ({ ...current, titleSearch: event.target.value, titleId: '' }))}
                    onSelect={(item) => { setAddForm((current) => ({ ...current, titleId: item.id, titleSearch: item.canonical_title })); setTitleSuggestions([]); }}
                    onClear={() => setAddForm((current) => ({ ...current, titleId: '', titleSearch: '' }))}
                    t={t}
                  />
                </div>
                <div>
                  <span className="form-label">{t('admin.links.platform')}</span>
                  <select className="form-select" value={addForm.platform_name} onChange={(event) => setAddForm((current) => ({ ...current, platform_name: event.target.value }))}>
                    <option value="">{t('admin.links.selectPlatform')}</option>
                    {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <span className="form-label">{t('admin.links.url')}</span>
                  <input className="form-input" placeholder={t('admin.links.urlPlaceholder')} value={addForm.url} onChange={(event) => setAddForm((current) => ({ ...current, url: event.target.value }))} />
                </div>
                <div>
                  <span className="form-label">{t('admin.links.regionOptional')}</span>
                  <input className="form-input" placeholder={t('admin.links.regionPlaceholder')} value={addForm.region_code} onChange={(event) => setAddForm((current) => ({ ...current, region_code: event.target.value.toUpperCase() }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="primary-btn" onClick={handleAddLink} disabled={isSaving}>{isSaving ? t('admin.common.saving') : t('admin.common.save')}</button>
                <button type="button" className="action-btn" onClick={() => setShowAddForm(false)}>{t('admin.common.cancel')}</button>
              </div>
            </div>
          )}

          <div className="admin-controls glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <label style={{ flex: '1 1 220px' }}>
              <span className="form-label">{t('admin.links.searchTitle')}</span>
              <input className="form-input" placeholder={t('admin.links.searchTitlePlaceholder')} value={searchTitle} onChange={(event) => setSearchTitle(event.target.value)} />
            </label>
            <label style={{ flex: '0 0 180px' }}>
              <span className="form-label">{t('admin.links.platform')}</span>
              <select className="form-select" value={filterPlatform} onChange={(event) => setFilterPlatform(event.target.value)}>
                <option value="all">{t('admin.links.allPlatforms')}</option>
                {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" className="action-btn" onClick={() => { setSearchTitle(''); setFilterPlatform('all'); }}>{t('admin.common.reset')}</button>
          </div>

          <div className="admin-list-toolbar" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="admin-list-summary">
              {linksLoading
                ? t('admin.common.loading')
                : t('admin.links.summaryHasLinks', { total: linksTotal, page: linksPage, pages: linksTotalPages })}
            </span>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.links.title')}</th>
                  <th style={{ width: '150px' }}>{t('admin.links.platform')}</th>
                  <th>{t('admin.links.url')}</th>
                  <th style={{ width: '80px' }}>{t('admin.links.region')}</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>{t('admin.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {linksLoading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>{t('admin.common.loading')}</td></tr>}
                {!linksLoading && links.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>{t('admin.links.noLinks')}</td></tr>}
                {!linksLoading && links.map((link) => {
                  const title = link.canonical_titles;
                  const isEditing = editingId === link.id;
                  return (
                    <tr key={link.id}>
                      <td>
                        <div className="admin-title-cell">
                          <Link to={`/titles/${title?.slug}`} target="_blank" className="admin-title-primary" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                            {title?.canonical_title || t('admin.links.unknownTitle')}
                          </Link>
                        </div>
                      </td>
                      <td>
                        {isEditing
                          ? (
                              <select className="form-select" style={{ fontSize: '0.82rem' }} value={editForm.platform_name} onChange={(event) => setEditForm((current) => ({ ...current, platform_name: event.target.value }))}>
                                {PLATFORM_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            )
                          : <span>{link.platform_name}</span>}
                      </td>
                      <td style={{ maxWidth: '280px' }}>
                        {isEditing
                          ? <input className="form-input" style={{ fontSize: '0.82rem' }} value={editForm.url} onChange={(event) => setEditForm((current) => ({ ...current, url: event.target.value }))} />
                          : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{link.url}</span>
                                <a href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label={t('admin.links.openUrl')}>
                                  <ExternalLink size={13} />
                                </a>
                              </div>
                            )}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="form-input" style={{ fontSize: '0.82rem' }} placeholder={t('admin.links.regionPlaceholderShort')} value={editForm.region_code} onChange={(event) => setEditForm((current) => ({ ...current, region_code: event.target.value.toUpperCase() }))} />
                          : <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{link.region_code || t('admin.links.unknownValue')}</span>}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isEditing
                          ? (
                              <>
                                <button type="button" className="action-btn" style={{ color: 'var(--success)' }} onClick={() => handleSaveEdit(link)} disabled={isSaving} title={t('admin.common.save')}>
                                  <Check size={14} />
                                </button>
                                <button type="button" className="action-btn" onClick={() => setEditingId(null)} title={t('admin.common.cancel')}>
                                  <X size={14} />
                                </button>
                              </>
                            )
                          : (
                              <>
                                <button type="button" className="action-btn" onClick={() => { setEditingId(link.id); setEditForm({ platform_name: link.platform_name, url: link.url, region_code: link.region_code || '' }); }} title={t('admin.common.edit')}>
                                  <Pencil size={14} />
                                </button>
                                <button type="button" className="action-btn" style={{ color: 'var(--error)' }} onClick={() => handleDelete(link)} title={t('admin.common.delete')}>
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!linksLoading && linksTotalPages > 1 && (
            <div className="admin-pagination">
              <button className="action-btn" disabled={linksPage <= 1} onClick={() => setLinksPage((page) => page - 1)}>{t('common.previous')}</button>
              <span className="admin-list-summary">{t('common.page')} {linksPage} / {linksTotalPages}</span>
              <button className="action-btn" disabled={linksPage >= linksTotalPages} onClick={() => setLinksPage((page) => page + 1)}>{t('common.next')}</button>
            </div>
          )}
        </>
      )}

      {activeTab === 'nolinks' && (
        <>
          <div className="admin-controls glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <label style={{ flex: '1 1 220px' }}>
              <span className="form-label">{t('admin.links.searchTitle')}</span>
              <input className="form-input" placeholder={t('admin.links.searchTitlePlaceholder')} value={noLinkSearch} onChange={(event) => setNoLinkSearch(event.target.value)} />
            </label>
            <label style={{ flex: '0 0 150px' }}>
              <span className="form-label">{t('admin.links.type')}</span>
              <select className="form-select" value={noLinkType} onChange={(event) => setNoLinkType(event.target.value)}>
                <option value="all">{t('admin.links.allTypes')}</option>
                <option value="anime">{t('admin.links.typeAnime')}</option>
                <option value="manga">{t('admin.links.typeManga')}</option>
                <option value="manhwa">{t('admin.links.typeManhwa')}</option>
                <option value="manhua">{t('admin.links.typeManhua')}</option>
                <option value="webtoon">{t('admin.links.typeWebtoon')}</option>
              </select>
            </label>
            <button type="button" className="action-btn" onClick={() => { setNoLinkSearch(''); setNoLinkType('all'); }}>{t('admin.common.reset')}</button>
            <button type="button" className="action-btn" onClick={fetchNoLinks}>{t('admin.common.refresh')}</button>
          </div>

          <div className="admin-list-toolbar" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="admin-list-summary">
              {noLinkLoading
                ? t('admin.common.loading')
                : t('admin.links.summaryNoLinks', { total: noLinkTotal, page: noLinkPage, pages: noLinkTotalPages })}
            </span>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.links.title')}</th>
                  <th style={{ width: '100px' }}>{t('admin.links.type')}</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>{t('admin.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {noLinkLoading && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>{t('admin.common.loading')}</td></tr>}
                {!noLinkLoading && noLinkTitles.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>{t('admin.links.noTitlesWithoutLinks')}</td></tr>}
                {!noLinkLoading && noLinkTitles.map((title) => (
                  <QuickAddRow key={title.id} title={title} onAdded={handleTitleLinked} t={t} />
                ))}
              </tbody>
            </table>
          </div>

          {!noLinkLoading && noLinkTotalPages > 1 && (
            <div className="admin-pagination">
              <button className="action-btn" disabled={noLinkPage <= 1} onClick={() => setNoLinkPage((page) => page - 1)}>{t('common.previous')}</button>
              <span className="admin-list-summary">{t('common.page')} {noLinkPage} / {noLinkTotalPages}</span>
              <button className="action-btn" disabled={noLinkPage >= noLinkTotalPages} onClick={() => setNoLinkPage((page) => page + 1)}>{t('common.next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
