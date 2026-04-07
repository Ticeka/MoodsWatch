import { supabase } from '@/shared/lib/supabase';
import {
  buildUniquePartyAliases,
  isDirectPartyMediaUrl,
  normalizePartyText,
} from '../lib/partyEngine.js';
import {
  PARTY_TEMPLATE_DEFAULT_PRESET_ID,
  PARTY_TEMPLATE_ITEM_PROVIDER,
  PARTY_TEMPLATE_ITEM_SOURCE_KIND,
  PARTY_TEMPLATE_PLAYBACK_STATUS,
  PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE,
  PARTY_TEMPLATE_SOURCE_MATCH_METHOD,
  PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS,
} from '../lib/partyTemplateSchema.js';
import {
  resolveTemplateCoverUrl,
  sanitizeTemplateCoverUrl,
} from '../lib/partyTemplateUtils.js';
import {
  applyYoutubeSourceSuggestion,
  extractYoutubeSourceCandidates,
  isYoutubeItemPlayable,
  normalizeYoutubePlaylistPayload,
  normalizeYoutubeVideoPayload,
  scoreYoutubeSourceCandidateMatch,
} from '../lib/partyYoutube.js';

const PARTY_SONG_POOL_CACHE_TTL_MS = 2 * 60 * 1000;

const partyPresetSongPoolCache = new Map();
const partyTemplateSongPoolCache = new Map();
const partySourceSuggestionCache = new Map();

function getPartySongPoolCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.promise) return entry;
  if (Number(entry.expiresAt || 0) > Date.now()) return entry;
  cache.delete(key);
  return null;
}

async function getOrCreatePartySongPoolCacheValue(cache, key, loader) {
  const cachedEntry = getPartySongPoolCacheEntry(cache, key);
  if (cachedEntry?.promise) return cachedEntry.promise;
  if (cachedEntry?.value) return cachedEntry.value;

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
    sourceTitleAliases: buildUniquePartyAliases([row?.resolved_source_title_name, row?.source_title_name]),
    resolvedSourceTitleId: Number(row?.resolved_source_title_id || 0),
    resolvedSourceTitleName: row?.resolved_source_title_name || '',
    sourceResolutionStatus: row?.source_resolution_status || '',
    sourceMatchConfidence: row?.source_match_confidence || '',
    sourceMatchMethod: row?.source_match_method || '',
    coverUrl: row?.cover_url || '',
    previewStartSec: 0,
  };
}

function mapPartyTemplateSongItem(row) {
  const provider = String(row?.provider || PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG);
  const isYoutube = provider === PARTY_TEMPLATE_ITEM_PROVIDER.YOUTUBE;

  return {
    id: isYoutube ? 0 : Number(row?.song_id || 0),
    themeType: row?.theme_type || 'OP',
    songTitle: row?.song_title || '',
    songAliases: buildUniquePartyAliases([row?.song_title]),
    artistName: row?.artist_name || '',
    isCreditless: false,
    mediaUrl: row?.media_url || '',
    sourceTitleId: Number(row?.source_title_id || 0),
    sourceTitleName: row?.source_title_name || '',
    sourceTitleAliases: buildUniquePartyAliases([
      row?.resolved_source_title_name,
      row?.source_title_name,
    ]),
    resolvedSourceTitleId: Number(row?.resolved_source_title_id || 0),
    resolvedSourceTitleName: row?.resolved_source_title_name || '',
    sourceResolutionStatus: row?.source_resolution_status || '',
    sourceMatchConfidence: row?.source_match_confidence || '',
    sourceMatchMethod: row?.source_match_method || '',
    coverUrl: row?.cover_url || '',
    previewStartSec: 0,
    provider,
    sourceKind: row?.source_kind || PARTY_TEMPLATE_ITEM_SOURCE_KIND.CATALOG,
    playbackStatus: row?.playback_status || PARTY_TEMPLATE_PLAYBACK_STATUS.UNKNOWN,
    providerMediaId: row?.provider_media_id || null,
    providerCollectionId: row?.provider_collection_id || null,
    providerUrl: row?.provider_url || null,
    durationSec: row?.duration_sec ?? null,
  };
}

