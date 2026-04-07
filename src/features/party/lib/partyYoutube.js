/**
 * YouTube utilities for Party Templates — v2
 *
 * Three responsibility groups:
 *   1. Parse helpers   — extract video / playlist IDs from URLs
 *   2. Normalize helpers — convert Edge Function payloads to template item shapes
 *   3. UI helpers      — labels, thumbnails, status display
 */

import {
  PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE,
  PARTY_TEMPLATE_SOURCE_MATCH_METHOD,
  PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS,
} from './partyTemplateSchema';

export const YOUTUBE_SUPPORT_ENABLED = true;

const YOUTUBE_SOURCE_NOISE_PATTERN = /\b(op|ed|opening|ending|ost|soundtrack|full|ver|version|mv|pv|amv|lyrics?|lyric video|official|creditless|tv size|short ver|long ver|nightcore|cover|reaction)\b/giu;
const YOUTUBE_SOURCE_BRACKET_NOISE_PATTERN = /[[【（](.*?)(op|ed|opening|ending|ost|soundtrack|full|lyrics?|mv|pv|amv|official|creditless|tv size|ver|version)(.*?)[\])】）]/giu;
const YOUTUBE_SOURCE_SPLIT_PATTERN = /\s(?:[-|/:~]|by|from)\s/iu;

function toStringArray(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function normalizeYoutubeCandidateText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(YOUTUBE_SOURCE_BRACKET_NOISE_PATTERN, ' ')
    .replace(/[[\]【】（）()「」『』]/g, ' ')
    .replace(YOUTUBE_SOURCE_NOISE_PATTERN, ' ')
    .replace(/\b\d{1,2}(st|nd|rd|th)\s+(op|ed)\b/giu, ' ')
    .replace(/\bseason\s+\d+\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCandidateVariants(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }

  const normalized = normalizeYoutubeCandidateText(raw);
  const segments = [
    raw,
    normalized,
    ...raw.split(YOUTUBE_SOURCE_SPLIT_PATTERN),
    ...normalized.split(YOUTUBE_SOURCE_SPLIT_PATTERN),
  ];

  return [...new Set(
    segments
      .map((entry) => normalizeYoutubeCandidateText(entry))
      .filter((entry) => entry.length >= 2)
  )];
}

export function extractYoutubeSourceCandidates(video = {}) {
  const metadata = video?.metadata_json || video?.metadataJson || {};
  const candidates = [
    ...buildCandidateVariants(video?.song_title || video?.songTitle || video?.title || ''),
    ...buildCandidateVariants(video?.playlist_title || video?.playlistTitle || metadata?.playlistTitle || ''),
    ...buildCandidateVariants(video?.source_title_name || video?.sourceTitleName || ''),
    ...toStringArray(metadata?.sourceCandidates),
    ...buildCandidateVariants(metadata?.description || ''),
    ...toStringArray(metadata?.tags),
  ];

  const channelTitle = String(video?.artist_name || video?.artistName || metadata?.channelTitle || '').trim().toLowerCase();
  return [...new Set(
    candidates.filter((candidate) => {
      const normalized = candidate.toLowerCase();
      return normalized && normalized !== channelTitle;
    })
  )];
}

function getSuggestionConfidenceLabel(score = 0) {
  if (score >= 96) return PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT;
  if (score >= 84) return PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.HIGH;
  if (score >= 70) return PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.MEDIUM;
  return PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW;
}

export function scoreYoutubeSourceCandidateMatch(candidate = '', sourceTitleName = '') {
  const left = normalizeYoutubeCandidateText(candidate).toLowerCase();
  const right = normalizeYoutubeCandidateText(sourceTitleName).toLowerCase();
  if (!left || !right) {
    return {
      score: 0,
      confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
      method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
    };
  }

  if (left === right) {
    return {
      score: 100,
      confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT,
      method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.CATALOG_EXACT,
    };
  }

  if (left.includes(right) || right.includes(left)) {
    const score = Math.min(left.length, right.length) >= 8 ? 88 : 82;
    return {
      score,
      confidence: getSuggestionConfidenceLabel(score),
      method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.ALIAS_MATCH,
    };
  }

  const rightTokens = right.split(' ').filter(Boolean);
  const sharedTokens = left.split(' ').filter((token) => token && rightTokens.includes(token));
  const score = Math.max(0, Math.min(78, Math.round((sharedTokens.length / Math.max(1, rightTokens.length)) * 100)));
  return {
    score,
    confidence: getSuggestionConfidenceLabel(score),
    method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
  };
}

export function applyYoutubeSourceSuggestion(item = {}, suggestion = null) {
  const metadata = item?.metadata_json || item?.metadataJson || {};
  const nextMetadata = {
    ...metadata,
    sourceCandidates: extractYoutubeSourceCandidates(item),
  };

  if (!suggestion?.resolvedSourceTitleId || !suggestion?.resolvedSourceTitleName) {
    return {
      ...item,
      source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
      sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
      resolved_source_title_id: null,
      resolvedSourceTitleId: null,
      resolved_source_title_name: '',
      resolvedSourceTitleName: '',
      source_match_confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
      sourceMatchConfidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
      source_match_method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
      sourceMatchMethod: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
      metadata_json: nextMetadata,
      metadataJson: nextMetadata,
    };
  }

  return {
    ...item,
    source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED,
    sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED,
    resolved_source_title_id: suggestion.resolvedSourceTitleId,
    resolvedSourceTitleId: suggestion.resolvedSourceTitleId,
    resolved_source_title_name: suggestion.resolvedSourceTitleName,
    resolvedSourceTitleName: suggestion.resolvedSourceTitleName,
    source_match_confidence: suggestion.sourceMatchConfidence || PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.MEDIUM,
    sourceMatchConfidence: suggestion.sourceMatchConfidence || PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.MEDIUM,
    source_match_method: suggestion.sourceMatchMethod || PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
    sourceMatchMethod: suggestion.sourceMatchMethod || PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,
    metadata_json: nextMetadata,
    metadataJson: nextMetadata,
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. Parse helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Extracts a YouTube video ID from a URL or a raw 11-char ID string.
 * Returns null if not recognised.
 */
export function parseYoutubeVideoId(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      if (urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }
      const pathMatch = urlObj.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      if (pathMatch) {
        return pathMatch[1];
      }
    }
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1).split('?')[0] || null;
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
      return url.trim();
    }
  }

  return null;
}

