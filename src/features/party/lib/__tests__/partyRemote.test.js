import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(async () => {}),
  operations: [],
  rpcCalls: [],
  rpcResultsByPage: new Map(),
  channels: [],
  partyRoomMembersUpdateResponse: null,
  partyRoomsUpdateResponse: [],
  partyRoomsSelectResponse: [],
  partyRoomAnswersSelectResponse: [],
  partyRoomAnswersSelectError: null,
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

function createPartyRoomAnswersSelectBuilder() {
  const filters = [];

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    then(resolve, reject) {
      mockState.operations.push({
        table: 'party_room_answers',
        action: 'select',
        filters: [...filters],
      });

      return Promise.resolve({
        data: mockState.partyRoomAnswersSelectResponse,
        error: mockState.partyRoomAnswersSelectError,
      }).then(resolve, reject);
    },
  };
}

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
    rpc: mockState.rpc,
    channel: mockState.channel,
    removeChannel: mockState.removeChannel,
  },
}));

import {
  __resetPartyRoomRealtimeRegistryForTests,
  __resetPartySongPoolCachesForTests,
  advancePartyRoom,
  extendPartyQuestionPhase,
  fetchPartySongPool,
  subscribeToPartyRoom,
  togglePartyMemberReady,
} from '../partyRemote.js';

