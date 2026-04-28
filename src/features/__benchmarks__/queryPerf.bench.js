// Fetch-time benchmarks for the four query layers.
//
// What this measures: end-to-end wall time of each public API call when each
// Supabase roundtrip is simulated to take BENCH_LATENCY_MS (default 30ms).
// Output is a per-feature table of mean / p50 / p95 / min / max for each
// scenario. This isolates two independent costs:
//
//   - Roundtrip count: visible as a multiple of BENCH_LATENCY_MS
//   - Pure transform overhead: the residual after subtracting roundtrip cost
//
// Tweak via env vars:
//   BENCH_LATENCY_MS  per-roundtrip simulated latency (default 30)
//   BENCH_ITER        iterations per scenario          (default 25)
//
// Run:
//   npm run test:bench:queries
//   BENCH_LATENCY_MS=120 BENCH_ITER=15 npm run test:bench:queries

import { describe, it, beforeEach, afterAll, vi } from 'vitest';
import {
  attachDefaultRecorder,
  resetMockState,
  setRpcHandler,
  setTableHandler,
} from '@/shared/testing/supabaseRecorderHelpers';

const mockState = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  ops: [],
  rpcCalls: [],
  tableHandlers: new Map(),
  rpcHandlers: new Map(),
}));

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: mockState.from,
    rpc: mockState.rpc,
  },
}));

const battleCatalogApi = await import('@/features/battle/api/battleCatalogApi.js');
const battleRemoteApi = await import('@/features/battle/api/battleRemoteApi.js');
const tierlistQueriesApi = await import('@/features/tierlist/api/tierlistRemoteQueriesApi.js');
const tierlistSupportApi = await import('@/features/tierlist/api/tierlistRemoteSupportApi.js');
const tierlistBrowseApi = await import('@/features/tierlist/api/tierlistBrowseApi.js');

const LATENCY_MS = Number(process.env.BENCH_LATENCY_MS ?? 30);
const ITER = Math.max(3, Number(process.env.BENCH_ITER ?? 25));

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    mean: sum / sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    n: sorted.length,
  };
}

const sections = [];
let currentSection = null;

function section(label) {
  currentSection = { label, rows: [] };
  sections.push(currentSection);
}

async function bench(label, runOnce, opts = {}) {
  const iter = opts.iter ?? ITER;
  // single warmup pass — discarded
  await runOnce(-1);
  const samples = [];
  for (let i = 0; i < iter; i += 1) {
    const startedAt = performance.now();
    await runOnce(i);
    samples.push(performance.now() - startedAt);
  }
  currentSection.rows.push({ label, ...stats(samples) });
}

function fmtMs(value) { return `${value.toFixed(2)}ms`; }
function pad(s, n) { return String(s).padEnd(n); }
function lpad(s, n) { return String(s).padStart(n); }

function printReport() {
  const labelW = 58;
  const numW = 11;
  const totalW = labelW + numW * 5;
  const bar = '='.repeat(totalW);

  console.log('\n');
  console.log(bar);
  console.log(` Query Fetch Timing Benchmark`);
  console.log(` simulated roundtrip latency: ${LATENCY_MS}ms   |   iterations: ${ITER}`);
  console.log(` (override via BENCH_LATENCY_MS / BENCH_ITER env vars)`);
  console.log(bar);

  for (const sec of sections) {
    console.log(`\n[ ${sec.label} ]`);
    console.log(
      pad('scenario', labelW)
      + lpad('mean', numW)
      + lpad('p50', numW)
      + lpad('p95', numW)
      + lpad('min', numW)
      + lpad('max', numW)
    );
    console.log('-'.repeat(totalW));
    for (const row of sec.rows) {
      console.log(
        pad(row.label, labelW)
        + lpad(fmtMs(row.mean), numW)
        + lpad(fmtMs(row.p50), numW)
        + lpad(fmtMs(row.p95), numW)
        + lpad(fmtMs(row.min), numW)
        + lpad(fmtMs(row.max), numW)
      );
    }
  }
  console.log('\n' + bar + '\n');
}

