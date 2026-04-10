import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, BookMarked, ChevronDown, Coffee, Globe, Home, ListOrdered, LogOut, Menu, Moon, Search, Settings, ShieldAlert, Sparkles, Sun, User, Users, Users2, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from '@/shared/config/brand';
import { AdultModeBadgeIcon } from '@/shared/components/layout/AdultModeBadgeIcon';
import { getAdultModeLabel, scheduleWhenIdle } from '@/shared/components/layout/headerUtils';
import { GuestSettingsDropdown } from '@/shared/components/layout/GuestSettingsDropdown';
import { HeaderSearchFallback } from '@/shared/components/layout/HeaderSearchFallback';
import { LanguageToggle } from '@/shared/components/layout/LanguageToggle';
import { NotificationBell } from '@/shared/components/layout/NotificationBell';
import { BattleVsIcon } from '@/shared/components/icons/BattleVsIcon';
import { SUPPORT_STRIPE_COFFEE_URL } from '@/shared/config/support';
import { useSupportConfig } from '@/shared/hooks/useSupportConfig';
import './Layout.css';

const HeaderSearchExperience = lazy(() => import('@/shared/components/layout/HeaderSearchExperience').then((module) => ({
  default: module.HeaderSearchExperience,
})));

export { Footer } from '@/shared/components/layout/Footer';

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { showAdult, toggleAdult } = useAgeGate();
  const { t, pick } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const supportConfig = useSupportConfig();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [globalSearch, setGlobalSearch] = useState(() => (
    location.pathname === '/discover'
      ? new URLSearchParams(location.search).get('q') || ''
      : ''
  ));
  const [searchEnhancementsEnabled, setSearchEnhancementsEnabled] = useState(() => (
    location.pathname === '/discover'
      || Boolean((location.pathname === '/discover' ? new URLSearchParams(location.search).get('q') : '')?.trim())
  ));
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef(null);
  const chipRef = useRef(null);
  const portalRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const menuBtnRef = useRef(null);

  const isActive = (path) => location.pathname === path;
  const isDiscoverActive = location.pathname === '/discover';
  const isTierListActive = location.pathname.startsWith('/tierlist');
  const userLabel = user?.profile?.name || user?.email?.split('@')[0] || t('layout.userFallback');
  const userRole = user?.profile?.role;
  const canAccessAdmin = userRole === 'admin' || userRole === 'editor';
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const enableSearchEnhancements = useCallback(() => {
    setSearchEnhancementsEnabled(true);
  }, []);

  const performFallbackSearch = useCallback((nextQuery = globalSearch.trim()) => {
    const normalizedQuery = String(nextQuery || '').trim();
    const nextParams = new URLSearchParams();
    if (normalizedQuery) {
      nextParams.set('q', normalizedQuery);
    }

    navigate(
      {
        pathname: '/discover',
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      },
      {
        state: {
          globalSearch: {
            query: normalizedQuery,
            submittedAt: Date.now(),
          },
        },
      }
    );
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [globalSearch, navigate]);

  const submitFallbackSearch = useCallback((event) => {
    event.preventDefault();
    performFallbackSearch();
  }, [performFallbackSearch]);

  const clearFallbackSearch = useCallback(() => {
    setGlobalSearch('');

    if (isDiscoverActive) {
      performFallbackSearch('');
      setDropdownOpen(false);
    }
  }, [isDiscoverActive, performFallbackSearch]);

  useEffect(() => {
    let frameId = null;
    let lastScrolled = window.scrollY > 20;

    const updateScrolled = () => {
      frameId = null;
      const nextScrolled = window.scrollY > 20;
      if (nextScrolled !== lastScrolled) {
        lastScrolled = nextScrolled;
        setScrolled(nextScrolled);
      }
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(updateScrolled);
    };

    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(event.target) &&
        portalRef.current && !portalRef.current.contains(event.target)
      ) {
        setDropdownOpen(false);
      }
    };

    updateScrolled();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (dropdownOpen && chipRef.current) {
      const rect = chipRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      drawerCloseRef.current?.focus();
    } else {
      menuBtnRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  useEffect(() => {
    const nextSearch = location.pathname === '/discover'
      ? new URLSearchParams(location.search).get('q') || ''
      : '';
    setGlobalSearch(nextSearch);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (searchEnhancementsEnabled) {
      return undefined;
    }

    const cancelIdleWork = scheduleWhenIdle(() => {
      setSearchEnhancementsEnabled(true);
    }, 1600);

    return () => {
      cancelIdleWork?.();
    };
  }, [searchEnhancementsEnabled]);

  return (
    <>
      <header className={`header glass ${scrolled ? 'header-scrolled' : ''}`}>
        <div className="container header-content">
          <Link to="/" className="logo" onClick={closeMobileMenu}>
            <span className="logo-icon">
              <Sparkles size={19} />
            </span>
            <span className="logo-wordmark">{BRAND_WORDMARK_LEAD}<span className="logo-accent">{BRAND_WORDMARK_ACCENT}</span></span>
          </Link>

          {searchEnhancementsEnabled ? (
            <Suspense fallback={(
              <HeaderSearchFallback
                surface="header"
                query={globalSearch}
                setQuery={setGlobalSearch}
                isDiscoverActive={isDiscoverActive}
                onActivate={enableSearchEnhancements}
                onSubmit={submitFallbackSearch}
                onClear={clearFallbackSearch}
                t={t}
              />
            )}
            >
              <HeaderSearchExperience
                surface="header"
                query={globalSearch}
                setQuery={setGlobalSearch}
                enabled={!mobileMenuOpen}
                onEnable={enableSearchEnhancements}
                isDiscoverActive={isDiscoverActive}
                onCloseMobileMenu={closeMobileMenu}
                userId={user?.id || null}
                showAdult={showAdult}
              />
            </Suspense>
          ) : (
            <HeaderSearchFallback
              surface="header"
              query={globalSearch}
              setQuery={setGlobalSearch}
              isDiscoverActive={isDiscoverActive}
              onActivate={enableSearchEnhancements}
              onSubmit={submitFallbackSearch}
              onClear={clearFallbackSearch}
              t={t}
            />
          )}

          <nav className="desktop-nav" aria-label={t('layout.mainNav')}>
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Home size={16} /><span className="nav-link-label">{t('layout.home')}</span>
            </Link>
            <Link to="/discover" className={`nav-link nav-link-discover ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Search size={16} /><span className="nav-link-label">{t('layout.discover')}</span>
            </Link>
            <Link to="/battle" className={`nav-link ${isActive('/battle') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <BattleVsIcon size={17} /><span className="nav-link-label">{t('layout.battle')}</span>
            </Link>
            <Link to="/tierlist" className={`nav-link ${isTierListActive ? 'active' : ''}`} onClick={closeMobileMenu}>
              <ListOrdered size={16} /><span className="nav-link-label">{t('layout.tierlist')}</span>
            </Link>
            <Link to="/party" className={`nav-link ${isActive('/party') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Users2 size={17} /><span className="nav-link-label">{t('layout.party')}</span>
            </Link>
            <Link to="/watchlist" className={`nav-link ${isActive('/watchlist') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <BookMarked size={16} /><span className="nav-link-label">{t('layout.watchlist')}</span>
            </Link>
          </nav>

          <div className="header-actions">
            {!user && (
              <div className="guest-actions-desktop">
                <GuestSettingsDropdown showAdult={showAdult} toggleAdult={toggleAdult} theme={theme} toggleTheme={toggleTheme} t={t} pick={pick} />
              </div>
            )}

            {user && <NotificationBell userId={user.id} />}

            {user ? (
              <div className="user-dropdown-container" ref={dropdownRef}>
                <button
                  id="user-chip-btn"
                  ref={chipRef}
                  className={`user-chip ${dropdownOpen ? 'ring-active' : ''}`}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-label={t('layout.accountMenuFor', { name: userLabel })}
                  title={t('layout.accountMenuFor', { name: userLabel })}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="menu"
                  aria-controls="user-account-menu"
                  type="button"
                >
                  {user?.profile?.avatar_url ? (
                    <img src={user.profile.avatar_url} alt="" className="user-avatar" />
                  ) : (
                    <span className="user-avatar" aria-hidden="true">
                      {userLabel.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="user-name desktop-only">{userLabel}</span>
                  <ChevronDown size={14} className={`dropdown-chevron desktop-only ${dropdownOpen ? 'rotate' : ''}`} />
                </button>
              </div>
            ) : (
              <Link to="/login" className="login-btn" onClick={closeMobileMenu}>
                {t('layout.login')}
              </Link>
            )}

            <button
              ref={menuBtnRef}
              className={`mobile-menu-btn ${mobileMenuOpen ? 'active' : ''}`}
              type="button"
              aria-label={mobileMenuOpen ? t('layout.closeMenu') : t('layout.openMenu')}
              title={mobileMenuOpen ? t('layout.closeMenu') : t('layout.openMenu')}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-drawer-nav"
              onClick={() => setMobileMenuOpen((current) => !current)}
            >
              {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <div className={`mobile-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)} aria-hidden="true"></div>
      <nav id="mobile-drawer-nav" className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`} aria-label={t('layout.mobileNav')}>
        <div className="drawer-header">
          <span className="drawer-title">
            <span className="logo-icon logo-icon-sm"><Sparkles size={15} /></span>
            <span className="logo-wordmark">{BRAND_WORDMARK_LEAD}<span className="logo-accent">{BRAND_WORDMARK_ACCENT}</span></span>
          </span>
          <button ref={drawerCloseRef} className="drawer-close" onClick={() => setMobileMenuOpen(false)} aria-label={t('layout.closeMenu')} type="button">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {searchEnhancementsEnabled ? (
          <Suspense fallback={(
            <HeaderSearchFallback
              surface="drawer"
              query={globalSearch}
              setQuery={setGlobalSearch}
              onActivate={enableSearchEnhancements}
              onSubmit={submitFallbackSearch}
              onClear={clearFallbackSearch}
              t={t}
            />
          )}
          >
            <HeaderSearchExperience
              surface="drawer"
              query={globalSearch}
              setQuery={setGlobalSearch}
              enabled={mobileMenuOpen}
              onEnable={enableSearchEnhancements}
              onCloseMobileMenu={closeMobileMenu}
              userId={user?.id || null}
              showAdult={showAdult}
            />
          </Suspense>
        ) : (
          <HeaderSearchFallback
            surface="drawer"
            query={globalSearch}
            setQuery={setGlobalSearch}
            onActivate={enableSearchEnhancements}
            onSubmit={submitFallbackSearch}
            onClear={clearFallbackSearch}
            t={t}
          />
        )}
        <div className="drawer-links">
          <Link to="/" className={`drawer-link ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Home size={18} /> {t('layout.home')}
          </Link>
          <Link to="/discover" className={`drawer-link ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Search size={18} /> {t('layout.discover')}
          </Link>
          <Link to="/battle" className={`drawer-link ${isActive('/battle') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <BattleVsIcon size={18} /> {t('layout.battle')}
          </Link>
          <Link to="/tierlist" className={`drawer-link ${isTierListActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            <ListOrdered size={18} /> {t('layout.tierlist')}
          </Link>
          <Link to="/party" className={`drawer-link ${isActive('/party') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Users2 size={18} /> {t('layout.party')}
          </Link>
          <Link to="/watchlist" className={`drawer-link ${isActive('/watchlist') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <BookMarked size={18} /> {t('layout.watchlist')}
          </Link>
          <Link to="/stats" className={`drawer-link ${isActive('/stats') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <BarChart2 size={18} /> {t('layout.stats')}
          </Link>
          {user && (
            <Link to="/profile" className={`drawer-link ${isActive('/profile') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <User size={18} /> {t('layout.profile')}
            </Link>
          )}
        </div>
        <div className="drawer-footer">
          <LanguageToggle />
          {user ? (
            <>
              <div className="drawer-user">
                {user?.profile?.avatar_url ? (
                  <img src={user.profile.avatar_url} alt="" className="user-avatar" />
                ) : (
                  <span className="user-avatar">{userLabel.charAt(0).toUpperCase()}</span>
                )}
                <span>{userLabel}</span>
              </div>
              {canAccessAdmin && (
                <Link to="/admin" className="drawer-link admin" onClick={closeMobileMenu}>
                  <ShieldAlert size={18} /> {t('layout.admin')}
                </Link>
              )}
              <button type="button" onClick={signOut} className="drawer-link logout">
                <LogOut size={18} /> {t('layout.logout')}
              </button>
            </>
          ) : (
            <Link to="/login" className="drawer-link" onClick={closeMobileMenu}>
              <User size={18} /> {t('layout.login')}
            </Link>
          )}
          <button type="button" onClick={toggleAdult} className={`drawer-link theme adult-toggle-btn ${showAdult ? 'is-active' : ''}`}>
            <AdultModeBadgeIcon size={18} active={showAdult} />
            {getAdultModeLabel(showAdult)}
          </button>
          <button type="button" onClick={toggleTheme} className="drawer-link theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
          </button>
          <a
            href={SUPPORT_STRIPE_COFFEE_URL || undefined}
            target={SUPPORT_STRIPE_COFFEE_URL ? '_blank' : undefined}
            rel={SUPPORT_STRIPE_COFFEE_URL ? 'noreferrer' : undefined}
            className={`drawer-link drawer-link-support${SUPPORT_STRIPE_COFFEE_URL ? '' : ' is-disabled'}`}
            aria-disabled={!SUPPORT_STRIPE_COFFEE_URL}
            onClick={(event) => {
              if (!SUPPORT_STRIPE_COFFEE_URL) {
                event.preventDefault();
              }
              closeMobileMenu();
            }}
          >
            <Coffee size={18} /> {pick(supportConfig.menuLabelTh, supportConfig.menuLabelEn)}
          </a>
        </div>
      </nav>

      <nav className="bottom-nav" aria-label={t('layout.bottomNav')}>
        <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
          <Home size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.home')}</span>
        </Link>
        <Link to="/discover" className={`bottom-nav-item ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
          <Search size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.discover')}</span>
        </Link>
        <Link to="/battle" className={`bottom-nav-item ${isActive('/battle') ? 'active' : ''}`} onClick={closeMobileMenu}>
          <BattleVsIcon size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.battle')}</span>
        </Link>
        <Link to="/party" className={`bottom-nav-item ${isActive('/party') ? 'active' : ''}`} onClick={closeMobileMenu}>
          <Users2 size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.party')}</span>
        </Link>
        <Link to="/watchlist" className={`bottom-nav-item ${isActive('/watchlist') ? 'active' : ''}`} onClick={closeMobileMenu}>
          <BookMarked size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.watchlist')}</span>
        </Link>
        {user && (
          <Link to="/profile" className={`bottom-nav-item ${isActive('/profile') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <User size={20} className="bottom-nav-icon" />
            <span className="bottom-nav-label">{t('layout.profile')}</span>
          </Link>
        )}
        <button type="button" onClick={toggleAdult} className={`bottom-nav-item adult-toggle-btn ${showAdult ? 'is-active' : ''}`}>
          <AdultModeBadgeIcon size={20} active={showAdult} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{getAdultModeLabel(showAdult)}</span>
        </button>
        <button type="button" onClick={toggleTheme} className="bottom-nav-item">
          {theme === 'dark' ? <Sun size={20} className="bottom-nav-icon" /> : <Moon size={20} className="bottom-nav-icon" />}
          <span className="bottom-nav-label">{theme === 'dark' ? t('common.themeLight') : t('common.themeDark')}</span>
        </button>
      </nav>

      {dropdownOpen && user && createPortal(
        <div
          id="user-account-menu"
          ref={portalRef}
          className="user-dropdown-menu glass-heavy"
          style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right }}
          onMouseDown={(event) => event.stopPropagation()}
          role="menu"
          aria-labelledby="user-chip-btn"
        >
          <div className="dropdown-header mobile-only">
            <strong>{userLabel}</strong>
            {canAccessAdmin && <span className="role-badge">{userRole}</span>}
          </div>

          <div className="dropdown-group language-group">
            <span className="dropdown-label"><Globe size={14} /> {t('layout.language')}</span>
            <LanguageToggle />
          </div>

          <button className={`dropdown-item adult-toggle-btn ${showAdult ? 'is-active' : ''}`} onClick={toggleAdult} role="menuitem" type="button">
            <AdultModeBadgeIcon size={16} active={showAdult} />
            <span>{getAdultModeLabel(showAdult)}</span>
          </button>
          <button className="dropdown-item" onClick={toggleTheme} role="menuitem" type="button">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? t('layout.lightMode') : t('layout.darkMode')}</span>
          </button>

          <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)} role="menuitem">
            <Settings size={16} />
            <span>{t('layout.profile')}</span>
          </Link>

          <Link to="/feed" className="dropdown-item" onClick={() => setDropdownOpen(false)} role="menuitem">
            <Users size={16} />
            <span>{t('layout.feed')}</span>
          </Link>

          <Link to="/stats" className="dropdown-item" onClick={() => setDropdownOpen(false)} role="menuitem">
            <BarChart2 size={16} />
            <span>{t('layout.stats')}</span>
          </Link>

          <a
            href={SUPPORT_STRIPE_COFFEE_URL || undefined}
            target={SUPPORT_STRIPE_COFFEE_URL ? '_blank' : undefined}
            rel={SUPPORT_STRIPE_COFFEE_URL ? 'noreferrer' : undefined}
            className={`dropdown-item dropdown-item-support${SUPPORT_STRIPE_COFFEE_URL ? '' : ' is-disabled'}`}
            onClick={(event) => {
              if (!SUPPORT_STRIPE_COFFEE_URL) {
                event.preventDefault();
              }
              setDropdownOpen(false);
            }}
            role="menuitem"
            aria-disabled={!SUPPORT_STRIPE_COFFEE_URL}
          >
            <Coffee size={16} />
            <span>{pick(supportConfig.profileLabelTh, supportConfig.profileLabelEn)}</span>
          </a>

          {canAccessAdmin && (
            <Link to="/admin" className="dropdown-item admin-item" onClick={() => setDropdownOpen(false)} role="menuitem">
              <ShieldAlert size={16} />
              <span>{t('layout.adminDesktop')}</span>
            </Link>
          )}

          <div className="dropdown-divider"></div>

          <button
            className="dropdown-item logout-item"
            onClick={() => { setDropdownOpen(false); signOut(); }}
            role="menuitem"
            type="button"
          >
            <LogOut size={16} />
            <span>{t('layout.logout')}</span>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