describe('partyRemote realtime optimizations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T10:00:00.000Z'));

    mockState.operations = [];
    mockState.rpcCalls = [];
    mockState.rpcResultsByPage = new Map();
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
    mockState.partyRoomAnswersSelectResponse = [];
    mockState.partyRoomAnswersSelectError = null;
    mockState.channel.mockClear();
    mockState.channel.mockImplementation((topic) => createMockChannel(topic));
    mockState.rpc.mockClear();
    mockState.rpc.mockImplementation((fn, params = {}) => {
      mockState.rpcCalls.push({ fn, params });
      const page = Number(params?.p_page || 0);
      const result = mockState.rpcResultsByPage.get(page) || { data: [], error: null };
      return Promise.resolve(result);
    });
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

      if (table === 'party_room_answers') {
        return {
          select: vi.fn(() => createPartyRoomAnswersSelectBuilder()),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    __resetPartyRoomRealtimeRegistryForTests();
    __resetPartySongPoolCachesForTests();
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

  it('tallies vote records from DB before advancing a vote battle to reveal', async () => {
    mockState.partyRoomsSelectResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-1',
        modeType: 'vote',
        phase: 'vote',
        battleIndex: 1,
        totalBattles: 1,
        queue: [],
        allSongs: {
          'song-a': { id: 'song-a', songTitle: 'Song A' },
          'song-b': { id: 'song-b', songTitle: 'Song B' },
        },
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
          voteSummary: {
            songA_votes: 0,
            songB_votes: 0,
            total_votes: 0,
            winning_song_id: null,
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T09:59:40.000Z',
        phaseEndsAt: '2026-03-29T09:59:59.000Z',
      },
    }];
    mockState.partyRoomAnswersSelectResponse = [
      { selected_option_id: 'song-a' },
      { selected_option_id: 'song-a' },
      { selected_option_id: 'song-b' },
    ];
    mockState.partyRoomsUpdateResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:02.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-1',
        modeType: 'vote',
        phase: 'reveal',
        battleIndex: 1,
        totalBattles: 1,
        queue: ['song-a'],
        championSongId: null,
        allSongs: {
          'song-a': { id: 'song-a', songTitle: 'Song A' },
          'song-b': { id: 'song-b', songTitle: 'Song B' },
        },
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: 'song-a',
          voteSummary: {
            songA_votes: 2,
            songB_votes: 1,
            total_votes: 3,
            winning_song_id: 'song-a',
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T10:00:00.000Z',
        phaseEndsAt: '2026-03-29T10:00:06.000Z',
      },
    }];

    const room = {
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T09:59:00.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-1',
        modeType: 'vote',
        phase: 'vote',
        battleIndex: 1,
        totalBattles: 1,
        queue: [],
        allSongs: {},
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
          voteSummary: {
            songA_votes: 0,
            songB_votes: 0,
            total_votes: 0,
            winning_song_id: null,
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T09:59:40.000Z',
        phaseEndsAt: '2026-03-29T09:59:59.000Z',
      },
    };

    const nextRoom = await advancePartyRoom(room);

    expect(nextRoom?.current_match?.phase).toBe('reveal');
    expect(nextRoom?.current_match?.currentBattle?.winnerSongId).toBe('song-a');
    expect(nextRoom?.current_match?.currentBattle?.voteSummary).toEqual(expect.objectContaining({
      songA_votes: 2,
      songB_votes: 1,
      total_votes: 3,
      winning_song_id: 'song-a',
      is_tie: false,
    }));
    expect(mockState.operations.find((entry) => entry.table === 'party_room_answers' && entry.action === 'select')).toBeTruthy();
  });

  it('tallies votes correctly even when DB returns text ids and battle ids are numeric-like', async () => {
    mockState.partyRoomsSelectResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-2',
        modeType: 'vote',
        phase: 'vote',
        battleIndex: 1,
        totalBattles: 1,
        queue: [],
        allSongs: {
          '101': { id: '101', songTitle: 'Song A' },
          '202': { id: '202', songTitle: 'Song B' },
        },
        currentBattle: {
          id: 'battle-2',
          songA: 101,
          songB: 202,
          winnerSongId: null,
          voteSummary: {
            songA_votes: 0,
            songB_votes: 0,
            total_votes: 0,
            winning_song_id: null,
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T09:59:40.000Z',
        phaseEndsAt: '2026-03-29T09:59:59.000Z',
      },
    }];
    mockState.partyRoomAnswersSelectResponse = [
      { selected_option_id: '101' },
      { selected_option_id: '101' },
      { selected_option_id: '202' },
    ];
    mockState.partyRoomsUpdateResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:02.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-2',
        modeType: 'vote',
        phase: 'reveal',
        battleIndex: 1,
        totalBattles: 1,
        queue: ['101'],
        championSongId: null,
        allSongs: {
          '101': { id: '101', songTitle: 'Song A' },
          '202': { id: '202', songTitle: 'Song B' },
        },
        currentBattle: {
          id: 'battle-2',
          songA: '101',
          songB: '202',
          winnerSongId: '101',
          voteSummary: {
            songA_votes: 2,
            songB_votes: 1,
            total_votes: 3,
            winning_song_id: '101',
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T10:00:00.000Z',
        phaseEndsAt: '2026-03-29T10:00:06.000Z',
      },
    }];

    const room = {
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T09:59:00.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-2',
        modeType: 'vote',
        phase: 'vote',
        battleIndex: 1,
        totalBattles: 1,
        queue: [],
        allSongs: {},
        currentBattle: {
          id: 'battle-2',
          songA: 101,
          songB: 202,
          winnerSongId: null,
          voteSummary: {
            songA_votes: 0,
            songB_votes: 0,
            total_votes: 0,
            winning_song_id: null,
            is_tie: false,
          },
        },
        settings: { previewSec: 12, voteSec: 10, revealSec: 6, freezeMs: 1800 },
        phaseStartedAt: '2026-03-29T09:59:40.000Z',
        phaseEndsAt: '2026-03-29T09:59:59.000Z',
      },
    };

    const nextRoom = await advancePartyRoom(room);

    expect(nextRoom?.current_match?.currentBattle?.voteSummary).toEqual(expect.objectContaining({
      songA_votes: 2,
      songB_votes: 1,
      winning_song_id: '101',
    }));
  });

  it('stops fetching extra song pages once the pool is already playable', async () => {
    mockState.rpcResultsByPage.set(0, {
      data: Array.from({ length: 12 }, (_, index) => ({
        id: index + 1,
        theme_type: 'OP',
        song_title: `Song ${index + 1}`,
        artist_name: `Artist ${index + 1}`,
        is_creditless: false,
        video_url: `https://cdn.example.com/song-${index + 1}.mp4`,
        source_id: index + 1,
        source_canonical_title: `Title ${index + 1}`,
        source_aliases: [],
      })),
      error: null,
    });

    const songs = await fetchPartySongPool({
      modeType: 'quiz',
      presetId: 'party-classic',
      roundCount: 5,
      categoryId: 'all',
    });

    expect(songs).toHaveLength(12);
    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0]?.params?.p_page).toBe(0);
  });

  it('reuses the cached song pool for the same settings without hitting rpc again', async () => {
    mockState.rpcResultsByPage.set(0, {
      data: Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        theme_type: 'OP',
        song_title: `Song ${index + 1}`,
        artist_name: `Artist ${index + 1}`,
        is_creditless: false,
        video_url: `https://cdn.example.com/song-${index + 1}.mp4`,
        source_id: index + 1,
        source_canonical_title: `Title ${index + 1}`,
        source_aliases: [],
      })),
      error: null,
    });

    const settings = {
      modeType: 'vote',
      entrantCount: 4,
      categoryId: 'all',
    };

    const firstSongs = await fetchPartySongPool(settings);
    const secondSongs = await fetchPartySongPool(settings);

    expect(firstSongs).toEqual(secondSongs);
    expect(mockState.rpcCalls).toHaveLength(1);
  });

  it('extends the question phase so startup buffering does not eat answer time', async () => {
    mockState.partyRoomsSelectResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      current_match: {
        id: 'match-1',
        phase: 'question',
        roundIndex: 0,
        totalRounds: 1,
        timePerRoundSec: 12,
        answerGraceSec: 3,
        phaseStartedAt: '2026-03-29T10:00:00.000Z',
        phaseEndsAt: '2026-03-29T10:00:15.000Z',
        rounds: [{ id: 'round-1' }],
      },
    }];
    mockState.partyRoomsUpdateResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:02.000Z',
      current_match: {
        id: 'match-1',
        phase: 'question',
        roundIndex: 0,
        totalRounds: 1,
        timePerRoundSec: 12,
        answerGraceSec: 3,
        phaseStartedAt: '2026-03-29T10:00:00.000Z',
        playbackStartedAt: '2026-03-29T10:00:00.000Z',
        bufferCompensationMs: 2500,
        phaseEndsAt: '2026-03-29T10:00:17.500Z',
        rounds: [{ id: 'round-1' }],
      },
    }];

    const nextRoom = await extendPartyQuestionPhase({
      room: {
        id: 'room-1',
        host_member_token: 'host-1',
        status: 'live',
        current_match: {
          id: 'match-1',
          phase: 'question',
        },
      },
      expectedMatchId: 'match-1',
      expectedRoundId: 'round-1',
      extraMs: 2500,
    });

    expect(nextRoom?.current_match?.bufferCompensationMs).toBe(2500);
    expect(nextRoom?.current_match?.phaseEndsAt).toBe('2026-03-29T10:00:17.500Z');
    expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')?.payload?.current_match).toEqual(expect.objectContaining({
      bufferCompensationMs: 2500,
      phaseEndsAt: '2026-03-29T10:00:17.500Z',
    }));
  });
});
