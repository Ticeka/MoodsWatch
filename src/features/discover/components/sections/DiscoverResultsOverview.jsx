import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { CURATED_LANES } from '../../constants/discoverConfig';

export function DiscoverResultsOverview({ counts, onScopeChange }) {
  const { t } = useLanguage();

  return (
    <div className="dv2-overview" role="toolbar" aria-label={t('discover.scopeTabsAria')}>
      {CURATED_LANES.map((lane) => {
        const Icon = lane.icon;
        const count = counts[lane.id] ?? 0;
        return (
          <button
            key={lane.id}
            type="button"
            className={`dv2-overview-card dv2-overview-card--${lane.accent}`}
            onClick={() => onScopeChange(lane.id)}
          >
            <span className="dv2-overview-icon">
              <Icon size={14} aria-hidden="true" />
            </span>
            <span className="dv2-overview-label">{t(lane.titleKey)}</span>
            <strong className="dv2-overview-count">{t(lane.countLabelKey, { count })}</strong>
            <span className="dv2-overview-desc">{t(lane.descriptionKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
