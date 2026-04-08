import { supabase } from '@/shared/lib/supabase';
import {
  createPartySettings,
  generatePartyRoomCode,
} from '../lib/partyEngine.js';
import {
  broadcastPartyRoomEvent,
} from './partyRealtimeApi.js';
import {
  getPartyGuestToken,
  normalizePartyProfile,
  savePartyProfile,
} from './partyProfileApi.js';

export const PARTY_ROOM_SELECT = `
  id,
  room_code,
  room_name,
  visibility,
  status,
  host_member_token,
  settings,
  current_match,
  created_at,
  updated_at
`;

export const PARTY_ROOM_MEMBER_SELECT = `
  id,
  room_id,
  member_token,
  display_name,
  avatar_key,
  avatar_url,
  is_host,
  is_ready,
  joined_at,
  updated_at
`;

export const PARTY_ROOM_ANSWER_SELECT = `
  id,
  room_id,
  match_id,
  round_id,
  member_token,
  member_name,
  answer_mode,
  selected_option_id,
  typed_title,
  typed_song,
  title_correct,
  song_correct,
  points_awarded,
  elapsed_ms,
  submitted_at,
  updated_at
`;

const PARTY_ROOM_BROADCAST_FIELD_KEYS = [
  'room_code',
  'room_name',
  'visibility',
  'status',
  'host_member_token',
  'settings',
  'current_match',
  'updated_at',
];

function arePartyRoomBroadcastValuesEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left === 'object' || typeof right === 'object') {
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch {
      return false;
    }
  }

  return false;
}

export function buildPartyRoomRealtimePatch(nextRoom, previousRoom = null, { forceKeys = [] } = {}) {
  if (!nextRoom) {
    return null;
  }

  const patch = {
    id: nextRoom.id,
  };
  const forceKeySet = new Set(forceKeys);

  PARTY_ROOM_BROADCAST_FIELD_KEYS.forEach((key) => {
    if (!(key in nextRoom)) {
      return;
    }

    if (
      !previousRoom
      || forceKeySet.has(key)
      || !arePartyRoomBroadcastValuesEqual(previousRoom?.[key], nextRoom?.[key])
    ) {
      patch[key] = nextRoom[key];
    }
  });

  return patch;
}

export function hasMissingColumn(error, columnName) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(`column "${String(columnName || '').toLowerCase()}"`) || message.includes(`'${String(columnName || '').toLowerCase()}'`);
}

export function takeFirstRecord(records) {
  return Array.isArray(records) ? records[0] || null : records || null;
}

export async function fetchPartyRoomRecordById(roomId) {
  if (!supabase || !roomId) {
    return null;
  }

  const { data, error } = await supabase
    .from('party_rooms')
    .select(PARTY_ROOM_SELECT)
    .eq('id', roomId);

  if (error) {
    throw error;
  }

  return takeFirstRecord(data);
}

export async function fetchPartyRoomMembers(roomId) {
  if (!supabase || !roomId) {
    return [];
  }

  const { data, error } = await supabase
    .from('party_room_members')
    .select(PARTY_ROOM_MEMBER_SELECT)
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function fetchPartyRoomBundle(roomCode) {
  if (!supabase || !roomCode) {
    return null;
  }

  const normalizedCode = String(roomCode || '').trim().toUpperCase();
  const { data: room, error: roomError } = await supabase
    .from('party_rooms')
    .select(PARTY_ROOM_SELECT)
    .eq('room_code', normalizedCode)
    .maybeSingle();

  if (roomError) {
    throw roomError;
  }

  if (!room) {
    return null;
  }

  const [{ data: members, error: membersError }, { data: answers, error: answersError }] = await Promise.all([
    supabase
      .from('party_room_members')
      .select(PARTY_ROOM_MEMBER_SELECT)
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('party_room_answers')
      .select(PARTY_ROOM_ANSWER_SELECT)
      .eq('room_id', room.id)
      .order('submitted_at', { ascending: true }),
  ]);

  if (membersError) {
    throw membersError;
  }

  if (answersError) {
    throw answersError;
  }

  return {
    room,
    members: members || [],
    answers: answers || [],
  };
}

export async function createPartyRoom({ profile = {}, settings = {}, roomName = '', visibility = 'public' } = {}) {
  if (!supabase) {
    throw new Error('Supabase is unavailable.');
  }

  const memberToken = getPartyGuestToken();
  const normalizedProfile = normalizePartyProfile(profile, memberToken);
  const normalizedSettings = createPartySettings(settings);
  const normalizedRoomName = String(roomName || '').trim().slice(0, 60);
  const normalizedVisibility = visibility === 'private' ? 'private' : 'public';

  if (!normalizedProfile.displayName) {
    throw new Error('Display name is required.');
  }

  savePartyProfile(normalizedProfile);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generatePartyRoomCode();
    const { data: room, error: roomError } = await supabase
      .from('party_rooms')
      .insert({
        room_code: roomCode,
        status: 'lobby',
        host_member_token: memberToken,
        settings: normalizedSettings,
        current_match: null,
        room_name: normalizedRoomName,
        visibility: normalizedVisibility,
      })
      .select(PARTY_ROOM_SELECT)
      .single();

    if (roomError) {
      if (String(roomError?.message || '').toLowerCase().includes('duplicate')) {
        continue;
      }
      throw roomError;
    }

    const memberPayload = {
      room_id: room.id,
      member_token: memberToken,
      display_name: normalizedProfile.displayName,
      avatar_key: normalizedProfile.avatarKey,
      avatar_url: normalizedProfile.avatarUrl,
      is_host: true,
      is_ready: true,
    };

    let { error: memberError } = await supabase
      .from('party_room_members')
      .insert(memberPayload);

    if (memberError && hasMissingColumn(memberError, 'avatar_url')) {
      const { avatar_url: _avatarUrl, ...legacyPayload } = memberPayload;
      ({ error: memberError } = await supabase
        .from('party_room_members')
        .insert(legacyPayload));
    }

    if (memberError) {
      throw memberError;
    }

    return room;
  }

  throw new Error('Could not generate a unique room code.');
}

