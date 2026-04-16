import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import {
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  PARTY_TITLE_GUESS_PRESETS,
  getPartyRequiredReadyCount,
} from '@/features/party/lib/partyEngine';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import { useHydratedPartyMembers } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyJoinRequestsPanel } from '@/features/party/components/PartyJoinRequestsPanel';
import { PartyPlayerList } from '../components/PartyRoomShared';

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
  const roomId = room?.id;
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
    return (
      <div className="party-lobby-layout--host">
        <div className="party-lobby-section party-lobby-section--settings">
          <div className="party-lobby-block">
            <div className="party-lobby-block-head">
              <strong>{pick('การตั้งค่าห้อง', 'Room settings')}</strong>
            </div>

            <div className="party-host-settings-editor">

              {/* ── ขั้นที่ 1: เลือกโหมด ── */}
              <div className="party-setup-step">
                <div className="party-setup-step-head">
                  <span className="party-setup-step-num">1</span>
                  <strong>{pick('เลือกโหมดเกม', 'Game Mode')}</strong>
                </div>
                {(() => {
                  const activeKey = getActiveModeKey(hostEditor.settings);
                  const activeDef = PARTY_MODE_DEFS.find((m) => m.key === activeKey) || PARTY_MODE_DEFS[0];
                  return (
                    <button
                      type="button"
                      className={`party-mode-picker-btn party-lobby-mode-card ${activeDef.colorClass} is-active`}
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
                      <ChevronDown size={16} className="party-mode-picker-btn-chevron" />
                    </button>
                  );
                })()}
              </div>

              {/* ── ขั้นที่ 2: เลือกเนื้อหา ── */}
              <div className="party-setup-step">
                <div className="party-setup-step-head">
                  <span className="party-setup-step-num">2</span>
                  <strong>
                    {editorIsTitleGuess
                      ? pick('เลือกชุดคำถาม', 'Question Set')
                      : editorIsTierlist
                        ? pick('เลือกเทมเพลต', 'Template')
                        : pick('เลือกเนื้อหา', 'Content')}
                  </strong>
                </div>
                {editorIsTierlist ? (
                  <div className="party-host-template-hero">
                    <div className="party-host-template-hero-copy">
                      <span className="party-host-template-hero-kicker">{pick('เทมเพลต Tierlist', 'Tierlist Template')}</span>
                      <strong>
                        {hostEditor.settings.tierlistTemplateId
                          ? (hostEditor.settings.tierlistTemplateName || pick('เลือกแล้ว', 'Selected'))
                          : pick('ยังไม่ได้เลือก', 'Not selected')}
                      </strong>
                      {hostEditor.settings.tierlistItemCount > 0 && (
                        <span className="party-host-template-hero-meta">
                          {pick(`${hostEditor.settings.tierlistItemCount} ไอเทมพร้อมโหวต`, `${hostEditor.settings.tierlistItemCount} items ready to vote`)}
                        </span>
                      )}
                    </div>
                    <div className="party-host-template-hero-actions">
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
                  <div className="party-host-template-hero party-host-template-hero--title-guess">
                    <div className="party-host-template-hero-art" aria-hidden="true">
                      {selectedTitleGuessSetCoverUrl ? (
                        <img
                          className="party-host-template-hero-art-image"
                          src={selectedTitleGuessSetCoverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="party-host-template-hero-art-fallback">🃏</span>
                      )}
                    </div>
                    <div className="party-host-template-hero-copy">
                      <span className="party-host-template-hero-kicker">{pick('ชุดคำถาม', 'Question set')}</span>
                      <strong>
                        {selectedTitleGuessSetName || pick('ยังไม่ได้เลือก', 'Not selected')}
                      </strong>
                      <span className="party-host-template-hero-meta">
                        {selectedTitleGuessQuestionCount > 0
                          ? pick(`${selectedTitleGuessQuestionCount} ข้อพร้อมเล่น`, `${selectedTitleGuessQuestionCount} ready questions`)
                          : pick('เลือกชุดเพื่อเริ่มจัดห้อง', 'Pick a set before starting the room')}
                      </span>
                    </div>
                    <div className="party-host-title-guess-side">
                      {selectedTitleGuessSet ? (
                        <div className="party-host-title-guess-stats" aria-label={pick('ข้อมูลชุดคำถาม', 'Question set metadata')}>
                          <span>{selectedTitleGuessSet.isOfficial ? pick('ชุดทางการ', 'Official set') : (selectedTitleGuessSet.creatorName || pick('ชุดคอมมูนิตี้', 'Community set'))}</span>
                          <span>{pick(`${selectedTitleGuessSet.playCount || 0} ครั้ง`, `${selectedTitleGuessSet.playCount || 0} plays`)}</span>
                          <span>{pick(`${selectedTitleGuessSet.likeCount || 0} ถูกใจ`, `${selectedTitleGuessSet.likeCount || 0} likes`)}</span>
                        </div>
                      ) : null}
                      <div className="party-host-template-hero-actions party-host-template-hero-actions--title-guess">
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
                          {pick('สร้างชุดใหม่', 'Create new set')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="party-host-template-hero">
                    <div className="party-host-template-hero-copy">
                      <span className="party-host-template-hero-kicker">
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
                    <div className="party-host-template-hero-actions">
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

              {/* ── ขั้นที่ 3: ปรับการตั้งค่า ── */}
              <div className="party-setup-step">
                <div className="party-setup-step-head">
                  <span className="party-setup-step-num">3</span>
                  <strong>{pick('ปรับการตั้งค่า', 'Settings')}</strong>
                </div>
              <div className="party-host-settings-grid">
                {hostEditor.settings.modeType === 'quiz' ? (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('โหมดเกม', 'Game mode')}</span>
                    <select
                      className="pgc-select"
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
                  </label>
                ) : null}

                {editorIsTitleGuess && !editorIsPixelReveal ? (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('รูปแบบคำตอบ', 'Answer mode')}</span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.presetId || 'title-guess'}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        presetId: event.target.value === 'title-guess-choice' ? 'title-guess-choice' : 'title-guess',
                      }))}
                    >
                      {PARTY_TITLE_GUESS_PRESETS.filter((p) => p.id === 'title-guess' || p.id === 'title-guess-choice').map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {pick(preset.labelTh, preset.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {editorIsPixelReveal ? (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('รูปแบบคำตอบ', 'Answer mode')}</span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.presetId || 'pixel-reveal'}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        presetId: event.target.value === 'pixel-reveal-choice' ? 'pixel-reveal-choice' : 'pixel-reveal',
                      }))}
                    >
                      {PARTY_TITLE_GUESS_PRESETS.filter((p) => p.id === 'pixel-reveal' || p.id === 'pixel-reveal-choice').map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {pick(preset.labelTh, preset.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {editorIsTierlist ? null : editorIsTitleGuess ? (
                  <label className="pgc-select-field pgc-select-field--wide">
                    <span className="pgc-label">{pick('ชุดคำถาม', 'Question set')}</span>
                    <select
                      className="pgc-select"
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
                          ? pick('กำลังโหลดชุดทายชื่อเรื่อง...', 'Loading Guess the Title sets...')
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
                  </label>
                ) : hasSelectedTemplateSource ? (
                  <div className="pgc-select-field">
                    <span className="pgc-label">{pick('คลังเพลง', 'Song pool')}</span>
                    <div className="party-host-pill-muted">{editorBattleDeckId ? pick('จาก Battle Deck', 'From Battle Deck') : pick('จากเท���เพลต', 'From template')}</div>
                  </div>
                ) : (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('คลังเพลง', 'Song pool')}</span>
                    <select
                      className="pgc-select"
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

                        hostEditor.onChange((current) => ({
                          ...current,
                          categoryId: value,
                          songPresetId: '',
                          songPresetName: '',
                        }));
                      }}
                    >
                      {PARTY_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {pick(option.labelTh, option.label)}
                        </option>
                      ))}
                      {hostEditor.songPresetOptions.length > 0 ? (
                        <optgroup label={pick('ชุดเพลง', 'Song presets')}>
                          {hostEditor.songPresetOptions.map((option) => (
                            <option key={option.id} value={`preset:${option.id}`}>
                              {option.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                )}

                {!editorIsTierlist && (
                  <label className="pgc-select-field">
                    <span className="pgc-label">
                      {editorIsVote ? pick('เพลงเริ่ม', 'Songs') : pick('รอบ', 'Rounds')}
                    </span>
                    <select
                      className="pgc-select"
                      value={editorIsVote ? hostEditor.settings.entrantCount : hostEditor.settings.roundCount}
                      onChange={(event) => hostEditor.onChange((current) => (
                        editorIsVote
                          ? { ...current, entrantCount: Number(event.target.value) }
                          : { ...current, roundCount: Number(event.target.value) }
                      ))}
                    >
                      {(editorIsVote
                        ? hostEditor.voteEntrantOptions
                        : editorIsTitleGuess
                          ? hostEditor.titleGuessRoundOptions
                          : hostEditor.quizRoundOptions
                      ).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {!editorIsTierlist && (
                  <label className="pgc-select-field">
                    <span className="pgc-label">
                      {editorIsVote
                        ? pick('เวลาเพลง', 'Song time')
                        : editorIsTitleGuess
                          ? pick('เวลาแต่ละใบ', 'Clue time')
                          : pick('เวลาคลิป', 'Clip')}
                    </span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.timePerRoundSec}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        timePerRoundSec: Number(event.target.value),
                      }))}
                    >
                      {hostEditor.clipTimeOptions.map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds} {pick('วิ', 'sec')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {!editorIsTierlist && (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('เวลาเฉลย', 'Reveal')}</span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.revealSec}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        revealSec: Number(event.target.value),
                      }))}
                    >
                      {[6, 8, 10, 12, 15, 20].map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds} {pick('วิ', 'sec')}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {editorIsVote ? (
                  <label className="pgc-select-field">
                    <span className="pgc-label">{pick('เวลาโหวต', 'Vote time')}</span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.voteSec}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        voteSec: Number(event.target.value),
                      }))}
                    >
                      {[5, 8, 10, 12, 15, 20].map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds} {pick('วิ', 'sec')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {editorIsTierlist ? (
                  <>
                    <label className="pgc-select-field">
                      <span className="pgc-label">{pick('เวลาโหวต', 'Vote time')}</span>
                      <select
                        className="pgc-select"
                        value={hostEditor.settings.tierlistVoteSec || 12}
                        onChange={(event) => hostEditor.onChange((current) => ({
                          ...current,
                          tierlistVoteSec: Number(event.target.value),
                        }))}
                      >
                        {[5, 8, 10, 12, 15, 20, 25, 30].map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds} {pick('วิ', 'sec')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="pgc-select-field">
                      <span className="pgc-label">{pick('เวลาเฉลย', 'Reveal time')}</span>
                      <select
                        className="pgc-select"
                        value={hostEditor.settings.tierlistRevealSec || 5}
                        onChange={(event) => hostEditor.onChange((current) => ({
                          ...current,
                          tierlistRevealSec: Number(event.target.value),
                        }))}
                      >
                        {[3, 4, 5, 7, 10, 15].map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds} {pick('วิ', 'sec')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              {editorIsTierlist && !hostEditor.settings.tierlistTemplateId ? (
                <div className="party-host-settings-alert is-info">
                  {pick(
                    'กดปุ่ม "เลือก" ด้านบนเพื่อเลือกเทมเพลต Tierlist ที่จะใช้โหวต (แสดงเฉพาะที่มีไอเทมพร้อมเล่น)',
                    'Tap "Browse" above to pick a Tierlist template to vote on (only playable templates are shown)',
                  )}
                </div>
              ) : null}

              {hostEditor.settings.templateId && hostEditor.templateCompatibility ? (
                <div className="party-host-settings-alert is-info">
                  {`${hostEditor.templateCompatibility.playableSongCount} playable | ${hostEditor.templateCompatibility.choiceEligibleCount} choice-ready`}
                </div>
              ) : null}

              {editorIsTitleGuess && selectedTitleGuessSet ? (
                <div className="party-host-settings-alert is-info">
                  {selectedTitleGuessSet.description
                    || pick(
                      `${selectedTitleGuessQuestionCount} ข้อในชุดนี้ พร้อมเล่นใน lobby เดียวกับ party`,
                      `${selectedTitleGuessQuestionCount} questions ready to use in this room`,
                    )}
                </div>
              ) : null}

              {editorIsTitleGuess && hostEditor.titleGuessSetsLoading ? (
                <div className="party-host-settings-alert is-info">
                  {pick('กำลังโหลดชุดทายชื่อเรื่อง...', 'Loading Guess the Title sets...')}
                </div>
              ) : null}

              {editorIsTitleGuess && !hostEditor.titleGuessSetsLoading && officialTitleGuessSetOptions.length === 0 ? (
                <div className="party-host-settings-alert is-info">
                  {pick(
                    'ยังไม่มีชุดคำถามทางการให้เลือกในตอนนี้',
                    'No official question sets are available right now.',
                  )}
                </div>
              ) : null}

              <div className="party-host-toggle-grid">
                {editorIsVote ? (
                  <label className="pgc-toggle-item">
                    <input
                      type="checkbox"
                      checked={hostEditor.settings.clipPlaybackMode === 'full'}
                      onChange={(event) => hostEditor.onChange((current) => ({
                        ...current,
                        clipPlaybackMode: event.target.checked ? 'full' : 'preview',
                      }))}
                    />
                    <div className="pgc-toggle-text">
                      <strong>{pick('เล่นเต็มคลิป', 'Full clip')}</strong>
                    </div>
                  </label>
                ) : null}
                <label className="pgc-toggle-item">
                  <input
                    type="checkbox"
                    checked={hostEditor.settings.showLiveScores}
                    onChange={(event) => hostEditor.onChange((current) => ({
                      ...current,
                      showLiveScores: event.target.checked,
                    }))}
                  />
                  <div className="pgc-toggle-text">
                    <strong>{pick('คะแนนเรียลไทม์', 'Live scores')}</strong>
                  </div>
                </label>
                <label className="pgc-toggle-item">
                  <input
                    type="checkbox"
                    checked={hostEditor.settings.randomOrder}
                    onChange={(event) => hostEditor.onChange((current) => ({
                      ...current,
                      randomOrder: event.target.checked,
                    }))}
                  />
                  <div className="pgc-toggle-text">
                    <strong>{editorIsTitleGuess ? pick('สุ่มลำดับคำถาม', 'Shuffle question order') : pick('สุ่มเพลง', 'Shuffle songs')}</strong>
                  </div>
                </label>
              </div>

              {hostEditor.hasPendingChanges ? (
                <div className="party-host-settings-actions">
                  <Button
                    variant="outline"
                    onClick={hostEditor.onReset}
                    disabled={hostEditor.isSaving}
                  >
                    {pick('ยกเลิก', 'Reset')}
                  </Button>
                  {hostEditor.isSaving ? (
                    <span className="party-host-autosave-hint">{pick('กำลังบันทึก...', 'Saving...')}</span>
                  ) : (
                    <span className="party-host-autosave-hint">{pick('บันทึกอัตโนมัติ', 'Auto-saving')}</span>
                  )}
                </div>
              ) : null}
              </div>{/* end party-setup-step step-3 */}
            </div>{/* end party-host-settings-editor */}

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

            <div className="party-lobby-start-panel party-lobby-start-panel--embedded">
              <div className="party-lobby-start-panel-row">
                <div className="party-lobby-start-panel-summary">
                  {settingsSummary}
                  {room?.name ? (
                    <div className="party-lobby-start-panel-head">
                      <strong>{room.name}</strong>
                      <span>{readyCount}/{members.length} {pick('พร้อมแล้ว', 'ready')}</span>
                    </div>
                  ) : null}
                </div>
                <div className="party-lobby-start-actions">
                  <Button
                    variant="primary"
                    className="party-start-btn party-start-btn--compact"
                    onClick={onStartMatch}
                    disabled={hostStartDisabled}
                  >
                    {busyAction === 'start' ? pick('กำลังเตรียม...', 'Starting...') : pick('เริ่มเกม', 'Start Game')}
                  </Button>
                  <Button
                    variant="outline"
                    className="party-start-btn party-start-btn--compact party-start-btn--secondary"
                    onClick={onCloseRoom}
                    disabled={busyAction === 'close'}
                  >
                    {pick('ปิดห้อง', 'Close room')}
                  </Button>
                </div>
              </div>
              {titleGuessStartBlocked ? (
                <span className="party-host-start-note">
                  {pick('เลือกชุดทายชื่อเรื่องก่อนเริ่มเกม', 'Choose a Guess the Title set before starting')}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="party-lobby-section party-lobby-section--side">
          {roomId ? <PartyJoinRequestsPanel roomId={roomId} pick={pick} /> : null}
          {playerBlock}
        </div>
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
