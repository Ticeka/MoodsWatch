import React, { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import toast from 'react-hot-toast';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

export function AdminUsers() {
  const { t, isThai } = useLanguage();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    if (!supabase) {
      toast.error('ยังไม่สามารถเชื่อมต่อฐานข้อมูลได้');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.warn('Error fetching users:', err);
      toast.error('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRoleChange(userId, userName, newRole) {
    if (!supabase) {
      toast.error('ยังไม่สามารถเชื่อมต่อฐานข้อมูลได้');
      return;
    }

    const isConfirmed = window.confirm(t('admin.users.confirmRoleChange', { name: userName, role: newRole }));
    if (!isConfirmed) return;

    const toastId = toast.loading('กำลังอัปเดตสิทธิ์...');
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast.success(t('admin.users.roleChanged', { role: newRole }), { id: toastId });
      fetchUsers();
    } catch (err) {
      console.error('Role change error:', err);
      toast.error(`เกิดข้อผิดพลาด: ${err.message}`, { id: toastId });
    }
  }

  const filteredUsers = users.filter((u) =>
    (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      >
        <div style={{ flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder={t('admin.users.searchPlaceholder')}
            className="form-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="admin-table-container">
        {isLoading ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center' }}>{t('admin.users.loading')}</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: 'var(--space-10)', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('admin.users.noUsers')}</div>
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
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-default)' }} />
                      ) : (
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-700)', fontWeight: 800, fontSize: '0.9rem' }}>
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name || t('admin.users.anonymous')}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{u.email || t('admin.users.noEmail')}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                      {u.id.substring(0, 8)}...
                    </code>
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-admin' : u.role === 'editor' ? 'badge-editor' : 'badge-user'}`}>
                      {u.role || 'user'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString(isThai ? 'th-TH' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <select
                      className="form-select"
                      value={u.role || 'user'}
                      onChange={(e) => handleRoleChange(u.id, u.name, e.target.value)}
                      style={{ minWidth: '130px', fontSize: '0.85rem' }}
                    >
                      <option value="user">user</option>
                      <option value="editor">editor</option>
                      <option value="admin">admin</option>
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
