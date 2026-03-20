import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from '@/shared/i18n/translations';

const LANGUAGE_STORAGE_KEY = 'moodtoon-language';
const LanguageContext = createContext(null);

function getInitialLanguage() {
  if (typeof window === 'undefined') {
    return 'th';
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === 'en' ? 'en' : 'th';
}

function resolveTranslation(language, key) {
  return key.split('.').reduce((current, part) => current?.[part], translations[language]);
}

function interpolate(template, values = {}) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? ''));
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'th' ? 'th' : 'en';
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => (current === 'th' ? 'en' : 'th')),
    t: (key, values) => {
      const resolved = resolveTranslation(language, key) ?? resolveTranslation('en', key) ?? key;
      return interpolate(resolved, values);
    },
    pick: (thValue, enValue) => (language === 'th' ? thValue : enValue),
    isThai: language === 'th',
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }

  return context;
}
