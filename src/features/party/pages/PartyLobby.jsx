import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Copy, Link2, Play, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import {
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  PARTY_TITLE_GUESS_PRESETS,
  PARTY_VOTE_PLAYBACK_MODES,
  getPartyRequiredReadyCount,
} from '@/features/party/lib/partyEngine';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import { useHydratedPartyMembers } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyJoinRequestsPanel } from '@/features/party/components/PartyJoinRequestsPanel';
import { PartyPlayerList, PartyIdentityAvatar } from '../components/PartyRoomShared';

const PARTY_MODE_DEFS = [
  {
    key: 'quiz',
    emoji: '🎵',
    nameTh: 'Music Quiz',
    nameEn: 'Music Quiz',
    hintTh: 'ทายชื่อเพลงจากคลิปเสียง',
    hintEn: 'Guess songs from audio clips',
    colorClass: 'is-quiz',
    modeType: 'quiz',
  },
  {
    key: 'vote',
    vs: true,
    nameTh: 'Vote Battle',
    nameEn: 'Vote Battle',
    hintTh: 'โหวตแบบ 1v1 ว่าชอบอะไรมากกว่า',
    hintEn: '1v1 bracket — vote your favourite',
    colorClass: 'is-vote',
    modeType: 'vote',
  },
  {
    key: 'title-guess',
    emoji: '🃏',
    nameTh: 'ทายชื่อเรื่อง',
    nameEn: 'Guess the Title',
    hintTh: 'ดูภาพ/เบาะแส แล้วทายชื่อ anime/manga',
    hintEn: 'See clues and guess anime/manga titles',
    colorClass: 'is-title-guess',
    modeType: 'title-guess',
    presetId: 'title-guess',
  },
  {
    key: 'pixel-reveal',
    emoji: '🖼️',
    nameTh: 'ปิดรูปพิกเซล',
    nameEn: 'Pixel Reveal',
    hintTh: 'ภาพถูกบังด้วยพิกเซล — ทายก่อนใครเฉลย',
    hintEn: 'Pixelated image — guess before it reveals',
    colorClass: 'is-pixel-reveal',
    modeType: 'title-guess',
    presetId: 'pixel-reveal',
  },
  {
    key: 'tierlist',
    emoji: '🏆',
    nameTh: 'Tierlist โหวต',
    nameEn: 'Tierlist Vote',
    hintTh: 'ทุกคนจัด tier พร้อมกัน แล้วเปรียบผล',
    hintEn: 'Everyone ranks together, then compare',
    colorClass: 'is-tierlist',
    modeType: 'tierlist',
  },
];

function getActiveModeKey(settings) {
  if (!settings) return 'quiz';
  if (settings.modeType === 'vote') return 'vote';
  if (settings.modeType === 'tierlist') return 'tierlist';
  if (settings.modeType === 'title-guess') {
    const pid = settings.presetId || '';
    return pid === 'pixel-reveal' || pid === 'pixel-reveal-choice' ? 'pixel-reveal' : 'title-guess';
  }
  return 'quiz';
}

