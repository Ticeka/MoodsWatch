import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-toggle" role="radiogroup" aria-label={t('layout.language')}>
      <button
        type="button"
        role="radio"
        aria-checked={language === 'en'}
        className={`language-toggle-btn ${language === 'en' ? 'active' : ''}`}
        onClick={(event) => { event.stopPropagation(); setLanguage('en'); }}
      >
        EN
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={language === 'th'}
        className={`language-toggle-btn ${language === 'th' ? 'active' : ''}`}
        onClick={(event) => { event.stopPropagation(); setLanguage('th'); }}
      >
        TH
      </button>
    </div>
  );
}
