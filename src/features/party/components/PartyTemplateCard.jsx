import React from 'react';
import { Heart, Layers, Play, Sparkles, Star, Users } from 'lucide-react';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import './PartyTemplates.css';

export function PartyTemplateCard({ template, onClick, pick }) {
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
  const resolvedCoverUrl = isTitleGuess ? coverUrl : getTemplateCoverUrl(coverUrl);

  return (
    <div className="party-template-card" onClick={onClick}>
      <div className="party-template-card-header">
        <div
          className="party-template-card-cover"
          style={{ backgroundImage: `url(${resolvedCoverUrl})` }}
        >
          {isOfficial && (
            <div className="party-badge badge-official">
              <Star size={12} fill="currentColor" />
              <span>{pick('ทางการ', 'Official')}</span>
            </div>
          )}
          <div className="party-template-card-overlay">
            <button className="party-play-button-overlay">
              <Play fill="currentColor" />
            </button>
          </div>
        </div>
      </div>

      <div className="party-template-card-body">
        <div className="party-template-tags">
          <span className={`party-tag ${isTitleGuess ? 'tag-mode-title-guess' : ''}`}>
            {isTitleGuess ? pick('ทายชื่อเรื่อง', 'Guess the Title') : pick('ชุดเพลง', 'Song set')}
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
            <span>{itemCount} {pick(isTitleGuess ? 'ข้อ' : 'เพลง', isTitleGuess ? 'questions' : 'songs')}</span>
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
      </div>
    </div>
  );
}
