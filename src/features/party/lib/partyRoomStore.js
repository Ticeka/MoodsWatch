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

function sanitizeBundle(bundle = null, syncMeta = {}) {
  if (!bundle) {
    return {
      room: null,
      members: [],
      answers: [],
      ...createSyncMeta(syncMeta),
    };
  }

  return {
    room: bundle.room || null,
    members: Array.isArray(bundle.members) ? bundle.members : [],
    answers: Array.isArray(bundle.answers) ? bundle.answers : [],
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

export const usePartyRoomStore = create((set) => ({
  room: null,
  members: [],
  answers: [],
  ...createSyncMeta(),
  setBundle: (bundle, syncMeta = {}) => set(sanitizeBundle(bundle, syncMeta)),
  clearBundle: () => set({
    room: null,
    members: [],
    answers: [],
    ...createSyncMeta(),
  }),
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
  clearAnswers: () => set({ answers: [] }),
  applyEvent: (event) => set((state) => {
    const payload = event?.payload || {};
    const nextEventAt = parseEventTimestamp(event?.sentAt);

    if (nextEventAt && state.lastEventAt && nextEventAt < state.lastEventAt) {
      return state;
    }

    const realtimeMeta = {
      syncState: 'live',
      syncError: '',
      lastEventAt: nextEventAt || Date.now(),
    };

    switch (event?.type) {
      case 'ROOM_SYNC':
        return sanitizeBundle(payload.bundle, {
          lastEventAt: state.lastEventAt,
          lastSyncedAt: Date.now(),
        });
      case 'ROOM_UPDATED':
      case 'ROOM_CLOSED':
      case 'MATCH_ADVANCED':
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
      case 'ROOM_RESET':
        return {
          room: payload.room ? { ...(state.room || {}), ...payload.room } : state.room,
          members: state.members.map((member) => ({ ...member, is_ready: false })),
          answers: [],
          ...realtimeMeta,
        };
      default:
        return state;
    }
  }),
}));
