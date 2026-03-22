import React from 'react';

export function SearchMatchReasons({ reasonKeys = [], t }) {
  if (!reasonKeys.length) {
    return null;
  }

  return (
    <div className="discover-match-reasons" aria-label={t('discover.matchReasonPrefix')}>
      <span className="discover-match-reason-prefix">{t('discover.matchReasonPrefix')}</span>
      <div className="discover-match-reason-list">
        {reasonKeys.map((reasonKey) => (
          <span key={reasonKey} className="discover-match-reason-chip">
            {t(`discover.${reasonKey}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
