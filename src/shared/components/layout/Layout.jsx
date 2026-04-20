import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DonateModal } from '@/features/donate';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { Header, Footer } from '@/shared/components/layout/Header';
import { CoffeeSupportModal } from '@/shared/components/layout/CoffeeSupportModal';
import { MobileSwipePager } from '@/shared/components/layout/MobileSwipePager';
import {
  SUPPORT_MODAL_OPEN_EVENT,
  SUPPORT_STRIPE_COFFEE_URL,
  isSuppressedToday,
  suppressToday,
} from '@/shared/config/support';
import { useDonateConfig } from '@/shared/hooks/useDonateConfig';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';
import './Layout.css';

const CommandPaletteLauncher = lazy(() => import('@/shared/components/ui/CommandPaletteLauncher').then((module) => ({
  default: module.CommandPaletteLauncher,
})));

const SWIPE_ROUTE_PREFIXES = ['/', '/discover', '/battle', '/watchlist', '/profile'];

function isSwipeRoutePath(pathname) {
  if (pathname === '/') return true;
  return SWIPE_ROUTE_PREFIXES.some((prefix) => prefix !== '/' && (pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

function useIsMobileViewport() {
  const getMatches = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [matches, setMatches] = useState(getMatches);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (event) => setMatches(event.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);
  return matches;
}

export function Layout() {
  const { pick } = useLanguage();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [dismissToday, setDismissToday] = useState(false);
  const location = useLocation();
  const supportConfig = useSupportConfig();
  const donateConfig = useDonateConfig();
  const isMobile = useIsMobileViewport();
  const useSwipePager = isMobile && isSwipeRoutePath(location.pathname || '/');

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
    if (useSwipePager) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, useSwipePager]);

  const shouldSuppressSupportPrompt = useMemo(() => {
    const pathname = location.pathname || '';
    return pathname.startsWith('/admin');
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || shouldSuppressSupportPrompt || supportModalOpen || !supportConfig.enabled || isSuppressedToday()) {
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
    if (dismissToday) {
      suppressToday();
      setDismissToday(false);
    }
    setSupportModalOpen(false);
  }, [dismissToday]);

  const handleSupportCoffee = useCallback(() => {
    if (!SUPPORT_STRIPE_COFFEE_URL) {
      return;
    }

    window.open(SUPPORT_STRIPE_COFFEE_URL, '_blank', 'noopener,noreferrer');
    setSupportModalOpen(false);
  }, []);

  const handleOpenPromptPay = useCallback(() => {
    setSupportModalOpen(false);
    setDonateOpen(true);
  }, []);

  return (
    <div className="app-wrapper">
      <Header onOpenCommandPalette={openPalette} />
      <main className={`main-content${useSwipePager ? ' main-content--swipe' : ''}`}>
        {useSwipePager ? <MobileSwipePager /> : <Outlet />}
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
        onPromptPay={handleOpenPromptPay}
        config={supportConfig}
        donateEnabled={donateConfig.enabled}
        dismissToday={dismissToday}
        onDismissTodayChange={setDismissToday}
      />
      {donateConfig.enabled ? (
        <DonateModal open={donateOpen} onClose={() => setDonateOpen(false)} config={donateConfig} />
      ) : null}
    </div>
  );
}
