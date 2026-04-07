import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Music2, RefreshCw, Search, Vote } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  cancelPartyRoomJoinRequest,
  readPartyProfile,
  requestPartyRoomJoin,
  searchPublicPartyRooms,
  subscribeToPartyRoomJoinRequests,
} from '@/features/party/api/partyRemoteApi';
import { buildPartyProfile } from '@/features/party/lib/partyRoomUtils';
import '../styles/PartyRoomDirectory.css';

const PAGE_SIZE = 20;

const MODE_FILTERS = [
  { id: '', labelTh: 'ทั้งหมด', label: 'All' },
  { id: 'quiz', labelTh: 'ทายเพลง', label: 'Quiz' },
  { id: 'vote', labelTh: 'โหวต', label: 'Vote' },
];

function RoomCard({ room, onRequest, busyRoomId, pick }) {
  const isVote = room?.settings?.modeType === 'vote';
  const poolLabel = room?.settings?.templateName
    || room?.settings?.songPresetName
    || room?.settings?.categoryId
    || (isVote ? pick('ทั่วไป', 'General') : pick('ทั่วไป', 'General'));
  const displayName = room?.room_name?.trim() || pick('ไม่มีชื่อ', 'Unnamed Room');
  const isBusy = busyRoomId === room?.id;

  return (
    <div className={`prd-card ${isVote ? 'is-vote' : 'is-quiz'}`}>
      <div className={`prd-card-icon ${isVote ? 'is-vote' : 'is-quiz'}`}>
        {isVote ? <Vote size={18} /> : <Music2 size={18} />}
      </div>
      <div className="prd-card-body">
        <div className="prd-card-name">{displayName}</div>
        <div className="prd-card-meta">
          <span className={`prd-badge ${isVote ? 'is-vote' : 'is-quiz'}`}>
            {isVote ? pick('โหวต', 'Vote') : pick('ทายเพลง', 'Quiz')}
          </span>
          <span className="prd-card-pool">{poolLabel}</span>
        </div>
      </div>
      <Button
        size="sm"
        variant="primary"
        onClick={() => onRequest(room)}
        disabled={isBusy}
      >
        {isBusy
          ? <Loader2 size={13} style={{ animation: 'prd-spin-anim 0.8s linear infinite' }} />
          : pick('ขอเข้า', 'Join')}
      </Button>
    </div>
  );
}

function PendingView({ request, onCancel, busyCancelId, pick }) {
  return (
    <div className="prd-pending-wrap">
      <div className="prd-pending-spinner">
        <Loader2 size={24} style={{ animation: 'prd-spin-anim 0.8s linear infinite' }} />
      </div>
      <h2 className="prd-pending-title">{pick('รอ host อนุมัติ…', 'Waiting for approval…')}</h2>
      <p className="prd-pending-sub">
        {pick(
          'host จะเห็นคำขอของคุณ หากอนุมัติ คุณจะเข้าห้องอัตโนมัติ',
          'The host will see your request. If approved, you\'ll be taken to the room automatically.',
        )}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onCancel(request)}
        disabled={busyCancelId === request?.id}
        fullWidth
      >
        {busyCancelId === request?.id
          ? pick('กำลังยกเลิก…', 'Cancelling…')
          : pick('ยกเลิกคำขอ', 'Cancel Request')}
      </Button>
    </div>
  );
}

