import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { LayoutPanelTop, Theater } from 'lucide-react';
import { getPartyPresetById } from '@/features/party/lib/partyEngine';
import {
  resumePartyAudioContext,
  startPartyVoteAmbient,
  stopPartyVoteAmbient,
} from '@/features/party/lib/partyAudio';
import { submitPartyLiveChatMessage, submitPartySkipVote, submitPartyVote } from '@/features/party/api/partyRemoteApi';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import { usePartyVoteStore } from '@/features/party/stores/partyVoteStore';
import { getCountdownSeconds, readPartyAudioVolume } from '../lib/partyRoomUtils';
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

const PARTY_VOTE_VIEW_MODE_KEY = 'party-vote-view-mode';
const PARTY_VOTE_MODE_TRANSITION_MS = 240;

function readVoteViewMode() {
  if (typeof window === 'undefined') {
    return 'live';
  }

  const storedMode = String(window.localStorage.getItem(PARTY_VOTE_VIEW_MODE_KEY) || '').trim().toLowerCase();
  return storedMode === 'theater' ? 'theater' : 'live';
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
  const [viewMode, setViewMode] = useState(() => readVoteViewMode());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const experienceShellRef = useRef(null);
  const pendingPostExitModeRef = useRef(null);
  const modeTransitionTimeoutRef = useRef(null);
  const fullscreenRequestTimeoutRef = useRef(null);

  const { selectedSongId, hasVoted, setBattleContext, castVote, resetVoteMatch } = usePartyVoteStore();
  const answers = usePartyRoomStore((state) => state.answers);
  const members = usePartyRoomStore((state) => state.members);
  const chatMessages = usePartyRoomStore((state) => state.chatMessages);
  const applyRoomEvent = usePartyRoomStore((state) => state.applyEvent);
  const removeChatMessage = usePartyRoomStore((state) => state.removeChatMessage);
  const shouldShowLiveChat = phase === 'play-a' || phase === 'play-b';
  const isTheaterMode = viewMode === 'theater';
  const isClipPlaybackPhase = shouldShowLiveChat;
  const isTheaterPlaybackMode = isTheaterMode && isClipPlaybackPhase;
  const shouldUseViewingShell = room?.status !== 'lobby' && match && isClipPlaybackPhase;
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
  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'countdown':
        return pick('เตรียมแมตช์', 'Get ready');
      case 'intro-a':
      case 'intro-b':
        return pick('เปิดตัวผู้เข้าแข่ง', 'Contender intro');
      case 'play-a':
      case 'play-b':
        return pick('กำลังเล่นตัวอย่าง', 'Now playing');
      case 'vote':
        return pick('เปิดโหวตแล้ว', 'Voting live');
      case 'reveal':
        return pick('กำลังเฉลยผล', 'Results');
      case 'final':
        return pick('แชมเปี้ยน', 'Champion');
      default:
        return pick('ล็อบบี้', 'Lobby');
    }
  }, [phase, pick]);

  useEffect(() => {
    if (battle?.id) {
      setBattleContext(battle.id, myExistingVote);
    }
  }, [battle?.id, myExistingVote, setBattleContext]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PARTY_VOTE_VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const beginModeTransition = useCallback(() => {
    if (typeof window === 'undefined') {
      setIsModeTransitioning(true);
      return;
    }

    if (modeTransitionTimeoutRef.current) {
      window.clearTimeout(modeTransitionTimeoutRef.current);
    }

    setIsModeTransitioning(true);
    modeTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsModeTransitioning(false);
      modeTransitionTimeoutRef.current = null;
    }, PARTY_VOTE_MODE_TRANSITION_MS);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleFullscreenChange = () => {
      const isActive = document.fullscreenElement === experienceShellRef.current;
      setIsFullscreen(isActive);

      if (!isActive && pendingPostExitModeRef.current) {
        const nextMode = pendingPostExitModeRef.current;
        pendingPostExitModeRef.current = null;
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            setViewMode(nextMode);
          }, 60);
        } else {
          setViewMode(nextMode);
        }
      }
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const node = experienceShellRef.current;
    if (!node || room?.status === 'lobby' || !match || !isClipPlaybackPhase) {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        void document.exitFullscreen().catch(() => null);
      }
      return undefined;
    }

    if (viewMode === 'theater') {
      if (document.fullscreenElement !== node && typeof node.requestFullscreen === 'function') {
        if (fullscreenRequestTimeoutRef.current && typeof window !== 'undefined') {
          window.clearTimeout(fullscreenRequestTimeoutRef.current);
        }
        if (typeof window !== 'undefined') {
          fullscreenRequestTimeoutRef.current = window.setTimeout(() => {
            void node.requestFullscreen().catch(() => null);
            fullscreenRequestTimeoutRef.current = null;
          }, 140);
        } else {
          void node.requestFullscreen().catch(() => null);
        }
      }
      return () => {
        if (fullscreenRequestTimeoutRef.current && typeof window !== 'undefined') {
          window.clearTimeout(fullscreenRequestTimeoutRef.current);
          fullscreenRequestTimeoutRef.current = null;
        }
      };
    }

    return undefined;
  }, [isClipPlaybackPhase, match, room?.status, viewMode]);

  useEffect(() => () => {
    if (typeof window === 'undefined') {
      return;
    }
    if (modeTransitionTimeoutRef.current) {
      window.clearTimeout(modeTransitionTimeoutRef.current);
      modeTransitionTimeoutRef.current = null;
    }
    if (fullscreenRequestTimeoutRef.current) {
      window.clearTimeout(fullscreenRequestTimeoutRef.current);
      fullscreenRequestTimeoutRef.current = null;
    }
  }, []);

  const handleViewModeChange = useCallback((nextMode) => {
    if (nextMode !== 'live' && nextMode !== 'theater') {
      return;
    }

    const currentNode = experienceShellRef.current;
    const isCurrentlyFullscreen = typeof document !== 'undefined' && document.fullscreenElement === currentNode;
    const wantsTheater = nextMode === 'theater';

    if (wantsTheater && viewMode === 'theater' && isCurrentlyFullscreen) {
      return;
    }

    if (!wantsTheater && viewMode === 'live' && !isCurrentlyFullscreen) {
      return;
    }

    beginModeTransition();

    if (wantsTheater) {
      setViewMode('theater');
      return;
    }

    if (isCurrentlyFullscreen && typeof document !== 'undefined' && typeof document.exitFullscreen === 'function') {
      pendingPostExitModeRef.current = 'live';
      void document.exitFullscreen().catch(() => {
        pendingPostExitModeRef.current = null;
        setViewMode('live');
      });
      return;
    }

    setViewMode('live');
  }, [beginModeTransition, viewMode]);

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
    <div className={`party-vote-room anime-theme ${isTheaterPlaybackMode ? 'is-theater-mode' : ''} ${isModeTransitioning ? 'is-mode-transitioning' : ''}`.trim()}>
      {shouldUseViewingShell ? (
        <div
          ref={experienceShellRef}
          className={`party-vote-experience-shell ${isTheaterPlaybackMode ? 'is-theater' : ''} ${isFullscreen ? 'is-fullscreen' : ''}`.trim()}
        >
          <div className="party-vote-view-toolbar">
            <div className="party-vote-view-toolbar-copy">
              <span className="party-vote-view-kicker">{pick('Vote Battle View', 'Vote Battle View')}</span>
              <strong>{phaseLabel}</strong>
            </div>
            <div className="party-vote-view-toggle" role="tablist" aria-label={pick('โหมดรับชม', 'Viewing mode')}>
              <button
                type="button"
                className={`party-vote-view-toggle-btn ${!isTheaterMode ? 'is-active' : ''}`.trim()}
                onClick={() => handleViewModeChange('live')}
                aria-pressed={!isTheaterMode}
              >
                <LayoutPanelTop size={16} />
                <span>{pick('ปกติ', 'Live')}</span>
              </button>
              <button
                type="button"
                className={`party-vote-view-toggle-btn ${isTheaterMode ? 'is-active' : ''}`.trim()}
                onClick={() => handleViewModeChange('theater')}
                aria-pressed={isTheaterMode}
              >
                <Theater size={16} />
                <span>{pick(isFullscreen ? 'Theater เต็มจอ' : 'Theater', isFullscreen ? 'Theater Fullscreen' : 'Theater')}</span>
              </button>
            </div>
          </div>
          <div className={`party-vote-live-shell ${isTheaterPlaybackMode ? 'is-theater' : ''}`.trim()}>
            <div className={`party-vote-live-layout ${isTheaterPlaybackMode ? 'is-theater' : ''}`.trim()}>
              <div className={`party-vote-main-panel ${isTheaterPlaybackMode ? 'is-theater' : ''}`.trim()}>
                {content}
              </div>
              {shouldShowLiveChat ? (
                <div className={`party-vote-chat-panel ${isTheaterPlaybackMode ? 'is-theater' : ''}`.trim()}>
                  <PartyLiveChat
                    messages={visibleChatMessages}
                    onSendMessage={handleSendChatMessage}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : content}
    </div>
  );
}
