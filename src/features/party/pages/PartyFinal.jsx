import React from 'react';
import { Crown, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { usePartyLeaderboard } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyLeaderboard } from './PartyRoomShared';
import { formatFastest } from './partyRoomUtils';

export const PartyFinalView = React.memo(function PartyFinalView({
  guestToken,
  partyProfile,
  currentMatch,
  isHost,
  busyAction,
  onRematch,
  pick,
}) {
  const leaderboard = usePartyLeaderboard(guestToken, partyProfile);

  return (
    <div className="party-final-grid">
      <section className="party-final-panel card-modern">
        <span className="party-chip success"><Crown size={14} />{pick('แมตช์จบแล้ว', 'Match complete')}</span>
        <h2>{leaderboard[0]?.memberName || pick('ยังไม่มีผู้ชนะ', 'No winner yet')}</h2>
        <p>{pick('นี่คือสรุปผลของห้องนี้จากทุกคำตอบที่ส่งเข้ามา', 'Here is the final result from every submitted answer in the room.')}</p>
        <div className="party-settings-summary">
          <article className="party-stat-pill"><strong>{leaderboard[0]?.score || 0}</strong><span>{pick('คะแนนอันดับ 1', 'Winning score')}</span></article>
          <article className="party-stat-pill"><strong>{leaderboard.length}</strong><span>{pick('ผู้เล่นทั้งหมด', 'Players')}</span></article>
          <article className="party-stat-pill"><strong>{currentMatch?.totalRounds || 0}</strong><span>{pick('รอบทั้งหมด', 'Rounds')}</span></article>
          <article className="party-stat-pill"><strong>{formatFastest(leaderboard[0]?.fastestMs, pick)}</strong><span>{pick('เร็วสุดของที่ 1', 'Winner fastest')}</span></article>
        </div>
        <div className="party-lobby-actions">
          {isHost ? (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={onRematch} disabled={busyAction === 'rematch'}>
              {busyAction === 'rematch' ? pick('กำลังรีเซ็ตห้อง...', 'Resetting room...') : pick('กลับไป Lobby เพื่อ Rematch', 'Back to lobby for a rematch')}
            </Button>
          ) : null}
          <Link to="/party" className="party-code-btn subtle">{pick('กลับไปหน้า Party', 'Back to Party')}</Link>
        </div>
      </section>
      <section className="party-final-panel card-modern">
        <div className="party-panel-head">
          <strong>{pick('Top ตารางคะแนน', 'Top leaderboard')}</strong>
          <span>{pick('เรียงจากคะแนนรวมและ tie-breaks', 'Sorted by total score and tie-breaks')}</span>
        </div>
        <PartyLeaderboard leaderboard={leaderboard} currentToken={guestToken} pick={pick} />
      </section>
    </div>
  );
});
