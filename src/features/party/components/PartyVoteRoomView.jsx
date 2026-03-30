import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPartyPresetById } from '@/features/party/lib/partyEngine';
import {
  resumePartyAudioContext,
  startPartyVoteAmbient,
  stopPartyVoteAmbient,
} from '@/features/party/lib/partyAudio';
import { submitPartyVote } from '@/features/party/lib/partyRemote';
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

  const { selectedSongId, hasVoted, setBattleContext, castVote, resetVoteMatch } = usePartyVoteStore();
  const answers = usePartyRoomStore((state) => state.answers);

  const myExistingVote = useMemo(() => {
    if (!battle?.id || !guestToken) return null;
    const myAnswer = answers.find((entry) => (
      String(entry.round_id || '') === String(battle.id || '')
      && String(entry.member_token || '') === String(guestToken || '')
    ));
    return myAnswer?.selected_option_id || null;
  }, [answers, battle?.id, guestToken]);

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
      <TrackPlayback
        key={`${phase}-${songId || 'track'}`}
        songKey={songKey}
        songData={allSongs[songId]}
        isPlaying
        totalSec={settings.previewSec || 12}
        onPlaybackComplete={onPlaybackComplete}
        pick={pick}
      />
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
      {content}
    </div>
  );
}
