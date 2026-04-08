import { supabase } from '@/shared/lib/supabase';
import {
  buildPartyMatchSnapshot,
  buildPartyTitleGuessSnapshot,
  buildUniquePartyAliases,
  createPartySettings,
  getPartyPhaseEndsAtMs,
  getPartyRequiredReadyCount,
  getPartyCurrentRound,
  getPartyPresetById,
  isPartyAnswerWindowOpen,
  isDirectPartyMediaUrl,
  isPartyPhaseExpired,
  scorePartyAnswer,
  advancePartyMatch,
} from '../lib/partyEngine.js';
import {
  buildPartyVoteSnapshot,
  advancePartyVoteMatch,
} from '../lib/partyModeVote.js';
import {
  PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS,
} from '../lib/partyTemplateSchema.js';
import {
  analyzePartyTemplateCompatibility,
} from '../lib/partyTemplateUtils.js';
import {
  __resetPartyRoomRealtimeRegistryForTests,
  broadcastPartyRoomEvent,
  subscribeToPartyRoom,
  subscribeToPartyRoomJoinRequests,
} from './partyRealtimeApi.js';
import {
  getPartyBackendHint,
  getPartyGuestToken,
  readPartyProfile,
  savePartyProfile,
} from './partyProfileApi.js';
import {
  buildPartyRoomRealtimePatch,
  closePartyRoom,
  createPartyRoom,
  fetchPartyRoomBundle,
  fetchPartyRoomMembers,
  fetchPartyRoomRecordById,
  PARTY_ROOM_ANSWER_SELECT,
  PARTY_ROOM_SELECT,
  joinPartyRoom,
  leavePartyRoom,
  searchPublicPartyRooms,
  takeFirstRecord,
  togglePartyMemberReady,
  updatePartyRoomAccess,
  updatePartyRoomSettings,
} from './partyRoomApi.js';
import {
  approvePartyRoomJoin,
  cancelPartyRoomJoinRequest,
  fetchPartyRoomJoinRequests,
  rejectPartyRoomJoin,
  requestPartyRoomJoin,
} from './partyJoinRequestApi.js';
import {
  __resetPartyTitleGuessCachesForTests,
  createPartyTitleGuessSet,
  fetchPartyTitleGuessCharacters,
  fetchPartyTitleGuessQuestionPool,
  fetchPartyTitleGuessSetDetail,
  fetchPartyTitleGuessSets,
  updatePartyTitleGuessSet,
} from './partyTitleGuessApi.js';
import {
  __resetPartyTemplateCachesForTests,
  fetchPartyPresetSongPool,
  fetchPartyTemplateSongPool,
  fetchPublishedPartySongPresets,
  fetchPartyTemplates,
  fetchPartyTemplateDetail,
  uploadPartyTemplateCover,
  createPartyTemplate,
  updatePartyTemplate,
  deletePartyTemplate,
  replacePartyTemplateItems,
  resolvePartyYoutubeUrl,
  importPartyTemplateYoutubeVideo,
  importPartyTemplateYoutubePlaylist,
  syncPartyTemplateYoutubePlaylist,
  clonePartyTemplate,
  togglePartyTemplateLike,
  checkPartyTemplateLiked,
  recordPartyTemplateView,
  searchPartyThemeSongs,
  searchPartyTemplateCatalog,
  searchPartySourceTitles,
  suggestPartyTemplateItemSource,
} from './partyTemplateApi.js';

export {
  __resetPartyRoomRealtimeRegistryForTests,
  approvePartyRoomJoin,
  cancelPartyRoomJoinRequest,
  closePartyRoom,
  createPartyTitleGuessSet,
  createPartyRoom,
  fetchPartyRoomBundle,
  fetchPartyRoomJoinRequests,
  fetchPartyRoomMembers,
  fetchPublishedPartySongPresets,
  fetchPartyTemplateSongPool,
  fetchPartyTemplates,
  fetchPartyTemplateDetail,
  uploadPartyTemplateCover,
  createPartyTemplate,
  updatePartyTemplate,
  deletePartyTemplate,
  replacePartyTemplateItems,
  resolvePartyYoutubeUrl,
  importPartyTemplateYoutubeVideo,
  importPartyTemplateYoutubePlaylist,
  syncPartyTemplateYoutubePlaylist,
  clonePartyTemplate,
  togglePartyTemplateLike,
  checkPartyTemplateLiked,
  recordPartyTemplateView,
  searchPartyThemeSongs,
  searchPartyTemplateCatalog,
  searchPartySourceTitles,
  suggestPartyTemplateItemSource,
  fetchPartyTitleGuessCharacters,
  fetchPartyTitleGuessSetDetail,
  fetchPartyTitleGuessSets,
  joinPartyRoom,
  leavePartyRoom,
  subscribeToPartyRoom,
  subscribeToPartyRoomJoinRequests,
  getPartyBackendHint,
  getPartyGuestToken,
  rejectPartyRoomJoin,
  readPartyProfile,
  requestPartyRoomJoin,
  savePartyProfile,
  searchPublicPartyRooms,
  togglePartyMemberReady,
  updatePartyRoomAccess,
  updatePartyRoomSettings,
  updatePartyTitleGuessSet,
};

