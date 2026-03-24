import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Header, Footer } from '@/shared/components/layout/Header';
import './Layout.css';

const CommandPaletteLauncher = lazy(() => import('@/shared/components/ui/CommandPaletteLauncher').then((module) => ({
  default: module.CommandPaletteLauncher,
})));

export function Layout() {
  useLanguage();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="app-wrapper">
      <Header onOpenCommandPalette={openPalette} />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
      {paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPaletteLauncher isOpen={paletteOpen} onClose={closePalette} />
        </Suspense>
      ) : null}
    </div>
  );
}