export async function updatePartyRoomSettings(room, settings = {}) {
  if (!supabase || !room?.id) {
    throw new Error('Invalid arguments.');
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom) {
    throw new Error('Room not found.');
  }

  if (freshRoom.status !== 'lobby') {
    throw new Error('Room settings can only be changed in the lobby.');
  }

  if (String(freshRoom.host_member_token || '') !== String(getPartyGuestToken() || '')) {
    throw new Error('Only the host can change room settings.');
  }

  const normalizedSettings = createPartySettings(settings);
  const { data, error } = await supabase
    .from('party_rooms')
    .update({
      settings: normalizedSettings,
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
    if (latestRoom?.status === 'lobby') {
      return latestRoom;
    }
    throw new Error('The room changed while saving settings. Please try again.');
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ROOM_UPDATED',
    payload: {
      room: buildPartyRoomRealtimePatch(nextRoom, freshRoom),
    },
  });

  return nextRoom;
}

export async function joinPartyRoom(roomCode, profile = {}) {
  if (!supabase) {
    throw new Error('Supabase is unavailable.');
  }

  const bundle = await fetchPartyRoomBundle(roomCode);
  if (!bundle?.room) {
    throw new Error('Room not found.');
  }

  const memberToken = getPartyGuestToken();
  const normalizedProfile = normalizePartyProfile(profile, memberToken);

  if (!normalizedProfile.displayName) {
    throw new Error('Display name is required.');
  }

  const existingMember = (bundle.members || []).find((member) => String(member.member_token || '') === memberToken);

  if (bundle.room.status !== 'lobby' && !existingMember) {
    throw new Error('This room is already in a live match.');
  }

  savePartyProfile(normalizedProfile);

  const payload = {
    room_id: bundle.room.id,
    member_token: memberToken,
    display_name: normalizedProfile.displayName,
    avatar_key: normalizedProfile.avatarKey,
    avatar_url: normalizedProfile.avatarUrl,
    is_host: Boolean(existingMember?.is_host),
    is_ready: Boolean(existingMember?.is_ready),
  };

  let { data: memberData, error } = await supabase
    .from('party_room_members')
    .upsert(payload, { onConflict: 'room_id,member_token' })
    .select(PARTY_ROOM_MEMBER_SELECT)
    .single();

  if (error && hasMissingColumn(error, 'avatar_url')) {
    const { avatar_url: _avatarUrl, ...legacyPayload } = payload;
    ({ data: memberData, error } = await supabase
      .from('party_room_members')
      .upsert(legacyPayload, { onConflict: 'room_id,member_token' })
      .select(PARTY_ROOM_MEMBER_SELECT)
      .single());
  }

  if (error) {
    throw error;
  }

  await broadcastPartyRoomEvent(bundle.room.id, {
    type: 'MEMBER_UPSERTED',
    payload: {
      member: memberData,
    },
  });

  return bundle.room;
}

export async function togglePartyMemberReady(roomId, memberToken, isReady) {
  if (!supabase || !roomId || !memberToken) {
    return null;
  }

  const { data, error } = await supabase
    .from('party_room_members')
    .update({ is_ready: Boolean(isReady) })
    .eq('room_id', roomId)
    .eq('member_token', memberToken)
    .select(PARTY_ROOM_MEMBER_SELECT)
    .single();

  if (error) {
    throw error;
  }

  await broadcastPartyRoomEvent(roomId, {
    type: 'MEMBER_UPSERTED',
    payload: {
      member: data,
    },
  });

  return data;
}