const PARTY_SONG_POOL_PAGE_SIZE = 60;
const PARTY_SONG_POOL_MAX_PAGES = 3;
const PARTY_SONG_POOL_CACHE_TTL_MS = 2 * 60 * 1000;
const partySongPoolCache = new Map();

async function fetchPartyVoteSummary(roomId, matchId, roundId, songA, songB) {
  if (!supabase || !roomId || !matchId || !roundId) {
    return null;
  }

  const normalizedSongA = String(songA || '');
  const normalizedSongB = String(songB || '');

  try {
    const { data, error } = await supabase.rpc('get_party_vote_summary', {
      p_room_id: roomId,
      p_match_id: String(matchId),
      p_round_id: String(roundId),
      p_song_a: normalizedSongA,
      p_song_b: normalizedSongB,
    });

    if (error) {
      throw error;
    }

    const summary = Array.isArray(data) ? data[0] : data;
    if (!summary) {
      throw new Error('Vote summary RPC returned no rows.');
    }

    return {
      songA_votes: Number(summary.song_a_votes || 0),
      songB_votes: Number(summary.song_b_votes || 0),
      total_votes: Number(summary.total_votes || 0),
      is_tie: Boolean(summary.is_tie),
      winning_song_id: String(summary.winning_song_id || ''),
    };
  } catch (error) {
    console.warn('Falling back to client vote tally', error);
  }

  const { data: voteRecords, error: voteRecordsError } = await supabase
    .from('party_room_answers')
    .select('selected_option_id')
    .eq('room_id', roomId)
    .eq('match_id', String(matchId))
    .eq('round_id', String(roundId));

  if (voteRecordsError) {
    throw voteRecordsError;
  }

  const songA_votes = (voteRecords || []).filter((vote) => String(vote?.selected_option_id || '') === normalizedSongA).length;
  const songB_votes = (voteRecords || []).filter((vote) => String(vote?.selected_option_id || '') === normalizedSongB).length;
  const total_votes = (voteRecords || []).length;
  const is_tie = songA_votes === songB_votes;
  let winning_song_id;

  if (songA_votes > songB_votes) {
    winning_song_id = normalizedSongA;
  } else if (songB_votes > songA_votes) {
    winning_song_id = normalizedSongB;
  } else {
    const tieHash = Array.from(String(roundId)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    winning_song_id = tieHash % 2 === 0 ? normalizedSongA : normalizedSongB;
  }

  return {
    songA_votes,
    songB_votes,
    total_votes,
    is_tie,
    winning_song_id,
  };
}

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function __resetPartySongPoolCachesForTests() {
  partySongPoolCache.clear();
  __resetPartyTitleGuessCachesForTests();
  __resetPartyTemplateCachesForTests();
}

function getPartyBattleSkipState(match, phase) {
  const skipVotes = match?.currentBattle?.skipVotes;
  if (!skipVotes || skipVotes.phase !== phase) {
    return {
      phase,
      memberTokens: [],
      requiredVotes: 0,
    };
  }

  return {
    phase,
    memberTokens: Array.isArray(skipVotes.memberTokens)
      ? [...new Set(skipVotes.memberTokens.map((token) => String(token || '')).filter(Boolean))]
      : [],
    requiredVotes: Math.max(0, Number(skipVotes.requiredVotes || 0)),
  };
}

function getPartySkipVoteThreshold(memberCount) {
  const normalizedCount = Math.max(1, Number(memberCount || 0));
  return Math.max(1, Math.floor(normalizedCount / 2) + 1);
}

function pickSourceTitleName(sourceAliases = [], fallbackTitle = '') {
  const aliases = Array.isArray(sourceAliases) ? sourceAliases : [];
  const thai = aliases.find((entry) => entry?.language_code === 'th')?.alias;
  const english = aliases.find((entry) => entry?.alias_type === 'english' || entry?.language_code === 'en')?.alias;
  return thai || english || fallbackTitle || '';
}

function mapPartySongRow(row) {
  const sourceAliases = Array.isArray(row?.source_aliases) ? row.source_aliases : [];
  const sourceTitleName = pickSourceTitleName(sourceAliases, row?.source_canonical_title);
  const sourceTitleAliases = buildUniquePartyAliases([
    row?.source_canonical_title,
    sourceTitleName,
    ...sourceAliases.map((entry) => entry?.alias),
  ]);

  return {
    id: Number(row?.id || 0),
    themeType: row?.theme_type || 'OP',
    songTitle: row?.song_title || '',
    songAliases: buildUniquePartyAliases([row?.song_title]),
    artistName: row?.artist_name || '',
    isCreditless: Boolean(row?.is_creditless),
    mediaUrl: row?.video_url || '',
    sourceTitleId: Number(row?.source_id || row?.canonical_title_id || 0),
    sourceTitleName,
    sourceTitleAliases,
    coverUrl: row?.source_cover_image || row?.source_banner_image || '',
    sourceAvgScore: Number(row?.source_avg_score || 0) || 0,
    sourcePopularityScore: Number(row?.source_popularity_score || 0) || 0,
    previewStartSec: 0,
  };
}

function filterSongsByCategory(songs = [], categoryId = 'all') {
  if (categoryId === 'op') {
    return songs.filter((song) => song.themeType === 'OP');
  }

  if (categoryId === 'ed') {
    return songs.filter((song) => song.themeType === 'ED');
  }

  if (categoryId === 'creditless') {
    return songs.filter((song) => song.isCreditless);
  }

  return songs;
}

function buildPartySongPoolCacheKey(settings = {}) {
  const normalizedSettings = createPartySettings(settings);
  return JSON.stringify({
    modeType: normalizedSettings.modeType,
    presetId: normalizedSettings.presetId,
    roundCount: normalizedSettings.roundCount,
    entrantCount: normalizedSettings.entrantCount,
    categoryId: normalizedSettings.categoryId,
    songPresetId: normalizedSettings.songPresetId,
    keyword: normalizedSettings.keyword,
  });
}

function getPartySongPoolCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.promise) {
    return entry;
  }

  if (Number(entry.expiresAt || 0) > Date.now()) {
    return entry;
  }

  cache.delete(key);
  return null;
}

