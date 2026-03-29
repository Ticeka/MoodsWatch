import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  BarChart3,
  LayoutTemplate,
  Layers,
  Lightbulb,
  Flag,
  CopyPlus,
  Library,
  Link2,
  Tags,
  Users,
  Sun,
  Moon,
  ArrowLeft,
  ShieldCheck,
  Menu,
  X,
  Download,
  BookOpen,
  CalendarDays,
  ListOrdered,
  Music4,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { t } = useLanguage();
  const userName = user?.email?.split('@')[0] || t('admin.nav.adminPanel');

  const close = () => setSidebarOpen(false);

  return (
    <div className="admin-layout">
      <div
        className={`admin-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={close}
        aria-hidden="true"
      />

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
              <ShieldCheck className="sidebar-logo-icon" size={24} />
              <div>
                <h2>{t('admin.nav.adminPanel')}</h2>
                <span className="sidebar-user">{userName}</span>
              </div>
            </div>
          <button className="sidebar-close-btn" onClick={close} type="button" aria-label={t('admin.nav.closeSidebar')}>
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label={t('admin.nav.sidebarNav')}>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.overview')}</h3>
            <NavLink to="/admin" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <LayoutDashboard className="sidebar-link-icon" size={18} /> {t('admin.nav.dashboard')}
            </NavLink>
            <NavLink to="/admin/analytics" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <BarChart3 className="sidebar-link-icon" size={18} /> {t('admin.nav.analytics')}
            </NavLink>
          </div>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.catalog')}</h3>
            <NavLink to="/admin/titles" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Library className="sidebar-link-icon" size={18} /> {t('admin.nav.titles')}
            </NavLink>
            <NavLink to="/admin/moods" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Tags className="sidebar-link-icon" size={18} /> {t('admin.nav.moodsAndTags')}
            </NavLink>
            <NavLink to="/admin/links" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Link2 className="sidebar-link-icon" size={18} /> {t('admin.nav.platformLinks')}
            </NavLink>
            <NavLink to="/admin/fetch" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Download className="sidebar-link-icon" size={18} /> {t('admin.nav.fetchData')}
            </NavLink>
            <NavLink to="/admin/tierlists" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <ListOrdered className="sidebar-link-icon" size={18} /> {t('layout.tierlist')}
            </NavLink>
            <NavLink to="/admin/party-presets" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Music4 className="sidebar-link-icon" size={18} /> Music Party
            </NavLink>
          </div>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.editorial')}</h3>
            <NavLink to="/admin/homepage" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <LayoutTemplate className="sidebar-link-icon" size={18} /> {t('admin.nav.homepageBlocks')}
            </NavLink>
            <NavLink to="/admin/collections" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Layers className="sidebar-link-icon" size={18} /> {t('admin.nav.collections')}
            </NavLink>
            <NavLink to="/admin/recommendations" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Lightbulb className="sidebar-link-icon" size={18} /> {t('admin.nav.recommendations')}
            </NavLink>
          </div>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.moderation')}</h3>
            <NavLink to="/admin/reports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Flag className="sidebar-link-icon" size={18} /> {t('admin.nav.reports')}
            </NavLink>
            <NavLink to="/admin/duplicates" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <CopyPlus className="sidebar-link-icon" size={18} /> {t('admin.nav.duplicates')}
            </NavLink>
          </div>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.users')}</h3>
            <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <Users className="sidebar-link-icon" size={18} /> {t('admin.nav.userDirectory')}
            </NavLink>
            <NavLink to="/admin/daily" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <CalendarDays className="sidebar-link-icon" size={18} /> {t('admin.nav.dailyChallenge')}
            </NavLink>
          </div>

          <div className="nav-group">
            <h3 className="nav-group-title">{t('admin.nav.help')}</h3>
            <NavLink to="/admin/guide" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={close}>
              <BookOpen className="sidebar-link-icon" size={18} /> {t('admin.nav.guide')}
            </NavLink>
          </div>

        </nav>

        <div className="sidebar-footer">
          <button onClick={toggleTheme} className="sidebar-link sidebar-theme-btn" type="button">
            {theme === 'dark'
              ? <Sun className="sidebar-link-icon" size={18} />
              : <Moon className="sidebar-link-icon" size={18} />
            }
            {theme === 'dark' ? t('admin.nav.lightMode') : t('admin.nav.darkMode')}
          </button>
          <Link to="/" className="sidebar-link sidebar-back-btn" onClick={close}>
            <ArrowLeft className="sidebar-link-icon" size={18} /> {t('admin.nav.backToSite')}
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
          <button
            className="admin-menu-btn"
            onClick={() => setSidebarOpen(true)}
            type="button"
            aria-label={t('admin.nav.openSidebar')}
          >
            <Menu size={20} />
          </button>
          <span className="admin-topbar-title">{t('admin.nav.adminPanel')}</span>
          <Link to="/" className="admin-topbar-back" aria-label={t('admin.nav.backToSite')}>
            <ArrowLeft size={20} />
          </Link>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
