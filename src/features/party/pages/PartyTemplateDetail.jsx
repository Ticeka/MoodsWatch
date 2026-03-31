import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Copy, ListEnd, Music, Loader2, Star, Heart, Eye, Pencil, Video, RefreshCw, Trash2, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { PARTY_PRESETS, getPartyPresetById } from '@/features/party/lib/partyEngine';
import {
  fetchPartyTemplateDetail,
  recordPartyTemplateView,
  togglePartyTemplateLike,
  checkPartyTemplateLiked,
  syncPartyTemplateYoutubePlaylist,
  replacePartyTemplateItems,
  deletePartyTemplate,
} from '@/features/party/lib/partyRemote';
import { isYoutubeTemplateItem, getYoutubePlaybackLabel, getYoutubePlaybackStatusClass } from '@/features/party/lib/partyYoutube';
import { isTemplateItemImportedFromPlaylist } from '@/features/party/lib/partyTemplateUtils';
import {
  analyzePartyTemplateCompatibility,
  getTemplatePlayableCount,
  mapTemplateItemFromDb,
  resolveTemplateCoverUrl,
} from '@/features/party/lib/partyTemplateUtils';
import '../components/PartyTemplates.css';
import '../pages/Party.css';

function getTemplateCompatibilityCopy(reason, pick) {
  if (!reason) {
    return '';
  }

  if (reason.code === 'insufficient_playable_songs') {
    return `${reason.label} needs at least ${reason.requiredCount} playable songs, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_distinct_sources') {
    return `${reason.label} needs at least ${reason.requiredCount} distinct source titles with usable metadata, but this template only has ${reason.actualCount}.`;
  }

  if (reason.code === 'insufficient_answerable_songs') {
    return reason.message;
  }

  if (reason.code === 'missing_source_metadata') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} ${reason.actualCount === 1 ? 'is' : 'are'} still missing a usable source title.`;
  }

  if (reason.code === 'missing_song_titles') {
    return `${reason.actualCount} playable song${reason.actualCount === 1 ? '' : 's'} ${reason.actualCount === 1 ? 'is' : 'are'} still missing a song title.`;
  }

  return reason.message;
}