async function getOrCreatePartySongPoolCacheValue(cache, key, loader) {
  const cachedEntry = getPartySongPoolCacheEntry(cache, key);
  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (cachedEntry?.value) {
    return cachedEntry.value;
  }

  const task = Promise.resolve().then(loader);
  cache.set(key, { promise: task });

  try {
    const value = await task;
    cache.set(key, {
      value,
      expiresAt: Date.now() + PARTY_SONG_POOL_CACHE_TTL_MS,
    });
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

function canBuildPartySnapshotFromPool(playablePool = [], settings = {}) {
  try {
    const normalizedSettings = createPartySettings(settings);
    if (normalizedSettings.modeType === 'vote') {
      buildPartyVoteSnapshot(playablePool, normalizedSettings);
      return true;
    }

    buildPartyMatchSnapshot(playablePool, normalizedSettings);
    return true;
  } catch {
    return false;
  }
}

export async function fetchPartySongPool(settings = {}) {
  if (!supabase) {
    return [];
  }

  const normalizedSettings = createPartySettings(settings);
  if (normalizedSettings.modeType === 'title-guess') {
    return [];
  }
  if (normalizedSettings.templateId) {
    return fetchPartyTemplateSongPool(normalizedSettings.templateId);
  }
  if (normalizedSettings.songPresetId) {
    return fetchPartyPresetSongPool(normalizedSettings.songPresetId);
  }

  const cacheKey = buildPartySongPoolCacheKey(normalizedSettings);
  return getOrCreatePartySongPoolCacheValue(partySongPoolCache, cacheKey, async () => {
    const songMap = new Map();
    let playablePool = [];

    for (let page = 0; page < PARTY_SONG_POOL_MAX_PAGES; page += 1) {
      const { data, error } = await supabase.rpc('search_battle_theme_songs', {
        p_query: normalizedSettings.keyword || '',
        p_show_adult: false,
        p_hidden_title_ids: [],
        p_page: page,
        p_page_size: PARTY_SONG_POOL_PAGE_SIZE,
      });

      if (error) {
        throw error;
      }

      (data || [])
        .map(mapPartySongRow)
        .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl))
        .forEach((song) => {
          songMap.set(song.id, song);
        });

      playablePool = filterSongsByCategory([...songMap.values()], normalizedSettings.categoryId);
      if (canBuildPartySnapshotFromPool(playablePool, normalizedSettings)) {
        break;
      }

      if ((data || []).length < PARTY_SONG_POOL_PAGE_SIZE) {
        break;
      }
    }

    return playablePool;
  });
}

