import React, { useEffect, useMemo, useState } from 'react';
import {
  useCurrentPartyRoundAnswers,
  useHydratedPartyMembers,
} from '@/features/party/lib/usePartyRoomSelectors';
import { buildPartyLeaderboard } from '@/features/party/lib/partyEngine';
import { PartyRevealPanel } from '../components/PartyRoomShared';
import { PartyTitleGuessRevealStage } from '../components/PartyTitleGuessView';

export const PartyRevealView = React.memo(function PartyRevealView({
  room,
  guestToken,
  partyProfile,
  onPlaybackStarted,
  pick,
}) {
  const members = useHydratedPartyMembers(guestToken, partyProfile);
  const { answers, currentRound, currentRoundAnswers } = useCurrentPartyRoundAnswers(room?.current_match);
  const leaderboard = useMemo(
    () => buildPartyLeaderboard(members, answers),
    [answers, members]
  );
  const previousLeaderboard = useMemo(
    () => buildPartyLeaderboard(
      members,
      answers.filter((entry) => String(entry.round_id || '') !== String(currentRound?.id || ''))
    ),
    [answers, currentRound?.id, members]
  );
  const [animatedLeaderboard, setAnimatedLeaderboard] = useState(() => leaderboard);

  useEffect(() => {
    if (!currentRound?.id) {
      setAnimatedLeaderboard(leaderboard);
      return undefined;
    }

    setAnimatedLeaderboard(previousLeaderboard);
    const reduceMotion = typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      : false;
    const timeoutId = window.setTimeout(() => {
      setAnimatedLeaderboard(leaderboard);
    }, reduceMotion ? 0 : 520);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentRound?.id, leaderboard, previousLeaderboard]);

  return (
    currentRound?.kind === 'title-guess' ? (
      <PartyTitleGuessRevealStage
        room={room}
        round={currentRound}
        answers={currentRoundAnswers}
        leaderboard={animatedLeaderboard}
        memberToken={guestToken}
        pick={pick}
      />
    ) : (
      <PartyRevealPanel
        round={currentRound}
        answers={currentRoundAnswers}
        leaderboard={animatedLeaderboard}
        memberToken={guestToken}
        onPlaybackStarted={onPlaybackStarted}
        pick={pick}
      />
    )
  );
});
