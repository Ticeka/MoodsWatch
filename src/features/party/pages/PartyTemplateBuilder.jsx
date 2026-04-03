import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { PARTY_PRESETS, resolvePartySourceTitleName } from '@/features/party/lib/partyEngine';
import {
  searchPartyTemplateCatalog,
  searchPartySourceTitles,
  suggestPartyTemplateItemSource,
  createPartyTemplate,
  updatePartyTemplate,
  replacePartyTemplateItems,
  fetchPartyTemplateDetail,
  uploadPartyTemplateCover,
  resolvePartyYoutubeUrl,
} from '@/features/party/lib/partyRemote';
import {
  analyzePartyTemplateCompatibility,
  catalogSongToTemplateItem,
  getTemplateResolvedSource,
  resolveTemplateCoverUrl,
  getTemplatePlayableCount,
  isTemplateItemPlayable,
  mapTemplateItemFromDb,
  sanitizeTemplateCoverUrl,
  validateTemplateForMode,
  youtubePlaylistItemsToTemplateItems,
} from '@/features/party/lib/partyTemplateUtils';
import {
  applyYoutubeSourceSuggestion,
		normalizeYoutubeVideoPayload,
		normalizeYoutubePlaylistPayload,
		getYoutubeAvailabilityReasonLabel,
	getYoutubePlaybackLabel,
	  getYoutubePlaybackStatusClass,
	  isYoutubeTemplateItem,
	} from '@/features/party/lib/partyYoutube';
import {
  PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE,
  PARTY_TEMPLATE_SOURCE_MATCH_METHOD,
  PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS,
} from '@/features/party/lib/partyTemplateSchema';
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

