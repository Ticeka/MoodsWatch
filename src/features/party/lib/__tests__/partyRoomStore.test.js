import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePartyRoomStore } from '../partyRoomStore.js';

function resetStore() {
  usePartyRoomStore.setState({
    room: null,
    members: [],
    answers: [],
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

  it('ignores stale realtime events that arrive out of order', () => {
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
      type: 'ROOM_UPDATED',
      sentAt: '2026-03-29T10:00:01.000Z',
      payload: {
        room: { status: 'closed' },
      },
    });

    const state = usePartyRoomStore.getState();
    expect(state.room?.status).toBe('live');
    expect(state.lastEventAt).toBe(new Date('2026-03-29T10:00:05.000Z').getTime());
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
});
