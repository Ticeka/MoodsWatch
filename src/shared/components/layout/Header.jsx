
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Bell, BookMarked, ChevronDown, Globe, Home, ListOrdered, LogOut, Menu, Moon, Search, Settings, ShieldAlert, Sparkles, Sun, Swords, User, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { supabase } from '@/shared/lib/supabase';
import './Layout.css';

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

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, message, is_read, created_at, reference_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) setNotifications(data || []);
    }

    load();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        setNotifications((prev) => [payload.new, ...prev].slice(0, 20));
      })
      .subscribe();

    return () => {
      cancelled = true;
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
        title={t('layout.notifications')}
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
  const { t } = useLanguage();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef(null);
  const chipRef = useRef(null);
  const portalRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const menuBtnRef = useRef(null);

  const isActive = (path) => location.pathname === path;
  const isTierListActive = location.pathname.startsWith('/tierlist');
  const userLabel = user?.profile?.name || user?.email?.split('@')[0] || t('layout.userFallback');
  const userRole = user?.profile?.role;
  const canAccessAdmin = userRole === 'admin' || userRole === 'editor';
  const closeMobileMenu = () => setMobileMenuOpen(false);

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

  return (
    <>
      <header className={`header glass ${scrolled ? 'header-scrolled' : ''}`}>
        <div className="container header-content">
          <Link to="/" className="logo" onClick={closeMobileMenu}>
            <span className="logo-icon">
              <Sparkles size={19} />
            </span>
            <span className="logo-wordmark">Mood<span className="logo-accent">Toon</span></span>
          </Link>

          <nav className="desktop-nav" aria-label={t('layout.mainNav')}>
            <Link to="/" className={`nav-link ${isActive('/') ? 'active' : ''}`} onClick={closeMobileMenu}>
              <Home size={16} /><span className="nav-link-label">{t('layout.home')}</span>
            </Link>
            <Link to="/discover" className={`nav-link ${isActive('/discover') ? 'active' : ''}`} onClick={closeMobileMenu}>
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
          </nav>

          <div className="header-actions">
            {!user && (
              <div className="guest-actions-desktop">
                <LanguageToggle />
                <button
                  type="button"
                  className="theme-toggle"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? t('layout.switchToLight') : t('layout.switchToDark')}
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
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
                  aria-label={t('layout.accountMenu')}
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
              aria-label={t('layout.openMenu')}
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
            <span className="logo-wordmark">Mood<span className="logo-accent">Toon</span></span>
          </span>
          <button ref={drawerCloseRef} className="drawer-close" onClick={() => setMobileMenuOpen(false)} aria-label={t('layout.closeMenu')} type="button">
            <X size={18} aria-hidden="true" />
          </button>
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

          <button className="dropdown-item" onClick={toggleTheme} role="menuitem" type="button">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{theme === 'dark' ? t('layout.lightMode') : t('layout.darkMode')}</span>
          </button>

          <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)} role="menuitem">
            <Settings size={16} />
            <span>{t('layout.profile')}</span>
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
            <span className="logo-wordmark">Mood<span className="logo-accent">Toon</span></span>
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
          <p>&copy; {new Date().getFullYear()} MoodToon | {t('layout.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}