function makeTitleRpcHandler() {
  return () => ({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      slug: `s-${i}`,
      canonical_title: `Title ${i}`,
      type: 'anime',
      subtype: 'tv',
      release_year: 2024,
      is_adult: false,
      cover_image: '',
      banner_image: '',
      aliases: [],
      genres: [],
      tags: [],
      moods: [],
      total_count: 480,
    })),
    error: null,
  });
}

function makeSongRpcHandler() {
  return () => ({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      song_title: `Song ${i}`,
      artist_name: 'Artist',
      total_count: 100,
      source_id: i + 1,
      source_slug: `t-${i}`,
      source_canonical_title: `Title ${i}`,
      source_aliases: [],
    })),
    error: null,
  });
}

function makeCharacterRpcHandler() {
  return () => ({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      total_count: 100,
      character_index: i,
      source_id: 1,
      source_slug: 't',
      source_canonical_title: 'T',
      source_aliases: [],
      source_type: 'anime',
      source_subtype: 'tv',
      source_genres: [],
      source_tags: [],
      source_moods: [],
    })),
    error: null,
  });
}

function makeCanonicalTitleSelectHandler() {
  return ({ filters }) => {
    const inFilter = filters.find((f) => f.kind === 'in' && f.col === 'id');
    const ids = inFilter?.vals || [];
    return {
      data: ids.map((id) => ({
        id,
        slug: `t-${id}`,
        canonical_title: `T${id}`,
        is_adult: false,
        aliases: [],
      })),
      error: null,
    };
  };
}

function makeThemeSongSelectHandler() {
  return ({ filters }) => {
    const inFilter = filters.find((f) => f.kind === 'in' && f.col === 'id');
    const ids = inFilter?.vals || [];
    return {
      data: ids.map((id) => ({
        id,
        theme_type: 'opening',
        theme_sequence: 1,
        song_title: `Song ${id}`,
        artist_name: 'Artist',
        canonical_title_id: id,
        canonical_titles: { id, slug: `t-${id}`, canonical_title: `T${id}`, is_adult: false, aliases: [] },
        source_title: { id, slug: `t-${id}`, canonical_title: `T${id}`, is_adult: false, aliases: [] },
      })),
      error: null,
    };
  };
}

function makeCharacterSelectHandler() {
  return ({ filters }) => {
    const inFilter = filters.find((f) => f.kind === 'in');
    const ids = inFilter?.vals || [];
    return {
      data: ids.map((id) => ({
        id,
        canonical_title_id: 1,
        anilist_id: id,
        name_full: `C${id}`,
        name_native: '',
        image_url: '',
        role: 'main',
        is_primary_protagonist: false,
        is_primary_heroine: false,
        lead_type: '',
        presentation_gender: '',
        voice_actor_name: '',
        voice_actor_image: '',
        sort_order: id,
        canonical_titles: { id: 1, slug: 't', canonical_title: 'T', is_adult: false, aliases: [] },
      })),
      error: null,
    };
  };
}

