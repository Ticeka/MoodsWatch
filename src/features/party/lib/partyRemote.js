import { supabase } from '@/shared/lib/supabase';
import {
  PARTY_AVATAR_OPTIONS,
  buildPartyMatchSnapshot,
  buildUniquePartyAliases,
  createPartySettings,
  generatePartyRoomCode,
  getPartyPhaseEndsAtMs,
  getPartyRequiredReadyCount,
  getPartyCurrentRound,
  getPartyPresetById,
  isPartyAnswerWindowOpen,
  isDirectPartyMediaUrl,
  isPartyPhaseExpired,
  normalizePartyText,
  scorePartyAnswer,
  advancePartyMatch,
} from './partyEngine';
import {
  buildPartyVoteSnapshot,
  advancePartyVoteMatch,
} from './partyModeVote';
import { PARTY_TEMPLATE_DEFAULT_PRESET_ID } from './partyTemplateSchema';
import { resolveTemplateCoverUrl, sanitizeTemplateCoverUrl } from './partyTemplateUtils';

const PARTY_GUEST_TOKEN_KEY = 'moodtoon-party-guest-token';
const PARTY_PROFILE_KEY = 'moodtoon-party-profile';
const PARTY_ROOM_EVENT = 'party-room-event';
const PARTY_ROOM_CHANNEL_READY_TIMEOUT_MS = 1600;
const PARTY_SONG_POOL_PAGE_SIZE = 60;
const PARTY_SONG_POOL_MAX_PAGES = 3;
const PARTY_SONG_POOL_CACHE_TTL_MS = 2 * 60 * 1000;
const partyRoomRealtimeRegistry = new Map();
const partySongPoolCache = new Map();
const partyPresetSongPoolCache = new Map();
const partyTemplateSongPoolCache = new Map();

function getPartyRoomChannelName(roomId) {
  return `party-room-${roomId}`;
}

function createPartyRoomReadyPromise() {
  let resolve = () => { };
  let reject = () => { };
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

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

  entry.rejectReady?.(new Error('Party room channel was removed.'));
  partyRoomRealtimeRegistry.delete(key);
}

export function __resetPartyRoomRealtimeRegistryForTests() {
  partyRoomRealtimeRegistry.forEach((entry) => {
    entry.rejectReady?.(new Error('Party room channel registry reset.'));
  });
  partyRoomRealtimeRegistry.clear();
}

export function __resetPartySongPoolCachesForTests() {
  partySongPoolCache.clear();
  partyPresetSongPoolCache.clear();
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

async function broadcastPartyRoomEvent(roomId, event) {
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

function makeId(prefix = 'party') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getMissingRelation(error, relationName) {
  const message = String(error?.message || '');
  return Number(error?.status || 0) === 404 || message.includes(`"${relationName}"`) || message.includes(`'${relationName}'`);
}

function hasMissingColumn(error, columnName) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes(`column "${String(columnName || '').toLowerCase()}"`) || message.includes(`'${String(columnName || '').toLowerCase()}'`);
}

function takeFirstRecord(records) {
  return Array.isArray(records) ? records[0] || null : records || null;
}

async function fetchPartyRoomRecordById(roomId) {
  if (!supabase || !roomId) {
    return null;
  }

  const { data, error } = await supabase
    .from('party_rooms')
    .select('*')
    .eq('id', roomId);

  if (error) {
    throw error;
  }

  return takeFirstRecord(data);
}

async function fetchPartyRoomMembers(roomId) {
  if (!supabase || !roomId) {
    return [];
  }

  const { data, error } = await supabase
    .from('party_room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export function getPartyBackendHint(error, pick) {
  if (
    getMissingRelation(error, 'party_rooms')
    || getMissingRelation(error, 'party_room_members')
    || getMissingRelation(error, 'party_room_answers')
  ) {
    return pick(
      'ฐานข้อมูลสำหรับ Music Guess Party ยังไม่พร้อม ให้รัน migration ก่อนแล้วลองใหม่',
      'Music Guess Party tables are not ready yet. Run the migration first, then try again.'
    );
  }

  return error?.message || pick('เกิดข้อผิดพลาดที่ไม่คาดคิด', 'Something unexpected went wrong.');
}

function getSafeLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getPartyGuestToken() {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return makeId('party-guest');
  }

  const current = String(storage.getItem(PARTY_GUEST_TOKEN_KEY) || '').trim();
  if (current) {
    return current;
  }

  const next = makeId('party-guest');
  storage.setItem(PARTY_GUEST_TOKEN_KEY, next);
  return next;
}

export function readPartyProfile() {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return { displayName: '', avatarKey: PARTY_AVATAR_OPTIONS[0].id, avatarUrl: '' };
  }

  try {
    const parsed = JSON.parse(storage.getItem(PARTY_PROFILE_KEY) || '{}');
    return {
      displayName: String(parsed?.displayName || '').trim(),
      avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === parsed?.avatarKey)
        ? parsed.avatarKey
        : PARTY_AVATAR_OPTIONS[0].id,
      avatarUrl: String(parsed?.avatarUrl || '').trim(),
    };
  } catch {
    return { displayName: '', avatarKey: PARTY_AVATAR_OPTIONS[0].id, avatarUrl: '' };
  }
}

