import React from 'react';
import { Sparkles } from 'lucide-react';
import { TIME_OPTIONS, getLocalizedLabel } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './Selectors.css';

export function TimeSelector({ selected, onChange }) {
  const { language, t } = useLanguage();

  return (
    <div className="selector-container">
      <h3 className="section-title">
        <span className="section-title-icon"><Sparkles size={16} aria-hidden="true" /></span>
        {t('selectors.timeTitle')}
      </h3>
      <div className="time-grid stagger-children">
        {TIME_OPTIONS.map((time) => {
          const isSelected = selected === time.id;

          return (
            <button
              key={time.id}
              className={`time-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => onChange(isSelected ? null : time.id)}
            >
              <span className="time-icon">{time.icon}</span>
              <span className="time-name">{getLocalizedLabel(time, language)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
