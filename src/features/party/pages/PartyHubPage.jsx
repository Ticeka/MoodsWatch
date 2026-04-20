import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  PARTY_PRESETS,
  PARTY_TITLE_GUESS_PRESETS,
  createPartySettings,
} from '@/features/party/lib/partyEngine';
import {
  createPartyRoom,
  fetchPartyTemplates,
  fetchPartyTitleGuessSets,
  getPartyBackendHint,
  joinPartyRoom,
  readPartyProfile,
  searchPublicPartyRooms,
} from '@/features/party/api/partyRemoteApi';
import { buildPartyProfile } from '@/features/party/lib/partyRoomUtils';
import '../styles/PartyHub.css';
import '../styles/Party.css';

const ROOM_LIMIT = 6;
const TEMPLATE_LIMIT = 6;

const modeCopy = {
  quiz: { th: 'ทายเพลง', en: 'Song quiz' },
  vote: { th: 'โหวตแบตเทิล', en: 'Vote battle' },
  tierlist: { th: 'จัดเทียร์', en: 'Tier list' },
  'title-guess': { th: 'ทายชื่อเรื่อง', en: 'Title guess' },
};

const presetMeta = {
  'party-classic': { players: '2-8', minutes: '10-15', tone: 'rose' },
  'song-typing': { players: '2-8', minutes: '10-15', tone: 'amber' },
  'title-guess': { players: '2-8', minutes: '12-18', tone: 'violet' },
  'title-guess-choice': { players: '2-8', minutes: '12-18', tone: 'ink' },
  'pixel-reveal': { players: '2-8', minutes: '8-12', tone: 'paper' },
  'pixel-reveal-choice': { players: '2-8', minutes: '8-12', tone: 'card' },
};

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getRoomMode(room) {
  const modeType = String(room?.settings?.modeType || 'quiz');
  return modeCopy[modeType] || modeCopy.quiz;
}

function getRoomPoolLabel(room, pick) {
  const settings = room?.settings || {};
  return settings.templateName
    || settings.songPresetName
    || settings.titleGuessSetName
    || settings.tierlistTemplateName
    || pick('เลือกชุดเกมในล็อบบี้', 'Choose a game set in the lobby');
}

function getRoomName(room, pick) {
  return String(room?.room_name || '').trim() || pick('ห้องเล่นกับเพื่อน', 'Friends room');
}

function getPresetRoomName(preset, pick) {
  return pick(`ห้อง${preset.labelTh}`, `${preset.label} room`);
}

function getInitial(name) {
  const value = String(name || '').trim();
  return value ? value.slice(0, 1).toUpperCase() : '?';
}

function Avatar({ member, index = 0 }) {
  const tones = ['sunset', 'violet', 'sea', 'berry', 'gold'];
  return (
    <span className={`ppx-avatar ppx-avatar--${tones[index % tones.length]}`}>
      {getInitial(member?.displayName)}
    </span>
  );
}

