import { supabase } from '@/shared/lib/supabase';
import {
  getPartyGuestToken,
  normalizePartyProfile,
  savePartyProfile,
} from './partyProfileApi.js';

export async function requestPartyRoomJoin(roomId, profile = {}) {
  if (!supabase || !roomId) {
    throw new Error('Invalid arguments.');
  }

  const requesterToken = getPartyGuestToken();
  const normalizedProfile = normalizePartyProfile(profile, requesterToken);

  if (!normalizedProfile.displayName) {
    throw new Error('Display name is required.');
  }

  savePartyProfile(normalizedProfile);

  const { data, error } = await supabase
    .from('party_room_join_requests')
    .upsert({
      room_id: roomId,
      requester_token: requesterToken,
      requester_name: normalizedProfile.displayName,
      requester_avatar_key: normalizedProfile.avatarKey || 'rose',
      status: 'pending',
    }, { onConflict: 'room_id,requester_token' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function cancelPartyRoomJoinRequest(requestId) {
  if (!supabase || !requestId) {
    throw new Error('Invalid arguments.');
  }

  const { error } = await supabase
    .from('party_room_join_requests')
    .delete()
    .eq('id', requestId);

  if (error) {
    throw error;
  }
}

export async function fetchPartyRoomJoinRequests(roomId) {
  if (!supabase || !roomId) {
    return [];
  }

  const { data, error } = await supabase
    .from('party_room_join_requests')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function approvePartyRoomJoin(requestId, roomId, requesterToken, requesterName, requesterAvatarKey) {
  if (!supabase || !requestId || !roomId || !requesterToken) {
    throw new Error('Invalid arguments.');
  }

  const { error: requestError } = await supabase
    .from('party_room_join_requests')
    .update({ status: 'approved' })
    .eq('id', requestId);

  if (requestError) {
    throw requestError;
  }

  const { error: memberError } = await supabase
    .from('party_room_members')
    .upsert({
      room_id: roomId,
      member_token: requesterToken,
      display_name: requesterName,
      avatar_key: requesterAvatarKey || 'rose',
      is_host: false,
      is_ready: false,
    }, { onConflict: 'room_id,member_token' });

  if (memberError) {
    throw memberError;
  }
}

export async function rejectPartyRoomJoin(requestId) {
  if (!supabase || !requestId) {
    throw new Error('Invalid arguments.');
  }

  const { error } = await supabase
    .from('party_room_join_requests')
    .update({ status: 'rejected' })
    .eq('id', requestId);

  if (error) {
    throw error;
  }
}
