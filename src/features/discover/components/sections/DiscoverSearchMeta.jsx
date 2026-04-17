import React from 'react';
import { Bookmark, BookmarkCheck, ChevronDown, Info, Loader2 } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function DiscoverSearchMeta({
  isLoading,
  isShortQuery,
  isBroadQuery,
  catalogCount,
  canSave,
  isSaved,
  isSaveDisabled,
  onSave,
  hasSavedToggle,
  isWorkbenchOpen,
  onToggleWorkbench,
}) {
  const { t } = useLanguage();

  return (
    <div className="dv2-search-meta">
      <p id="dv2-search-hint" className="dv2-search-hint" role="status" aria-live="polite">
        {isLoading ? (
          <span><Loader2 size={13} className="dv2-spinner" /> {t('discover.searchingEverywhere')}</span>
        ) : isShortQuery ? (
          <span><Info size={13} aria-hidden="true" /> {t('discover.shortQueryHint')}</span>
        ) : isBroadQuery ? (
          <span><Info size={13} aria-hidden="true" /> {t('discover.broadQueryHint')}</span>
        ) : catalogCount > 0 ? (
          <span>{t('discover.loaded', { count: catalogCount })}</span>
        ) : null}
      </p>

      <div className="dv2-search-tools">
        {canSave ? (
          <button
            type="button"
            className={`dv2-save-btn ${isSaved ? 'is-saved' : ''}`}
            onClick={onSave}
            disabled={isSaveDisabled}
          >
            {isSaved ? <BookmarkCheck size={13} aria-hidden="true" /> : <Bookmark size={13} aria-hidden="true" />}
            {isSaved ? t('discover.searchSaved') : t('discover.saveSearch')}
          </button>
        ) : null}
        {hasSavedToggle ? (
          <button
            type="button"
            className={`dv2-workbench-btn ${isWorkbenchOpen ? 'is-open' : ''}`}
            onClick={onToggleWorkbench}
            aria-expanded={isWorkbenchOpen}
            aria-controls="discover-search-workbench"
          >
            <Bookmark size={13} aria-hidden="true" />
            <span>{isWorkbenchOpen ? t('common.close') : t('discover.savedSearchesLabel')}</span>
            <ChevronDown size={13} className="dv2-workbench-chevron" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
