import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { TITLE_SORT_OPTIONS } from '@/shared/lib/titleSorting';

export function HomeResultsSection({
  isVisible,
  sectionRef,
  t,
  isLoading,
  hideSeen,
  displayResults,
  shownResultsCount,
  resultSortBy,
  onResultSortChange,
  hasSourceResults,
  onRefresh,
  pagedResults,
  resultsTotalPages,
  resultsPage,
  onResultsPageChange,
  onClearFilters,
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <section id="results-section" ref={sectionRef} className="section results-section">
      <div className="container">
        <div className="results-header">
          <h2 className="section-heading">
            {t('home.recommendationsForYou')}
            {displayResults.length > 0 && <span className="results-count">{t('home.titlesCount', { count: displayResults.length })}</span>}
          </h2>
          <div className="results-toolbar-actions" role="toolbar" aria-label={t('home.resultsToolbarAria')}>
            {displayResults.length > 0 && (
              <span className="results-visible-count">
                {t('home.showingTitlesCount', { shown: shownResultsCount, count: displayResults.length })}
              </span>
            )}
            <SortSelect
              value={resultSortBy}
              onChange={onResultSortChange}
              label={t('watchlist.sort')}
              className="results-sorter"
            >
              {TITLE_SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
              ))}
            </SortSelect>
            {hasSourceResults && (
              <Button variant="ghost" size="sm" onClick={onRefresh} icon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}>
                {t('common.refresh')}
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <SkeletonGrid />
        ) : displayResults.length > 0 ? (
          <>
            <div className="results-grid stagger-children">
              {pagedResults.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </div>
            {resultsTotalPages > 1 && (
              <div className="results-pagination">
                <button
                  type="button"
                  className="results-page-btn"
                  onClick={() => onResultsPageChange(Math.max(1, resultsPage - 1))}
                  disabled={resultsPage <= 1}
                >
                  {t('common.previous')}
                </button>
                <span className="results-page-indicator">
                  {t('common.page')} {resultsPage} / {resultsTotalPages}
                </span>
                <button
                  type="button"
                  className="results-page-btn"
                  onClick={() => onResultsPageChange(Math.min(resultsTotalPages, resultsPage + 1))}
                  disabled={resultsPage >= resultsTotalPages}
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon="No Match"
            title={t('home.noMatchingTitles')}
            message={`${t('home.relaxFilters')}${hideSeen ? t('home.hideSeenHint') : ''}.`}
            action={(
              <Button variant="outline" onClick={onClearFilters}>
                {t('home.clearFilters')}
              </Button>
            )}
          />
        )}
      </div>
    </section>
  );
}
