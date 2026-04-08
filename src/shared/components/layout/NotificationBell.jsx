import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import { scheduleWhenIdle } from '@/shared/components/layout/headerUtils';

const NOTIFICATION_SELECT = 'id, type, message, is_read, created_at, reference_id';
const NOTIFICATION_LIMIT = 20;
const POLL_INTERVAL_MS = 30000;
const REALTIME_RESYNC_MS = 120000;

function normalizeNotificationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    type: row.type,
    message: row.message,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
    reference_id: row.reference_id ?? null,
  };
}

function sortNotificationsByNewest(left, right) {
  return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
}

function mergeNotificationRows(currentRows = [], nextRows = []) {
  const merged = new Map();

  [...currentRows, ...nextRows].forEach((row) => {
    const normalized = normalizeNotificationRow(row);
    if (!normalized?.id) {
      return;
    }

    merged.set(normalized.id, {
      ...(merged.get(normalized.id) || {}),
      ...normalized,
    });
  });

  return [...merged.values()]
    .sort(sortNotificationsByNewest)
    .slice(0, NOTIFICATION_LIMIT);
}

export function NotificationBell({ userId }) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const loadRef = useRef(null);
  const backoffRef = useRef(0);
  const realtimeStatusRef = useRef('CLOSED');

  useEffect(() => {
    if (!userId || !supabase) return;

    let cancelled = false;
    let cancelIdleWork = null;
    let pollInterval = null;
    let realtimeChannel = null;

    async function load() {
      if (!navigator.onLine) {
        return [];
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT);

      if (error) {
        backoffRef.current = Math.min(backoffRef.current + 1, 3);
        return [];
      }

      backoffRef.current = 0;
      const normalizedData = (data || []).map(normalizeNotificationRow).filter(Boolean);
      if (!cancelled) setNotifications(normalizedData);
      return normalizedData;
    }

    loadRef.current = load;

    function startPolling() {
      if (pollInterval) return;
      const jitter = Math.floor(Math.random() * 4000);
      pollInterval = window.setInterval(() => {
        if (document.visibilityState === 'hidden' || !navigator.onLine) return;
        void load();
      }, (realtimeStatusRef.current === 'SUBSCRIBED' ? REALTIME_RESYNC_MS : POLL_INTERVAL_MS) + jitter + (backoffRef.current * 15000));
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

    function handleOnline() {
      setIsOnline(true);
      void load();
      startPolling();
    }

    function handleOffline() {
      setIsOnline(false);
      stopPolling();
    }

    function applyRealtimeRow(payload) {
      const eventType = String(payload?.eventType || '').toUpperCase();
      const nextRow = normalizeNotificationRow(payload?.new || null);
      const oldRow = normalizeNotificationRow(payload?.old || null);

      if (eventType === 'DELETE' && oldRow?.id) {
        setNotifications((current) => current.filter((entry) => entry.id !== oldRow.id));
        return;
      }

      if (nextRow) {
        setNotifications((current) => mergeNotificationRows(current, [nextRow]));
      }
    }

    realtimeChannel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        applyRealtimeRow(payload);
      });

    realtimeChannel.subscribe((status) => {
      realtimeStatusRef.current = status;
      if (status === 'SUBSCRIBED' && document.visibilityState !== 'hidden' && navigator.onLine) {
        stopPolling();
        startPolling();
      }
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && document.visibilityState !== 'hidden' && navigator.onLine) {
        startPolling();
      }
    });

    cancelIdleWork = scheduleWhenIdle(() => {
      if (document.visibilityState !== 'hidden' && navigator.onLine) {
        void load();
        startPolling();
      }
    }, 2000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      cancelled = true;
      loadRef.current = null;
      cancelIdleWork?.();
      stopPolling();
      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
    if (!navigator.onLine) return;
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
          {!isOnline ? (
            <p className="notif-empty">{t('layout.notificationsEmpty')}</p>
          ) : notifications.length === 0 ? (
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
