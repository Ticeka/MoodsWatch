import { create } from 'zustand';

function createSyncMeta(overrides = {}) {
  return {
    syncState: 'idle',
    syncError: '',
    lastSyncedAt: 0,
    lastEventAt: 0,
    ...overrides,
  };
}

function parseEventTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function getRoomUpdatedAtMs(room = null) {
  const timestamp = new Date(room?.updated_at || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function isIncomingRoomNewer(currentRoom = null, nextRoom = null) {
  const currentUpdatedAtMs = getRoomUpdatedAtMs(currentRoom);
  const nextUpdatedAtMs = getRoomUpdatedAtMs(nextRoom);

  if (!nextRoom) {
    return false;
  }

  if (!currentRoom) {
    return true;
  }

  if (!nextUpdatedAtMs) {
    return true;
  }

  if (!currentUpdatedAtMs) {
    return true;
  }

  return nextUpdatedAtMs >= currentUpdatedAtMs;
}

function sanitizeBundle(bundle = null, syncMeta = {}, currentState = null) {
  if (!bundle) {
    return {
      room: null,
      members: [],
      answers: [],
      chatMessages: [],
      ...createSyncMeta(syncMeta),
    };
  }

  const nextRoom = bundle.room || null;
  const currentRoom = currentState?.room || null;
  const shouldAdoptBundle = isIncomingRoomNewer(currentRoom, nextRoom);
  if (!shouldAdoptBundle && currentRoom) {
      return {
        room: currentRoom,
        members: currentState?.members || [],
        answers: currentState?.answers || [],
        chatMessages: currentState?.chatMessages || [],
        joinRequests: currentState?.joinRequests || [],
        ...createSyncMeta({
          syncState: 'live',
        lastSyncedAt: Date.now(),
        ...syncMeta,
      }),
    };
  }

  return {
    room: nextRoom,
    members: Array.isArray(bundle.members) ? bundle.members : [],
    answers: Array.isArray(bundle.answers) ? bundle.answers : [],
    chatMessages: currentState?.chatMessages || [],
    joinRequests: currentState?.joinRequests || [],
    ...createSyncMeta({
      syncState: 'live',
      lastSyncedAt: Date.now(),
      ...syncMeta,
    }),
  };
}

function upsertByKey(items = [], nextItem, key) {
  if (!nextItem) {
    return items;
  }

  const targetKey = String(nextItem?.[key] || '');
  const nextItems = [...items];
  const existingIndex = nextItems.findIndex((item) => String(item?.[key] || '') === targetKey);

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      ...nextItem,
    };
    return nextItems;
  }

  nextItems.push(nextItem);
  return nextItems;
}

function upsertAnswerRecord(items = [], nextAnswer) {
  if (!nextAnswer) {
    return items;
  }

  const answerId = String(nextAnswer?.id || '');
  const nextItems = [...items];
  const existingIndex = answerId
    ? nextItems.findIndex((item) => String(item?.id || '') === answerId)
    : nextItems.findIndex((item) => (
      String(item?.round_id || '') === String(nextAnswer?.round_id || '')
      && String(item?.member_token || '') === String(nextAnswer?.member_token || '')
    ));

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      ...nextAnswer,
    };
    return nextItems;
  }

  nextItems.push(nextAnswer);
  return nextItems;
}

function upsertChatMessage(items = [], nextMessage) {
  if (!nextMessage) {
    return items;
  }

  const messageId = String(nextMessage?.id || '').trim();
  if (!messageId) {
    return items;
  }

  const nextItems = [...items];
  const existingIndex = nextItems.findIndex((item) => String(item?.id || '').trim() === messageId);

  if (existingIndex >= 0) {
    nextItems[existingIndex] = {
      ...nextItems[existingIndex],
      ...nextMessage,
    };
    return nextItems.slice(-200);
  }

  nextItems.push(nextMessage);
  nextItems.sort((left, right) => {
    const leftTime = parseEventTimestamp(left?.sentAt || left?.ts || 0);
    const rightTime = parseEventTimestamp(right?.sentAt || right?.ts || 0);
    return leftTime - rightTime;
  });
  return nextItems.slice(-200);
}

function removeChatMessage(items = [], messageId) {
  const targetId = String(messageId || '').trim();
  if (!targetId) {
    return items;
  }
  return items.filter((item) => String(item?.id || '').trim() !== targetId);
}