export async function startPartyMatch(room) {
  if (!supabase || !room?.id) {
    return null;
  }

  const [freshRoom, freshMembers] = await Promise.all([
    fetchPartyRoomRecordById(room.id),
    fetchPartyRoomMembers(room.id),
  ]);
  if (!freshRoom) {
    throw new Error('Room not found.');
  }

  if (freshRoom.status !== 'lobby') {
    return freshRoom;
  }

  const requiredReadyCount = getPartyRequiredReadyCount(freshMembers.length);
  const readyCount = freshMembers.filter((member) => member.is_ready).length;
  if (requiredReadyCount > 0 && readyCount < requiredReadyCount) {
    throw new Error('Not enough ready players to start the match yet.');
  }

  const settings = createPartySettings(freshRoom.settings || {});
  let snapshot = null;

  if (settings.modeType === 'title-guess') {
    const questionPool = await fetchPartyTitleGuessQuestionPool(settings);
    snapshot = buildPartyTitleGuessSnapshot(questionPool, settings);
  } else {
    const pool = await fetchPartySongPool(settings);
    if (settings.templateId) {
      const compatibility = analyzePartyTemplateCompatibility(pool, settings);
      if (!compatibility.targetResult?.compatible) {
        throw new Error(
          compatibility.targetResult?.blockingReasons?.[0]?.message
          || 'This template is not ready for the selected mode yet.'
        );
      }
    }

    snapshot = settings.modeType === 'vote'
      ? buildPartyVoteSnapshot(pool, settings)
      : buildPartyMatchSnapshot(pool, settings);
  }

  const { data, error } = await supabase
    .from('party_rooms')
    .update({
      status: 'live',
      current_match: snapshot,
    })
    .eq('id', freshRoom.id)
    .eq('host_member_token', freshRoom.host_member_token)
    .eq('status', 'lobby')
    .eq('updated_at', freshRoom.updated_at)
    .select(PARTY_ROOM_SELECT);

  if (error) {
    throw error;
  }

  const nextRoom = takeFirstRecord(data);
  if (!nextRoom) {
    const latestRoom = await fetchPartyRoomRecordById(room.id);
    if (latestRoom?.status === 'live' && latestRoom?.current_match) {
      return latestRoom;
    }
    throw new Error('The room changed while starting the match. Please try again.');
  }

  const nonHostTokens = freshMembers
    .filter((member) => String(member.member_token || '') !== String(freshRoom.host_member_token || ''))
    .map((member) => String(member.member_token || ''))
    .filter(Boolean);

  if (nonHostTokens.length > 0) {
    const { error: readyResetError } = await supabase
      .from('party_room_members')
      .update({ is_ready: false })
      .eq('room_id', freshRoom.id)
      .in('member_token', nonHostTokens);

    if (readyResetError) {
      throw readyResetError;
    }
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ROOM_UPDATED',
    payload: {
      room: buildPartyRoomRealtimePatch(nextRoom, freshRoom),
    },
  });

  if (nonHostTokens.length > 0) {
    await broadcastPartyRoomEvent(freshRoom.id, {
      type: 'MEMBERS_PATCHED',
      payload: {
        memberTokens: nonHostTokens,
        patch: { is_ready: false },
      },
    });
  }

  if (settings.modeType === 'title-guess') {
    const setId = Number(settings.titleGuessSetId || 0);
    if (setId > 0) {
      void (async () => {
        try {
          await supabase.rpc('increment_party_title_guess_play_count', { p_set_id: setId });
        } catch (error) {
          console.warn('Failed to increment title guess play count', error);
        }
      })();
    }
  }

  return nextRoom;
}