export async function leavePartyRoom({ room, memberToken } = {}) {
  if (!supabase || !room?.id || !memberToken) {
    return { room: room || null, roomClosed: false, memberRemoved: false };
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom) {
    return { room: null, roomClosed: true, memberRemoved: false };
  }

  const normalizedMemberToken = String(memberToken || '').trim();
  if (!normalizedMemberToken) {
    return { room: freshRoom, roomClosed: false, memberRemoved: false };
  }

  const { error: deleteError } = await supabase
    .from('party_room_members')
    .delete()
    .eq('room_id', freshRoom.id)
    .eq('member_token', normalizedMemberToken);

  if (deleteError) {
    throw deleteError;
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'MEMBER_REMOVED',
    payload: {
      memberToken: normalizedMemberToken,
    },
  });

  const remainingMembers = await fetchPartyRoomMembers(freshRoom.id);
  const shouldCloseRoom = remainingMembers.length === 0
    || String(freshRoom.host_member_token || '') === normalizedMemberToken;

  if (!shouldCloseRoom || freshRoom.status === 'closed') {
    return {
      room: freshRoom,
      roomClosed: false,
      memberRemoved: true,
      remainingMembers,
    };
  }

  const { data: closedRows, error: closeError } = await supabase
    .from('party_rooms')
    .update({ status: 'closed' })
    .eq('id', freshRoom.id)
    .neq('status', 'closed')
    .select(PARTY_ROOM_SELECT);

  if (closeError) {
    throw closeError;
  }

  const closedRoom = takeFirstRecord(closedRows) || (await fetchPartyRoomRecordById(freshRoom.id)) || freshRoom;

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'ROOM_CLOSED',
    payload: {
      room: buildPartyRoomRealtimePatch(closedRoom, freshRoom, { forceKeys: ['status', 'updated_at'] }),
    },
  });

  return {
    room: closedRoom,
    roomClosed: true,
    memberRemoved: true,
    remainingMembers,
  };
}

export async function closePartyRoom(room) {
  if (!supabase || !room?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from('party_rooms')
    .update({ status: 'closed' })
    .eq('id', room.id)
    .eq('host_member_token', room.host_member_token)
    .select(PARTY_ROOM_SELECT)
    .single();

  if (error) {
    throw error;
  }

  await broadcastPartyRoomEvent(room.id, {
    type: 'ROOM_CLOSED',
    payload: {
      room: buildPartyRoomRealtimePatch(data, room, { forceKeys: ['status', 'updated_at'] }),
    },
  });

  return data;
}

const PARTY_ROOM_STALE_LOBBY_MINUTES = 120;

export async function searchPublicPartyRooms({ query = '', mode = '', page = 0, pageSize = 20 } = {}) {
  if (!supabase) {
    return [];
  }

  const cutoff = new Date(Date.now() - PARTY_ROOM_STALE_LOBBY_MINUTES * 60 * 1000).toISOString();

  let req = supabase
    .from('party_rooms')
    .select('id, room_code, room_name, visibility, status, host_member_token, settings, created_at, updated_at')
    .eq('visibility', 'public')
    .eq('status', 'lobby')
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (query) {
    req = req.ilike('room_name', `%${query}%`);
  }

  if (mode === 'quiz' || mode === 'vote') {
    req = req.contains('settings', { modeType: mode });
  }

  const { data, error } = await req;
  if (error) {
    throw error;
  }

  const rooms = Array.isArray(data) ? data : [];
  if (rooms.length === 0) {
    return [];
  }

  const roomIds = rooms
    .map((room) => room?.id)
    .filter(Boolean);

  if (roomIds.length === 0) {
    return [];
  }

  const { data: members, error: membersError } = await supabase
    .from('party_room_members')
    .select('room_id')
    .in('room_id', roomIds);

  if (membersError) {
    throw membersError;
  }

  const memberCountByRoomId = new Map();
  (members || []).forEach((member) => {
    const key = String(member?.room_id || '');
    if (!key) return;
    memberCountByRoomId.set(key, (memberCountByRoomId.get(key) || 0) + 1);
  });

  return rooms.filter((room) => (memberCountByRoomId.get(String(room?.id || '')) || 0) > 0);
}

export async function updatePartyRoomAccess(roomId, { roomName, visibility } = {}) {
  if (!supabase || !roomId) {
    throw new Error('Invalid arguments.');
  }

  const patch = {};
  if (roomName !== undefined) {
    patch.room_name = String(roomName || '').trim().slice(0, 60);
  }
  if (visibility === 'public' || visibility === 'private') {
    patch.visibility = visibility;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const { error } = await supabase
    .from('party_rooms')
    .update(patch)
    .eq('id', roomId);

  if (error) {
    throw error;
  }
}