function FeaturedRoom({ room, loading, error, pick, onCopy, onJoin, busy }) {
  if (loading) {
    return (
      <section className="ppx-live-section" aria-labelledby="party-live-heading">
        <div className="ppx-section-chip"><span />{pick('กำลังโหลดห้อง', 'Loading rooms')}</div>
        <div className="ppx-live-card ppx-real-room is-loading" aria-busy="true">
          <div className="ppx-skeleton ppx-skeleton--banner" />
          <div className="ppx-real-room-body">
            <div className="ppx-skeleton ppx-skeleton--panel" />
            <div className="ppx-skeleton ppx-skeleton--side" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="ppx-live-section" aria-labelledby="party-live-heading">
        <div className="ppx-section-chip"><span />{pick('ห้องที่เปิดให้เข้าร่วม', 'Rooms open to join')}</div>
        <div className="ppx-empty-panel">
          <strong>{pick('โหลดห้องไม่สำเร็จ', 'Could not load rooms')}</strong>
          <p>{error || pick('ลองรีเฟรชอีกครั้ง หรือสร้างห้องใหม่เพื่อเริ่มเล่นได้เลย', 'Refresh again, or create a new room to start playing.')}</p>
        </div>
      </section>
    );
  }

  if (!room) {
    return (
      <section className="ppx-live-section" aria-labelledby="party-live-heading">
        <div className="ppx-section-chip"><span />{pick('ยังไม่มีห้องที่เปิดอยู่', 'No open rooms yet')}</div>
        <div className="ppx-empty-panel ppx-empty-panel--hero">
          <strong>{pick('เริ่มห้องแรก แล้วชวนเพื่อนเข้ามาเล่นด้วยกัน', 'Start the first room and invite friends to play')}</strong>
          <p>{pick('เมื่อมีห้องที่เปิดให้เข้าร่วม ห้องจะปรากฏที่นี่พร้อมจำนวนผู้เล่นและโหมดเกม', 'When a room is open to join, it appears here with player count and game mode.')}</p>
        </div>
      </section>
    );
  }

  const mode = getRoomMode(room);
  const members = Array.isArray(room.memberPreview) ? room.memberPreview : [];
  const readyCount = members.filter((member) => member.isReady).length;

  return (
    <section className="ppx-live-section" aria-labelledby="party-live-heading">
      <div className="ppx-section-chip"><span />{pick('พร้อมเล่นตอนนี้', 'Ready to play now')}</div>
      <div className="ppx-live-card ppx-real-room">
        <div className="ppx-live-banner">
          <div>
            <p>{pick('ห้องเปิด · เข้าร่วมได้ทันที', 'Open room · join instantly')}</p>
            <h2 id="party-live-heading">{getRoomName(room, pick)}</h2>
          </div>
          <div className="ppx-live-actions">
            <span>{room.room_code}</span>
            <button type="button" onClick={() => onCopy(room.room_code)}>
              <Copy size={13} />
              {pick('คัดลอกรหัส', 'Copy code')}
            </button>
          </div>
        </div>

        <div className="ppx-real-room-body">
          <div className="ppx-real-room-main">
            <p className="ppx-room-mode">{pick(mode.th, mode.en)}</p>
            <h3>{getRoomPoolLabel(room, pick)}</h3>
            <p>
              {pick(
                'เข้าห้องนี้เพื่อเลือกชุดเกม เตรียมตัว และเริ่มรอบกับเพื่อนแบบสด ๆ',
                'Join this room to choose a set, get ready, and play live with friends.',
              )}
            </p>
            <div className="ppx-real-room-actions">
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={busy === room.id}
                onClick={() => onJoin(room)}
              >
                {busy === room.id ? <Loader2 size={15} className="ppx-spin" /> : pick('เข้าร่วมห้อง', 'Join room')}
              </Button>
              <Link to="/party/rooms" viewTransition>
                {pick('ดูห้องอื่น', 'Browse rooms')}
                <ChevronRight size={15} />
              </Link>
            </div>
          </div>

          <aside className="ppx-real-room-side">
            <div className="ppx-label">{pick('ภาพรวมห้อง', 'Room overview')}</div>
            <div className="ppx-room-stat">
              <strong>{room.memberCount || members.length}</strong>
              <span>{pick('ผู้เล่น', 'players')}</span>
            </div>
            <div className="ppx-room-stat">
              <strong>{readyCount}</strong>
              <span>{pick('พร้อมเริ่ม', 'ready')}</span>
            </div>
            <div className="ppx-member-strip" aria-label={pick('ผู้เล่นในห้อง', 'Room members')}>
              {members.length > 0 ? members.map((member, index) => (
                <Avatar key={`${room.id}-${member.displayName || index}`} member={member} index={index} />
              )) : (
                <span className="ppx-no-members">{pick('รอผู้เล่นเข้าห้อง', 'Waiting for players')}</span>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function RoomCard({ room, pick, onJoin, busy }) {
  const mode = getRoomMode(room);
  const members = Array.isArray(room.memberPreview) ? room.memberPreview : [];

  return (
    <article className="ppx-room-card ppx-room-card--real">
      <span className="ppx-live-badge"><i />{pick('เข้าได้', 'Joinable')}</span>
      <div className="ppx-room-main">
        <span className="ppx-room-glyph ppx-room-glyph--sakura" aria-hidden="true">
          {getInitial(getRoomName(room, pick))}
        </span>
        <span>
          <strong>{getRoomName(room, pick)}</strong>
          <small>{pick(mode.th, mode.en)} · {getRoomPoolLabel(room, pick)}</small>
        </span>
      </div>
      <p>{pick('เข้าร่วมเพื่อเลือกชุดเกม เตรียมตัว และเริ่มเล่นกับทุกคน', 'Join to choose a set, get ready, and play together.')}</p>
      <div className="ppx-room-foot">
        <span className="ppx-stack">
          {members.slice(0, 3).map((member, index) => (
            <Avatar key={`${room.id}-${member.displayName || index}`} member={member} index={index} />
          ))}
          <i>{room.memberCount || members.length}</i>
        </span>
        <button type="button" onClick={() => onJoin(room)} disabled={busy === room.id}>
          {busy === room.id ? <Loader2 size={13} className="ppx-spin" /> : pick('เข้าร่วม', 'Join')}
        </button>
      </div>
    </article>
  );
}

function PresetCard({ preset, pick, onCreate, busy }) {
  const meta = presetMeta[preset.id] || presetMeta['party-classic'];
  const isTitleGuess = preset.target === 'title' && String(preset.id).includes('title');

  return (
    <button
      type="button"
      className={`ppx-template-card ppx-template-card--${meta.tone}`}
      onClick={() => onCreate(preset)}
      disabled={busy}
    >
      <span className="ppx-template-glyph" aria-hidden="true">{isTitleGuess ? '◇' : '♪'}</span>
      <strong>{pick(preset.labelTh, preset.label)}</strong>
      <p>{pick(preset.descriptionTh, preset.description)}</p>
      <span>
        <small>{meta.players} {pick('ผู้เล่น', 'players')}</small>
        <small>{meta.minutes} {pick('นาที', 'min')}</small>
      </span>
    </button>
  );
}

function SetCard({ item, pick }) {
  const count = Number(item.itemCount || item.questionCount || 0);
  const typeLabel = item.contentType === 'title-guess'
    ? pick('ชุดทายชื่อเรื่อง', 'Guess set')
    : pick('ชุดเพลง', 'Song set');
  const href = item.contentType === 'title-guess'
    ? '/party/templates?type=title-guess'
    : `/party/templates/${item.id}`;

  return (
    <Link className="ppx-set-card" to={href} viewTransition>
      {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">✦</span>}
      <div>
        <small>{typeLabel}</small>
        <strong>{item.name}</strong>
        <p>{item.description || pick('ใช้ชุดนี้เป็นคำถามหลักตอนตั้งค่าห้อง', 'Use this set as the main questions during room setup.')}</p>
      </div>
      <b>{count} {item.contentType === 'title-guess' ? pick('ข้อ', 'questions') : pick('เพลง', 'songs')}</b>
    </Link>
  );
}

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [busyRoomId, setBusyRoomId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [sets, setSets] = useState([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState('');

  const presets = useMemo(() => [
    ...PARTY_PRESETS,
    ...PARTY_TITLE_GUESS_PRESETS,
  ].slice(0, 6), []);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      const data = await searchPublicPartyRooms({ page: 0, pageSize: ROOM_LIMIT });
      setRooms(Array.isArray(data) ? data : []);
    } catch (error) {
      setRoomsError(getPartyBackendHint(error, pick));
    } finally {
      setRoomsLoading(false);
    }
  }, [pick]);

  const loadSets = useCallback(async () => {
    setSetsLoading(true);
    setSetsError('');
    try {
      const [songResult, titleGuessSets] = await Promise.all([
        fetchPartyTemplates({ tab: 'all', mode: 'all', page: 1, pageSize: TEMPLATE_LIMIT }),
        fetchPartyTitleGuessSets({ tab: 'all', limit: TEMPLATE_LIMIT }),
      ]);
      const songSets = (songResult?.templates || []).map((template) => ({
        ...template,
        contentType: 'song-set',
        itemCount: Number(template.itemCount || 0),
      }));
      const guessSets = (titleGuessSets || []).map((template) => ({
        ...template,
        contentType: 'title-guess',
        itemCount: Number(template.questionCount || 0),
      }));
      setSets([...songSets, ...guessSets].slice(0, TEMPLATE_LIMIT));
    } catch (error) {
      setSetsError(getPartyBackendHint(error, pick));
    } finally {
      setSetsLoading(false);
    }
  }, [pick]);

  useEffect(() => {
    loadRooms();
    loadSets();
  }, [loadRooms, loadSets]);

  const createRoom = async ({ name = roomName, settings = null } = {}) => {
    try {
      setBusyAction('create');
      const nextSettings = settings || createPartySettings({ modeType: 'quiz', presetId: PARTY_PRESETS[0].id });
      const room = await createPartyRoom({
        profile: partyProfile,
        settings: nextSettings,
        roomName: name,
        visibility: 'public',
      });
      toast.success(pick('สร้างห้องแล้ว พร้อมชวนเพื่อน', 'Room created. Invite your friends.'));
      navigate(`/party/room/${room.room_code}`, { viewTransition: true });
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    await createRoom();
  };

  const handlePresetCreate = async (preset) => {
    const modeType = PARTY_TITLE_GUESS_PRESETS.some((item) => item.id === preset.id) ? 'title-guess' : 'quiz';
    await createRoom({
      name: roomName || getPresetRoomName(preset, pick),
      settings: createPartySettings({ modeType, presetId: preset.id }),
    });
  };

  const handleJoin = async (event) => {
    event.preventDefault();
    const code = normalizeCode(joinCode);
    if (!code) return;
    try {
      setBusyAction('join');
      const room = await joinPartyRoom(code, partyProfile);
      toast.success(pick('เข้าห้องแล้ว', 'Joined the room'));
      navigate(`/party/room/${room.room_code}`, { viewTransition: true });
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  const handleJoinRoom = async (room) => {
    if (!room?.room_code) return;
    try {
      setBusyRoomId(room.id);
      const joinedRoom = await joinPartyRoom(room.room_code, partyProfile);
      toast.success(pick('เข้าห้องแล้ว', 'Joined the room'));
      navigate(`/party/room/${joinedRoom.room_code}`, { viewTransition: true });
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyRoomId('');
    }
  };

  const handleCopyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(pick('คัดลอกรหัสห้องแล้ว', 'Room code copied'));
    } catch {
      toast(code);
    }
  };

  const onlinePlayers = rooms.reduce((sum, room) => sum + Number(room.memberCount || 0), 0);
  const featuredRoom = rooms[0] || null;

  return (
    <div className="ppx-page party-route-fade">
      <div className="ppx-shell">
        <header className="ppx-hero">
          <div className="ppx-hero-copy">
            <h1 className="ppx-title">
              {pick('ห้องปาร์ตี้', 'Party')}
              <span> {pick('ของคุณ', 'rooms')}</span>
            </h1>
            <p className="ppx-sub">
              {pick('สร้างห้อง ชวนเพื่อน แล้วเลือกชุดเกมจากคลังของ MoodToon เพื่อเริ่มเล่นได้ทันที', 'Create a room, invite friends, and choose a MoodToon game set to start playing right away.')}
            </p>
            <div className="ppx-hero-meta">
              <span>{pick('ทายเพลง', 'Song quiz')}</span>
              <span>{pick('ทายชื่อเรื่อง', 'Title guess')}</span>
              <span>{pick('จัดเทียร์', 'Tier list')}</span>
            </div>
          </div>

          <aside className="ppx-hero-panel" aria-label={pick('เริ่มเล่นปาร์ตี้', 'Start a party')}>
            <div className="ppx-hero-panel-head">
              <span>{pick('เริ่มได้ทันที', 'Ready when you are')}</span>
              <strong>{pick('เปิดห้องในไม่กี่คลิก', 'Open a room in a few clicks')}</strong>
            </div>
            <div className="ppx-actions" aria-label={pick('การทำงานหลักของห้องปาร์ตี้', 'Party room actions')}>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="ppx-create-button"
                icon={busyAction === 'create' ? <Loader2 size={18} className="ppx-spin" /> : <Sparkles size={18} />}
                disabled={busyAction === 'create'}
                onClick={() => createRoom()}
              >
                {pick('สร้างห้องใหม่', 'Create room')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                className="ppx-pill-button"
                icon={<Plus size={16} />}
                onClick={() => setShowJoin((value) => !value)}
              >
                {pick('เข้าด้วยรหัส', 'Join by code')}
              </Button>
            </div>
            <div className="ppx-hero-stats">
              <span>
                <strong>{roomsLoading ? '-' : rooms.length}</strong>
                {pick('ห้องเปิด', 'open rooms')}
              </span>
              <span>
                <strong>{roomsLoading ? '-' : onlinePlayers}</strong>
                {pick('ผู้เล่นพร้อมเล่น', 'players ready')}
              </span>
            </div>
          </aside>
        </header>

        <form className={`ppx-join-strip${showJoin ? ' is-open' : ''}`} onSubmit={handleJoin}>
          <div>
            <label htmlFor="party-join-code">{pick('รหัสห้อง', 'Room code')}</label>
            <p>{pick('ใส่รหัสที่โฮสต์แชร์ให้ เพื่อเข้าห้องเดียวกัน', 'Enter the code shared by the host to join the same room.')}</p>
          </div>
          <input
            id="party-join-code"
            type="text"
            value={joinCode}
            onChange={(event) => setJoinCode(normalizeCode(event.target.value))}
            placeholder="ABC123"
            maxLength={12}
            aria-describedby="party-join-hint"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busyAction === 'join' || joinCode.trim().length < 4}
          >
            {busyAction === 'join' ? <Loader2 size={14} className="ppx-spin" /> : pick('เข้าห้อง', 'Join')}
          </Button>
          <span id="party-join-hint" className="party-sr-only">
            {pick('รหัสห้องใช้ตัวอักษรและตัวเลขตามที่โฮสต์แชร์ให้', 'Use the letters and numbers shared by the host.')}
          </span>
        </form>

        <FeaturedRoom
          room={featuredRoom}
          loading={roomsLoading}
          error={roomsError}
          pick={pick}
          onCopy={handleCopyCode}
          onJoin={handleJoinRoom}
          busy={busyRoomId}
        />

        <section className="ppx-directory" aria-labelledby="party-open-heading">
          <div className="ppx-section-head">
            <div>
              <p>{pick('ห้องที่เข้าร่วมได้', 'Rooms to join')}</p>
              <h2 id="party-open-heading">
                {roomsLoading
                  ? pick('กำลังค้นหาห้องที่เปิดอยู่', 'Finding open rooms')
                  : pick(`${rooms.length} ห้อง, ${onlinePlayers} ผู้เล่นพร้อมเล่น`, `${rooms.length} rooms, ${onlinePlayers} players ready`)}
              </h2>
            </div>
            <div className="ppx-filters">
              <button type="button" onClick={loadRooms} disabled={roomsLoading}>
                <RefreshCw size={14} className={roomsLoading ? 'ppx-spin' : ''} />
                {pick('อัปเดต', 'Refresh')}
              </button>
              <Link to="/party/rooms" viewTransition>
                {pick('ดูทั้งหมด', 'View all')}
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {roomsLoading ? (
            <div className="ppx-room-grid">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="ppx-room-card ppx-skeleton-card" />)}
            </div>
          ) : rooms.length > 0 ? (
            <div className="ppx-room-grid">
              {rooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  pick={pick}
                  onJoin={handleJoinRoom}
                  busy={busyRoomId}
                />
              ))}
            </div>
          ) : (
            <div className="ppx-empty-panel">
              <strong>{pick('ยังไม่มีห้องที่เปิดให้เข้าร่วม', 'No rooms are open right now')}</strong>
              <p>{pick('สร้างห้องใหม่ หรือเข้าด้วยรหัสที่เพื่อนส่งมาได้เลย', 'Create a room, or join with a code from a friend.')}</p>
            </div>
          )}
        </section>

        <section className="ppx-templates" aria-labelledby="party-template-heading">
          <div className="ppx-section-head">
            <div>
              <p>{pick('เริ่มเกมใหม่', 'Start a new game')}</p>
              <h2 id="party-template-heading">{pick('เลือกโหมดที่อยากเล่น', 'Choose a game mode')}</h2>
            </div>
            <Link className="ppx-inline-link" to="/party/templates" viewTransition>
              {pick('จัดการชุดเกม', 'Manage sets')}
              <ChevronRight size={14} />
            </Link>
          </div>

          <form className="ppx-room-name-form" onSubmit={handleCreate}>
            <label htmlFor="party-room-name">{pick('ชื่อห้อง', 'Room name')}</label>
            <input
              id="party-room-name"
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder={pick('เช่น คืนนี้ดูอะไรกันดี', 'e.g. What should we watch tonight?')}
              maxLength={60}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={busyAction === 'create'}>
              {pick('สร้างแบบเร็ว', 'Quick create')}
            </Button>
            <p className="ppx-room-name-hint">
              {pick('เว้นว่างไว้ได้ ระบบจะตั้งชื่อห้องจากโหมดที่เลือก', 'You can leave it blank. We will name the room from the mode you choose.')}
            </p>
          </form>

          <div className="ppx-template-grid">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                pick={pick}
                onCreate={handlePresetCreate}
                busy={busyAction === 'create'}
              />
            ))}
          </div>
        </section>

        <section className="ppx-sets" aria-labelledby="party-sets-heading">
          <div className="ppx-section-head">
            <div>
              <p>{pick('ชุดเกมล่าสุด', 'Latest game sets')}</p>
              <h2 id="party-sets-heading">{pick('เลือกคอนเทนต์ให้ห้องของคุณ', 'Pick content for your room')}</h2>
            </div>
          </div>

          {setsLoading ? (
            <div className="ppx-set-grid">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="ppx-set-card ppx-skeleton-card" />)}
            </div>
          ) : setsError ? (
            <div className="ppx-empty-panel">
              <strong>{pick('โหลดชุดเกมไม่สำเร็จ', 'Could not load game sets')}</strong>
              <p>{setsError}</p>
            </div>
          ) : sets.length > 0 ? (
            <div className="ppx-set-grid">
              {sets.map((item) => <SetCard key={`${item.contentType}-${item.id}`} item={item} pick={pick} />)}
            </div>
          ) : (
            <div className="ppx-empty-panel">
              <strong>{pick('ยังไม่มีชุดเกมให้เลือก', 'No game sets yet')}</strong>
              <p>{pick('เพิ่มชุดเพลงหรือชุดทายชื่อเรื่องก่อน แล้วนำมาใช้ตอนตั้งค่าห้อง', 'Add a song set or title-guess set, then use it during room setup.')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default PartyHubPage;
