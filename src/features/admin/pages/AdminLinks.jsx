import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Pencil, Plus, Trash2, X, Check, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/shared/lib/supabase';
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

// ---- Shared title-search dropdown ----
function TitleSearchDropdown({ value, titleId, suggestions, onChange, onSelect, onClear }) {
  if (titleId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ flex: 1, fontSize: '0.85rem', padding: '0.5rem', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
          {value}
        </span>
        <button type="button" className="action-btn" style={{ color: 'var(--error)', flexShrink: 0 }} onClick={onClear}>
          <X size={14} />
        </button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input className="form-input" placeholder="ค้นหา title..." value={value} onChange={onChange} />
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: 'var(--surface-1)', border: '1px solid var(--border-default)',
          borderRadius: '10px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: '4px',
        }}>
          {suggestions.map((t) => (
            <button key={t.id} type="button" style={{
              width: '100%', textAlign: 'left', padding: '8px 12px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.85rem', color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}
              onClick={() => onSelect(t)}
            >
              <div style={{ fontWeight: 600 }}>{t.canonical_title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Quick-add form row (used in No-Links tab) ----
function QuickAddRow({ title, onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_QUICK_FORM);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.platform_name || !form.url) { toast.error('กรุณาเลือก Platform และใส่ URL'); return; }
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
      toast.success(`เพิ่มลิงก์ให้ "${title.canonical_title}" แล้ว`);
      setForm(EMPTY_QUICK_FORM);
      setOpen(false);
      onAdded(title.id);
    } catch (err) {
      toast.error(err.message || 'เพิ่มไม่สำเร็จ');
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
            onClick={() => setOpen((v) => !v)}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            Add Link
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
                onChange={(e) => setForm((f) => ({ ...f, platform_name: e.target.value }))}
              >
                <option value="">เลือก Platform</option>
                {PLATFORM_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              <input
                className="form-input"
                style={{ flex: '1 1 200px', fontSize: '0.82rem' }}
                placeholder="URL (https://...)"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
              <input
                className="form-input"
                style={{ flex: '0 0 90px', fontSize: '0.82rem' }}
                placeholder="Region"
                value={form.region_code}
                onChange={(e) => setForm((f) => ({ ...f, region_code: e.target.value.toUpperCase() }))}
              />
              <button type="button" className="primary-btn" style={{ fontSize: '0.82rem', padding: '0 12px', height: '36px' }} onClick={save} disabled={saving}>
                {saving ? '...' : 'Save'}
              </button>
              <button type="button" className="action-btn" onClick={() => setOpen(false)}>ยกเลิก</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ===== Main component =====
export function AdminLinks() {
  const [activeTab, setActiveTab] = useState('links'); // 'links' | 'nolinkss'

  // --- Has-links tab state ---
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

  // --- No-links tab state ---
  const [noLinkTitles, setNoLinkTitles] = useState([]);
  const [noLinkTotal, setNoLinkTotal] = useState(0);
  const [noLinkLoading, setNoLinkLoading] = useState(false);
  const [noLinkPage, setNoLinkPage] = useState(1);
  const [noLinkSearch, setNoLinkSearch] = useState('');
  const [noLinkType, setNoLinkType] = useState('all');

  const linksTotalPages = Math.max(1, Math.ceil(linksTotal / PAGE_SIZE));
  const noLinkTotalPages = Math.max(1, Math.ceil(noLinkTotal / PAGE_SIZE));

  // ---- Fetch has-links ----
  const fetchLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      let titleIdFilter = null;
      if (searchTitle.trim()) {
        const { data: matched } = await supabase
          .from('canonical_titles')
          .select('id')
          .ilike('canonical_title', `%${searchTitle.trim()}%`);
        titleIdFilter = (matched || []).map((t) => t.id);
        if (titleIdFilter.length === 0) {
          setLinks([]); setLinksTotal(0); setLinksLoading(false); return;
        }
      }

      let q = supabase
        .from('title_availability')
        .select('id, platform_name, url, region_code, is_official, canonical_title_id', { count: 'exact' })
        .order('platform_name', { ascending: true });

      if (filterPlatform !== 'all') q = q.eq('platform_name', filterPlatform);
      if (titleIdFilter !== null) q = q.in('canonical_title_id', titleIdFilter);

      const from = (linksPage - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      const uniqueIds = [...new Set((data || []).map((r) => r.canonical_title_id))];
      let titlesMap = {};
      if (uniqueIds.length > 0) {
        const { data: td } = await supabase.from('canonical_titles').select('id, canonical_title, slug, type').in('id', uniqueIds);
        titlesMap = Object.fromEntries((td || []).map((t) => [t.id, t]));
      }

      setLinks((data || []).map((row) => ({ ...row, canonical_titles: titlesMap[row.canonical_title_id] || null })));
      setLinksTotal(count || 0);
    } catch (err) {
      toast.error(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLinksLoading(false);
    }
  }, [linksPage, filterPlatform, searchTitle]);

  // ---- Fetch no-links ----
  const fetchNoLinks = useCallback(async () => {
    setNoLinkLoading(true);
    try {
      // Get all title IDs that already have at least one link
      const { data: hasLinks } = await supabase.from('title_availability').select('canonical_title_id');
      const linkedIds = [...new Set((hasLinks || []).map((r) => r.canonical_title_id))];

      let q = supabase
        .from('canonical_titles')
        .select('id, canonical_title, slug, type, subtype', { count: 'exact' })
        .order('canonical_title', { ascending: true });

      if (linkedIds.length > 0) q = q.not('id', 'in', `(${linkedIds.join(',')})`);
      if (noLinkType !== 'all') q = q.eq('subtype', noLinkType);
      if (noLinkSearch.trim()) q = q.ilike('canonical_title', `%${noLinkSearch.trim()}%`);

      const from = (noLinkPage - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;
      setNoLinkTitles(data || []);
      setNoLinkTotal(count || 0);
    } catch (err) {
      toast.error(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setNoLinkLoading(false);
    }
  }, [noLinkPage, noLinkSearch, noLinkType]);

  useEffect(() => { if (activeTab === 'links') fetchLinks(); }, [fetchLinks, activeTab]);
  useEffect(() => { if (activeTab === 'nolinks') fetchNoLinks(); }, [fetchNoLinks, activeTab]);
  useEffect(() => { setLinksPage(1); }, [filterPlatform, searchTitle]);
  useEffect(() => { setNoLinkPage(1); }, [noLinkSearch, noLinkType]);

  // title search autocomplete for add form
  useEffect(() => {
    if (!addForm.titleSearch.trim() || addForm.titleId) { setTitleSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('canonical_titles').select('id, canonical_title, slug')
        .ilike('canonical_title', `%${addForm.titleSearch}%`).limit(8);
      setTitleSuggestions(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [addForm.titleSearch, addForm.titleId]);

  const handleDelete = async (link) => {
    if (!window.confirm(`ลบ ${link.platform_name} ของ "${link.canonical_titles?.canonical_title}"?`)) return;
    try {
      const { error } = await supabase.from('title_availability').delete().eq('id', link.id);
      if (error) throw error;
      toast.success('ลบลิงก์แล้ว');
      fetchLinks();
    } catch (err) { toast.error(err.message || 'ลบไม่สำเร็จ'); }
  };

  const handleSaveEdit = async (link) => {
    if (!editForm.platform_name || !editForm.url) { toast.error('กรุณากรอก Platform และ URL'); return; }
    setIsSaving(true);
    try {
      const { error } = await supabase.from('title_availability')
        .update({ platform_name: editForm.platform_name, url: editForm.url, region_code: editForm.region_code || null })
        .eq('id', link.id);
      if (error) throw error;
      toast.success('บันทึกแล้ว');
      setEditingId(null);
      fetchLinks();
    } catch (err) { toast.error(err.message || 'บันทึกไม่สำเร็จ'); } finally { setIsSaving(false); }
  };

  const handleAddLink = async () => {
    if (!addForm.titleId || !addForm.platform_name || !addForm.url) {
      toast.error('กรุณาเลือก Title, Platform และใส่ URL'); return;
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
      toast.success('เพิ่มลิงก์แล้ว');
      setShowAddForm(false);
      setAddForm(EMPTY_ADD_FORM);
      fetchLinks();
    } catch (err) { toast.error(err.message || 'เพิ่มไม่สำเร็จ'); } finally { setIsSaving(false); }
  };

  // when a title in no-links tab gets a link added, remove it from the list
  const handleTitleLinked = (titleId) => {
    setNoLinkTitles((prev) => prev.filter((t) => t.id !== titleId));
    setNoLinkTotal((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="admin-page-content">
      {/* Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem' }}>Platform Links</h1>
          <p style={{ color: 'var(--text-secondary)' }}>จัดการลิงก์ทุก platform ของทุก title</p>
        </div>
        {activeTab === 'links' && (
          <button type="button" className="primary-btn" onClick={() => { setShowAddForm(true); setAddForm(EMPTY_ADD_FORM); }}>
            <Plus size={16} style={{ marginRight: '6px' }} />เพิ่มลิงก์
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-default)', paddingBottom: '0' }}>
        {[
          { key: 'links', label: `มีลิงก์${linksTotal ? ` (${linksTotal})` : ''}` },
          { key: 'nolinks', label: `ไม่มีลิงก์${noLinkTotal ? ` (${noLinkTotal})` : ''}` },
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

      {/* ===== HAS-LINKS TAB ===== */}
      {activeTab === 'links' && (
        <>
          {/* Add Form */}
          {showAddForm && (
            <div className="glass-panel" style={{ marginBottom: 'var(--space-5)', padding: 'var(--space-5)' }}>
              <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '1rem', fontWeight: 700 }}>เพิ่มลิงก์ใหม่</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', alignItems: 'start' }}>
                <div>
                  <span className="form-label">Title</span>
                  <TitleSearchDropdown
                    value={addForm.titleSearch}
                    titleId={addForm.titleId}
                    suggestions={titleSuggestions}
                    onChange={(e) => setAddForm((f) => ({ ...f, titleSearch: e.target.value, titleId: '' }))}
                    onSelect={(t) => { setAddForm((f) => ({ ...f, titleId: t.id, titleSearch: t.canonical_title })); setTitleSuggestions([]); }}
                    onClear={() => setAddForm((f) => ({ ...f, titleId: '', titleSearch: '' }))}
                  />
                </div>
                <div>
                  <span className="form-label">Platform</span>
                  <select className="form-select" value={addForm.platform_name} onChange={(e) => setAddForm((f) => ({ ...f, platform_name: e.target.value }))}>
                    <option value="">เลือก Platform</option>
                    {PLATFORM_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <span className="form-label">URL</span>
                  <input className="form-input" placeholder="https://..." value={addForm.url} onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))} />
                </div>
                <div>
                  <span className="form-label">Region (optional)</span>
                  <input className="form-input" placeholder="TH, JP, US…" value={addForm.region_code} onChange={(e) => setAddForm((f) => ({ ...f, region_code: e.target.value.toUpperCase() }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="primary-btn" onClick={handleAddLink} disabled={isSaving}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                <button type="button" className="action-btn" onClick={() => setShowAddForm(false)}>ยกเลิก</button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="admin-controls glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <label style={{ flex: '1 1 220px' }}>
              <span className="form-label">ค้นหา Title</span>
              <input className="form-input" placeholder="ชื่อ title..." value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)} />
            </label>
            <label style={{ flex: '0 0 180px' }}>
              <span className="form-label">Platform</span>
              <select className="form-select" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
                <option value="all">ทุก Platform</option>
                {PLATFORM_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </label>
            <button type="button" className="action-btn" onClick={() => { setSearchTitle(''); setFilterPlatform('all'); }}>Reset</button>
          </div>

          <div className="admin-list-toolbar" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="admin-list-summary">
              {linksLoading ? 'กำลังโหลด...' : `${linksTotal} ลิงก์ • หน้า ${linksPage} / ${linksTotalPages}`}
            </span>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th style={{ width: '150px' }}>Platform</th>
                  <th>URL</th>
                  <th style={{ width: '80px' }}>Region</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {linksLoading && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>}
                {!linksLoading && links.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>ไม่พบลิงก์</td></tr>}
                {!linksLoading && links.map((link) => {
                  const title = link.canonical_titles;
                  const isEditing = editingId === link.id;
                  return (
                    <tr key={link.id}>
                      <td>
                        <div className="admin-title-cell">
                          <Link to={`/titles/${title?.slug}`} target="_blank" className="admin-title-primary" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                            {title?.canonical_title || '—'}
                          </Link>
                        </div>
                      </td>
                      <td>
                        {isEditing
                          ? <select className="form-select" style={{ fontSize: '0.82rem' }} value={editForm.platform_name} onChange={(e) => setEditForm((f) => ({ ...f, platform_name: e.target.value }))}>
                              {PLATFORM_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          : <span>{link.platform_name}</span>}
                      </td>
                      <td style={{ maxWidth: '280px' }}>
                        {isEditing
                          ? <input className="form-input" style={{ fontSize: '0.82rem' }} value={editForm.url} onChange={(e) => setEditForm((f) => ({ ...f, url: e.target.value }))} />
                          : <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{link.url}</span>
                              <a href={link.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><ExternalLink size={13} /></a>
                            </div>}
                      </td>
                      <td>
                        {isEditing
                          ? <input className="form-input" style={{ fontSize: '0.82rem' }} placeholder="TH" value={editForm.region_code} onChange={(e) => setEditForm((f) => ({ ...f, region_code: e.target.value.toUpperCase() }))} />
                          : <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{link.region_code || '—'}</span>}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isEditing
                          ? <>
                              <button type="button" className="action-btn" style={{ color: 'var(--success)' }} onClick={() => handleSaveEdit(link)} disabled={isSaving}><Check size={14} /></button>
                              <button type="button" className="action-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
                            </>
                          : <>
                              <button type="button" className="action-btn" onClick={() => { setEditingId(link.id); setEditForm({ platform_name: link.platform_name, url: link.url, region_code: link.region_code || '' }); }} title="แก้ไข"><Pencil size={14} /></button>
                              <button type="button" className="action-btn" style={{ color: 'var(--error)' }} onClick={() => handleDelete(link)} title="ลบ"><Trash2 size={14} /></button>
                            </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!linksLoading && linksTotalPages > 1 && (
            <div className="admin-pagination">
              <button className="action-btn" disabled={linksPage <= 1} onClick={() => setLinksPage((p) => p - 1)}>Previous</button>
              <span className="admin-list-summary">หน้า {linksPage} / {linksTotalPages}</span>
              <button className="action-btn" disabled={linksPage >= linksTotalPages} onClick={() => setLinksPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* ===== NO-LINKS TAB ===== */}
      {activeTab === 'nolinks' && (
        <>
          {/* Filters */}
          <div className="admin-controls glass" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <label style={{ flex: '1 1 220px' }}>
              <span className="form-label">ค้นหา Title</span>
              <input className="form-input" placeholder="ชื่อ title..." value={noLinkSearch} onChange={(e) => setNoLinkSearch(e.target.value)} />
            </label>
            <label style={{ flex: '0 0 150px' }}>
              <span className="form-label">Type</span>
              <select className="form-select" value={noLinkType} onChange={(e) => setNoLinkType(e.target.value)}>
                <option value="all">ทุก Type</option>
                <option value="anime">Anime</option>
                <option value="manga">Manga (JP)</option>
                <option value="manhwa">Manhwa (KR)</option>
                <option value="manhua">Manhua (CN)</option>
                <option value="webtoon">Webtoon</option>
              </select>
            </label>
            <button type="button" className="action-btn" onClick={() => { setNoLinkSearch(''); setNoLinkType('all'); }}>Reset</button>
            <button type="button" className="action-btn" onClick={fetchNoLinks}>Refresh</button>
          </div>

          <div className="admin-list-toolbar" style={{ marginBottom: 'var(--space-2)' }}>
            <span className="admin-list-summary">
              {noLinkLoading ? 'กำลังโหลด...' : `${noLinkTotal} title ที่ยังไม่มีลิงก์ • หน้า ${noLinkPage} / ${noLinkTotalPages}`}
            </span>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th style={{ width: '100px' }}>Type</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {noLinkLoading && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>กำลังโหลด...</td></tr>}
                {!noLinkLoading && noLinkTitles.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>ไม่พบ title ที่ไม่มีลิงก์ 🎉</td></tr>}
                {!noLinkLoading && noLinkTitles.map((title) => (
                  <QuickAddRow key={title.id} title={title} onAdded={handleTitleLinked} />
                ))}
              </tbody>
            </table>
          </div>

          {!noLinkLoading && noLinkTotalPages > 1 && (
            <div className="admin-pagination">
              <button className="action-btn" disabled={noLinkPage <= 1} onClick={() => setNoLinkPage((p) => p - 1)}>Previous</button>
              <span className="admin-list-summary">หน้า {noLinkPage} / {noLinkTotalPages}</span>
              <button className="action-btn" disabled={noLinkPage >= noLinkTotalPages} onClick={() => setNoLinkPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
