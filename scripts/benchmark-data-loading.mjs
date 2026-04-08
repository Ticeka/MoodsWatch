import { performance } from 'perf_hooks';

const BENCH_ITERATIONS = 120;
const ADMIN_USER_COUNT = 50000;
const ADMIN_PAGE_SIZE = 50;
const PARTY_BROADCAST_ITERATIONS = 2000;

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function percentReduction(before, after) {
  if (!before) return 0;
  return ((before - after) / before) * 100;
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function measure(fn, iterations = BENCH_ITERATIONS) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    fn();
    samples.push(performance.now() - startedAt);
  }
  return {
    average: average(samples),
    median: median(samples),
  };
}

function createAdminUsersDataset(count = ADMIN_USER_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${index.toString().padStart(6, '0')}`,
    name: `User ${index}`,
    email: `user${index}@example.com`,
    role: index % 17 === 0 ? 'admin' : index % 7 === 0 ? 'editor' : 'user',
    avatar_url: `https://cdn.example.com/avatar/${index}.webp`,
    created_at: new Date(Date.now() - index * 86400000).toISOString(),
  }));
}

function legacyAdminUsersClientFlow(dataset, { searchTerm, roleFilter, sortBy, page, pageSize }) {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();
  let next = [...dataset];

  if (roleFilter !== 'all') {
    next = next.filter((entry) => entry.role === roleFilter);
  }

  if (normalizedSearch) {
    next = next.filter((entry) => (
      entry.name.toLowerCase().includes(normalizedSearch)
      || entry.email.toLowerCase().includes(normalizedSearch)
      || entry.id === normalizedSearch
    ));
  }

  if (sortBy === 'oldest') {
    next.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  } else if (sortBy === 'name') {
    next.sort((left, right) => String(left.name).localeCompare(String(right.name)));
  } else {
    next.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  }

  const from = (page - 1) * pageSize;
  return next.slice(from, from + pageSize);
}

function optimizedAdminUsersClientFlow(serverPageRows) {
  return serverPageRows.map((entry) => ({
    id: entry.id,
    name: entry.name,
    email: entry.email,
    role: entry.role,
    avatar_url: entry.avatar_url,
    created_at: entry.created_at,
  }));
}

function benchmarkAdminUsers() {
  const dataset = createAdminUsersDataset();
  const scenario = {
    searchTerm: 'user 12',
    roleFilter: 'user',
    sortBy: 'newest',
    page: 3,
    pageSize: ADMIN_PAGE_SIZE,
  };
  const serverPageRows = legacyAdminUsersClientFlow(dataset, scenario);

  const legacyStats = measure(() => legacyAdminUsersClientFlow(dataset, scenario));
  const optimizedStats = measure(() => optimizedAdminUsersClientFlow(serverPageRows));
  const legacyPayload = Buffer.byteLength(JSON.stringify(dataset));
  const optimizedPayload = Buffer.byteLength(JSON.stringify(serverPageRows));

  return {
    name: 'AdminUsers',
    legacyStats,
    optimizedStats,
    payload: {
      legacy: legacyPayload,
      optimized: optimizedPayload,
    },
  };
}

function buildAutocompleteFetchPlanLegacy(groupCaps) {
  return {
    titles: groupCaps.titles + 1,
    posts: groupCaps.posts + 1,
    people: groupCaps.people + 1,
    tierlists: groupCaps.tierlists + 1,
  };
}

function buildAutocompleteFetchPlanOptimized(groupCaps) {
  return {
    titles: groupCaps.titles + 1,
    posts: groupCaps.posts,
    people: groupCaps.people,
    tierlists: groupCaps.tierlists,
  };
}

function createAutocompleteLaneData() {
  const titles = Array.from({ length: 5 }, (_, index) => ({
    id: `title-${index}`,
    title: `One Piece ${index}`,
    genres: ['action', 'adventure', 'comedy'],
    aliases: ['OP', 'วันพีซ'],
    cover: `https://cdn.example.com/title/${index}.webp`,
  }));
  const posts = Array.from({ length: 4 }, (_, index) => ({
    id: `post-${index}`,
    content: `One Piece theory thread ${index}`,
    author_username: `pirate_${index}`,
    image_url: `https://cdn.example.com/post/${index}.webp`,
  }));
  const people = Array.from({ length: 4 }, (_, index) => ({
    id: `profile-${index}`,
    name: `Fan ${index}`,
    username: `fan_${index}`,
    favorite_moods: ['epic', 'fun'],
  }));
  const tierlists = Array.from({ length: 4 }, (_, index) => ({
    id: `tier-${index}`,
    title: `One Piece arc ranking ${index}`,
    ownerUsername: `tiermaker_${index}`,
    description: 'Arc ranking with detailed notes and categories',
  }));

  return { titles, posts, people, tierlists };
}

function emulateAutocompleteClientWork(rowsByLane, fetchPlan) {
  const fetchedRows = [
    ...rowsByLane.titles.slice(0, fetchPlan.titles),
    ...rowsByLane.posts.slice(0, fetchPlan.posts),
    ...rowsByLane.people.slice(0, fetchPlan.people),
    ...rowsByLane.tierlists.slice(0, fetchPlan.tierlists),
  ];

  return fetchedRows
    .map((entry) => JSON.stringify(entry).length)
    .reduce((sum, size) => sum + size, 0);
}

