import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations as thaiTranslations } from '@/shared/i18n/th';

const LANGUAGE_STORAGE_KEY = 'moodtoon-language';
const LanguageContext = createContext(null);
const translationLoaders = {
  th: async () => thaiTranslations,
  en: () => import('@/shared/i18n/en').then((module) => module.translations),
};
const loadedTranslations = new Map();
const translationRequests = new Map();

loadedTranslations.set('th', thaiTranslations);

function looksLikeMojibake(value) {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  return /[\u0080-\u009F\uFFFD]|(?:เน€|โ€|Â|Ã)/u.test(value);
}

function pickLocalizedValue(preferredValue, fallbackValue) {
  if (!looksLikeMojibake(preferredValue)) {
    return preferredValue;
  }

  if (!looksLikeMojibake(fallbackValue)) {
    return fallbackValue;
  }

  return preferredValue;
}

function scheduleWhenIdle(callback, timeout = 2000) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 500));
  return () => window.clearTimeout(handle);
}

function normalizeLanguage(language) {
  return language === 'en' ? 'en' : 'th';
}

function getLoadedTranslationMap(language) {
  return loadedTranslations.get(normalizeLanguage(language)) || null;
}

async function loadTranslationMap(language) {
  const normalizedLanguage = normalizeLanguage(language);
  const cachedTranslations = loadedTranslations.get(normalizedLanguage);
  if (cachedTranslations) {
    return cachedTranslations;
  }

  if (translationRequests.has(normalizedLanguage)) {
    return translationRequests.get(normalizedLanguage);
  }

  const request = translationLoaders[normalizedLanguage]()
    .then((translations) => {
      loadedTranslations.set(normalizedLanguage, translations);
      translationRequests.delete(normalizedLanguage);
      return translations;
    })
    .catch((error) => {
      translationRequests.delete(normalizedLanguage);
      throw error;
    });

  translationRequests.set(normalizedLanguage, request);
  return request;
}

export function getInitialLanguagePreference() {
  if (typeof window === 'undefined') {
    return 'th';
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return storedLanguage === 'en' ? 'en' : 'th';
}

export async function preloadTranslations(language) {
  await loadTranslationMap(language);
}

function resolveTranslation(source, key) {
  if (!source) {
    return undefined;
  }

  return key.split('.').reduce((current, part) => current?.[part], source);
}

function interpolate(template, values = {}) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? ''));
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguagePreference);
  const [translationMaps, setTranslationMaps] = useState(() => {
    const initialLanguage = getInitialLanguagePreference();
    const initialTranslations = getLoadedTranslationMap(initialLanguage);

    if (initialTranslations) {
      return { th: thaiTranslations, [initialLanguage]: initialTranslations };
    }

    return { th: thaiTranslations };
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'th' ? 'th' : 'en';
  }, [language]);

  useEffect(() => {
    let ignore = false;

    const syncTranslations = async () => {
      const normalizedLanguage = normalizeLanguage(language);
      const nextTranslations = await loadTranslationMap(normalizedLanguage);

      if (ignore) {
        return;
      }

      setTranslationMaps((current) => (
        current[normalizedLanguage] === nextTranslations
          ? current
          : { ...current, [normalizedLanguage]: nextTranslations }
      ));
    };

    void syncTranslations();

    return () => {
      ignore = true;
    };
  }, [language]);

  useEffect(() => {
    if (language === 'en' || translationMaps.en) {
      return undefined;
    }

    let ignore = false;
    const cancelIdleWork = scheduleWhenIdle(() => {
      void loadTranslationMap('en').then((englishTranslations) => {
        if (ignore) {
          return;
        }

        setTranslationMaps((current) => (
          current.en === englishTranslations
            ? current
            : { ...current, en: englishTranslations }
        ));
      });
    });

    return () => {
      ignore = true;
      cancelIdleWork?.();
    };
  }, [language, translationMaps.en]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => (current === 'th' ? 'en' : 'th')),
    t: (key, values) => {
      const resolved = resolveTranslation(translationMaps[language], key)
        ?? resolveTranslation(translationMaps.en, key)
        ?? key;
      return interpolate(resolved, values);
    },
    pick: (thValue, enValue) => (
      language === 'th'
        ? pickLocalizedValue(thValue, enValue)
        : pickLocalizedValue(enValue, thValue)
    ),
    isThai: language === 'th',
  }), [language, translationMaps]);

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