/**
 * Extracts a YouTube playlist ID from a URL or a raw ID string.
 * Returns null if not recognised.
 */
export function parseYoutubePlaylistId(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const listId = urlObj.searchParams.get('list');
    return listId || null;
  } catch {
    if (/^[a-zA-Z0-9_-]{12,64}$/.test(url.trim())) {
      return url.trim();
    }
  }

  return null;
}

/**
 * Parses a YouTube URL and returns a typed result.
 *
 * Playlist takes priority when a URL carries both ?v= and ?list=
 * (the user pasted a "watch in playlist" URL — import the whole list).
 *
 * @returns {{ type: 'video'|'playlist'|'invalid', id: string|null }}
 */
export function parseYoutubeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return { type: 'invalid', id: null };

  const playlistId = parseYoutubePlaylistId(raw);
  if (playlistId) return { type: 'playlist', id: playlistId };

  const videoId = parseYoutubeVideoId(raw);
  if (videoId) return { type: 'video', id: videoId };

  return { type: 'invalid', id: null };
}

// ─────────────────────────────────────────────────────────────────
// 2. Normalize helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Converts a single video payload (from the Edge Function) into a
 * template item row shape ready for DB insert / UI state.
 *
 * @param {object} video   - response.video from party-youtube-resolve
 * @param {number} position
 * @returns {object}
 */
