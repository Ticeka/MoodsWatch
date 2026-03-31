import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { getPartyRequiredReadyCount } from '@/features/party/lib/partyEngine';
import { getTemplateCoverUrl } from '@/features/party/lib/partyTemplateUtils';
import { useHydratedPartyMembers } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyPlayerList } from './PartyRoomShared';

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
  pick,
}) {
  const members = useHydratedPartyMembers(guestToken, partyProfile);
  const isVoteMode = room?.settings?.modeType === 'vote';
  const templateName = room?.settings?.templateName || '';
  const templateCoverUrl = room?.settings?.templateCoverUrl || '';
  const resolvedPoolName = templateName || pick(selectedPoolNameTh, selectedPoolName);
  const readyCount = useMemo(
    () => members.filter((member) => member.is_ready).length,
    [members]
  );
  const requiredReadyCount = useMemo(
    () => getPartyRequiredReadyCount(members.length),
    [members.length]
  );

  return (
    <div className="party-lobby-layout">
      <div className="party-lobby-section">
        <div className="party-lobby-block">
          <div className="party-lobby-block-head">
            <strong>{pick('ผู้เล่นในห้อง', 'Players')}</strong>
            <span>{pick('ทุกคนกด Ready ก่อน แล้ว host ค่อยเริ่ม', 'Everyone hits Ready, then the host starts.')}</span>
          </div>
          <PartyPlayerList members={members} hostToken={room?.host_member_token} currentToken={guestToken} pick={pick} />
        </div>
      </div>

      <div className="party-lobby-section">
        <div className="party-lobby-block">
          <div className="party-lobby-block-head">
            <strong>{pick('การตั้งค่าห้อง', 'Room settings')}</strong>
            <span>
              {isVoteMode
                ? pick('ฟังสองเพลงแล้วโหวต เพลงแพ้จะตกรอบทันที', 'Listen to both tracks, vote, and eliminate the loser.')
                : pick('กติกาในแมตช์นี้', 'Rules for this match')}
            </span>
          </div>
          {templateName ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                borderRadius: '1rem',
                background: 'rgba(var(--color-primary-rgb), 0.08)',
                border: '1px solid rgba(var(--color-primary-rgb), 0.22)',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '0.85rem',
                  backgroundImage: `url(${getTemplateCoverUrl(templateCoverUrl)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: 'rgba(var(--color-primary-rgb), 0.12)',
                  border: '1px solid rgba(var(--color-primary-rgb), 0.25)',
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{templateName}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}>{pick('Template ที่เลือกสำหรับห้องนี้', 'Selected template for this room')}</span>
              </div>
            </div>
          ) : null}
          <div className="party-settings-summary">
            <article className="party-stat-pill"><strong>{pick(currentPreset.labelTh, currentPreset.label)}</strong><span>{pick('โหมด', 'preset')}</span></article>
            <article className="party-stat-pill"><strong>{resolvedPoolName}</strong><span>{templateName ? pick('เทมเพลต', 'template') : pick('คลังเพลง', 'pool')}</span></article>
            <article className="party-stat-pill"><strong>{isVoteMode ? room?.settings?.entrantCount || 8 : room?.settings?.roundCount || 10}</strong><span>{isVoteMode ? pick('เพลง', 'songs') : pick('รอบ', 'rounds')}</span></article>
            <article className="party-stat-pill"><strong>{room?.settings?.timePerRoundSec || 12}</strong><span>{pick('วิ คลิป', 'clip sec')}</span></article>
            {isVoteMode ? (
              <article className="party-stat-pill">
                <strong>{room?.settings?.clipPlaybackMode === 'full' ? pick('เล่นเต็ม', 'Full clip') : pick('คลิปตัวอย่าง', 'Preview clip')}</strong>
                <span>{pick('โหมดเล่น', 'playback')}</span>
              </article>
            ) : null}
            {isVoteMode ? (
              <article className="party-stat-pill"><strong>{room?.current_match?.settings?.voteSec || room?.settings?.voteSec || 10}</strong><span>{pick('วิ โหวต', 'vote sec')}</span></article>
            ) : null}
            <article className="party-stat-pill"><strong>{room?.settings?.revealSec || 12}</strong><span>{pick('วิ เฉลย', 'reveal sec')}</span></article>
            <article className="party-stat-pill"><strong>{readyCount}/{members.length}</strong><span>{pick('พร้อม', 'ready')}</span></article>
          </div>
          <div className="party-lobby-actions">
            {!isHost ? (
              <Button variant={currentMember?.is_ready ? 'outline' : 'primary'} onClick={onToggleReady} disabled={busyAction === 'ready'}>
                Ready
              </Button>
            ) : (
              <Button variant="primary" onClick={onStartMatch} disabled={busyAction === 'start' || readyCount < requiredReadyCount}>
                {busyAction === 'start' ? pick('กำลังเตรียมแมตช์...', 'Building the match...') : pick('เริ่มเกม', 'Start Game')}
              </Button>
            )}
            {isHost ? (
              <Button variant="outline" onClick={onCloseRoom} disabled={busyAction === 'close'}>
                {pick('ปิดห้อง', 'Close room')}
              </Button>
            ) : null}
            {!isHost && currentMember?.is_ready ? (
              <span className="party-answer-note">
                <CheckCircle2 size={14} />
                {pick('พร้อมแล้ว รอ host เริ่มเกม', 'Ready. Waiting for host to start.')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});



