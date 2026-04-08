import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Library,
  ListTodo,
  Layers,
  Flag,
  CopyPlus,
  CheckCircle,
  Trophy,
  Loader2,
  TrendingUp,
  Search,
  Swords,
  ListOrdered,
  Music4,
  Bell,
  ShieldAlert,
  BarChart3,
  ArrowUpRight,
  Activity,
  Zap,
  Clock,
  LayoutTemplate,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { clearTitlesCache, getCacheInfo } from '@/features/discover/lib/recommend';
import { supabase } from '@/shared/lib/supabase';
import { fetchAdminDashboardData } from '@/features/admin/api';
import '../styles/Admin.css';

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, hint, to, loading }) {
  const inner = (
    <div className="exec-kpi-card" style={{ '--kpi-accent': color }}>
      <div className="exec-kpi-top">
        <span className="exec-kpi-label">{label}</span>
        <span className="exec-kpi-icon">
          <Icon size={16} />
        </span>
      </div>
      <div className="exec-kpi-value">
        {loading ? <span className="exec-kpi-skeleton" /> : value}
      </div>
      {hint && <div className="exec-kpi-hint">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

function RiskCard({ icon: Icon, label, value, hint, to, tone }) {
  const inner = (
    <div className={`exec-risk-card exec-risk-card--${tone}`}>
      <div className="exec-risk-icon"><Icon size={18} /></div>
      <div className="exec-risk-body">
        <strong className="exec-risk-value">{value}</strong>
        <span className="exec-risk-label">{label}</span>
        {hint && <span className="exec-risk-hint">{hint}</span>}
      </div>
      <ArrowUpRight size={14} className="exec-risk-arrow" />
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

function FeatureNavCard({ icon: Icon, label, description, to, accent }) {
  return (
    <Link to={to} className="exec-feature-card" style={{ '--feat-accent': accent }}>
      <div className="exec-feature-icon"><Icon size={20} /></div>
      <div className="exec-feature-body">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <ArrowUpRight size={14} className="exec-feature-arrow" />
    </Link>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="exec-section-head">
      <div>
        <h2 className="exec-section-title">
          {Icon && <Icon size={18} />}
          {title}
        </h2>
        {subtitle && <p className="exec-section-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export function AdminDashboard() {
  const { user } = useAuth();
  const { isThai } = useLanguage();
  const userName = user?.email?.split('@')[0] || 'Admin';
  const locale = isThai ? 'th-TH' : 'en-US';
  const [cacheInfo, setCacheInfo] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: fetchAdminDashboardData,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const stats = dashboardQuery.data?.stats || {
    totalUsers: 0,
    totalTitles: 0,
    totalLists: 0,
    totalCollections: 0,
    totalHomepageBlocks: 0,
    openReports: 0,
    pendingDuplicates: 0,
  };
  const recentUsers = dashboardQuery.data?.recentUsers || [];
  const lastRefresh = dashboardQuery.data?.fetchedAt ? new Date(dashboardQuery.data.fetchedAt) : null;
  const isRefreshing = dashboardQuery.isFetching && !dashboardQuery.isLoading;

  useEffect(() => {
    setCacheInfo(getCacheInfo());
  }, [dashboardQuery.dataUpdatedAt]);

  useEffect(() => {
    if (dashboardQuery.error) {
      console.error('Error loading dashboard stats:', dashboardQuery.error);
      toast.error('Failed to load dashboard stats');
    }
  }, [dashboardQuery.error]);

  const handleBackfillAchievements = async () => {
    if (!supabase) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc('backfill_achievements');
      if (error) throw error;
      toast.success(`Backfill complete — ${data} total achievements in DB`);
      await dashboardQuery.refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBackfilling(false);
    }
  };

  const handleClearCache = () => {
    clearTitlesCache();
    setCacheInfo(getCacheInfo());
    toast.success('Cache cleared');
  };

  const handleRefresh = async () => {
    const result = await dashboardQuery.refetch();
    if (result.error) {
      toast.error('Failed to refresh dashboard');
      return;
    }
    toast.success('Dashboard refreshed');
  };

  const hasRiskItems = stats.openReports > 0 || stats.pendingDuplicates > 0;
  const cacheHealthy = cacheInfo?.source === 'supabase';

  const kpiCards = [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: '#6366f1', hint: 'All registered profiles' },
    { label: 'Catalog Titles', value: stats.totalTitles.toLocaleString(), icon: Library, color: '#10b981', hint: 'Canonical titles in DB', to: '/admin/titles' },
    { label: 'User Lists', value: stats.totalLists.toLocaleString(), icon: ListTodo, color: '#f59e0b', hint: 'Watchlist/reading entries' },
    { label: 'Collections', value: stats.totalCollections.toLocaleString(), icon: Layers, color: '#8b5cf6', hint: 'Editorial collections', to: '/admin/collections' },
    { label: 'Homepage Blocks', value: stats.totalHomepageBlocks.toLocaleString(), icon: LayoutTemplate, color: '#ec4899', hint: 'Active content blocks', to: '/admin/homepage' },
    {
      label: 'Open Reports',
      value: dashboardQuery.isLoading ? null : stats.openReports > 0 ? stats.openReports.toLocaleString() : 'Clear ✓',
      icon: Flag,
      color: stats.openReports > 0 ? '#ef4444' : '#10b981',
      hint: stats.openReports > 0 ? 'Need triage or review' : 'No open reports',
      to: '/admin/reports',
    },
  ];

  const featureNav = [
    { icon: Search, label: 'Search & Discovery', description: 'Query analytics, zero-result rate, CTR', to: '/admin/analytics', accent: '#6366f1' },
    { icon: Swords, label: 'Battle', description: 'Deck performance, session funnel', to: '/admin/analytics', accent: '#f59e0b' },
    { icon: ListOrdered, label: 'Tierlist', description: 'Template popularity, publish rate', to: '/admin/tierlists', accent: '#10b981' },
    { icon: Music4, label: 'Party / Multiplayer', description: 'Room health, preset performance', to: '/admin/party-presets', accent: '#ec4899' },
    { icon: Bell, label: 'Notifications', description: 'Unread pressure, re-engagement', to: '/admin/analytics', accent: '#f97316' },
    { icon: Users, label: 'User Directory', description: 'Roles, recent signups, lifecycle', to: '/admin/users', accent: '#8b5cf6' },
  ];

  if (dashboardQuery.error && !dashboardQuery.data) {
    return (
      <div className="admin-page-content" style={{ padding: 'var(--space-10)' }}>
        <AdminStatePanel
          title="Failed to load dashboard"
          description={dashboardQuery.error.message || 'Something went wrong'}
          actionLabel="Retry"
          onAction={handleRefresh}
          tone="error"
        />
      </div>
    );
  }

  return (
    <div className="admin-page-content animate-fade-in">

      {/* ─── Page Header ─── */}
      <div className="exec-dashboard-header">
        <div className="exec-dashboard-header-left">
          <div className="exec-greeting-badge">
            <Activity size={14} />
            Executive Overview
          </div>
          <h1 className="exec-greeting-title">
            Welcome back, <span className="exec-greeting-name">{userName}</span>
          </h1>
          <p className="exec-greeting-sub">
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
              : 'Platform health at a glance'}
            {isRefreshing ? ' · Refreshing in background' : ''}
          </p>
        </div>
        <div className="exec-dashboard-header-actions">
          <button
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleRefresh}
            disabled={dashboardQuery.isFetching}
            type="button"
          >
            <RefreshCw size={14} className={dashboardQuery.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            className="action-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={handleBackfillAchievements}
            disabled={backfilling}
            type="button"
          >
            {backfilling ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
            Backfill Achievements
          </button>
        </div>
      </div>

      {/* ─── Risk Signals (only when actionable) ─── */}
      {(hasRiskItems || cacheInfo) && (
        <div className="exec-risk-section">
          {stats.openReports > 0 && (
            <RiskCard
              icon={Flag}
              label="Open Reports"
              value={stats.openReports}
              hint="Need triage or review"
              to="/admin/reports"
              tone="warning"
            />
          )}
          {stats.pendingDuplicates > 0 && (
            <RiskCard
              icon={CopyPlus}
              label="Duplicate Candidates"
              value={stats.pendingDuplicates}
              hint="Awaiting merge decision"
              to="/admin/duplicates"
              tone="info"
            />
          )}
          {cacheInfo && (
            <div className={`exec-cache-pill ${cacheHealthy ? 'exec-cache-pill--ok' : 'exec-cache-pill--warn'}`}>
              {cacheHealthy ? <CheckCircle size={13} /> : <ShieldAlert size={13} />}
              <span>
                {cacheHealthy
                  ? `Rec cache: ${cacheInfo.count} titles (${cacheInfo.age !== null ? `${Math.round(cacheInfo.age / 1000)}s ago` : 'fresh'})`
                  : 'Recommendation cache empty'}
              </span>
              <button onClick={handleClearCache} className="exec-cache-clear" type="button">
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── KPI Cards ─── */}
      <section className="exec-section">
        <SectionHeader
          icon={TrendingUp}
          title="Platform Metrics"
          subtitle="Core counts — drill into Analytics for trends & breakdowns"
        />
        <div className="exec-kpi-grid">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} loading={dashboardQuery.isLoading} />
          ))}
        </div>
      </section>

      {/* ─── Two-column: Recent Users + Feature Nav ─── */}
      <div className="exec-two-col">

        {/* Recent Users */}
        <section className="exec-section">
          <SectionHeader
            icon={Users}
            title="Recent Signups"
            subtitle="Latest registered profiles"
            action={<Link to="/admin/users" className="admin-section-link">View all</Link>}
          />
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th style={{ textAlign: 'right' }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {dashboardQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`recent-user-skeleton-${i}`}>
                      <td><span className="exec-table-skeleton" style={{ width: '60%' }} /></td>
                      <td><span className="exec-table-skeleton" style={{ width: '40%' }} /></td>
                      <td><span className="exec-table-skeleton" style={{ width: '30%', marginLeft: 'auto' }} /></td>
                    </tr>
                  ))
                ) : recentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-8)' }}>
                      No users yet
                    </td>
                  </tr>
                ) : (
                  recentUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {u.name || <span style={{ color: 'var(--text-tertiary)' }}>Anonymous</span>}
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'badge-admin' : u.role === 'editor' ? 'badge-editor' : 'badge-user'}`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Feature Navigation */}
        <section className="exec-section">
          <SectionHeader
            icon={Zap}
            title="Product Areas"
            subtitle="Quick access to each feature domain"
          />
          <div className="exec-feature-grid">
            {featureNav.map((f) => (
              <FeatureNavCard key={f.label} {...f} />
            ))}
          </div>
        </section>

      </div>

      {/* ─── Ops Quick Links ─── */}
      <section className="exec-section">
        <SectionHeader
          icon={Clock}
          title="Operations & Moderation"
          subtitle="Tools that need regular attention"
        />
        <div className="exec-ops-grid">
          <Link to="/admin/reports" className="exec-ops-link">
            <Flag size={16} />
            <div>
              <strong>Content Reports</strong>
              <span>{dashboardQuery.isLoading ? '—' : stats.openReports > 0 ? `${stats.openReports} open` : 'All clear'}</span>
            </div>
          </Link>
          <Link to="/admin/duplicates" className="exec-ops-link">
            <CopyPlus size={16} />
            <div>
              <strong>Duplicate Candidates</strong>
              <span>{dashboardQuery.isLoading ? '—' : stats.pendingDuplicates > 0 ? `${stats.pendingDuplicates} pending` : 'Queue empty'}</span>
            </div>
          </Link>
          <Link to="/admin/fetch" className="exec-ops-link">
            <Library size={16} />
            <div>
              <strong>Fetch External Data</strong>
              <span>Import from AniList / MAL</span>
            </div>
          </Link>
          <Link to="/admin/daily" className="exec-ops-link">
            <Trophy size={16} />
            <div>
              <strong>Daily Challenge</strong>
              <span>Manage battle challenges</span>
            </div>
          </Link>
          <Link to="/admin/recommendations" className="exec-ops-link">
            <BarChart3 size={16} />
            <div>
              <strong>Recommendation Preview</strong>
              <span>Test rec engine output</span>
            </div>
          </Link>
          <Link to="/admin/guide" className="exec-ops-link">
            <ShieldAlert size={16} />
            <div>
              <strong>Admin Guide</strong>
              <span>Runbooks and workflows</span>
            </div>
          </Link>
        </div>
      </section>

    </div>
  );
}

export default AdminDashboard;
