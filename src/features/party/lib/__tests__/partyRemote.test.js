import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(async () => {}),
  functionsInvoke: vi.fn(),
  authGetSession: vi.fn(),
  authRefreshSession: vi.fn(),
  authGetUser: vi.fn(),
  authSignOut: vi.fn(),
  storageUpload: vi.fn(),
  storageGetPublicUrl: vi.fn(),
  operations: [],
  rpcCalls: [],
  rpcResultsByPage: new Map(),
  channels: [],
  partyRoomMembersUpdateResponse: null,
  partyRoomMembersSelectResponse: [],
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

function createPartyRoomMembersSelectBuilder() {
  const filters = [];

  return {
    eq(column, value) {
      filters.push({ type: 'eq', column, value });
      return this;
    },
    order() {
      mockState.operations.push({
        table: 'party_room_members',
        action: 'select',
        filters: [...filters],
      });
      return Promise.resolve({
        data: mockState.partyRoomMembersSelectResponse,
        error: null,
      });
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
    functions: {
      invoke: mockState.functionsInvoke,
    },
    auth: {
      getSession: mockState.authGetSession,
      refreshSession: mockState.authRefreshSession,
      getUser: mockState.authGetUser,
      signOut: mockState.authSignOut,
    },
    storage: {
      from: vi.fn(() => ({
        upload: mockState.storageUpload,
        getPublicUrl: mockState.storageGetPublicUrl,
      })),
    },
  },
}));

