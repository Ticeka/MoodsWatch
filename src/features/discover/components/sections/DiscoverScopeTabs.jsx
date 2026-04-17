import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { SEARCH_SCOPE_TABS } from '../../constants/discoverConfig';

export function DiscoverScopeTabs({ active, counts, showCounts, onChange }) {
  const { t } = useLanguage();

  return (
    <div
      className="dv2-scope-tabs"
      role="toolbar"
      aria-label={t('discover.scopeTabsAria')}
    >
      {SEARCH_SCOPE_TABS.map((scope) => {
        const Icon = scope.icon;
        const count = counts[scope.id] ?? 0;
        const isActive = active === scope.id;
        return (
          <button
            key={scope.id}
            type="button"
            aria-pressed={isActive}
            className={`dv2-scope-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(scope.id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{t(scope.labelKey)}</span>
            {showCounts ? <span className="dv2-scope-count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
