import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Copy, ListEnd, Music, Loader2, Star, Heart, Eye, Pencil } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getPartyPresetById } from '@/features/party/lib/partyEngine';
import {
  fetchPartyTemplateDetail,
  recordPartyTemplateView,
  togglePartyTemplateLike,
  checkPartyTemplateLiked,
} from '@/features/party/lib/partyRemote';
import {
  getTemplatePlayableCount,
  mapTemplateItemFromDb,
  resolveTemplateCoverUrl,
  validatePlayableTemplateForMode,
} from '@/features/party/lib/partyTemplateUtils';
import '../components/PartyTemplates.css';
import '../pages/Party.css';

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
    const preset = getPartyPresetById(template.presetId);
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
          <h2>{pick('ไม่พบเทมเพลตนี้', 'Template not found')}</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
            {pick('อาจถูกลบ หรือเป็นเทมเพลตส่วนตัว', 'It may have been deleted or is private.')}
          </p>
          <button className="btn-secondary" onClick={() => navigate('/party/templates')}>
            &larr; {pick('กลับไปหน้า Templates', 'Back to Templates')}
          </button>
        </div>
      </div>
    );
  }

  const mappedItems = (template.items || []).map(mapTemplateItemFromDb);
  const playableCount = getTemplatePlayableCount(mappedItems);
  const playableValidation = validatePlayableTemplateForMode(mappedItems, template.modeScope);

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
                  background: playableValidation.valid ? 'rgba(var(--color-primary-rgb), 0.08)' : 'rgba(217, 119, 6, 0.08)',
                  border: playableValidation.valid ? '1px solid rgba(var(--color-primary-rgb), 0.2)' : '1px solid rgba(217, 119, 6, 0.3)',
                  color: playableValidation.valid ? 'var(--color-text-muted)' : 'var(--color-warning-text, #d97706)',
                }}
              >
                <Music size={16} />
                <span>
                  {playableValidation.valid
                    ? pick(`พร้อมเล่นจริง • เพลงที่เล่นได้ ${playableCount} เพลง`, `Ready to play • ${playableCount} playable songs`)
                    : pick(`ยังเล่นจริงไม่ได้ • เพลงที่เล่นได้ ${playableCount} เพลง`, `Not ready to play • ${playableCount} playable songs`)}
                </span>
              </div>

              <div className="ptd-actions">
                <button className="btn-play-now" onClick={handlePlayNow} disabled={!playableValidation.valid} title={!playableValidation.valid ? playableValidation.reason : undefined}>
                  <Play size={20} fill="currentColor" /> {pick('สร้างห้องเล่นเลย', 'Play Now')}
                </button>
                <button className="btn-use-base" onClick={handleUseBase}>
                  <Copy size={16} /> {pick('ก๊อปปี้ไปสร้างของตัวเอง', 'Use as Base')}
                </button>
                {user?.id && user.id === template.ownerUserId && (
                  <button className="btn-use-base" onClick={() => navigate(`/party/templates/create?edit=${template.id}`)}>
                    <Pencil size={16} /> {pick('แก้ไข Template', 'Edit Template')}
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
                { label: pick('สร้างโดย', 'Created by'), value: template.creatorName || pick('ไม่ระบุ', 'Unknown') },
                { label: pick('จำนวนเพลง', 'Songs'), value: template.itemCount },
                { label: pick('โหมดที่รองรับ', 'Modes'), value: template.modeScope === 'all' ? 'Quiz / Vote' : template.modeScope },
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
                {pick('รายชื่อเพลง', 'Tracklist')}
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
                      <Music size={12} />
                      Catalog
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
