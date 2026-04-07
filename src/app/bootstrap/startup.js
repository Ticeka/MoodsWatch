import { getInitialLanguagePreference, preloadTranslations } from '@/shared/contexts/LanguageContext';

export function clearStaleSupabaseLocks() {
  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('lock:')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore when localStorage is unavailable.
  }
}

export function preloadAppLanguage() {
  return preloadTranslations(getInitialLanguagePreference());
}

export function scheduleDiscoverCatalogWarmup() {
  const warmCatalog = () =>
    import('@/features/discover/lib/recommend').then((module) => module.getAllTitles().catch(() => {}));

  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmCatalog, { timeout: 5000 });
    return;
  }

  setTimeout(warmCatalog, 1500);
}
