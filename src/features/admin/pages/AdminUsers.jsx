import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import '../styles/Admin.css';

export function AdminUsers() {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const roleLabelMap = {
    user: t('admin.users.roleUser'),
    editor: t('admin.users.roleEditor'),
    admin: t('admin.users.roleAdmin'),
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    if (!supabase) {
      const message = t('admin.users.supabaseUnavailable');
      setErrorMessage(message);
      toast.error(message);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.warn('Error fetching users:', err);
      const message = err?.message
        ? t('admin.users.loadFailedWithReason', { error: err.message })
        : t('admin.users.loadFailed');
      setErrorMessage(message);
      toast.error(t('admin.users.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRoleChange(userId, userName, newRole) {
    if (!supabase) {
      toast.error(t('admin.users.supabaseUnavailable'));
      return;
    }

    const roleLabel = roleLabelMap[newRole] || newRole;
    const isConfirmed = window.confirm(t('admin.users.confirmRoleChange', { name: userName, role: roleLabel }));
    if (!isConfirmed) return;

    const toastId = toast.loading(t('admin.users.updatingRole'));
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast.success(t('admin.users.roleChanged', { role: roleLabel }), { id: toastId });
      fetchUsers();
    } catch (err) {
      console.error('Role change error:', err);
      toast.error(
        t('admin.users.roleChangeFailedWithReason', { error: err?.message || t('common.retry') }),
        { id: toastId }
      );
    }
  }

  const visibleUsers = useMemo(() => {
    const loweredSearchTerm = searchTerm.trim().toLowerCase();
    const filtered = users.filter((entry) => {
      const matchesSearch = !loweredSearchTerm || (
        (entry.name || '').toLowerCase().includes(loweredSearchTerm) ||
        (entry.id || '').toLowerCase().includes(loweredSearchTerm) ||
        (entry.email || '').toLowerCase().includes(loweredSearchTerm)
      );
      const matchesRole = roleFilter === 'all' || (entry.role || 'user') === roleFilter;
      return matchesSearch && matchesRole;
    });

    if (sortBy === 'oldest') {
      return [...filtered].sort((left, right) => (
        new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()
      ));
    }

    if (sortBy === 'name') {
      return [...filtered].sort((left, right) => (
        String(left.name || '').localeCompare(String(right.name || ''), language === 'th' ? 'th' : 'en')
      ));
    }

    return [...filtered].sort((left, right) => (
      new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
    ));
  }, [users, searchTerm, roleFilter, sortBy, language]);

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>{t('admin.users.pageTitle')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('admin.users.pageSubtitle', { count: users.length })}
          </p>
        </div>
        <button className="action-btn" onClick={fetchUsers} type="button">{t('admin.common.refresh')}</button>
      </div>

      <div
        className="admin-controls glass"
        style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}
        role="toolbar"
        aria-label={t('admin.users.filtersToolbar')}
      >
        <div style={{ flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder={t('admin.users.searchPlaceholder')}
            className="form-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <SortSelect value={roleFilter} onChange={setRoleFilter} label={t('admin.users.filterRole')} className="results-sorter">
          <option value="all">{t('admin.users.allRoles')}</option>
          <option value="user">{t('admin.users.roleUser')}</option>
          <option value="editor">{t('admin.users.roleEditor')}</option>
          <option value="admin">{t('admin.users.roleAdmin')}</option>
        </SortSelect>
        <SortSelect value={sortBy} onChange={setSortBy} label={t('admin.users.sortBy')} className="results-sorter">
          <option value="newest">{t('admin.users.sortNewest')}</option>
          <option value="oldest">{t('admin.users.sortOldest')}</option>
          <option value="name">{t('admin.users.sortName')}</option>
        </SortSelect>
      </div>

      <div className="admin-table-container">
        {isLoading ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>{t('admin.users.loading')}</div>
        ) : errorMessage ? (
          <ErrorState message={errorMessage} onRetry={fetchUsers} className="admin-users-error-state" />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            className="empty-state"
            title={t('admin.users.noUsers')}
            message={t('admin.users.noUsersHint')}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.users.colUser')}</th>
                <th>{t('admin.users.colUserId')}</th>
                <th>{t('admin.users.colRole')}</th>
                <th>{t('admin.users.colJoined')}</th>
                <th style={{ textAlign: 'right' }}>{t('admin.users.colChangeRole')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-default)' }} />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-700)', fontWeight: 800, fontSize: '0.9rem' }}>
                          {(entry.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.name || t('admin.users.anonymous')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{entry.email || t('admin.users.noEmail')}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                      {entry.id.substring(0, 8)}...
                    </code>
                  </td>
                  <td>
                    <span className={`badge ${entry.role === 'admin' ? 'badge-admin' : entry.role === 'editor' ? 'badge-editor' : 'badge-user'}`}>
                      {roleLabelMap[entry.role || 'user'] || roleLabelMap.user}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {entry.created_at ? new Date(entry.created_at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <select
                      className="form-select"
                      value={entry.role || 'user'}
                      onChange={(event) => handleRoleChange(entry.id, entry.name, event.target.value)}
                      style={{ minWidth: '130px', fontSize: '0.85rem' }}
                      aria-label={t('admin.users.colChangeRole')}
                    >
                      <option value="user">{t('admin.users.roleUser')}</option>
                      <option value="editor">{t('admin.users.roleEditor')}</option>
                      <option value="admin">{t('admin.users.roleAdmin')}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminUsers;
