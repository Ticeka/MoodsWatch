import React from 'react';
import PropTypes from 'prop-types';
import { Button } from './Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function ErrorState({ message, onRetry, className = '' }) {
  const { t } = useLanguage();
  return (
    <div className={`error-state ${className}`} role="alert">
      <span className="error-state-icon" aria-hidden="true">!</span>
      <p className="error-state-message">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

ErrorState.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func,
  className: PropTypes.string,
};