export const usePartyRoomStore = create((set) => ({
  room: null,
  members: [],
  answers: [],
  chatMessages: [],
  joinRequests: [],
  ...createSyncMeta(),
  setBundle: (bundle, syncMeta = {}) => set((state) => sanitizeBundle(bundle, syncMeta, state)),
  clearBundle: () => set({
    room: null,
    members: [],
    answers: [],
    chatMessages: [],
    joinRequests: [],
    ...createSyncMeta(),
  }),
  setJoinRequests: (joinRequests) => set({ joinRequests: Array.isArray(joinRequests) ? joinRequests : [] }),
  upsertJoinRequest: (request) => set((state) => ({
    joinRequests: upsertByKey(state.joinRequests, request, 'id'),
  })),
  removeJoinRequest: (requestId) => set((state) => ({
    joinRequests: state.joinRequests.filter((r) => String(r?.id || '') !== String(requestId || '')),
  })),
  setSyncState: (syncState, extras = {}) => set((state) => ({
    syncState,
    syncError: extras.syncError ?? state.syncError,
    lastSyncedAt: extras.lastSyncedAt ?? state.lastSyncedAt,
    lastEventAt: extras.lastEventAt ?? state.lastEventAt,
  })),
  mergeRoom: (room) => set((state) => ({
    room: room ? { ...(state.room || {}), ...room } : state.room,
  })),
  upsertMember: (member) => set((state) => ({
    members: upsertByKey(state.members, member, 'member_token'),
  })),
  patchMembers: (memberTokens = [], patch = {}) => set((state) => ({
    members: state.members.map((member) => (
      memberTokens.includes(String(member?.member_token || ''))
        ? { ...member, ...patch }
        : member
    )),
  })),
  upsertAnswer: (answer) => set((state) => ({
    answers: upsertAnswerRecord(state.answers, answer),
  })),
  upsertChatMessage: (message) => set((state) => ({
    chatMessages: upsertChatMessage(state.chatMessages, message),
  })),
  removeChatMessage: (messageId) => set((state) => ({
    chatMessages: removeChatMessage(state.chatMessages, messageId),
  })),
  clearChatMessages: () => set({ chatMessages: [] }),
  clearAnswers: () => set({ answers: [] }),
  applyEvent: (event) => set((state) => {
    const payload = event?.payload || {};
    const nextEventAt = parseEventTimestamp(event?.sentAt);
    const canApplyRoomUpdate = !payload.room || isIncomingRoomNewer(state.room, payload.room);

    const realtimeMeta = {
      syncState: 'live',
      syncError: '',
      // Do not reject events by comparing sender clocks across devices.
      lastEventAt: Math.max(state.lastEventAt || 0, nextEventAt || 0, Date.now()),
    };

    switch (event?.type) {
      case 'ROOM_SYNC':
        return sanitizeBundle(payload.bundle, {
          lastEventAt: state.lastEventAt,
          lastSyncedAt: Date.now(),
        }, state);
      case 'ROOM_UPDATED':
      case 'ROOM_CLOSED':
      case 'MATCH_ADVANCED':
        if (!canApplyRoomUpdate) {
          return {
            ...realtimeMeta,
          };
        }
        return {
          room: payload.room ? { ...(state.room || {}), ...payload.room } : state.room,
          ...realtimeMeta,
        };
      case 'MEMBER_UPSERTED':
        return {
          members: upsertByKey(state.members, payload.member, 'member_token'),
          ...realtimeMeta,
        };
      case 'MEMBERS_PATCHED':
        return {
          members: state.members.map((member) => (
            payload.memberTokens?.includes(String(member?.member_token || ''))
              ? { ...member, ...(payload.patch || {}) }
              : member
          )),
          ...realtimeMeta,
        };
      case 'ANSWER_SUBMITTED':
        return {
          answers: upsertAnswerRecord(state.answers, payload.answer),
          ...realtimeMeta,
        };
      case 'CHAT_MESSAGE':
        return {
          chatMessages: upsertChatMessage(state.chatMessages, payload.message),
          ...realtimeMeta,
        };
      case 'ROOM_RESET':
        if (!canApplyRoomUpdate) {
          return {
            ...realtimeMeta,
          };
        }
        return {
          room: payload.room ? { ...(state.room || {}), ...payload.room } : state.room,
          members: Array.isArray(payload.members)
            ? payload.members
            : state.members.map((member) => ({ ...member, is_ready: false })),
          answers: [],
          chatMessages: [],
          ...realtimeMeta,
        };
      default:
        return state;
    }
  }),
}));
