import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Save, Search, Plus, Trash2, GripVertical, Settings, ListPlus,
  Music, LayoutGrid, Info, Image as ImageIcon, Loader2, Youtube,
  CheckCircle, AlertTriangle, XCircle, Play,
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
  resolvePartyYoutubeUrl,
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
  youtubePlaylistItemsToTemplateItems,
} from '@/features/party/lib/partyTemplateUtils';
import {
  normalizeYoutubeVideoPayload,
  normalizeYoutubePlaylistPayload,
  getYoutubePlaybackLabel,
  getYoutubePlaybackStatusClass,
  isYoutubeTemplateItem,
} from '@/features/party/lib/partyYoutube';
import { PartyYouTubePlayer } from '@/features/party/components/PartyYouTubePlayer';
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

  // YouTube import state
  const [ytInput, setYtInput] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState(null);
  const [ytPreview, setYtPreview] = useState(null); // { type: 'video'|'playlist', data: ... }
  const [ytTestState, setYtTestState] = useState(null); // null | 'testing' | 'ok' | 'error'

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

  // Reset live test state whenever preview changes
  useEffect(() => { setYtTestState(null); }, [ytPreview]);

  // ── YouTube import handlers ─────────────────────────────────────

  const handleYtPreview = useCallback(async () => {
    const url = ytInput.trim();
    if (!url) return;
    setYtLoading(true);
    setYtError(null);
    setYtPreview(null);
    try {
      const result = await resolvePartyYoutubeUrl(url, { maxItems: 50 });
      if (result?.type === 'video') {
        setYtPreview({ type: 'video', data: normalizeYoutubeVideoPayload(result.video, 0) });
      } else if (result?.type === 'playlist') {
        const { playlist, items: ytItems } = normalizeYoutubePlaylistPayload(result.playlist, 0);
        setYtPreview({ type: 'playlist', data: { playlist, items: ytItems } });
      } else {
        setYtError(pick('ไม่รู้จัก URL นี้', 'Unrecognised URL format.'));
      }
    } catch (err) {
      const code = err?.code;
      if (code === 'invalid_url') setYtError(pick('URL ไม่ถูกต้อง กรุณาวาง YouTube link', 'Invalid URL. Please paste a YouTube link.'));
      else if (code === 'not_found') setYtError(pick('ไม่พบวิดีโอ/playlist นี้', 'Video or playlist not found.'));
      else if (code === 'quota_exceeded') setYtError(pick('YouTube API quota หมด กรุณาลองใหม่ภายหลัง', 'YouTube API quota exceeded. Try again later.'));
      else setYtError(err?.message || pick('โหลดข้อมูลไม่สำเร็จ', 'Failed to load YouTube data.'));
    } finally {
      setYtLoading(false);
    }
  }, [ytInput, pick]);

  const handleYtImportVideo = useCallback((videoItem) => {
    const isDupe = items.some(
      (it) => it.providerMediaId === videoItem.provider_media_id
             || (it.provider_media_id === videoItem.provider_media_id)
    );
    if (isDupe) {
      toast(pick('วิดีโอนี้มีในเพลย์ลิสต์แล้ว', 'This video is already in the playlist.'));
      return;
    }
    const mapped = mapTemplateItemFromDb({ ...videoItem, id: null, template_id: null }, items.length);
    setItems((prev) => [...prev, { ...mapped, position: prev.length }]);
    setYtPreview(null);
    setYtInput('');
    toast.success(pick('เพิ่มวิดีโอ YouTube แล้ว', 'YouTube video added.'));
  }, [items, pick]);

  const handleYtImportPlaylist = useCallback((ytItems, skipDuplicates = true) => {
    const existingProviderIds = new Set(
      items.map((it) => it.providerMediaId || it.provider_media_id).filter(Boolean)
    );
    const toAdd = skipDuplicates
      ? ytItems.filter((it) => !existingProviderIds.has(it.provider_media_id))
      : ytItems;

    if (toAdd.length === 0) {
      toast(pick('ไม่มีเพลงใหม่ที่จะเพิ่ม (ซ้ำทั้งหมด)', 'No new songs to add (all duplicates).'));
      return;
    }
    const offset = items.length;
    const mapped = youtubePlaylistItemsToTemplateItems(toAdd, offset)
      .map((row, i) => mapTemplateItemFromDb({ ...row, id: null, template_id: null }, offset + i));
    setItems((prev) => [...prev, ...mapped]);
    setYtPreview(null);
    setYtInput('');
    toast.success(pick(`เพิ่ม ${toAdd.length} เพลงจาก YouTube Playlist`, `Added ${toAdd.length} songs from YouTube Playlist.`));
  }, [items, pick]);

  const handleSave = async () => {
    if (!user) {
      toast.error(pick('กรุณาเข้าสู่ระบบก่อน', 'Please log in first.'));
      return;
    }

    // Save gate: only check total song count, not playable count.
    // Templates with blocked/unknown YouTube items can still be saved.
    const validation = validateTemplateForMode(items, meta.modeScope);
    if (!validation.valid) {
      toast.error(validation.reason);
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

      // Determine source_type from items
      const hasYt = items.some((it) => isYoutubeTemplateItem(it));
      const hasCatalog = items.some((it) => !isYoutubeTemplateItem(it));
      const sourceType = hasYt && hasCatalog ? 'mixed' : hasYt ? 'youtube' : 'catalog';

      // Preserve provider fields for YouTube items; use catalog mapper for catalog items
      const dbItems = items.map((item, index) =>
        isYoutubeTemplateItem(item)
          ? { ...item, position: index }
          : catalogSongToTemplateItem(item, index)
      );

      if (editTemplateId) {
        await updatePartyTemplate(editTemplateId, {
          name: meta.name,
          description: meta.description,
          coverUrl: persistedCoverUrl,
          visibility: meta.visibility,
          modeScope: meta.modeScope,
          presetId: meta.presetId,
          tags: tagsArray,
          sourceType,
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
            sourceType,
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
      <div className="party-page pt-template-builder-bg pt-template-builder-loading">
        <Loader2 size={40} className="animate-spin pt-template-builder-loading__icon" />
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
                  <span className="pt-builder-status-error">
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
            disabled={saving || !validation.valid}
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
                    <div className={`pt-alert pt-builder-playable-alert ${playableValidation.valid ? 'pt-alert-info' : 'pt-alert-warning'}`}>
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
                    <div className="pt-builder-search-loading">
                      <Loader2 size={20} className="animate-spin pt-builder-search-loading__icon" />
                    </div>
                  )}

                  {!searchLoading && searchError && (
                    <div className="pt-alert pt-alert-warning pt-builder-search-error">
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
                                    className="pt-inline-warning-icon">
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
                    <p className="pt-builder-empty-copy">
                      {searchQuery
                        ? pick('ไม่พบเพลงที่ตรงกัน', 'No matching songs found.')
                        : pick('ยังไม่มีเพลงใน catalog', 'No songs in catalog yet.')}
                    </p>
                  )}

                  <hr className="pt-divider" />

                  {/* YouTube Import — v2 */}
                  <div className="pt-youtube-module">
                    <label className="pt-yt-label">
                      <Youtube size={20} className="pt-youtube-icon" />
                      {pick('อิมพอร์ตจาก YouTube', 'Import from YouTube')}
                    </label>

                    <div className="pt-yt-input-row">
                      <input
                        type="text"
                        className="pt-input pt-yt-url-input"
                        placeholder="https://youtube.com/watch?v=... หรือ playlist?list=..."
                        value={ytInput}
                        onChange={(e) => { setYtInput(e.target.value); setYtError(null); setYtPreview(null); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleYtPreview()}
                      />
                      <button
                        className="pt-btn-yt-preview"
                        onClick={handleYtPreview}
                        disabled={ytLoading || !ytInput.trim()}
                      >
                        {ytLoading
                          ? <Loader2 size={16} className="animate-spin" />
                          : <Search size={16} />}
                        {pick('ดูตัวอย่าง', 'Preview')}
                      </button>
                    </div>

                    {ytError && (
                      <div className="pt-alert pt-alert-warning pt-yt-error">
                        <AlertTriangle size={15} />
                        <span>{ytError}</span>
                      </div>
                    )}

                    {/* Video preview */}
                    {ytPreview?.type === 'video' && (() => {
                      const v = ytPreview.data;
                      const playbackStatus = ['ready', 'limited', 'blocked'].includes(v.playback_status)
                        ? v.playback_status
                        : 'blocked';
                      const statusCls = getYoutubePlaybackStatusClass(playbackStatus);
                      return (
                        <>
                        <div className="pt-yt-preview-card">
                          {/* Thumbnail — click to test live playback */}
                          <button
                            className="pt-yt-preview-thumb-btn"
                            onClick={() => { if (ytTestState === null) setYtTestState('testing'); }}
                            disabled={ytTestState !== null}
                            title={ytTestState === null ? pick('คลิกเพื่อทดสอบเล่นจริง', 'Click to test playback') : undefined}
                          >
                            {v.cover_url && <img src={v.cover_url} alt="" className="pt-yt-preview-thumb" />}
                            <div className="pt-yt-preview-thumb-overlay">
                              {ytTestState === null && <Play size={18} fill="white" />}
                              {ytTestState === 'testing' && <Loader2 size={18} className="animate-spin" style={{ color: 'white' }} />}
                              {ytTestState === 'ok' && <CheckCircle size={18} style={{ color: '#16a34a' }} />}
                              {ytTestState === 'error' && <XCircle size={18} style={{ color: '#ef4444' }} />}
                            </div>
                          </button>
                          <div className="pt-yt-preview-info">
                            <p className="pt-yt-preview-title">{v.song_title || pick('ไม่ทราบชื่อ', 'Unknown title')}</p>
                            <p className="pt-yt-preview-channel">{v.artist_name}</p>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <span className={`pt-yt-status-badge pt-yt-status-${statusCls}`}>
                                {statusCls === 'ready' && <CheckCircle size={12} />}
                                {statusCls === 'limited' && <AlertTriangle size={12} />}
                                {statusCls === 'blocked' && <XCircle size={12} />}
                                {getYoutubePlaybackLabel(playbackStatus, pick)}
                              </span>
                              {ytTestState === 'ok' && (
                                <span className="pt-yt-status-badge pt-yt-status-ready">
                                  <CheckCircle size={11} /> {pick('เล่นได้จริง', 'Live: OK')}
                                </span>
                              )}
                              {ytTestState === 'error' && (
                                <span className="pt-yt-status-badge pt-yt-status-blocked">
                                  <XCircle size={11} /> {pick('เล่นไม่ได้', 'Live: Blocked')}
                                </span>
                              )}
                            </div>
                            {statusCls !== 'ready' && (
                              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--pt-text-muted)' }}>
                                {availabilityReason}
                              </p>
                            )}
                          </div>
                          <button
                            className="pt-btn-yt-import-single"
                            onClick={() => handleYtImportVideo(v)}
                            disabled={v.playback_status === 'blocked'}
                          >
                            <Plus size={16} />
                            {pick('เพิ่ม', 'Add')}
                          </button>
                        </div>

                        {/* Live embed test player */}
                        {ytTestState !== null && (
                          <div className="pt-yt-live-test-section">
                            <div className="pt-yt-live-test-player">
                              <PartyYouTubePlayer
                                videoId={v.provider_media_id}
                                playing={ytTestState !== 'error'}
                                muted
                                onReady={() => setYtTestState('ok')}
                                onError={() => setYtTestState('error')}
                              />
                              {ytTestState === 'testing' && (
                                <div className="pt-yt-live-overlay pt-yt-live-overlay--loading">
                                  <Loader2 size={22} className="animate-spin" />
                                  <span>{pick('กำลังทดสอบ...', 'Testing...')}</span>
                                </div>
                              )}
                              {ytTestState === 'error' && (
                                <div className="pt-yt-live-overlay pt-yt-live-overlay--error">
                                  <XCircle size={32} />
                                  <span>{pick('เล่นไม่ได้ในเบราว์เซอร์', 'Cannot embed')}</span>
                                </div>
                              )}
                            </div>
                            <div className="pt-yt-live-test-status">
                              {ytTestState === 'testing' && (
                                <span className="pt-yt-status-badge pt-yt-status-unknown">
                                  <Loader2 size={11} className="animate-spin" /> {pick('กำลังโหลด...', 'Loading...')}
                                </span>
                              )}
                              {ytTestState === 'ok' && (
                                <span className="pt-yt-status-badge pt-yt-status-ready">
                                  <CheckCircle size={12} /> {pick('ทดสอบผ่าน — เล่นได้จริงในเบราว์เซอร์นี้', 'Test passed — plays OK in this browser')}
                                </span>
                              )}
                              {ytTestState === 'error' && (
                                <span className="pt-yt-status-badge pt-yt-status-blocked">
                                  <XCircle size={12} /> {pick('ทดสอบไม่ผ่าน — embed ถูกบล็อก', 'Test failed — embed blocked')}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Alert — updates based on live test result */}
                        {ytTestState === 'error' ? (
                          <div className="pt-alert pt-alert-warning">
                            <XCircle size={15} />
                            <span>{pick('ทดสอบแล้ว: เล่นในเบราว์เซอร์ไม่ได้ — ไม่ควร import คลิปนี้', 'Live test failed: embed blocked — do not import this clip.')}</span>
                          </div>
                        ) : ytTestState === 'ok' ? (
                          <div className="pt-alert pt-alert-info">
                            <CheckCircle size={15} />
                            <span>{pick('ทดสอบแล้ว: เล่นได้จริงในเบราว์เซอร์นี้ — ปลอดภัยที่จะ import', 'Live test passed: plays OK here — safe to import.')}</span>
                          </div>
                        ) : statusCls === 'ready' ? (
                          <div className="pt-alert pt-alert-info" style={{ opacity: 0.8 }}>
                            <CheckCircle size={15} />
                            <span>{pick('API บอกพร้อมเล่น — กด ▶ บนรูปเพื่อยืนยันก่อน import', 'API says ready — click ▶ on thumbnail to verify before importing.')}</span>
                          </div>
                        ) : statusCls === 'limited' ? (
                          <div className="pt-alert pt-alert-warning">
                            <AlertTriangle size={15} />
                            <span>{pick('คลิปนี้มีข้อจำกัด — กด ▶ บนรูปเพื่อทดสอบก่อน import', 'Limited playback — click ▶ to test before importing.')}</span>
                          </div>
                        ) : (
                          <div className="pt-alert pt-alert-warning">
                            <XCircle size={15} />
                            <span>{pick('คลิปนี้ถูกบล็อกและจะไม่เล่นในเกม จึงไม่ควรใช้', 'This clip is blocked and will not play in-game.')}</span>
                          </div>
                        )}
                        </>
                      );
                    })()}

                    {/* Playlist preview */}
                    {ytPreview?.type === 'playlist' && (() => {
                      const { playlist, items: ytItems } = ytPreview.data;
                      const ready = ytItems.filter((i) => i.playback_status === 'ready').length;
                      const limited = ytItems.filter((i) => i.playback_status === 'limited').length;
                      const blocked = ytItems.filter((i) => i.playback_status === 'blocked').length;
                      const playable = ready + limited;
                      return (
                        <div className="pt-yt-playlist-preview">
                          <div className="pt-yt-playlist-header">
                            {playlist.thumbnailUrl && (
                              <img src={playlist.thumbnailUrl} alt="" className="pt-yt-playlist-cover" />
                            )}
                            <div className="pt-yt-playlist-meta">
                              <p className="pt-yt-preview-title">{playlist.title}</p>
                              <p className="pt-yt-preview-channel">{playlist.channelTitle}</p>
                              <p className="pt-yt-playlist-stats">
                                <span className="pt-yt-stat-ready"><CheckCircle size={12} /> Ready {ready}</span>
                                {limited > 0 && <span className="pt-yt-stat-limited"><AlertTriangle size={12} /> YT Limited {limited}</span>}
                                {blocked > 0 && <span className="pt-yt-stat-blocked"><XCircle size={12} /> YT Blocked {blocked}</span>}
                              </p>
                            </div>
                          </div>

                          <div className={`pt-alert ${blocked > 0 || limited > 0 ? 'pt-alert-warning' : 'pt-alert-info'}`}>
                            {blocked > 0 || limited > 0 ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
                            <span>
                              {pick(
                                `พร้อมเล่นจริง ${ready} เพลง${limited > 0 ? `, จำกัด ${limited}` : ''}${blocked > 0 ? `, บล็อก ${blocked}` : ''} — ปุ่ม Import playable songs จะดึงเฉพาะเพลงที่พร้อมเล่นจริง`,
                                `Ready: ${ready}${limited > 0 ? `, limited: ${limited}` : ''}${blocked > 0 ? `, blocked: ${blocked}` : ''} — "Import playable songs" only imports tracks that are ready for real matches.`,
                              )}
                            </span>
                          </div>

                          <div className="pt-yt-playlist-items-preview">
                            {ytItems.slice(0, 8).map((it, idx) => {
                              const displayStatus = ['ready', 'limited', 'blocked'].includes(it.playback_status)
                                ? it.playback_status
                                : 'blocked';
                              const sc = getYoutubePlaybackStatusClass(displayStatus);
                              return (
                                <div key={it.provider_media_id || idx} className={`pt-yt-preview-row pt-yt-preview-row--${sc}`}>
                                  {it.cover_url && <img src={it.cover_url} alt="" className="pt-yt-row-thumb" />}
                                  <span className="pt-yt-row-title">{it.song_title}</span>
                                  <span className={`pt-yt-row-status pt-yt-status-${sc}`}>
                                    {sc === 'ready' && <CheckCircle size={11} />}
                                    {sc === 'limited' && <AlertTriangle size={11} />}
                                    {sc === 'blocked' && <XCircle size={11} />}
                                    <span>{getYoutubePlaybackLabel(displayStatus, pick)}</span>
                                  </span>
                                </div>
                              );
                            })}
                            {ytItems.length > 8 && (
                              <p className="pt-yt-preview-more">
                                +{ytItems.length - 8} {pick('รายการ', 'more')}
                              </p>
                            )}
                          </div>

                          {playable === 0 && (
                            <div className="pt-alert pt-alert-warning">
                              <AlertTriangle size={15} />
                              <span>{pick('ไม่มีเพลงที่เล่นได้ใน playlist นี้', 'No playable songs in this playlist.')}</span>
                            </div>
                          )}

                          <div className="pt-yt-import-actions">
                            <button
                              className="party-gradient-action pt-btn-yt-import-all"
                              onClick={() => handleYtImportPlaylist(ytItems, true)}
                              disabled={playable === 0}
                            >
                              <Plus size={16} />
                              {pick(`Import ${playable} เพลงที่เล่นได้`, `Import ${playable} playable songs`)}
                            </button>
                            {blocked > 0 && (
                              <button
                                className="pt-btn-yt-import-all-force"
                                onClick={() => handleYtImportPlaylist(ytItems, false)}
                              >
                                {pick(`Import ทั้งหมด ${ytItems.length} (รวม blocked)`, `Import all ${ytItems.length} (incl. blocked)`)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
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
                        {!coverPreviewSrc && <ImageIcon size={24} className="pt-cover-preview__placeholder" />}
                      </div>
                      <div className="pt-cover-input-stack">
                        <button
                          type="button"
                          className="btn-secondary pt-cover-upload-button"
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
                        <span className="pt-cover-help-text">
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
                  {items.map((item, index) => {
                    const isYt = isYoutubeTemplateItem(item);
                    const playable = isTemplateItemPlayable(item);
                    const status = item.playbackStatus || item.playback_status || 'unknown';
                    const normalizedYtStatus = ['ready', 'limited', 'blocked'].includes(status) ? status : 'blocked';
                    const statusKind = isYt ? normalizedYtStatus : (playable ? 'ready' : 'blocked');
                    const statusLabel = isYt
                      ? getYoutubePlaybackLabel(normalizedYtStatus, pick)
                      : (playable ? pick('พร้อมเล่น', 'Ready') : pick('เล่นไม่ได้', 'Not playable'));
                    const coverSrc = item.coverUrl || item.cover_url || '';
                    const trackKey = isYt
                      ? (item.providerMediaId || item.provider_media_id || index)
                      : (item.songId ?? item.id ?? index);
                    return (
                      <div key={trackKey} className={`pt-track-item${!playable ? ' pt-track-item--unplayable' : ''}`}>
                        <div className="pt-track-drag-handle">
                          <GripVertical size={18} />
                        </div>
                        <div className="pt-track-number">{index + 1}</div>
                        <div className="pt-track-thumb-slot">
                          {coverSrc ? (
                            <img src={coverSrc} alt="" className="pt-track-yt-thumb" />
                          ) : (
                            <div className="pt-track-thumb-fallback" aria-hidden="true">
                              {isYt ? <Youtube size={18} /> : <Music size={18} />}
                            </div>
                          )}
                        </div>
                        <div className="pt-track-content">
                          <div className="pt-track-title-row">
                            <h4>{item.songTitle || item.title}</h4>
                            {isYt && (
                              <span className="pt-track-yt-badge">
                                <Youtube size={11} /> YT
                              </span>
                            )}
                          </div>
                          <p>
                            {item.artistName || item.artist}
                            {(item.sourceTitleName || item.source) && !isYt && (
                              <> &bull; {item.sourceTitleName || item.source}</>
                            )}
                            {isYt && status === 'blocked' && (
                              <span className="pt-track-warning-copy">
                                <XCircle size={11} /> {pick('บล็อก', 'blocked')}
                              </span>
                            )}
                            {isYt && status === 'limited' && (
                              <span className="pt-track-limited-copy">
                                <AlertTriangle size={11} /> {pick('จำกัด', 'limited')}
                              </span>
                            )}
                            {!isYt && !playable && (
                              <span className="pt-track-warning-copy">
                                {pick('• เล่นจริงไม่ได้', '• not playable')}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="pt-track-status-col">
                          <span className={`pt-track-status-pill pt-track-status-pill--${statusKind}`}>
                            {statusKind === 'ready' && <CheckCircle size={12} />}
                            {statusKind === 'limited' && <AlertTriangle size={12} />}
                            {statusKind === 'blocked' && <XCircle size={12} />}
                            {statusLabel}
                          </span>
                        </div>
                        {isYt && status === 'ready' && (
                          <CheckCircle size={14} className="pt-track-ready-icon" title={pick('พร้อมเล่น', 'Ready')} />
                        )}
                        <button
                          className="pt-track-delete"
                          onClick={() => handleRemoveItem(index)}
                          title={pick('ลบออก', 'Remove')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
