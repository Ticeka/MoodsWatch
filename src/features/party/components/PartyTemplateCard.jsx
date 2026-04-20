import React, { useEffect, useState } from 'react';
import { Heart, Layers, Pencil, Play, Sparkles, Star, Users } from 'lucide-react';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import './PartyTemplates.css';

export function PartyTemplateCard({ template, onClick, onEdit, canEdit = false, pick }) {
  const [coverShape, setCoverShape] = useState('unknown');
  const {
    name,
    description,
    coverUrl,
    creatorName,
    itemCount,
    modeScope,
    isOfficial,
    likes = 0,
    tags = [],
    contentType = 'song-set',
  } = template;

  const isTitleGuess = contentType === 'title-guess';
  const isBattleDeck = contentType === 'battle-deck';
  const isTierlist = contentType === 'tierlist';
  const resolvedCoverUrl = isTitleGuess || isBattleDeck || isTierlist ? coverUrl : getTemplateCoverUrl(coverUrl);
  const coverShapeClass = coverShape === 'portrait' ? 'is-portrait-cover' : '';

  useEffect(() => {
    setCoverShape('unknown');
  }, [resolvedCoverUrl]);

  const playableLabel = isTierlist
    ? pick('เล่นใน: Tierlist Vote', 'Play in: Tierlist Vote')
    : isBattleDeck
      ? pick('เล่นใน: Vote Battle', 'Play in: Vote Battle')
      : isTitleGuess
        ? pick('เล่นใน: ทายชื่อเรื่อง', 'Play in: Guess the Title')
        : modeScope === 'quiz'
          ? pick('เล่นใน: Music Quiz', 'Play in: Music Quiz')
          : modeScope === 'vote'
            ? pick('เล่นใน: Vote Battle', 'Play in: Vote Battle')
            : pick('เล่นใน: Music Quiz + Vote Battle', 'Play in: Music Quiz + Vote Battle');

  return (
    <article
      className={`party-template-card ${coverShapeClass}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="party-template-card-header">
        <div className="party-template-card-cover">
          {resolvedCoverUrl ? (
            <>
              <div
                className="party-template-card-cover-backdrop"
                aria-hidden="true"
                style={{ backgroundImage: `url(${resolvedCoverUrl})` }}
              />
              <div className="party-template-card-cover-poster">
                <img
                  className="party-template-card-cover-image"
                  src={resolvedCoverUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    setCoverShape(naturalHeight > naturalWidth * 1.12 ? 'portrait' : 'landscape');
                  }}
                />
              </div>
            </>
          ) : (
            <div className="party-template-card-cover-fallback" aria-hidden="true" />
          )}
          {isOfficial && (
            <div className="party-badge badge-official">
              <Star size={12} fill="currentColor" />
              <span>{pick('ทางการ', 'Official')}</span>
            </div>
          )}
          <div className="party-template-card-type-badge">
            <Play size={12} fill="currentColor" />
            <span>{playableLabel}</span>
          </div>
        </div>
      </div>

      <div className="party-template-card-body">
        <div className="party-template-tags">
          <span className={`party-tag ${isTitleGuess ? 'tag-mode-title-guess' : ''} ${isBattleDeck ? 'tag-mode-vote' : ''} ${isTierlist ? 'tag-mode-tierlist' : ''}`}>
            {isTierlist ? pick('Tierlist', 'Tierlist') : isBattleDeck ? pick('Battle Deck', 'Battle Deck') : isTitleGuess ? pick('ทายชื่อเรื่อง', 'Guess the Title') : pick('ชุดเพลง', 'Song set')}
          </span>
          {tags.slice(0, 2).map((tag) => (
            <span key={tag} className="party-tag">{tag}</span>
          ))}
        </div>

        <h3 className="party-template-name" title={name}>{name}</h3>
        <p className="party-template-desc" title={description}>{description || pick('ยังไม่มีคำอธิบายสำหรับเซ็ตนี้', 'No description yet')}</p>

        <div className="party-template-meta">
          <div className="meta-item">
            {isTitleGuess ? <Sparkles size={14} /> : <Layers size={14} />}
            <span>{itemCount} {pick(isTierlist ? 'ไอเทม' : isBattleDeck ? 'รายการ' : isTitleGuess ? 'ข้อ' : 'เพลง', isTierlist ? 'items' : isBattleDeck ? 'entries' : isTitleGuess ? 'questions' : 'songs')}</span>
          </div>
          <div className="meta-item">
            <Users size={14} />
            <span>{creatorName || pick('ผู้สร้างในชุมชน', 'Community creator')}</span>
          </div>
          {likes > 0 && (
            <div className="meta-item heart-item">
              <Heart size={14} />
              <span>{likes}</span>
            </div>
          )}
        </div>

        {canEdit ? (
          <div className="party-template-card-actions">
            <button
              type="button"
              className="party-template-inline-action"
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.();
              }}
            >
              <Pencil size={14} />
              <span>{pick('แก้ไขชุดคำถาม', 'Edit set')}</span>
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
