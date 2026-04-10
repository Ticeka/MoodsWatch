import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Header, Footer } from '@/shared/components/layout/Header';
import { CoffeeSupportModal } from '@/shared/components/layout/CoffeeSupportModal';
import {
  SUPPORT_MODAL_OPEN_EVENT,
  SUPPORT_STRIPE_COFFEE_URL,
} from '@/shared/config/support';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';
import './Layout.css';

const CommandPaletteLauncher = lazy(() => import('@/shared/components/ui/CommandPaletteLauncher').then((module) => ({
  default: module.CommandPaletteLauncher,
})));

export function Layout() {
  const { pick } = useLanguage();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const location = useLocation();
  const supportConfig = useSupportConfig();

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

  const shouldSuppressSupportPrompt = useMemo(() => {
    const pathname = location.pathname || '';
    return pathname.startsWith('/admin');
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || shouldSuppressSupportPrompt || supportModalOpen || !supportConfig.enabled) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setSupportModalOpen(true);
    }, supportConfig.modalDelayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [shouldSuppressSupportPrompt, supportConfig.enabled, supportConfig.modalDelayMs, supportModalOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleOpenRequest = () => {
      setSupportModalOpen(true);
    };

    window.addEventListener(SUPPORT_MODAL_OPEN_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener(SUPPORT_MODAL_OPEN_EVENT, handleOpenRequest);
    };
  }, []);

  const closeSupportModal = useCallback(() => {
    setSupportModalOpen(false);
  }, []);

  const handleSupportCoffee = useCallback(() => {
    if (!SUPPORT_STRIPE_COFFEE_URL) {
      return;
    }

    window.open(SUPPORT_STRIPE_COFFEE_URL, '_blank', 'noopener,noreferrer');
    setSupportModalOpen(false);
  }, []);

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
      <CoffeeSupportModal
        pick={pick}
        open={supportModalOpen}
        onClose={closeSupportModal}
        onSupport={handleSupportCoffee}
        config={supportConfig}
      />
    </div>
  );
}
