import { supabase } from '@/shared/lib/supabase';

const PARTY_ROOM_EVENT = 'party-room-event';
const PARTY_ROOM_CHANNEL_READY_TIMEOUT_MS = 1600;
const partyRoomRealtimeRegistry = new Map();

function getPartyRoomChannelName(roomId) {
  return `party-room-${roomId}`;
}

function createPartyRoomReadyPromise() {
  let resolve = () => {};
  let reject = () => {};
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  promise.catch(() => null);

  return { promise, resolve, reject };
}

function getPartyRoomRealtimeEntry(roomId, { create = false } = {}) {
  const key = String(roomId || '').trim();
  if (!key) {
    return null;
  }

  if (!partyRoomRealtimeRegistry.has(key) && create) {
    const ready = createPartyRoomReadyPromise();
    partyRoomRealtimeRegistry.set(key, {
      channel: null,
      status: 'CLOSED',
      readyPromise: ready.promise,
      resolveReady: ready.resolve,
      rejectReady: ready.reject,
    });
  }

  return partyRoomRealtimeRegistry.get(key) || null;
}

function resetPartyRoomRealtimeEntry(entry) {
  if (!entry) {
    return;
  }

  const ready = createPartyRoomReadyPromise();
  entry.readyPromise = ready.promise;
  entry.resolveReady = ready.resolve;
  entry.rejectReady = ready.reject;
}

function registerPartyRoomRealtimeChannel(roomId, channel) {
  const entry = getPartyRoomRealtimeEntry(roomId, { create: true });
  if (!entry) {
    return null;
  }

  entry.channel = channel;
  entry.status = 'JOINING';
  resetPartyRoomRealtimeEntry(entry);
  return entry;
}

function updatePartyRoomRealtimeChannelStatus(roomId, channel, status) {
  const entry = getPartyRoomRealtimeEntry(roomId);
  if (!entry || entry.channel !== channel) {
    return;
  }

  entry.status = status;
  if (status === 'SUBSCRIBED') {
    entry.resolveReady?.(channel);
    entry.resolveReady = null;
    entry.rejectReady = null;
    return;
  }

  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    entry.rejectReady?.(new Error(`Party room channel is ${status.toLowerCase()}.`));
    resetPartyRoomRealtimeEntry(entry);
  }
}

function unregisterPartyRoomRealtimeChannel(roomId, channel) {
  const key = String(roomId || '').trim();
  const entry = getPartyRoomRealtimeEntry(key);
  if (!entry || (channel && entry.channel !== channel)) {
    return;
  }

  entry.resolveReady?.(null);
  entry.resolveReady = null;
  entry.rejectReady = null;
  partyRoomRealtimeRegistry.delete(key);
}

async function disposePartyRealtimeChannel(channel, status = '') {
  if (!channel) {
    return;
  }

  const normalizedStatus = String(status || '').trim().toUpperCase();

  try {
    if (normalizedStatus === 'SUBSCRIBED' || normalizedStatus === 'CHANNEL_ERROR' || normalizedStatus === 'TIMED_OUT') {
      await supabase?.removeChannel?.(channel);
      return;
    }

    if (typeof channel.unsubscribe === 'function') {
      await channel.unsubscribe();
    }
  } catch {
    // Ignore cleanup noise during fast remounts in development.
  }
}

function buildPartyRoomBroadcastPayload(event) {
  return {
    type: 'broadcast',
    event: PARTY_ROOM_EVENT,
    payload: {
      ...event,
      sentAt: new Date().toISOString(),
    },
  };
}

async function sendPartyRoomBroadcast(channel, event) {
  if (!channel?.send) {
    return false;
  }

  await channel.send(buildPartyRoomBroadcastPayload(event));
  return true;
}

async function waitForRegisteredPartyRoomChannel(roomId, timeoutMs = PARTY_ROOM_CHANNEL_READY_TIMEOUT_MS) {
  const entry = getPartyRoomRealtimeEntry(roomId);
  if (!entry?.channel) {
    return null;
  }

  if (entry.status === 'SUBSCRIBED') {
    return entry.channel;
  }

  if (!entry.readyPromise) {
    resetPartyRoomRealtimeEntry(entry);
  }

  let timeoutId = null;
  try {
    return await Promise.race([
      entry.readyPromise.catch(() => null),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function createTransientPartyRoomChannel(roomId, timeoutMs = PARTY_ROOM_CHANNEL_READY_TIMEOUT_MS) {
  const channel = supabase.channel(getPartyRoomChannelName(roomId));
  let timeoutId = null;

  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new Error('Timed out waiting for the party room channel to subscribe.'));
      }, timeoutMs);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (!settled) {
            settled = true;
            reject(new Error(`Party room channel subscribe failed with status ${status}.`));
          }
        }
      });
    });

    return channel;
  } catch (error) {
    await supabase.removeChannel(channel);
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function __resetPartyRoomRealtimeRegistryForTests() {
  partyRoomRealtimeRegistry.forEach((entry) => {
    entry.rejectReady?.(new Error('Party room channel registry reset.'));
  });
  partyRoomRealtimeRegistry.clear();
}

export async function broadcastPartyRoomEvent(roomId, event) {
  if (!supabase || !roomId || !event?.type) {
    return;
  }

  try {
    const registeredChannel = await waitForRegisteredPartyRoomChannel(roomId);
    if (registeredChannel) {
      try {
        await sendPartyRoomBroadcast(registeredChannel, event);
        return;
      } catch (error) {
        console.warn('Registered party room channel send failed. Falling back to a transient channel.', error);
      }
    }

    const transientChannel = await createTransientPartyRoomChannel(roomId);
    try {
      await sendPartyRoomBroadcast(transientChannel, event);
    } finally {
      await supabase.removeChannel(transientChannel);
    }
  } catch (error) {
    console.error('Failed to broadcast party room event', error);
  }
}

export function subscribeToPartyRoom(roomId, onEvent, onStatusChange) {
  if (!supabase || !roomId) {
    return () => {};
  }

  let latestStatus = 'JOINING';

  const channel = supabase
    .channel(getPartyRoomChannelName(roomId))
    .on('broadcast', {
      event: PARTY_ROOM_EVENT,
    }, (payload) => {
      onEvent?.(payload?.payload || null);
    });

  registerPartyRoomRealtimeChannel(roomId, channel);

  channel.subscribe((status) => {
    latestStatus = status;
    updatePartyRoomRealtimeChannelStatus(roomId, channel, status);
    onStatusChange?.(status);
  });

  return () => {
    unregisterPartyRoomRealtimeChannel(roomId, channel);
    void disposePartyRealtimeChannel(channel, latestStatus);
  };
}

export function subscribeToPartyRoomJoinRequests(roomId, onEvent) {
  if (!supabase || !roomId) {
    return () => {};
  }

  let latestStatus = 'JOINING';
  const channel = supabase
    .channel(`party-join-requests-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'party_room_join_requests', filter: `room_id=eq.${roomId}` },
      (payload) => {
        onEvent?.({ type: payload.eventType, record: payload.new || payload.old });
      },
    );

  channel.subscribe((status) => {
    latestStatus = status;
  });

  return () => {
    void disposePartyRealtimeChannel(channel, latestStatus);
  };
}
