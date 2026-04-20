import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { fetchFollowList } from '@/features/social/api/socialApi';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/FollowListModal.css';

export function FollowListModal({ profileUserId, kind, onClose }) {
  const { language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profileUserId) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetchFollowList(profileUserId, kind)
      .then((rows) => { if (!cancelled) setUsers(rows); })
      .catch(() => { if (!cancelled) setError(language === 'th' ? 'โหลดไม่สำเร็จ' : 'Failed to load'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [profileUserId, kind, language]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = kind === 'following'
    ? (language === 'th' ? 'กำลังติดตาม' : 'Following')
    : (language === 'th' ? 'ผู้ติดตาม' : 'Followers');

  return (
    <div className="follow-list-backdrop" onClick={onClose}>
      <div className="follow-list-card" onClick={(event) => event.stopPropagation()}>
        <header className="follow-list-header">
          <h2>{title}</h2>
          <button type="button" className="follow-list-close" onClick={onClose} aria-label="close">
            <X size={18} />
          </button>
        </header>

        {isLoading ? (
          <div className="follow-list-state">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="follow-list-state"><p>{error}</p></div>
        ) : users.length === 0 ? (
          <div className="follow-list-state">
            <p>{kind === 'following'
              ? (language === 'th' ? 'ยังไม่ได้ติดตามใคร' : 'Not following anyone yet')
              : (language === 'th' ? 'ยังไม่มีผู้ติดตาม' : 'No followers yet')}</p>
          </div>
        ) : (
          <ul className="follow-list-list">
            {users.map((user) => {
              const name = user.name || user.username || '—';
              const initial = name.charAt(0).toUpperCase();
              const linkTo = user.username && user.is_profile_public !== false ? `/u/${user.username}` : null;
              const inner = (
                <>
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt="" className="follow-list-avatar" />
                    : <div className="follow-list-avatar follow-list-avatar-fallback">{initial}</div>}
                  <div className="follow-list-copy">
                    <strong>{name}</strong>
                    {user.username && <span>@{user.username}</span>}
                  </div>
                </>
              );
              return (
                <li key={user.id} className="follow-list-item">
                  {linkTo
                    ? <Link to={linkTo} className="follow-list-row" onClick={onClose}>{inner}</Link>
                    : <div className="follow-list-row follow-list-row-static">{inner}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default FollowListModal;
