import { supabase } from '@/shared/lib/supabase';
import { buildContentReportPayload } from '@/shared/lib/contentReports';

export async function fetchTitleStatusCounts(titleId) {
  if (!supabase || !titleId) {
    return {};
  }

  const { data, error } = await supabase.rpc('get_title_status_counts', { p_title_id: titleId });
  if (error) {
    throw error;
  }

  const counts = {};
  (data || []).forEach((row) => {
    counts[row.list_status] = Number(row.count);
  });
  return counts;
}

export async function fetchTitleThemeSongs(titleId) {
  if (!supabase || !titleId) {
    return [];
  }

  const { data, error } = await supabase
    .from('title_theme_songs')
    .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
    .eq('canonical_title_id', titleId)
    .order('display_order')
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createTitleAvailabilityLink({ titleId, platformName, url, regionCode = null }) {
  if (!supabase || !titleId || !platformName || !url) {
    throw new Error('Title availability save is not available');
  }

  const { error } = await supabase.from('title_availability').insert({
    canonical_title_id: titleId,
    platform_name: platformName,
    url,
    region_code: regionCode,
    is_official: true,
  });

  if (error) {
    throw error;
  }
}

export async function deleteTitleAvailabilityLink({ titleId, platformName, url }) {
  if (!supabase || !titleId || !platformName || !url) {
    throw new Error('Title availability delete is not available');
  }

  const { error } = await supabase
    .from('title_availability')
    .delete()
    .eq('canonical_title_id', titleId)
    .eq('platform_name', platformName)
    .eq('url', url);

  if (error) {
    throw error;
  }
}

export async function submitTitleContentReport(reportForm, userId, titleId) {
  if (!supabase || !userId || !titleId) {
    throw new Error('Content report submission is not available');
  }

  const { error } = await supabase
    .from('content_reports')
    .insert(buildContentReportPayload(reportForm, userId, titleId, 'title_detail'));

  if (error) {
    throw error;
  }
}
