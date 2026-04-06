import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getInitialLanguagePreference, preloadTranslations } from '@/shared/contexts/LanguageContext';
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

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Warm catalog cache during idle time so the first "Find My Match" is instant
  const warmCatalog = () =>
    import('@/features/discover/lib/recommend').then((m) => m.getAllTitles().catch(() => {}));
  if ('requestIdleCallback' in window) {
    requestIdleCallback(warmCatalog, { timeout: 5000 });
  } else {
    setTimeout(warmCatalog, 1500);
  }
}

void bootstrap();
