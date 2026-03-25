import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getInitialLanguagePreference, preloadTranslations } from '@/shared/contexts/LanguageContext';
import { prefetchCatalog } from '@/features/discover/lib/recommend';
import './index.css';

// Clear stale Supabase auth locks that cause timeout issues
try {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('lock:')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
} catch {
  // Ignore - localStorage might be unavailable
}

async function bootstrap() {
  await preloadTranslations(getInitialLanguagePreference());

  // Warm the title catalog cache in the background so the first search
  // doesn't block on a full Supabase download.  Uses requestIdleCallback
  // to avoid competing with initial render.
  const pathname = window.location.pathname || '';
  const shouldPrefetchCatalog = !pathname.startsWith('/tierlist');

  if (shouldPrefetchCatalog) {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => prefetchCatalog(), { timeout: 3000 });
    } else {
      setTimeout(() => prefetchCatalog(), 1500);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
