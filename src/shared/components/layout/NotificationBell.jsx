import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import { scheduleWhenIdle } from '@/shared/components/layout/headerUtils';

export function NotificationBell({ userId }) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const loadRef = useRef(null);

  useEffect(() => {
    if (!userId || !supabase) return;

    let cancelled = false;
    let cancelIdleWork = null;
    let pollInterval = null;

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, message, is_read, created_at, reference_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) setNotifications(data || []);
      return data || [];
    }

    loadRef.current = load;

    function startPolling() {
      if (pollInterval) return;
      const jitter = Math.floor(Math.random() * 5000);
      pollInterval = window.setInterval(() => {
        if (document.visibilityState !== 'hidden') void load();
      }, 30000 + jitter);
    }

    function stopPolling() {
      if (pollInterval) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        void load();
        startPolling();
      }
    }

    cancelIdleWork = scheduleWhenIdle(() => {
      if (document.visibilityState !== 'hidden') {
        void load();
        startPolling();
      }
    }, 2000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      loadRef.current = null;
      cancelIdleWork?.();
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event) => {
      if (
        bellRef.current && !bellRef.current.contains(event.target) &&
        panelRef.current && !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAllRead = async (freshData) => {
    if (!supabase || !userId) return;
    const source = freshData || notifications;
    const unreadIds = source.filter((notification) => !notification.is_read).map((notification) => notification.id);
    if (unreadIds.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications((prev) => prev.map((notification) => ({ ...notification, is_read: true })));
  };

  const handleOpen = async () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }

    setOpen((current) => !current);
    if (!open) {
      const freshData = await loadRef.current?.();
      void markAllRead(freshData);
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

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
              {notifications.map((notification) => {
                let href = null;
                if (notification.reference_id) {
                  if (notification.type === 'profile_comment' || (notification.type === 'comment_reply' && !String(notification.reference_id).startsWith('tierlist-'))) {
                    href = `/u/${notification.reference_id}`;
                  } else {
                    href = `/tierlist/play/${notification.reference_id}`;
                  }
                }
                return (
                  <li key={notification.id} className={`notif-item${notification.is_read ? '' : ' is-unread'}`}>
                    {href ? (
                      <Link to={href} className="notif-link" onClick={() => setOpen(false)}>
                        {notification.message}
                      </Link>
                    ) : (
                      <span>{notification.message}</span>
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
