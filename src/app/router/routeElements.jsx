import React from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function PageLoader() {
  const { t } = useLanguage();

  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}
    >
      <Loader2 size={40} className="animate-spin" aria-hidden="true" />
      <div style={{ color: 'var(--text-secondary)' }}>{t('app.loadingContent')}</div>
    </div>
  );
}

export function AdminFallback() {
  const { t } = useLanguage();

  return (
    <div className="admin-page-content" style={{ padding: '5rem', textAlign: 'center' }}>
      <h2>{t('app.adminPlaceholder')}</h2>
    </div>
  );
}

export function LegacyPartyTitleGuessCreateRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('mode', 'title-guess');
  return <Navigate to={`/party/templates/create?${params.toString()}`} replace />;
}
