import React from 'react';
import { Sparkles } from 'lucide-react';
import { MOODS, getLocalizedMoodName } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import './Selectors.css';

export function MoodSelector({ selected, onChange }) {
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();

  // Keep the selector aligned with the current age-gate mode.
  const visibleMoods = MOODS.filter((mood) => (showAdult ? mood.isAdult : !mood.isAdult));

  const toggleMood = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((moodId) => moodId !== id));
      return;
    }

    if (selected.length < 3) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="selector-container">
      <h3 className="section-title">
        <span className="section-title-icon"><Sparkles size={16} aria-hidden="true" /></span>
        {t('selectors.moodTitle')} <span className="subtitle">{t('selectors.moodSubtitle')}</span>
      </h3>
      <div className="mood-grid stagger-children">
        {visibleMoods.map((mood) => {
          const isSelected = selected.includes(mood.id);
          const isDisabled = !isSelected && selected.length >= 3;

          return (
            <button
              key={mood.id}
              className={`mood-btn ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''} ${mood.isAdult ? 'mood-btn-adult' : ''}`}
              onClick={() => !isDisabled && toggleMood(mood.id)}
              style={{ '--mood-color': mood.color }}
            >
              <span className="mood-icon">{mood.icon}</span>
              <span className="mood-name">{getLocalizedMoodName(mood, language)}</span>
              {mood.isAdult && <span className="mood-adult-badge">18+</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
