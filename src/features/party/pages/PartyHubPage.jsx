import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  createPartySettings,
} from '@/features/party/lib/partyEngine';
import {
  createPartyRoom,
  fetchPublishedPartySongPresets,
  getPartyBackendHint,
  joinPartyRoom,
  readPartyProfile,
} from '@/features/party/lib/partyRemote';
import { buildPartyProfile } from './partyRoomUtils';
import './Party.css';

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [songPresetOptions, setSongPresetOptions] = useState([]);
  const [settings, setSettings] = useState(createPartySettings({
    modeType: 'quiz',
    presetId: PARTY_PRESETS[0].id,
    roundCount: 10,
    entrantCount: 8,
    timePerRoundSec: 12,
    voteSec: 10,
    revealSec: 12,
    categoryId: 'all',
    keyword: '',
    showLiveScores: true,
    randomOrder: true,
  }));
  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const songPoolSelectValue = settings.songPresetId ? `preset:${settings.songPresetId}` : settings.categoryId;

  useEffect(() => {
    let ignore = false;
    fetchPublishedPartySongPresets()
      .then((presets) => { if (!ignore) setSongPresetOptions(presets); })
      .catch((error) => { console.error('Failed to load published party song presets', error); });
    return () => { ignore = true; };
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create');
      const room = await createPartyRoom({ profile: partyProfile, settings });
      toast.success(pick('สร้างห้องเรียบร้อยแล้ว', 'Room created'));
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
      toast.success(pick('เข้าห้องเรียบร้อยแล้ว', 'Joined the room'));
      navigate(`/party/room/${room.room_code}`);
    } catch (error) {
      toast.error(getPartyBackendHint(error, pick));
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="party-page is-modern">
      <div className="phub container">

        <header className="phub-header">
          <span className="party-kicker"><Radio size={13} />Music Party</span>
          <h1 className="phub-title">Music Party</h1>
          <p className="phub-sub">{pick('เดาเพลง · โหวตเพลง · เล่นกับเพื่อน', 'Guess songs · Vote battles · Play together')}</p>
        </header>

        <div className="phub-body">

          {/* ── Create Room ── */}
          <form className="phub-create" onSubmit={handleCreate}>
            <h2 className="phub-section-title">{pick('สร้างห้อง', 'Create Room')}</h2>

            {/* Mode selector */}
            <div className="phub-field">
              <span className="phub-label">{pick('โหมด', 'Mode')}</span>
              <div className="phub-mode-group">
                {PARTY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`phub-mode-btn${settings.presetId === preset.id ? ' is-active' : ''}`}
                    onClick={() => setSettings((c) => ({ ...c, presetId: preset.id }))}
                  >
                    {pick(preset.labelTh, preset.label)}
                  </button>
                ))}
              </div>
            </div>

            {/* Settings selects */}
            <div className="phub-selects">
              <label className="phub-field">
                <span className="phub-label">{pick('หมวดเพลง', 'Song pool')}</span>
                <select
                  value={songPoolSelectValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue.startsWith('preset:')) {
                      const presetId = Number(nextValue.replace('preset:', '')) || 0;
                      const preset = songPresetOptions.find((e) => e.id === presetId);
                      setSettings((c) => ({ ...c, categoryId: 'all', songPresetId: preset ? String(preset.id) : '', songPresetName: preset?.name || '' }));
                      return;
                    }
                    setSettings((c) => ({ ...c, categoryId: nextValue, songPresetId: '', songPresetName: '' }));
                  }}
                >
                  {PARTY_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{pick(option.labelTh, option.label)}</option>
                  ))}
                  {songPresetOptions.length > 0 && (
                    <optgroup label={pick('Preset เพลง', 'Song presets')}>
                      {songPresetOptions.map((option) => (
                        <option key={option.id} value={`preset:${option.id}`}>{option.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              <label className="phub-field">
                <span className="phub-label">{pick('จำนวนรอบ', 'Rounds')}</span>
                <select value={settings.roundCount} onChange={(e) => setSettings((c) => ({ ...c, roundCount: Number(e.target.value) }))}>
                  {[2, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} {pick('รอบ', 'rounds')}</option>)}
                </select>
              </label>

              <label className="phub-field">
                <span className="phub-label">{pick('เวลาเพลง', 'Clip')}</span>
                <select value={settings.timePerRoundSec} onChange={(e) => setSettings((c) => ({ ...c, timePerRoundSec: Number(e.target.value) }))}>
                  {[8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n} {pick('วิ', 'sec')}</option>)}
                </select>
              </label>

              <label className="phub-field">
                <span className="phub-label">{pick('เวลาเฉลย', 'Reveal')}</span>
                <select value={settings.revealSec} onChange={(e) => setSettings((c) => ({ ...c, revealSec: Number(e.target.value) }))}>
                  {[6, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n} {pick('วิ', 'sec')}</option>)}
                </select>
              </label>
            </div>

            {/* Toggles */}
            <div className="phub-toggles">
              <label className="phub-toggle">
                <input
                  type="checkbox"
                  checked={settings.showLiveScores}
                  onChange={(e) => setSettings((c) => ({ ...c, showLiveScores: e.target.checked }))}
                />
                <span>{pick('คะแนนสด', 'Live scores')}</span>
              </label>
              <label className="phub-toggle">
                <input
                  type="checkbox"
                  checked={settings.randomOrder}
                  onChange={(e) => setSettings((c) => ({ ...c, randomOrder: e.target.checked }))}
                />
                <span>{pick('สุ่มเพลง', 'Shuffle')}</span>
              </label>
            </div>

            <Button className="party-gradient-action" size="large" type="submit" disabled={busyAction === 'create'}>
              {busyAction === 'create' ? pick('กำลังสร้าง...', 'Creating...') : pick('สร้างห้อง', 'Create Room')}
            </Button>
          </form>

          {/* ── Divider ── */}
          <div className="phub-or" aria-hidden="true">
            <span>{pick('หรือ', 'or')}</span>
          </div>

          {/* ── Join Room ── */}
          <form className="phub-join" onSubmit={handleJoin}>
            <h2 className="phub-section-title">{pick('เข้าร่วมห้อง', 'Join Room')}</h2>
            <p className="phub-join-hint">{pick('ใส่รหัสห้อง 6 ตัว', 'Enter the 6-character room code')}</p>
            <input
              type="text"
              className="party-room-code-input phub-code-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              aria-label={pick('รหัสห้อง', 'Room code')}
            />
            <Button
              className="party-gradient-action party-gradient-action--join"
              size="large"
              type="submit"
              disabled={busyAction === 'join' || joinCode.trim().length < 6}
            >
              {busyAction === 'join' ? pick('กำลังเข้า...', 'Joining...') : pick('Join Room', 'Join Room')}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default PartyHubPage;
