import React, { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useDiscoverSavedSearches } from '@/features/discover/hooks/useDiscoverSavedSearches';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { CommandPalette } from '@/shared/components/ui/CommandPalette';
import { Header, Footer } from '@/shared/components/layout/Header';
import './Layout.css';

export function Layout() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { savedSearches } = useDiscoverSavedSearches(t);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Bind Cmd/Ctrl+K globally
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        // Don't hijack if focus is on an input/textarea (let browser handle)
        if (tag === 'textarea') return;
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-wrapper">
      <Header onOpenCommandPalette={openPalette} />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        userId={user?.id || null}
        savedSearches={savedSearches}
      />
    </div>
  );
}
