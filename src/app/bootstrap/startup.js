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
  // Avoid warming the entire catalog on cold start. At production scale this
  // turns every new visitor into a multi-page canonical_titles fetch.
  const warmCatalog = () =>
    import('@/features/discover/api/discoverTitleCatalogApi')
      .then((module) => module.getTrendingTitles(8, { showAdult: false }).catch(() => {}));

  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmCatalog, { timeout: 5000 });
    return;
  }

  setTimeout(warmCatalog, 1500);
}
