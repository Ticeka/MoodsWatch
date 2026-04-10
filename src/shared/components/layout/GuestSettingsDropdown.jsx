import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Globe, Moon, Settings, ShieldAlert, Sun } from 'lucide-react';
import { getAdultModeLabel } from '@/shared/components/layout/headerUtils';
import { LanguageToggle } from '@/shared/components/layout/LanguageToggle';
import { SUPPORT_STRIPE_COFFEE_URL } from '@/shared/config/support';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';

export function GuestSettingsDropdown({ showAdult, toggleAdult, theme, toggleTheme, t, pick }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const supportConfig = useSupportConfig();

  useEffect(() => {
    if (!open) return;

    const handleClick = (event) => {
      if (
        btnRef.current && !btnRef.current.contains(event.target) &&
        panelRef.current && !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`guest-pill-btn ${open ? 'is-active' : ''}`}
        onClick={handleToggle}
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
      >
        <Settings size={17} />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="guest-settings-panel glass"
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
        >
          <div className="guest-settings-row">
            <span className="guest-settings-label"><Globe size={13} />{t('layout.language') || 'Language'}</span>
            <LanguageToggle />
          </div>
          <div className="guest-settings-row">
            <span className="guest-settings-label"><ShieldAlert size={13} />18+</span>
            <button
              type="button"
              className={`adult-toggle-btn adult-toggle-btn-desktop ${showAdult ? 'is-active' : ''}`}
              onClick={toggleAdult}
              aria-label={getAdultModeLabel(showAdult)}
            >
              <span className="adult-toggle-desktop-label">18+</span>
              <span className={`adult-toggle-state-dot ${showAdult ? 'is-active' : ''}`} aria-hidden="true" />
            </button>
          </div>
          <div className="guest-settings-row">
            <span className="guest-settings-label">
              {theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
              {theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
            </span>
            <button
              type="button"
              className="guest-pill-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
          <a
            href={SUPPORT_STRIPE_COFFEE_URL || undefined}
            target={SUPPORT_STRIPE_COFFEE_URL ? '_blank' : undefined}
            rel={SUPPORT_STRIPE_COFFEE_URL ? 'noreferrer' : undefined}
            className={`guest-settings-link${SUPPORT_STRIPE_COFFEE_URL ? '' : ' is-disabled'}`}
            aria-disabled={!SUPPORT_STRIPE_COFFEE_URL}
            onClick={(event) => {
              if (!SUPPORT_STRIPE_COFFEE_URL) {
                event.preventDefault();
              }
              setOpen(false);
            }}
          >
            <span className="guest-settings-label"><Coffee size={13} />{pick(supportConfig.menuLabelTh, supportConfig.menuLabelEn)}</span>
            <span className="guest-settings-link-hint">{pick(supportConfig.guestHintTh, supportConfig.guestHintEn)}</span>
          </a>
        </div>,
        document.body
      )}
    </>
  );
}
