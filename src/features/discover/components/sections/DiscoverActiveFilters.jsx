import React from 'react';
import { X as XIcon } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { SEARCH_SCOPE_TABS, TITLE_TYPE_TABS } from '../../constants/discoverConfig';

export function DiscoverActiveFilters({
  query,
  committedQuery,
  activeTag,
  activeScope,
  activeTitleType,
  isBroadQuery,
  onClearTag,
  onClearScope,
  onClearTitleType,
}) {
  const { t } = useLanguage();

  const hasAny = committedQuery || activeTag || activeScope !== 'all' || activeTitleType !== 'all';
  if (!hasAny) return null;

  const scopeLabel = SEARCH_SCOPE_TABS.find((item) => item.id === activeScope)?.labelKey || 'discover.scopeAll';
  const typeLabel = TITLE_TYPE_TABS.find((item) => item.id === activeTitleType)?.labelKey || 'discover.typeAll';

  return (
    <div className="dv2-active-filters">
      {committedQuery ? (
        <span className="dv2-pill">{t('discover.searchLabel')}: {query}</span>
      ) : null}
      {activeTag ? (
        <button type="button" className="dv2-pill is-removable" onClick={onClearTag}>
          {t('discover.tagLabel')}: {activeTag}
          <XIcon size={11} aria-hidden="true" />
        </button>
      ) : null}
      {activeScope !== 'all' ? (
        <button type="button" className="dv2-pill is-removable" onClick={onClearScope}>
          {t('discover.scopeAll')}: {t(scopeLabel)}
          <XIcon size={11} aria-hidden="true" />
        </button>
      ) : null}
      {activeTitleType !== 'all' ? (
        <button type="button" className="dv2-pill is-removable" onClick={onClearTitleType}>
          {t('discover.titleTypeLabel')}: {t(typeLabel)}
          <XIcon size={11} aria-hidden="true" />
        </button>
      ) : null}
      {committedQuery && isBroadQuery ? (
        <span className="dv2-pill is-soft">{t('discover.broadQueryChip')}</span>
      ) : null}
    </div>
  );
}
