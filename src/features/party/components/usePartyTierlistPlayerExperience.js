import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { submitPartyLiveChatMessage } from '@/features/party/api/partyRemoteApi';
import { resumePartyAudioContext } from '@/features/party/lib/partyAudio';
import { usePartyRoomStore } from '@/features/party/lib/partyRoomStore';
import {
  buildTierlistOptimisticChatMessage,
  getCurrentTierlistItem,
  persistPlayerTierlistVolume,
  readPlayerTierlistVolume,
} from './partyTierlistRoomUtils';

export function usePartyTierlistPlayerExperience({
  room,
  currentMember,
  match,
  onReaction,
  pick,
}) {
  const currentItem = getCurrentTierlistItem(match);
  const chatMessages = usePartyRoomStore((state) => state.chatMessages);
  const applyRoomEvent = usePartyRoomStore((state) => state.applyEvent);
  const removeChatMessage = usePartyRoomStore((state) => state.removeChatMessage);
  const currentItemId = String(currentItem?.id || '');
  const [audioReadyItemId, setAudioReadyItemId] = useState('');
  const [playerVolume, setPlayerVolume] = useState(() => readPlayerTierlistVolume());
  const [lastAudibleVolume, setLastAudibleVolume] = useState(() => {
    const initialVolume = readPlayerTierlistVolume();
    return initialVolume > 0 ? initialVolume : 35;
  });
  const audioReady = Boolean(currentItemId) && audioReadyItemId === currentItemId;
  const audioEnabled = audioReady && playerVolume > 0;
  const heroRef = useRef(null);
  const boardRef = useRef(null);
  const roundId = String(match?.currentVote?.roundId || '');
  const currentPhase = String(match?.phase || '');
  const chatScopeKey = roundId ? `tierlist:${roundId}` : '';

  const visibleChatMessages = useMemo(() => (
    chatScopeKey
      ? chatMessages
        .filter((message) => String(message?.scopeKey || '') === chatScopeKey)
        .slice(-40)
      : []
  ), [chatMessages, chatScopeKey]);

  const ensureAudioReady = useCallback(() => {
    void resumePartyAudioContext();
    if (currentItemId) {
      setAudioReadyItemId(currentItemId);
    }
  }, [currentItemId]);

  const handleToggleAudio = useCallback(() => {
    if (audioEnabled) {
      setLastAudibleVolume((current) => Math.max(current, playerVolume, 10));
      setPlayerVolume(0);
      persistPlayerTierlistVolume(0);
      return;
    }

    const restoredVolume = Math.max(10, lastAudibleVolume || 0);
    ensureAudioReady();
    setPlayerVolume(restoredVolume);
    persistPlayerTierlistVolume(restoredVolume);
  }, [audioEnabled, ensureAudioReady, lastAudibleVolume, playerVolume]);

  const handleReactionWithAudio = useCallback((emoji) => {
    ensureAudioReady();
    onReaction?.(emoji);
  }, [ensureAudioReady, onReaction]);

  const handleVolumeChange = useCallback((event) => {
    const nextVolume = Math.max(0, Math.min(100, Number(event?.target?.value || 0)));
    if (nextVolume > 0) {
      ensureAudioReady();
      setLastAudibleVolume(nextVolume);
    } else {
      setLastAudibleVolume((current) => Math.max(current, playerVolume, 10));
    }
    setPlayerVolume(nextVolume);
    persistPlayerTierlistVolume(nextVolume);
  }, [ensureAudioReady, playerVolume]);

  const handleOpenBoard = useCallback(() => {
    boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (match?.phase === 'show-item') {
      heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (match?.phase === 'reveal') {
      boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [match?.phase, currentItem?.id]);

  const handleSendChatMessage = useCallback(async (rawText) => {
    const normalizedText = String(rawText || '').trim();
    if (!currentMember || !room?.id || !roundId || !normalizedText) {
      return;
    }

    const messageId = `party-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = buildTierlistOptimisticChatMessage({
      room,
      currentMember,
      roundId,
      currentPhase,
      text: normalizedText,
      messageId,
    });

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
        battleId: roundId,
        phase: currentPhase,
        text: normalizedText,
        messageId,
      });
    } catch (error) {
      removeChatMessage(messageId);
      toast.error(error?.message || pick('ส่งข้อความไม่สำเร็จ', 'Could not send the chat message.'));
    }
  }, [applyRoomEvent, currentMember, currentPhase, pick, removeChatMessage, room, roundId]);

  return {
    audioEnabled,
    boardRef,
    chatScopeKey,
    currentItem,
    handleToggleAudio,
    handleOpenBoard,
    handleReactionWithAudio,
    handleSendChatMessage,
    handleVolumeChange,
    heroRef,
    playerVolume,
    visibleChatMessages,
  };
}

export default usePartyTierlistPlayerExperience;
