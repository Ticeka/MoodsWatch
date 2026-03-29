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
    <div className="party-final-layout">
      <section className="party-final-hero">
        <span className="party-chip success"><Crown size={14} />{pick('แมตช์จบแล้ว', 'Match complete')}</span>
        <div>
          <p style={{ margin: '0 0 0.15rem', fontSize: '0.82rem', color: 'var(--pg-muted)' }}>{pick('ผู้ชนะ', 'Winner')}</p>
          <h2 className="party-final-winner-name">{leaderboard[0]?.memberName || pick('ยังไม่มีผู้ชนะ', 'No winner yet')}</h2>
        </div>
        <div className="party-final-stats">
          <div className="party-final-stat">
            <strong>{leaderboard[0]?.score ?? 0}</strong>
            <span>{pick('คะแนนอันดับ 1', 'Top score')}</span>
          </div>
          <div className="party-final-stat">
            <strong>{leaderboard.length}</strong>
            <span>{pick('ผู้เล่น', 'Players')}</span>
          </div>
          <div className="party-final-stat">
            <strong>{currentMatch?.totalRounds || 0}</strong>
            <span>{pick('รอบทั้งหมด', 'Rounds')}</span>
          </div>
          <div className="party-final-stat">
            <strong>{formatFastest(leaderboard[0]?.fastestMs, pick)}</strong>
            <span>{pick('เร็วสุดที่ 1', 'Winner fastest')}</span>
          </div>
        </div>
        <div className="party-lobby-actions">
          {isHost ? (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={onRematch} disabled={busyAction === 'rematch'}>
              {busyAction === 'rematch' ? pick('กำลังรีเซ็ต...', 'Resetting...') : pick('กลับ Lobby (Rematch)', 'Back to lobby')}
            </Button>
          ) : null}
          <Link to="/party" className="party-code-btn subtle">{pick('กลับหน้า Party', 'Back to Party')}</Link>
        </div>
      </section>

      <section className="party-final-leaderboard-wrap">
        <div className="party-side-head" style={{ marginBottom: '0.85rem' }}>
          <strong>{pick('ตารางคะแนนสุดท้าย', 'Final leaderboard')}</strong>
          <span>{pick('เรียงจากคะแนนรวม', 'Sorted by total score')}</span>
        </div>
        <PartyLeaderboard leaderboard={leaderboard} currentToken={guestToken} pick={pick} />
      </section>
    </div>
  );
});