export function PartyTemplateDetailPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();

  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    let ignore = false;

    setLoading(true);
    fetchPartyTemplateDetail(templateId)
      .then((data) => {
        if (ignore) return;
        if (!data) {
          setNotFound(true);
        } else {
          setTemplate(data);
          setLikeCount(data.likes || 0);
          recordPartyTemplateView(templateId);
        }
      })
      .catch(() => {
        if (!ignore) setNotFound(true);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [templateId]);

  useEffect(() => {
    if (!templateId || !user?.id) return;
    checkPartyTemplateLiked(templateId, user.id)
      .then(setLiked)
      .catch(() => {});
  }, [templateId, user?.id]);

  const handlePlayNow = () => {
    const mode = template.modeScope === 'vote' ? 'vote' : 'quiz';
    const preset = getPartyPresetById(playNowPresetId);
    navigate(
      `/party?templateId=${template.id}` +
      `&templateName=${encodeURIComponent(template.name)}` +
      `&modeType=${mode}` +
      `&modeScope=${template.modeScope}` +
      `&presetId=${encodeURIComponent(preset.id)}`,
    );
  };

  const handleUseBase = () => {
    navigate(`/party/templates/create?base=${template.id}`);
  };

  const handleSync = async () => {
    if (!template || syncing) return;
    setSyncing(true);
    try {
      const currentItems = (template.items || []).map(mapTemplateItemFromDb);
      const { items: updatedItems } = await syncPartyTemplateYoutubePlaylist(template.id, currentItems);
      await replacePartyTemplateItems(template.id, updatedItems);
      const refreshed = await fetchPartyTemplateDetail(template.id);
      if (refreshed) setTemplate(refreshed);
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  const handleLike = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (liking) return;
    setLiking(true);
    try {
      const result = await togglePartyTemplateLike(template.id, user.id);
      setLiked(result.liked);
      setLikeCount((c) => result.liked ? c + 1 : Math.max(0, c - 1));
    } catch {
      // ignore
    } finally {
      setLiking(false);
    }
  };

  const handleDelete = async () => {
    if (!template || !user?.id || user.id !== template.ownerUserId) return;
    const confirmed = window.confirm(
      pick(
        `Delete "${template.name}"? This action cannot be undone.`,
        `Delete "${template.name}"? This action cannot be undone.`,
      ),
    );
    if (!confirmed) return;
    try {
      await deletePartyTemplate(template.id);
      navigate('/party/templates');
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="party-page">
        <div style={{ padding: '8rem', textAlign: 'center' }}>
          <Loader2 size={40} className="animate-spin" style={{ opacity: 0.3, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (notFound || !template) {
    return (
      <div className="party-page">
        <div className="party-templates-page" style={{ paddingTop: '4rem', textAlign: 'center' }}>
          <Music size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
          <h2>{pick('ไม่พบเทมเพลต', 'Template not found')}</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
            {pick('อาจถูกลบหรือเป็นแบบส่วนตัว', 'It may have been deleted or is private.')}
          </p>
          <button className="btn-secondary" onClick={() => navigate('/party/templates')}>
            &larr; {pick('กลับหน้าเทมเพลต', 'Back to Templates')}
          </button>
        </div>
      </div>
    );
  }

  const mappedItems = (template.items || []).map(mapTemplateItemFromDb);
  const playableCount = getTemplatePlayableCount(mappedItems);
  const templateCompatibility = analyzePartyTemplateCompatibility(mappedItems);
  const playNowPresetId = template.modeScope === 'vote'
    ? template.presetId
    : (
      templateCompatibility.presetResults[template.presetId]?.compatible
        ? template.presetId
        : PARTY_PRESETS.find((preset) => templateCompatibility.presetResults[preset.id]?.compatible)?.id
    ) || template.presetId;
  const canPlayNow = template.modeScope === 'vote'
    ? templateCompatibility.voteResult.compatible
    : Boolean(playNowPresetId && templateCompatibility.presetResults[playNowPresetId]?.compatible);

  return (
    <div className="party-page">
      <div className="party-templates-page" style={{ paddingTop: '1rem' }}>
        <button
          className="btn-secondary"
          style={{ display: 'inline-flex', padding: '0.5rem 1rem', marginBottom: '1rem' }}
          onClick={() => navigate('/party/templates')}
        >
          &larr; {pick('กลับ', 'Back')}
        </button>

        <div className="party-template-detail-container">
          {/* Sidebar Info */}
          <div className="ptd-sidebar">
            <div className="ptd-cover" style={{ backgroundImage: `url(${resolveTemplateCoverUrl(template.coverUrl, mappedItems)})` }}>
              {template.isOfficial && (
                <div className="party-badge badge-official">
                  <Star size={12} fill="currentColor" /> Official
                </div>
              )}
            </div>

            <div className="ptd-info-card">
              <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.8rem', lineHeight: '1.2' }}>{template.name}</h1>

              {template.tags.length > 0 && (
                <div className="party-template-tags" style={{ marginBottom: '1rem' }}>
                  {template.tags.map((tag) => (
                    <span key={tag} className="party-tag">{tag}</span>
                  ))}
                </div>
              )}

              <p style={{ color: 'var(--color-text-muted)', margin: '0 0 1.5rem 0', lineHeight: '1.6' }}>
                {template.description || pick('ไม่มีคำอธิบาย', 'No description.')}
              </p>

              <div
                className="pt-alert"
                style={{
                  marginBottom: '1rem',
	                  background: canPlayNow ? 'rgba(var(--color-primary-rgb), 0.08)' : 'rgba(217, 119, 6, 0.08)',
	                  border: canPlayNow ? '1px solid rgba(var(--color-primary-rgb), 0.2)' : '1px solid rgba(217, 119, 6, 0.3)',
	                  color: canPlayNow ? 'var(--color-text-muted)' : 'var(--color-warning-text, #d97706)',
                }}
              >
                <Music size={16} />
                <span>
	                  {canPlayNow
                    ? pick(`พร้อมเล่น - ${playableCount} เพลง`, `Ready to play - ${playableCount} playable songs`)
                    : pick(`ยังไม่พร้อม - ${playableCount} เพลง`, `Not ready to play - ${playableCount} playable songs`)}
                </span>
              </div>

		              <div className="pt-alert" style={{ marginBottom: '1rem', background: 'rgba(var(--color-primary-rgb), 0.06)', border: '1px solid rgba(var(--color-primary-rgb), 0.16)', color: 'var(--color-text-muted)' }}>
		                <Info size={16} />
		                <span>
		                  {pick(
                    `${templateCompatibility.playableSongCount} playable songs, ${templateCompatibility.choiceEligibleCount} choice-ready songs, ${templateCompatibility.distinctChoiceAnswerCount} distinct choices.`,
                    `${templateCompatibility.playableSongCount} playable songs, ${templateCompatibility.choiceEligibleCount} choice-ready songs, ${templateCompatibility.distinctChoiceAnswerCount} distinct choices.`,
                  )}
		                </span>
		              </div>

		              {templateCompatibility.unresolvedSourceCount > 0 ? (
	                <div className="pt-alert pt-alert-warning" style={{ marginBottom: '1rem' }}>
	                  <AlertTriangle size={16} />
	                  <span>
	                    {pick(
                      `${templateCompatibility.unresolvedSourceCount} playable songs still need canonical source linking.`,
                      `${templateCompatibility.unresolvedSourceCount} playable songs still need canonical source linking.`,
                    )}
	                  </span>
	                </div>
	              ) : null}

	              <div className="pt-builder-compatibility-grid" style={{ marginBottom: '1rem' }}>
	                {PARTY_PRESETS.map((preset) => {
	                  const result = templateCompatibility.presetResults[preset.id];
	                  return (
	                    <div
	                      key={preset.id}
	                      className={`pt-builder-compatibility-card ${result.compatible ? 'is-ready' : 'is-blocked'}`}
	                    >
	                      <strong>{pick(preset.labelTh, preset.label)}</strong>
	                      <span>
	                        {result.compatible
	                          ? pick(`พร้อมสำหรับ ${preset.label}`, `Ready for ${preset.label}`)
	                          : getTemplateCompatibilityCopy(result.blockingReasons?.[0], pick)}
	                      </span>
	                    </div>
	                  );
	                })}
	                <div className={`pt-builder-compatibility-card ${templateCompatibility.voteResult.compatible ? 'is-ready' : 'is-blocked'}`}>
	                  <strong>{pick('โหวตแบทเทิล', 'Vote Battle')}</strong>
	                  <span>
	                    {templateCompatibility.voteResult.compatible
	                      ? pick('พร้อมสำหรับ Vote Battle', 'Ready for Vote Battle')
	                      : getTemplateCompatibilityCopy(templateCompatibility.voteResult.blockingReasons?.[0], pick)}
	                  </span>
	                </div>
	              </div>

	              <div className="ptd-actions">
	                <button
	                  className="btn-play-now"
	                  onClick={handlePlayNow}
	                  disabled={!canPlayNow}
	                  title={!canPlayNow
	                    ? getTemplateCompatibilityCopy(
	                      template.modeScope === 'vote'
	                        ? templateCompatibility.voteResult.blockingReasons?.[0]
	                        : templateCompatibility.presetResults[playNowPresetId]?.blockingReasons?.[0],
	                      pick,
	                    )
	                    : undefined}
	                >
                  <Play size={20} fill="currentColor" /> {pick('เล่นเลย', 'Play Now')}
                </button>
                <button className="btn-use-base" onClick={handleUseBase}>
                  <Copy size={16} /> {pick('ใช้เป็นต้นแบบ', 'Use as Base')}
                </button>
                {user?.id && user.id === template.ownerUserId && (
                  <button className="btn-use-base" onClick={() => navigate(`/party/templates/create?edit=${template.id}`)}>
                    <Pencil size={16} /> {pick('แก้ไขเทมเพลต', 'Edit Template')}
                  </button>
                )}
                {user?.id && user.id === template.ownerUserId && (
                  <button className="btn-use-base btn-use-base-danger" onClick={handleDelete}>
                    <Trash2 size={16} /> {pick('ลบเทมเพลต', 'Delete Template')}
                  </button>
                )}
                {user?.id && user.id === template.ownerUserId && mappedItems.some(isTemplateItemImportedFromPlaylist) && (
                  <button className="btn-use-base" onClick={handleSync} disabled={syncing}>
                    <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
                    {syncing ? pick('กำลังซิงค์...', 'Syncing...') : pick('ซิงค์ YouTube Playlist', 'Sync YouTube Playlist')}
                  </button>
                )}
                <button
                  className="btn-use-base"
                  onClick={handleLike}
                  disabled={liking}
                  style={{ color: liked ? '#e74c3c' : undefined }}
                >
                  <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
                  {liked ? pick('ถูกใจแล้ว', 'Liked') : pick('ถูกใจ', 'Like')}
                  {likeCount > 0 && <span style={{ marginLeft: '0.25rem', opacity: 0.7 }}>({likeCount})</span>}
                </button>
              </div>
            </div>

            <div className="ptd-info-card" style={{ padding: '1rem' }}>
              {[
                { label: pick('สร้างโดย', 'Created by'), value: template.creatorName || pick('ไม่ทราบ', 'Unknown') },
                { label: pick('เพลง', 'Songs'), value: template.itemCount },
                { label: pick('โหมด', 'Modes'), value: template.modeScope === 'all' ? 'Quiz / Vote' : template.modeScope },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              {template.viewCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.5rem' }}>
                  <Eye size={14} /> {template.viewCount.toLocaleString()} {pick('ครั้ง', 'views')}
                </div>
              )}
            </div>
          </div>

          {/* Song List */}
          <div className="ptd-song-list">
            <div className="ptd-song-list-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ListEnd size={20} />
                {pick('รายการเพลง', 'Tracklist')}
                {mappedItems.length > 0 && <span style={{ opacity: 0.5, fontWeight: 'normal' }}>({mappedItems.length})</span>}
              </h3>
            </div>

            {mappedItems.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <Music size={32} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
                <p>{pick('ยังไม่มีเพลงในเทมเพลตนี้', 'No songs in this template yet.')}</p>
              </div>
            ) : (
              <div className="ptd-song-items">
                {mappedItems.map((item, index) => (
                  <div key={item.id ?? index} className="ptd-song-item">
                    <div className="ptd-song-index">{index + 1}</div>
                    <div className="ptd-song-title">
                      <h4>{item.songTitle || item.title}</h4>
                      <p>
                        {item.artistName || item.artist}
                        {(item.sourceTitleName || item.source) && (
                          <> &bull; {item.sourceTitleName || item.source}</>
                        )}
                      </p>
                    </div>
                    <div className="ptd-song-provider">
                      {isYoutubeTemplateItem(item) ? (
                        <>
                          <Video size={12} style={{ color: '#ff4444', flexShrink: 0 }} />
                          <div className="ptd-song-provider-copy">
                            {(() => {
                              const sc = getYoutubePlaybackStatusClass(item.playbackStatus);
                              return (
                                <span className={`pt-yt-status-badge pt-yt-status-${sc}`}>
                                  {sc === 'ready' && <CheckCircle size={11} />}
                                  {sc === 'limited' && <AlertTriangle size={11} />}
                                  {sc === 'blocked' && <XCircle size={11} />}
                                  {getYoutubePlaybackLabel(item.playbackStatus, pick)}
                                </span>
                              );
                            })()}
                          </div>
                        </>
                      ) : (
                        <>
                          <Music size={12} />
                          Catalog
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
