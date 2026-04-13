import React, { useMemo } from 'react';
import { useCurrentPartyRoundAnswers, usePartyLeaderboard } from '@/features/party/lib/usePartyRoomSelectors';
import { PartyAnswerPanel } from '../components/PartyRoomShared';
import { PartyTitleGuessQuestionStage } from '../components/PartyTitleGuessView';

export const PartyQuestionView = React.memo(function PartyQuestionView({
  room,
  guestToken,
  partyProfile,
  currentMember,
  busyAction,
  phaseEndsAtMs,
  answerGraceEndsAtMs,
  onPlaybackStarted,
  onPlaybackComplete,
  onSubmit,
  reactionFeed,
  onReaction,
  pick,
}) {
  const leaderboard = usePartyLeaderboard(guestToken, partyProfile);
  const { currentRound, currentRoundAnswers, answerCount } = useCurrentPartyRoundAnswers(room?.current_match);
  const currentAnswer = useMemo(
    () => currentRoundAnswers.find((entry) => String(entry.member_token || '') === String(guestToken || '')) || null,
    [currentRoundAnswers, guestToken]
  );

  return (
    currentRound?.kind === 'title-guess' ? (
      <PartyTitleGuessQuestionStage
        key={currentRound?.id || room?.current_match?.id || 'title-guess-answer-panel'}
        room={room}
        member={currentMember}
        round={currentRound}
        answer={currentAnswer}
        answerCount={answerCount}
        currentRoundAnswers={currentRoundAnswers}
        leaderboard={leaderboard}
        phaseEndsAtMs={phaseEndsAtMs}
        onSubmit={onSubmit}
        submitting={busyAction === 'answer'}
        reactionFeed={reactionFeed}
        onReaction={onReaction}
        pick={pick}
      />
    ) : (
      <PartyAnswerPanel
        key={currentRound?.id || room?.current_match?.id || 'answer-panel'}
        room={room}
        member={currentMember}
        round={currentRound}
        answer={currentAnswer}
        answerCount={answerCount}
        leaderboard={room?.settings?.showLiveScores ? leaderboard : []}
        phaseEndsAtMs={phaseEndsAtMs}
        answerGraceEndsAtMs={answerGraceEndsAtMs}
        onPlaybackStarted={onPlaybackStarted}
        onPlaybackComplete={onPlaybackComplete}
        onSubmit={onSubmit}
        submitting={busyAction === 'answer'}
        pick={pick}
      />
    )
  );
});
