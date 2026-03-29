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

const PARTY_GUEST_TOKEN_KEY = 'moodtoon-party-guest-token';
const PARTY_PROFILE_KEY = 'moodtoon-party-profile';
const PARTY_ROOM_EVENT = 'party-room-event';

function getPartyRoomChannelName(roomId) {
  return `party-room-${roomId}`;
}

async function broadcastPartyRoomEvent(roomId, event) {
  if (!supabase || !roomId || !event?.type) {
    return;
  }

  const channel = supabase.channel(getPartyRoomChannelName(roomId));
  await channel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') {
      await supabase.removeChannel(channel);
      return;
    }

    await channel.send({
      type: 'broadcast',
      event: PARTY_ROOM_EVENT,
      payload: {
        ...event,
        sentAt: new Date().toISOString(),
      },
    });

    await supabase.removeChannel(channel);
  });
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

async function fetchPartyPresetSongPool(presetId) {
  if (!supabase || !presetId) {
    return [];
  }

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

export async function fetchPartySongPool(settings = {}) {
  if (!supabase) {
    return [];
  }

  const normalizedSettings = createPartySettings(settings);
  if (normalizedSettings.songPresetId) {
    return fetchPartyPresetSongPool(normalizedSettings.songPresetId);
  }

  const pages = [0, 1, 2];
  const pageSize = 60;

  const results = await Promise.all(
    pages.map((page) => supabase.rpc('search_battle_theme_songs', {
      p_query: normalizedSettings.keyword || '',
      p_show_adult: false,
      p_hidden_title_ids: [],
      p_page: page,
      p_page_size: pageSize,
    }))
  );

  const rows = [];
  results.forEach(({ data, error }) => {
    if (error) {
      throw error;
    }

    rows.push(...(data || []));
  });

  const mapped = rows
    .map(mapPartySongRow)
    .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl));

  const deduped = Array.from(new Map(mapped.map((song) => [song.id, song])).values());
  return filterSongsByCategory(deduped, normalizedSettings.categoryId);
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

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom) {
    throw new Error('Room not found.');
  }

  if (freshRoom.status !== 'lobby') {
    return freshRoom;
  }

  const freshMembers = await fetchPartyRoomMembers(freshRoom.id);
  const requiredReadyCount = getPartyRequiredReadyCount(freshMembers.length);
  const readyCount = freshMembers.filter((member) => member.is_ready).length;
  if (requiredReadyCount > 0 && readyCount < requiredReadyCount) {
    throw new Error('Not enough ready players to start the match yet.');
  }

  const settings = createPartySettings(freshRoom.settings || {});
  const pool = await fetchPartySongPool(settings);
  const playablePool = pool.filter((song) => normalizePartyText(song.sourceTitleName) && normalizePartyText(song.songTitle));
  const snapshot = buildPartyMatchSnapshot(playablePool, settings);

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

export async function advancePartyRoom(room) {
  if (!supabase || !room?.id || !room.current_match) {
    return room;
  }

  const freshRoom = await fetchPartyRoomRecordById(room.id);
  if (!freshRoom?.current_match) {
    return freshRoom || room;
  }

  if (!getPartyPhaseEndsAtMs(freshRoom.current_match) || !isPartyPhaseExpired(freshRoom.current_match)) {
    return freshRoom;
  }

  const nextMatch = advancePartyMatch(freshRoom.current_match);
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
    payload: {
      room: nextRoom,
    },
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
    return () => {};
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
    })
    .subscribe((status) => {
      onStatusChange?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
