import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Library,
  FolderPlus,
  Music4,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Loader2,
} from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import {
  fetchAdminPartyPresetItems,
  fetchAdminPartyPresetSummaries,
} from '@/features/admin/api';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { searchPartyThemeSongs } from '@/features/party/api/partyRemoteApi';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import '../styles/Admin.css';

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  status: 'draft',
  visibility: 'public',
};

const SEARCH_SORT_OPTIONS = [
  { id: 'relevance', label: 'เกี่ยวข้อง', labelEn: 'Relevance' },
  { id: 'random', label: 'สุ่ม', labelEn: 'Random' },
  { id: 'mixed', label: 'คละเพลง', labelEn: 'Mixed songs' },
  { id: 'title', label: 'เรียงตามเรื่อง', labelEn: 'Title A-Z' },
  { id: 'popularity', label: 'นิยมมากสุด', labelEn: 'Most popular' },
  { id: 'score', label: 'คะแนนสูงสุด', labelEn: 'Highest score' },
];

function mapForm(preset) {
  return {
    name: preset?.name || '',
    slug: preset?.slug || '',
    description: preset?.description || '',
    status: preset?.status || 'draft',
    visibility: preset?.visibility || 'public',
  };
}

function slugifyPreset(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function AdminPartyPresets() {
  const { user } = useAuth();
  const { pick } = useLanguage();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchSort, setSearchSort] = useState('relevance');
  const [addingSongId, setAddingSongId] = useState(null);
  const [removingItemId, setRemovingItemId] = useState(null);

  const presetsQuery = useQuery({
    queryKey: ['admin-party-preset-summaries'],
    queryFn: fetchAdminPartyPresetSummaries,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const presets = useMemo(() => presetsQuery.data || [], [presetsQuery.data]);
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedId) || null,
    [presets, selectedId],
  );

  const presetItemsQuery = useQuery({
    queryKey: ['admin-party-preset-items', selectedId || null],
    queryFn: () => fetchAdminPartyPresetItems(selectedId),
    enabled: Boolean(selectedId),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!presets.length) {
      setSelectedId(null);
      setForm(EMPTY_FORM);
      return;
    }

    if (!selectedId || !presets.some((preset) => preset.id === selectedId)) {
      setSelectedId(presets[0].id);
    }
  }, [presets, selectedId]);

  useEffect(() => {
    if (!selectedPreset) {
      if (selectedId) return;
      setForm(EMPTY_FORM);
      return;
    }

    setForm(mapForm(selectedPreset));
  }, [selectedId, selectedPreset]);

  useEffect(() => {
    if (presetsQuery.error || presetItemsQuery.error) {
      toast.error(presetsQuery.error?.message || presetItemsQuery.error?.message || 'Failed to load presets');
    }
  }, [presetItemsQuery.error, presetsQuery.error]);

  const presetItems = useMemo(() => presetItemsQuery.data || [], [presetItemsQuery.data]);
  const isLoading = presetsQuery.isLoading && !presets.length;
  const errorMessage = presetsQuery.error?.message || presetItemsQuery.error?.message || '';
  const isRefreshing = (presetsQuery.isFetching && !presetsQuery.isLoading)
    || (presetItemsQuery.isFetching && Boolean(selectedId));

  const refreshPresets = useCallback(async ({ showToast = true } = {}) => {
    try {
      const [listResult, itemsResult] = await Promise.all([
        presetsQuery.refetch(),
        selectedId ? presetItemsQuery.refetch() : Promise.resolve({ error: null }),
      ]);

      if (listResult.error) throw listResult.error;
      if (itemsResult?.error) throw itemsResult.error;

      if (showToast) {
        toast.success(pick('รีเฟรชแล้ว', 'Refreshed'));
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to refresh presets');
    }
  }, [pick, presetItemsQuery, presetsQuery, selectedId]);

  const handleSelect = (preset) => {
    setSelectedId(preset.id);
    setForm(mapForm(preset));
    setSearchResults([]);
    setSearchQuery('');
    setSearchPage(0);
    setSearchTotal(0);
    setSearchTotalPages(1);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setSearchResults([]);
    setSearchQuery('');
    setSearchPage(0);
    setSearchTotal(0);
    setSearchTotalPages(1);
  };

  const handleFormChange = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      if (key === 'name') {
        return {
          ...current,
          name: value,
          slug: current.slug ? current.slug : slugifyPreset(value),
        };
      }

      return { ...current, [key]: value };
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!supabase) return;

    const payload = {
      name: form.name.trim(),
      slug: slugifyPreset(form.slug || form.name),
      description: form.description.trim() || null,
      status: form.status,
      visibility: form.visibility,
    };

    if (!payload.name || !payload.slug) {
      toast.error(pick('กรอกชื่อ preset และ slug ก่อน', 'Preset name and slug are required'));
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(selectedId ? 'Saving preset...' : 'Creating preset...');

    try {
      let nextSelectedId = selectedId;

      if (selectedId) {
        const { error } = await supabase
          .from('party_song_presets')
          .update(payload)
          .eq('id', selectedId);

        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('party_song_presets')
          .insert({
            ...payload,
            created_by: user?.id || null,
          })
          .select('id')
          .single();

        if (error) {
          throw error;
        }

        nextSelectedId = Number(data?.id || 0) || null;
        setSelectedId(nextSelectedId);
      }

      toast.success(pick('บันทึก preset แล้ว', 'Preset saved'), { id: toastId });
      await presetsQuery.refetch();
      if (nextSelectedId) {
        await presetItemsQuery.refetch();
      }
    } catch (error) {
      console.error('Failed to save preset', error);
      toast.error(error.message || 'Failed to save preset', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !selectedPreset) {
      return;
    }

    if (!window.confirm(pick(`ลบ preset "${selectedPreset.name}" ใช่ไหม?`, `Delete "${selectedPreset.name}"?`))) {
      return;
    }

    const toastId = toast.loading('Deleting preset...');
    try {
      const { error } = await supabase
        .from('party_song_presets')
        .delete()
        .eq('id', selectedPreset.id);

      if (error) {
        throw error;
      }

      toast.success(pick('ลบ preset แล้ว', 'Preset deleted'), { id: toastId });
      setSelectedId(null);
      await presetsQuery.refetch();
    } catch (error) {
      console.error('Failed to delete preset', error);
      toast.error(error.message || 'Failed to delete preset', { id: toastId });
    }
  };

  const runSearch = useCallback(async (targetPage = 0) => {
    setSearching(true);
    try {
      const result = await searchPartyThemeSongs(searchQuery, { page: targetPage, pageSize: 24, sortBy: searchSort });
      setSearchResults(result.items || []);
      setSearchPage(Number(result.page || 0));
      setSearchTotal(Number(result.total || 0));
      setSearchTotalPages(Math.max(1, Number(result.totalPages || 1)));
    } catch (error) {
      console.error('Failed to search theme songs', error);
      toast.error(error.message || 'Failed to search songs');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchSort]);

  const handleSearchSongs = async (event) => {
    event.preventDefault();
    await runSearch(0);
  };

  const handleAddSong = async (song) => {
    if (!supabase || !selectedPreset || !song?.id) {
      return;
    }

    setAddingSongId(song.id);
    const toastId = toast.loading('Adding song...');
    try {
      const { error } = await supabase
        .from('party_song_preset_items')
        .insert({
          preset_id: selectedPreset.id,
          song_id: song.id,
          source_title_id: song.sourceTitleId || null,
          source_title_name: song.sourceTitleName || '',
          song_title: song.songTitle || '',
          theme_type: song.themeType || 'OP',
          artist_name: song.artistName || null,
          media_url: song.mediaUrl || '',
          cover_url: song.coverUrl || null,
          position: presetItems.length,
        });

      if (error) {
        throw error;
      }

      toast.success(pick('เพิ่มเพลงเข้า preset แล้ว', 'Song added'), { id: toastId });
      await Promise.all([
        presetsQuery.refetch(),
        presetItemsQuery.refetch(),
      ]);
    } catch (error) {
      console.error('Failed to add preset song', error);
      toast.error(error.message || 'Failed to add song', { id: toastId });
    } finally {
      setAddingSongId(null);
    }
  };

  const handleRemoveItem = async (item) => {
    if (!supabase || !selectedPreset || !item?.id) {
      return;
    }

    setRemovingItemId(item.id);
    const toastId = toast.loading('Removing song...');
    try {
      const { error } = await supabase
        .from('party_song_preset_items')
        .delete()
        .eq('id', item.id);

      if (error) {
        throw error;
      }

      toast.success(pick('ลบเพลงออกจาก preset แล้ว', 'Song removed'), { id: toastId });
      await Promise.all([
        presetsQuery.refetch(),
        presetItemsQuery.refetch(),
      ]);
    } catch (error) {
      console.error('Failed to remove preset song', error);
      toast.error(error.message || 'Failed to remove song', { id: toastId });
    } finally {
      setRemovingItemId(null);
    }
  };

  const paginationItems = useMemo(() => {
    const current = searchPage + 1;
    const total = Math.max(1, searchTotalPages);
    const pages = new Set([1, total, current - 1, current, current + 1].filter((pageNumber) => pageNumber >= 1 && pageNumber <= total));
    return [...pages].sort((left, right) => left - right);
  }, [searchPage, searchTotalPages]);

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Music4 size={30} color="var(--primary-500)" />
            {pick('Party Song Presets', 'Party Song Presets')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {pick('จัดการ preset เพลงที่ใช้ในห้อง Music Guess Party', 'Manage the song pools used by Music Guess Party rooms.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="action-btn" onClick={() => void refreshPresets()} type="button" disabled={isRefreshing}>
            {isRefreshing ? <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> : <RefreshCw size={16} style={{ marginRight: 8 }} />}
            {pick('รีเฟรช', 'Refresh')}
          </button>
          <button className="primary-btn" onClick={handleCreateNew} type="button">
            <FolderPlus size={18} />
            {pick('สร้าง preset ใหม่', 'New preset')}
          </button>
        </div>
      </div>

      <div className="admin-split-layout">
        <section className="glass-panel">
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Library size={20} color="var(--primary-500)" />
                {pick('รายการ preset', 'Preset library')}
              </h2>
              <p>{pick(`${presets.length} preset`, `${presets.length} presets`)}</p>
            </div>
          </div>

          {isLoading ? (
            <AdminStatePanel
              title={pick('กำลังโหลด preset', 'Loading presets')}
              description={pick('กำลังดึงรายการ preset ของ Music Guess Party', 'Fetching the Music Guess Party preset list.')}
            />
          ) : errorMessage ? (
            <AdminStatePanel
              title={pick('โหลด preset ไม่สำเร็จ', 'Failed to load presets')}
              description={errorMessage}
              actionLabel={pick('ลองใหม่', 'Retry')}
              onAction={() => void refreshPresets({ showToast: false })}
              tone="error"
            />
          ) : presets.length === 0 ? (
            <AdminStatePanel
              title={pick('ยังไม่มี preset', 'No presets yet')}
              description={pick('สร้าง preset แรกเพื่อเริ่มจัดการ pool เพลงสำหรับห้อง party', 'Create the first preset to start curating party song pools.')}
            />
          ) : (
            <div className="admin-list-stack">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`admin-record-card ${selectedId === preset.id ? 'active' : ''}`}
                  onClick={() => handleSelect(preset)}
                >
                  <div className="admin-record-main">
                    <strong>{preset.name}</strong>
                    <span>{preset.slug}</span>
                  </div>
                  <div className="admin-record-meta">
                    <span className={`badge ${preset.status === 'published' ? 'badge-editor' : 'badge-user'}`}>{preset.status}</span>
                    <span>{preset.itemCount} {pick('เพลง', 'songs')}</span>
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
                  {selectedPreset ? pick('แก้ไข preset', 'Edit preset') : pick('สร้าง preset', 'Create preset')}
                </h2>
                <p>{pick('กำหนดชื่อ สถานะ และการมองเห็นของ preset นี้', 'Set the name, publishing state, and visibility for this preset.')}</p>
              </div>
              {selectedPreset ? (
                <button className="action-btn" type="button" onClick={handleDelete}>
                  <Trash2 size={16} style={{ marginRight: 8 }} />
                  {pick('ลบ', 'Delete')}
                </button>
              ) : null}
            </div>

            <div className="admin-form-grid">
              <label>
                <span className="form-label">{pick('ชื่อ preset', 'Preset name')}</span>
                <input className="form-input" value={form.name} onChange={handleFormChange('name')} placeholder={pick('เช่น Spring 2026 OP Picks', 'e.g. Spring 2026 OP Picks')} />
              </label>
              <label>
                <span className="form-label">Slug</span>
                <input className="form-input" value={form.slug} onChange={handleFormChange('slug')} placeholder="spring-2026-op-picks" />
              </label>
              <label className="admin-form-grid-wide">
                <span className="form-label">{pick('คำอธิบาย', 'Description')}</span>
                <textarea className="form-input" value={form.description} onChange={handleFormChange('description')} placeholder={pick('อธิบายว่า preset นี้ใช้กับเพลงแนวไหนหรือแคมเปญอะไร', 'Describe what this preset is for.')} />
              </label>
              <label>
                <span className="form-label">{pick('สถานะ', 'Status')}</span>
                <select className="form-select" value={form.status} onChange={handleFormChange('status')}>
                  <option value="draft">{pick('draft', 'draft')}</option>
                  <option value="published">{pick('published', 'published')}</option>
                  <option value="archived">{pick('archived', 'archived')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{pick('การมองเห็น', 'Visibility')}</span>
                <select className="form-select" value={form.visibility} onChange={handleFormChange('visibility')}>
                  <option value="public">{pick('public', 'public')}</option>
                  <option value="private">{pick('private', 'private')}</option>
                </select>
              </label>
            </div>

            <div className="admin-form-actions">
              <button className="primary-btn" type="submit" disabled={isSaving}>
                {isSaving ? pick('กำลังบันทึก...', 'Saving...') : selectedPreset ? pick('บันทึกการเปลี่ยนแปลง', 'Save changes') : pick('สร้าง preset', 'Create preset')}
              </button>
            </div>
          </form>

          <section className="glass-panel">
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Search size={20} color="var(--primary-500)" />
                  {pick('เพลงใน preset', 'Preset songs')}
                </h2>
                <p>
                  {selectedPreset
                    ? pick(`${presetItems.length} เพลงใน preset นี้`, `${presetItems.length} songs in this preset`)
                    : pick('สร้างหรือเลือก preset ก่อนจึงจะเพิ่มเพลงได้', 'Create or select a preset before adding songs')}
                </p>
              </div>
            </div>

            {!selectedPreset ? (
              <AdminStatePanel
                title={pick('ยังไม่ได้เลือก preset', 'No preset selected')}
                description={pick('เลือก preset จากด้านซ้าย หรือสร้าง preset ใหม่ก่อนเพิ่มเพลง', 'Pick a preset from the left, or create a new one before adding songs.')}
              />
            ) : (
              <>
                <form className="admin-inline-form admin-party-search-form" onSubmit={handleSearchSongs}>
                  <label className="admin-inline-form-grow">
                    <span className="form-label">{pick('ค้นหาเพลง', 'Search songs')}</span>
                    <input
                      className="form-input"
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setSearchPage(0);
                      }}
                      placeholder={pick('พิมพ์ชื่อเพลง ชื่อเรื่อง หรือ artist', 'Search by song, title, or artist')}
                    />
                  </label>
                  <label>
                    <span className="form-label">{pick('เรียงผลลัพธ์', 'Sort results')}</span>
                    <select
                      className="form-select"
                      value={searchSort}
                      onChange={(event) => {
                        setSearchSort(event.target.value);
                        setSearchPage(0);
                      }}
                    >
                      {SEARCH_SORT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{pick(option.label, option.labelEn)}</option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-btn" type="submit" disabled={searching}>
                    {searching ? pick('กำลังค้นหา...', 'Searching...') : pick('ค้นหา', 'Search')}
                  </button>
                </form>

                {searchResults.length > 0 ? (
                  <>
                    <div className="admin-party-results-meta">
                      <span>{pick(`พบประมาณ ${searchTotal} รายการ`, `About ${searchTotal} results`)}</span>
                      <span>{pick(`หน้า ${searchPage + 1} / ${searchTotalPages}`, `Page ${searchPage + 1} / ${searchTotalPages}`)}</span>
                    </div>
                    <div className="admin-party-result-grid">
                      {searchResults.map((song) => {
                        const alreadyAdded = presetItems.some((item) => Number(item.song_id) === Number(song.id));

                        return (
                          <article key={song.id} className="admin-party-song-card">
                            <div className="admin-party-song-copy">
                              <strong>{song.songTitle}</strong>
                              <span>{song.sourceTitleName}</span>
                              <small>{[song.themeType, song.artistName].filter(Boolean).join(' • ')}</small>
                              <small>{pick('ความนิยม', 'Popularity')}: {song.sourcePopularityScore || 0} • {pick('คะแนน', 'Score')}: {song.sourceAvgScore || 0}</small>
                            </div>
                            <button
                              className="action-btn"
                              type="button"
                              disabled={alreadyAdded || addingSongId === song.id}
                              onClick={() => void handleAddSong(song)}
                            >
                              {alreadyAdded
                                ? pick('เพิ่มแล้ว', 'Added')
                                : addingSongId === song.id
                                  ? pick('กำลังเพิ่ม...', 'Adding...')
                                  : pick('เพิ่มเข้า preset', 'Add')}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    <div className="admin-pagination">
                      <button
                        className="action-btn"
                        type="button"
                        disabled={searching || searchPage <= 0}
                        onClick={() => void runSearch(Math.max(0, searchPage - 1))}
                      >
                        {pick('ก่อนหน้า', 'Previous')}
                      </button>
                      {paginationItems.map((pageNumber) => (
                        <button
                          key={pageNumber}
                          className={`action-btn ${pageNumber === searchPage + 1 ? 'active' : ''}`}
                          type="button"
                          disabled={searching || pageNumber === searchPage + 1}
                          onClick={() => void runSearch(pageNumber - 1)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                      <button
                        className="action-btn"
                        type="button"
                        disabled={searching || searchPage + 1 >= searchTotalPages}
                        onClick={() => void runSearch(searchPage + 1)}
                      >
                        {pick('ถัดไป', 'Next')}
                      </button>
                    </div>
                  </>
                ) : null}

                {presetItems.length === 0 ? (
                  <AdminStatePanel
                    title={pick('ยังไม่มีเพลงใน preset', 'No songs in this preset')}
                    description={pick('ค้นหาเพลงจากฐานข้อมูลด้านบนแล้วเพิ่มเข้า preset นี้ได้ทันที', 'Search the song catalog above and add tracks to this preset.')}
                  />
                ) : (
                  <div className="admin-table-container" style={{ marginTop: 'var(--space-4)' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{pick('เพลง', 'Song')}</th>
                          <th>{pick('เรื่อง', 'Title')}</th>
                          <th>{pick('ประเภท', 'Type')}</th>
                          <th>{pick('ศิลปิน', 'Artist')}</th>
                          <th style={{ textAlign: 'right' }}>{pick('จัดการ', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {presetItems.map((item, index) => (
                          <tr key={item.id}>
                            <td>{index + 1}</td>
                            <td>{item.song_title}</td>
                            <td>{item.source_title_name}</td>
                            <td>{item.theme_type}</td>
                            <td>{item.artist_name || '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="action-btn"
                                type="button"
                                disabled={removingItemId === item.id}
                                onClick={() => void handleRemoveItem(item)}
                              >
                                {removingItemId === item.id ? pick('กำลังลบ...', 'Removing...') : pick('ลบออก', 'Remove')}
                              </button>
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

export default AdminPartyPresets;
