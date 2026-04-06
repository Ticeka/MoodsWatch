import React from 'react';
import { Search, X } from 'lucide-react';

export function HeaderSearchFallback({
  surface = 'header',
  query,
  setQuery,
  isDiscoverActive = false,
  onActivate,
  onSubmit,
  onClear,
  t,
}) {
  if (surface === 'drawer') {
    return (
      <div className="drawer-search-wrap">
        <form className="drawer-search" onSubmit={onSubmit} role="search" aria-label={t('discover.searchInputLabel')}>
          <Search size={16} className="drawer-search-icon" aria-hidden="true" />
          <label htmlFor="drawer-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
          <input
            id="drawer-global-search"
            type="search"
            className="drawer-search-input"
            value={query}
            onChange={(event) => {
              onActivate();
              setQuery(event.target.value);
            }}
            onFocus={onActivate}
            placeholder={t('discover.searchPlaceholder')}
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="drawer-search-clear"
              onClick={onClear}
              aria-label={t('discover.clearSearch')}
              title={t('discover.clearSearch')}
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
          <button type="submit" className="drawer-search-submit">
            {t('discover.searchLabel')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      className={`header-search ${isDiscoverActive ? 'is-active' : ''}`}
      onSubmit={onSubmit}
      role="search"
      aria-label={t('discover.searchInputLabel')}
    >
      <label htmlFor="header-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
      <input
        id="header-global-search"
        type="search"
        value={query}
        onChange={(event) => {
          onActivate();
          setQuery(event.target.value);
        }}
        onFocus={onActivate}
        className="header-search-input"
        placeholder={t('discover.searchPlaceholder')}
        autoComplete="off"
      />
      <Search size={16} className="header-search-icon" aria-hidden="true" />
      {query ? (
        <button
          type="button"
          className="header-search-clear"
          onClick={onClear}
          aria-label={t('discover.clearSearch')}
          title={t('discover.clearSearch')}
        >
          <X size={15} aria-hidden="true" />
        </button>
      ) : null}
      <button type="submit" className="header-search-submit" aria-label={t('discover.searchLabel')} title={t('discover.searchLabel')}>
        <Search size={17} aria-hidden="true" />
      </button>
    </form>
  );
}