function normalizePartyProfile(profile = {}, memberToken = '') {
  const stored = readPartyProfile();
  const fallbackDisplayName = stored.displayName || `Guest ${String(memberToken || '').slice(-4).toUpperCase() || 'PLAY'}`;

  return {
    displayName: String(profile.displayName || stored.displayName || fallbackDisplayName).trim(),
    avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === profile.avatarKey)
      ? profile.avatarKey
      : PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === stored.avatarKey)
        ? stored.avatarKey
        : PARTY_AVATAR_OPTIONS[0].id,
    avatarUrl: String(profile.avatarUrl || stored.avatarUrl || '').trim(),
  };
}

export function savePartyProfile(profile = {}) {
  const storage = getSafeLocalStorage();
  if (!storage) {
    return;
  }

  const normalized = {
    displayName: String(profile.displayName || '').trim(),
    avatarKey: PARTY_AVATAR_OPTIONS.some((avatar) => avatar.id === profile.avatarKey)
      ? profile.avatarKey
      : PARTY_AVATAR_OPTIONS[0].id,
    avatarUrl: String(profile.avatarUrl || '').trim(),
  };

  storage.setItem(PARTY_PROFILE_KEY, JSON.stringify(normalized));
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

function mapPartyPresetSongItem(row) {
  return {
    id: Number(row?.song_id || 0),
    themeType: row?.theme_type || 'OP',
    songTitle: row?.song_title || '',
    songAliases: buildUniquePartyAliases([row?.song_title]),
    artistName: row?.artist_name || '',
    isCreditless: false,
    mediaUrl: row?.media_url || '',
    sourceTitleId: Number(row?.source_title_id || 0),
    sourceTitleName: row?.source_title_name || '',
    sourceTitleAliases: buildUniquePartyAliases([row?.source_title_name]),
    coverUrl: row?.cover_url || '',
    previewStartSec: 0,
  };
}

function mapPartySongPreset(record) {
  const items = Array.isArray(record?.party_song_preset_items) ? record.party_song_preset_items : [];

  return {
    id: Number(record?.id || 0),
    slug: record?.slug || '',
    name: record?.name || '',
    description: record?.description || '',
    status: record?.status || 'draft',
    visibility: record?.visibility || 'public',
    itemCount: items.length,
    updatedAt: record?.updated_at || '',
  };
}

function matchesPartySongSearch(song, normalizedQuery) {
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    song?.songTitle,
    song?.artistName,
    song?.sourceTitleName,
    ...(Array.isArray(song?.songAliases) ? song.songAliases : []),
    ...(Array.isArray(song?.sourceTitleAliases) ? song.sourceTitleAliases : []),
  ];

  return haystacks.some((value) => normalizePartyText(value).includes(normalizedQuery));
}

function getPartySongSearchRank(song, normalizedQuery) {
  const songTitle = normalizePartyText(song?.songTitle);
  const sourceTitle = normalizePartyText(song?.sourceTitleName);
  const artistName = normalizePartyText(song?.artistName);
  const aliases = [
    ...(Array.isArray(song?.songAliases) ? song.songAliases : []),
    ...(Array.isArray(song?.sourceTitleAliases) ? song.sourceTitleAliases : []),
  ].map((value) => normalizePartyText(value));

  if (songTitle === normalizedQuery || sourceTitle === normalizedQuery) {
    return 0;
  }

  if (aliases.includes(normalizedQuery)) {
    return 1;
  }

  if (songTitle.startsWith(normalizedQuery) || sourceTitle.startsWith(normalizedQuery)) {
    return 2;
  }

  if (artistName.startsWith(normalizedQuery)) {
    return 3;
  }

  if (songTitle.includes(normalizedQuery) || sourceTitle.includes(normalizedQuery)) {
    return 4;
  }

  if (artistName.includes(normalizedQuery) || aliases.some((value) => value.includes(normalizedQuery))) {
    return 5;
  }

  return 9;
}

function getPartySongDedupKey(song) {
  const songTitle = normalizePartyText(song?.songTitle);
  const sourceTitle = normalizePartyText(song?.sourceTitleName);
  const themeType = String(song?.themeType || '').trim().toUpperCase();

  if (songTitle || sourceTitle) {
    return [sourceTitle, songTitle, themeType].join('::');
  }

  return String(song?.id || '');
}

