import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';
import { SortSelect } from '@/shared/components/ui/SortSelect';

export function DiscoverResultsToolbar({
  heading,
  subtitle,
  showTitleControls,
  visibleCount,
  totalCount,
  sortBy,
  onSortChange,
  hideSeen,
  onHideSeenChange,
}) {
  const { t } = useLanguage();

  return (
    <div className="dv2-results-toolbar">
      <div className="dv2-results-heading">
        <h2>{heading}</h2>
        <p>{subtitle}</p>
      </div>

      {showTitleControls ? (
        <div className="dv2-results-actions" role="toolbar" aria-label={t('discover.resultsToolbarAria')}>
          {totalCount > 0 ? (
            <span className="dv2-results-count">
              {t('discover.showingResultCount', { shown: visibleCount, count: totalCount })}
            </span>
          ) : null}
          <SortSelect
            value={sortBy}
            onChange={onSortChange}
            label={t('watchlist.sort')}
            className="dv2-sort"
            selectAriaLabel={t('discover.sortResultsAria')}
          >
            {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
              <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
            ))}
          </SortSelect>
          <label className="dv2-toggle">
            <input type="checkbox" checked={hideSeen} onChange={(event) => onHideSeenChange(event.target.checked)} />
            <span className="dv2-toggle-track"><span className="dv2-toggle-thumb" /></span>
            <span className="dv2-toggle-label">{t('discover.hideSeen')}</span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
