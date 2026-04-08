import { supabase } from '@/shared/lib/supabase';
import {
  CONTENT_REPORT_SELECT,
  mapContentReport,
} from '@/shared/lib/contentReports';
import {
  DUPLICATE_CANDIDATE_SELECT,
  mapDuplicateCandidate,
} from '@/shared/lib/duplicates';
import { mapCanonicalTitle } from '@/shared/lib/catalog';

const ADMIN_DASHBOARD_STALE_TIME = 30_000;
const ADMIN_ANALYTICS_WINDOW_DAYS = 30;

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes(tableName.toLowerCase()) && (
      message.includes('schema cache')
      || message.includes('relation')
      || message.includes('does not exist')
    )
  );
}

function getAnalyticsWindowStartIso(days = ADMIN_ANALYTICS_WINDOW_DAYS) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function fetchAdminDashboardData() {
  ensureSupabase();

  const [
    usersCount,
    titlesCount,
    listsCount,
    collectionsCount,
    homepageBlocksCount,
    openReportsCount,
    pendingDuplicatesCount,
    recentUsersData,
  ] = await Promise.all([
    supabase.from('user_profiles').select('id', { count: 'estimated', head: true }),
    supabase.from('canonical_titles').select('id', { count: 'estimated', head: true }),
    supabase.from('user_lists').select('id', { count: 'estimated', head: true }),
    supabase.from('editor_collections').select('id', { count: 'estimated', head: true }),
    supabase.from('homepage_content_blocks').select('id', { count: 'estimated', head: true }),
    supabase.from('content_reports').select('id', { count: 'estimated', head: true }).in('status', ['open', 'in_review']),
    supabase.from('duplicate_candidates').select('id', { count: 'estimated', head: true }).eq('status', 'pending'),
    supabase.from('user_profiles').select('id, name, role, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  const responseErrors = [
    usersCount.error,
    titlesCount.error,
    listsCount.error,
    collectionsCount.error,
    homepageBlocksCount.error,
    openReportsCount.error,
    pendingDuplicatesCount.error,
    recentUsersData.error,
  ].filter(Boolean);

  if (responseErrors.length > 0) {
    throw responseErrors[0];
  }

  return {
    stats: {
      totalUsers: usersCount.count || 0,
      totalTitles: titlesCount.count || 0,
      totalLists: listsCount.count || 0,
      totalCollections: collectionsCount.count || 0,
      totalHomepageBlocks: homepageBlocksCount.count || 0,
      openReports: openReportsCount.count || 0,
      pendingDuplicates: pendingDuplicatesCount.count || 0,
    },
    recentUsers: recentUsersData.data || [],
    fetchedAt: Date.now(),
  };
}

export async function fetchAdminAnalyticsData() {
  ensureSupabase();
  const analyticsWindowStart = getAnalyticsWindowStartIso();

  const [
    titlesRes,
    animeRes,
    mangaRes,
    manhwaRes,
    usersRes,
    listsRes,
    moodsRes,
    topTitlesRes,
    recentTitlesRes,
    collectionsRes,
    collectionItemsRes,
    blocksRes,
    reportsRes,
    duplicatesRes,
    discoverEventsRes,
  ] = await Promise.all([
    supabase.from('canonical_titles').select('id', { count: 'estimated', head: true }),
    supabase.from('canonical_titles').select('id', { count: 'estimated', head: true }).eq('type', 'anime'),
    supabase.from('canonical_titles').select('id', { count: 'estimated', head: true }).eq('type', 'manga').eq('subtype', 'manga'),
    supabase.from('canonical_titles').select('id', { count: 'estimated', head: true }).eq('type', 'manga').eq('subtype', 'manhwa'),
    supabase.from('user_profiles').select('id', { count: 'estimated', head: true }),
    supabase.from('user_lists').select('id', { count: 'estimated', head: true }),
    supabase.from('moods').select('id', { count: 'estimated', head: true }),
    supabase.from('canonical_titles')
      .select('id, slug, canonical_title, type, subtype, avg_score, cover_image, popularity_score')
      .order('avg_score', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase.from('canonical_titles')
      .select('id, slug, canonical_title, type, subtype, created_at, cover_image')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('editor_collections').select('id, status, visibility, is_featured, created_at, updated_at'),
    supabase.from('editor_collection_items').select('id', { count: 'estimated', head: true }),
    supabase.from('homepage_content_blocks').select('id, status, visibility, block_type, created_at, updated_at'),
    supabase.from('content_reports').select(CONTENT_REPORT_SELECT).gte('created_at', analyticsWindowStart).order('created_at', { ascending: false }).limit(250),
    supabase.from('duplicate_candidates').select(DUPLICATE_CANDIDATE_SELECT).gte('created_at', analyticsWindowStart).order('created_at', { ascending: false }).limit(250),
    supabase
      .from('discover_search_events')
      .select('id, event_type, query, normalized_query, result_type, preset_source, session_id, created_at')
      .gte('created_at', analyticsWindowStart)
      .order('created_at', { ascending: false })
      .limit(600),
  ]);

  const responseErrors = [
    titlesRes.error,
    animeRes.error,
    mangaRes.error,
    manhwaRes.error,
    usersRes.error,
    listsRes.error,
    moodsRes.error,
    topTitlesRes.error,
    recentTitlesRes.error,
    collectionsRes.error,
    collectionItemsRes.error,
    blocksRes.error,
    reportsRes.error,
    duplicatesRes.error,
    discoverEventsRes.error && !isMissingTableError(discoverEventsRes.error, 'discover_search_events')
      ? discoverEventsRes.error
      : null,
  ].filter(Boolean);

  if (responseErrors.length > 0) {
    throw responseErrors[0];
  }

  return {
    catalog: {
      totalTitles: titlesRes.count || 0,
      totalAnime: animeRes.count || 0,
      totalManga: mangaRes.count || 0,
      totalManhwa: manhwaRes.count || 0,
      totalUsers: usersRes.count || 0,
      totalLists: listsRes.count || 0,
      totalMoods: moodsRes.count || 0,
      topTitles: (topTitlesRes.data || []).map(mapCanonicalTitle),
      recentTitles: (recentTitlesRes.data || []).map(mapCanonicalTitle),
    },
    editorial: {
      collections: collectionsRes.data || [],
      collectionItems: collectionItemsRes.count || 0,
      blocks: blocksRes.data || [],
    },
    freshness: {
      fetchedAt: Date.now(),
      windowDays: ADMIN_ANALYTICS_WINDOW_DAYS,
      staleTime: ADMIN_DASHBOARD_STALE_TIME,
    },
    discoverEvents: (discoverEventsRes.error && isMissingTableError(discoverEventsRes.error, 'discover_search_events'))
      ? []
      : (discoverEventsRes.data || []),
    reports: (reportsRes.data || []).map((row) => mapContentReport(row)),
    duplicates: (duplicatesRes.data || []).map((row) => mapDuplicateCandidate(row)),
  };
}
