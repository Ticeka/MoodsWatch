import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  Radio,
  Search,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { PARTY_PRESETS, createPartySettings } from '@/features/party/lib/partyEngine';
import { createPartyRoom, getPartyBackendHint, joinPartyRoom, readPartyProfile } from '@/features/party/api/partyRemoteApi';
import { buildPartyProfile } from '@/features/party/lib/partyRoomUtils';
import '../styles/PartyHub.css';

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [roomName, setRoomName] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [delightIndex, setDelightIndex] = useState(0);

  const delightTexts = [
    pick('ตั้งค่าห้องได้ครบก่อนเริ่มเล่น', 'Finish setup before anyone starts playing'),
    pick('รองรับทั้งชุดเพลงและชุดทายชื่อเรื่อง', 'Works with both song sets and title-guess sets'),
    pick('ชวนเพื่อนเข้าห้องได้ทันทีด้วยรหัสห้อง', 'Invite friends instantly with a room code'),
  ];

  useEffect(() => {
    const id = setInterval(() => setDelightIndex((index) => (index + 1) % delightTexts.length), 3200);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create');
      const defaultSettings = createPartySettings({ modeType: 'quiz', presetId: PARTY_PRESETS[0].id });
      const room = await createPartyRoom({ profile: partyProfile, settings: defaultSettings, roomName, visibility });
      toast.success(pick('สร้างห้องสำเร็จ', 'Room created'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('join');
      const room = await joinPartyRoom(joinCode, partyProfile);
      toast.success(pick('เข้าร่วมห้องแล้ว', 'Joined the room'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const lobbyFeatures = [
    { emoji: '🎵', label: pick('โหมดเล่น', 'Game Mode') },
    { emoji: '📚', label: pick('ชุดเพลง', 'Song set') },
    { emoji: '⏱', label: pick('เวลา', 'Timing') },
    { emoji: '🔒', label: pick('สิทธิ์ห้อง', 'Room Access') },
    { emoji: '✅', label: pick('พร้อม / เริ่มเกม', 'Ready / Start') },
  ];

  return (
    <div className="pgw-page">
      <div className="pgw-shell">
        <header className="pgw-hero">
          <div className="pgw-kicker"><Radio size={11} />{pick('ห้องปาร์ตี้เพลง', 'Party Room')}</div>
          <h1 className="pgw-title">PARTY</h1>
          <p className="pgw-tagline">
            {pick('สร้างห้องแล้วตั้งค่าเกมในล็อบบี้', 'Create a room, then finish setup in the lobby')}
          </p>
          <p className="pgw-sub">
            {pick(
              'เริ่มจากสร้างห้องก่อน แล้วค่อยเลือกโหมด ชุดเพลง หรือชุดคำถาม รวมถึงเวลาต่อรอบในล็อบบี้',
              'Start by creating the room, then choose the mode, song set or question set, and round timing in the lobby.',
            )}
          </p>
        </header>

        <div className="pgw-cta-area">
          <form className="pgw-create-card" onSubmit={handleCreate}>
            <div className="pgw-card-eyebrow">{pick('สร้างห้องใหม่', 'New Room')}</div>
            <input
              type="text"
              className="pgw-name-input"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder={pick('ชื่อห้อง (ไม่บังคับ)', 'Room name (optional)')}
              maxLength={60}
            />
            <div className="pgw-vis-row">
              <button
                type="button"
                className={`pgw-vis-btn${visibility === 'public' ? ' is-active' : ''}`}
                onClick={() => setVisibility('public')}
              >
                <Globe size={13} />
                {pick('สาธารณะ', 'Public')}
              </button>
              <button
                type="button"
                className={`pgw-vis-btn${visibility === 'private' ? ' is-active' : ''}`}
                onClick={() => setVisibility('private')}
              >
                <Lock size={13} />
                {pick('ส่วนตัว', 'Private')}
              </button>
            </div>
            <Button className="party-gradient-action" size="lg" type="submit" fullWidth disabled={busyAction === 'create'}>
              {busyAction === 'create'
                ? <><Loader2 size={16} style={{ animation: 'prd-spin-anim 0.8s linear infinite', marginRight: '0.4rem' }} />{pick('กำลังสร้าง…', 'Creating…')}</>
                : pick('สร้างห้อง', 'Create room')}
            </Button>
            <p className="pgw-create-hint">
              <Sparkles size={12} style={{ flexShrink: 0 }} />
              {pick('ตั้งค่าหลักทั้งหมดได้หลังสร้างห้อง ระบบจะพาไปที่ล็อบบี้ทันที', 'You can finish all key setup after room creation. We will take you straight to the lobby.')}
            </p>
          </form>

          <div className="pgw-join-side">
            <form className="pgw-join-card" onSubmit={handleJoin}>
              <div className="pgw-card-eyebrow">{pick('เข้าห้องด้วยโค้ด', 'Join with Code')}</div>
              <input
                type="text"
                className="pgw-code-input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="XXXXXX"
                maxLength={6}
                aria-label={pick('รหัสห้อง', 'Room code')}
              />
              <Button size="md" variant="primary" type="submit" fullWidth disabled={busyAction === 'join' || joinCode.trim().length < 6}>
                {busyAction === 'join'
                  ? <Loader2 size={16} style={{ animation: 'prd-spin-anim 0.8s linear infinite' }} />
                  : pick('เข้าห้อง', 'Join Room')}
              </Button>
              <p className="pgw-join-hint">
                {pick('มีโค้ดอยู่แล้ว? เข้าได้ทันที', 'Already have a code? Jump right in')}
              </p>
            </form>
            <Link to="/party/rooms" className="pgw-find-link">
              <Search size={14} />
              {pick('ดูห้องสาธารณะ', 'Browse Public Rooms')}
            </Link>
          </div>
        </div>

        <section className="pgw-steps-section">
          <div className="pgw-section-label">{pick('วิธีเล่น 3 ขั้นตอน', 'How it works')}</div>
          <div className="pgw-steps">
            <div className="pgw-step-card" data-step="1">
              <div className="pgw-step-num">1</div>
              <strong className="pgw-step-title">{pick('สร้างห้อง', 'Create room')}</strong>
              <p className="pgw-step-desc">{pick('ตั้งชื่อห้องถ้าต้องการ แล้วกดสร้างห้องเพื่อเข้าไปตั้งค่าต่อ', 'Add a room name if you want, then create the room to continue setup')}</p>
            </div>
            <div className="pgw-step-arrow" aria-hidden="true"><ChevronRight size={20} /></div>
            <div className="pgw-step-card" data-step="2">
              <div className="pgw-step-num">2</div>
              <strong className="pgw-step-title">{pick('ตั้งค่าห้อง', 'Configure the room')}</strong>
              <p className="pgw-step-desc">{pick('เลือกโหมด ชุดเพลงหรือชุดคำถาม และเวลาที่ใช้ต่อรอบ', 'Choose the mode, set list or question set, and round timing')}</p>
            </div>
            <div className="pgw-step-arrow" aria-hidden="true"><ChevronRight size={20} /></div>
            <div className="pgw-step-card" data-step="3">
              <div className="pgw-step-num">3</div>
              <strong className="pgw-step-title">{pick('ชวนเพื่อนแล้วเริ่มเกม', 'Invite players and start')}</strong>
              <p className="pgw-step-desc">{pick('แชร์รหัสห้องให้เพื่อนเข้ามาพร้อมกัน แล้วค่อยเริ่มเกมเมื่อทุกคนพร้อม', 'Share the room code, wait until everyone is ready, then start the game')}</p>
            </div>
          </div>
        </section>

        <section className="pgw-lobby-section">
          <div className="pgw-section-label">{pick('ตั้งค่าได้ทั้งหมดใน Lobby', 'Everything configurable in Lobby')}</div>
          <div className="pgw-chips">
            {lobbyFeatures.map((feature) => (
              <span key={feature.label} className="pgw-chip">
                {feature.emoji} {feature.label}
              </span>
            ))}
          </div>
        </section>

        <div className="pgw-delight" aria-live="polite">
          <p className="pgw-delight-text" key={delightIndex}>
            {delightTexts[delightIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

export default PartyHubPage;
