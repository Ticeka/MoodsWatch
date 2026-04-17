import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { QUICK_TAGS, TITLE_TYPE_TABS } from '../../constants/discoverConfig';

export function DiscoverFilterBar({
  activeTitleType,
  onTitleTypeChange,
  activeTag,
  onToggleTag,
}) {
  const { t } = useLanguage();

  return (
    <div className="dv2-filterbar" role="group" aria-label={t('discover.typeTabsAria')}>
      <div className="dv2-filterbar-row">
        <span className="dv2-filterbar-label">{t('discover.titleTypeLabel')}</span>
        <div className="dv2-type-tabs" role="toolbar">
          {TITLE_TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTitleType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={isActive}
                className={`dv2-type-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => onTitleTypeChange(tab.id)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="dv2-quicktags">
        {QUICK_TAGS.map((tag) => {
          const isActive = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
              className={`dv2-quicktag ${isActive ? 'is-active' : ''}`}
              onClick={() => onToggleTag(tag)}
            >
              #{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