export async function extendPartyQuestionPhase({
  room,
  expectedMatchId = '',
  expectedRoundId = '',
  extraMs = 0,
} = {}) {
  if (!supabase || !room?.id || !room?.current_match) {
    return room || null;
  }

  const extensionMs = Math.max(0, Math.min(8000, Math.round(Number(extraMs || 0))));
  if (!extensionMs) {
    return room;
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match || freshRoom.current_match.phase !== 'question') {
    return freshRoom || room;
  }

  const currentRound = getPartyCurrentRound(freshRoom.current_match);
  if (!currentRound) {
    return freshRoom;
  }

  if (expectedMatchId && String(freshRoom.current_match.id || '') !== String(expectedMatchId || '')) {
    return freshRoom;
  }

  if (expectedRoundId && String(currentRound.id || '') !== String(expectedRoundId || '')) {
    return freshRoom;
  }

  const currentEndsAtMs = getPartyPhaseEndsAtMs(freshRoom.current_match);
  if (!currentEndsAtMs) {
    return freshRoom;
  }

  const currentCompensationMs = Math.max(0, Number(freshRoom.current_match.bufferCompensationMs || 0));
  const nextCompensationMs = Math.max(currentCompensationMs, extensionMs);
  const additionalMs = nextCompensationMs - currentCompensationMs;
  if (!additionalMs) {
    return freshRoom;
  }

  const nextMatch = {
    ...freshRoom.current_match,
    playbackStartedAt: freshRoom.current_match.playbackStartedAt || new Date().toISOString(),
    bufferCompensationMs: nextCompensationMs,
    phaseEndsAt: new Date(currentEndsAtMs + additionalMs).toISOString(),
  };

  const { data, error } = await supabase
    .from('party_rooms')
    .update({
      current_match: nextMatch,
    })
    .eq('id', freshRoom.id)
    .eq('host_member_token', freshRoom.host_member_token)
    .eq('status', freshRoom.status)
    .eq('updated_at', freshRoom.updated_at)
    .select(PARTY_ROOM_SELECT);

  if (error) {
    throw error;
  }

  const nextRoom = takeFirstRecord(data);
  if (!nextRoom) {
    return (await fetchPartyRoomRecordById(room.id)) || freshRoom;
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ROOM_UPDATED',
    payload: {
      room: buildPartyRoomRealtimePatch(nextRoom, freshRoom),
    },
  });

  return nextRoom;
}

export async function advancePartyRoom(room) {
  if (!supabase || !room?.id || !room.current_match) {
    return room;
  }

  const activeModeType = room.current_match?.modeType || room.settings?.modeType;
  const isVotePlaybackPhase = activeModeType === 'vote'
    && (room.current_match?.phase === 'play-a' || room.current_match?.phase === 'play-b');

  if (!isVotePlaybackPhase && (!getPartyPhaseEndsAtMs(room.current_match) || !isPartyPhaseExpired(room.current_match))) {
    return room;
  }

  const isVoteMode = activeModeType === 'vote';
  const needsVoteTally = isVoteMode && room.current_match?.phase === 'vote';

  // For vote->reveal transition we MUST read DB before writing, so skip optimistic path.
  if (!needsVoteTally) {
    const localNextMatch = isVoteMode
      ? advancePartyVoteMatch(room.current_match)
      : advancePartyMatch(room.current_match);
    const localNextStatus = localNextMatch?.phase === 'final' ? 'finished' : 'live';
    const { data: optimisticData, error: optimisticError } = await supabase
      .from('party_rooms')
      .update({
        status: localNextStatus,
        current_match: localNextMatch,
      })
      .eq('id', room.id)
      .eq('host_member_token', room.host_member_token)
      .eq('status', room.status)
      .eq('updated_at', room.updated_at)
      .select(PARTY_ROOM_SELECT);

    if (optimisticError) {
      throw optimisticError;
    }

    const optimisticRoom = takeFirstRecord(optimisticData);
    if (optimisticRoom) {
      await broadcastPartyRoomEvent(room.id, {
        type: 'MATCH_ADVANCED',
        payload: { room: buildPartyRoomRealtimePatch(optimisticRoom, room, { forceKeys: ['status', 'current_match', 'updated_at'] }) },
      });
      return optimisticRoom;
    }
  }

  // --- Fresh path (always for vote tally, fallback for quiz) ---
  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match) {
    return freshRoom || room;
  }

  const freshModeType = freshRoom.current_match?.modeType || freshRoom.settings?.modeType;
  const isFreshVotePlaybackPhase = freshModeType === 'vote'
    && (freshRoom.current_match?.phase === 'play-a' || freshRoom.current_match?.phase === 'play-b');

  if (!isFreshVotePlaybackPhase && (!getPartyPhaseEndsAtMs(freshRoom.current_match) || !isPartyPhaseExpired(freshRoom.current_match))) {
    return freshRoom;
  }

  // Authoritative vote tally from DB before advancing to reveal.
  if (freshModeType === 'vote' && freshRoom.current_match?.phase === 'vote') {
    const battleId = freshRoom.current_match.currentBattle.id;
    const songA = freshRoom.current_match.currentBattle.songA;
    const songB = freshRoom.current_match.currentBattle.songB;

    const voteSummary = await fetchPartyVoteSummary(
      freshRoom.id,
      freshRoom.current_match.id,
      battleId,
      songA,
      songB,
    );

    freshRoom.current_match.currentBattle.voteSummary = {
      songA_votes: Number(voteSummary?.songA_votes || 0),
      songB_votes: Number(voteSummary?.songB_votes || 0),
      total_votes: Number(voteSummary?.total_votes || 0),
      winning_song_id: String(voteSummary?.winning_song_id || ''),
      is_tie: Boolean(voteSummary?.is_tie),
    };
    freshRoom.current_match.currentBattle.winnerSongId = String(voteSummary?.winning_song_id || '');
  }

  const nextMatch = freshModeType === 'vote'
    ? advancePartyVoteMatch(freshRoom.current_match)
    : advancePartyMatch(freshRoom.current_match);
  const nextStatus = nextMatch?.phase === 'final' ? 'finished' : 'live';

  const { data, error } = await supabase
    .from('party_rooms')
    .update({
      status: nextStatus,
      current_match: nextMatch,
    })
    .eq('id', freshRoom.id)
    .eq('host_member_token', freshRoom.host_member_token)
    .eq('status', freshRoom.status)
    .eq('updated_at', freshRoom.updated_at)
    .select(PARTY_ROOM_SELECT);

  if (error) {
    throw error;
  }

  const nextRoom = takeFirstRecord(data);
  if (!nextRoom) {
    return (await fetchPartyRoomRecordById(room.id)) || freshRoom;
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'MATCH_ADVANCED',
    payload: { room: buildPartyRoomRealtimePatch(nextRoom, freshRoom, { forceKeys: ['status', 'current_match', 'updated_at'] }) },
  });

  return nextRoom;
}

