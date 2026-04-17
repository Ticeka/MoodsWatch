import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Button } from '@/shared/components/ui/Button';

export function DiscoverRecoveryActions({
  suggestions,
  isLoading,
  showClear,
  onApplySuggestion,
  onClear,
}) {
  const { t } = useLanguage();

  if (!suggestions.length && !isLoading && !showClear) return null;

  return (
    <div className="dv2-recovery">
      {suggestions.length > 0 ? (
        <div className="dv2-recovery-chips" role="group" aria-label={t('discover.recoverySuggestedMany')}>
          {suggestions.map(({ query: suggestedQuery, kind }) => (
            <button
              key={suggestedQuery}
              type="button"
              className={`dv2-recovery-chip dv2-recovery-chip--${kind}`}
              onClick={() => onApplySuggestion(suggestedQuery)}
            >
              {suggestedQuery}
            </button>
          ))}
        </div>
      ) : null}
      {showClear ? (
        <Button type="button" variant="secondary" size="sm" onClick={onClear}>
          {t('common.clear')}
        </Button>
      ) : null}
      {isLoading ? <span className="dv2-recovery-note">{t('discover.recoveryLoading')}</span> : null}
    </div>
  );
}
