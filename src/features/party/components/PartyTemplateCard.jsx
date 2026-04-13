import React from 'react';
import { Heart, Layers, Pencil, Play, Sparkles, Star, Users } from 'lucide-react';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import './PartyTemplates.css';

export function PartyTemplateCard({ template, onClick, onEdit, canEdit = false, pick }) {
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
  const resolvedCoverUrl = isTitleGuess || isBattleDeck ? coverUrl : getTemplateCoverUrl(coverUrl);

  return (
    <article
      className={`party-template-card ${isBattleDeck ? 'is-battle-deck' : ''}`.trim()}
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
      <div className={`party-template-card-header ${isBattleDeck ? 'is-battle-deck' : ''}`.trim()}>
        <div className={`party-template-card-cover ${isBattleDeck ? 'is-battle-deck' : ''}`.trim()}>
          {resolvedCoverUrl ? (
            isBattleDeck ? (
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
                  />
                </div>
              </>
            ) : (
              <img
                className="party-template-card-cover-image"
                src={resolvedCoverUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )
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
            <span>{isBattleDeck ? pick('Battle Deck', 'Battle Deck') : isTitleGuess ? pick('เดาชื่อเรื่อง', 'Guess set') : pick('เลือกไปเล่น', 'Use in party')}</span>
          </div>
        </div>
      </div>

      <div className="party-template-card-body">
        <div className="party-template-tags">
          <span className={`party-tag ${isTitleGuess ? 'tag-mode-title-guess' : ''} ${isBattleDeck ? 'tag-mode-vote' : ''}`}>
            {isBattleDeck ? pick('Battle Deck', 'Battle Deck') : isTitleGuess ? pick('ทายชื่อเรื่อง', 'Guess the Title') : pick('ชุดเพลง', 'Song set')}
          </span>
          {tags.slice(0, 2).map((tag) => (
            <span key={tag} className="party-tag">{tag}</span>
          ))}
          {!isTitleGuess && modeScope === 'all' && (
            <span className="party-tag tag-mode">{pick('Quiz + Vote', 'Quiz & Vote')}</span>
          )}
          {!isTitleGuess && modeScope === 'quiz' && (
            <span className="party-tag tag-mode-quiz">{pick('เฉพาะ Quiz', 'Quiz Only')}</span>
          )}
          {!isTitleGuess && modeScope === 'vote' && (
            <span className="party-tag tag-mode-vote">{pick('เฉพาะ Vote', 'Vote Only')}</span>
          )}
        </div>

        <h3 className="party-template-name">{name}</h3>
        <p className="party-template-desc">{description}</p>

        <div className="party-template-meta">
          <div className="meta-item">
            {isTitleGuess ? <Sparkles size={14} /> : <Layers size={14} />}
            <span>{itemCount} {pick(isBattleDeck ? 'รายการ' : isTitleGuess ? 'ข้อ' : 'เพลง', isBattleDeck ? 'entries' : isTitleGuess ? 'questions' : 'songs')}</span>
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
