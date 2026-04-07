import { supabase } from '@/shared/lib/supabase';
import {
  buildPreferredTitleSearchNames,
  getOrderedAliasValues,
  getSourceRefId,
  matchesTrailerCategory,
} from './adminFetchTrailerApi';

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase unavailable');
  }
}

function normalizeLooseText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function collectUniqueTitleValues(values = []) {
  const seen = new Set();
  return values
    .filter((value) => String(value || '').trim())
    .filter((value) => {
      const key = normalizeLooseText(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTitleLookupValues(titleRecord, extraValues = []) {
  return collectUniqueTitleValues([
    ...extraValues,
    titleRecord?.canonical_title,
    titleRecord?.slug,
    ...getOrderedAliasValues(titleRecord),
  ]);
}

function matchesTrailerTitleQuery(titleRecord, query) {
  const normalizedQuery = normalizeLooseText(query);
  if (!normalizedQuery) return true;

  return buildTitleLookupValues(titleRecord).some((value) => (
    normalizeLooseText(value).includes(normalizedQuery)
  ));
}

export function getAdminCharStaffTitleSortValue(ref, sortKey) {
  const titleRecord = Array.isArray(ref?.canonical_titles) ? ref.canonical_titles[0] : ref?.canonical_titles;
  switch (sortKey) {
    case 'rated':
      return Number(titleRecord?.avg_score || 0);
    case 'popular':
      return Number(titleRecord?.popularity_score || 0);
    case 'latest':
      return Number(titleRecord?.release_year || 0);
    case 'az':
      return String(titleRecord?.canonical_title || '').toLowerCase();
    case 'id':
    default:
      return Number(ref?.canonical_title_id || 0);
  }
}

export async function fetchAdminAniListCharStaffTargets({ onlyMissing = false, titleSort = 'popular', limit = 0 } = {}) {
  ensureSupabase();

  const { data: refs, error: refsError } = await supabase
    .from('title_source_refs')
    .select(`
      canonical_title_id,
      external_id,
      canonical_titles!inner(
        canonical_title,
        avg_score,
        popularity_score,
        release_year
      )
    `)
    .eq('provider', 'anilist');
  if (refsError) throw refsError;

  let targets = refs || [];

  if (onlyMissing) {
    const { data: existing } = await supabase.from('title_characters').select('canonical_title_id');
    const existingSet = new Set((existing || []).map((row) => row.canonical_title_id));
    targets = targets.filter((row) => !existingSet.has(row.canonical_title_id));
  }

  targets = [...targets].sort((a, b) => {
    if (titleSort === 'az') {
      return String(getAdminCharStaffTitleSortValue(a, 'az')).localeCompare(String(getAdminCharStaffTitleSortValue(b, 'az')));
    }
    return Number(getAdminCharStaffTitleSortValue(b, titleSort)) - Number(getAdminCharStaffTitleSortValue(a, titleSort));
  });

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  return targets;
}

export async function fetchAdminTrailerTargets({
  mode = 'batch',
  onlyMissing = true,
  category = 'all',
  limit = 0,
  titleQuery = '',
} = {}) {
  ensureSupabase();

  const explicitTitleQuery = String(titleQuery || '').trim();
  let targets = [];

  if (mode === 'search') {
    const { data: titleRows, error: titleError } = await supabase
      .from('canonical_titles')
      .select(`
        id,
        canonical_title,
        slug,
        release_year,
        type,
        subtype,
        trailer_url,
        trailer_video_id,
        aliases:aliases_cache,
        source_refs:title_source_refs(provider, external_id)
      `)
      .order('id', { ascending: true });
    if (titleError) throw titleError;

    targets = (titleRows || [])
      .filter((titleRecord) => matchesTrailerCategory(titleRecord, category))
      .filter((titleRecord) => matchesTrailerTitleQuery(titleRecord, explicitTitleQuery))
      .map((titleRecord) => ({
        canonical_title_id: titleRecord.id,
        external_id: getSourceRefId(titleRecord.source_refs, 'anilist') || null,
        canonical_titles: titleRecord,
      }));
  } else {
    let query = supabase
      .from('canonical_titles')
      .select(`
        id,
        canonical_title,
        slug,
        release_year,
        type,
        subtype,
        trailer_url,
        trailer_video_id,
        aliases:aliases_cache,
        source_refs:title_source_refs(provider, external_id)
      `)
      .order('id', { ascending: true });

    if (onlyMissing) {
      query = query.is('trailer_url', null).is('trailer_video_id', null);
    }

    const { data: titleRows, error: titleError } = await query;
    if (titleError) throw titleError;

    targets = (titleRows || [])
      .filter((titleRecord) => matchesTrailerCategory(titleRecord, category))
      .map((titleRecord) => ({
        canonical_title_id: titleRecord.id,
        external_id: getSourceRefId(titleRecord.source_refs, 'anilist') || null,
        canonical_titles: titleRecord,
      }));
  }

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  return targets;
}

export async function fetchAdminThemeTargets({ onlyMissing = true, limit = 0 } = {}) {
  ensureSupabase();

  const { data: titleRows, error: titleError } = await supabase
    .from('canonical_titles')
    .select(`
      id,
      canonical_title,
      release_year,
      type,
      subtype,
      aliases:aliases_cache,
      source_refs:title_source_refs(provider, external_id),
      themes:title_theme_songs(id)
    `)
    .eq('type', 'anime')
    .order('id', { ascending: true });
  if (titleError) throw titleError;

  let targets = (titleRows || []).filter((titleRecord) => {
    if (onlyMissing && Array.isArray(titleRecord.themes) && titleRecord.themes.length > 0) {
      return false;
    }
    return buildPreferredTitleSearchNames(titleRecord).length > 0;
  });

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  return targets;
}

export async function fetchAdminPornhwaCharacterTargets({ onlyMissing = true, limit = 0 } = {}) {
  ensureSupabase();

  const { data: refs, error: refsError } = await supabase
    .from('title_source_refs')
    .select('canonical_title_id, external_id, raw_payload, canonical_titles!inner(canonical_title)')
    .eq('provider', 'pornhwadb');
  if (refsError) throw refsError;

  let targets = refs || [];

  if (onlyMissing) {
    const { data: existing } = await supabase.from('title_characters').select('canonical_title_id');
    const existingSet = new Set((existing || []).map((row) => row.canonical_title_id));
    targets = targets.filter((row) => !existingSet.has(row.canonical_title_id));
  }

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  return targets;
}