export async function resetPartyRoom(room) {
  if (!supabase || !room?.id) {
    return { room, members: [] };
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom) {
    return { room: null, members: [] };
  }

  const { data, error: roomError } = await supabase
    .from('party_rooms')
    .update({ status: 'lobby', current_match: null })
    .eq('id', freshRoom.id)
    .eq('host_member_token', freshRoom.host_member_token)
    .eq('updated_at', freshRoom.updated_at)
    .select(PARTY_ROOM_SELECT);

  if (roomError) {
    throw roomError;
  }

  const roomData = takeFirstRecord(data);
  if (!roomData) {
    const latestRoom = await fetchPartyRoomRecordById(room.id);
    const latestMembers = await fetchPartyRoomMembers(room.id);
    if (latestRoom?.status === 'lobby' && !latestRoom?.current_match) {
      return { room: latestRoom, members: latestMembers };
    }
    throw new Error('The room changed while resetting. Please try again.');
  }

  const [{ error: answersError }, { error: readyError }] = await Promise.all([
    supabase
      .from('party_room_answers')
      .delete()
      .eq('room_id', freshRoom.id),
    supabase
      .from('party_room_members')
      .update({ is_ready: false })
      .eq('room_id', freshRoom.id),
  ]);

  if (answersError) {
    throw answersError;
  }

  if (readyError) {
    throw readyError;
  }

  if (freshRoom.host_member_token) {
    const { error: hostReadyError } = await supabase
      .from('party_room_members')
      .update({ is_ready: true })
      .eq('room_id', freshRoom.id)
      .eq('member_token', freshRoom.host_member_token);

    if (hostReadyError) {
      throw hostReadyError;
    }
  }

  const members = await fetchPartyRoomMembers(freshRoom.id);

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ROOM_RESET',
    payload: {
      room: buildPartyRoomRealtimePatch(roomData, freshRoom, { forceKeys: ['status', 'current_match', 'updated_at'] }),
      members,
    },
  });

  return {
    room: roomData,
    members,
  };
}

