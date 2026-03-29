import React from 'react';
import {
  useCurrentPartyRoundAnswers,
  usePartyLeaderboard,
} from '@/features/party/lib/usePartyRoomSelectors';
import { PartyRevealPanel } from './PartyRoomShared';

export const PartyRevealView = React.memo(function PartyRevealView({
  room,
  guestToken,
  partyProfile,
  onPlaybackStarted,
  pick,
}) {
  const leaderboard = usePartyLeaderboard(guestToken, partyProfile);
  const { currentRound, currentRoundAnswers } = useCurrentPartyRoundAnswers(room?.current_match);

  return (
    <PartyRevealPanel
      round={currentRound}
      answers={currentRoundAnswers}
      leaderboard={leaderboard}
      memberToken={guestToken}
      onPlaybackStarted={onPlaybackStarted}
      pick={pick}
    />
  );
});