export function normalizeYoutubeVideoPayload(video, position = 0) {
  const videoId = String(video?.videoId || '');
  const metadata = {
    availabilityReason: video?.availabilityReason ?? null,
    channelTitle: video?.channelTitle || '',
    description: video?.description || '',
    tags: Array.isArray(video?.tags) ? video.tags : [],
  };
  return {
    // provider identity
    provider: 'youtube',
    provider_media_id: videoId,
    provider_collection_id: null,
    provider_url: video?.watchUrl || `https://www.youtube.com/watch?v=${videoId}`,
    source_kind: 'youtube_video',
    playback_status: video?.playbackStatus || 'unknown',

    // catalog-compatible display fields
    song_id: null,
    source_title_id: null,
    source_title_name: '',
    song_title: video?.title || '',
    theme_type: 'YT',
    artist_name: video?.channelTitle || '',
    media_url: '',
    cover_url: video?.thumbnailUrl || '',
    resolved_source_title_id: null,
    resolved_source_title_name: '',
    source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
    source_match_confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
    source_match_method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,

    // YouTube-specific
    duration_sec: video?.durationSec ?? null,
    metadata_json: {
      ...metadata,
      sourceCandidates: extractYoutubeSourceCandidates({
        song_title: video?.title || '',
        artist_name: video?.channelTitle || '',
        metadata_json: metadata,
      }),
    },
    imported_at: new Date().toISOString(),
    import_source_position: null,
    sync_state: null,

    position,
  };
}

/**
 * Converts a playlist payload (from the Edge Function) into:
 *   { playlist: { ... }, items: [ templateItem, ... ] }
 *
 * @param {object} playlist  - response.playlist from party-youtube-resolve
 * @param {number} positionOffset - start position for items (for appending)
 */
