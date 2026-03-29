import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(async () => {}),
  operations: [],
  channels: [],
  partyRoomMembersUpdateResponse: null,
  partyRoomsUpdateResponse: [],
  partyRoomsSelectResponse: [],
}));

function createMockChannel(topic) {
  const channel = {
    topic,
    on: vi.fn(function on() {
      return this;
    }),
    subscribe: vi.fn(function subscribe(callback) {
      this._statusCallback = callback;
      callback?.('SUBSCRIBED');
      return this;
    }),
    send: vi.fn(async () => ({ status: 'ok' })),
  };

  mockState.channels.push(channel);
  return channel;
}

function createPartyRoomMembersUpdateBuilder(payload) {
  const filters = [];

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    select() {
      return {
        single: async () => {
          mockState.operations.push({
            table: 'party_room_members',
            action: 'update',
            payload,
            filters: [...filters],
          });
          return {
            data: mockState.partyRoomMembersUpdateResponse,
            error: null,
          };
        },
      };
    },
  };
}

function createPartyRoomsUpdateBuilder(payload) {
  const filters = [];

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    select() {
      mockState.operations.push({
        table: 'party_rooms',
        action: 'update',
        payload,
        filters: [...filters],
      });
      return Promise.resolve({
        data: mockState.partyRoomsUpdateResponse,
        error: null,
      });
    },
  };
}

function createPartyRoomsSelectBuilder() {
  const filters = [];

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return Promise.resolve({
        data: mockState.partyRoomsSelectResponse,
        error: null,
      }).then((result) => {
        mockState.operations.push({
          table: 'party_rooms',
          action: 'select',
          filters: [...filters],
        });
        return result;
      });
    },
  };
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
    channel: mockState.channel,
    removeChannel: mockState.removeChannel,
  },
}));

import {
  __resetPartyRoomRealtimeRegistryForTests,
  advancePartyRoom,
  subscribeToPartyRoom,
  togglePartyMemberReady,
} from '../partyRemote.js';

describe('partyRemote realtime optimizations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T10:00:00.000Z'));

    mockState.operations = [];
    mockState.channels = [];
    mockState.partyRoomMembersUpdateResponse = {
      id: 'member-1',
      room_id: 'room-1',
      member_token: 'guest-1',
      display_name: 'Guest 1',
      is_ready: true,
    };
    mockState.partyRoomsUpdateResponse = [];
    mockState.partyRoomsSelectResponse = [];
    mockState.channel.mockClear();
    mockState.channel.mockImplementation((topic) => createMockChannel(topic));
    mockState.removeChannel.mockClear();
    mockState.from.mockClear();
    mockState.from.mockImplementation((table) => {
      if (table === 'party_room_members') {
        return {
          update: vi.fn((payload) => createPartyRoomMembersUpdateBuilder(payload)),
        };
      }

      if (table === 'party_rooms') {
        return {
          update: vi.fn((payload) => createPartyRoomsUpdateBuilder(payload)),
          select: vi.fn(() => createPartyRoomsSelectBuilder()),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    __resetPartyRoomRealtimeRegistryForTests();
  });

  it('reuses the subscribed room channel for member broadcasts', async () => {
    const unsubscribe = subscribeToPartyRoom('room-1', vi.fn(), vi.fn());

    await togglePartyMemberReady('room-1', 'guest-1', true);

    expect(mockState.channel).toHaveBeenCalledTimes(1);
    expect(mockState.channels[0]?.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'broadcast',
      event: 'party-room-event',
      payload: expect.objectContaining({
        type: 'MEMBER_UPSERTED',
      }),
    }));

    unsubscribe();
  });

  it('advances from the local room snapshot before falling back to a refetch', async () => {
    mockState.partyRoomsUpdateResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      current_match: {
        id: 'match-1',
        phase: 'reveal',
        roundIndex: 0,
        totalRounds: 1,
        timePerRoundSec: 12,
        answerGraceSec: 3,
        revealSec: 12,
        phaseStartedAt: '2026-03-29T10:00:00.000Z',
        phaseEndsAt: '2026-03-29T10:00:12.000Z',
        rounds: [{ id: 'round-1' }],
      },
    }];

    const room = {
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T09:59:00.000Z',
      current_match: {
        id: 'match-1',
        phase: 'question',
        roundIndex: 0,
        totalRounds: 1,
        timePerRoundSec: 12,
        answerGraceSec: 3,
        revealSec: 12,
        phaseStartedAt: '2026-03-29T09:58:00.000Z',
        phaseEndsAt: '2026-03-29T09:58:15.000Z',
        rounds: [{ id: 'round-1' }],
      },
    };

    const nextRoom = await advancePartyRoom(room);

    expect(nextRoom?.current_match?.phase).toBe('reveal');
    expect(mockState.operations.filter((entry) => entry.table === 'party_rooms' && entry.action === 'select')).toHaveLength(0);
    expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')?.filters).toEqual(expect.arrayContaining([
      { type: 'eq', column: 'id', value: 'room-1' },
      { type: 'eq', column: 'updated_at', value: '2026-03-29T09:59:00.000Z' },
    ]));
  });
});