function dedupePartySongs(results = []) {
  const bySignature = new Map();

  results.forEach((song) => {
    const key = getPartySongDedupKey(song);
    const existing = bySignature.get(key);

    if (!existing) {
      bySignature.set(key, song);
      return;
    }

    const existingPopularity = Number(existing?.sourcePopularityScore || 0);
    const nextPopularity = Number(song?.sourcePopularityScore || 0);
    if (nextPopularity > existingPopularity) {
      bySignature.set(key, song);
      return;
    }

    const existingScore = Number(existing?.sourceAvgScore || 0);
    const nextScore = Number(song?.sourceAvgScore || 0);
    if (nextPopularity === existingPopularity && nextScore > existingScore) {
      bySignature.set(key, song);
    }
  });

  return [...bySignature.values()];
}

function mixPartySongsBySource(results = []) {
  const buckets = new Map();

  results.forEach((song) => {
    const key = normalizePartyText(song?.sourceTitleName) || String(song?.sourceTitleId || song?.id || '');
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(song);
  });

  const queue = [...buckets.values()]
    .filter((bucket) => bucket.length > 0)
    .sort((left, right) => {
      const leftPopularity = Number(left[0]?.sourcePopularityScore || 0);
      const rightPopularity = Number(right[0]?.sourcePopularityScore || 0);
      if (rightPopularity !== leftPopularity) {
        return rightPopularity - leftPopularity;
      }

      return String(left[0]?.sourceTitleName || '').localeCompare(String(right[0]?.sourceTitleName || ''));
    });

  const mixed = [];
  while (queue.length > 0) {
    const nextQueue = [];

    queue.forEach((bucket) => {
      const item = bucket.shift();
      if (item) {
        mixed.push(item);
      }
      if (bucket.length > 0) {
        nextQueue.push(bucket);
      }
    });

    queue.length = 0;
    queue.push(...nextQueue);
  }

  return mixed;
}

function shufflePartySongResults(results = []) {
  const items = [...results];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function buildRandomPartyPageSet({
  seedPage = 0,
  count = 12,
  maxPage = 30,
} = {}) {
  const pages = new Set([Math.max(0, Number(seedPage || 0))]);

  while (pages.size < count) {
    pages.add(Math.floor(Math.random() * Math.max(1, maxPage + 1)));
  }

  return [...pages];
}

function sortPartySongSearchResults(results = [], normalizedQuery = '', sortBy = 'relevance') {
  const items = [...results];

  items.sort((left, right) => {
    if (sortBy === 'random') {
      return 0;
    }

    if (sortBy === 'mixed') {
      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }

    if (sortBy === 'title') {
      const titleCompare = String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
      if (titleCompare !== 0) {
        return titleCompare;
      }

      return String(left.songTitle || '').localeCompare(String(right.songTitle || ''));
    }

    if (sortBy === 'popularity') {
      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }

    if (sortBy === 'score') {
      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }

    const rankDiff = getPartySongSearchRank(left, normalizedQuery) - getPartySongSearchRank(right, normalizedQuery);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
    if (popularityDiff !== 0) {
      return popularityDiff;
    }

    return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
  });

  if (sortBy === 'mixed') {
    return mixPartySongsBySource(items);
  }

  if (sortBy === 'random') {
    return shufflePartySongResults(items);
  }

  return items;
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

export async function fetchPartyTemplateSongPool(templateId) {
  if (!supabase || !templateId) {
    return [];
  }

  const cacheKey = String(templateId).trim();
  return getOrCreatePartySongPoolCacheValue(partyTemplateSongPoolCache, cacheKey, async () => {
    const { data, error } = await supabase
      .from('party_song_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('position', { ascending: true });

    if (error) {
      // Table may not exist yet; fall through to empty pool
      return [];
    }

    return (data || [])
      .map(mapPartyPresetSongItem)
      .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl));
  });
}

async function fetchPartyPresetSongPool(presetId) {
  if (!supabase || !presetId) {
    return [];
  }

  const cacheKey = String(presetId || '').trim();
  return getOrCreatePartySongPoolCacheValue(partyPresetSongPoolCache, cacheKey, async () => {
    const { data, error } = await supabase
      .from('party_song_preset_items')
      .select('*')
      .eq('preset_id', presetId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return (data || [])
      .map(mapPartyPresetSongItem)
      .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl));
  });
}

export async function fetchPublishedPartySongPresets() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('party_song_presets')
    .select('id, slug, name, description, status, visibility, updated_at, party_song_preset_items(id)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapPartySongPreset);
}