import {
  __resetPartyRoomRealtimeRegistryForTests,
  __resetPartySongPoolCachesForTests,
  advancePartyRoom,
  createPartyTemplate,
  extendPartyQuestionPhase,
  fetchPartySongPool,
  fetchPartyTemplateDetail,
  fetchPartyTemplates,
  getPartyGuestToken,
  replacePartyTemplateItems,
	  resolvePartyYoutubeUrl,
	  syncPartyTemplateYoutubePlaylist,
	  startPartyMatch,
	  submitPartySkipVote,
  subscribeToPartyRoom,
  togglePartyMemberReady,
  updatePartyRoomSettings,
  uploadPartyTemplateCover,
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
    mockState.partyRoomMembersSelectResponse = [];
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
    mockState.functionsInvoke.mockReset();
    mockState.authGetSession.mockReset();
    mockState.authRefreshSession.mockReset();
    mockState.authGetUser.mockReset();
    mockState.authSignOut.mockReset();
    mockState.storageUpload.mockReset();
    mockState.storageGetPublicUrl.mockReset();
    mockState.authGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token-123',
        },
      },
      error: null,
    });
    mockState.functionsInvoke.mockResolvedValue({
      data: null,
      error: null,
    });
    mockState.authRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'refreshed-token-456',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    mockState.authGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });
    mockState.authSignOut.mockResolvedValue({ error: null });
    mockState.storageUpload.mockResolvedValue({ error: null });
    mockState.storageGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/uploaded-cover.jpg' },
    });
    mockState.from.mockClear();
    mockState.from.mockImplementation((table) => {
      if (table === 'party_room_members') {
        return {
          update: vi.fn((payload) => createPartyRoomMembersUpdateBuilder(payload)),
          select: vi.fn(() => createPartyRoomMembersSelectBuilder()),
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

  it('updates room settings for the host while the room is still in the lobby', async () => {
    const originalWindow = global.window;
    const storage = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, String(value));
        },
      },
    };
    try {
      const hostToken = getPartyGuestToken();
      mockState.partyRoomsSelectResponse = [{
        id: 'room-1',
        host_member_token: hostToken,
        status: 'lobby',
        updated_at: '2026-03-29T10:00:01.000Z',
        settings: { modeType: 'quiz', roundCount: 10 },
      }];
      mockState.partyRoomsUpdateResponse = [{
        id: 'room-1',
        host_member_token: hostToken,
        status: 'lobby',
        updated_at: '2026-03-29T10:00:02.000Z',
        settings: { modeType: 'vote', entrantCount: 8, templateId: '42', templateName: 'Anime Night' },
      }];

      const nextRoom = await updatePartyRoomSettings(
        { id: 'room-1' },
        { modeType: 'vote', entrantCount: 8, templateId: '42', templateName: 'Anime Night' },
      );

      expect(nextRoom?.settings).toEqual(expect.objectContaining({
        modeType: 'vote',
        entrantCount: 8,
        templateId: '42',
        templateName: 'Anime Night',
      }));
      expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')?.filters).toEqual(expect.arrayContaining([
        { type: 'eq', column: 'id', value: 'room-1' },
        { type: 'eq', column: 'status', value: 'lobby' },
        { type: 'eq', column: 'updated_at', value: '2026-03-29T10:00:01.000Z' },
      ]));
    } finally {
      global.window = originalWindow;
    }
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

  it('records a skip vote on the current vote playback phase without advancing yet', async () => {
    mockState.partyRoomsSelectResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-1',
        modeType: 'vote',
        phase: 'play-a',
        battleIndex: 1,
        totalBattles: 2,
        queue: ['song-c', 'song-d'],
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
        },
      },
    }];
    mockState.partyRoomMembersSelectResponse = [
      { member_token: 'host-1' },
      { member_token: 'guest-1' },
      { member_token: 'guest-2' },
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
        phase: 'play-a',
        battleIndex: 1,
        totalBattles: 2,
        queue: ['song-c', 'song-d'],
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
          skipVotes: {
            phase: 'play-a',
            memberTokens: ['guest-1'],
            requiredVotes: 2,
          },
        },
      },
    }];

    const result = await submitPartySkipVote({
      room: {
        id: 'room-1',
        current_match: { id: 'vote-match-1' },
      },
      member: {
        member_token: 'guest-1',
        display_name: 'Guest 1',
      },
      battleId: 'battle-1',
    });

    expect(result).toEqual(expect.objectContaining({
      advanced: false,
      votes: 1,
      requiredVotes: 2,
    }));
    expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')?.payload?.current_match?.currentBattle?.skipVotes).toEqual({
      phase: 'play-a',
      memberTokens: ['guest-1'],
      requiredVotes: 2,
    });
  });

	  it('advances the room when skip votes reach the majority threshold', async () => {
    mockState.partyRoomsSelectResponse = [{
      id: 'room-1',
      host_member_token: 'host-1',
      status: 'live',
      updated_at: '2026-03-29T10:00:01.000Z',
      settings: { modeType: 'vote' },
      current_match: {
        id: 'vote-match-1',
        modeType: 'vote',
        phase: 'play-a',
        battleIndex: 1,
        totalBattles: 2,
        queue: ['song-c', 'song-d'],
        allSongs: {
          'song-a': { id: 'song-a' },
          'song-b': { id: 'song-b' },
        },
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
          skipVotes: {
            phase: 'play-a',
            memberTokens: ['host-1'],
            requiredVotes: 2,
          },
        },
        settings: { previewSec: 20, voteSec: 10, revealSec: 6, freezeMs: 1800 },
      },
    }];
    mockState.partyRoomMembersSelectResponse = [
      { member_token: 'host-1' },
      { member_token: 'guest-1' },
      { member_token: 'guest-2' },
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
        phase: 'intro-b',
        battleIndex: 1,
        totalBattles: 2,
        queue: ['song-c', 'song-d'],
        currentBattle: {
          id: 'battle-1',
          songA: 'song-a',
          songB: 'song-b',
          winnerSongId: null,
          skipVotes: {
            phase: 'play-a',
            memberTokens: ['host-1', 'guest-1'],
            requiredVotes: 2,
          },
        },
      },
    }];

    const result = await submitPartySkipVote({
      room: {
        id: 'room-1',
        current_match: { id: 'vote-match-1' },
      },
      member: {
        member_token: 'guest-1',
        display_name: 'Guest 1',
      },
      battleId: 'battle-1',
    });

    expect(result).toEqual(expect.objectContaining({
      advanced: true,
      votes: 2,
      requiredVotes: 2,
    }));
	    expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')?.payload?.current_match?.phase).toBe('intro-b');
	  });

	  it('rejects starting a template room when Party Classic source metadata is still incompatible', async () => {
	    mockState.partyRoomsSelectResponse = [{
	      id: 'room-1',
	      host_member_token: 'host-1',
	      status: 'lobby',
	      updated_at: '2026-03-29T10:00:01.000Z',
	      settings: {
	        templateId: '42',
	        modeType: 'quiz',
	        presetId: 'party-classic',
	        roundCount: 5,
	        timePerRoundSec: 12,
	        revealSec: 8,
	      },
	    }];
	    mockState.partyRoomMembersSelectResponse = [
	      { member_token: 'host-1', is_ready: true },
	      { member_token: 'guest-1', is_ready: true },
	    ];

	    const originalFrom = mockState.from.getMockImplementation();
	    mockState.from.mockImplementation((table) => {
	      if (table === 'party_song_template_items') {
	        return {
	          select: vi.fn(() => ({
	            eq: vi.fn(() => ({
	              order: vi.fn(() => Promise.resolve({
	                data: Array.from({ length: 5 }, (_, index) => ({
	                  id: index + 1,
	                  template_id: 42,
	                  song_id: 100 + index,
	                  source_title_id: index < 3 ? 501 : 502,
	                  source_title_name: index < 3 ? 'Shared Source A' : 'Shared Source B',
	                  song_title: `Song ${index + 1}`,
	                  theme_type: 'OP',
	                  artist_name: `Artist ${index + 1}`,
	                  media_url: `https://cdn.example.com/song-${index + 1}.mp4`,
	                  cover_url: '',
	                  position: index,
	                  provider: 'catalog',
	                  playback_status: 'ready',
	                })),
	                error: null,
	              })),
	            })),
	          })),
	        };
	      }

	      return originalFrom(table);
	    });

    await expect(startPartyMatch({ id: 'room-1' })).rejects.toThrow('distinct answer choices');
	    expect(mockState.operations.find((entry) => entry.table === 'party_rooms' && entry.action === 'update')).toBeFalsy();
	  });
	});

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

