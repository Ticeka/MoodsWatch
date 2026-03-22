import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Users,
  Library,
  ListTodo,
  Tags,
  Layers,
  LayoutTemplate,
  Flag,
  CopyPlus,
  ShieldAlert,
  CheckCircle,
  Trophy,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { clearTitlesCache, getCacheInfo } from '@/features/discover/lib/recommend';
import { supabase } from '@/shared/lib/supabase';
import '../styles/Admin.css';

export function AdminDashboard() {
  const { user } = useAuth();
  const { t, isThai } = useLanguage();
  const userName = user?.email?.split('@')[0] || 'Admin';

  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTitles: 0,
    totalLists: 0,
    totalMoods: 0,
    totalCollections: 0,
    totalHomepageBlocks: 0,
    openReports: 0,
    pendingDuplicates: 0,
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    async function loadStats() {
      if (!supabase) {
        toast.error('Unable to connect to Supabase');
        setIsLoading(false);
        return;
      }

      try {
        const [
          usersCount,
          titlesCount,
          listsCount,
          moodsCount,
          collectionsCount,
          homepageBlocksCount,
          openReportsCount,
          pendingDuplicatesCount,
          recentUsersData,
        ] = await Promise.all([
          supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
          supabase.from('canonical_titles').select('*', { count: 'exact', head: true }),
          supabase.from('user_lists').select('*', { count: 'exact', head: true }),
          supabase.from('title_moods').select('*', { count: 'exact', head: true }),
          supabase.from('editor_collections').select('*', { count: 'exact', head: true }),
          supabase.from('homepage_content_blocks').select('*', { count: 'exact', head: true }),
          supabase.from('content_reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
          supabase.from('duplicate_candidates').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('user_profiles').select('id, name, role, created_at').order('created_at', { ascending: false }).limit(6),
        ]);

        setStats({
          totalUsers: usersCount.count || 0,
          totalTitles: titlesCount.count || 0,
          totalLists: listsCount.count || 0,
          totalMoods: moodsCount.count || 0,
          totalCollections: collectionsCount.count || 0,
          totalHomepageBlocks: homepageBlocksCount.count || 0,
          openReports: openReportsCount.count || 0,
          pendingDuplicates: pendingDuplicatesCount.count || 0,
        });
        setRecentUsers(recentUsersData.data || []);
        setCacheInfo(getCacheInfo());
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
        toast.error('Failed to load dashboard stats');
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, []);

  const handleBackfillAchievements = async () => {
    if (!supabase) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc('backfill_achievements');
      if (error) throw error;
      toast.success(`Backfill complete — ${data} total achievements in DB`);
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

  const hasAttentionItems = stats.openReports > 0 || stats.pendingDuplicates > 0;
  const cacheHealthy = cacheInfo?.source === 'supabase';

  return (
    <div className="admin-page-content animate-fade-in">

      {/* Page Header */}
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '1.6rem', marginBottom: 'var(--space-1)' }}>
            Welcome back, {userName}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            {t('admin.dashboard.subtitle')}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-secondary)' }}>
          {t('admin.dashboard.loading')}
        </div>
      ) : (
        <>
          {/* Attention Section — only visible when there's something to act on */}
          {hasAttentionItems && (
            <div className="admin-alert-row">
              {stats.openReports > 0 && (
                <Link to="/admin/reports" className="admin-alert-card admin-alert-card--warning">
                  <Flag size={20} />
                  <div>
                    <strong>{t('admin.dashboard.openReports', { count: stats.openReports })}</strong>
                    <span>{t('admin.dashboard.openReportsHint')}</span>
                  </div>
                  <span className="admin-alert-arrow">→</span>
                </Link>
              )}
              {stats.pendingDuplicates > 0 && (
                <Link to="/admin/duplicates" className="admin-alert-card admin-alert-card--info">
                  <CopyPlus size={20} />
                  <div>
                    <strong>{t('admin.dashboard.duplicateCandidates', { count: stats.pendingDuplicates })}</strong>
                    <span>{t('admin.dashboard.duplicatesHint')}</span>
                  </div>
                  <span className="admin-alert-arrow">→</span>
                </Link>
              )}
            </div>
          )}

          {/* Cache Status Bar */}
          {cacheInfo && (
            <div className={`admin-cache-bar ${cacheHealthy ? 'admin-cache-bar--ok' : 'admin-cache-bar--empty'}`}>
              {cacheHealthy
                ? <CheckCircle size={14} />
                : <ShieldAlert size={14} />
              }
              <span>
                {cacheHealthy
                  ? t('admin.dashboard.cacheOk', { count: cacheInfo.count, age: cacheInfo.age !== null ? t('admin.dashboard.cacheAgo', { seconds: Math.round(cacheInfo.age / 1000) }) : '' })
                  : t('admin.dashboard.cacheEmpty')
                }
              </span>
              <button onClick={handleClearCache} className="admin-cache-clear" type="button">{t('admin.dashboard.clearCache')}</button>
            </div>
          )}

          {/* Maintenance Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <button
              className="admin-cache-clear"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleBackfillAchievements}
              disabled={backfilling}
              type="button"
            >
              {backfilling ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
              Backfill Achievements
            </button>
          </div>

          {/* Primary Stats */}
          <div className="admin-stat-row">
            <div className="stat-card">
              <div className="stat-card-header">
                <h3 className="stat-title">{t('admin.dashboard.statUsers')}</h3>
                <Users size={18} color="var(--primary-400)" />
              </div>
              <p className="stat-value" style={{ color: 'var(--primary-600)' }}>{stats.totalUsers.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <h3 className="stat-title">{t('admin.dashboard.statTitles')}</h3>
                <Library size={18} color="var(--success)" />
              </div>
              <p className="stat-value" style={{ color: 'var(--success)' }}>{stats.totalTitles.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <h3 className="stat-title">{t('admin.dashboard.statCollections')}</h3>
                <Layers size={18} color="var(--primary-400)" />
              </div>
              <p className="stat-value" style={{ color: 'var(--primary-600)' }}>{stats.totalCollections.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <div className="stat-card-header">
                <h3 className="stat-title">{t('admin.dashboard.statHomepageBlocks')}</h3>
                <LayoutTemplate size={18} color="var(--success)" />
              </div>
              <p className="stat-value" style={{ color: 'var(--success)' }}>{stats.totalHomepageBlocks.toLocaleString()}</p>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="admin-mini-stats">
            <div className="admin-mini-stat">
              <Tags size={14} color="var(--text-tertiary)" />
              <span className="admin-mini-stat-label">{t('admin.dashboard.statMoodTags')}</span>
              <strong className="admin-mini-stat-value">{stats.totalMoods}</strong>
            </div>
            <div className="admin-mini-stat-divider" />
            <div className="admin-mini-stat">
              <ListTodo size={14} color="var(--text-tertiary)" />
              <span className="admin-mini-stat-label">{t('admin.dashboard.statUserLists')}</span>
              <strong className="admin-mini-stat-value">{stats.totalLists.toLocaleString()}</strong>
            </div>
          </div>

          {/* Recent Users */}
          <div>
            <div className="admin-section-header">
              <h2 className="admin-section-title-lg">
                <Users size={18} color="var(--primary-500)" />
                {t('admin.dashboard.recentUsers')}
              </h2>
              <Link to="/admin/users" className="admin-section-link">{t('admin.common.viewAll')}</Link>
            </div>
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('admin.dashboard.colName')}</th>
                    <th>{t('admin.dashboard.colRole')}</th>
                    <th style={{ textAlign: 'right' }}>{t('admin.dashboard.colJoined')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-8)' }}>
                        {t('admin.dashboard.noRecentUsers')}
                      </td>
                    </tr>
                  ) : (
                    recentUsers.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name || t('admin.dashboard.anonymousUser')}</td>
                        <td>
                          <span className={`badge ${u.role === 'admin' ? 'badge-admin' : u.role === 'editor' ? 'badge-editor' : 'badge-user'}`}>
                            {u.role || 'user'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString(isThai ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminDashboard;
