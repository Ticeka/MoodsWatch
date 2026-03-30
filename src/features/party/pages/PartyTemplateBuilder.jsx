import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save, Search, Plus, Trash2, GripVertical, Settings, ListPlus,
  Music, LayoutGrid, Info, Image as ImageIcon, Loader2, Youtube,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { PARTY_PRESETS } from '@/features/party/lib/partyEngine';
import {
  searchPartyTemplateCatalog,
  createPartyTemplate,
  updatePartyTemplate,
  replacePartyTemplateItems,
  fetchPartyTemplateDetail,
  uploadPartyTemplateCover,
} from '@/features/party/lib/partyRemote';
import {
  catalogSongToTemplateItem,
  resolveTemplateCoverUrl,
  getTemplatePlayableCount,
  isTemplateItemPlayable,
  mapTemplateItemFromDb,
  sanitizeTemplateCoverUrl,
  validatePlayableTemplateForMode,
  validateTemplateForMode,
} from '@/features/party/lib/partyTemplateUtils';
import '../components/PartyTemplates.css';
import '../pages/Party.css';

function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function PartyTemplateBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pick } = useLanguage();
  const { user } = useAuth();

  const baseTemplateId = searchParams.get('base') || null;
  const editTemplateId = searchParams.get('edit') || null;
  const sourceId = editTemplateId || baseTemplateId;

  const [meta, setMeta] = useState({
    name: pick('เพลย์ลิสต์ใหม่', 'New Playlist'),
    description: '',
    visibility: 'public',
    modeScope: 'all',
    presetId: PARTY_PRESETS[0].id,
    coverUrl: '',
    tags: '',
  });
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState('add');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingBase, setLoadingBase] = useState(Boolean(sourceId));
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const fileInputRef = useRef(null);

  const debouncedSearch = useDebounce(searchQuery, 400);

  // Load base/edit template on mount
  useEffect(() => {
    if (!sourceId) return;
    let ignore = false;
    setLoadingBase(true);
    setCoverPreviewUrl('');
    setCoverFile(null);

    fetchPartyTemplateDetail(sourceId)
      .then((data) => {
        if (ignore || !data) return;
        if (editTemplateId) {
          setMeta({
            name: data.name,
            description: data.description || '',
            visibility: data.visibility,
            modeScope: data.modeScope,
            presetId: data.presetId || PARTY_PRESETS[0].id,
            coverUrl: data.coverUrl || '',
            tags: (data.tags || []).join(', '),
          });
          setItems((data.items || []).map(mapTemplateItemFromDb));
        } else {
          // base (clone) — pre-fill all editable fields, reset name prefix
          setMeta((m) => ({
            ...m,
            name: `Copy of ${data.name}`,
            description: data.description || '',
            coverUrl: data.coverUrl || '',
            modeScope: data.modeScope,
            presetId: data.presetId || PARTY_PRESETS[0].id,
            tags: (data.tags || []).join(', '),
          }));
          setItems((data.items || []).map(mapTemplateItemFromDb));
        }
      })
      .catch(() => toast.error(pick('โหลด template ไม่ได้', 'Failed to load template')))
      .finally(() => { if (!ignore) setLoadingBase(false); });

    return () => { ignore = true; };
  }, [sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  // Catalog search — runs on mount (empty query = popular songs) and on every debounced change
  useEffect(() => {
    let ignore = false;
    setSearchLoading(true);
    setSearchError(null);

    searchPartyTemplateCatalog(debouncedSearch, { pageSize: 24 })
      .then((result) => {
        if (!ignore) setSearchResults(result?.items || []);
      })
      .catch((err) => {
        if (!ignore) {
          setSearchResults([]);
          const msg = err?.message || pick('โหลดเพลงไม่สำเร็จ', 'Failed to load songs');
          setSearchError(msg);
          toast.error(msg);
        }
      })
      .finally(() => { if (!ignore) setSearchLoading(false); });

    return () => { ignore = true; };
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const objectUrl = URL.createObjectURL(file);
    setCoverFile(file);
    setCoverPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return objectUrl;
    });
  };

  const handleAddItem = useCallback((song) => {
    const songId = song.id;
    if (items.some((item) => item.songId === songId)) return;
    const templateItem = mapTemplateItemFromDb({
      song_id: songId,
      source_title_id: song.sourceTitleId,
      source_title_name: song.sourceTitleName,
      song_title: song.songTitle,
      theme_type: song.themeType || 'OP',
      artist_name: song.artistName,
      media_url: song.mediaUrl,
      cover_url: song.coverUrl,
      position: items.length,
    }, items.length);
    setItems((prev) => [...prev, templateItem]);
  }, [items]);

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!user) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อน', 'Please log in first.'));
      return;
    }

    const validation = validateTemplateForMode(items, meta.modeScope);
    if (!validation.valid) {
      toast.error(validation.reason);
      return;
    }

    const playableValidation = validatePlayableTemplateForMode(items, meta.modeScope);
    if (!playableValidation.valid) {
      toast.error(playableValidation.reason);
      return;
    }

    if (!meta.name.trim()) {
      toast.error(pick('กรุณาใส่ชื่อเพลย์ลิสต์', 'Please enter a name.'));
      return;
    }

    setSaving(true);
    try {
      const tagsArray = meta.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      let persistedCoverUrl = sanitizeTemplateCoverUrl(meta.coverUrl);
      if (coverFile) {
        persistedCoverUrl = await uploadPartyTemplateCover(user.id, coverFile);
      } else if (!persistedCoverUrl) {
        persistedCoverUrl = resolveTemplateCoverUrl('', items, '');
      }

      const dbItems = items.map((item, index) => catalogSongToTemplateItem(item, index));

      if (editTemplateId) {
        await updatePartyTemplate(editTemplateId, {
          name: meta.name,
          description: meta.description,
          coverUrl: persistedCoverUrl,
          visibility: meta.visibility,
          modeScope: meta.modeScope,
          presetId: meta.presetId,
          tags: tagsArray,
        });
        await replacePartyTemplateItems(editTemplateId, dbItems);
        toast.success(pick('บันทึกเรียบร้อย', 'Template saved!'));
        navigate(`/party/templates/${editTemplateId}`);
      } else {
        const displayName = user.user_metadata?.display_name
          || user.user_metadata?.full_name
          || user.email?.split('@')[0]
          || 'User';

        const created = await createPartyTemplate(
          {
            ownerUserId: user.id,
            name: meta.name,
            description: meta.description,
            coverUrl: persistedCoverUrl,
            visibility: meta.visibility,
            modeScope: meta.modeScope,
            presetId: meta.presetId,
            tags: tagsArray,
          },
          dbItems,
          displayName,
        );
        toast.success(pick('สร้าง Template เรียบร้อย!', 'Template created!'));
        navigate(`/party/templates/${created.id}`);
      }
    } catch (err) {
      toast.error(err?.message || pick('บันทึกไม่สำเร็จ', 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingBase) {
    return (
      <div className="party-page pt-template-builder-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 size={40} className="animate-spin" style={{ opacity: 0.3 }} />
      </div>
    );
  }

  const validation = validateTemplateForMode(items, meta.modeScope);
  const playableValidation = validatePlayableTemplateForMode(items, meta.modeScope);
  const playableCount = getTemplatePlayableCount(items);
  const coverPreviewSrc = coverPreviewUrl || resolveTemplateCoverUrl(meta.coverUrl, items);

  return (
    <div className="party-page pt-template-builder-bg">
      <div className="pt-builder-container">
        {/* Header Bar */}
        <header className="pt-builder-header">
          <div className="pt-builder-title-group">
            <button className="pt-btn-back" onClick={() => navigate('/party/templates')}>
              &larr; {pick('กลับ', 'Back')}
            </button>
            <div className="pt-builder-title-text">
              <h1>{meta.name || pick('ตั้งชื่อเพลย์ลิสต์...', 'Name your playlist...')}</h1>
              <p>
                {items.length} {pick('เพลงที่เลือก', 'songs selected')}
                {!validation.valid && (
                  <span style={{ color: 'var(--color-error, #E53E3E)', marginLeft: '0.5rem' }}>
                    — {validation.reason}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            className="party-gradient-action"
            size="large"
            onClick={handleSave}
            disabled={saving || !validation.valid || !playableValidation.valid}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {pick('บันทึกเทมเพลต', 'Save Template')}
          </Button>
        </header>

        <div className="pt-builder-layout">
          {/* Left Panel */}
          <section className="pt-builder-left-panel">
            <div className="pt-builder-tabs">
              <button
                className={`pt-builder-tab ${activeTab === 'add' ? 'active' : ''}`}
                onClick={() => setActiveTab('add')}
              >
                <ListPlus size={18} />
                {pick('เพิ่มเพลง', 'Add Songs')}
              </button>
              <button
                className={`pt-builder-tab ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={18} />
                {pick('ตั้งค่า', 'Settings')}
              </button>
            </div>

            <div className="pt-builder-tab-content">
              {activeTab === 'add' && (
                <div className="pt-add-songs-section">
                  <div className="pt-search-module">
                    <label>{pick('ค้นหาจาก Catalog', 'Search Catalog')}</label>
                    <div className="party-search-box party-search-box-large">
                      <Search size={20} className="search-icon" />
                      <input
                        type="text"
                        placeholder={pick('พิมพ์ชื่อเพลง หรืออนิเมะ...', 'Type song or anime name...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className={`pt-alert ${playableValidation.valid ? 'pt-alert-info' : 'pt-alert-warning'}`} style={{ marginTop: '0.75rem' }}>
                      <Info size={16} />
                      <span>
                        {playableValidation.valid
                          ? pick(
                            `Template นี้มีเพลงที่เล่นได้จริง ${playableCount} เพลง พร้อมใช้งานสำหรับโหมด ${meta.modeScope === 'vote' ? 'Vote Battle' : meta.modeScope === 'quiz' ? 'Quiz' : 'All Modes'}`,
                            `This template has ${playableCount} playable songs and is ready for ${meta.modeScope === 'vote' ? 'Vote Battle' : meta.modeScope === 'quiz' ? 'Quiz' : 'All Modes'}.`,
                          )
                          : pick(
                            `เพลงที่เล่นได้จริงมี ${playableCount} เพลง ยังไม่พอสำหรับโหมด ${meta.modeScope === 'vote' ? 'Vote Battle' : meta.modeScope === 'quiz' ? 'Quiz' : 'All Modes'}`,
                            `Only ${playableCount} songs are playable, which is not enough for ${meta.modeScope === 'vote' ? 'Vote Battle' : meta.modeScope === 'quiz' ? 'Quiz' : 'All Modes'}.`,
                          )}
                      </span>
                    </div>
                  )}

                  {searchLoading && (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                      <Loader2 size={20} className="animate-spin" style={{ opacity: 0.4 }} />
                    </div>
                  )}

                  {!searchLoading && searchError && (
                    <div className="pt-alert pt-alert-warning" style={{ marginTop: '0.5rem' }}>
                      <Info size={16} />
                      <span>{searchError}</span>
                    </div>
                  )}

                  {!searchLoading && !searchError && searchResults.length > 0 && (
                    <div className="pt-search-results">
                      {searchResults.map((song) => {
                        const isAdded = items.some((item) => item.songId === song.id);
                        return (
                          <div key={song.id} className={`pt-result-card ${isAdded ? 'added' : ''}`}>
                            <div className="pt-result-info">
                              <span className="pt-result-title">
                                {song.songTitle}
                                {song.isPlayable === false && (
                                  <span title={pick('ไม่มีไฟล์วิดีโอ อาจเล่นในเกมไม่ได้', 'No video file — may not play in game')}
                                    style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--color-warning-text, #d97706)', opacity: 0.8 }}>
                                    ⚠
                                  </span>
                                )}
                              </span>
                              <span className="pt-result-meta">
                                {song.artistName}
                                {song.sourceTitleName && (
                                  <> <span className="pt-dot">&bull;</span> {song.sourceTitleName}</>
                                )}
                              </span>
                            </div>
                            <button
                              className={`pt-btn-add ${isAdded ? 'added' : ''}`}
                              onClick={() => !isAdded && handleAddItem(song)}
                              disabled={isAdded}
                            >
                              {isAdded
                                ? pick('เพิ่มแล้ว', 'Added')
                                : <><Plus size={16} /> {pick('เพิ่ม', 'Add')}</>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!searchLoading && !searchError && searchResults.length === 0 && (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '0.5rem 0' }}>
                      {searchQuery
                        ? pick('ไม่พบเพลงที่ตรงกัน', 'No matching songs found.')
                        : pick('ยังไม่มีเพลงใน catalog', 'No songs in catalog yet.')}
                    </p>
                  )}

                  <hr className="pt-divider" />

                  {/* YouTube — Coming Soon */}
                  <div className="pt-youtube-module">
                    <label className="pt-yt-label">
                      <Youtube size={20} style={{ color: 'var(--color-youtube, #ff0000)' }} />
                      {pick('อิมพอร์ตจาก YouTube', 'Import from YouTube')}
                    </label>
                    <div className="pt-alert pt-alert-warning">
                      <Info size={16} />
                      <span>
                        {pick(
                          'YouTube import จะพร้อมใช้ใน v2 — รองรับเฉพาะ Catalog ในเวอร์ชั่นนี้',
                          'YouTube import is coming in v2. Catalog songs only in this version.',
                        )}
                      </span>
                    </div>
                  </div>

                  {meta.modeScope !== 'vote' && (
                    <div className="pt-form-group">
                      <label>{pick('Quiz Preset เริ่มต้น', 'Default Quiz Preset')}</label>
                      <select
                        className="pt-select"
                        value={meta.presetId}
                        onChange={(e) => setMeta({ ...meta, presetId: e.target.value })}
                      >
                        {PARTY_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {pick(preset.labelTh, preset.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="pt-settings-section">
                  <div className="pt-form-group">
                    <label>{pick('ชื่อเพลย์ลิสต์', 'Playlist Name')} <span className="pt-required">*</span></label>
                    <input
                      type="text"
                      className="pt-input pt-input-lg"
                      value={meta.name}
                      onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                    />
                  </div>

                  <div className="pt-form-group">
                    <label>{pick('คำอธิบาย', 'Description')}</label>
                    <textarea
                      className="pt-input pt-textarea"
                      value={meta.description}
                      onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                      placeholder={pick('อธิบายเพลย์ลิสต์นี้หน่อย...', 'Describe this playlist...')}
                    />
                  </div>

                  <div className="pt-form-group">
                    <label>{pick('Tags (คั่นด้วย ,)', 'Tags (comma-separated)')}</label>
                    <input
                      type="text"
                      className="pt-input"
                      value={meta.tags}
                      onChange={(e) => setMeta({ ...meta, tags: e.target.value })}
                      placeholder="Anime, 2010s, OP, Sad..."
                    />
                  </div>

                  <div className="pt-form-group">
                    <label>{pick('รูปหน้าปก (URL)', 'Cover Image (URL)')}</label>
                    <div className="pt-cover-input-group">
                      <div
                        className="pt-cover-preview"
                        style={{ backgroundImage: coverPreviewSrc ? `url(${coverPreviewSrc})` : 'none' }}
                      >
                        {!coverPreviewSrc && <ImageIcon size={24} style={{ opacity: 0.3 }} />}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.6rem', fontWeight: 'bold' }}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {pick('อัปโหลดรูปจากไฟล์', 'Upload Image File')}
                        </button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept="image/*"
                          onChange={handleImageUpload}
                        />
                        <input
                          type="text"
                          className="pt-input"
                          placeholder="https://..."
                          value={meta.coverUrl}
                          onChange={(e) => {
                            if (coverPreviewUrl) {
                              URL.revokeObjectURL(coverPreviewUrl);
                              setCoverPreviewUrl('');
                            }
                            setCoverFile(null);
                            setMeta({ ...meta, coverUrl: e.target.value });
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {coverFile
                            ? pick('ไฟล์ที่เลือกจะถูกอัปโหลดและบันทึกตอนกด Save Template', 'The selected file will be uploaded and saved when you click Save Template.')
                            : pick('ถ้าไม่ใส่ URL หรืออัปโหลดไฟล์ ระบบจะใช้รูปเพลงแรกหรือรูป default ของ template', 'If you do not add a URL or upload a file, the first song cover or the default template cover will be used.')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-form-row">
                    <div className="pt-form-group">
                      <label>{pick('สิทธิ์การมองเห็น', 'Visibility')}</label>
                      <select
                        className="pt-select"
                        value={meta.visibility}
                        onChange={(e) => setMeta({ ...meta, visibility: e.target.value })}
                      >
                        <option value="public">{pick('🌍 สาธารณะ', '🌍 Public')}</option>
                        <option value="unlisted">{pick('🔗 ซ่อน (มีลิ้งค์เข้าได้)', '🔗 Unlisted')}</option>
                        <option value="private">{pick('🔒 ส่วนตัว', '🔒 Private')}</option>
                      </select>
                    </div>

                    <div className="pt-form-group">
                      <label>{pick('โหมดที่รองรับ', 'Supported Modes')}</label>
                      <select
                        className="pt-select"
                        value={meta.modeScope}
                        onChange={(e) => setMeta({ ...meta, modeScope: e.target.value })}
                      >
                        <option value="all">{pick('🎯 Quiz & ⚔️ Vote', 'All Modes')}</option>
                        <option value="quiz">{pick('🎯 Quiz เท่านั้น', 'Quiz Only')}</option>
                        <option value="vote">{pick('⚔️ Vote เท่านั้น', 'Vote Only')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right Panel: Playlist */}
          <section className="pt-builder-right-panel">
            <div className="pt-playlist-header">
              <h2><LayoutGrid size={20} /> {pick('เพลย์ลิสต์ปัจจุบัน', 'Current Playlist')}</h2>
              <span className="pt-playlist-count">{items.length} {pick('เพลง', 'songs')}</span>
            </div>

            <div className="pt-playlist-body">
              {items.length === 0 ? (
                <div className="pt-playlist-empty">
                  <div className="pt-empty-icon-wrapper">
                    <Music size={48} />
                  </div>
                  <h3>{pick('เพลย์ลิสต์ยังว่างอยู่', 'Playlist is empty')}</h3>
                  <p>{pick('ค้นหาเพลงจากแท็บด้านซ้ายเพื่อเพิ่มเข้าเพลย์ลิสต์', 'Search for songs on the left to build your list.')}</p>
                </div>
              ) : (
                <div className="pt-playlist-tracks">
                  {items.map((item, index) => (
                    <div key={(item.songId ?? item.id ?? index)} className="pt-track-item">
                      <div className="pt-track-drag-handle">
                        <GripVertical size={18} />
                      </div>
                      <div className="pt-track-number">{index + 1}</div>
                      <div className="pt-track-content">
                        <h4>{item.songTitle || item.title}</h4>
                        <p>
                          {item.artistName || item.artist}
                          {(item.sourceTitleName || item.source) && (
                            <> &bull; {item.sourceTitleName || item.source}</>
                          )}
                          {!isTemplateItemPlayable(item) && (
                            <span style={{ marginLeft: '0.4rem', color: 'var(--color-warning-text, #d97706)' }}>
                              {pick('• เล่นจริงไม่ได้', '• not playable')}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        className="pt-track-delete"
                        onClick={() => handleRemoveItem(index)}
                        title={pick('ลบออก', 'Remove')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