const SAMPLE_TEMPLATE_ROW = {
  id: 42,
  name: 'Anime Classics',
  description: 'Best OPs ever',
  cover_url: 'https://cdn.example.com/cover.jpg',
  visibility: 'public',
  mode_scope: 'all',
  default_preset_id: 'song-typing',
  source_type: 'catalog',
  is_official: false,
  owner_user_id: 'user-1',
  creator_name: 'Tester',
  like_count: 0,
  view_count: 0,
  tags: ['OP', 'anime'],
  created_at: '2026-03-31T00:00:00Z',
  updated_at: '2026-03-31T00:00:00Z',
  party_song_template_items: [{ count: 3 }],
};

const SAMPLE_ITEM_ROWS = [
  { id: 1, template_id: 42, song_id: 101, source_title_id: 55, source_title_name: 'Attack on Titan', song_title: 'Guren no Yumiya', theme_type: 'OP', artist_name: 'Linked Horizon', media_url: 'https://cdn.example.com/1.mp4', cover_url: '', position: 0 },
  { id: 2, template_id: 42, song_id: 102, source_title_id: 56, source_title_name: 'Naruto', song_title: 'Blue Bird', theme_type: 'OP', artist_name: 'Ikimono Gakari', media_url: 'https://cdn.example.com/2.mp4', cover_url: '', position: 1 },
  { id: 3, template_id: 42, song_id: 103, source_title_id: 57, source_title_name: 'Bleach', song_title: 'Asterisk', theme_type: 'OP', artist_name: 'Orange Range', media_url: 'https://cdn.example.com/3.mp4', cover_url: '', position: 2 },
];

// Build a reusable Supabase query-builder mock for template tables
function makeTemplateQueryBuilder({ selectData = null, selectError = null, insertData = null, insertError = null } = {}) {
  const filters = [];
  const builder = {
    _selectData: selectData,
    _insertData: insertData,
    select: vi.fn(function select() { return this; }),
    insert: vi.fn(function insert(payload) {
      mockState.operations.push({ table: this._table, action: 'insert', payload });
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: insertData, error: insertError })),
        })),
        then: (resolve) => resolve({ data: insertData, error: insertError }),
      };
    }),
    eq: vi.fn(function eq(col, val) {
      filters.push({ col, val });
      return this;
    }),
    order: vi.fn(function order() { return this; }),
    range: vi.fn(function range() { return this; }),
    in: vi.fn(function inFn() { return this; }),
    ilike: vi.fn(function ilike() { return this; }),
    maybeSingle: vi.fn(async () => ({ data: selectData, error: selectError })),
    then: (resolve) => resolve({ data: selectData, error: selectError }),
  };
  return builder;
}

