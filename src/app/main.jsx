import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {
  clearStaleSupabaseLocks,
  preloadAppLanguage,
  scheduleDiscoverCatalogWarmup,
} from './bootstrap/startup';
import './index.css';

clearStaleSupabaseLocks();

async function bootstrap() {
  await preloadAppLanguage();

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  scheduleDiscoverCatalogWarmup();
}

void bootstrap();