function mapPartyTemplate(row) {
  // party_song_template_items can be:
  //   - [{count: N}]  when fetched with (count) syntax (browse list)
  //   - [{id, ...}]   when fetched with (*) (detail page — handled separately)
  //   - undefined/null
  const itemsArr = Array.isArray(row?.party_song_template_items)
    ? row.party_song_template_items
    : [];

  let itemCount = Number(row?.item_count ?? 0);
  if (!itemCount && itemsArr.length > 0) {
    const firstEntry = itemsArr[0];
    if (firstEntry && 'count' in firstEntry) {
      // Supabase returns [{ count: N }] for aggregate selects
      itemCount = Number(firstEntry.count || 0);
    } else {
      itemCount = itemsArr.length;
    }
  }

  return {
    id: String(row?.id || ''),
    name: row?.name || '',
    description: row?.description || '',
    coverUrl: sanitizeTemplateCoverUrl(row?.cover_url),
    visibility: row?.visibility || 'public',
    modeScope: row?.mode_scope || 'all',
    presetId: row?.default_preset_id || PARTY_TEMPLATE_DEFAULT_PRESET_ID,
    sourceType: row?.source_type || 'catalog',
    isOfficial: Boolean(row?.is_official),
    ownerUserId: row?.owner_user_id || null,
    creatorName: row?.creator_name || '',
    itemCount,
    likes: Number(row?.like_count || 0),
    viewCount: Number(row?.view_count || 0),
    tags: Array.isArray(row?.tags) ? row.tags : [],
    createdAt: row?.created_at || '',
    updatedAt: row?.updated_at || '',
  };
}

