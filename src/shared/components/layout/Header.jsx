
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart2, Bell, BookMarked, ChevronDown, Globe, Home, ListOrdered, LogOut, Menu, Moon, Search, Settings, ShieldAlert, Sparkles, Sun, Swords, User, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useSearchAutocomplete } from '@/features/discover/hooks/useSearchAutocomplete';
import { recordAutocompleteSelection } from '@/features/discover/lib/autocompleteFeedback';
import { trackDiscoverEvent } from '@/features/discover/lib/discoverAnalytics';
import { readRecentSearches, removeRecentSearch, writeRecentSearches } from '@/features/discover/lib/discoverSearchState';
import { SearchAutocomplete } from '@/shared/components/ui/SearchAutocomplete';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from '@/shared/config/brand';
import { supabase } from '@/shared/lib/supabase';
import './Layout.css';

function scheduleWhenIdle(callback, timeout = 1500) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, Math.min(timeout, 400));
  return () => window.clearTimeout(handle);
}

function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-toggle" role="radiogroup" aria-label={t('layout.language')}>
      <button
        type="button"
        role="radio"
        aria-checked={language === 'en'}
        className={`language-toggle-btn ${language === 'en' ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); setLanguage('en'); }}
      >
        EN
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={language === 'th'}
        className={`language-toggle-btn ${language === 'th' ? 'active' : ''}`}
        onClick={(e) => { e.stopPropagation(); setLanguage('th'); }}
      >
        TH
      </button>
    </div>
  );
}

function AdultModeBadgeIcon({ size = 18, active = false, className = '' }) {
  return (
    <span
      className={`adult-mode-icon ${active ? 'is-active' : ''} ${className}`.trim()}
      style={{ '--adult-mode-icon-size': `${size}px` }}
      aria-hidden="true"
    >
      <span>18+</span>
    </span>
  );
}

function getAdultModeLabel(showAdult) {
  return showAdult ? '18+ ON' : '18+ OFF';
}

function NotificationBell({ userId }) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const bellRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!userId || !supabase) return;
    let cancelled = false;
    let cancelIdleWork = null;

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, message, is_read, created_at, reference_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) setNotifications(data || []);
    }

    cancelIdleWork = scheduleWhenIdle(() => {
      void load();
    }, 2000);

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => {
      cancelled = true;
      cancelIdleWork?.();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (
        bellRef.current && !bellRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async () => {
    if (!supabase || !userId) return;
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleOpen = () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
    if (!open) markAllRead();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      <button
        ref={bellRef}
        className="notif-bell-btn"
        onClick={handleOpen}
        aria-label={t('layout.openNotifications')}
        title={t('layout.openNotifications')}
        type="button"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="notif-panel glass-heavy"
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
        >
          <div className="notif-panel-head">
            <strong>{t('layout.notifications')}</strong>
          </div>
          {notifications.length === 0 ? (
            <p className="notif-empty">{t('layout.notificationsEmpty')}</p>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => {
                let href = null;
                if (n.reference_id) {
                  if (n.type === 'profile_comment' || (n.type === 'comment_reply' && !String(n.reference_id).startsWith('tierlist-'))) {
                    href = `/u/${n.reference_id}`;
                  } else {
                    href = `/tierlist/play/${n.reference_id}`;
                  }
                }
                return (
                  <li key={n.id} className={`notif-item${n.is_read ? '' : ' is-unread'}`}>
                    {href ? (
                      <Link to={href} className="notif-link" onClick={() => setOpen(false)}>
                        {n.message}
                      </Link>
                    ) : (
                      <span>{n.message}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { showAdult, toggleAdult } = useAgeGate();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [globalSearch, setGlobalSearch] = useState(() => (
    location.pathname === '/discover'
      ? new URLSearchParams(location.search).get('q') || ''
      : ''
  ));
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef(null);
  const chipRef = useRef(null);
  const portalRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const menuBtnRef = useRef(null);
  const headerSearchRef = useRef(null);
  const drawerSearchRef = useRef(null);
  const [activeSearchSurface, setActiveSearchSurface] = useState(null);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);

  const isActive = (path) => location.pathname === path;
  const isDiscoverActive = location.pathname === '/discover';
  const isTierListActive = location.pathname.startsWith('/tierlist');
  const userLabel = user?.profile?.name || user?.email?.split('@')[0] || t('layout.userFallback');
  const userRole = user?.profile?.role;
  const canAccessAdmin = userRole === 'admin' || userRole === 'editor';
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const refreshRecentSearches = useCallback(() => {
    setRecentSearches(readRecentSearches());
  }, []);
  const rememberRecentSearch = useCallback((term) => {
    const normalizedTerm = String(term || '').trim();
    if (normalizedTerm.length < 2) {
      return;
    }

    setRecentSearches((current) => writeRecentSearches([
      normalizedTerm,
      ...current.filter((entry) => entry.toLowerCase() !== normalizedTerm.toLowerCase()),
    ]));
  }, []);
  const handleRemoveRecentSearch = useCallback((term) => {
    setRecentSearches(removeRecentSearch(term));
  }, []);
  const {
    groups: autocompleteGroups,
    flatItems: autocompleteItems,
    isLoading: isAutocompleteLoading,
    hasQuery: hasAutocompleteQuery,
    crossLaneNote: autocompleteCrossLaneNote,
  } = useSearchAutocomplete(globalSearch, {
    enabled: activeSearchSurface !== null,
    userId: user?.id || null,
    recentSearches,
    surface: 'header',
    showAdult,
  });

  // reason: 'select' | 'submit' | 'dismiss'
  const closeAutocomplete = useCallback((reason = 'dismiss') => {
    if (reason === 'dismiss' && globalSearch.trim().length >= 2) {
      void trackDiscoverEvent({
        eventType: 'search_abandon',
        userId: user?.id || null,
        query: globalSearch,
        metadata: {
          surface: activeSearchSurface || 'header',
          query_length: globalSearch.trim().length,
        },
      });
    }
    setActiveSearchSurface(null);
    setHighlightedSuggestionIndex(-1);
  }, [activeSearchSurface, globalSearch, user?.id]);

  const performGlobalSearch = useCallback((nextQuery = globalSearch.trim()) => {
    const normalizedQuery = String(nextQuery || '').trim();
    const nextParams = new URLSearchParams();
    if (normalizedQuery) {
      nextParams.set('q', normalizedQuery);
      rememberRecentSearch(normalizedQuery);
      void trackDiscoverEvent({
        eventType: 'search_submit',
        userId: user?.id || null,
        query: normalizedQuery,
        metadata: {
          surface: activeSearchSurface || 'header',
          query_length: normalizedQuery.length,
        },
      });
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
    closeAutocomplete('submit');
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [activeSearchSurface, closeAutocomplete, globalSearch, navigate, rememberRecentSearch, user?.id]);

  const submitGlobalSearch = useCallback((event) => {
    event.preventDefault();
    performGlobalSearch();
  }, [performGlobalSearch]);

  const clearGlobalSearch = useCallback(() => {
    setGlobalSearch('');
    closeAutocomplete('submit');

    if (isDiscoverActive) {
      performGlobalSearch('');
      setDropdownOpen(false);
    }
  }, [closeAutocomplete, isDiscoverActive, performGlobalSearch]);

  const handleSuggestionSelect = useCallback((item = null, surface = activeSearchSurface || 'header') => {
    const nextRecentTerm = item?.searchTerm || globalSearch.trim();
    if (nextRecentTerm) {
      rememberRecentSearch(nextRecentTerm);
    }
    if (item?.id) {
      recordAutocompleteSelection({ query: globalSearch, itemId: item.id });
      void trackDiscoverEvent({
        eventType: 'autocomplete_select',
        userId: user?.id || null,
        query: globalSearch,
        scope: 'all',
        resultType: item.groupId || item.kind || 'unknown',
        resultId: item.entityId || item.id,
        metadata: {
          surface,
          href: item.href || null,
          isRecent: item.groupId === 'recent',
          selected_group: item.groupId || item.kind || null,
          query_length: globalSearch.trim().length,
        },
      });
    }
    closeAutocomplete('select');
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [activeSearchSurface, closeAutocomplete, globalSearch, rememberRecentSearch, user?.id]);

  const handleGlobalSearchKeyDown = useCallback((event, surface) => {
    const hasSuggestions = autocompleteItems.length > 0;

    if (event.key === 'Escape') {
      closeAutocomplete();
      return;
    }

    if (event.key === 'Tab' && hasSuggestions) {
      // Cycle through items with Tab/Shift+Tab instead of leaving the input
      event.preventDefault();
      setActiveSearchSurface(surface);
      if (event.shiftKey) {
        setHighlightedSuggestionIndex((current) => (current <= 0 ? autocompleteItems.length - 1 : current - 1));
      } else {
        setHighlightedSuggestionIndex((current) => (current + 1) % autocompleteItems.length);
      }
      return;
    }

    if (!hasSuggestions) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchSurface(surface);
      setHighlightedSuggestionIndex((current) => (current + 1) % autocompleteItems.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchSurface(surface);
      setHighlightedSuggestionIndex((current) => (current <= 0 ? autocompleteItems.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveSearchSurface(surface);
      setHighlightedSuggestionIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveSearchSurface(surface);
      setHighlightedSuggestionIndex(autocompleteItems.length - 1);
      return;
    }

    if (event.key === 'Enter' && highlightedSuggestionIndex >= 0) {
      event.preventDefault();
      const selectedItem = autocompleteItems[highlightedSuggestionIndex];
      if (selectedItem?.href) {
        navigate(
          selectedItem.href,
          selectedItem.navigateState ? { state: selectedItem.navigateState } : undefined,
        );
        handleSuggestionSelect(selectedItem, surface);
      }
    }
  }, [autocompleteItems, closeAutocomplete, handleSuggestionSelect, highlightedSuggestionIndex, navigate]);

  useEffect(() => {
    const handleRecentSearchSync = () => {
      refreshRecentSearches();
    };

    window.addEventListener('focus', handleRecentSearchSync);
    window.addEventListener('storage', handleRecentSearchSync);

    return () => {
      window.removeEventListener('focus', handleRecentSearchSync);
      window.removeEventListener('storage', handleRecentSearchSync);
    };
  }, [refreshRecentSearches]);

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

      if (
        headerSearchRef.current && !headerSearchRef.current.contains(event.target) &&
        drawerSearchRef.current && !drawerSearchRef.current.contains(event.target)
      ) {
        closeAutocomplete();
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
  }, [closeAutocomplete]);

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
    setHighlightedSuggestionIndex(-1);
  }, [globalSearch, activeSearchSurface]);

  useEffect(() => {
    const nextSearch = location.pathname === '/discover'
      ? new URLSearchParams(location.search).get('q') || ''
      : '';
    setGlobalSearch(nextSearch);
  }, [location.pathname, location.search]);

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

          <form
            ref={headerSearchRef}
            className={`header-search ${isDiscoverActive ? 'is-active' : ''}`}
            onSubmit={submitGlobalSearch}
            role="search"
            aria-label={t('discover.searchInputLabel')}
          >
            <label htmlFor="header-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
            <input
              id="header-global-search"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="header-search-listbox"
              aria-expanded={activeSearchSurface === 'header' && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading) ? true : false}
              aria-activedescendant={
                activeSearchSurface === 'header' && highlightedSuggestionIndex >= 0
                  ? (autocompleteItems[highlightedSuggestionIndex]?.id || undefined)
                  : undefined
              }
              value={globalSearch}
              onChange={(event) => {
                setGlobalSearch(event.target.value);
                setActiveSearchSurface('header');
              }}
              onFocus={() => {
                refreshRecentSearches();
                setActiveSearchSurface('header');
              }}
              onKeyDown={(event) => handleGlobalSearchKeyDown(event, 'header')}
              className="header-search-input"
              placeholder={t('discover.searchPlaceholder')}
              autoComplete="off"
            />
            <Search size={16} className="header-search-icon" aria-hidden="true" />
            {globalSearch ? (
              <button
                type="button"
                className="header-search-clear"
                onClick={clearGlobalSearch}
                aria-label={t('discover.clearSearch')}
                title={t('discover.clearSearch')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
            <button type="submit" className="header-search-submit" aria-label={t('discover.searchLabel')} title={t('discover.searchLabel')}>
              <Search size={17} aria-hidden="true" />
            </button>
            <SearchAutocomplete
              groups={autocompleteGroups}
              flatItems={autocompleteItems}
              isLoading={isAutocompleteLoading}
              isOpen={activeSearchSurface === 'header' && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading)}
              highlightedIndex={highlightedSuggestionIndex}
              query={globalSearch}
              variant="header"
              listboxId="header-search-listbox"
              t={t}
              crossLaneNote={autocompleteCrossLaneNote}
              onSelect={handleSuggestionSelect}
              onSearchAll={() => performGlobalSearch()}
              onRemoveRecent={handleRemoveRecentSearch}
            />
          </form>

          <nav className="desktop-nav" aria-label={t('layout.mainNav')}>
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Home size={16} /><span className="nav-link-label">{t('layout.home')}</span>
            </Link>
            <Link to="/discover" className={`nav-link nav-link-discover ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Search size={16} /><span className="nav-link-label">{t('layout.discover')}</span>
            </Link>
            <Link to="/battle" className={`nav-link ${isActive('/battle') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Swords size={16} /><span className="nav-link-label">{t('layout.battle')}</span>
            </Link>
            <Link to="/tierlist" className={`nav-link ${isTierListActive ? 'active' : ''}`} onClick={closeMobileMenu}>
              <ListOrdered size={16} /><span className="nav-link-label">{t('layout.tierlist')}</span>
            </Link>
            <Link to="/watchlist" className={`nav-link ${isActive('/watchlist') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <BookMarked size={16} /><span className="nav-link-label">{t('layout.watchlist')}</span>
            </Link>
            {user && (
              <Link to="/feed" className={`nav-link ${isActive('/feed') ? 'active' : ''}`} onClick={closeMobileMenu}>
                <Users size={16} /><span className="nav-link-label">{t('layout.feed')}</span>
              </Link>
            )}
          </nav>

          <div className="header-actions">

            {!user && (
              <div className="guest-actions-desktop">
                <LanguageToggle />
                <div className="guest-icon-group">
                  <button
                    type="button"
                    className={`guest-pill-btn adult-toggle-btn adult-toggle-btn-desktop ${showAdult ? 'is-active' : ''}`}
                    onClick={toggleAdult}
                    aria-label={getAdultModeLabel(showAdult)}
                    title={getAdultModeLabel(showAdult)}
                  >
                    <span className="adult-toggle-desktop-label">18+</span>
                    <span className={`adult-toggle-state-dot ${showAdult ? 'is-active' : ''}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="guest-pill-btn"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
                    title={theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
                  >
                    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  </button>
                </div>
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
        <div ref={drawerSearchRef} className="drawer-search-wrap">
          <form className="drawer-search" onSubmit={submitGlobalSearch} role="search" aria-label={t('discover.searchInputLabel')}>
            <Search size={16} className="drawer-search-icon" aria-hidden="true" />
            <label htmlFor="drawer-global-search" className="visually-hidden">{t('discover.searchInputLabel')}</label>
            <input
              id="drawer-global-search"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="drawer-search-listbox"
              aria-expanded={activeSearchSurface === 'drawer' && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading) ? true : false}
              aria-activedescendant={
                activeSearchSurface === 'drawer' && highlightedSuggestionIndex >= 0
                  ? (autocompleteItems[highlightedSuggestionIndex]?.id || undefined)
                  : undefined
              }
              className="drawer-search-input"
              value={globalSearch}
              onChange={(event) => {
                setGlobalSearch(event.target.value);
                setActiveSearchSurface('drawer');
              }}
              onFocus={() => {
                refreshRecentSearches();
                setActiveSearchSurface('drawer');
              }}
              onKeyDown={(event) => handleGlobalSearchKeyDown(event, 'drawer')}
              placeholder={t('discover.searchPlaceholder')}
              autoComplete="off"
            />
            {globalSearch ? (
              <button
                type="button"
                className="drawer-search-clear"
                onClick={clearGlobalSearch}
                aria-label={t('discover.clearSearch')}
                title={t('discover.clearSearch')}
              >
                <X size={15} aria-hidden="true" />
              </button>
            ) : null}
            <button type="submit" className="drawer-search-submit">
              {t('discover.searchLabel')}
            </button>
          </form>
          <SearchAutocomplete
            groups={autocompleteGroups}
            flatItems={autocompleteItems}
            isLoading={isAutocompleteLoading}
            isOpen={activeSearchSurface === 'drawer' && (autocompleteItems.length > 0 || hasAutocompleteQuery || isAutocompleteLoading)}
            highlightedIndex={highlightedSuggestionIndex}
            query={globalSearch}
            variant="drawer"
            listboxId="drawer-search-listbox"
            t={t}
            crossLaneNote={autocompleteCrossLaneNote}
            onSelect={handleSuggestionSelect}
            onSearchAll={() => performGlobalSearch()}
            onRemoveRecent={handleRemoveRecentSearch}
          />
        </div>
        <div className="drawer-links">
          <Link to="/" className={`drawer-link ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Home size={18} /> {t('layout.home')}
          </Link>
          <Link to="/discover" className={`drawer-link ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Search size={18} /> {t('layout.discover')}
          </Link>
          <Link to="/battle" className={`drawer-link ${isActive('/battle') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <Swords size={18} /> {t('layout.battle')}
          </Link>
          <Link to="/tierlist" className={`drawer-link ${isTierListActive ? 'active' : ''}`} onClick={closeMobileMenu}>
            <ListOrdered size={18} /> {t('layout.tierlist')}
          </Link>
          <Link to="/watchlist" className={`drawer-link ${isActive('/watchlist') ? 'active' : ''}`} onClick={closeMobileMenu}>
            <BookMarked size={18} /> {t('layout.watchlist')}
          </Link>
          {user && (
            <Link to="/feed" className={`drawer-link ${isActive('/feed') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Users size={18} /> {t('layout.feed')}
            </Link>
          )}
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
          <Swords size={20} className="bottom-nav-icon" />
          <span className="bottom-nav-label">{t('layout.battle')}</span>
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
          onMouseDown={(e) => e.stopPropagation()}
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

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="footer">
      <div className="container footer-content">
        <div className="footer-brand">
          <Link to="/" className="logo">
            <span className="logo-icon">
              <Sparkles size={19} />
            </span>
            <span className="logo-wordmark">{BRAND_WORDMARK_LEAD}<span className="logo-accent">{BRAND_WORDMARK_ACCENT}</span></span>
          </Link>
          <p className="footer-desc">{t('layout.footerDesc')}</p>
        </div>

        <div className="footer-links">
          <div className="link-group">
            <h4>{t('layout.menu')}</h4>
            <Link to="/">{t('layout.home')}</Link>
            <Link to="/battle">{t('layout.battle')}</Link>
            <Link to="/tierlist">{t('layout.tierlist')}</Link>
            <Link to="/discover">{t('layout.discover')}</Link>
            <Link to="/watchlist">{t('layout.watchlist')}</Link>
            <Link to="/stats">{t('layout.stats')}</Link>
            <Link to="/profile">{t('layout.profile')}</Link>
          </div>
          <div className="link-group">
            <h4>{t('layout.more')}</h4>
            <Link to="#">{t('layout.about')}</Link>
            <Link to="#">{t('layout.contact')}</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} {BRAND_NAME} | {t('layout.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
