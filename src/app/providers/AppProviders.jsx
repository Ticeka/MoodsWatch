import React from 'react';
import { AuthProvider } from '@/features/auth/contexts/AuthContext';
import { WatchlistProvider } from '@/features/watchlist/contexts/WatchlistContext';
import { AgeGateProvider } from '@/shared/contexts/AgeGateContext';
import { LanguageProvider } from '@/shared/contexts/LanguageContext';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';

export function AppProviders({ children }) {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AgeGateProvider>
          <AuthProvider>
            <WatchlistProvider>
              {children}
            </WatchlistProvider>
          </AuthProvider>
        </AgeGateProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default AppProviders;