function isRuntimePlayableSong(song) {
  if (String(song.provider || '').trim().toLowerCase() === PARTY_TEMPLATE_ITEM_PROVIDER.YOUTUBE) {
    return isYoutubeItemPlayable(song);
  }
  if (song.playbackStatus === PARTY_TEMPLATE_PLAYBACK_STATUS.READY) return true;
  if (song.playbackStatus === PARTY_TEMPLATE_PLAYBACK_STATUS.BLOCKED) return false;
  return Boolean(song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl));
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

function matchesPartySongSearch(song, normalizedQuery) {
  if (!normalizedQuery) return true;

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

  if (songTitle === normalizedQuery || sourceTitle === normalizedQuery) return 0;
  if (aliases.includes(normalizedQuery)) return 1;
  if (songTitle.startsWith(normalizedQuery) || sourceTitle.startsWith(normalizedQuery)) return 2;
  if (artistName.startsWith(normalizedQuery)) return 3;
  if (songTitle.includes(normalizedQuery) || sourceTitle.includes(normalizedQuery)) return 4;
  if (artistName.includes(normalizedQuery) || aliases.some((value) => value.includes(normalizedQuery))) return 5;
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
      if (rightPopularity !== leftPopularity) return rightPopularity - leftPopularity;
      return String(left[0]?.sourceTitleName || '').localeCompare(String(right[0]?.sourceTitleName || ''));
    });

  const mixed = [];
  while (queue.length > 0) {
    const nextQueue = [];
    queue.forEach((bucket) => {
      const item = bucket.shift();
      if (item) mixed.push(item);
      if (bucket.length > 0) nextQueue.push(bucket);
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

function buildRandomPartyPageSet({ seedPage = 0, count = 12, maxPage = 30 } = {}) {
  const pages = new Set([Math.max(0, Number(seedPage || 0))]);
  while (pages.size < count) {
    pages.add(Math.floor(Math.random() * Math.max(1, maxPage + 1)));
  }
  return [...pages];
}

function sortPartySongSearchResults(results = [], normalizedQuery = '', sortBy = 'relevance') {
  const items = [...results];

  items.sort((left, right) => {
    if (sortBy === 'random') return 0;
    if (sortBy === 'mixed') {
      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) return popularityDiff;
      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }
    if (sortBy === 'title') {
      const titleCompare = String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
      if (titleCompare !== 0) return titleCompare;
      return String(left.songTitle || '').localeCompare(String(right.songTitle || ''));
    }
    if (sortBy === 'popularity') {
      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) return popularityDiff;
      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }
    if (sortBy === 'score') {
      const scoreDiff = Number(right.sourceAvgScore || 0) - Number(left.sourceAvgScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
      if (popularityDiff !== 0) return popularityDiff;
      return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
    }

    const rankDiff = getPartySongSearchRank(left, normalizedQuery) - getPartySongSearchRank(right, normalizedQuery);
    if (rankDiff !== 0) return rankDiff;
    const popularityDiff = Number(right.sourcePopularityScore || 0) - Number(left.sourcePopularityScore || 0);
    if (popularityDiff !== 0) return popularityDiff;
    return String(left.sourceTitleName || '').localeCompare(String(right.sourceTitleName || ''));
  });

  if (sortBy === 'mixed') return mixPartySongsBySource(items);
  if (sortBy === 'random') return shufflePartySongResults(items);
  return items;
}

function mapPartyTemplate(row) {
  const itemsArr = Array.isArray(row?.party_song_template_items) ? row.party_song_template_items : [];
  let itemCount = Number(row?.item_count ?? 0);
  if (!itemCount && itemsArr.length > 0) {
    const firstEntry = itemsArr[0];
    if (firstEntry && 'count' in firstEntry) {
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
    youtubeSourceUrl: row?.youtube_source_url || null,
    youtubePlaylistId: row?.youtube_playlist_id || null,
    youtubeSyncMode: row?.youtube_sync_mode || null,
    lastSyncedAt: row?.last_synced_at || null,
    importStatus: row?.import_status || null,
    importError: row?.import_error || null,
  };
}

async function fetchPartyTemplateCreatorMap(ownerUserIds = []) {
  const ids = [...new Set(
    (Array.isArray(ownerUserIds) ? ownerUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
  if (!supabase || ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, name, username')
    .in('id', ids);

  if (error) {
    console.warn('Failed to load template creator profiles:', error.message || error);
    return new Map();
  }

  return new Map(
    (data || []).map((profile) => ([
      String(profile?.id || '').trim(),
      String(profile?.name || profile?.username || '').trim(),
    ]))
  );
}

function applyPartyTemplateCreatorNames(templates = [], creatorMap = new Map()) {
  return templates.map((template) => {
    const ownerUserId = String(template?.ownerUserId || '').trim();
    const creatorName = creatorMap.get(ownerUserId) || template?.creatorName || '';
    return { ...template, creatorName };
  });
}

function getSourceConfidenceRank(value = '') {
  switch (String(value || '').trim().toLowerCase()) {
    case PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT:
      return 4;
    case PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH:
      return 3;
    case PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.MEDIUM:
      return 2;
    default:
      return 1;
  }
}

function shouldReplaceSourceSuggestion(currentItem = {}, nextSuggestion = null) {
  if (!nextSuggestion?.resolvedSourceTitleId || !nextSuggestion?.resolvedSourceTitleName) {
    return false;
  }

  const currentResolutionStatus = String(
    currentItem?.sourceResolutionStatus ?? currentItem?.source_resolution_status ?? '',
  ).trim().toLowerCase();
  if (currentResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED) {
    return false;
  }

  const currentConfidence = String(
    currentItem?.sourceMatchConfidence ?? currentItem?.source_match_confidence ?? '',
  ).trim().toLowerCase();

  return getSourceConfidenceRank(nextSuggestion.sourceMatchConfidence)
    >= getSourceConfidenceRank(currentConfidence);
}

export function __resetPartyTemplateCachesForTests() {
  partyPresetSongPoolCache.clear();
  partyTemplateSongPoolCache.clear();
  partySourceSuggestionCache.clear();
}

export async function fetchPartyTemplateSongPool(templateId) {
  if (!supabase || !templateId) return [];

  const cacheKey = String(templateId).trim();
  return getOrCreatePartySongPoolCacheValue(partyTemplateSongPoolCache, cacheKey, async () => {
    const { data, error } = await supabase
      .from('party_song_template_items')
      .select('*')
      .eq('template_id', templateId)
      .order('position', { ascending: true });

    if (error) {
      return [];
    }

    return (data || [])
      .map(mapPartyTemplateSongItem)
      .filter(isRuntimePlayableSong);
  });
}

export async function fetchPartyPresetSongPool(presetId) {
  if (!supabase || !presetId) return [];

  const cacheKey = String(presetId || '').trim();
  return getOrCreatePartySongPoolCacheValue(partyPresetSongPoolCache, cacheKey, async () => {
    const { data, error } = await supabase
      .from('party_song_preset_items')
      .select('*')
      .eq('preset_id', presetId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || [])
      .map(mapPartyPresetSongItem)
      .filter((song) => song.id && song.sourceTitleId && song.mediaUrl && isDirectPartyMediaUrl(song.mediaUrl));
  });
}

export async function fetchPublishedPartySongPresets() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('party_song_presets')
    .select('id, slug, name, description, status, visibility, updated_at, party_song_preset_items(id)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapPartySongPreset);
}

export async function fetchPartyTemplates({ tab = 'all', mode = 'all', search = '', userId = null, page = 1, pageSize = 12 } = {}) {
  if (!supabase) return { templates: [], total: 0 };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('party_song_templates')
    .select('*, party_song_template_items(count)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (tab === 'official') {
    query = query.eq('is_official', true);
  } else if (tab === 'mine' && userId) {
    query = query.eq('owner_user_id', userId);
  } else {
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

  const { data, error, count } = await query;
  if (error) throw error;

  const templates = (data || []).map(mapPartyTemplate);
  const creatorMap = await fetchPartyTemplateCreatorMap(templates.map((template) => template.ownerUserId));
  return { templates: applyPartyTemplateCreatorNames(templates, creatorMap), total: count ?? 0 };
}

export async function fetchPartyTemplateDetail(templateId) {
  if (!supabase || !templateId) return null;

  const { data: template, error: templateError } = await supabase
    .from('party_song_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (templateError) {
    const err = new Error(templateError.message || 'Failed to load template');
    err.code = templateError.code;
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

  const mappedTemplate = mapPartyTemplate(template);
  const creatorMap = await fetchPartyTemplateCreatorMap([mappedTemplate.ownerUserId]);

  return {
    ...applyPartyTemplateCreatorNames([mappedTemplate], creatorMap)[0],
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

  if (error) throw error;

  const { data } = supabase.storage.from('party-template-covers').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Cover upload did not return a public URL');
  }

  return `${data.publicUrl}?t=${Date.now()}`;
}

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
      source_type: templateData.sourceType || 'catalog',
      is_official: false,
      tags: Array.isArray(templateData.tags) ? templateData.tags : [],
    })
    .select('*')
    .single();

  if (tplError) throw tplError;

  if (items.length > 0) {
    const rows = items.map((item, index) => ({
      template_id: tpl.id,
      song_id: item.song_id ?? item.songId ?? null,
      source_title_id: item.source_title_id ?? item.sourceTitleId ?? null,
      source_title_name: item.source_title_name ?? item.sourceTitleName ?? '',
      resolved_source_title_id: item.resolved_source_title_id ?? item.resolvedSourceTitleId ?? null,
      resolved_source_title_name: item.resolved_source_title_name ?? item.resolvedSourceTitleName ?? '',
      source_resolution_status: item.source_resolution_status ?? item.sourceResolutionStatus ?? (
        (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
          ? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          : PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED
      ),
      source_match_confidence: item.source_match_confidence ?? item.sourceMatchConfidence ?? (
        (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
          ? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT
          : PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW
      ),
      source_match_method: item.source_match_method ?? item.sourceMatchMethod ?? (
        (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
          ? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.CATALOG_EXACT
          : PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE
      ),
      song_title: item.song_title ?? item.songTitle ?? item.title ?? '',
      theme_type: item.theme_type ?? item.themeType ?? 'OP',
      artist_name: item.artist_name ?? item.artistName ?? item.artist ?? '',
      media_url: item.media_url ?? item.mediaUrl ?? '',
      cover_url: item.cover_url ?? item.coverUrl ?? '',
      position: index,
      provider: item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG,
      provider_media_id: item.provider_media_id ?? item.providerMediaId ?? null,
      provider_collection_id: item.provider_collection_id ?? item.providerCollectionId ?? null,
      provider_url: item.provider_url ?? item.providerUrl ?? null,
      source_kind: item.source_kind ?? item.sourceKind ?? PARTY_TEMPLATE_ITEM_SOURCE_KIND.CATALOG,
      playback_status: item.playback_status ?? item.playbackStatus ?? PARTY_TEMPLATE_PLAYBACK_STATUS.UNKNOWN,
      duration_sec: item.duration_sec ?? item.durationSec ?? null,
      metadata_json: item.metadata_json ?? item.metadataJson ?? {},
      imported_at: item.imported_at ?? item.importedAt ?? null,
      import_source_position: item.import_source_position ?? item.importSourcePosition ?? null,
      sync_state: item.sync_state ?? item.syncState ?? null,
    }));

    const { error: itemsError } = await supabase
      .from('party_song_template_items')
      .insert(rows);

    if (itemsError) throw itemsError;
  }

  return mapPartyTemplate(tpl);
}

export async function updatePartyTemplate(templateId, updates) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const allowed = {};
  if (updates.name !== undefined) allowed.name = String(updates.name).trim();
  if (updates.description !== undefined) allowed.description = String(updates.description).trim();
  if (updates.coverUrl !== undefined) allowed.cover_url = sanitizeTemplateCoverUrl(updates.coverUrl);
  if (updates.visibility !== undefined) allowed.visibility = updates.visibility;
  if (updates.modeScope !== undefined) allowed.mode_scope = updates.modeScope;
  if (updates.presetId !== undefined) allowed.default_preset_id = updates.presetId || PARTY_TEMPLATE_DEFAULT_PRESET_ID;
  if (updates.tags !== undefined) allowed.tags = Array.isArray(updates.tags) ? updates.tags : [];
  if (updates.sourceType !== undefined) allowed.source_type = updates.sourceType;

  const { data, error } = await supabase
    .from('party_song_templates')
    .update(allowed)
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) throw error;
  return mapPartyTemplate(data);
}

export async function deletePartyTemplate(templateId) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const { error } = await supabase
    .from('party_song_templates')
    .delete()
    .eq('id', templateId);

  if (error) throw error;

  partyTemplateSongPoolCache.delete(String(templateId).trim());
  return true;
}

export async function replacePartyTemplateItems(templateId, items = []) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const rows = items.map((item, index) => ({
    song_id: item.song_id != null ? String(item.song_id) : (item.songId != null ? String(item.songId) : ''),
    source_title_id: String(item.source_title_id ?? item.sourceTitleId ?? ''),
    source_title_name: item.source_title_name ?? item.sourceTitleName ?? '',
    resolved_source_title_id: String(item.resolved_source_title_id ?? item.resolvedSourceTitleId ?? ''),
    resolved_source_title_name: item.resolved_source_title_name ?? item.resolvedSourceTitleName ?? '',
    source_resolution_status: item.source_resolution_status ?? item.sourceResolutionStatus ?? (
      (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
        ? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
        : PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED
    ),
    source_match_confidence: item.source_match_confidence ?? item.sourceMatchConfidence ?? (
      (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
        ? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT
        : PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW
    ),
    source_match_method: item.source_match_method ?? item.sourceMatchMethod ?? (
      (item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
        ? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.CATALOG_EXACT
        : PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE
    ),
    song_title: item.song_title ?? item.songTitle ?? item.title ?? '',
    theme_type: item.theme_type ?? item.themeType ?? 'OP',
    artist_name: item.artist_name ?? item.artistName ?? item.artist ?? '',
    media_url: item.media_url ?? item.mediaUrl ?? '',
    cover_url: item.cover_url ?? item.coverUrl ?? '',
    position: index,
    provider: item.provider ?? PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG,
    provider_media_id: item.provider_media_id ?? item.providerMediaId ?? '',
    provider_collection_id: item.provider_collection_id ?? item.providerCollectionId ?? '',
    provider_url: item.provider_url ?? item.providerUrl ?? '',
    source_kind: item.source_kind ?? item.sourceKind ?? PARTY_TEMPLATE_ITEM_SOURCE_KIND.CATALOG,
    playback_status: item.playback_status ?? item.playbackStatus ?? PARTY_TEMPLATE_PLAYBACK_STATUS.UNKNOWN,
    duration_sec: item.duration_sec ?? item.durationSec ?? '',
    metadata_json: item.metadata_json ?? item.metadataJson ?? {},
    imported_at: item.imported_at ?? item.importedAt ?? '',
    import_source_position: item.import_source_position ?? item.importSourcePosition ?? '',
    sync_state: item.sync_state ?? item.syncState ?? '',
  }));

  const { error } = await supabase.rpc('replace_party_template_items', {
    p_template_id: Number(templateId),
    p_items: rows,
  });

  if (error) throw error;

  partyTemplateSongPoolCache.delete(String(templateId).trim());
  return rows;
}

async function maybeClearPartyAuthSession() {
  if (!supabase?.auth?.signOut) return;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Best effort only.
  }
}

async function ensurePartyAuthenticated({ forceRefresh = false } = {}) {
  if (!supabase) throw new Error('No database connection');

  const getMissingAuthError = (message = 'Please sign in again to use YouTube import.') => {
    const err = new Error(message);
    err.code = 'auth_required';
    err.status = 401;
    return err;
  };

  const validateSession = async (session) => {
    const accessToken = session?.access_token || null;
    if (!accessToken) return { user: null, valid: false };

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return { user: null, valid: false };
    return { user: data.user, valid: true };
  };

  if (!forceRefresh) {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;

    const session = authData?.session || null;
    const accessToken = session?.access_token || null;
    if (!accessToken) throw getMissingAuthError();

    const expiresAtMs = Number(session?.expires_at || 0) * 1000;
    if (expiresAtMs && expiresAtMs <= (Date.now() + 60_000)) {
      return ensurePartyAuthenticated({ forceRefresh: true });
    }

    const validation = await validateSession(session);
    if (validation.valid) return validation.user;
  }

  const { data: refreshedData, error: refreshedError } = await supabase.auth.refreshSession();
  if (refreshedError) {
    await maybeClearPartyAuthSession();
    throw getMissingAuthError();
  }

  const refreshedSession = refreshedData?.session || null;
  const refreshedValidation = await validateSession(refreshedSession);
  if (!refreshedValidation.valid) {
    await maybeClearPartyAuthSession();
    throw getMissingAuthError();
  }

  return refreshedValidation.user;
}

async function invokePartyYoutubeResolve(body) {
  return supabase.functions.invoke('party-youtube-resolve', { body });
}

async function parsePartyYoutubeInvokeError(error) {
  let message = error?.message || 'YouTube resolve failed';
  let code = null;
  let status = null;

  const response = error?.context;
  if (response) {
    status = Number(response?.status || response?.code || 0) || null;
  }

  if (response && typeof response.json === 'function') {
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
      else if (payload?.message) message = payload.message;
      if (payload?.code) code = payload.code;
    } catch {
      // Fall back
    }
  } else if (response?.code) {
    code = response.code;
  }

  return { message, code, status };
}

export async function resolvePartyYoutubeUrl(url, { maxItems = 100, pageToken = null } = {}) {
  if (!supabase) throw new Error('No database connection');

  const requestBody = { url, maxItems, pageToken };
  await ensurePartyAuthenticated();
  let { data, error } = await invokePartyYoutubeResolve(requestBody);

  if (error) {
    let parsedError = await parsePartyYoutubeInvokeError(error);
    const looksLikeJwtFailure = parsedError.status === 401
      || parsedError.code === 401
      || String(parsedError.message || '').toLowerCase().includes('invalid jwt');

    if (looksLikeJwtFailure) {
      await ensurePartyAuthenticated({ forceRefresh: true });
      ({ data, error } = await invokePartyYoutubeResolve(requestBody));
      if (!error) return data;
      parsedError = await parsePartyYoutubeInvokeError(error);
    }

    const err = new Error(parsedError.message);
    if (parsedError.code) err.code = parsedError.code;
    if (parsedError.status) err.status = parsedError.status;
    throw err;
  }

  return data;
}

export async function importPartyTemplateYoutubeVideo(url) {
  const result = await resolvePartyYoutubeUrl(url);
  if (result?.type !== 'video' || !result.video) {
    throw new Error('URL did not resolve to a YouTube video.');
  }
  return normalizeYoutubeVideoPayload(result.video, 0);
}

export async function importPartyTemplateYoutubePlaylist(url, { maxItems = 100, pageToken = null } = {}) {
  const result = await resolvePartyYoutubeUrl(url, { maxItems, pageToken });
  if (result?.type !== 'playlist' || !result.playlist) {
    throw new Error('URL did not resolve to a YouTube playlist.');
  }
  return normalizeYoutubePlaylistPayload(result.playlist, 0);
}

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

  const rows = data || [];
  const total = Number(rows[0]?.total_count || 0);
  const items = rows.map((row) => {
    const mapped = mapPartySongRow(row);
    return {
      ...mapped,
      isPlayable: isDirectPartyMediaUrl(mapped.mediaUrl),
    };
  }).filter((song) => song.id && song.sourceTitleId);

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function searchPartySourceTitles(query = '', { limit = 8 } = {}) {
  const result = await searchPartyTemplateCatalog(query, { page: 0, pageSize: Math.max(8, Number(limit || 8) * 3) });
  const bySource = new Map();

  (result.items || []).forEach((song) => {
    const sourceTitleId = Number(song?.sourceTitleId || 0);
    const sourceTitleName = String(song?.sourceTitleName || '').trim();
    if (!sourceTitleId || !sourceTitleName || bySource.has(sourceTitleId)) return;

    bySource.set(sourceTitleId, {
      resolvedSourceTitleId: sourceTitleId,
      resolvedSourceTitleName: sourceTitleName,
      songCountHint: 1,
    });
  });

  return [...bySource.values()].slice(0, Math.max(1, Number(limit || 8)));
}

export async function suggestPartyTemplateItemSource(item = {}) {
  const candidates = extractYoutubeSourceCandidates(item);
  if (candidates.length === 0) return null;

  let bestSuggestion = null;
  for (const candidate of candidates) {
    const cacheKey = normalizePartyText(candidate);
    if (!cacheKey) continue;

    let sourceCandidates = partySourceSuggestionCache.get(cacheKey) || null;
    if (!sourceCandidates) {
      sourceCandidates = await searchPartySourceTitles(candidate, { limit: 8 });
      partySourceSuggestionCache.set(cacheKey, sourceCandidates);
    }

    sourceCandidates.forEach((sourceCandidate) => {
      const scored = scoreYoutubeSourceCandidateMatch(candidate, sourceCandidate.resolvedSourceTitleName);
      const nextSuggestion = {
        ...sourceCandidate,
        sourceMatchConfidence: scored.confidence,
        sourceMatchMethod: scored.method,
        score: scored.score,
        sourceCandidate: candidate,
      };

      if (!bestSuggestion || nextSuggestion.score > bestSuggestion.score) {
        bestSuggestion = nextSuggestion;
      }
    });
  }

  if (!bestSuggestion || bestSuggestion.score < 70) return null;

  return {
    resolvedSourceTitleId: bestSuggestion.resolvedSourceTitleId,
    resolvedSourceTitleName: bestSuggestion.resolvedSourceTitleName,
    sourceMatchConfidence: bestSuggestion.sourceMatchConfidence,
    sourceMatchMethod: bestSuggestion.sourceMatchMethod,
  };
}

export async function syncPartyTemplateYoutubePlaylist(templateId, currentItems = []) {
  if (!supabase || !templateId) throw new Error('Invalid arguments');

  const template = await fetchPartyTemplateDetail(templateId);
  if (!template) throw new Error('Template not found');
  if (!template.youtubePlaylistId && !template.youtubeSourceUrl) {
    throw new Error('Template has no YouTube playlist to sync');
  }

  const syncUrl = template.youtubeSourceUrl
    || `https://www.youtube.com/playlist?list=${template.youtubePlaylistId}`;

  await supabase
    .from('party_song_templates')
    .update({ import_status: 'importing', import_error: null })
    .eq('id', templateId)
    .then(() => null);

  try {
    const { playlist, items: freshYoutubeItems } = await importPartyTemplateYoutubePlaylist(syncUrl, { maxItems: 200 });
    const catalogItems = currentItems.filter(
      (item) => (item.provider || PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG) === PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG
    );
    const currentYoutubeItemByProviderMediaId = new Map(
      currentItems
        .filter((item) => (item.provider || '') === PARTY_TEMPLATE_ITEM_PROVIDER.YOUTUBE)
        .map((item) => [String(item.providerMediaId || item.provider_media_id || ''), item])
        .filter(([providerMediaId]) => providerMediaId)
    );
    const mergedYoutubeItems = await Promise.all(freshYoutubeItems.map(async (item, index) => {
      const currentItem = currentYoutubeItemByProviderMediaId.get(String(item.provider_media_id || '')) || null;
      const suggestedItem = applyYoutubeSourceSuggestion(item, await suggestPartyTemplateItemSource(item));
      const shouldKeepCurrentSuggestion = currentItem && shouldReplaceSourceSuggestion(currentItem, {
        resolvedSourceTitleId: suggestedItem?.resolvedSourceTitleId ?? suggestedItem?.resolved_source_title_id ?? null,
        resolvedSourceTitleName: suggestedItem?.resolvedSourceTitleName ?? suggestedItem?.resolved_source_title_name ?? '',
        sourceMatchConfidence: suggestedItem?.sourceMatchConfidence ?? suggestedItem?.source_match_confidence ?? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
      }) === false;
      return {
        ...suggestedItem,
        source_title_id: currentItem?.sourceTitleId ?? currentItem?.source_title_id ?? suggestedItem.source_title_id ?? null,
        source_title_name: currentItem?.sourceTitleName ?? currentItem?.source_title_name ?? suggestedItem.source_title_name ?? '',
        resolved_source_title_id: currentItem?.resolvedSourceTitleId ?? currentItem?.resolved_source_title_id ?? (
          shouldKeepCurrentSuggestion ? currentItem?.resolvedSourceTitleId ?? currentItem?.resolved_source_title_id ?? null : suggestedItem.resolved_source_title_id ?? null
        ),
        resolved_source_title_name: currentItem?.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          || currentItem?.source_resolution_status === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          ? (currentItem?.resolvedSourceTitleName ?? currentItem?.resolved_source_title_name ?? '')
          : (shouldKeepCurrentSuggestion
            ? (currentItem?.resolvedSourceTitleName ?? currentItem?.resolved_source_title_name ?? '')
            : (suggestedItem.resolved_source_title_name ?? '')),
        source_resolution_status: currentItem?.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          || currentItem?.source_resolution_status === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          ? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          : (shouldKeepCurrentSuggestion
            ? (currentItem?.sourceResolutionStatus ?? currentItem?.source_resolution_status ?? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED)
            : (suggestedItem.source_resolution_status ?? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED)),
        source_match_confidence: currentItem?.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          || currentItem?.source_resolution_status === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          ? (currentItem?.sourceMatchConfidence ?? currentItem?.source_match_confidence ?? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT)
          : (shouldKeepCurrentSuggestion
            ? (currentItem?.sourceMatchConfidence ?? currentItem?.source_match_confidence ?? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW)
            : (suggestedItem.source_match_confidence ?? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW)),
        source_match_method: currentItem?.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          || currentItem?.source_resolution_status === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
          ? (currentItem?.sourceMatchMethod ?? currentItem?.source_match_method ?? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.MANUAL)
          : (shouldKeepCurrentSuggestion
            ? (currentItem?.sourceMatchMethod ?? currentItem?.source_match_method ?? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE)
            : (suggestedItem.source_match_method ?? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE)),
        position: catalogItems.length + index,
      };
    }));
    const mergedItems = [
      ...catalogItems.map((item, index) => ({ ...item, position: index })),
      ...mergedYoutubeItems,
    ];

    await replacePartyTemplateItems(templateId, mergedItems);

    const hasBlocked = freshYoutubeItems.some(
      (item) => item.playback_status === PARTY_TEMPLATE_PLAYBACK_STATUS.BLOCKED
    );
    await supabase
      .from('party_song_templates')
      .update({
        import_status: hasBlocked ? 'partial' : 'done',
        last_synced_at: new Date().toISOString(),
        youtube_playlist_id: playlist.playlistId,
        import_error: null,
      })
      .eq('id', templateId)
      .then(() => null);

    return { playlist, items: mergedItems };
  } catch (err) {
    await supabase
      .from('party_song_templates')
      .update({ import_status: 'failed', import_error: err?.message || 'Sync failed' })
      .eq('id', templateId)
      .then(() => null);
    throw err;
  }
}

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
      visibility: 'private',
      modeScope: base.modeScope,
      presetId: base.presetId || PARTY_TEMPLATE_DEFAULT_PRESET_ID,
      tags: base.tags,
    },
    base.items,
    creatorName,
  );
}

export async function togglePartyTemplateLike(templateId, userId) {
  if (!supabase || !templateId || !userId) throw new Error('Invalid arguments');

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

export async function recordPartyTemplateView(templateId) {
  if (!supabase || !templateId) return;
  try {
    await supabase.rpc('increment_template_view_count', { p_template_id: Number(templateId) });
  } catch {
    // non-critical
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
    if (error) throw error;
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
    if (fallbackError) throw fallbackError;

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
