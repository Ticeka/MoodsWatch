import { supabase } from '@/shared/lib/supabase';
import { CANONICAL_TITLE_PREVIEW_SELECT, mapCanonicalTitle } from '@/shared/lib/catalog';
import { buildContentReportPayload } from '@/shared/lib/contentReports';

function normalizeJoinedTitleRecord(record) {
  const rawTitle = Array.isArray(record) ? record[0] : record;
  return rawTitle ? mapCanonicalTitle(rawTitle) : null;
}

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

export async function fetchVoiceActorRelatedCharacters({
  voiceActorName,
  currentTitleId = null,
  currentCharacterId = null,
  currentCharacterName = '',
  showAdult = null,
  limit = 18,
} = {}) {
  const normalizedName = String(voiceActorName || '').trim();
  if (!supabase || !normalizedName) {
    return [];
  }

  let query = supabase
    .from('title_characters')
    .select(`
      id,
      canonical_title_id,
      anilist_id,
      name_full,
      name_native,
      image_url,
      role,
      voice_actor_name,
      voice_actor_image,
      sort_order,
      canonical_titles!inner(${CANONICAL_TITLE_PREVIEW_SELECT})
    `)
    .eq('voice_actor_name', normalizedName)
    .order('sort_order', { ascending: true })
    .limit(Math.max(1, limit * 2));

  if (typeof showAdult === 'boolean') {
    query = query.eq('canonical_titles.is_adult', showAdult);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => ({
      id: Number(row.id),
      anilist_id: Number(row.anilist_id || 0) || null,
      name_full: row.name_full || '',
      name_native: row.name_native || '',
      image_url: row.image_url || '',
      role: row.role || '',
      voice_actor_name: row.voice_actor_name || '',
      voice_actor_image: row.voice_actor_image || '',
      title: normalizeJoinedTitleRecord(row.canonical_titles),
    }))
    .filter((entry) => entry.title?.id)
    .filter((entry) => {
      const sameTitle = Number(entry.title.id) === Number(currentTitleId || 0);
      const sameCharacterId = currentCharacterId && Number(entry.anilist_id || entry.id || 0) === Number(currentCharacterId);
      const sameCharacterName = currentCharacterName && String(entry.name_full || '').trim() === String(currentCharacterName || '').trim();
      return !(sameTitle && (sameCharacterId || sameCharacterName));
    })
    .slice(0, limit);
}

export async function fetchStaffRelatedTitles({
  anilistId = null,
  nameFull = '',
  currentTitleId = null,
  showAdult = null,
  limit = 12,
} = {}) {
  if (!supabase || (!anilistId && !String(nameFull || '').trim())) {
    return [];
  }

  let query = supabase
    .from('title_staff')
    .select(`
      id,
      canonical_title_id,
      anilist_id,
      name_full,
      role,
      sort_order,
      canonical_titles!inner(${CANONICAL_TITLE_PREVIEW_SELECT})
    `)
    .order('sort_order', { ascending: true })
    .limit(Math.max(1, limit * 4));

  if (anilistId) {
    query = query.eq('anilist_id', Number(anilistId));
  } else {
    query = query.eq('name_full', String(nameFull || '').trim());
  }

  if (typeof showAdult === 'boolean') {
    query = query.eq('canonical_titles.is_adult', showAdult);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const grouped = new Map();

  (data || []).forEach((row) => {
    const title = normalizeJoinedTitleRecord(row.canonical_titles);
    if (!title?.id || Number(title.id) === Number(currentTitleId || 0)) {
      return;
    }

    const key = Number(title.id);
    const current = grouped.get(key) || {
      title,
      roles: [],
    };

    if (row.role && !current.roles.includes(row.role)) {
      current.roles.push(row.role);
    }

    grouped.set(key, current);
  });

  return [...grouped.values()].slice(0, limit);
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