export async function fetchPartyTemplates({ tab = 'all', mode = 'all', search = '', userId = null } = {}) {
  if (!supabase) {
    return [];
  }

  // count() in nested select avoids fetching full item rows just for the count
  let query = supabase
    .from('party_song_templates')
    .select('*, party_song_template_items(count)')
    .order('updated_at', { ascending: false });

  if (tab === 'official') {
    query = query.eq('is_official', true);
  } else if (tab === 'mine' && userId) {
    query = query.eq('owner_user_id', userId);
  } else {
    // all + community: only public/unlisted
    query = query.in('visibility', ['public', 'unlisted']);
  }

  if (mode === 'quiz') {
    query = query.in('mode_scope', ['quiz', 'all']);
  } else if (mode === 'vote') {
    query = query.in('mode_scope', ['vote', 'all']);
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(mapPartyTemplate);
}

export async function fetchPartyTemplateDetail(templateId) {
  if (!supabase || !templateId) {
    return null;
  }

  const { data: template, error: templateError } = await supabase
    .from('party_song_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (templateError) {
    const err = new Error(templateError.message || 'Failed to load template');
    err.code = templateError.code;
    // Postgres RLS denial
    if (templateError.code === '42501') err.kind = 'access_denied';
    throw err;
  }

  if (!template) {
    const err = new Error('Template not found');
    err.kind = 'not_found';
    throw err;
  }

  const { data: items, error: itemsError } = await supabase
    .from('party_song_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('position', { ascending: true });

  if (itemsError) {
    const err = new Error(itemsError.message || 'Failed to load template items');
    err.code = itemsError.code;
    throw err;
  }

  return {
    ...mapPartyTemplate(template),
    coverUrl: resolveTemplateCoverUrl(template?.cover_url, items || []),
    items: items || [],
  };
}

export async function uploadPartyTemplateCover(userId, file) {
  if (!supabase || !userId || !file) {
    throw new Error('Invalid cover upload request');
  }

  const ext = String(file.name || 'jpg').split('.').pop() || 'jpg';
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/template-cover-${Date.now()}.${safeExt}`;
  const { error } = await supabase.storage
    .from('party-template-covers')
    .upload(path, file, { cacheControl: '31536000', upsert: false });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from('party-template-covers').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Cover upload did not return a public URL');
  }

  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * Create a new template + its items in one transaction-like sequence.
 * Returns the created template record or throws.
 */
export async function createPartyTemplate(templateData, items = [], creatorName = '') {
  if (!supabase) throw new Error('No database connection');

  const { data: tpl, error: tplError } = await supabase
    .from('party_song_templates')
    .insert({
      owner_user_id: templateData.ownerUserId,
      creator_name: creatorName || '',
      name: String(templateData.name || '').trim(),
      description: String(templateData.description || '').trim(),
      cover_url: sanitizeTemplateCoverUrl(templateData.coverUrl),
      visibility: templateData.visibility || 'public',
      mode_scope: templateData.modeScope || 'all',
      default_preset_id: templateData.presetId || PARTY_TEMPLATE_DEFAULT_PRESET_ID,
      source_type: 'catalog',
      is_official: false,
      tags: Array.isArray(templateData.tags) ? templateData.tags : [],
    })
    .select('*')
    .single();

  if (tplError) throw tplError;

  if (items.length > 0) {
    const rows = items.map((item, index) => ({
      template_id: tpl.id,
      song_id: item.song_id ?? item.songId,
      source_title_id: item.source_title_id ?? item.sourceTitleId ?? null,
      source_title_name: item.source_title_name ?? item.sourceTitleName ?? '',
      song_title: item.song_title ?? item.songTitle ?? item.title ?? '',
      theme_type: item.theme_type ?? item.themeType ?? 'OP',
      artist_name: item.artist_name ?? item.artistName ?? item.artist ?? '',
      media_url: item.media_url ?? item.mediaUrl ?? '',
      cover_url: item.cover_url ?? item.coverUrl ?? '',
      position: index,
    }));

    const { error: itemsError } = await supabase
      .from('party_song_template_items')
      .insert(rows);

    if (itemsError) throw itemsError;
  }

  return mapPartyTemplate(tpl);
}

/**
 * Update a template's header fields (name, description, visibility, etc.).
 * Does not touch items — use replacePartyTemplateItems for that.
 */
export async function updatePartyTemplate(templateId, updates) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const allowed = {};
  if (updates.name !== undefined)        allowed.name = String(updates.name).trim();
  if (updates.description !== undefined) allowed.description = String(updates.description).trim();
  if (updates.coverUrl !== undefined)    allowed.cover_url = sanitizeTemplateCoverUrl(updates.coverUrl);
  if (updates.visibility !== undefined)  allowed.visibility = updates.visibility;
  if (updates.modeScope !== undefined)   allowed.mode_scope = updates.modeScope;
  if (updates.presetId !== undefined)    allowed.default_preset_id = updates.presetId || PARTY_TEMPLATE_DEFAULT_PRESET_ID;
  if (updates.tags !== undefined)        allowed.tags = Array.isArray(updates.tags) ? updates.tags : [];

  const { data, error } = await supabase
    .from('party_song_templates')
    .update(allowed)
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) throw error;
  return mapPartyTemplate(data);
}

/**
 * Atomically replaces all items of a template via a DB transaction RPC.
 * Uses replace_party_template_items(bigint, jsonb) — delete + insert in one PG transaction.
 * A failed insert can never leave the template with zero songs.
 */
export async function replacePartyTemplateItems(templateId, items = []) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const rows = items.map((item, index) => ({
    song_id: String(item.song_id ?? item.songId ?? ''),
    source_title_id: String(item.source_title_id ?? item.sourceTitleId ?? ''),
    source_title_name: item.source_title_name ?? item.sourceTitleName ?? '',
    song_title: item.song_title ?? item.songTitle ?? item.title ?? '',
    theme_type: item.theme_type ?? item.themeType ?? 'OP',
    artist_name: item.artist_name ?? item.artistName ?? item.artist ?? '',
    media_url: item.media_url ?? item.mediaUrl ?? '',
    cover_url: item.cover_url ?? item.coverUrl ?? '',
    position: index,
  }));

  const { error } = await supabase.rpc('replace_party_template_items', {
    p_template_id: Number(templateId),
    p_items: JSON.stringify(rows),
  });

  if (error) throw error;
  return rows;
}

/**
 * Clone an existing template into a new one owned by userId.
 * nameOverride defaults to "Copy of <original name>".
 */
export async function clonePartyTemplate(baseTemplateId, userId, creatorName = '', nameOverride = null) {
  if (!supabase || !baseTemplateId || !userId) throw new Error('Invalid arguments');

  const base = await fetchPartyTemplateDetail(baseTemplateId);
  if (!base) throw new Error('Base template not found or not accessible');

  const newName = nameOverride || `Copy of ${base.name}`;

  return createPartyTemplate(
    {
      ownerUserId: userId,
      name: newName,
      description: base.description,
      coverUrl: base.coverUrl,
      visibility: 'private', // cloned templates start as private
      modeScope: base.modeScope,
      presetId: base.presetId || PARTY_TEMPLATE_DEFAULT_PRESET_ID,
      tags: base.tags,
    },
    base.items,
    creatorName,
  );
}

/**
 * Toggle like on a template.
 * Returns { liked: boolean } — true if the like was added, false if removed.
 */
export async function togglePartyTemplateLike(templateId, userId) {
  if (!supabase || !templateId || !userId) throw new Error('Invalid arguments');

  // Check if like already exists
  const { data: existing } = await supabase
    .from('party_template_likes')
    .select('id')
    .eq('template_id', templateId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('party_template_likes')
      .delete()
      .eq('template_id', templateId)
      .eq('user_id', userId);
    if (error) throw error;
    return { liked: false };
  }

  const { error } = await supabase
    .from('party_template_likes')
    .insert({ template_id: templateId, user_id: userId });
  if (error) throw error;
  return { liked: true };
}

/**
 * Check if the current user has liked a template.
 */
export async function checkPartyTemplateLiked(templateId, userId) {
  if (!supabase || !templateId || !userId) return false;

  const { data } = await supabase
    .from('party_template_likes')
    .select('id')
    .eq('template_id', templateId)
    .eq('user_id', userId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Increment view count via DB function (fire-and-forget — no throw on failure).
 */
export async function recordPartyTemplateView(templateId) {
  if (!supabase || !templateId) return;
  try {
    await supabase.rpc('increment_template_view_count', { p_template_id: Number(templateId) });
  } catch {
    // View count is non-critical
  }
}

export async function searchPartyThemeSongs(query = '', { page = 0, pageSize = 24, sortBy = 'relevance' } = {}) {
  if (!supabase) {
    return {
      items: [],
      total: 0,
      page: 0,
      pageSize: Math.max(1, Number(pageSize || 24)),
      totalPages: 1,
    };
  }

  const rawQuery = String(query || '').trim();
  const normalizedQuery = normalizePartyText(rawQuery);
  const safePage = Math.max(0, Number(page || 0));
  const safePageSize = Math.max(1, Number(pageSize || 24));
  const primaryPages = sortBy === 'random'
    ? buildRandomPartyPageSet({
      seedPage: safePage,
      count: normalizedQuery ? 10 : 14,
      maxPage: normalizedQuery ? 20 : 36,
    })
    : normalizedQuery
      ? [safePage, safePage + 1, safePage + 2]
      : [safePage];

  const primaryResults = await Promise.all(
    primaryPages.map((targetPage) => supabase.rpc('search_battle_theme_songs', {
      p_query: rawQuery,
      p_show_adult: false,
      p_hidden_title_ids: [],
      p_page: targetPage,
      p_page_size: sortBy === 'random' ? Math.max(safePageSize, 48) : safePageSize,
    }))
  );

  const directRows = [];
  let rawTotal = 0;
  primaryResults.forEach(({ data, error }) => {
    if (error) {
      throw error;
    }

    directRows.push(...(data || []));
    if (!rawTotal && Array.isArray(data) && data.length > 0) {
      rawTotal = Number(data[0]?.total_count || 0);
    }
  });

  const directResults = dedupePartySongs(Array.from(new Map(
    directRows
      .map(mapPartySongRow)
      .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl))
      .map((song) => [song.id, song])
  ).values()));

  if (sortBy === 'random') {
    const shuffledItems = shufflePartySongResults(directResults).slice(0, safePageSize);
    return {
      items: shuffledItems,
      total: Math.max(directResults.length, rawTotal),
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(Math.max(directResults.length, rawTotal) / safePageSize)),
    };
  }

  if (!normalizedQuery || directResults.length >= safePageSize) {
    const items = sortPartySongSearchResults(directResults, normalizedQuery, sortBy).slice(0, safePageSize);
    return {
      items,
      total: Math.max(items.length, rawTotal),
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(Math.max(items.length, rawTotal) / safePageSize)),
    };
  }

  const fallbackResults = await Promise.all(
    [0, 1, 2].map((fallbackPage) => supabase.rpc('search_battle_theme_songs', {
      p_query: '',
      p_show_adult: false,
      p_hidden_title_ids: [],
      p_page: fallbackPage,
      p_page_size: 100,
    }))
  );

  const merged = new Map(directResults.map((song) => [song.id, song]));
  fallbackResults.forEach(({ data: fallbackData, error: fallbackError }) => {
    if (fallbackError) {
      throw fallbackError;
    }

    (fallbackData || [])
      .map(mapPartySongRow)
      .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl))
      .filter((song) => matchesPartySongSearch(song, normalizedQuery))
      .forEach((song) => {
        if (!merged.has(song.id)) {
          merged.set(song.id, song);
        }
      });
  });

  const items = sortPartySongSearchResults(dedupePartySongs([...merged.values()]), normalizedQuery, sortBy).slice(0, safePageSize);
  return {
    items,
    total: Math.max(items.length, rawTotal),
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(Math.max(items.length, rawTotal) / safePageSize)),
  };
}

/**
 * Catalog search for the Template Builder.
 * Same RPC as searchPartyThemeSongs but does NOT filter by isDirectPartyMediaUrl,
 * so all songs in the catalog are visible to template authors.
 * The game engine applies the URL filter at runtime when building the song pool.
 */
export async function searchPartyTemplateCatalog(query = '', { page = 0, pageSize = 24 } = {}) {
  if (!supabase) {
    return { items: [], total: 0, page: 0, pageSize, totalPages: 1 };
  }

  const rawQuery = String(query || '').trim();
  const safePage = Math.max(0, Number(page || 0));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 24), 50));

  const { data, error } = await supabase.rpc('search_battle_theme_songs', {
    p_query: rawQuery,
    p_show_adult: false,
    p_hidden_title_ids: [],
    p_page: safePage,
    p_page_size: safePageSize,
  });

  if (error) throw error;

  const rows = (data || []);
  const total = Number(rows[0]?.total_count || 0);

  // Map to UI-friendly shape — keep all songs, no URL filter
  const items = rows.map((row) => {
    const mapped = mapPartySongRow(row);
    return {
      ...mapped,
      isPlayable: isDirectPartyMediaUrl(mapped.mediaUrl),
    };
  }).filter((s) => s.id && s.sourceTitleId);

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function fetchPartySongPool(settings = {}) {
  if (!supabase) {
    return [];
  }

  const normalizedSettings = createPartySettings(settings);
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

export async function fetchPartyRoomBundle(roomCode) {
  if (!supabase || !roomCode) {
    return null;
  }

  const normalizedCode = String(roomCode || '').trim().toUpperCase();
  const { data: room, error: roomError } = await supabase
    .from('party_rooms')
    .select('*')
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
      .select('*')
      .eq('room_id', room.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('party_room_answers')
      .select('*')
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

export async function createPartyRoom({ profile = {}, settings = {} } = {}) {
  if (!supabase) {
    throw new Error('Supabase is unavailable.');
  }

  const memberToken = getPartyGuestToken();
  const normalizedProfile = normalizePartyProfile(profile, memberToken);
  const normalizedSettings = createPartySettings(settings);

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
      })
      .select('*')
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
      const { avatar_url: _avatar_url, ...legacyPayload } = memberPayload;
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
    .select('*')
    .single();

  if (error && hasMissingColumn(error, 'avatar_url')) {
    const { avatar_url: _avatar_url, ...legacyPayload } = payload;
    ({ data: memberData, error } = await supabase
      .from('party_room_members')
      .upsert(legacyPayload, { onConflict: 'room_id,member_token' })
      .select('*')
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
    .select('*')
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
  const pool = await fetchPartySongPool(settings);
  const playablePool = pool.filter((song) => normalizePartyText(song.sourceTitleName) && normalizePartyText(song.songTitle));
  
  const snapshot = settings.modeType === 'vote'
    ? buildPartyVoteSnapshot(playablePool, settings)
    : buildPartyMatchSnapshot(playablePool, settings);

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
    .select('*');

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
      room: nextRoom,
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
    .select('*');

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
      room: nextRoom,
    },
  });

  return nextRoom;
}

export async function advancePartyRoom(room) {
  if (!supabase || !room?.id || !room.current_match) {
    return room;
  }

  const isVotePlaybackPhase = room.settings?.modeType === 'vote'
    && (room.current_match?.phase === 'play-a' || room.current_match?.phase === 'play-b');

  if (!isVotePlaybackPhase && (!getPartyPhaseEndsAtMs(room.current_match) || !isPartyPhaseExpired(room.current_match))) {
    return room;
  }

  const isVoteMode = room.settings?.modeType === 'vote';
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
      .select('*');

    if (optimisticError) {
      throw optimisticError;
    }

    const optimisticRoom = takeFirstRecord(optimisticData);
    if (optimisticRoom) {
      await broadcastPartyRoomEvent(room.id, {
        type: 'MATCH_ADVANCED',
        payload: { room: optimisticRoom },
      });
      return optimisticRoom;
    }
  }

  // --- Fresh path (always for vote tally, fallback for quiz) ---
  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match) {
    return freshRoom || room;
  }

  const isFreshVotePlaybackPhase = freshRoom.settings?.modeType === 'vote'
    && (freshRoom.current_match?.phase === 'play-a' || freshRoom.current_match?.phase === 'play-b');

  if (!isFreshVotePlaybackPhase && (!getPartyPhaseEndsAtMs(freshRoom.current_match) || !isPartyPhaseExpired(freshRoom.current_match))) {
    return freshRoom;
  }

  // Authoritative vote tally from DB before advancing to reveal.
  if (freshRoom.settings?.modeType === 'vote' && freshRoom.current_match?.phase === 'vote') {
    const battleId = freshRoom.current_match.currentBattle.id;
    const songA = freshRoom.current_match.currentBattle.songA;
    const songB = freshRoom.current_match.currentBattle.songB;

    const { data: voteRecords, error: voteRecordsError } = await supabase
      .from('party_room_answers')
      .select('selected_option_id')
      .eq('room_id', freshRoom.id)
      .eq('match_id', freshRoom.current_match.id)
      .eq('round_id', battleId);

    if (voteRecordsError) {
      throw voteRecordsError;
    }

    const normalizedSongA = String(songA || '');
    const normalizedSongB = String(songB || '');
    const songA_votes = (voteRecords || []).filter((vote) => String(vote?.selected_option_id || '') === normalizedSongA).length;
    const songB_votes = (voteRecords || []).filter((vote) => String(vote?.selected_option_id || '') === normalizedSongB).length;
    const total_votes = (voteRecords || []).length;
    const is_tie = songA_votes === songB_votes;

    // Deterministic tie-break: hash the battle id so all clients agree.
    let winning_song_id;
    if (songA_votes > songB_votes) {
      winning_song_id = normalizedSongA;
    } else if (songB_votes > songA_votes) {
      winning_song_id = normalizedSongB;
    } else {
      const tieHash = Array.from(String(battleId)).reduce((sum, c) => sum + c.charCodeAt(0), 0);
      winning_song_id = tieHash % 2 === 0 ? normalizedSongA : normalizedSongB;
    }

    freshRoom.current_match.currentBattle.voteSummary = {
      songA_votes,
      songB_votes,
      total_votes,
      winning_song_id,
      is_tie,
    };
    freshRoom.current_match.currentBattle.winnerSongId = winning_song_id;
  }

  const nextMatch = freshRoom.settings?.modeType === 'vote'
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
    .select('*');

  if (error) {
    throw error;
  }

  const nextRoom = takeFirstRecord(data);
  if (!nextRoom) {
    return (await fetchPartyRoomRecordById(room.id)) || freshRoom;
  }

  await broadcastPartyRoomEvent(freshRoom.id, {
    type: 'MATCH_ADVANCED',
    payload: { room: nextRoom },
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
    .select('*');

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
      room: roomData,
      members,
    },
  });

  return {
    room: roomData,
    members,
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
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await broadcastPartyRoomEvent(room.id, {
    type: 'ROOM_CLOSED',
    payload: {
      room: data,
    },
  });

  return data;
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

  const now = Date.now();
  const phaseStartedAt = new Date(freshRoom.current_match.phaseStartedAt || now).getTime();
  const elapsedMs = Math.max(0, now - phaseStartedAt);
  const timeLimitMs = (
    Number(freshRoom.current_match.timePerRoundSec || 12)
    + Number(freshRoom.current_match.answerGraceSec || 0)
  ) * 1000;
  const score = scorePartyAnswer({
    presetId: preset.id,
    round,
    selectedOptionId: payload.selectedOptionId,
    typedTitle: payload.typedTitle,
    typedSong: payload.typedSong,
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
    .select('*')
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
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  // Optionally broadcast but we can rely on standard channel if configured, or just skip broadcasting individual votes to prevent live bias
  return data;
}

function mapPartyRoomRealtimePayload(payload) {
  const row = payload?.new || payload?.old || null;
  if (!row) {
    return null;
  }

  return {
    type: row.status === 'closed' ? 'ROOM_CLOSED' : 'ROOM_UPDATED',
    sentAt: payload?.commit_timestamp || new Date().toISOString(),
    payload: {
      room: row,
    },
  };
}

function mapPartyMemberRealtimePayload(payload) {
  const member = payload?.new || null;
  if (!member) {
    return null;
  }

  return {
    type: 'MEMBER_UPSERTED',
    sentAt: payload?.commit_timestamp || new Date().toISOString(),
    payload: {
      member,
    },
  };
}

function mapPartyAnswerRealtimePayload(payload) {
  const answer = payload?.new || null;
  if (!answer) {
    return null;
  }

  return {
    type: 'ANSWER_SUBMITTED',
    sentAt: payload?.commit_timestamp || new Date().toISOString(),
    payload: {
      answer,
    },
  };
}

export function subscribeToPartyRoom(roomId, onEvent, onStatusChange) {
  if (!supabase || !roomId) {
    return () => { };
  }

  const channel = supabase
    .channel(getPartyRoomChannelName(roomId))
    .on('broadcast', {
      event: PARTY_ROOM_EVENT,
    }, (payload) => {
      onEvent?.(payload?.payload || null);
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'party_rooms',
      filter: `id=eq.${roomId}`,
    }, (payload) => {
      const event = mapPartyRoomRealtimePayload(payload);
      if (event) {
        onEvent?.(event);
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'party_room_members',
      filter: `room_id=eq.${roomId}`,
    }, (payload) => {
      const event = mapPartyMemberRealtimePayload(payload);
      if (event) {
        onEvent?.(event);
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'party_room_answers',
      filter: `room_id=eq.${roomId}`,
    }, (payload) => {
      const event = mapPartyAnswerRealtimePayload(payload);
      if (event) {
        onEvent?.(event);
      }
    });

  registerPartyRoomRealtimeChannel(roomId, channel);

  channel.subscribe((status) => {
    updatePartyRoomRealtimeChannelStatus(roomId, channel, status);
    onStatusChange?.(status);
  });

  return () => {
    unregisterPartyRoomRealtimeChannel(roomId, channel);
    void supabase.removeChannel(channel);
  };
}