describe('query fetch timing benchmark', () => {
  beforeEach(() => {
    resetMockState(mockState);
    attachDefaultRecorder(mockState, { latencyMs: LATENCY_MS });
    tierlistSupportApi.invalidateTierlistRemoteCaches();
  });

  afterAll(() => {
    printReport();
  });

  // -------------------------------------------------------------- catalog --
  it('catalog (titles + characters + theme songs)', async () => {
    section('Catalog Titles / Characters / Theme Songs');

    setRpcHandler(mockState, 'search_battle_titles', makeTitleRpcHandler());
    setRpcHandler(mockState, 'search_battle_theme_songs', makeSongRpcHandler());
    setRpcHandler(mockState, 'search_battle_characters', makeCharacterRpcHandler());
    setRpcHandler(mockState, 'get_battle_title_facets', () => ({
      data: [{ genres: ['action'], tags: [], moods: [], trailer_providers: [] }],
      error: null,
    }));
    setTableHandler(mockState, 'canonical_titles', makeCanonicalTitleSelectHandler());
    setTableHandler(mockState, 'title_theme_songs', makeThemeSongSelectHandler());

    await bench('fetchBattleTitlesPage (cold per call)', async () => {
      await battleCatalogApi.fetchBattleTitlesPage({
        query: `cold-${Math.random()}`,
        page: 0,
        pageSize: 24,
      });
    });

    await bench('fetchBattleTitlesPage (warm cache hit)', async () => {
      await battleCatalogApi.fetchBattleTitlesPage({
        query: 'warm-key',
        page: 0,
        pageSize: 24,
      });
    });

    await bench('10 sequential cold (distinct cache keys)', async () => {
      for (let j = 0; j < 10; j += 1) {
        await battleCatalogApi.fetchBattleTitlesPage({
          query: `seq-${Math.random()}`,
          page: 0,
          pageSize: 24,
        });
      }
    });

    await bench('10 parallel cold same key (in-flight dedup)', async () => {
      const key = `dedup-${Math.random()}`;
      await Promise.all(Array.from({ length: 10 }, () =>
        battleCatalogApi.fetchBattleTitlesPage({ query: key, page: 0, pageSize: 24 })
      ));
    });

    await bench('fetchBattleThemeSongsPage (cold)', async () => {
      await battleCatalogApi.fetchBattleThemeSongsPage({
        query: `songs-${Math.random()}`,
        page: 0,
        pageSize: 24,
      });
    });

    await bench('fetchBattleCharactersPage (cold)', async () => {
      await battleCatalogApi.fetchBattleCharactersPage({
        query: `chars-${Math.random()}`,
        page: 0,
        pageSize: 24,
      });
    });

    await bench('fetchBattleTitleFacets (cold)', async () => {
      await battleCatalogApi.fetchBattleTitleFacets({
        showAdult: false,
        hiddenTitleIds: [Math.random()],
      });
    });

    await bench('hydrate 50 title ids (1 batched select)', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => i + 1);
      await battleCatalogApi.hydrateBattleEntriesByIds(ids, 'title');
    });

    await bench('hydrate 50 song ids (1 batched select)', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => i + 1);
      await battleCatalogApi.hydrateBattleEntriesByIds(ids, 'theme_song');
    });
  });

  // ------------------------------------------------------- tierlist remote --
  it('tierlist (personal lists + templates)', async () => {
    section('Tierlist (Personal)');

    setTableHandler(mockState, 'tierlist_templates', () => ({
      data: Array.from({ length: 12 }, (_, i) => ({
        id: `tpl-${i}`,
        owner_user_id: null,
        title: `Template ${i}`,
        description: '',
        category: 'anime',
        title_ids: [],
        default_rows: [],
        is_public: true,
        is_system: false,
        plays: 10,
        has_adult_content: false,
        preview_artwork_url: null,
        custom_items: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      })),
      error: null,
    }));
    setTableHandler(mockState, 'tierlist_lists', () => ({
      data: Array.from({ length: 8 }, (_, i) => ({
        id: `lst-${i}`,
        owner_user_id: 'u',
        template_id: 'tpl',
        title: `List ${i}`,
        description: '',
        is_public: false,
        play_count: 0,
        owner_name: 'u',
        owner_username: 'u',
        has_adult_content: false,
        custom_items: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      })),
      error: null,
    }));
    setTableHandler(mockState, 'tierlist_list_rows', () => ({
      data: Array.from({ length: 40 }, (_, i) => ({
        id: `row-${i}`,
        list_id: `lst-${i % 8}`,
        position: i,
        label: 'S',
        color: '#fff',
        title_ids: [1, 2, 3],
      })),
      error: null,
    }));
    setTableHandler(mockState, 'tierlist_list_pool_items', () => ({
      data: Array.from({ length: 40 }, (_, i) => ({
        list_id: `lst-${i % 8}`,
        title_id: i + 1,
        position: i,
      })),
      error: null,
    }));

    await bench('fetchRemoteTemplates (cold, 2 selects parallel)', async () => {
      tierlistSupportApi.invalidateTierlistRemoteCaches();
      await tierlistQueriesApi.fetchRemoteTemplates(`u-${Math.random()}`);
    });

    await bench('fetchRemoteTemplates (warm cache hit)', async () => {
      await tierlistQueriesApi.fetchRemoteTemplates('u-warm');
    });

    await bench('fetchRemoteLists default (lists + rows + pool)', async () => {
      tierlistSupportApi.invalidateTierlistRemoteCaches();
      await tierlistQueriesApi.fetchRemoteLists(`u-${Math.random()}`, {
        includePublic: false,
        includeOwned: true,
        skipRows: false,
        skipPoolItems: false,
      });
    });

    await bench('fetchRemoteLists rows-only (lists + rows)', async () => {
      tierlistSupportApi.invalidateTierlistRemoteCaches();
      await tierlistQueriesApi.fetchRemoteLists(`u-${Math.random()}`, {
        includePublic: false,
        includeOwned: true,
        skipRows: false,
        skipPoolItems: true,
      });
    });

    await bench('fetchRemoteLists skip rows + pool (1 select)', async () => {
      tierlistSupportApi.invalidateTierlistRemoteCaches();
      await tierlistQueriesApi.fetchRemoteLists(`u-${Math.random()}`, {
        includePublic: false,
        includeOwned: true,
        skipRows: true,
        skipPoolItems: true,
      });
    });

    await bench('loadOwnedTierListStats (1 select)', async () => {
      await tierlistQueriesApi.loadOwnedTierListStats(`u-${Math.random()}`);
    });

    await bench('loadListPoolItems (1 select)', async () => {
      await tierlistQueriesApi.loadListPoolItems(`lst-${Math.random()}`);
    });
  });

  // ----------------------------------------------------- community browse --
  it('community tierlist browse', async () => {
    section('Community Tierlist (Browse)');

    setTableHandler(mockState, 'title_theme_songs', makeThemeSongSelectHandler());
    setTableHandler(mockState, 'title_characters', makeCharacterSelectHandler());
    setTableHandler(mockState, 'canonical_titles', makeCanonicalTitleSelectHandler());

    await bench('fetchTierlistThemeSongEntities (50 ids)', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => i + 1);
      await tierlistBrowseApi.fetchTierlistThemeSongEntities(ids);
    });

    await bench('fetchTierlistCharacterEntities (50 ids, 1 chunk)', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => i + 1);
      await tierlistBrowseApi.fetchTierlistCharacterEntities(ids);
    });

    await bench('fetchTierlistCharacterEntities (500 ids, ~3 chunks)', async () => {
      const ids = Array.from({ length: 500 }, (_, i) => i + 1);
      await tierlistBrowseApi.fetchTierlistCharacterEntities(ids);
    });

    await bench('fetchTierlistBrowseVisibility (200 titles + 100 songs)', async () => {
      const titleIds = Array.from({ length: 200 }, (_, i) => i + 1);
      const songIds = Array.from({ length: 100 }, (_, i) => 1000 + i);
      await tierlistBrowseApi.fetchTierlistBrowseVisibility({ titleIds, songIds }, false);
    });

    setTableHandler(mockState, 'title_theme_songs', () => ({
      data: Array.from({ length: 5000 }, (_, i) => ({ canonical_title_id: (i % 250) + 1 })),
      error: null,
    }));
    await bench('fetchTierlistSongCountMap (5k rows transform)', async () => {
      await tierlistBrowseApi.fetchTierlistSongCountMap();
    });
  });

  // ---------------------------------------------------------------- battle --
  it('battle (sessions + decks + rollup)', async () => {
    section('Battle (Sessions / Public Decks / Rollup)');

    setTableHandler(mockState, 'battle_sessions', () => ({
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `s${i}`,
        user_id: 'u',
        deck_key: 'k',
        deck_fingerprint: '1:2',
        deck_label: 'L',
        filters: {},
        title_ids: [],
        titles_snapshot: [],
        target_rounds: 8,
        status: 'active',
        current_pair: null,
        ratings: {},
        history: [],
        snapshot: {},
      })),
      error: null,
    }));
    setTableHandler(mockState, 'battle_public_decks', () => ({
      data: Array.from({ length: 24 }, (_, i) => ({
        id: `d${i}`,
        owner_user_id: 'u',
        owner_display_name: 'u',
        owner_username: 'u',
        deck_key: 'k',
        deck_fingerprint: '1:2',
        deck_label: 'L',
        filters: {},
        title_ids: [],
        titles_snapshot: [],
        title_count: 0,
        source_count: 0,
        play_count: 0,
      })),
      error: null,
    }));
    setTableHandler(mockState, 'battle_deck_rollups', () => ({
      data: { deck_fingerprint: '1:2', deck_key: 'k', title_ids: [], total_vote_count: 0 },
      error: null,
    }));
    setRpcHandler(mockState, 'refresh_battle_deck_rollup', () => ({ data: null, error: null }));
    setRpcHandler(mockState, 'increment_battle_public_deck_play_count', () => ({ data: null, error: null }));

    await bench('fetchRemoteBattleSessions (1 select, limit 20)', async () => {
      await battleRemoteApi.fetchRemoteBattleSessions('u');
    });

    await bench('fetchRemoteBattleSession (maybeSingle)', async () => {
      await battleRemoteApi.fetchRemoteBattleSession('u', 'sid');
    });

    await bench('fetchPublicBattleDecks (1 select, range 0-23)', async () => {
      await battleRemoteApi.fetchPublicBattleDecks({ limit: 24, offset: 0 });
    });

    await bench('fetchMyPublicBattleDecks (1 select)', async () => {
      await battleRemoteApi.fetchMyPublicBattleDecks('u');
    });

    await bench('fetchBattleCommunityRollup (maybeSingle)', async () => {
      await battleRemoteApi.fetchBattleCommunityRollup('1:2');
    });

    await bench('incrementRemotePublicBattleDeckPlayCount (1 RPC)', async () => {
      await battleRemoteApi.incrementRemotePublicBattleDeckPlayCount('deck-x');
    });

    await bench('persistRemoteBattleSession (active)', async () => {
      await battleRemoteApi.persistRemoteBattleSession('u', {
        id: '00000000-0000-4000-8000-000000000abc',
        deckKey: 'k',
        deckFingerprint: '1:2',
        deckLabel: 'L',
        filters: { entityType: 'title' },
        titles: [
          { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
          { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
        ],
        titleIds: [1, 2],
        targetRounds: 8,
        history: [],
        ratings: {},
        ranking: null,
        tiers: null,
        winnerId: null,
        snapshot: {},
        fastState: null,
        status: 'active',
        currentPair: null,
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:01:00.000Z',
        completedAt: null,
      });
    });

    await bench('persistRemoteBattleSession (completed) — incl. rollup RPC', async () => {
      await battleRemoteApi.persistRemoteBattleSession('u', {
        id: '00000000-0000-4000-8000-000000000abd',
        deckKey: 'k',
        deckFingerprint: '1:2',
        deckLabel: 'L',
        filters: { entityType: 'title' },
        titles: [
          { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
          { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
        ],
        titleIds: [1, 2],
        targetRounds: 8,
        history: [],
        ratings: {},
        ranking: [
          { id: 1, entityType: 'title', title_en: 'A', title_th: 'A' },
          { id: 2, entityType: 'title', title_en: 'B', title_th: 'B' },
        ],
        tiers: [],
        winnerId: 1,
        snapshot: {},
        fastState: null,
        status: 'completed',
        currentPair: null,
        createdAt: '2026-04-27T00:00:00.000Z',
        updatedAt: '2026-04-27T00:01:00.000Z',
        completedAt: '2026-04-27T00:05:00.000Z',
      });
    });
  });
});