export function normalizeYoutubePlaylistPayload(playlist, positionOffset = 0) {
  const playlistId = String(playlist?.playlistId || '');
  const items = Array.isArray(playlist?.items) ? playlist.items : [];

  return {
    playlist: {
      playlistId,
      title: playlist?.title || '',
      channelTitle: playlist?.channelTitle || '',
      thumbnailUrl: playlist?.thumbnailUrl || null,
      totalItems: Number(playlist?.totalItems || 0),
      fetchedCount: Number(playlist?.fetchedCount || items.length),
      nextPageToken: playlist?.nextPageToken || null,
    },
    items: items.map((item, index) => ({
      // provider identity
      provider: 'youtube',
      provider_media_id: String(item?.videoId || ''),
      provider_collection_id: playlistId,
      provider_url: item?.watchUrl || `https://www.youtube.com/watch?v=${item?.videoId}`,
      source_kind: 'youtube_playlist',
      playback_status: item?.playbackStatus || 'unknown',

      // catalog-compatible display fields
      song_id: null,
      source_title_id: null,
      source_title_name: '',
      song_title: item?.title || '',
      theme_type: 'YT',
      artist_name: item?.channelTitle || '',
      media_url: '',
      cover_url: item?.thumbnailUrl || '',
      resolved_source_title_id: null,
      resolved_source_title_name: '',
      source_resolution_status: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED,
      source_match_confidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW,
      source_match_method: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE,

      // YouTube-specific
      duration_sec: item?.durationSec ?? null,
      metadata_json: {
        availabilityReason: item?.availabilityReason ?? null,
        channelTitle: item?.channelTitle || '',
        playlistId,
        playlistTitle: playlist?.title || '',
        playlistChannelTitle: playlist?.channelTitle || '',
        description: item?.description || '',
        tags: Array.isArray(item?.tags) ? item.tags : [],
        sourceCandidates: extractYoutubeSourceCandidates({
          song_title: item?.title || '',
          artist_name: item?.channelTitle || '',
          playlist_title: playlist?.title || '',
          metadata_json: {
            channelTitle: item?.channelTitle || '',
            playlistTitle: playlist?.title || '',
            description: item?.description || '',
            tags: Array.isArray(item?.tags) ? item.tags : [],
          },
        }),
      },
      imported_at: new Date().toISOString(),
      import_source_position: item?.importSourcePosition ?? index,
      sync_state: null,

      position: positionOffset + index,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. UI helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Returns true when a template item came from YouTube (not catalog).
 */
export function isYoutubeTemplateItem(item) {
  if (!item) return false;
  const provider = String(item.provider || '').trim().toLowerCase();
  const providerMediaId = String(item.providerMediaId || item.provider_media_id || '').trim();
  const sourceKind = String(item.sourceKind || item.source_kind || '').trim().toLowerCase();
  return (
    provider === 'youtube' ||
    Boolean(providerMediaId) ||
    sourceKind === 'youtube_video' ||
    sourceKind === 'youtube_playlist'
  );
}

/**
 * Returns the best available thumbnail URL for a YouTube video ID.
 * Falls back through hq → mq → default quality.
 */
export function getYoutubeItemThumbnail(videoId, quality = 'hq') {
  const id = String(videoId || '').trim();
  if (!id) return '';
  const qualityMap = {
    max: 'maxresdefault',
    hq: 'hqdefault',
    mq: 'mqdefault',
    sd: 'sddefault',
    default: 'default',
  };
  const q = qualityMap[quality] || 'hqdefault';
  return `https://i.ytimg.com/vi/${id}/${q}.jpg`;
}

/**
 * Returns a human-readable label for a playback_status value.
 * Used in UI badges.
 */
export function getYoutubePlaybackLabel(status, pick = (th) => th) {
  switch (status) {
    case 'ready':   return pick('พร้อมเล่น', 'Ready');
    case 'limited': return pick('จำกัด', 'Limited');
    case 'blocked': return pick('บล็อก', 'Blocked');
    default:        return pick('ไม่ทราบ', 'Unknown');
  }
}

/**
 * Returns a CSS class suffix for the playback status badge.
 */
export function getYoutubePlaybackStatusClass(status) {
  switch (status) {
    case 'ready':   return 'ready';
    case 'limited': return 'limited';
    case 'blocked': return 'blocked';
    default:        return 'unknown';
  }
}

export function getYoutubeAvailabilityReasonLabel(reason, pick = (th, en) => en ?? th) {
  const normalized = String(reason || '').trim().toLowerCase();
  switch (normalized) {
    case 'private':
      return pick('วิดีโอนี้เป็น private', 'This video is private.');
    case 'not_found':
    case 'deleted':
      return pick('ไม่พบวิดีโอนี้แล้ว', 'This video is no longer available.');
    case 'embed_disabled':
    case 'embed_not_allowed':
      return pick('เจ้าของคลิปปิดการฝังวิดีโอ', 'Embedding is disabled for this video.');
    case 'unlisted':
      return pick('วิดีโอนี้เป็น unlisted และอาจเล่นได้จำกัด', 'This video is unlisted and may have limited playback.');
    case 'region_restricted':
      return pick('วิดีโอนี้ถูกจำกัดตามภูมิภาค', 'This video is region-restricted.');
    case 'age_restricted':
      return pick('วิดีโอนี้มีการจำกัดอายุ', 'This video is age-restricted.');
    case 'ready':
      return pick('พร้อมเล่นในเกม', 'Ready to play in-game.');
    case 'unknown':
    case '':
      return pick('ยังบอกสถานะการเล่นไม่ได้แน่ชัด', 'Playback status is still unknown.');
    default:
      return pick(`สถานะจาก YouTube: ${reason}`, `YouTube status: ${reason}`);
  }
}

/**
 * Returns true when a YouTube item should be included in the
 * runtime playable pool (engine can actually play it).
 */
export function isYoutubeItemPlayable(item) {
  const status = item?.playbackStatus || item?.playback_status;
  return status === 'ready';
}
