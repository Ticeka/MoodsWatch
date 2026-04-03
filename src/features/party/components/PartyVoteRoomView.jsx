import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getPartyPresetById } from '@/features/party/lib/partyEngine';
import {
  resumePartyAudioContext,
  startPartyVoteAmbient,
  stopPartyVoteAmbient,
} from '@/features/party/lib/partyAudio';
import { submitPartyLiveChatMessage, submitPartySkipVote, submitPartyVote } from '@/features/party/lib/partyRemote';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { usePartyVoteStore } from '@/features/party/stores/partyVoteStore';
import { getCountdownSeconds, readPartyAudioVolume } from '../pages/partyRoomUtils';
import { PartyLobbyView } from '../pages/PartyLobby';
import {
  BattleCountdown,
  ChampionShowcase,
  RevealResult,
  TrackIntroCard,
  TrackPlayback,
  VoteFaceoff,
} from './PartyVoteComponents';
import { PartyLiveChat } from './PartyLiveChat';
import './PartyVoteRoom.css';

function getVoteChampionId(match) {
  if (!match) return null;
  return match.championSongId || match.currentBattle?.winnerSongId || (Array.isArray(match.queue) ? match.queue[match.queue.length - 1] || null : null);
}

export function PartyVoteRoomView({
  room,
  currentMember,
  isHost,
  pick,
  guestToken,
  partyProfile,
  busyAction,
  onToggleReady,
  onCloseRoom,
  onRematch,
  onStartMatch,
  hostEditor,
  onPlaybackComplete,
}) {
  const match = room?.current_match || null;
  const phase = match?.phase || 'lobby';
  const battle = match?.currentBattle || null;
  const allSongs = match?.allSongs || {};
  const settings = match?.settings || {};
  const currentPreset = getPartyPresetById(room?.settings?.presetId);
  const selectedPoolName = room?.settings?.templateName || room?.settings?.songPresetName || 'All Songs';
  const selectedPoolNameTh = room?.settings?.songPresetName || 'เพลงทั้งหมด';

  const [secondsLeft, setSecondsLeft] = useState(() => {
    const endsAt = match?.phaseEndsAt ? new Date(match.phaseEndsAt).getTime() : 0;
    return endsAt ? getCountdownSeconds(endsAt - Date.now()) : 0;
  });
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [isSubmittingSkipVote, setIsSubmittingSkipVote] = useState(false);

  const { selectedSongId, hasVoted, setBattleContext, castVote, resetVoteMatch } = usePartyVoteStore();
  const answers = usePartyRoomStore((state) => state.answers);
  const members = usePartyRoomStore((state) => state.members);
  const chatMessages = usePartyRoomStore((state) => state.chatMessages);
  const applyRoomEvent = usePartyRoomStore((state) => state.applyEvent);
  const removeChatMessage = usePartyRoomStore((state) => state.removeChatMessage);
  const shouldShowLiveChat = phase === 'play-a' || phase === 'play-b';
  const chatScopeKey = battle?.id ? `${battle.id}:${phase}` : '';
  const visibleChatMessages = useMemo(() => (
    chatScopeKey
      ? chatMessages
        .filter((message) => String(message?.scopeKey || '') === chatScopeKey)
        .slice(-40)
      : []
  ), [chatMessages, chatScopeKey]);

  const myExistingVote = useMemo(() => {
    if (!battle?.id || !guestToken) return null;
    const myAnswer = answers.find((entry) => (
      String(entry.round_id || '') === String(battle.id || '')
      && String(entry.member_token || '') === String(guestToken || '')
    ));
    return myAnswer?.selected_option_id || null;
  }, [answers, battle?.id, guestToken]);

  const skipVoteState = useMemo(() => {
    const skipVotes = battle?.skipVotes;
    if (!skipVotes || skipVotes.phase !== phase) {
      return {
        memberTokens: [],
        requiredVotes: Math.max(1, Math.floor(Math.max(1, members.length) / 2) + 1),
      };
    }

    const memberTokens = Array.isArray(skipVotes.memberTokens)
      ? [...new Set(skipVotes.memberTokens.map((token) => String(token || '')).filter(Boolean))]
      : [];

    return {
      memberTokens,
      requiredVotes: Math.max(
        1,
        Number(skipVotes.requiredVotes || Math.floor(Math.max(1, members.length) / 2) + 1),
      ),
    };
  }, [battle?.skipVotes, members.length, phase]);
  const hasSkipVoted = skipVoteState.memberTokens.includes(String(currentMember?.member_token || ''));
  const skipVoteCount = skipVoteState.memberTokens.length;
  const skipVotesRemaining = Math.max(0, members.length - skipVoteCount);

  useEffect(() => {
    if (battle?.id) {
      setBattleContext(battle.id, myExistingVote);
    }
  }, [battle?.id, myExistingVote, setBattleContext]);

  useEffect(() => {
    if (phase === 'lobby' || !match) {
      resetVoteMatch();
    }
  }, [match, phase, resetVoteMatch]);

  useEffect(() => {
    const endsAt = match?.phaseEndsAt ? new Date(match.phaseEndsAt).getTime() : 0;
    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => setSecondsLeft(getCountdownSeconds(endsAt - Date.now()));
    setSecondsLeft(getCountdownSeconds(endsAt - Date.now()));
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [match?.phaseEndsAt, phase]);

  useEffect(() => {
    let cancelled = false;
    const shouldPlayAmbient = phase === 'vote' || phase === 'reveal';

    if (!shouldPlayAmbient) {
      stopPartyVoteAmbient();
      return undefined;
    }

    void resumePartyAudioContext().then((audioContext) => {
      if (cancelled || !audioContext) {
        return;
      }
      startPartyVoteAmbient(readPartyAudioVolume(), phase);
    });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  useEffect(() => () => {
    stopPartyVoteAmbient();
  }, []);

  const handleVote = useCallback(async (_side, songId) => {
    if (isSubmittingVote || !battle?.id || !currentMember || phase !== 'vote') {
      return;
    }

    castVote(songId);
    setIsSubmittingVote(true);
    try {
      await submitPartyVote({
        room,
        member: currentMember,
        battleId: battle.id,
        selectedSongId: songId,
      });
    } catch (error) {
      console.error('[PartyVoteRoomView] submitPartyVote error:', error);
    } finally {
      setIsSubmittingVote(false);
      }
  }, [battle?.id, castVote, currentMember, isSubmittingVote, phase, room]);

  const handleSkipVote = useCallback(async () => {
    if (
      isSubmittingSkipVote
      || !battle?.id
      || !currentMember
      || (phase !== 'play-a' && phase !== 'play-b')
      || hasSkipVoted
    ) {
      return;
    }

    setIsSubmittingSkipVote(true);
    try {
      const result = await submitPartySkipVote({
        room,
        member: currentMember,
        battleId: battle.id,
      });

      if (!result) {
        return;
      }

      if (result.advanced) {
        toast.success(pick('โหวตครบแล้ว ข้ามไปเพลงถัดไป', 'Skip vote passed. Moving on.'));
      } else if (result.alreadyVoted) {
        toast(pick('คุณโหวตข้ามเพลงนี้ไปแล้ว', 'You already voted to skip this song.'));
      } else {
        toast.success(pick(
          `รับโหวตข้ามเพลงแล้ว (${result.votes}/${result.requiredVotes})`,
          `Skip vote recorded (${result.votes}/${result.requiredVotes})`,
        ));
      }
    } catch (error) {
      toast.error(error?.message || pick('โหวตข้ามเพลงไม่สำเร็จ', 'Could not submit the skip vote.'));
    } finally {
      setIsSubmittingSkipVote(false);
    }
  }, [battle?.id, currentMember, hasSkipVoted, isSubmittingSkipVote, phase, pick, room]);

  const handleSendChatMessage = useCallback(async (text) => {
    if (!room?.id || !currentMember || !battle?.id || !shouldShowLiveChat) {
      return;
    }

    const normalizedText = String(text || '').trim();
    if (!normalizedText) {
      return;
    }

    const messageId = `party-chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimisticMessage = {
      id: messageId,
      roomId: String(room.id || ''),
      battleId: String(battle.id || ''),
      phase,
      scopeKey: `${battle.id}:${phase}`,
      memberToken: String(currentMember.member_token || ''),
      memberName: String(currentMember.display_name || currentMember.memberName || 'You'),
      avatarKey: String(currentMember.avatar_key || currentMember.avatarKey || 'rose'),
      avatarUrl: String(currentMember.avatar_url || currentMember.avatarUrl || ''),
      text: normalizedText,
      sentAt: new Date().toISOString(),
    };

    applyRoomEvent({
      type: 'CHAT_MESSAGE',
      payload: {
        message: optimisticMessage,
      },
    });

    try {
      await submitPartyLiveChatMessage({
        room,
        member: currentMember,
        battleId: battle.id,
        phase,
        text: normalizedText,
        messageId,
      });
    } catch (error) {
      removeChatMessage(messageId);
      console.error('[PartyVoteRoomView] submitPartyLiveChatMessage error:', error);
      toast.error(error?.message || pick('ส่งข้อความไม่สำเร็จ', 'Could not send the chat message.'));
    }
  }, [applyRoomEvent, battle?.id, currentMember, phase, pick, removeChatMessage, room, shouldShowLiveChat]);

  let content = null;

  if (room?.status === 'lobby' || !match) {
    content = (
      <PartyLobbyView
        room={room}
        guestToken={guestToken}
        partyProfile={partyProfile}
        currentPreset={currentPreset}
        selectedPoolName={selectedPoolName}
        selectedPoolNameTh={selectedPoolNameTh}
        currentMember={currentMember}
        isHost={isHost}
        busyAction={busyAction}
        onToggleReady={onToggleReady}
        onStartMatch={onStartMatch}
        onCloseRoom={onCloseRoom}
        hostEditor={hostEditor}
        pick={pick}
      />
    );
  } else if (phase === 'countdown') {
    content = (
      <BattleCountdown
        battleIndex={match.battleIndex}
        totalBattles={match.totalBattles}
        currentMatch={match}
        secondsLeft={secondsLeft}
        pick={pick}
      />
    );
  } else if (phase === 'intro-a' || phase === 'intro-b') {
    const songKey = phase === 'intro-a' ? 'A' : 'B';
    const songId = phase === 'intro-a' ? battle?.songA : battle?.songB;
    content = <TrackIntroCard songKey={songKey} songData={allSongs[songId]} pick={pick} />;
  } else if (phase === 'play-a' || phase === 'play-b') {
    const songKey = phase === 'play-a' ? 'A' : 'B';
    const songId = phase === 'play-a' ? battle?.songA : battle?.songB;
    content = (
      <div className="vote-playback-stage">
        <TrackPlayback
          key={`${phase}-${songId || 'track'}`}
          songKey={songKey}
          songData={allSongs[songId]}
          isPlaying
          playbackMode={settings.clipPlaybackMode || 'preview'}
          totalSec={settings.previewSec || 12}
          onPlaybackComplete={onPlaybackComplete}
          sideAction={(
            <div className="vote-skip-stats" aria-live="polite">
              <span>{pick(`โหวตแล้ว ${skipVoteCount} คน`, `${skipVoteCount} voted`)}</span>
              <span>{pick(`ยังไม่โหวต ${skipVotesRemaining} คน`, `${skipVotesRemaining} not voted`)}</span>
              <button
                type="button"
                className="vote-skip-button vote-skip-button--plain"
                disabled={isSubmittingSkipVote || hasSkipVoted}
                onClick={handleSkipVote}
              >
                {hasSkipVoted
                  ? pick('โหวตข้ามแล้ว', 'Skip vote sent')
                  : isSubmittingSkipVote
                    ? pick('กำลังส่งโหวต...', 'Sending...')
                    : pick('โหวตข้ามเพลงนี้', 'Vote to skip')}
              </button>
            </div>
          )}
          pick={pick}
        />
      </div>
    );
  } else if (phase === 'vote') {
    content = (
      <VoteFaceoff
        battle={battle}
        allSongs={allSongs}
        hasVoted={hasVoted}
        selectedSongId={selectedSongId}
        onVote={handleVote}
        isSubmitting={isSubmittingVote}
        secondsLeft={secondsLeft}
        pick={pick}
      />
    );
  } else if (phase === 'reveal') {
    content = (
      <RevealResult
        battle={battle}
        allSongs={allSongs}
        secondsLeft={secondsLeft}
        revealSec={settings.revealSec || 6}
        freezeMs={settings.freezeMs ?? 1800}
        pick={pick}
      />
    );
  } else if (phase === 'final') {
    content = (
      <ChampionShowcase
        championId={getVoteChampionId(match)}
        allSongs={allSongs}
        onRematch={onRematch}
        pick={pick}
        isHost={isHost}
      />
    );
  }

  return (
    <div className="party-vote-room anime-theme">
      {shouldShowLiveChat ? (
        <div className="party-vote-live-shell">
          <div className="party-vote-live-layout">
            <div className="party-vote-main-panel">
              {content}
            </div>
            <div className="party-vote-chat-panel">
              <PartyLiveChat
                messages={visibleChatMessages}
                onSendMessage={handleSendChatMessage}
              />
            </div>
          </div>
        </div>
      ) : content}
    </div>
  );
}