describe('partyRemote template CRUD', () => {
  beforeEach(() => {
    mockState.operations = [];
    mockState.rpcCalls = [];
    mockState.rpc.mockClear();
    mockState.functionsInvoke.mockReset();
    mockState.authGetSession.mockReset();
    mockState.authRefreshSession.mockReset();
    mockState.authGetUser.mockReset();
    mockState.rpc.mockImplementation((fn, params = {}) => {
      mockState.rpcCalls.push({ fn, params });
      return Promise.resolve({ data: null, error: null });
    });
    mockState.from.mockClear();
    mockState.functionsInvoke.mockResolvedValue({
      data: null,
      error: null,
    });
    mockState.authGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token-123',
        },
      },
      error: null,
    });
    mockState.authRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'refreshed-token-456',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      },
      error: null,
    });
    mockState.authGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });

    // Default: template tables return sample data
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        const b = makeTemplateQueryBuilder({ selectData: SAMPLE_TEMPLATE_ROW });
        b._table = table;
        // single() for createPartyTemplate
        b.insert = vi.fn((payload) => {
          mockState.operations.push({ table, action: 'insert', payload });
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: SAMPLE_TEMPLATE_ROW, error: null })),
            })),
          };
        });
        return b;
      }

      if (table === 'party_song_template_items') {
        const b = makeTemplateQueryBuilder({ selectData: SAMPLE_ITEM_ROWS });
        b._table = table;
        b.insert = vi.fn((payload) => {
          mockState.operations.push({ table, action: 'insert', payload });
          return { then: (resolve) => resolve({ data: payload, error: null }) };
        });
        b.delete = vi.fn(() => {
          mockState.operations.push({ table, action: 'delete' });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        });
        return b;
      }

      if (table === 'user_profiles') {
        const b = makeTemplateQueryBuilder({ selectData: [] });
        b._table = table;
        return b;
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it('createPartyTemplate inserts header then items and returns mapped template', async () => {
    const result = await createPartyTemplate(
      { ownerUserId: 'user-1', name: 'Anime Classics', description: 'Best OPs ever', coverUrl: '', visibility: 'public', modeScope: 'all', presetId: 'song-typing', tags: ['OP'] },
      SAMPLE_ITEM_ROWS,
      'Tester',
    );

    // Header insert happened
    const headerInsert = mockState.operations.find((op) => op.table === 'party_song_templates' && op.action === 'insert');
    expect(headerInsert).toBeTruthy();
    expect(headerInsert.payload).toMatchObject({ name: 'Anime Classics', owner_user_id: 'user-1', default_preset_id: 'song-typing' });

    // Items insert happened
    const itemInsert = mockState.operations.find((op) => op.table === 'party_song_template_items' && op.action === 'insert');
    expect(itemInsert).toBeTruthy();

    // Returned shape is mapped (camelCase)
    expect(result).toMatchObject({ id: '42', name: 'Anime Classics', modeScope: 'all', presetId: 'song-typing' });
  });

  it('createPartyTemplate preserves YouTube provider fields on first save', async () => {
    const youtubeItems = [
      {
        provider: 'youtube',
        providerMediaId: 'abc123video',
        providerCollectionId: 'playlist42',
        providerUrl: 'https://www.youtube.com/watch?v=abc123video',
        sourceKind: 'youtube_playlist',
        playbackStatus: 'ready',
        songTitle: 'YT Song',
        artistName: 'YT Channel',
        coverUrl: 'https://i.ytimg.com/vi/abc123video/hqdefault.jpg',
        durationSec: 95,
        metadataJson: { availabilityReason: null },
        importedAt: '2026-03-31T12:00:00Z',
        importSourcePosition: 7,
      },
    ];

    await createPartyTemplate(
      { ownerUserId: 'user-1', name: 'YT Template', description: '', coverUrl: '', visibility: 'public', modeScope: 'all', presetId: 'song-typing', tags: [], sourceType: 'youtube' },
      youtubeItems,
      'Tester',
    );

    const itemInsert = mockState.operations.find((op) => op.table === 'party_song_template_items' && op.action === 'insert');
    expect(itemInsert).toBeTruthy();
    expect(itemInsert.payload[0]).toMatchObject({
      provider: 'youtube',
      provider_media_id: 'abc123video',
      provider_collection_id: 'playlist42',
      provider_url: 'https://www.youtube.com/watch?v=abc123video',
      source_kind: 'youtube_playlist',
      playback_status: 'ready',
      source_resolution_status: 'unresolved',
      source_match_confidence: 'low',
      source_match_method: 'youtube_title_parse',
      duration_sec: 95,
      metadata_json: { availabilityReason: null },
      imported_at: '2026-03-31T12:00:00Z',
      import_source_position: 7,
    });
  });

  it('syncPartyTemplateYoutubePlaylist preserves manual linked source mappings for existing videos', async () => {
    const templateRow = {
      ...SAMPLE_TEMPLATE_ROW,
      source_type: 'youtube',
      youtube_playlist_id: 'playlist42',
      youtube_source_url: 'https://www.youtube.com/playlist?list=playlist42',
    };
    const existingItemRows = [
      {
        id: 1,
        template_id: 42,
        provider: 'youtube',
        provider_media_id: 'keep-me-001',
        provider_collection_id: 'playlist42',
        provider_url: 'https://www.youtube.com/watch?v=keep-me-001',
        source_kind: 'youtube_playlist',
        playback_status: 'ready',
        song_title: 'Keep Song',
        artist_name: 'Uploader',
        source_title_id: 999,
        source_title_name: 'Manual Source',
        resolved_source_title_id: 999,
        resolved_source_title_name: 'Manual Source',
        source_resolution_status: 'linked',
        source_match_confidence: 'high',
        source_match_method: 'manual',
        cover_url: 'https://img.youtube.com/keep-me-001/hqdefault.jpg',
        position: 0,
      },
    ];

    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return {
          select: vi.fn(function select() { return this; }),
          eq: vi.fn(function eq() { return this; }),
          maybeSingle: vi.fn(async () => ({ data: templateRow, error: null })),
          update: vi.fn((payload) => {
            mockState.operations.push({ table, action: 'update', payload });
            return {
              eq: vi.fn(() => ({
                then: (resolve) => resolve({ data: null, error: null }),
              })),
            };
          }),
        };
      }

      if (table === 'party_song_template_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: existingItemRows, error: null })),
            })),
          })),
        };
      }

      if (table === 'user_profiles') {
        return {
          select: vi.fn(function select() { return this; }),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    mockState.functionsInvoke.mockResolvedValue({
      data: {
        type: 'playlist',
        playlist: {
          playlistId: 'playlist42',
          title: 'Playlist 42',
          channelTitle: 'Channel 42',
          thumbnailUrl: 'https://img.youtube.com/playlist42/hqdefault.jpg',
          totalItems: 2,
          nextPageToken: null,
          fetchedCount: 2,
          items: [
            {
              videoId: 'keep-me-001',
              title: 'Keep Song',
              channelTitle: 'Uploader',
              thumbnailUrl: 'https://img.youtube.com/keep-me-001/hqdefault.jpg',
              durationSec: 90,
              playbackStatus: 'ready',
              availabilityReason: null,
              embedUrl: 'https://www.youtube.com/embed/keep-me-001',
              watchUrl: 'https://www.youtube.com/watch?v=keep-me-001',
              playlistId: 'playlist42',
              importSourcePosition: 0,
            },
            {
              videoId: 'new-video-002',
              title: 'New Song',
              channelTitle: 'Uploader 2',
              thumbnailUrl: 'https://img.youtube.com/new-video-002/hqdefault.jpg',
              durationSec: 95,
              playbackStatus: 'ready',
              availabilityReason: null,
              embedUrl: 'https://www.youtube.com/embed/new-video-002',
              watchUrl: 'https://www.youtube.com/watch?v=new-video-002',
              playlistId: 'playlist42',
              importSourcePosition: 1,
            },
          ],
        },
      },
      error: null,
    });

    const result = await syncPartyTemplateYoutubePlaylist(42, [
      {
        provider: 'youtube',
        providerMediaId: 'keep-me-001',
        providerCollectionId: 'playlist42',
        providerUrl: 'https://www.youtube.com/watch?v=keep-me-001',
        sourceKind: 'youtube_playlist',
        playbackStatus: 'ready',
        songTitle: 'Keep Song',
        artistName: 'Uploader',
        sourceTitleId: 999,
        sourceTitleName: 'Manual Source',
        resolvedSourceTitleId: 999,
        resolvedSourceTitleName: 'Manual Source',
        sourceResolutionStatus: 'linked',
        sourceMatchConfidence: 'high',
        sourceMatchMethod: 'manual',
        coverUrl: 'https://img.youtube.com/keep-me-001/hqdefault.jpg',
      },
    ]);

    const rpcCall = mockState.rpcCalls.find((call) => call.fn === 'replace_party_template_items');
    expect(rpcCall).toBeTruthy();
    expect(rpcCall.params.p_items[0]).toMatchObject({
      provider_media_id: 'keep-me-001',
      resolved_source_title_id: '999',
      resolved_source_title_name: 'Manual Source',
      source_resolution_status: 'linked',
      source_match_confidence: 'high',
      source_match_method: 'manual',
    });
    expect(result.items[0]).toMatchObject({
      provider_media_id: 'keep-me-001',
      resolved_source_title_id: 999,
      resolved_source_title_name: 'Manual Source',
      source_resolution_status: 'linked',
    });
  });

  it('fetchPartyTemplates throws on Supabase error instead of returning []', async () => {
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return makeTemplateQueryBuilder({ selectData: null, selectError: { message: 'relation does not exist', code: '42P01' } });
      }
      if (table === 'user_profiles') {
        return {
          select: vi.fn(function select() { return this; }),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(fetchPartyTemplates()).rejects.toMatchObject({ message: 'relation does not exist' });
  });

  it('fetchPartyTemplates returns empty array when table exists but has no rows', async () => {
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return makeTemplateQueryBuilder({ selectData: [] });
      }
      if (table === 'user_profiles') {
        return {
          select: vi.fn(function select() { return this; }),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchPartyTemplates();
    expect(result).toEqual({ templates: [], total: 0 });
  });

  it('fetchPartyTemplateDetail throws with kind=not_found when row is missing', async () => {
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return makeTemplateQueryBuilder({ selectData: null, selectError: null }); // maybeSingle returns null
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const err = await fetchPartyTemplateDetail('99').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe('not_found');
  });

  it('fetchPartyTemplateDetail throws with kind=access_denied on RLS error', async () => {
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return makeTemplateQueryBuilder({ selectData: null, selectError: { message: 'permission denied', code: '42501' } });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const err = await fetchPartyTemplateDetail('42').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe('access_denied');
  });

  it('fetchPartyTemplateDetail returns template with items on success', async () => {
    mockState.from.mockImplementation((table) => {
      if (table === 'party_song_templates') {
        return makeTemplateQueryBuilder({ selectData: SAMPLE_TEMPLATE_ROW });
      }
      if (table === 'party_song_template_items') {
        return makeTemplateQueryBuilder({ selectData: SAMPLE_ITEM_ROWS });
      }
      if (table === 'user_profiles') {
        return {
          select: vi.fn(function select() { return this; }),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchPartyTemplateDetail('42');
    expect(result).toMatchObject({ id: '42', name: 'Anime Classics', presetId: 'song-typing' });
    expect(result.items).toHaveLength(3);
  });

  it('replacePartyTemplateItems calls replace_party_template_items RPC with correct args', async () => {
    const items = [
      { songId: 101, sourceTitleId: 55, sourceTitleName: 'AoT', songTitle: 'Guren', themeType: 'OP', artistName: 'LH', mediaUrl: 'https://cdn.example.com/1.mp4', coverUrl: '' },
      {
        provider: 'youtube',
        providerMediaId: 'yt-blue-bird',
        sourceTitleName: 'Naruto',
        resolvedSourceTitleId: 56,
        resolvedSourceTitleName: 'Naruto',
        sourceResolutionStatus: 'linked',
        sourceMatchConfidence: 'high',
        sourceMatchMethod: 'manual',
        songTitle: 'Blue Bird',
        themeType: 'OP',
        artistName: 'IG',
        coverUrl: '',
        playbackStatus: 'ready',
      },
    ];

    await replacePartyTemplateItems(42, items);

    const rpcCall = mockState.rpcCalls.find((c) => c.fn === 'replace_party_template_items');
    expect(rpcCall).toBeTruthy();
    expect(rpcCall.params.p_template_id).toBe(42);

    expect(Array.isArray(rpcCall.params.p_items)).toBe(true);
    expect(rpcCall.params.p_items).toHaveLength(2);
    expect(rpcCall.params.p_items[0]).toMatchObject({ song_id: '101', song_title: 'Guren', position: 0 });
    expect(rpcCall.params.p_items[1]).toMatchObject({
      song_id: '',
      provider_media_id: 'yt-blue-bird',
      resolved_source_title_id: '56',
      resolved_source_title_name: 'Naruto',
      source_resolution_status: 'linked',
      source_match_confidence: 'high',
      source_match_method: 'manual',
      position: 1,
    });
  });

  it('replacePartyTemplateItems throws when RPC returns an error', async () => {
    mockState.rpc.mockImplementation((fn, params) => {
      mockState.rpcCalls.push({ fn, params });
      if (fn === 'replace_party_template_items') {
        return Promise.resolve({ error: { message: 'transaction aborted', code: 'P0001' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(replacePartyTemplateItems(42, [{ songId: 1 }])).rejects.toMatchObject({
      message: 'transaction aborted',
    });
  });

  it('uploadPartyTemplateCover uploads into the party template cover bucket and returns a public url', async () => {
    const file = { name: 'cover.png' };
    const result = await uploadPartyTemplateCover('user-1', file);

    expect(mockState.storageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/template-cover-\d+\.png$/),
      file,
      expect.objectContaining({ cacheControl: '31536000', upsert: false }),
    );
    expect(result).toMatch(/^https:\/\/cdn\.example\.com\/uploaded-cover\.jpg\?t=\d+$/);
  });

  it('resolvePartyYoutubeUrl validates the current session before invoking the edge function', async () => {
    mockState.functionsInvoke.mockResolvedValue({
      data: { type: 'video', video: { videoId: 'p_ZH_oqoz7k' } },
      error: null,
    });

    await resolvePartyYoutubeUrl('https://www.youtube.com/watch?v=p_ZH_oqoz7k');

    expect(mockState.authGetSession).toHaveBeenCalled();
    expect(mockState.authGetUser).toHaveBeenCalledWith('access-token-123');
    expect(mockState.functionsInvoke).toHaveBeenCalledWith('party-youtube-resolve', expect.objectContaining({
      body: expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=p_ZH_oqoz7k',
      }),
    }));
  });

  it('resolvePartyYoutubeUrl forwards youtube shorts URLs unchanged', async () => {
    mockState.functionsInvoke.mockResolvedValue({
      data: { type: 'video', video: { videoId: 'Hc4OrO4LRWw' } },
      error: null,
    });

    await resolvePartyYoutubeUrl('https://www.youtube.com/shorts/Hc4OrO4LRWw?feature=share');

    expect(mockState.functionsInvoke).toHaveBeenCalledWith('party-youtube-resolve', expect.objectContaining({
      body: expect.objectContaining({
        url: 'https://www.youtube.com/shorts/Hc4OrO4LRWw?feature=share',
      }),
    }));
  });

  it('resolvePartyYoutubeUrl surfaces parsed function error payloads', async () => {
    mockState.functionsInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: vi.fn(async () => ({
            error: 'Missing auth token',
            code: 'auth_required',
          })),
        },
      },
    });

    await expect(resolvePartyYoutubeUrl('https://www.youtube.com/watch?v=p_ZH_oqoz7k')).rejects.toMatchObject({
      message: 'Missing auth token',
      code: 'auth_required',
    });
  });

  it('resolvePartyYoutubeUrl refreshes the session and retries once after an invalid JWT response', async () => {
    mockState.functionsInvoke
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            status: 401,
            json: vi.fn(async () => ({
              code: 401,
              message: 'Invalid JWT',
            })),
          },
        },
      })
      .mockResolvedValueOnce({
        data: { type: 'video', video: { videoId: 'Hc4OrO4LRWw' } },
        error: null,
      });

    const result = await resolvePartyYoutubeUrl('https://www.youtube.com/watch?v=Hc4OrO4LRWw');

    expect(result).toEqual({ type: 'video', video: { videoId: 'Hc4OrO4LRWw' } });
    expect(mockState.authRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockState.functionsInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      mockState.authGetUser.mock.calls.some(([token]) => token === 'refreshed-token-456'),
    ).toBe(true);
  });
});


