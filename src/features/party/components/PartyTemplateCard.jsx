import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Layers, Users, Star, Heart, Clock } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import './PartyTemplates.css';

export function PartyTemplateCard({ template, onClick, pick }) {
  const {
    id,
    name,
    description,
    coverUrl,
    creatorName,
    itemCount,
    modeScope,
    isOfficial,
    isStarred,
    likes = 0,
    tags = []
  } = template;

  return (
    <div className="party-template-card" onClick={onClick}>
      <div className="party-template-card-header">
        <div 
          className="party-template-card-cover"
          style={{ backgroundImage: `url(${getTemplateCoverUrl(coverUrl)})` }}
        >
          {isOfficial && (
            <div className="party-badge badge-official">
              <Star size={12} fill="currentColor" />
              <span>Official</span>
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
          {tags.slice(0, 2).map(tag => (
            <span key={tag} className="party-tag">{tag}</span>
          ))}
          {modeScope === 'all' && (
            <span className="party-tag tag-mode">Quiz & Vote</span>
          )}
          {modeScope === 'quiz' && (
            <span className="party-tag tag-mode-quiz">Quiz Only</span>
          )}
          {modeScope === 'vote' && (
            <span className="party-tag tag-mode-vote">Vote Only</span>
          )}
        </div>
        
        <h3 className="party-template-name">{name}</h3>
        <p className="party-template-desc">{description}</p>
        
        <div className="party-template-meta">
          <div className="meta-item">
            <Layers size={14} />
            <span>{itemCount} {pick('เพลง', 'songs')}</span>
          </div>
          <div className="meta-item">
            <Users size={14} />
            <span>{creatorName}</span>
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