export async function submitPartyAnswer({
  room,
  member,
  payload = {},
  expectedMatchId = '',
  expectedRoundId = '',
} = {}) {
  if (!supabase || !room?.id || !member?.member_token || !room?.current_match) {
    return null;
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match) {
    throw new Error('This room is no longer active.');
  }

  const preset = getPartyPresetById(freshRoom.current_match.presetId);
  const round = getPartyCurrentRound(freshRoom.current_match);
  if (!round) {
    throw new Error('This round is unavailable.');
  }

  if (expectedMatchId && String(freshRoom.current_match.id || '') !== String(expectedMatchId || '')) {
    throw new Error('This round has already advanced.');
  }

  if (expectedRoundId && String(round.id || '') !== String(expectedRoundId || '')) {
    throw new Error('This round has already advanced.');
  }

  if (!isPartyAnswerWindowOpen(freshRoom.current_match)) {
    throw new Error('This round is already closed.');
  }

  const { data: existingAnswer, error: existingAnswerError } = await supabase
    .from('party_room_answers')
    .select(PARTY_ROOM_ANSWER_SELECT)
    .eq('room_id', freshRoom.id)
    .eq('match_id', freshRoom.current_match.id)
    .eq('round_id', round.id)
    .eq('member_token', member.member_token)
    .maybeSingle();

  if (existingAnswerError) {
    throw existingAnswerError;
  }

  if (
    existingAnswer
    && (
      existingAnswer.selected_option_id
      || String(existingAnswer.typed_title || '').trim()
      || String(existingAnswer.typed_song || '').trim()
    )
  ) {
    return existingAnswer;
  }

  const now = Date.now();
  const phaseStartedAt = new Date(freshRoom.current_match.phaseStartedAt || now).getTime();
  const elapsedMs = Math.max(0, now - phaseStartedAt);
  const timeLimitMs = (
    Number(freshRoom.current_match.timePerRoundSec || 12)
    + Number(freshRoom.current_match.answerGraceSec || 0)
  ) * 1000;
  const score = scorePartyAnswer({
    presetId: preset.id,
    round: {
      ...round,
      revealedClueCount: Number(freshRoom.current_match.revealedClueCount || 0) || 1,
    },
    selectedOptionId: payload.selectedOptionId,
    typedTitle: payload.typedTitle,
    typedSong: payload.typedSong,
    selectedFranchiseAnswerKey: payload.selectedFranchiseAnswerKey,
    elapsedMs,
    timeLimitMs,
  });

  const { data, error } = await supabase
    .from('party_room_answers')
    .upsert({
      room_id: freshRoom.id,
      match_id: freshRoom.current_match.id,
      round_id: round.id,
      member_token: member.member_token,
      member_name: member.display_name,
      answer_mode: preset.answerMode,
      selected_option_id: payload.selectedOptionId || null,
      typed_title: String(payload.typedTitle || '').trim() || null,
      typed_song: String(payload.typedSong || '').trim() || null,
      title_correct: Boolean(score.titleCorrect),
      song_correct: Boolean(score.songCorrect),
      points_awarded: Number(score.points || 0),
      elapsed_ms: elapsedMs,
      submitted_at: new Date(now).toISOString(),
    }, { onConflict: 'round_id,member_token' })
    .select(PARTY_ROOM_ANSWER_SELECT)
    .single();

  if (error) {
    throw error;
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ANSWER_SUBMITTED',
    payload: {
      answer: data,
    },
  });

  return data;
}

export async function submitPartyVote({
  room,
  member,
  battleId,
  selectedSongId,
} = {}) {
  if (!supabase || !room?.id || !member?.member_token || !room?.current_match) {
    return null;
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match || freshRoom.settings?.modeType !== 'vote') {
    throw new Error('This room is not in an active vote battle.');
  }

  const currentBattle = freshRoom.current_match.currentBattle;
  if (!currentBattle || String(currentBattle.id) !== String(battleId)) {
    throw new Error('This battle has already advanced.');
  }

  if (freshRoom.current_match.phase !== 'vote') {
    throw new Error('Voting is currently closed.');
  }

  const now = Date.now();
  const phaseStartedAt = new Date(freshRoom.current_match.phaseStartedAt || now).getTime();
  const elapsedMs = Math.max(0, now - phaseStartedAt);

  const { data, error } = await supabase
    .from('party_room_answers')
    .upsert({
      room_id: freshRoom.id,
      match_id: freshRoom.current_match.id,
      round_id: currentBattle.id,
      member_token: member.member_token,
      member_name: member.display_name,
      // Reuse the existing "choice" answer mode so vote records work with the
      // current party_room_answers schema without requiring a live DB migration first.
      answer_mode: 'choice',
      selected_option_id: String(selectedSongId || ''),
      title_correct: false,
      song_correct: false,
      points_awarded: 0,
      elapsed_ms: elapsedMs,
      submitted_at: new Date(now).toISOString(),
    }, { onConflict: 'round_id,member_token' })
    .select(PARTY_ROOM_ANSWER_SELECT)
    .single();

  if (error) {
    throw error;
  }

  // Optionally broadcast but we can rely on standard channel if configured, or just skip broadcasting individual votes to prevent live bias
  return data;
}

