import React from 'react';
import { History, Sparkles } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { SUGGESTED_SEARCHES } from '../../constants/discoverConfig';

export function DiscoverQuickPicks({
  recentSearches,
  onClearRecent,
  onApplyPreset,
  chipRefs,
  onChipKeyDown,
  recentOffset,
  suggestedOffset,
}) {
  const { t } = useLanguage();

  return (
    <div className="dv2-quickpicks">
      <div className="dv2-quickpicks-head">
        <span className="dv2-quickpicks-label">
          <Sparkles size={13} aria-hidden="true" />
          {t('discover.quickPicksLabel')}
        </span>
        {recentSearches.length > 0 ? (
          <button type="button" className="dv2-quickpicks-clear" onClick={onClearRecent}>
            {t('discover.clearRecentSearches')}
          </button>
        ) : null}
      </div>

      <div className="dv2-quickpicks-chips">
        {recentSearches.map((entry, index) => (
          <button
            key={`recent-${entry}`}
            ref={(node) => { chipRefs.current[recentOffset + index] = node; }}
            type="button"
            className="dv2-chip"
            onClick={() => onApplyPreset({ scope: 'all', query: entry, tag: '', titleType: 'all' }, 'recent')}
            onKeyDown={(event) => onChipKeyDown(event, recentOffset + index)}
          >
            <History size={12} aria-hidden="true" />
            {entry}
          </button>
        ))}
        {SUGGESTED_SEARCHES.map((preset, index) => (
          <button
            key={preset.id}
            ref={(node) => { chipRefs.current[suggestedOffset + index] = node; }}
            type="button"
            className="dv2-chip is-suggestion"
            onClick={() => onApplyPreset(preset, 'shortcut')}
            onKeyDown={(event) => onChipKeyDown(event, suggestedOffset + index)}
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