function benchmarkDiscoverAutocomplete() {
  const groupCaps = { titles: 3, posts: 2, people: 2, tierlists: 2 };
  const rowsByLane = createAutocompleteLaneData();
  const legacyPlan = buildAutocompleteFetchPlanLegacy(groupCaps);
  const optimizedPlan = buildAutocompleteFetchPlanOptimized(groupCaps);
  const legacyPayload = emulateAutocompleteClientWork(rowsByLane, legacyPlan);
  const optimizedPayload = emulateAutocompleteClientWork(rowsByLane, optimizedPlan);
  const legacyStats = measure(() => emulateAutocompleteClientWork(rowsByLane, legacyPlan));
  const optimizedStats = measure(() => emulateAutocompleteClientWork(rowsByLane, optimizedPlan));

  return {
    name: 'DiscoverAutocomplete',
    legacyStats,
    optimizedStats,
    payload: {
      legacy: legacyPayload,
      optimized: optimizedPayload,
    },
    units: {
      legacy: Object.values(legacyPlan).reduce((sum, value) => sum + value, 0),
      optimized: Object.values(optimizedPlan).reduce((sum, value) => sum + value, 0),
    },
  };
}

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

function buildPartyRoomRealtimePatch(nextRoom, previousRoom = null, { forceKeys = [] } = {}) {
  if (!nextRoom) {
    return null;
  }

  const patch = { id: nextRoom.id };
  const forceKeySet = new Set(forceKeys);

  PARTY_ROOM_BROADCAST_FIELD_KEYS.forEach((key) => {
    if (!(key in nextRoom)) return;

    if (!previousRoom || forceKeySet.has(key) || !arePartyRoomBroadcastValuesEqual(previousRoom?.[key], nextRoom?.[key])) {
      patch[key] = nextRoom[key];
    }
  });

  return patch;
}

function createPartyRoomPayload() {
  return {
    id: 'room-1',
    room_code: 'ABCD12',
    room_name: 'Friday Anime Night',
    visibility: 'public',
    status: 'question',
    host_member_token: 'host-token-123',
    settings: {
      roundCount: 12,
      answerTimeLimitMs: 20000,
      playbackMode: 'preview',
      categories: ['anime', 'openings', 'romance'],
      allowSkips: true,
    },
    current_match: {
      id: 'match-8',
      roundIndex: 8,
      phase: 'question',
      revealAt: new Date().toISOString(),
      scoreboard: Array.from({ length: 10 }, (_, index) => ({
        memberToken: `member-${index}`,
        points: 120 - index * 7,
      })),
      choices: Array.from({ length: 4 }, (_, index) => ({
        id: `choice-${index}`,
        label: `Song ${index}`,
      })),
    },
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function benchmarkPartyRealtime() {
  const previousRoom = createPartyRoomPayload();
  const nextRoom = {
    ...previousRoom,
    status: 'reveal',
    updated_at: new Date(Date.now() + 15000).toISOString(),
    current_match: {
      ...previousRoom.current_match,
      phase: 'reveal',
      revealWinnerId: 'choice-2',
    },
  };

  const legacyPayload = Buffer.byteLength(JSON.stringify({ room: nextRoom }));
  const optimizedPatch = buildPartyRoomRealtimePatch(nextRoom, previousRoom, { forceKeys: ['updated_at'] });
  const optimizedPayload = Buffer.byteLength(JSON.stringify({ room: optimizedPatch }));
  const legacyStats = measure(() => JSON.stringify({ room: nextRoom }), PARTY_BROADCAST_ITERATIONS);
  const optimizedStats = measure(() => JSON.stringify({ room: optimizedPatch }), PARTY_BROADCAST_ITERATIONS);

  return {
    name: 'PartyRealtimeBroadcast',
    legacyStats,
    optimizedStats,
    payload: {
      legacy: legacyPayload,
      optimized: optimizedPayload,
    },
  };
}

function printSection(section) {
  const msReduction = percentReduction(section.legacyStats.average, section.optimizedStats.average);
  const payloadReduction = percentReduction(section.payload.legacy, section.payload.optimized);
  console.log(`\n${section.name}`);
  console.log(`  Legacy avg:    ${formatMs(section.legacyStats.average)} (median ${formatMs(section.legacyStats.median)})`);
  console.log(`  Optimized avg: ${formatMs(section.optimizedStats.average)} (median ${formatMs(section.optimizedStats.median)})`);
  console.log(`  Avg reduction: ${msReduction.toFixed(1)}%`);
  console.log(`  Payload:       ${formatBytes(section.payload.legacy)} -> ${formatBytes(section.payload.optimized)} (${payloadReduction.toFixed(1)}% smaller)`);

  if (section.units) {
    const unitReduction = percentReduction(section.units.legacy, section.units.optimized);
    console.log(`  Fetch units:   ${section.units.legacy} -> ${section.units.optimized} (${unitReduction.toFixed(1)}% fewer rows)`);
  }
}

function main() {
  console.log('Data Loading Benchmark (synthetic, repo-local)');
  console.log('Compares legacy heavy-client patterns against current optimized patterns.\n');

  const sections = [
    benchmarkAdminUsers(),
    benchmarkDiscoverAutocomplete(),
    benchmarkPartyRealtime(),
  ];

  sections.forEach(printSection);
}

main();
