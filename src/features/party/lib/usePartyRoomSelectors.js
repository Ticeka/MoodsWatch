import { useMemo } from 'react';
import {
  buildPartyLeaderboard,
  countPartyRoundAnswers,
  getPartyCurrentRound,
} from '@/features/party/lib/partyEngine';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { buildHydratedPartyMembers } from '@/features/party/lib/partyRoomUtils';

export function useHydratedPartyMembers(guestToken, partyProfile) {
  const storeMembers = usePartyRoomStore((state) => state.members);

  return useMemo(
    () => buildHydratedPartyMembers(storeMembers, guestToken, partyProfile),
    [guestToken, partyProfile, storeMembers]
  );
}

export function useCurrentPartyMember(guestToken, partyProfile) {
  const members = useHydratedPartyMembers(guestToken, partyProfile);

  return useMemo(
    () => members.find((member) => String(member.member_token || '') === String(guestToken || '')) || null,
    [guestToken, members]
  );
}

export function usePartyLeaderboard(guestToken, partyProfile) {
  const members = useHydratedPartyMembers(guestToken, partyProfile);
  const answers = usePartyRoomStore((state) => state.answers);

  return useMemo(
    () => buildPartyLeaderboard(members, answers),
    [answers, members]
  );
}

export function useCurrentPartyRoundAnswers(match) {
  const answers = usePartyRoomStore((state) => state.answers);
  const currentRound = useMemo(() => getPartyCurrentRound(match), [match]);

  const currentRoundAnswers = useMemo(
    () => answers.filter((entry) => String(entry.round_id || '') === String(currentRound?.id || '')),
    [answers, currentRound?.id]
  );

  return {
    answers,
    currentRound,
    currentRoundAnswers,
    answerCount: countPartyRoundAnswers(answers, currentRound?.id),
  };
}
