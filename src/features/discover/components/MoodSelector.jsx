import React from 'react';
import { Sparkles } from 'lucide-react';
import { getLocalizedMoodName, getMoodOptionsForAgeGate } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import '../styles/Selectors.css';

export function MoodSelector({ selected, onChange }) {
  const { language, t } = useLanguage();
  const { showAdult } = useAgeGate();

  const visibleMoods = getMoodOptionsForAgeGate(showAdult);
  const titleKey = showAdult ? 'selectors.moodTitleAdult' : 'selectors.moodTitle';
  const subtitleKey = showAdult ? 'selectors.moodSubtitleAdult' : 'selectors.moodSubtitle';

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
        {t(titleKey)} <span className="subtitle">{t(subtitleKey)}</span>
      </h3>
      {showAdult && <p className="section-helper">{t('selectors.moodHelperAdult')}</p>}
      <div className="mood-grid stagger-children">
        {visibleMoods.map((mood) => {
          const isSelected = selected.includes(mood.id);
          const isDisabled = !isSelected && selected.length >= 3;

          return (
            <button
              key={mood.id}
              type="button"
              aria-pressed={isSelected}
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
