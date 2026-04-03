import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePartyRoomStore } from '../partyRoomStore.js';

function resetStore() {
  usePartyRoomStore.setState({
    room: null,
    members: [],
    answers: [],
    chatMessages: [],
    syncState: 'idle',
    syncError: '',
    lastSyncedAt: 0,
    lastEventAt: 0,
  });
}

describe('partyRoomStore', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T10:00:00.000Z'));
  });

  it('marks bundle sync as live with a timestamp', () => {
    usePartyRoomStore.getState().setBundle({
      room: { id: 'room-1', room_code: 'ABC123' },
      members: [{ member_token: 'guest-1', display_name: 'A' }],
      answers: [],
    });

    const state = usePartyRoomStore.getState();
    expect(state.syncState).toBe('live');
    expect(state.lastSyncedAt).toBe(Date.now());
    expect(state.room?.room_code).toBe('ABC123');
  });

  it('applies realtime updates even when the sender clock is behind this client', () => {
    usePartyRoomStore.getState().setBundle({
      room: { id: 'room-1', room_code: 'ABC123', status: 'lobby' },
      members: [],
      answers: [],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'ROOM_UPDATED',
      sentAt: '2026-03-29T10:00:05.000Z',
      payload: {
        room: { status: 'live' },
      },
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'MEMBER_UPSERTED',
      sentAt: '2026-03-29T10:00:01.000Z',
      payload: {
        member: { member_token: 'guest-1', display_name: 'Guest', is_ready: true },
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.room?.status).toBe('live');
    expect(state.members).toHaveLength(1);
    expect(state.members[0].is_ready).toBe(true);
    expect(state.lastEventAt).toBe(new Date('2026-03-29T10:00:05.000Z').getTime());
  });

  it('ignores an older bundle snapshot so a late resync cannot roll the room back', () => {
    usePartyRoomStore.getState().setBundle({
      room: {
        id: 'room-1',
        room_code: 'ABC123',
        status: 'live',
        updated_at: '2026-03-29T10:00:05.000Z',
        current_match: { id: 'match-1', phase: 'reveal' },
      },
      members: [{ member_token: 'guest-1', display_name: 'Guest', is_ready: false }],
      answers: [{ round_id: 'round-1', member_token: 'guest-1' }],
    });

    usePartyRoomStore.getState().setBundle({
      room: {
        id: 'room-1',
        room_code: 'ABC123',
        status: 'live',
        updated_at: '2026-03-29T10:00:03.000Z',
        current_match: { id: 'match-1', phase: 'question' },
      },
      members: [{ member_token: 'guest-1', display_name: 'Guest', is_ready: true }],
      answers: [],
    });

    const state = usePartyRoomStore.getState();
    expect(state.room?.current_match?.phase).toBe('reveal');
    expect(state.members[0]?.is_ready).toBe(false);
    expect(state.answers).toHaveLength(1);
  });

  it('ignores an older room update event so delayed realtime packets cannot roll the phase back', () => {
    usePartyRoomStore.getState().setBundle({
      room: {
        id: 'room-1',
        room_code: 'ABC123',
        status: 'live',
        updated_at: '2026-03-29T10:00:05.000Z',
        current_match: { id: 'match-1', phase: 'reveal' },
      },
      members: [],
      answers: [],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'MATCH_ADVANCED',
      sentAt: '2026-03-29T10:00:06.000Z',
      payload: {
        room: {
          updated_at: '2026-03-29T10:00:04.000Z',
          current_match: { id: 'match-1', phase: 'vote' },
        },
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.room?.current_match?.phase).toBe('reveal');
  });

  it('upserts answer records by round and member when id is missing', () => {
    usePartyRoomStore.getState().setBundle({
      room: { id: 'room-1', room_code: 'ABC123' },
      members: [],
      answers: [],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'ANSWER_SUBMITTED',
      sentAt: '2026-03-29T10:00:02.000Z',
      payload: {
        answer: {
          round_id: 'round-1',
          member_token: 'guest-1',
          typed_song: 'Blue Bird',
        },
      },
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'ANSWER_SUBMITTED',
      sentAt: '2026-03-29T10:00:03.000Z',
      payload: {
        answer: {
          round_id: 'round-1',
          member_token: 'guest-1',
          typed_song: 'Blue Bird (edited)',
        },
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.answers).toHaveLength(1);
    expect(state.answers[0].typed_song).toBe('Blue Bird (edited)');
  });

  it('hydrates members from a room reset payload when provided', () => {
    usePartyRoomStore.getState().setBundle({
      room: { id: 'room-1', room_code: 'ABC123', status: 'finished' },
      members: [
        { member_token: 'host-1', display_name: 'Host', is_ready: false },
        { member_token: 'guest-1', display_name: 'Guest', is_ready: true },
      ],
      answers: [{ round_id: 'round-1', member_token: 'guest-1' }],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'ROOM_RESET',
      sentAt: '2026-03-29T10:00:04.000Z',
      payload: {
        room: { status: 'lobby', current_match: null },
        members: [
          { member_token: 'host-1', display_name: 'Host', is_ready: true },
          { member_token: 'guest-1', display_name: 'Guest', is_ready: false },
        ],
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.room?.status).toBe('lobby');
    expect(state.answers).toHaveLength(0);
    expect(state.members.find((member) => member.member_token === 'host-1')?.is_ready).toBe(true);
    expect(state.members.find((member) => member.member_token === 'guest-1')?.is_ready).toBe(false);
  });

  it('deduplicates chat messages by id when broadcast echoes back to the sender', () => {
    usePartyRoomStore.getState().setBundle({
      room: { id: 'room-1', room_code: 'ABC123' },
      members: [],
      answers: [],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'CHAT_MESSAGE',
      sentAt: '2026-03-29T10:00:02.000Z',
      payload: {
        message: {
          id: 'chat-1',
          scopeKey: 'battle-1:play-a',
          memberName: 'Guest',
          text: '🔥',
          sentAt: '2026-03-29T10:00:02.000Z',
        },
      },
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'CHAT_MESSAGE',
      sentAt: '2026-03-29T10:00:03.000Z',
      payload: {
        message: {
          id: 'chat-1',
          scopeKey: 'battle-1:play-a',
          memberName: 'Guest',
          text: '🔥',
          sentAt: '2026-03-29T10:00:03.000Z',
        },
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.chatMessages).toHaveLength(1);
    expect(state.chatMessages[0].id).toBe('chat-1');
  });

  it('clears chat messages on room reset', () => {
    usePartyRoomStore.setState({
      room: { id: 'room-1', room_code: 'ABC123', status: 'finished' },
      members: [],
      answers: [],
      chatMessages: [
        {
          id: 'chat-1',
          scopeKey: 'battle-1:play-a',
          memberName: 'Guest',
          text: 'Peak',
          sentAt: '2026-03-29T10:00:01.000Z',
        },
      ],
    });

    usePartyRoomStore.getState().applyEvent({
      type: 'ROOM_RESET',
      sentAt: '2026-03-29T10:00:04.000Z',
      payload: {
        room: { status: 'lobby', current_match: null },
        members: [],
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.chatMessages).toHaveLength(0);
  });
});
