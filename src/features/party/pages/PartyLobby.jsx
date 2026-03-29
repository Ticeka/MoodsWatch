import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { getPartyRequiredReadyCount } from '@/features/party/lib/partyEngine';
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
  const readyCount = useMemo(
    () => members.filter((member) => member.is_ready).length,
    [members]
  );
  const requiredReadyCount = useMemo(
    () => getPartyRequiredReadyCount(members.length),
    [members.length]
  );

  return (
    <div className="party-lobby-grid">
      <section className="party-lobby-panel card-modern">
        <div className="party-panel-head">
          <strong>{pick('Lobby', 'Lobby')}</strong>
          <span>{pick('ทุกคนกด Ready ก่อน แล้ว host ค่อยเริ่มเกม', 'Everyone hits Ready, then the host kicks off the match.')}</span>
        </div>
        <PartyPlayerList members={members} hostToken={room?.host_member_token} currentToken={guestToken} pick={pick} />
      </section>

      <section className="party-lobby-panel card-modern">
        <div className="party-panel-head">
          <strong>{pick('การตั้งค่าห้อง', 'Room settings')}</strong>
          <span>{pick('สรุปกติกาที่จะใช้ในแมตช์นี้', 'The rule snapshot for this match')}</span>
        </div>
        <div className="party-settings-summary">
          <article className="party-stat-pill"><strong>{pick(currentPreset.labelTh, currentPreset.label)}</strong><span>{pick('preset', 'preset')}</span></article>
          <article className="party-stat-pill"><strong>{pick(selectedPoolNameTh, selectedPoolName)}</strong><span>{pick('pool', 'pool')}</span></article>
          <article className="party-stat-pill"><strong>{room?.settings?.roundCount || 10}</strong><span>{pick('รอบ', 'rounds')}</span></article>
          <article className="party-stat-pill"><strong>{room?.settings?.timePerRoundSec || 12}</strong><span>{pick('วิเล่นเพลง', 'clip sec')}</span></article>
          <article className="party-stat-pill"><strong>{room?.settings?.revealSec || 12}</strong><span>{pick('วิเฉลย', 'reveal sec')}</span></article>
          <article className="party-stat-pill"><strong>{readyCount}/{members.length}</strong><span>{pick('พร้อม', 'ready')}</span></article>
        </div>
        <div className="party-lobby-actions">
          {!isHost ? (
            <Button variant={currentMember?.is_ready ? 'outline' : 'primary'} onClick={onToggleReady} disabled={busyAction === 'ready'}>
              Ready
            </Button>
          ) : (
            <Button variant="primary" onClick={onStartMatch} disabled={busyAction === 'start' || readyCount < requiredReadyCount}>
              {busyAction === 'start' ? pick('กำลังเตรียมแมตช์...', 'Building the match...') : pick('Start Game', 'Start Game')}
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
              {pick('พร้อมแล้ว รอ host เริ่มเกมได้เลย', 'You are ready. Waiting for the host to start.')}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
});
