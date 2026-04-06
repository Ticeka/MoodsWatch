import React from 'react';
import { TitleCard } from '@/shared/components/ui/Card';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';

export function HomeTrendingSection({
  isVisible,
  isInitialLoad,
  displayTrending,
  hideSeen,
  onHideSeenChange,
  trendingSortBy,
  onTrendingSortChange,
  t,
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="section trending-section">
      <div className="container">
        <SectionHeader
          title={t('home.trendingNow')}
          action={(
            <div className="results-toolbar-actions" role="toolbar" aria-label={t('home.trendingToolbarAria')}>
              <SortSelect
                value={trendingSortBy}
                onChange={onTrendingSortChange}
                label={t('watchlist.sort')}
                className="results-sorter"
              >
                {TITLE_SORT_OPTIONS.filter((option) => option.id !== 'match').map((option) => (
                  <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                ))}
              </SortSelect>
              <label className="hide-seen-toggle alt">
                <input
                  type="checkbox"
                  checked={hideSeen}
                  onChange={(event) => onHideSeenChange(event.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb"></span>
                </span>
                <span className="toggle-label">{t('home.hideSeen')}</span>
              </label>
            </div>
          )}
        />

        {isInitialLoad ? (
          <SkeletonGrid />
        ) : (
          <div className="results-grid stagger-children">
            {displayTrending.map((title, index) => (
              <TitleCard key={title.id} title={title} priority={index < 4} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
