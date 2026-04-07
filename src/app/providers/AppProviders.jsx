import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth/contexts/AuthContext';
import { WatchlistProvider } from '@/features/watchlist/contexts/WatchlistContext';
import { AgeGateProvider } from '@/shared/contexts/AgeGateContext';
import { LanguageProvider } from '@/shared/contexts/LanguageContext';
import { ThemeProvider } from '@/shared/contexts/ThemeContext';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
  },
});

export function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

export default AppProviders;