function getTemplateCompatibilityCopy(reason) {
  if (!reason) {
    return '';
  }

  if (reason.code === 'insufficient_playable_songs') {
    return `${reason.label} needs at least ${reason.requiredCount} playable songs, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_distinct_sources') {
    return `${reason.label} needs at least ${reason.requiredCount} distinct source titles, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_answerable_songs') {
    return reason.message;
  }

  if (reason.code === 'missing_source_metadata') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} still need a usable source title.`;
  }

  if (reason.code === 'missing_song_titles') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} still need a song title.`;
  }

  return reason.message;
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
  const [itemFilter, setItemFilter] = useState('all');
  const [activeSourceSearchIndex, setActiveSourceSearchIndex] = useState(-1);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [sourceSearchResults, setSourceSearchResults] = useState([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);

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
          // base (clone) - pre-fill all editable fields, reset name prefix
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
      .catch(() => toast.error(pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load template')))
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

  // Catalog search - runs on mount (empty query = popular songs) and on every debounced change
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

  const handleUpdateItemSourceTitle = useCallback((index, nextValue) => {
    setItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? {
          ...item,
          sourceTitleName: nextValue,
          source_title_name: nextValue,
          source: nextValue,
        }
        : item
    )));
  }, []);

  const handleApplySourceSuggestion = useCallback((index) => {
    setItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) {
        return item;
      }

      const resolvedSource = getTemplateResolvedSource(item);
      if (!resolvedSource.resolvedSourceTitleId || !resolvedSource.resolvedSourceTitleName) {
        return item;
      }

      return {
        ...item,
        sourceTitleId: resolvedSource.resolvedSourceTitleId,
        source_title_id: resolvedSource.resolvedSourceTitleId,
        sourceTitleName: resolvedSource.answerableSourceTitleName || item.sourceTitleName || '',
        source_title_name: resolvedSource.answerableSourceTitleName || item.source_title_name || '',
        resolvedSourceTitleId: resolvedSource.resolvedSourceTitleId,
        resolved_source_title_id: resolvedSource.resolvedSourceTitleId,
        resolvedSourceTitleName: resolvedSource.resolvedSourceTitleName,
        resolved_source_title_name: resolvedSource.resolvedSourceTitleName,
        sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
        source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
        sourceMatchMethod: item.sourceMatchMethod || PARTY_TEMPLATE_SOURCE_MATCH_METHOD.MANUAL,
        source_match_method: item.source_match_method || PARTY_TEMPLATE_SOURCE_MATCH_METHOD.MANUAL,
        sourceMatchConfidence: item.sourceMatchConfidence || PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH,
        source_match_confidence: item.source_match_confidence || PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH,
      };
    }));
  }, []);

  const handleLinkManualSource = useCallback((index, sourceCandidate) => {
    setItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? {
          ...item,
          sourceTitleId: sourceCandidate.resolvedSourceTitleId,
          source_title_id: sourceCandidate.resolvedSourceTitleId,
          sourceTitleName: sourceCandidate.resolvedSourceTitleName,
          source_title_name: sourceCandidate.resolvedSourceTitleName,
          resolvedSourceTitleId: sourceCandidate.resolvedSourceTitleId,
          resolved_source_title_id: sourceCandidate.resolvedSourceTitleId,
          resolvedSourceTitleName: sourceCandidate.resolvedSourceTitleName,
          resolved_source_title_name: sourceCandidate.resolvedSourceTitleName,
          sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
          source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
          sourceMatchConfidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH,
          source_match_confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH,
          sourceMatchMethod: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.MANUAL,
          source_match_method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.MANUAL,
        }
        : item
    )));
    setActiveSourceSearchIndex(-1);
    setSourceSearchQuery('');
    setSourceSearchResults([]);
  }, []);

  const handleClearSourceLink = useCallback((index) => {
    setItems((prev) => prev.map((item, itemIndex) => (
      itemIndex === index
        ? {
          ...item,
          sourceTitleId: null,
          source_title_id: null,
          resolvedSourceTitleId: null,
          resolved_source_title_id: null,
          resolvedSourceTitleName: '',
          resolved_source_title_name: '',
          sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
          source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
          sourceMatchConfidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
          source_match_confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
          sourceMatchMethod: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
          source_match_method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
        }
        : item
    )));
  }, []);

  // Reset live test state whenever preview changes
  useEffect(() => { setYtTestState(null); }, [ytPreview]);

  useEffect(() => {
    if (activeSourceSearchIndex < 0 || !sourceSearchQuery.trim()) {
      setSourceSearchResults([]);
      setSourceSearchLoading(false);
      return undefined;
    }

    let ignore = false;
    setSourceSearchLoading(true);
    searchPartySourceTitles(sourceSearchQuery, { limit: 8 })
      .then((results) => {
        if (!ignore) {
          setSourceSearchResults(results);
        }
      })
      .catch(() => {
        if (!ignore) {
          setSourceSearchResults([]);
        }
      })
      .finally(() => {
        if (!ignore) {
          setSourceSearchLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeSourceSearchIndex, sourceSearchQuery]);

  useEffect(() => {
    const nextIndex = items.findIndex((item) => {
      if (!isYoutubeTemplateItem(item)) {
        return false;
      }

      const resolvedSource = getTemplateResolvedSource(item);
      return (
        isTemplateItemPlayable(item)
        && resolvedSource.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED
        && resolvedSource.resolvedSourceTitleId <= 0
      );
    });

    if (nextIndex < 0) {
      return undefined;
    }

    let cancelled = false;
    void suggestPartyTemplateItemSource(items[nextIndex])
      .then((suggestion) => {
        if (cancelled || !suggestion) {
          return;
        }

        setItems((prev) => prev.map((item, itemIndex) => (
          itemIndex === nextIndex
            ? mapTemplateItemFromDb(
              applyYoutubeSourceSuggestion(item, suggestion),
              itemIndex,
            )
            : item
        )));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [items]);

  // -- YouTube import handlers ------------------------------------------------

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
        setYtError(pick('รูปแบบ URL ไม่รู้จัก', 'Unrecognised URL format.'));
      }
    } catch (err) {
      const code = err?.code;
      if (code === 'invalid_url') setYtError(pick('URL ไม่ถูกต้อง กรุณาวาง YouTube link', 'Invalid URL. Please paste a YouTube link.'));
      else if (code === 'not_found') setYtError(pick('ไม่พบวิดีโอหรือเพลย์ลิสต์', 'Video or playlist not found.'));
      else if (code === 'quota_exceeded') setYtError(pick('โควต้า YouTube API หมด ลองใหม่ภายหลัง', 'YouTube API quota exceeded. Try again later.'));
      else setYtError(err?.message || pick('โหลดข้อมูล YouTube ไม่สำเร็จ', 'Failed to load YouTube data.'));
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
      toast(pick('วิดีโอนี้อยู่ในเพลย์ลิสต์แล้ว', 'This video is already in the playlist.'));
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
      toast(pick('ไม่มีเพลงใหม่ (ซ้ำทั้งหมด)', 'No new songs to add (all duplicates).'));
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
      toast.error(pick('กรุณาใส่ชื่อเทมเพลต', 'Please enter a name.'));
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
          ? {
            ...item,
            sourceTitleName: resolvePartySourceTitleName(item),
            source_title_name: resolvePartySourceTitleName(item),
            position: index,
          }
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
        toast.success(pick('บันทึกเทมเพลตแล้ว!', 'Template saved!'));
        navigate(`/party/templates/${editTemplateId}`);
      } else {
        const displayName = user.profile?.name
          || user.profile?.username
          || user.user_metadata?.display_name
          || user.user_metadata?.full_name
          || user.user_metadata?.username
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
        toast.success(pick('สร้างเทมเพลตแล้ว!', 'Template created!'));
        navigate(`/party/templates/${created.id}`);
      }
    } catch (err) {
      toast.error(err?.message || pick('บันทึกไม่สำเร็จ', 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const validation = validateTemplateForMode(items, meta.modeScope);
  const templateCompatibility = useMemo(() => analyzePartyTemplateCompatibility(items), [items]);
  const playableCount = getTemplatePlayableCount(items);
  const coverPreviewSrc = coverPreviewUrl || resolveTemplateCoverUrl(meta.coverUrl, items);
  const filteredItems = useMemo(() => items.filter((item) => {
    if (itemFilter === 'all') {
      return true;
    }

    const resolvedSource = getTemplateResolvedSource(item);
    if (itemFilter === 'unresolved') {
      return isYoutubeTemplateItem(item) && resolvedSource.sourceResolutionStatus !== PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED;
    }

    if (itemFilter === 'classic-ready') {
      return resolvedSource.isClassicResolved;
    }

    return true;
  }), [itemFilter, items]);

  if (loadingBase) {
    return (
      <div className="party-page pt-template-builder-bg pt-template-builder-loading">
        <Loader2 size={40} className="animate-spin pt-template-builder-loading__icon" />
      </div>
    );
  }

  return (
    <div className="party-page pt-template-builder-bg">
      <div className="pt-builder-container">
        {/* Header Bar */}
        <header className="pt-builder-header">
          <div className="pt-builder-title-group">
            <button className="pt-btn-back" onClick={() => navigate('/party/templates')}>
              &larr; {pick('Back', 'Back')}
            </button>
            <div className="pt-builder-title-text">
              <h1>{meta.name || pick('ตั้งชื่อเพลย์ลิสต์...', 'Name your playlist...')}</h1>
              <p>
                {items.length} {pick('เพลงที่เลือก', 'songs selected')}
	                {!validation.valid && (
	                  <span className="pt-builder-status-error">
	                    - {validation.reason}
	                  </span>
		                )}
              </p>
            </div>
          </div>
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
                    <label>{pick('ค้นหาในคลัง', 'Search Catalog')}</label>
                    <div className="party-search-box party-search-box-large">
                      <Search size={20} className="search-icon" />
                      <input
                        type="text"
                        placeholder={pick('พิมพ์ชื่อเพลงหรืออนิเมะ...', 'Type song or anime name...')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="pt-alert pt-builder-playable-alert">
                      <Info size={16} />
                      <span>
                        {templateCompatibility.compatiblePresets.length > 0 || templateCompatibility.voteResult.compatible
                          ? pick(
                            `${templateCompatibility.playableSongCount} songs are playable. You can start Quiz / Vote Battle now.`,
                            `${templateCompatibility.playableSongCount} songs are playable. You can start Quiz / Vote Battle now.`,
                          )
                          : pick(
                            `Only ${templateCompatibility.playableSongCount} songs are currently playable. Add a few more playable songs to start matches.`,
                            `Only ${templateCompatibility.playableSongCount} songs are currently playable. Add a few more playable songs to start matches.`,
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
	                                  <span title={pick('ไม่มีไฟล์วิดีโอ อาจไม่เล่นในเกม', 'No video file - may not play in game')}
	                                    className="pt-inline-warning-icon">
	                                    !
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
                        : pick('ยังไม่มีเพลงในคลัง', 'No songs in catalog yet.')}
                    </p>
                  )}

                  <hr className="pt-divider" />

	                  {/* YouTube Import - v2 */}
                  <div className="pt-youtube-module">
                    <label className="pt-yt-label">
                      <Youtube size={20} className="pt-youtube-icon" />
                      {pick('นำเข้าจาก YouTube', 'Import from YouTube')}
                    </label>

                    <div className="pt-yt-input-row">
                      <input
                        type="text"
                        className="pt-input pt-yt-url-input"
	                        placeholder="https://youtube.com/watch?v=... or playlist?list=..."
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
	                      const availabilityReason = getYoutubeAvailabilityReasonLabel(
	                        v.metadata_json?.availabilityReason || playbackStatus,
	                        pick,
	                      );
	                      return (
                        <>
                        <div className="pt-yt-preview-card">
	                          {/* Thumbnail - click to test live playback */}
                          <button
                            className="pt-yt-preview-thumb-btn"
                            onClick={() => { if (ytTestState === null) setYtTestState('testing'); }}
                            disabled={ytTestState !== null}
                            title={ytTestState === null ? pick('คลิกเพื่อทดสอบการเล่น', 'Click to test playback') : undefined}
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
                                  <CheckCircle size={11} /> {pick('ทดสอบ: ผ่าน', 'Live: OK')}
                                </span>
                              )}
                              {ytTestState === 'error' && (
                                <span className="pt-yt-status-badge pt-yt-status-blocked">
                                  <XCircle size={11} /> {pick('ทดสอบ: บล็อก', 'Live: Blocked')}
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
                                  <span>{pick('ฝังไม่ได้', 'Cannot embed')}</span>
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
	                                  <CheckCircle size={12} /> {pick('ผ่าน - เล่นได้ในเบราว์เซอร์นี้', 'Test passed - plays OK in this browser')}
                                </span>
                              )}
                              {ytTestState === 'error' && (
                                <span className="pt-yt-status-badge pt-yt-status-blocked">
	                                  <XCircle size={12} /> {pick('ล้มเหลว - ถูกบล็อกการฝัง', 'Test failed - embed blocked')}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {ytTestState === 'error' && (
                          <div className="pt-alert pt-alert-warning">
                            <XCircle size={15} />
                            <span>{pick('ทดสอบสดไม่ผ่าน วิดีโอนี้ถูกบล็อกการฝัง', 'Live test failed: this video is embed-blocked.')}</span>
                          </div>
                        )}
                        {ytTestState === null && statusCls === 'blocked' && (
                          <div className="pt-alert pt-alert-warning">
                            <XCircle size={15} />
                            <span>{pick('API แจ้งว่าเพลงนี้มีโอกาสเล่นไม่ได้ในเกม', 'API indicates this clip may not play in matches.')}</span>
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
	                                `พร้อมเล่นจริง ${ready} เพลง${limited > 0 ? `, จำกัด ${limited}` : ''}${blocked > 0 ? `, บล็อก ${blocked}` : ''} - ปุ่ม Import playable songs จะดึงเฉพาะเพลงที่พร้อมเล่นจริง`,
	                                `Ready: ${ready}${limited > 0 ? `, limited: ${limited}` : ''}${blocked > 0 ? `, blocked: ${blocked}` : ''} - "Import playable songs" only imports tracks that are ready for real matches.`,
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
                                +{ytItems.length - 8} {pick('เพิ่มเติม', 'more')}
                              </p>
                            )}
                          </div>

                          {playable === 0 && (
                            <div className="pt-alert pt-alert-warning">
                              <AlertTriangle size={15} />
                              <span>{pick('ไม่มีเพลงที่เล่นได้ในเพลย์ลิสต์นี้', 'No playable songs in this playlist.')}</span>
                            </div>
                          )}

                          <div className="pt-yt-import-actions">
                            <button
                              className="party-gradient-action pt-btn-yt-import-all"
                              onClick={() => handleYtImportPlaylist(ytItems, true)}
                              disabled={playable === 0}
                            >
                              <Plus size={16} />
                              {pick(`นำเข้า ${playable} เพลงที่เล่นได้`, `Import ${playable} playable songs`)}
                            </button>
                            {blocked > 0 && (
                              <button
                                className="pt-btn-yt-import-all-force"
                                onClick={() => handleYtImportPlaylist(ytItems, false)}
                              >
                                {pick(`นำเข้าทั้งหมด ${ytItems.length} (รวมที่บล็อก)`, `Import all ${ytItems.length} (incl. blocked)`)}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {meta.modeScope !== 'vote' && (
                    <div className="pt-form-group">
                      <label>{pick('โหมดเกมเริ่มต้น', 'Default Quiz Preset')}</label>
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
                      placeholder={pick('อธิบายเพลย์ลิสต์นี้...', 'Describe this playlist...')}
                    />
                  </div>

                  <div className="pt-form-group">
                    <label>{pick('แท็ก (คั่นด้วยจุลภาค)', 'Tags (comma-separated)')}</label>
                    <input
                      type="text"
                      className="pt-input"
                      value={meta.tags}
                      onChange={(e) => setMeta({ ...meta, tags: e.target.value })}
                      placeholder="Anime, 2010s, OP, Sad..."
                    />
                  </div>

                  <div className="pt-form-group">
                    <label>{pick('ภาพปก (URL)', 'Cover Image (URL)')}</label>
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
                          {pick('อัปโหลดไฟล์ภาพ', 'Upload Image File')}
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
                            ? pick('ไฟล์ที่เลือกจะอัปโหลดเมื่อกด บันทึกเทมเพลต', 'The selected file will be uploaded and saved when you click Save Template.')
                            : pick('หากไม่ใส่ URL หรืออัปโหลดไฟล์ ระบบจะใช้ภาพปกเพลงแรกหรือภาพเริ่มต้น', 'If you do not add a URL or upload a file, the first song cover or the default template cover will be used.')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-form-row">
                    <div className="pt-form-group">
                      <label>{pick('การมองเห็น', 'Visibility')}</label>
                      <select
                        className="pt-select"
                        value={meta.visibility}
                        onChange={(e) => setMeta({ ...meta, visibility: e.target.value })}
                      >
	                        <option value="public">{pick('สาธารณะ', 'Public')}</option>
	                        <option value="unlisted">{pick('ไม่แสดงในรายการ', 'Unlisted')}</option>
	                        <option value="private">{pick('ส่วนตัว', 'Private')}</option>
                      </select>
                    </div>

                    <div className="pt-form-group">
                      <label>{pick('โหมดที่รองรับ', 'Supported Modes')}</label>
                      <select
                        className="pt-select"
                        value={meta.modeScope}
                        onChange={(e) => setMeta({ ...meta, modeScope: e.target.value })}
                      >
                        <option value="all">{pick('ทุกโหมด', 'All Modes')}</option>
                        <option value="quiz">{pick('Quiz Only', 'Quiz Only')}</option>
                        <option value="vote">{pick('Vote Only', 'Vote Only')}</option>
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
	              <div className="pt-playlist-header-actions">
	                <span className="pt-playlist-count">{items.length} {pick('songs', 'songs')}</span>
	                <select className="pt-select pt-select-compact" value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}>
	                  <option value="all">{pick('ทั้งหมด', 'All')}</option>
	                  <option value="unresolved">{pick('ยังไม่ลิงก์', 'Unresolved')}</option>
	                  <option value="classic-ready">{pick('พร้อม Classic', 'Classic-ready')}</option>
	                </select>
	              </div>
	            </div>

            <div className="pt-playlist-body">
              {items.length === 0 ? (
                <div className="pt-playlist-empty">
                  <div className="pt-empty-icon-wrapper">
                    <Music size={48} />
                  </div>
                  <h3>{pick('เพลย์ลิสต์ว่างเปล่า', 'Playlist is empty')}</h3>
                  <p>{pick('ค้นหาเพลงด้านซ้ายเพื่อสร้างรายการ', 'Search for songs on the left to build your list.')}</p>
                </div>
              ) : (
	                <div className="pt-playlist-tracks">
		                  {filteredItems.map((item) => {
		                    const index = items.findIndex((entry) => entry === item);
		                    const isYt = isYoutubeTemplateItem(item);
		                    const playable = isTemplateItemPlayable(item);
		                    const resolvedSource = getTemplateResolvedSource(item);
		                    const resolvedSourceTitleName = resolvePartySourceTitleName(item);
		                    const status = item.playbackStatus || item.playback_status || 'unknown';
	                    const sourceStatus = resolvedSource.sourceResolutionStatus;
	                    const sourceStatusLabel = sourceStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
	                      ? pick('ลิงก์แล้ว', 'Linked')
	                      : sourceStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED
	                        ? pick('มีคำแนะนำ', 'Suggested')
	                        : pick('ยังไม่ลิงก์', 'Unresolved');
	                    const normalizedYtStatus = ['ready', 'limited', 'blocked'].includes(status) ? status : 'blocked';
	                    const statusKind = isYt ? normalizedYtStatus : (playable ? 'ready' : 'blocked');
                    const statusLabel = isYt
                      ? getYoutubePlaybackLabel(normalizedYtStatus, pick)
                      : (playable ? pick('พร้อม', 'Ready') : pick('เล่นไม่ได้', 'Not playable'));
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
	                              <div className="pt-track-title-badges">
	                                <span className="pt-track-yt-badge">
	                                  <Youtube size={11} /> YT
	                                </span>
	                                <span className={`pt-track-source-badge is-${sourceStatus}`}>
	                                  {sourceStatusLabel}
	                                </span>
	                              </div>
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
                                <AlertTriangle size={11} /> {pick('limited', 'limited')}
                              </span>
                            )}
                            {!isYt && !playable && (
                              <span className="pt-track-warning-copy">
	                                {pick('เล่นไม่ได้', 'not playable')}
                              </span>
                            )}
                          </p>
	                          {isYt ? (
	                            <div className="pt-track-source-editor">
	                              <span>{pick('ลิงก์แหล่งที่มา', 'Source linking')}</span>
	                              <input
	                                type="text"
	                                className="pt-input"
	                                value={resolvedSourceTitleName}
	                                onChange={(event) => handleUpdateItemSourceTitle(index, event.target.value)}
	                                placeholder={pick('ข้อความสำรองสำหรับคำตอบ', 'Fallback answer text')}
	                              />
	                              <small>
	                                {resolvedSource.isClassicResolved
	                                  ? pick(`Classic \u0e43\u0e0a\u0e49 ${resolvedSource.resolvedSourceTitleName}`, `Classic uses ${resolvedSource.resolvedSourceTitleName}`)
	                                  : resolvedSource.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED && resolvedSource.resolvedSourceTitleName
	                                    ? pick(`คำแนะนำ: ${resolvedSource.resolvedSourceTitleName}`, `Suggestion: ${resolvedSource.resolvedSourceTitleName}`)
                                    : pick('ยังไม่ลิงก์แหล่งที่มา ระบบจะใช้ชื่อเพลงเป็นคำตอบชั่วคราว', 'Not linked yet. The game will use song title as a temporary fallback answer.')}
	                              </small>
	                              <div className="pt-track-source-actions">
	                                {resolvedSource.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED && resolvedSource.resolvedSourceTitleId > 0 ? (
	                                  <button type="button" className="pt-btn-source-action is-primary" onClick={() => handleApplySourceSuggestion(index)}>
	                                    {pick('ยอมรับคำแนะนำ', 'Accept suggestion')}
	                                  </button>
	                                ) : null}
	                                <button
	                                  type="button"
	                                  className="pt-btn-source-action"
	                                  onClick={() => {
	                                    setActiveSourceSearchIndex(activeSourceSearchIndex === index ? -1 : index);
	                                    setSourceSearchQuery(resolvedSource.resolvedSourceTitleName || resolvedSourceTitleName || item.songTitle || '');
	                                  }}
	                                >
	                                  {pick('ค้นหาแหล่งที่มา', 'Search source')}
	                                </button>
	                                {(resolvedSource.resolvedSourceTitleId > 0 || resolvedSource.sourceResolutionStatus !== PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED) ? (
	                                  <button type="button" className="pt-btn-source-action is-muted" onClick={() => handleClearSourceLink(index)}>
	                                    {pick('ล้างลิงก์', 'Clear link')}
	                                  </button>
	                                ) : null}
	                              </div>
	                              {activeSourceSearchIndex === index ? (
	                                <div className="pt-track-source-search-panel">
	                                  <input
	                                    type="text"
	                                    className="pt-input"
	                                    value={sourceSearchQuery}
	                                    onChange={(event) => setSourceSearchQuery(event.target.value)}
	                                    placeholder={pick('ค้นหาชื่อแหล่งที่มา', 'Search canonical source title')}
	                                  />
	                                  {sourceSearchLoading ? (
	                                    <small>{pick('กำลังค้นหา...', 'Searching...')}</small>
	                                  ) : sourceSearchResults.length > 0 ? (
	                                    <div className="pt-track-source-search-results">
	                                      {sourceSearchResults.map((sourceCandidate) => (
	                                        <button
	                                          key={sourceCandidate.resolvedSourceTitleId}
	                                          type="button"
	                                          className="pt-track-source-search-result"
	                                          onClick={() => handleLinkManualSource(index, sourceCandidate)}
	                                        >
	                                          {sourceCandidate.resolvedSourceTitleName}
	                                        </button>
	                                      ))}
	                                    </div>
	                                  ) : sourceSearchQuery.trim() ? (
	                                    <small>{pick('ไม่พบแหล่งที่มาที่ตรงกัน', 'No matching sources found yet.')}</small>
	                                  ) : null}
	                                </div>
	                              ) : null}
	                            </div>
	                          ) : null}
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
                          <CheckCircle size={14} className="pt-track-ready-icon" title={pick('พร้อม', 'Ready')} />
                        )}
                        <button
                          className="pt-track-delete"
                          onClick={() => handleRemoveItem(index)}
                          title={pick('Remove', 'Remove')}
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

        <footer className="pt-builder-footer">
          <Button
            className="party-gradient-action"
            size="large"
            onClick={handleSave}
            disabled={saving || !validation.valid}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {pick('บันทึกเทมเพลต', 'Save Template')}
          </Button>
        </footer>
      </div>
    </div>
  );
}