function ModePickerModal({ activeModeKey, onSelect, onClose, voteOnlySelectionActive, quizOnlySelectionActive, pick }) {
  return (
    <div className="party-mode-modal-overlay" onClick={onClose}>
      <div className="party-mode-modal" role="dialog" aria-modal="true" aria-label={pick('เลือกโหมดเกม', 'Choose game mode')} onClick={(e) => e.stopPropagation()}>
        <div className="party-mode-modal-head">
          <strong>{pick('เลือกโหมดเกม', 'Choose Game Mode')}</strong>
          <button className="party-mode-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="party-mode-modal-grid">
          {PARTY_MODE_DEFS.map((mode) => {
            const isActive = mode.key === activeModeKey;
            const isDisabled = (mode.key === 'vote' && quizOnlySelectionActive) || (mode.key === 'quiz' && voteOnlySelectionActive);
            return (
              <button
                key={mode.key}
                type="button"
                className={`party-mode-modal-card party-lobby-mode-card ${mode.colorClass}${isActive ? ' is-active' : ''}${isDisabled ? ' is-disabled' : ''}`}
                onClick={() => { if (!isDisabled) { onSelect(mode); onClose(); } }}
                disabled={isDisabled}
              >
                <span className="party-mode-modal-card-top">
                  {mode.vs
                    ? <span className="party-lobby-mode-card-vs">VS</span>
                    : <span className="party-lobby-mode-card-emoji">{mode.emoji}</span>}
                  {isActive && <span className="party-mode-modal-active-badge">{pick('ใช้งานอยู่', 'Active')}</span>}
                </span>
                <span className="party-lobby-mode-card-name">{pick(mode.nameTh, mode.nameEn)}</span>
                <span className="party-mode-modal-card-hint">{pick(mode.hintTh, mode.hintEn)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Pill row used in the host-v2 game-settings card
function PillRow({ label, sublabel, options, value, onSelect, formatLabel }) {
  return (
    <div className="party-lobby-pill-row">
      <div className="party-lobby-pill-row-left">
        <span className="party-lobby-pill-row-label">{label}</span>
        {sublabel ? <span className="party-lobby-pill-row-sub">{sublabel}</span> : null}
      </div>
      <div className="party-lobby-pill-row-pills">
        {options.map((opt) => {
          const isActive = String(opt) === String(value);
          return (
            <button
              key={opt}
              type="button"
              className={`party-lobby-pill${isActive ? ' party-lobby-pill--active' : ''}`}
              onClick={() => onSelect(opt)}
            >
              {formatLabel ? formatLabel(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getResolvedPoolCopy({
  isTitleGuessMode,
  templateName,
  selectedPoolName,
  selectedPoolNameTh,
  pick,
}) {
  if (isTitleGuessMode) {
    return {
      name: pick(selectedPoolNameTh, selectedPoolName),
      label: pick('ชุดคำถาม', 'Set'),
    };
  }

  return {
    name: templateName || pick(selectedPoolNameTh, selectedPoolName),
    label: templateName ? pick('ชุดเพลง', 'Song set') : pick('คลังเพลง', 'Song pool'),
  };
}

export const PartyLobbyView = React.memo(function PartyLobbyView({
  room,
  guestToken,
  partyProfile,
  currentPreset,
  selectedPoolName,
  selectedPoolNameTh,
  currentMember,
  isHost,
  busyAction,
  onToggleReady,
  onStartMatch,
  onCloseRoom,
  hostEditor,
  pick,
}) {
  const navigate = useNavigate();
  const [showModeModal, setShowModeModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState('');
  const roomId = room?.id;
  const roomCode = String(room?.room_code || '').trim();
  const members = useHydratedPartyMembers(guestToken, partyProfile);
  const isVoteMode = room?.settings?.modeType === 'vote';
  const isTitleGuessMode = room?.settings?.modeType === 'title-guess';
  const templateName = room?.settings?.templateName || '';
  const templateCoverUrl = room?.settings?.templateCoverUrl || '';
  const titleGuessSetName = room?.settings?.titleGuessSetName || '';
  const titleGuessSetId = room?.settings?.titleGuessSetId || '';
  const titleGuessQuestionCount = Math.max(0, Number(room?.settings?.titleGuessQuestionCount || 0));
  const resolvedPool = getResolvedPoolCopy({
    isTitleGuessMode,
    templateName,
    selectedPoolName,
    selectedPoolNameTh,
    pick,
  });
  const readyCount = useMemo(() => members.filter((member) => member.is_ready).length, [members]);
  const requiredReadyCount = useMemo(() => getPartyRequiredReadyCount(members.length), [members.length]);
  const editorIsVote = hostEditor?.settings?.modeType === 'vote';
  const editorIsTierlist = hostEditor?.settings?.modeType === 'tierlist';
  const editorIsTitleGuess = hostEditor?.settings?.modeType === 'title-guess';
  const editorIsPixelReveal = editorIsTitleGuess && (hostEditor?.settings?.presetId === 'pixel-reveal' || hostEditor?.settings?.presetId === 'pixel-reveal-choice');
  const editorTemplateName = hostEditor?.settings?.templateName || '';
  const editorBattleDeckId = hostEditor?.settings?.battleDeckId || '';
  const hasSelectedTemplateSource = Boolean(hostEditor?.settings?.templateId || editorBattleDeckId);
  const voteOnlySelectionActive = Boolean(editorBattleDeckId)
    || Boolean(hostEditor?.settings?.templateId && hostEditor?.settings?.modeScope === 'vote');
  const quizOnlySelectionActive = Boolean(hostEditor?.settings?.templateId && hostEditor?.settings?.modeScope === 'quiz');
  const selectedTitleGuessSet = hostEditor?.selectedTitleGuessSet || null;
  const selectedTitleGuessSetName = selectedTitleGuessSet?.name || hostEditor?.settings?.titleGuessSetName || '';
  const selectedTitleGuessSetCoverUrl = selectedTitleGuessSet?.coverUrl || '';
  const officialTitleGuessSetOptions = useMemo(
    () => (hostEditor?.titleGuessSetOptions || []).filter((option) => option?.isOfficial),
    [hostEditor?.titleGuessSetOptions]
  );
  const selectedTitleGuessQuestionCount = Math.max(
    0,
    Number(selectedTitleGuessSet?.questionCount || hostEditor?.settings?.titleGuessQuestionCount || 0),
  );
  const activeLobbyTitleGuessSet = useMemo(() => {
    if (!titleGuessSetId) {
      return null;
    }

    return hostEditor?.titleGuessSetOptions?.find((option) => String(option.id || '') === String(titleGuessSetId)) || null;
  }, [hostEditor?.titleGuessSetOptions, titleGuessSetId]);
  const activeLobbyTitleGuessCoverUrl = activeLobbyTitleGuessSet?.coverUrl || '';
  const titleGuessStartBlocked = editorIsTitleGuess && (!String(hostEditor?.settings?.titleGuessSetId || '').trim() || selectedTitleGuessQuestionCount <= 0);
  const hostStartDisabled = busyAction === 'start' || readyCount < requiredReadyCount || titleGuessStartBlocked;
  const roomLink = useMemo(() => {
    if (!roomCode) {
      return '';
    }
    const roomPath = `/party/room/${roomCode}`;
    return typeof window !== 'undefined'
      ? new URL(roomPath, window.location.origin).toString()
      : roomPath;
  }, [roomCode]);

  useEffect(() => {
    if (!copiedInvite) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopiedInvite(''), 2200);
    return () => window.clearTimeout(timer);
  }, [copiedInvite]);

  const handleCopyInvite = async (type) => {
    const value = type === 'link' ? roomLink : roomCode;
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopiedInvite('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedInvite(type);
    } catch {
      setCopiedInvite('error');
    }
  };

  const playerBlock = (
    <div className="party-lobby-block">
      <div className="party-lobby-block-head">
        <strong>{pick('ผู้เล่นในห้อง', 'Players')}</strong>
        {members.length > 0 ? (
          <span className="party-ready-count">
            <CheckCircle2 size={12} />
            {readyCount}/{members.length} {pick('พร้อม', 'ready')}
          </span>
        ) : null}
      </div>
      <PartyPlayerList
        members={members}
        hostToken={room?.host_member_token}
        currentToken={guestToken}
        pick={pick}
      />
    </div>
  );

  const settingsSummary = (
    <div className="party-settings-summary">
      <article className="party-stat-pill">
        <strong>{pick(currentPreset.labelTh, currentPreset.label)}</strong>
        <span>{pick('โหมด', 'Mode')}</span>
      </article>
      <article className="party-stat-pill">
        <strong>{resolvedPool.name}</strong>
        <span>{resolvedPool.label}</span>
      </article>
      <article className="party-stat-pill">
        <strong>{isVoteMode ? room?.settings?.entrantCount || 8 : room?.settings?.roundCount || 10}</strong>
        <span>{isVoteMode ? pick('เพลง', 'Songs') : pick('รอบ', 'Rounds')}</span>
      </article>
      <article className="party-stat-pill">
        <strong>{room?.settings?.timePerRoundSec || 12}</strong>
        <span>{isTitleGuessMode ? pick('วิ ต่อใบ', 'Sec / clue') : pick('วิ คลิป', 'Clip')}</span>
      </article>
      {isVoteMode ? (
        <article className="party-stat-pill">
          <strong>{room?.settings?.voteSec || 10}</strong>
          <span>{pick('วิ โหวต', 'Vote')}</span>
        </article>
      ) : null}
      {isTitleGuessMode && titleGuessQuestionCount > 0 ? (
        <article className="party-stat-pill">
          <strong>{titleGuessQuestionCount}</strong>
          <span>{pick('ข้อในชุด', 'Pool size')}</span>
        </article>
      ) : null}
      <article className="party-stat-pill">
        <strong>{room?.settings?.revealSec || 12}</strong>
        <span>{pick('วิ เฉลย', 'Reveal')}</span>
      </article>
    </div>
  );

  if (isHost && hostEditor) {
    const activeKey = getActiveModeKey(hostEditor.settings);
    const activeDef = PARTY_MODE_DEFS.find((m) => m.key === activeKey) || PARTY_MODE_DEFS[0];
    const maxSeats = Math.max(8, members.length);

    return (
      <div className="party-lobby-layout--host party-lobby-host-v2">

        {/* ════════════════════════════════════════
            LEFT COLUMN
            ════════════════════════════════════════ */}
        <div className="party-lobby-col party-lobby-col--left">

          {/* ── Card 1: Game settings ── */}
          <div className="party-lobby-card">
            <div className="party-lobby-card-head">
              <span className="party-lobby-card-kicker">{pick('การตั้งค่าเกม', 'Game settings')}</span>
              <strong className="party-lobby-card-title">
                {pick(activeDef.nameTh, activeDef.nameEn)}
              </strong>
            </div>

            {/* Quiz-mode preset selector (kept as select; no pill equivalent here) */}
            {hostEditor.settings.modeType === 'quiz' ? (
              <div className="party-lobby-pill-row party-lobby-pill-row--select">
                <div className="party-lobby-pill-row-left">
                  <span className="party-lobby-pill-row-label">{pick('โหมดเกม', 'Game mode')}</span>
                </div>
                <select
                  className="pgc-select party-lobby-pill-select"
                  value={hostEditor.settings.presetId}
                  onChange={(event) => hostEditor.onChange((current) => ({
                    ...current,
                    presetId: event.target.value,
                    timePerRoundSec: Math.min(20, Number(current.timePerRoundSec || 12)),
                  }))}
                >
                  {PARTY_PRESETS.map((preset) => (
                    <option
                      key={preset.id}
                      value={preset.id}
                      disabled={Boolean(
                        hostEditor.settings.templateId
                        && hostEditor.templatePoolLoaded
                        && hostEditor.templatePresetAvailability[preset.id]
                        && !hostEditor.templatePresetAvailability[preset.id]?.compatible
                      )}
                    >
                      {pick(preset.labelTh, preset.label)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* Title-guess answer mode */}
            {editorIsTitleGuess && !editorIsPixelReveal ? (
              <div className="party-lobby-pill-row party-lobby-pill-row--select">
                <div className="party-lobby-pill-row-left">
                  <span className="party-lobby-pill-row-label">{pick('รูปแบบคำตอบ', 'Answer mode')}</span>
                </div>
                <select
                  className="pgc-select party-lobby-pill-select"
                  value={hostEditor.settings.presetId || 'title-guess'}
                  onChange={(event) => hostEditor.onChange((current) => ({
                    ...current,
                    presetId: event.target.value === 'title-guess-choice' ? 'title-guess-choice' : 'title-guess',
                  }))}
                >
                  {PARTY_TITLE_GUESS_PRESETS.filter((p) => p.id === 'title-guess' || p.id === 'title-guess-choice').map((preset) => (
                    <option key={preset.id} value={preset.id}>{pick(preset.labelTh, preset.label)}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* Pixel-reveal answer mode */}
            {editorIsPixelReveal ? (
              <div className="party-lobby-pill-row party-lobby-pill-row--select">
                <div className="party-lobby-pill-row-left">
                  <span className="party-lobby-pill-row-label">{pick('รูปแบบคำตอบ', 'Answer mode')}</span>
                </div>
                <select
                  className="pgc-select party-lobby-pill-select"
                  value={hostEditor.settings.presetId || 'pixel-reveal'}
                  onChange={(event) => hostEditor.onChange((current) => ({
                    ...current,
                    presetId: event.target.value === 'pixel-reveal-choice' ? 'pixel-reveal-choice' : 'pixel-reveal',
                  }))}
                >
                  {PARTY_TITLE_GUESS_PRESETS.filter((p) => p.id === 'pixel-reveal' || p.id === 'pixel-reveal-choice').map((preset) => (
                    <option key={preset.id} value={preset.id}>{pick(preset.labelTh, preset.label)}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {/* Number of rounds / entrants — hidden for tierlist */}
            {!editorIsTierlist ? (
              <PillRow
                label={editorIsVote ? pick('เพลงเริ่มต้น', 'Starting songs') : pick('จำนวนรอบ', 'Number of rounds')}
                sublabel={editorIsVote ? null : pick('รอบมากขึ้น = นานขึ้น', 'More rounds = longer match')}
                options={editorIsVote ? hostEditor.voteEntrantOptions : editorIsTitleGuess ? hostEditor.titleGuessRoundOptions : hostEditor.quizRoundOptions}
                value={editorIsVote ? hostEditor.settings.entrantCount : hostEditor.settings.roundCount}
                onSelect={(v) => hostEditor.onChange((current) => (
                  editorIsVote
                    ? { ...current, entrantCount: Number(v) }
                    : { ...current, roundCount: Number(v) }
                ))}
              />
            ) : null}

            {/* Time per pick — hidden for tierlist */}
            {!editorIsTierlist ? (
              <PillRow
                label={editorIsVote ? pick('เวลาต่อเพลง', 'Time per song') : editorIsTitleGuess ? pick('เวลาต่อใบ', 'Time per clue') : pick('เวลาต่อคลิป', 'Time per pick')}
                options={hostEditor.clipTimeOptions}
                value={hostEditor.settings.timePerRoundSec}
                onSelect={(v) => hostEditor.onChange((current) => ({ ...current, timePerRoundSec: Number(v) }))}
                formatLabel={(v) => `${v}s`}
              />
            ) : null}

            {/* Reveal time — hidden for tierlist (tierlist has its own below) */}
            {!editorIsTierlist ? (
              <PillRow
                label={pick('เวลาเฉลย', 'Reveal time')}
                options={[6, 8, 10, 12, 15, 20]}
                value={hostEditor.settings.revealSec}
                onSelect={(v) => hostEditor.onChange((current) => ({ ...current, revealSec: Number(v) }))}
                formatLabel={(v) => `${v}s`}
              />
            ) : null}

            {/* Vote time for vote mode */}
            {editorIsVote ? (
              <PillRow
                label={pick('เวลาโหวต', 'Vote time')}
                options={[5, 8, 10, 12, 15, 20]}
                value={hostEditor.settings.voteSec}
                onSelect={(v) => hostEditor.onChange((current) => ({ ...current, voteSec: Number(v) }))}
                formatLabel={(v) => `${v}s`}
              />
            ) : null}

            {editorIsVote ? (
              <PillRow
                label={pick('เวลาเล่นคลิป', 'Clip playback')}
                sublabel={pick('เลือก preview หรือเล่นจนจบ', 'Choose preview or play until the clip ends')}
                options={PARTY_VOTE_PLAYBACK_MODES.map((mode) => mode.id)}
                value={hostEditor.settings.clipPlaybackMode || 'preview'}
                onSelect={(v) => hostEditor.onChange((current) => ({ ...current, clipPlaybackMode: v }))}
                formatLabel={(v) => {
                  const mode = PARTY_VOTE_PLAYBACK_MODES.find((item) => item.id === v);
                  return mode ? pick(mode.labelTh, mode.label) : v;
                }}
              />
            ) : null}

            {/* Tierlist-specific timing */}
            {editorIsTierlist ? (
              <>
                <PillRow
                  label={pick('เวลาโหวต', 'Vote time')}
                  options={[5, 8, 10, 12, 15, 20, 25, 30]}
                  value={hostEditor.settings.tierlistVoteSec || 12}
                  onSelect={(v) => hostEditor.onChange((current) => ({ ...current, tierlistVoteSec: Number(v) }))}
                  formatLabel={(v) => `${v}s`}
                />
                <PillRow
                  label={pick('เวลาเฉลย', 'Reveal time')}
                  options={[3, 4, 5, 7, 10, 15]}
                  value={hostEditor.settings.tierlistRevealSec || 5}
                  onSelect={(v) => hostEditor.onChange((current) => ({ ...current, tierlistRevealSec: Number(v) }))}
                  formatLabel={(v) => `${v}s`}
                />
              </>
            ) : null}

            {/* Song pool selector (non-template, non-title-guess, non-tierlist) */}
            {!editorIsTierlist && !editorIsTitleGuess && !hasSelectedTemplateSource ? (
              <div className="party-lobby-pill-row party-lobby-pill-row--select">
                <div className="party-lobby-pill-row-left">
                  <span className="party-lobby-pill-row-label">{pick('คลังเพลง', 'Song pool')}</span>
                </div>
                <select
                  className="pgc-select party-lobby-pill-select"
                  value={hostEditor.songPoolSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.startsWith('preset:')) {
                      const presetId = Number(value.replace('preset:', '')) || 0;
                      const preset = hostEditor.songPresetOptions.find((item) => item.id === presetId);
                      hostEditor.onChange((current) => ({
                        ...current,
                        categoryId: 'all',
                        songPresetId: preset ? String(preset.id) : '',
                        songPresetName: preset?.name || '',
                      }));
                      return;
                    }
                    hostEditor.onChange((current) => ({ ...current, categoryId: value, songPresetId: '', songPresetName: '' }));
                  }}
                >
                  {PARTY_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{pick(option.labelTh, option.label)}</option>
                  ))}
                  {hostEditor.songPresetOptions.length > 0 ? (
                    <optgroup label={pick('ชุดเพลง', 'Song presets')}>
                      {hostEditor.songPresetOptions.map((option) => (
                        <option key={option.id} value={`preset:${option.id}`}>{option.name}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </div>
            ) : null}

            {/* From-template / from-battle-deck pill */}
            {!editorIsTierlist && !editorIsTitleGuess && hasSelectedTemplateSource ? (
              <div className="party-lobby-pill-row">
                <div className="party-lobby-pill-row-left">
                  <span className="party-lobby-pill-row-label">{pick('คลังเพลง', 'Song pool')}</span>
                </div>
                <span className="party-host-pill-muted">{editorBattleDeckId ? pick('จาก Battle Deck', 'From Battle Deck') : pick('จากเทมเพลต', 'From template')}</span>
              </div>
            ) : null}

            {/* Alert: tierlist needs template */}
            {editorIsTierlist && !hostEditor.settings.tierlistTemplateId ? (
              <div className="party-host-settings-alert is-info">
                {pick('กดปุ่ม "เลือก" เพื่อเลือกเทมเพลต Tierlist (แสดงเฉพาะที่มีไอเทมพร้อมเล่น)', 'Tap "Browse" to pick a Tierlist template (only playable ones shown)')}
              </div>
            ) : null}

            {/* Alert: template compatibility */}
            {hostEditor.settings.templateId && hostEditor.templateCompatibility ? (
              <div className="party-host-settings-alert is-info">
                {`${hostEditor.templateCompatibility.playableSongCount} playable | ${hostEditor.templateCompatibility.choiceEligibleCount} choice-ready`}
              </div>
            ) : null}

            {/* Alert: title-guess set info */}
            {editorIsTitleGuess && selectedTitleGuessSet ? (
              <div className="party-host-settings-alert is-info">
                {selectedTitleGuessSet.description || pick(`${selectedTitleGuessQuestionCount} ข้อในชุดนี้`, `${selectedTitleGuessQuestionCount} questions ready`)}
              </div>
            ) : null}

            {/* Alert: title-guess sets loading */}
            {editorIsTitleGuess && hostEditor.titleGuessSetsLoading ? (
              <div className="party-host-settings-alert is-info">
                {pick('กำลังโหลดชุดทายชื่อเรื่อง...', 'Loading Guess the Title sets...')}
              </div>
            ) : null}

            {/* Alert: no title-guess sets available */}
            {editorIsTitleGuess && !hostEditor.titleGuessSetsLoading && officialTitleGuessSetOptions.length === 0 ? (
              <div className="party-host-settings-alert is-info">
                {pick('ยังไม่มีชุดคำถามทางการให้เลือกในตอนนี้', 'No official question sets are available right now.')}
              </div>
            ) : null}

            {/* Reset / autosave */}
            {hostEditor.hasPendingChanges ? (
              <div className="party-host-settings-actions">
                <Button variant="outline" onClick={hostEditor.onReset} disabled={hostEditor.isSaving}>
                  {pick('ยกเลิก', 'Reset')}
                </Button>
                <span className="party-host-autosave-hint">
                  {hostEditor.isSaving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึกอัตโนมัติ', 'Auto-saving')}
                </span>
              </div>
            ) : null}
          </div>

          {/* ── Card 2: Mode & content ── */}
          <div className="party-lobby-card">
            <div className="party-lobby-card-head">
              <span className="party-lobby-card-kicker">{pick('โหมดเกม', 'Game mode')}</span>
              <strong className="party-lobby-card-title">{pick('เลือกโหมด', 'Which mode?')}</strong>
            </div>

            {/* Mode picker row */}
            <button
              type="button"
              className={`party-mode-picker-btn party-lobby-mode-card ${activeDef.colorClass} is-active party-lobby-mode-picker-v2`}
              onClick={() => setShowModeModal(true)}
            >
              <span className="party-mode-picker-btn-left">
                {activeDef.vs
                  ? <span className="party-lobby-mode-card-vs">VS</span>
                  : <span className="party-lobby-mode-card-emoji">{activeDef.emoji}</span>}
                <span>
                  <span className="party-lobby-mode-card-name">{pick(activeDef.nameTh, activeDef.nameEn)}</span>
                  <span className="party-mode-picker-btn-hint">{pick(activeDef.hintTh, activeDef.hintEn)}</span>
                </span>
              </span>
              <ChevronRight size={16} className="party-mode-picker-btn-chevron" />
            </button>

            {/* Content selection block */}
            {editorIsTierlist ? (
              <div className="party-lobby-content-block">
                <div className="party-lobby-content-copy">
                  <span className="party-lobby-card-kicker">{pick('เทมเพลต Tierlist', 'Tierlist Template')}</span>
                  <strong>
                    {hostEditor.settings.tierlistTemplateId
                      ? (hostEditor.settings.tierlistTemplateName || pick('เลือกแล้ว', 'Selected'))
                      : pick('ยังไม่ได้เลือก', 'Not selected')}
                  </strong>
                  {hostEditor.settings.tierlistItemCount > 0 && (
                    <span className="party-lobby-content-meta">
                      {pick(`${hostEditor.settings.tierlistItemCount} ไอเทม`, `${hostEditor.settings.tierlistItemCount} items`)}
                    </span>
                  )}
                </div>
                <div className="party-lobby-content-actions">
                  <Button
                    variant="primary"
                    className="party-gradient-action party-host-template-hero-btn"
                    onClick={() => navigate(`/party/templates?returnTo=${encodeURIComponent(`/party/room/${room?.room_code || ''}`)}&mode=tierlist`)}
                  >
                    {hostEditor.settings.tierlistTemplateId ? pick('เปลี่ยน', 'Change') : pick('เลือก', 'Browse')}
                  </Button>
                  {hostEditor.settings.tierlistTemplateId ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        hostEditor.onChange((current) => ({
                          ...current,
                          tierlistTemplateId: '',
                          tierlistTemplateName: '',
                          tierlistTemplateCoverUrl: '',
                          tierlistItemCount: 0,
                          tierlistRows: [],
                        }));
                      }}
                    >
                      {pick('ล้าง', 'Clear')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : editorIsTitleGuess ? (
              <div className="party-lobby-content-block">
                {selectedTitleGuessSetCoverUrl ? (
                  <div className="party-lobby-content-thumb" aria-hidden="true">
                    <img src={selectedTitleGuessSetCoverUrl} alt="" loading="lazy" decoding="async" />
                  </div>
                ) : (
                  <div className="party-lobby-content-thumb party-lobby-content-thumb--empty" aria-hidden="true">
                    <span>🃏</span>
                  </div>
                )}
                <div className="party-lobby-content-copy">
                  <span className="party-lobby-card-kicker">{pick('ชุดคำถาม', 'Question set')}</span>
                  <strong>{selectedTitleGuessSetName || pick('ยังไม่ได้เลือก', 'Not selected')}</strong>
                  <span className="party-lobby-content-meta">
                    {selectedTitleGuessQuestionCount > 0
                      ? pick(`${selectedTitleGuessQuestionCount} ข้อพร้อมเล่น`, `${selectedTitleGuessQuestionCount} ready questions`)
                      : pick('เลือกชุดก่อนเริ่ม', 'Pick a set before starting')}
                  </span>
                  {/* Official title-guess set dropdown */}
                  <select
                    className="pgc-select party-lobby-content-set-select"
                    value={hostEditor.settings.titleGuessSetId || ''}
                    disabled={hostEditor.titleGuessSetsLoading}
                    onChange={(event) => {
                      const nextId = String(event.target.value || '').trim();
                      const selectedSet = officialTitleGuessSetOptions.find((item) => String(item.id || '') === nextId);
                      hostEditor.onChange((current) => ({
                        ...current,
                        titleGuessSetId: nextId,
                        titleGuessSetName: selectedSet?.name || '',
                        titleGuessQuestionCount: Number(selectedSet?.questionCount || 0),
                        roundCount: selectedSet
                          ? Math.min(Math.max(1, Number(current.roundCount || 10)), Math.max(1, Number(selectedSet.questionCount || 1)))
                          : current.roundCount,
                      }));
                    }}
                  >
                    <option value="">
                      {hostEditor.titleGuessSetsLoading
                        ? pick('กำลังโหลด...', 'Loading...')
                        : pick('เลือกชุดทางการ', 'Choose an official set')}
                    </option>
                    {officialTitleGuessSetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.questionCount > 0
                          ? `${option.name} (${option.questionCount})`
                          : `${option.name} (${pick('ยังไม่มีข้อ', 'no questions yet')})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="party-lobby-content-actions">
                  <Button
                    variant="primary"
                    className="party-gradient-action party-host-template-hero-btn"
                    onClick={() => navigate(`/party/templates?returnTo=${encodeURIComponent(`/party/room/${room?.room_code || ''}`)}&mode=title-guess`)}
                  >
                    {selectedTitleGuessSet ? pick('เปลี่ยนชุด', 'Change set') : pick('เลือกชุด', 'Browse sets')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/party/templates/create?mode=title-guess&returnTo=${encodeURIComponent(`/party/room/${room?.room_code || ''}`)}`)}
                  >
                    {pick('สร้างชุดใหม่', 'Create new')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="party-lobby-content-block">
                {(editorTemplateName || editorBattleDeckId) && (
                  <div className="party-lobby-content-thumb party-lobby-content-thumb--empty" aria-hidden="true">
                    <span>🎵</span>
                  </div>
                )}
                <div className="party-lobby-content-copy">
                  <span className="party-lobby-card-kicker">
                    {editorBattleDeckId ? pick('Battle Deck', 'Battle Deck') : pick('ชุดเพลง', 'Song set')}
                  </span>
                  <strong>
                    {editorBattleDeckId
                      ? (editorTemplateName || pick('เลือกแล้ว', 'Selected'))
                      : hostEditor.settings.templateId
                        ? (editorTemplateName || pick('เลือกแล้ว', 'Selected'))
                        : pick('ยังไม่ได้เลือก (ไม่บังคับ)', 'Not selected (optional)')}
                  </strong>
                </div>
                <div className="party-lobby-content-actions">
                  <Button
                    variant="primary"
                    className="party-gradient-action party-host-template-hero-btn"
                    onClick={() => navigate(`/party/templates?returnTo=${encodeURIComponent(`/party/room/${room?.room_code || ''}`)}&mode=${encodeURIComponent(hostEditor.settings.modeType || 'all')}`)}
                  >
                    {hasSelectedTemplateSource ? pick('เปลี่ยน', 'Change') : pick('เลือก', 'Browse')}
                  </Button>
                  {hasSelectedTemplateSource ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        hostEditor.onChange((current) => ({
                          ...current,
                          templateId: '',
                          templateName: '',
                          templateCoverUrl: '',
                          templatePlayableCount: 0,
                          modeScope: 'all',
                          battleDeckId: '',
                        }));
                        if (hostEditor.onClearBattleDeck) {
                          hostEditor.onClearBattleDeck();
                        }
                      }}
                    >
                      {pick('ล้าง', 'Clear')}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* ── Card 3: Vibes & access ── */}
          <div className="party-lobby-card">
            <div className="party-lobby-card-head">
              <span className="party-lobby-card-kicker">{pick('กฎห้อง', 'Room rules')}</span>
              <strong className="party-lobby-card-title">{pick('ไวบ์และการเข้าถึง', 'Vibes & access')}</strong>
            </div>

            <label className="party-lobby-toggle-row">
              <div className="party-lobby-toggle-copy">
                <strong>{pick('คะแนนเรียลไทม์', 'Live scores')}</strong>
                <span>{pick('แสดงคะแนนระหว่างเกม', 'Show scores during rounds')}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hostEditor.settings.showLiveScores}
                className={`party-lobby-toggle${hostEditor.settings.showLiveScores ? ' party-lobby-toggle--on' : ''}`}
                onClick={() => hostEditor.onChange((current) => ({ ...current, showLiveScores: !current.showLiveScores }))}
              >
                <span className="party-lobby-toggle-thumb" />
              </button>
            </label>

            <label className="party-lobby-toggle-row">
              <div className="party-lobby-toggle-copy">
                <strong>{editorIsTitleGuess ? pick('สุ่มลำดับคำถาม', 'Shuffle question order') : pick('สุ่มเพลง', 'Shuffle songs')}</strong>
                <span>{pick('เล่นสุ่มแทนเรียงลำดับ', 'Play in random order')}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hostEditor.settings.randomOrder}
                className={`party-lobby-toggle${hostEditor.settings.randomOrder ? ' party-lobby-toggle--on' : ''}`}
                onClick={() => hostEditor.onChange((current) => ({ ...current, randomOrder: !current.randomOrder }))}
              >
                <span className="party-lobby-toggle-thumb" />
              </button>
            </label>

            {editorIsVote ? (
              <label className="party-lobby-toggle-row">
                <div className="party-lobby-toggle-copy">
                  <strong>{pick('เล่นเต็มคลิป', 'Full clip playback')}</strong>
                  <span>{pick('เล่นเพลงเต็มแทน preview', 'Play full clip instead of preview')}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hostEditor.settings.clipPlaybackMode === 'full'}
                  className={`party-lobby-toggle${hostEditor.settings.clipPlaybackMode === 'full' ? ' party-lobby-toggle--on' : ''}`}
                  onClick={() => hostEditor.onChange((current) => ({
                    ...current,
                    clipPlaybackMode: current.clipPlaybackMode === 'full' ? 'preview' : 'full',
                  }))}
                >
                  <span className="party-lobby-toggle-thumb" />
                </button>
              </label>
            ) : null}
          </div>
        </div>

        {/* ════════════════════════════════════════
            CENTER COLUMN
            ════════════════════════════════════════ */}
        <div className="party-lobby-col party-lobby-col--center">

          {/* Invite card */}
          <div className="party-lobby-card party-lobby-invite-card">
            <div className="party-lobby-card-head">
              <span className="party-lobby-card-kicker">{pick('ชวนเพื่อน', 'Invite')}</span>
              <strong className="party-lobby-card-title">{pick('ส่งรหัสเข้าห้อง', 'Share the room')}</strong>
            </div>
            <div className="party-lobby-invite-main">
              <div className="party-lobby-room-code" aria-label={pick('รหัสห้อง', 'Room code')}>
                <span>{pick('รหัสห้อง', 'Room code')}</span>
                <strong>{roomCode || '------'}</strong>
              </div>
              {roomId ? <PartyJoinRequestsPanel roomId={roomId} pick={pick} variant="popover" /> : null}
            </div>
            <div className="party-lobby-invite-actions">
              <button
                type="button"
                className="party-lobby-copy-button"
                onClick={() => void handleCopyInvite('link')}
                disabled={!roomLink}
              >
                <Link2 size={14} />
                {copiedInvite === 'link' ? pick('คัดลอกแล้ว', 'Copied') : pick('คัดลอกลิงก์', 'Copy link')}
              </button>
              <button
                type="button"
                className="party-lobby-copy-button party-lobby-copy-button--quiet"
                onClick={() => void handleCopyInvite('code')}
                disabled={!roomCode}
              >
                <Copy size={14} />
                {copiedInvite === 'code' ? pick('คัดลอกแล้ว', 'Copied') : pick('คัดลอกรหัส', 'Copy code')}
              </button>
            </div>
            <span className="party-lobby-copy-status" aria-live="polite">
              {copiedInvite === 'error'
                ? pick('คัดลอกไม่สำเร็จ ลองใช้รหัสห้องแทน', 'Copy failed. Share the room code instead.')
                : pick('ผู้เล่นเข้าด้วยลิงก์หรือรหัสนี้ได้ทันที', 'Players can join with this link or code.')}
            </span>
          </div>

          {/* Launch banner */}
          <div className="party-lobby-launch-banner">
            <div className="party-lobby-launch-banner-inner">
              <div className="party-lobby-launch-left">
                <span className="party-lobby-launch-kicker">{pick('พร้อมเริ่มแล้ว', 'Ready to launch')}</span>
                <strong className="party-lobby-launch-heading">
                  {pick(
                    `${readyCount} จาก ${members.length} คนพร้อม · ${members.length - readyCount} ยังเลือกอยู่`,
                    `${readyCount} of ${members.length} players ready · ${members.length - readyCount} still picking`,
                  )}
                </strong>
              </div>
              <div className="party-lobby-launch-right">
                <button
                  type="button"
                  className="party-lobby-start-pill"
                  onClick={onStartMatch}
                  disabled={hostStartDisabled}
                >
                  {busyAction === 'start'
                    ? pick('กำลังเตรียม…', 'Starting…')
                    : <><Play size={15} fill="currentColor" />{pick('เริ่มเกม', 'Start Game')}</>}
                </button>
                <button
                  type="button"
                  className="party-lobby-ghost-pill party-lobby-ghost-pill--danger"
                  onClick={onCloseRoom}
                  disabled={busyAction === 'close'}
                >
                  {pick('ปิดห้อง', 'Close room')}
                </button>
              </div>
            </div>
            {titleGuessStartBlocked ? (
              <span className="party-host-start-note party-lobby-launch-note">
                {pick('เลือกชุดทายชื่อเรื่องก่อนเริ่มเกม', 'Choose a Guess the Title set before starting')}
              </span>
            ) : null}
          </div>

          {/* Players card */}
          <div className="party-lobby-card">
            <div className="party-lobby-card-head">
              <span className="party-lobby-card-kicker">
                {pick(`ผู้เล่น · ${members.length}/8`, `Players · ${members.length}/8`)}
              </span>
              <strong className="party-lobby-card-title">{pick('ใครอยู่ในห้องบ้าง', "Who's in")}</strong>
            </div>

            {/* Ready summary row */}
            <div className="party-lobby-ready-summary">
              <span className="party-lobby-ready-summary-left">
                <span className="party-lobby-ready-dot party-lobby-ready-dot--green" />
                <span>{readyCount} {pick('พร้อม', 'ready')}</span>
                <span className="party-lobby-ready-dot-sep">·</span>
                <span className="party-lobby-ready-dot party-lobby-ready-dot--amber" />
                <span>{members.length - readyCount} {pick('ยังไม่พร้อม', 'not ready')}</span>
              </span>
              <span className="party-lobby-ready-needed">
                {pick(`ต้องพร้อมอย่างน้อย ${requiredReadyCount} คน`, `${requiredReadyCount} needed to start`)}
              </span>
            </div>

            {/* Seat grid */}
            <div className="party-lobby-seat-grid">
              {Array.from({ length: maxSeats }).map((_, idx) => {
                const member = members[idx];
                if (!member) {
                  return (
                    <div key={`empty-${idx}`} className="party-lobby-seat party-lobby-seat--empty">
                      <span className="party-lobby-seat-num">{pick(`ที่นั่ง ${idx + 1}`, `SEAT ${idx + 1}`)}</span>
                      <span className="party-lobby-seat-waiting">{pick('รอผู้เล่น…', 'Waiting…')}</span>
                    </div>
                  );
                }
                const isHostMember = String(member.member_token || '') === String(room?.host_member_token || '');
                const isSelf = String(member.member_token || '') === String(guestToken || '');
                return (
                  <div key={member.id || member.member_token} className={`party-lobby-seat${member.is_ready ? ' party-lobby-seat--ready' : ''}`}>
                    <span className="party-lobby-seat-num">{pick(`ที่นั่ง ${idx + 1}`, `SEAT ${idx + 1}`)}</span>
                    <div className="party-lobby-seat-avatar">
                      <PartyIdentityAvatar
                        profile={{
                          displayName: member.display_name,
                          avatarKey: member.avatar_key,
                          avatarUrl: member.avatar_url,
                        }}
                      />
                    </div>
                    <div className="party-lobby-seat-info">
                      <strong className="party-lobby-seat-name">
                        {member.display_name || pick('ผู้เล่น', 'Player')}
                        {isSelf ? ` ${pick('(คุณ)', '(You)')}` : ''}
                        {isHostMember ? (
                          <span className="party-lobby-seat-host-badge">{pick('โฮสต์', 'HOST')}</span>
                        ) : null}
                      </strong>
                      <span className={`party-lobby-seat-status${member.is_ready ? ' is-ready' : ' is-waiting'}`}>
                        {member.is_ready
                          ? `● ${pick('พร้อม', 'READY')}`
                          : `● ${pick('รอกดพร้อม…', 'WAITING…')}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Launch banner */}
          <div className="party-lobby-launch-banner">
            <div className="party-lobby-launch-banner-inner">
              <div className="party-lobby-launch-left">
                <span className="party-lobby-launch-kicker">{pick('พร้อมเริ่มแล้ว', 'Ready to launch')}</span>
                <strong className="party-lobby-launch-heading">
                  {pick(
                    `${readyCount} จาก ${members.length} คนพร้อม · ${members.length - readyCount} ยังเลือกอยู่`,
                    `${readyCount} of ${members.length} players ready · ${members.length - readyCount} still picking`,
                  )}
                </strong>
              </div>
              <div className="party-lobby-launch-right">
                <button
                  type="button"
                  className="party-lobby-start-pill"
                  onClick={onStartMatch}
                  disabled={hostStartDisabled}
                >
                  {busyAction === 'start'
                    ? pick('กำลังเตรียม…', 'Starting…')
                    : <><Play size={15} fill="currentColor" />{pick('เริ่มเกม', 'Start Game')}</>}
                </button>
              </div>
            </div>
            {titleGuessStartBlocked ? (
              <span className="party-host-start-note party-lobby-launch-note">
                {pick('เลือกชุดทายชื่อเรื่องก่อนเริ่มเกม', 'Choose a Guess the Title set before starting')}
              </span>
            ) : null}
            <div className="party-lobby-launch-footer">
              <button
                type="button"
                className="party-lobby-ghost-pill party-lobby-ghost-pill--danger"
                onClick={onCloseRoom}
                disabled={busyAction === 'close'}
              >
                {pick('ปิดห้อง', 'Close room')}
              </button>
            </div>
          </div>
        </div>

        {/* Mode picker modal — unchanged */}
        {showModeModal && (
          <ModePickerModal
            activeModeKey={getActiveModeKey(hostEditor.settings)}
            onSelect={(mode) => {
              if (mode.modeType === 'title-guess') {
                hostEditor.onChange((current) => ({
                  ...current,
                  modeType: 'title-guess',
                  presetId: mode.presetId || 'title-guess',
                  timePerRoundSec: Math.min(10, Math.max(4, Number(current.timePerRoundSec || 7))),
                  revealSec: Math.max(8, Number(current.revealSec || 12)),
                }));
              } else if (mode.modeType === 'quiz') {
                hostEditor.onChange((current) => ({
                  ...current,
                  modeType: 'quiz',
                  timePerRoundSec: Math.min(20, Number(current.timePerRoundSec || 12)),
                }));
              } else if (mode.modeType === 'vote') {
                hostEditor.onChange((current) => ({ ...current, modeType: 'vote' }));
              } else if (mode.modeType === 'tierlist') {
                hostEditor.onChange((current) => ({ ...current, modeType: 'tierlist' }));
              }
            }}
            onClose={() => setShowModeModal(false)}
            voteOnlySelectionActive={voteOnlySelectionActive}
            quizOnlySelectionActive={quizOnlySelectionActive}
            pick={pick}
          />
        )}
      </div>
    );
  }

  return (
    <div className="party-lobby-layout--guest">
      <div className="party-lobby-section">
        {playerBlock}
      </div>

      <div className="party-lobby-section">
        <div className="party-lobby-block">
          <div className="party-lobby-block-head">
            <strong>{pick('การตั้งค่าห้อง', 'Room settings')}</strong>
          </div>
          {isTitleGuessMode && titleGuessSetName ? (
            <div className="party-lobby-template-banner party-lobby-template-banner--title-guess">
              <div className="party-lobby-template-cover party-lobby-template-cover--title-guess" aria-hidden="true">
                {activeLobbyTitleGuessCoverUrl ? (
                  <img
                    className="party-lobby-template-cover-image"
                    src={activeLobbyTitleGuessCoverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span>🃏</span>
                )}
              </div>
              <div>
                <strong>{titleGuessSetName}</strong>
                <span>{pick('ชุดทายชื่อเรื่อง', 'Guess the Title set')}</span>
              </div>
            </div>
          ) : templateName ? (
            <div className="party-lobby-template-banner">
              <div className="party-lobby-template-cover" aria-hidden="true">
                {templateCoverUrl ? (
                  <img
                    className="party-lobby-template-cover-image"
                    src={getTemplateCoverUrl(templateCoverUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
              </div>
              <div>
                <strong>{templateName}</strong>
                <span>{pick('ชุดเพลง', 'Song set')}</span>
              </div>
            </div>
          ) : null}
          {settingsSummary}
        </div>

        <div className="party-lobby-start-panel">
          <Button
            variant={currentMember?.is_ready ? 'outline' : 'primary'}
            className={!currentMember?.is_ready ? 'party-start-btn' : ''}
            onClick={onToggleReady}
            disabled={busyAction === 'ready'}
          >
            {pick('พร้อม', 'Ready')}
          </Button>
          {currentMember?.is_ready ? (
            <span className="party-answer-note">
              <CheckCircle2 size={14} />
              {pick('พร้อมแล้ว รอโฮสต์เริ่มเกม', 'Ready. Waiting for host.')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
});
