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
  getPartyPresetById,
} from '@/features/party/lib/partyEngine';
import {
  createPartyRoom,
  fetchPublishedPartySongPresets,
  getPartyBackendHint,
  joinPartyRoom,
  readPartyProfile,
} from '@/features/party/lib/partyRemote';
import { PresetCard } from './PartyPresetCard';
import { buildPartyProfile } from './partyRoomUtils';
import './Party.css';

export function PartyHubPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const partyProfile = useMemo(() => buildPartyProfile(user, readPartyProfile()), [user]);
  const [songPresetOptions, setSongPresetOptions] = useState([]);
  const [settings, setSettings] = useState(createPartySettings({
    presetId: PARTY_PRESETS[0].id,
    roundCount: 10,
    timePerRoundSec: 12,
    revealSec: 12,
    categoryId: 'all',
    keyword: '',
    showLiveScores: true,
    randomOrder: true,
  }));
  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const selectedPreset = getPartyPresetById(settings.presetId);
  const selectedPoolLabel = settings.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.label
    || PARTY_CATEGORY_OPTIONS[0].label;
  const selectedPoolLabelTh = settings.songPresetName
    || PARTY_CATEGORY_OPTIONS.find((option) => option.id === settings.categoryId)?.labelTh
    || PARTY_CATEGORY_OPTIONS[0].labelTh;
  const songPoolSelectValue = settings.songPresetId ? `preset:${settings.songPresetId}` : settings.categoryId;

  useEffect(() => {
    let ignore = false;

    fetchPublishedPartySongPresets()
      .then((presets) => {
        if (!ignore) {
          setSongPresetOptions(presets);
        }
      })
      .catch((error) => {
        console.error('Failed to load published party song presets', error);
      });

    return () => {
      ignore = true;
    };
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
      <section className="party-hero container party-hub-shell">
        <header className="party-hero-copy party-hero-copy--refresh party-hub-header">
          <span className="party-kicker"><Radio size={16} />Music Guess Party</span>
          <h1>{pick('Music Guess Party', 'Music Guess Party')}</h1>
          <p>{pick('สร้างห้องแล้วเริ่มเดาเพลงได้ทันที', 'Create a room and start guessing instantly.')}</p>
        </header>

        <form className="party-join-strip card-modern" onSubmit={handleJoin}>
          <div className="party-join-strip-copy">
            <strong>{pick('เข้าร่วมห้อง', 'Join Room')}</strong>
          </div>
          <div className="party-join-inline-form">
            <input
              type="text"
              className="party-room-code-input party-room-code-input--compact"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={6}
              aria-label={pick('รหัสห้อง', 'Room code')}
            />
            <Button className="party-gradient-action party-gradient-action--join" size="large" type="submit" disabled={busyAction === 'join' || joinCode.trim().length < 6}>
              {busyAction === 'join' ? pick('กำลังเข้า...', 'Joining...') : pick('Join Room', 'Join Room')}
            </Button>
          </div>
        </form>

        <div className="party-builder-layout party-builder-layout--refresh">
          <form className="party-builder-panel card-modern party-builder-panel--refresh" onSubmit={handleCreate}>
            <h2 className="party-builder-title">{pick('สร้างห้องใหม่', 'Create New Room')}</h2>

            <div className="party-field">
              <span>{pick('โหมดเกม', 'Game mode')}</span>
              <div className="party-preset-showcase">
                {PARTY_PRESETS.map((preset) => (
                  <PresetCard
                    key={preset.id}
                    preset={preset}
                    selected={settings.presetId === preset.id}
                    pick={pick}
                    onSelect={(presetId) => setSettings((current) => ({ ...current, presetId }))}
                  />
                ))}
              </div>
            </div>

            <div className="party-inline-fields">
              <label className="party-field">
                <span>{pick('หมวดเพลง', 'Song pool')}</span>
                <select
                  value={songPoolSelectValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue.startsWith('preset:')) {
                      const presetId = Number(nextValue.replace('preset:', '')) || 0;
                      const preset = songPresetOptions.find((entry) => entry.id === presetId);
                      setSettings((current) => ({
                        ...current,
                        categoryId: 'all',
                        songPresetId: preset ? String(preset.id) : '',
                        songPresetName: preset?.name || '',
                      }));
                      return;
                    }

                    setSettings((current) => ({
                      ...current,
                      categoryId: nextValue,
                      songPresetId: '',
                      songPresetName: '',
                    }));
                  }}
                >
                  {PARTY_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{pick(option.labelTh, option.label)}</option>
                  ))}
                  {songPresetOptions.length > 0 ? (
                    <optgroup label={pick('Preset เพลง', 'Song presets')}>
                      {songPresetOptions.map((option) => (
                        <option key={option.id} value={`preset:${option.id}`}>{option.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('จำนวนรอบ', 'Rounds')}</span>
                <select
                  value={settings.roundCount}
                  onChange={(event) => setSettings((current) => ({ ...current, roundCount: Number(event.target.value) }))}
                >
                  {[5, 10, 15, 20].map((count) => (
                    <option key={count} value={count}>{count} {pick('รอบ', 'rounds')}</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('เวลาเล่นเพลง', 'Clip time')}</span>
                <select
                  value={settings.timePerRoundSec}
                  onChange={(event) => setSettings((current) => ({ ...current, timePerRoundSec: Number(event.target.value) }))}
                >
                  {[8, 10, 12, 15, 20].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} {pick('วินาที', 'sec')}</option>
                  ))}
                </select>
              </label>
              <label className="party-field">
                <span>{pick('เวลาเฉลย', 'Reveal time')}</span>
                <select
                  value={settings.revealSec}
                  onChange={(event) => setSettings((current) => ({ ...current, revealSec: Number(event.target.value) }))}
                >
                  {[6, 8, 10, 12, 15, 20].map((seconds) => (
                    <option key={seconds} value={seconds}>{seconds} {pick('วินาที', 'sec')}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="party-field">
              <span>{pick('ตัวเลือกเสริม', 'Extra rules')}</span>
              <div className="party-toggle-grid">
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.showLiveScores}
                    onChange={(event) => setSettings((current) => ({ ...current, showLiveScores: event.target.checked }))}
                  />
                  <span>{pick('แสดงคะแนนสด', 'Live scores')}</span>
                  <small>{pick('เห็นอันดับหลังจบแต่ละรอบ', 'Show standings after each round')}</small>
                </label>
                <label className="party-toggle--card">
                  <input
                    type="checkbox"
                    checked={settings.randomOrder}
                    onChange={(event) => setSettings((current) => ({ ...current, randomOrder: event.target.checked }))}
                  />
                  <span>{pick('สุ่มลำดับเพลง', 'Shuffle songs')}</span>
                  <small>{pick('สลับเพลย์ลิสต์ก่อนเริ่มเกม', 'Randomize the playlist before the match begins')}</small>
                </label>
              </div>
            </div>

            <div className="party-settings-summary party-settings-summary--compact">
              <article className="party-stat-pill">
                <strong>{pick(selectedPreset.labelTh, selectedPreset.label)}</strong>
                <span>{pick('preset', 'preset')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{pick(selectedPoolLabelTh, selectedPoolLabel)}</strong>
                <span>{pick('pool', 'pool')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.roundCount}</strong>
                <span>{pick('รอบ', 'rounds')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.timePerRoundSec}</strong>
                <span>{pick('วินาทีเพลง', 'clip sec')}</span>
              </article>
              <article className="party-stat-pill">
                <strong>{settings.revealSec}</strong>
                <span>{pick('วินาทีเฉลย', 'reveal sec')}</span>
              </article>
            </div>

            <Button className="party-gradient-action" size="large" type="submit" disabled={busyAction === 'create'}>
              {busyAction === 'create' ? pick('กำลังสร้างห้อง...', 'Creating room...') : pick('Create Room', 'Create Room')}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

export default PartyHubPage;
