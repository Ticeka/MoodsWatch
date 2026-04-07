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

export async function fetchAdminAnalyticsData() {
  ensureSupabase();

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
    supabase.from('canonical_titles').select('*', { count: 'estimated', head: true }),
    supabase.from('canonical_titles').select('*', { count: 'estimated', head: true }).eq('type', 'anime'),
    supabase.from('canonical_titles').select('*', { count: 'estimated', head: true }).eq('type', 'manga').eq('subtype', 'manga'),
    supabase.from('canonical_titles').select('*', { count: 'estimated', head: true }).eq('type', 'manga').eq('subtype', 'manhwa'),
    supabase.from('user_profiles').select('*', { count: 'estimated', head: true }),
    supabase.from('user_lists').select('*', { count: 'estimated', head: true }),
    supabase.from('moods').select('*', { count: 'estimated', head: true }),
    supabase.from('canonical_titles')
      .select('id, slug, canonical_title, type, subtype, avg_score, cover_image, popularity_score')
      .order('avg_score', { ascending: false, nullsFirst: false })
      .limit(10),
    supabase.from('canonical_titles')
      .select('id, slug, canonical_title, type, subtype, created_at, cover_image')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('editor_collections').select('id, status, visibility, is_featured, created_at, updated_at'),
    supabase.from('editor_collection_items').select('*', { count: 'estimated', head: true }),
    supabase.from('homepage_content_blocks').select('id, status, visibility, block_type, created_at, updated_at'),
    supabase.from('content_reports').select(CONTENT_REPORT_SELECT).order('created_at', { ascending: false }).limit(1000),
    supabase.from('duplicate_candidates').select(DUPLICATE_CANDIDATE_SELECT).order('created_at', { ascending: false }).limit(1000),
    supabase.from('discover_search_events').select('*').order('created_at', { ascending: false }).limit(1000),
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
    discoverEvents: (discoverEventsRes.error && isMissingTableError(discoverEventsRes.error, 'discover_search_events'))
      ? []
      : (discoverEventsRes.data || []),
    reports: (reportsRes.data || []).map((row) => mapContentReport(row)),
    duplicates: (duplicatesRes.data || []).map((row) => mapDuplicateCandidate(row)),
  };
}
