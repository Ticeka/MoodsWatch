import React from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { TITLE_TYPE_TABS } from '../../constants/discoverConfig';

const MOODS = [
  { id: 'funny', emoji: '🤣', label: 'Funny', bg: '#FFE8A3', fg: '#7A4E00' },
  { id: 'healing', emoji: '🌸', label: 'Healing', bg: '#FFD1E8', fg: '#9D2663' },
  { id: 'dark', emoji: '🖤', label: 'Dark', bg: '#2B2B2B', fg: '#FDFAF6' },
  { id: 'romantic', emoji: '💕', label: 'Romantic', bg: '#E05C7A', fg: '#FDFAF6' },
  { id: 'thrilling', emoji: '😰', label: 'Thrilling', bg: '#4A5568', fg: '#FDFAF6' },
  { id: 'hype', emoji: '🔥', label: 'Hype', bg: '#D9480F', fg: '#FDFAF6' },
  { id: 'exceptional', emoji: '⚡', label: 'Exceptional Lead', bg: '#FFDC5E', fg: '#5A3E00' },
  { id: 'slowlife', emoji: '🍃', label: 'Slow Life', bg: '#D9F99D', fg: '#2D4A00' },
  { id: 'sad', emoji: '😢', label: 'Sad', bg: '#BFDBFE', fg: '#0B3A6B' },
];

const TYPE_OPTIONS = TITLE_TYPE_TABS.filter((tab) => tab.id !== 'all');

export function DiscoverFilterBar({
  activeTitleType,
  onTitleTypeChange,
  activeTag,
  onToggleTag,
}) {
  const { t } = useLanguage();

  const toggleType = (id) => {
    onTitleTypeChange(activeTitleType === id ? 'all' : id);
  };

  return (
    <div className="dv2-filter-panel" role="group" aria-label={t('discover.typeTabsAria')}>
      <div className="dv2-filter-group">
        <div className="dv2-filter-title">{t('discover.filter.type')}</div>
        {TYPE_OPTIONS.map((tab) => {
          const checked = activeTitleType === tab.id;
          return (
            <label key={tab.id} className="dv2-check-row">
              <span className={`dv2-check-box${checked ? ' is-checked' : ''}`}>
                {checked ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <input
                type="checkbox"
                className="dv2-check-hidden"
                checked={checked}
                onChange={() => toggleType(tab.id)}
              />
              {t(tab.labelKey)}
            </label>
          );
        })}
      </div>

      <div className="dv2-filter-group">
        <div className="dv2-filter-title">{t('discover.filter.mood')}</div>
        <div className="dv2-mood-grid">
          {MOODS.map((mood) => {
            const isActive = activeTag === mood.id;
            return (
              <button
                key={mood.id}
                type="button"
                className={`dv2-mood-pill${isActive ? ' is-active' : ''}`}
                style={{ background: mood.bg, color: mood.fg }}
                onClick={() => onToggleTag(mood.id)}
              >
                <span className="dv2-mood-emoji">{mood.emoji}</span>
                <span>{mood.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="dv2-filter-group">
        <div className="dv2-filter-title">{t('discover.filter.year')}</div>
        <div className="dv2-year-range">
          <input disabled aria-disabled="true" value="2010" className="dv2-year-input" />
          <span className="dv2-year-sep">–</span>
          <input disabled aria-disabled="true" value="2026" className="dv2-year-input" />
        </div>
      </div>
    </div>
  );
}
