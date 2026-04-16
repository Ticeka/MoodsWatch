import { useEffect, useState } from 'react';
import { getCountdownSeconds, readPartyAudioVolume } from '../lib/partyRoomUtils';

export const REACTION_EMOJIS = ['🔥', '😱', '💀', '👀', '🎯', '🤯'];
export const PLAYER_TIERLIST_VOLUME_KEY = 'party-tierlist-player-volume';

export function readPlayerTierlistVolume() {
  if (typeof window === 'undefined') {
    return readPartyAudioVolume();
  }

  const parsed = Number(window.localStorage.getItem(PLAYER_TIERLIST_VOLUME_KEY));
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, parsed));
  }
  return readPartyAudioVolume();
}

export function persistPlayerTierlistVolume(volume) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    PLAYER_TIERLIST_VOLUME_KEY,
    String(Math.max(0, Math.min(100, Number(volume) || 0))),
  );
}

export function usePhaseTimer(match) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const endsAt = match?.phaseEndsAt ? new Date(match.phaseEndsAt).getTime() : 0;
    if (!endsAt) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
      if (endsAt - Date.now() <= 0) {
        window.clearInterval(interval);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [match?.phaseEndsAt, match?.phase, match?.itemIndex]);

  const endsAt = match?.phaseEndsAt ? new Date(match.phaseEndsAt).getTime() : 0;
  return endsAt ? getCountdownSeconds(endsAt - now) : 0;
}

export function getCurrentTierlistItem(match) {
  const currentItemId = match?.currentVote?.itemId || match?.itemOrder?.[match?.itemIndex];
  return currentItemId ? match?.allItems?.[currentItemId] || null : null;
}

export function isYouTubeTierlistItem(item) {
  const provider = String(item?.provider || '').trim().toLowerCase();
  const trailerSite = String(item?.trailerSite || '').trim().toLowerCase();
  return Boolean(item?.providerMediaId) && (provider === 'youtube' || trailerSite === 'youtube' || !item?.mediaUrl);
}

export function getTierlistMediaOffsetSec(match) {
  const phaseStartedAtMs = match?.phaseStartedAt ? new Date(match.phaseStartedAt).getTime() : 0;
  if (!phaseStartedAtMs) {
    return 0;
  }
  return Math.max(0, (Date.now() - phaseStartedAtMs) / 1000);
}

export function getPhaseLabel(phase, pick) {
  if (phase === 'countdown') return pick('เตรียมคิวถัดไป', 'Queueing next item');
  if (phase === 'show-item') return pick('ช่วงดูร่วมกัน', 'Viewing stage');
  if (phase === 'vote') return pick('ช่วงโหวต', 'Voting stage');
  if (phase === 'reveal') return pick('สรุปผลรอบนี้', 'Round result');
  return pick('กระดานสุดท้าย', 'Final board');
}

export function getTierlistSkipVoteState(match) {
  const phase = String(match?.phase || '');
  const skipVotes = match?.currentVote?.skipVotes;
  if (!skipVotes || skipVotes.phase !== phase) {
    return {
      memberTokens: [],
      requiredVotes: 0,
    };
  }

  return {
    memberTokens: Array.isArray(skipVotes.memberTokens)
      ? [...new Set(skipVotes.memberTokens.map((token) => String(token || '')).filter(Boolean))]
      : [],
    requiredVotes: Math.max(0, Number(skipVotes.requiredVotes || 0)),
  };
}

export function buildTierlistOptimisticChatMessage({
  room,
  currentMember,
  roundId,
  currentPhase,
  text,
  messageId,
}) {
  return {
    id: messageId,
    roomId: String(room?.id || ''),
    battleId: roundId,
    phase: currentPhase,
    scopeKey: `tierlist:${roundId}`,
    memberToken: String(currentMember?.member_token || ''),
    memberName: String(currentMember?.display_name || currentMember?.memberName || 'You'),
    avatarKey: String(currentMember?.avatar_key || currentMember?.avatarKey || 'rose'),
    avatarUrl: String(currentMember?.avatar_url || currentMember?.avatarUrl || ''),
    text: String(text || '').trim(),
    sentAt: new Date().toISOString(),
  };
}
