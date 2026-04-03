import React, { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import {
  approvePartyRoomJoin,
  fetchPartyRoomJoinRequests,
  rejectPartyRoomJoin,
  subscribeToPartyRoomJoinRequests,
} from '@/features/party/lib/partyRemote';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';

function timeAgo(isoString, pick) {
  const diffSec = Math.floor((Date.now() - new Date(isoString || 0).getTime()) / 1000);
  if (diffSec < 60) {
    return pick('เมื่อครู่', 'just now');
  }
  if (diffSec < 3600) {
    return pick(`${Math.floor(diffSec / 60)} นาทีที่แล้ว`, `${Math.floor(diffSec / 60)}m ago`);
  }
  return pick(`${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`, `${Math.floor(diffSec / 3600)}h ago`);
}

function JoinRequestCard({ request, onApprove, onReject, busyId, pick }) {
  const isBusy = busyId === request.id;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'rgba(var(--color-primary-rgb), 0.05)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(var(--color-primary-rgb), 0.14)',
      }}
    >
      <div
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '50%',
          background: 'rgba(var(--color-primary-rgb), 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '1.1rem',
        }}
      >
        ♪
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.9rem',
          }}
        >
          {request.requester_name}
        </strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {timeAgo(request.created_at, pick)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        <Button
          size="small"
          variant="primary"
          onClick={() => onApprove(request)}
          disabled={isBusy}
          title={pick('อนุมัติ', 'Approve')}
        >
          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={14} />}
        </Button>
        <Button
          size="small"
          variant="outline"
          onClick={() => onReject(request)}
          disabled={isBusy}
          title={pick('ปฏิเสธ', 'Reject')}
        >
          <XCircle size={14} />
        </Button>
      </div>
    </div>
  );
}

export function PartyJoinRequestsPanel({ roomId, pick }) {
  const { joinRequests, setJoinRequests, upsertJoinRequest, removeJoinRequest } = usePartyRoomStore();
  const [busyId, setBusyId] = useState('');
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    let cancelled = false;

    fetchPartyRoomJoinRequests(roomId)
      .then((data) => {
        if (!cancelled) {
          setJoinRequests(data);
          loadedRef.current = true;
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [roomId, setJoinRequests]);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    const unsub = subscribeToPartyRoomJoinRequests(roomId, ({ type, record }) => {
      if (!record) {
        return;
      }
      if (type === 'DELETE') {
        removeJoinRequest(record.id);
        return;
      }
      if (record.status === 'pending') {
        upsertJoinRequest(record);
      } else {
        removeJoinRequest(record.id);
      }
    });

    return unsub;
  }, [roomId, upsertJoinRequest, removeJoinRequest]);

  const handleApprove = async (request) => {
    setBusyId(request.id);
    try {
      await approvePartyRoomJoin(
        request.id,
        request.room_id,
        request.requester_token,
        request.requester_name,
        request.requester_avatar_key,
      );
      removeJoinRequest(request.id);
    } catch (err) {
      console.error('approve failed', err);
    } finally {
      setBusyId('');
    }
  };

  const handleReject = async (request) => {
    setBusyId(request.id);
    try {
      await rejectPartyRoomJoin(request.id);
      removeJoinRequest(request.id);
    } catch (err) {
      console.error('reject failed', err);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className={`party-lobby-block party-join-requests-card${!joinRequests.length ? ' is-empty' : ''}`}>
      <div className="party-lobby-block-head">
        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Bell size={15} />
          {pick('คำขอเข้าห้อง', 'Join requests')}
        </strong>
        {joinRequests.length > 0 ? (
          <span
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: '999px',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.1rem 0.5rem',
              lineHeight: 1.4,
              flexShrink: 0,
            }}
          >
            {joinRequests.length}
          </span>
        ) : null}
      </div>
      {joinRequests.length ? (
        <div className="party-join-requests-list">
          {joinRequests.map((req) => (
            <JoinRequestCard
              key={req.id}
              request={req}
              onApprove={handleApprove}
              onReject={handleReject}
              busyId={busyId}
              pick={pick}
            />
          ))}
        </div>
      ) : (
        <div className="party-join-requests-empty">
          <span>{pick('ยังไม่มีคำขอ', 'No requests yet')}</span>
        </div>
      )}
    </div>
  );
}