export async function submitPartySkipVote({
  room,
  member,
  battleId,
} = {}) {
  if (!supabase || !room?.id || !member?.member_token || !room?.current_match) {
    return null;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const freshRoom = await fetchPartyRoomRecordById(room.id);
    if (!freshRoom?.current_match || freshRoom.settings?.modeType !== 'vote') {
      throw new Error('This room is not in an active vote battle.');
    }

    const currentBattle = freshRoom.current_match.currentBattle;
    const currentPhase = freshRoom.current_match.phase;
    if (!currentBattle || String(currentBattle.id) !== String(battleId)) {
      throw new Error('This battle has already advanced.');
    }

    if (currentPhase !== 'play-a' && currentPhase !== 'play-b') {
      throw new Error('Skipping is only available while a song is playing.');
    }

    const members = await fetchPartyRoomMembers(freshRoom.id);
    const requiredVotes = getPartySkipVoteThreshold(members.length);
    const skipState = getPartyBattleSkipState(freshRoom.current_match, currentPhase);
    const voterToken = String(member.member_token || '');

    if (skipState.memberTokens.includes(voterToken)) {
      return {
        room: freshRoom,
        votes: skipState.memberTokens.length,
        requiredVotes: requiredVotes || skipState.requiredVotes,
        advanced: false,
        alreadyVoted: true,
      };
    }

    const memberTokens = [...skipState.memberTokens, voterToken];
    const nextBattle = {
      ...currentBattle,
      skipVotes: {
        phase: currentPhase,
        memberTokens,
        requiredVotes,
      },
    };

    const shouldAdvance = memberTokens.length >= requiredVotes;
    const nextMatch = shouldAdvance
      ? advancePartyVoteMatch({
        ...freshRoom.current_match,
        currentBattle: nextBattle,
      })
      : {
        ...freshRoom.current_match,
        currentBattle: nextBattle,
      };
    const nextStatus = shouldAdvance && nextMatch?.phase === 'final' ? 'finished' : freshRoom.status;

    const { data, error } = await supabase
      .from('party_rooms')
      .update({
        status: nextStatus,
        current_match: nextMatch,
      })
      .eq('id', freshRoom.id)
      .eq('status', freshRoom.status)
      .eq('updated_at', freshRoom.updated_at)
      .select(PARTY_ROOM_SELECT);

    if (error) {
      throw error;
    }

    const nextRoom = takeFirstRecord(data);
    if (!nextRoom) {
      continue;
    }

    await broadcastPartyRoomEvent(freshRoom.id, {
      type: shouldAdvance ? 'MATCH_ADVANCED' : 'ROOM_UPDATED',
      payload: {
        room: buildPartyRoomRealtimePatch(
          nextRoom,
          freshRoom,
          { forceKeys: shouldAdvance ? ['status', 'current_match', 'updated_at'] : ['current_match', 'updated_at'] },
        ),
      },
    });

    return {
      room: nextRoom,
      votes: memberTokens.length,
      requiredVotes,
      advanced: shouldAdvance,
      alreadyVoted: false,
    };
  }

  throw new Error('This battle changed while recording the skip vote. Please try again.');
}

export async function submitPartyLiveChatMessage({
  room,
  member,
  battleId,
  phase,
  text,
  messageId,
} = {}) {
  if (!supabase || !room?.id || !member?.member_token) {
    return null;
  }

  const normalizedText = String(text || '').trim();
  const normalizedPhase = String(phase || '').trim();
  const normalizedBattleId = String(battleId || '').trim();
  const normalizedMessageId = String(messageId || makeId('party-chat')).trim();

  if (!normalizedText || !normalizedBattleId || !normalizedPhase || !normalizedMessageId) {
    return null;
  }

  if (normalizedPhase !== 'play-a' && normalizedPhase !== 'play-b') {
    throw new Error('Live chat is only available while media is playing.');
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  const currentMatch = freshRoom?.current_match || null;
  const currentBattle = currentMatch?.currentBattle || null;
  const currentPhase = String(currentMatch?.phase || '').trim();

  if (!currentMatch || freshRoom.settings?.modeType !== 'vote') {
    throw new Error('This room is not in an active vote battle.');
  }

  if (currentPhase !== normalizedPhase) {
    throw new Error('This chat moment has already moved on.');
  }

  if (!currentBattle || String(currentBattle.id || '') !== normalizedBattleId) {
    throw new Error('This battle has already advanced.');
  }

  const message = {
    id: normalizedMessageId,
    roomId: String(freshRoom.id || ''),
    battleId: normalizedBattleId,
    phase: normalizedPhase,
    scopeKey: `${normalizedBattleId}:${normalizedPhase}`,
    memberToken: String(member.member_token || ''),
    memberName: String(member.display_name || member.memberName || 'Player').trim() || 'Player',
    avatarKey: String(member.avatar_key || member.avatarKey || 'rose').trim() || 'rose',
    avatarUrl: String(member.avatar_url || member.avatarUrl || '').trim(),
    text: normalizedText,
    sentAt: new Date().toISOString(),
  };

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'CHAT_MESSAGE',
    payload: {
      message,
    },
  });

  return message;
}
