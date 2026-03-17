import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, isLoading, isProfileLoading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (isLoading || (user && allowedRoles.length > 0 && isProfileLoading && !user?.profile?.role)) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinning-icon" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite', marginBottom: '1rem' }}>🌀</div>
          <div style={{ color: 'var(--text-secondary)' }}>{t('app.loadingPermissions')}</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = user?.profile?.role || 'user';

  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    console.warn(`Access denied for role: ${userRole}. Required: ${allowedRoles.join(', ')}`);
    return <Navigate to="/" replace />;
  }

  return children;
}
