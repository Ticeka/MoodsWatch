import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import {
  PARTY_CATEGORY_OPTIONS,
  PARTY_PRESETS,
  getPartyRequiredReadyCount,
} from '@/features/party/lib/partyEngine';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import { useHydratedPartyMembers } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyJoinRequestsPanel } from '@/features/party/components/PartyJoinRequestsPanel';
import { PartyPlayerList } from './PartyRoomShared';

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
  const roomId = room?.id;
  const members = useHydratedPartyMembers(guestToken, partyProfile);
  const isVoteMode = room?.settings?.modeType === 'vote';
  const isTitleGuessMode = room?.settings?.modeType === 'title-guess';
  const templateName = room?.settings?.templateName || '';
  const templateCoverUrl = room?.settings?.templateCoverUrl || '';
  const titleGuessSetName = room?.settings?.titleGuessSetName || '';
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
  const editorIsTitleGuess = hostEditor?.settings?.modeType === 'title-guess';
  const editorTemplateName = hostEditor?.settings?.templateName || '';
  const selectedTitleGuessSet = hostEditor?.selectedTitleGuessSet || null;
  const selectedTitleGuessSetName = selectedTitleGuessSet?.name || hostEditor?.settings?.titleGuessSetName || '';
  const selectedTitleGuessQuestionCount = Math.max(
    0,
    Number(selectedTitleGuessSet?.questionCount || hostEditor?.settings?.titleGuessQuestionCount || 0),
  );
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
              {editorIsTitleGuess ? (
                <div className="party-host-template-hero party-host-template-hero--title-guess">
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
                    <span className="party-host-template-hero-kicker">{pick('ชุดเพลง', 'Song set')}</span>
                    <strong>
                      {hostEditor.settings.templateId
                        ? (editorTemplateName || pick('เลือกแล้ว', 'Selected'))
                        : pick('ยังไม่ได้เลือก', 'Not selected')}
                    </strong>
                  </div>
                  <div className="party-host-template-hero-actions">
                    <Button
                      variant="primary"
                      className="party-gradient-action party-host-template-hero-btn"
                      onClick={() => navigate(`/party/templates?returnTo=${encodeURIComponent(`/party/room/${room?.room_code || ''}`)}&mode=${encodeURIComponent(hostEditor.settings.modeType || 'all')}`)}
                    >
                      {hostEditor.settings.templateId ? pick('เปลี่ยน', 'Change') : pick('เลือก', 'Browse')}
                    </Button>
                    {hostEditor.settings.templateId ? (
                      <Button
                        variant="outline"
                        onClick={() => hostEditor.onChange((current) => ({
                          ...current,
                          templateId: '',
                          templateName: '',
                          templateCoverUrl: '',
                          templatePlayableCount: 0,
                          modeScope: 'all',
                        }))}
                      >
                        {pick('ล้าง', 'Clear')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="party-host-mode-row">
                <button
                  type="button"
                  className={`party-lobby-mode-card is-quiz${hostEditor.settings.modeType === 'quiz' ? ' is-active' : ''}${hostEditor.settings.templateId && hostEditor.settings.modeScope === 'vote' ? ' is-disabled' : ''}`}
                  onClick={() => hostEditor.onChange((current) => ({
                    ...current,
                    modeType: 'quiz',
                    timePerRoundSec: Math.min(20, Number(current.timePerRoundSec || 12)),
                  }))}
                  disabled={hostEditor.settings.templateId && hostEditor.settings.modeScope === 'vote'}
                >
                  <span className="party-lobby-mode-card-emoji">🎵</span>
                  <span className="party-lobby-mode-card-name">Music Quiz</span>
                </button>
                <button
                  type="button"
                  className={`party-lobby-mode-card is-vote${hostEditor.settings.modeType === 'vote' ? ' is-active' : ''}${hostEditor.settings.templateId && hostEditor.settings.modeScope === 'quiz' ? ' is-disabled' : ''}`}
                  onClick={() => hostEditor.onChange((current) => ({ ...current, modeType: 'vote' }))}
                  disabled={hostEditor.settings.templateId && hostEditor.settings.modeScope === 'quiz'}
                >
                  <span className="party-lobby-mode-card-vs">VS</span>
                  <span className="party-lobby-mode-card-name">Vote Battle</span>
                </button>
                <button
                  type="button"
                  className={`party-lobby-mode-card is-title-guess${editorIsTitleGuess ? ' is-active' : ''}`}
                  onClick={() => hostEditor.onChange((current) => ({
                    ...current,
                    modeType: 'title-guess',
                    timePerRoundSec: Math.min(10, Math.max(4, Number(current.timePerRoundSec || 7))),
                    revealSec: Math.max(8, Number(current.revealSec || 12)),
                  }))}
                >
                  <span className="party-lobby-mode-card-emoji">🃏</span>
                  <span className="party-lobby-mode-card-name">{pick('ทายชื่อเรื่อง', 'Guess the Title')}</span>
                </button>
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

                {editorIsTitleGuess ? (
                  <label className="pgc-select-field pgc-select-field--wide">
                    <span className="pgc-label">{pick('ชุดคำถาม', 'Question set')}</span>
                    <select
                      className="pgc-select"
                      value={hostEditor.settings.titleGuessSetId || ''}
                      disabled={hostEditor.titleGuessSetsLoading}
                      onChange={(event) => {
                        const nextId = String(event.target.value || '').trim();
                        const selectedSet = hostEditor.titleGuessSetOptions.find((item) => String(item.id || '') === nextId);
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
                          : pick('เลือกชุดทายชื่อเรื่อง', 'Choose a Guess the Title set')}
                      </option>
                      {hostEditor.titleGuessSetOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.questionCount > 0
                            ? `${option.name} (${option.questionCount})`
                            : `${option.name} (${pick('ยังไม่มีข้อ', 'no questions yet')})`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hostEditor.settings.templateId ? (
                  <div className="pgc-select-field">
                    <span className="pgc-label">{pick('คลังเพลง', 'Song pool')}</span>
                    <div className="party-host-pill-muted">{pick('จากเทมเพลต', 'From template')}</div>
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
              </div>

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

              {editorIsTitleGuess && !hostEditor.titleGuessSetsLoading && hostEditor.titleGuessSetOptions.length === 0 ? (
                <div className="party-host-settings-alert is-info">
                  {pick(
                    'ยังไม่มีชุดทายชื่อเรื่องให้เลือก ลองกด "สร้างชุดใหม่" ด้านบนเพื่อเพิ่มชุดแรกของห้องนี้',
                    'No Guess the Title sets are available yet. Use "Create new set" above to add the first one.',
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

              <div className="party-host-settings-actions">
                <Button
                  variant="primary"
                  onClick={hostEditor.onSave}
                  disabled={
                    !hostEditor.hasPendingChanges
                    || hostEditor.isSaving
                    || (hostEditor.settings.templateId && !hostEditor.templateValidation.ok)
                    || (editorIsTitleGuess && !String(hostEditor.settings.titleGuessSetId || '').trim())
                  }
                >
                  {hostEditor.isSaving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                </Button>
                <Button
                  variant="outline"
                  onClick={hostEditor.onReset}
                  disabled={!hostEditor.hasPendingChanges || hostEditor.isSaving}
                >
                  {pick('ยกเลิก', 'Reset')}
                </Button>
              </div>
            </div>

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
                <span>🃏</span>
              </div>
              <div>
                <strong>{titleGuessSetName}</strong>
                <span>{pick('ชุดทายชื่อเรื่อง', 'Guess the Title set')}</span>
              </div>
            </div>
          ) : templateName ? (
            <div className="party-lobby-template-banner">
              <div
                className="party-lobby-template-cover"
                aria-hidden="true"
                style={{ backgroundImage: `url(${getTemplateCoverUrl(templateCoverUrl)})` }}
              />
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
