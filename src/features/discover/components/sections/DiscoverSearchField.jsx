import React, { forwardRef } from 'react';
import { Search, X as XIcon } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';

export const DiscoverSearchField = forwardRef(function DiscoverSearchField({
  query,
  onQueryChange,
  onSubmit,
  onClear,
  onFocus,
  onKeyDown,
  formRef,
  autocomplete,
  isOpen,
  highlightedIndex,
  onAutocompleteSelect,
  onSearchAll,
}, inputRef) {
  const { t } = useLanguage();
  const { groups, flatItems, isLoading, hasQuery } = autocomplete;

  const shouldShowAutocomplete = isOpen && (flatItems.length > 0 || hasQuery || isLoading);

  return (
    <form ref={formRef} className="dv2-searchform" onSubmit={onSubmit} role="search">
      <label className="visually-hidden" htmlFor="dv2-search">
        {t('discover.searchInputLabel')}
      </label>
      <div className="dv2-searchbox">
        <span className="dv2-searchbox-icon" aria-hidden="true">
          <Search size={18} />
        </span>
        <input
          ref={inputRef}
          id="dv2-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="discover-search-listbox"
          aria-expanded={shouldShowAutocomplete}
          aria-activedescendant={highlightedIndex >= 0 ? flatItems[highlightedIndex]?.id : undefined}
          aria-label={t('discover.searchInputLabel')}
          aria-describedby="dv2-search-hint"
          placeholder={t('discover.searchPlaceholder')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className="dv2-searchbox-input"
          autoFocus
        />
        {query ? (
          <button
            type="button"
            className="dv2-searchbox-clear"
            onClick={onClear}
            aria-label={t('discover.clearSearch')}
            title={t('discover.clearSearch')}
          >
            <XIcon size={14} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="submit"
          className="dv2-searchbox-submit"
          aria-label={t('discover.jumpToResults')}
          title={t('discover.jumpToResults')}
        >
          <Search size={16} aria-hidden="true" />
          <span>{t('discover.jumpToResults')}</span>
        </button>
      </div>

      <SearchAutocomplete
        groups={groups}
        flatItems={flatItems}
        isLoading={isLoading}
        isOpen={shouldShowAutocomplete}
        highlightedIndex={highlightedIndex}
        query={query}
        variant="discover"
        listboxId="discover-search-listbox"
        t={t}
        onSelect={onAutocompleteSelect}
        onSearchAll={onSearchAll}
      />
    </form>
  );
});