export function PartyRoomDirectoryPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = React.useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [busyRoomId, setBusyRoomId] = useState('');
  const [busyCancelId, setBusyCancelId] = useState('');
  const [pendingRequest, setPendingRequest] = useState(null);
  const unsubRef = useRef(null);

  const loadRooms = React.useCallback(async (q, mode) => {
    setLoading(true);
    setPage(0);
    try {
      const data = await searchPublicPartyRooms({ query: q, mode, page: 0, pageSize: PAGE_SIZE });
      setRooms(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      toast.error(pick('โหลดห้องไม่สำเร็จ', 'Failed to load rooms'));
    } finally {
      setLoading(false);
    }
  }, [pick]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await searchPublicPartyRooms({ query, mode: modeFilter, page: nextPage, pageSize: PAGE_SIZE });
      setRooms((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...data.filter((r) => !ids.has(r.id))];
      });
      setHasMore(data.length === PAGE_SIZE);
      setPage(nextPage);
    } catch {
      toast.error(pick('โหลดเพิ่มไม่สำเร็จ', 'Failed to load more'));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadRooms(query, modeFilter);
  }, [query, modeFilter, loadRooms]);

  // Realtime: watch join request status
  useEffect(() => {
    if (!pendingRequest?.room_id) {
      unsubRef.current?.();
      unsubRef.current = null;
      return undefined;
    }
    unsubRef.current = subscribeToPartyRoomJoinRequests(pendingRequest.room_id, ({ record }) => {
      if (String(record?.id || '') !== String(pendingRequest?.id || '')) return;
      if (record?.status === 'approved') {
        toast.success(pick('ได้รับการอนุมัติแล้ว!', 'Approved!'));
        setPendingRequest(null);
        navigate(`/party/room/${pendingRequest.room_code}`);
      } else if (record?.status === 'rejected') {
        toast.error(pick('host ปฏิเสธคำขอ', 'Request rejected'));
        setPendingRequest(null);
      }
    });
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [pendingRequest, navigate, pick]);

  const handleRequest = async (room) => {
    setBusyRoomId(room.id);
    try {
      const req = await requestPartyRoomJoin(room.id, partyProfile);
      setPendingRequest({ ...req, room_code: room.room_code });
    } catch {
      toast.error(pick('ส่งคำขอไม่สำเร็จ', 'Request failed'));
    } finally {
      setBusyRoomId('');
    }
  };

  const handleCancel = async (request) => {
    setBusyCancelId(request.id);
    try {
      await cancelPartyRoomJoinRequest(request.id);
      setPendingRequest(null);
      toast(pick('ยกเลิกแล้ว', 'Cancelled'));
    } catch {
      toast.error(pick('ยกเลิกไม่สำเร็จ', 'Failed to cancel'));
    } finally {
      setBusyCancelId('');
    }
  };

  return (
    <div className="prd-page">
      <div className="prd-shell">

        <Link to="/party" className="prd-back">
          <ArrowLeft size={14} />
          {pick('กลับ', 'Back')}
        </Link>

        <header className="prd-header">
          <div className="prd-kicker">
            <Music2 size={11} />
            Music Guess Party
          </div>
          <h1 className="prd-title">{pick('หาห้องเล่น', 'Find a Room')}</h1>
          <p className="prd-sub">
            {pick('ห้อง Public ที่รอผู้เล่นอยู่ตอนนี้', 'Public rooms open for players right now')}
          </p>
        </header>

        {pendingRequest ? (
          <PendingView
            request={pendingRequest}
            onCancel={handleCancel}
            busyCancelId={busyCancelId}
            pick={pick}
          />
        ) : (
          <>
            {/* Controls */}
            <div className="prd-controls">
              <div className="prd-search-wrap">
                <Search size={15} className="prd-search-icon" />
                <input
                  type="text"
                  className="prd-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={pick('ค้นหาชื่อห้อง…', 'Search by room name…')}
                />
              </div>
              <div className="prd-filter-pills">
                {MODE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`prd-pill${modeFilter === f.id ? ' is-active' : ''}`}
                    onClick={() => setModeFilter(f.id)}
                  >
                    {pick(f.labelTh, f.label)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="prd-refresh-btn"
                onClick={() => loadRooms(query, modeFilter)}
                disabled={loading || loadingMore}
                title={pick('รีเฟรช', 'Refresh')}
              >
                <RefreshCw size={15} className={loading ? 'prd-spin' : ''} />
              </button>
            </div>

            {/* Results */}
            {loading ? (
              <div className="prd-skeleton-grid">
                {[1, 2, 3, 4].map((i) => <div key={i} className="prd-skeleton-card" />)}
              </div>
            ) : rooms.length === 0 ? (
              <div className="prd-empty">
                <span className="prd-empty-icon">🎵</span>
                <h3>{query ? pick('ไม่พบห้องที่ตรงกัน', 'No rooms found') : pick('ยังไม่มีห้องเปิดอยู่', 'No open rooms right now')}</h3>
                <p>
                  {query
                    ? pick('ลองค้นด้วยคำอื่น หรือรอสักครู่', 'Try a different search or check back soon')
                    : pick('สร้างห้องเป็นคนแรกสิ!', 'Be the first to create one!')}
                </p>
              </div>
            ) : (
              <>
                <div className="prd-grid">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onRequest={handleRequest}
                      busyRoomId={busyRoomId}
                      pick={pick}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="prd-load-more-row">
                    <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                      {loadingMore
                        ? <><Loader2 size={14} style={{ animation: 'prd-spin-anim 0.8s linear infinite', marginRight: '0.4rem' }} />{pick('กำลังโหลด…', 'Loading…')}</>
                        : pick('โหลดเพิ่ม', 'Load more')}
                    </Button>
                  </div>
                )}

                {!hasMore && (
                  <p className="prd-total">
                    {pick(`${rooms.length} ห้องทั้งหมด`, `${rooms.length} rooms total`)}
                  </p>
                )}
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
