/**
 * YouTube utilities for Party Templates — v2
 *
 * Three responsibility groups:
 *   1. Parse helpers   — extract video / playlist IDs from URLs
 *   2. Normalize helpers — convert Edge Function payloads to template item shapes
 *   3. UI helpers      — labels, thumbnails, status display
 */

export const YOUTUBE_SUPPORT_ENABLED = true;

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
      return urlObj.searchParams.get('v');
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
    source_title_name: video?.channelTitle || '',
    song_title: video?.title || '',
    theme_type: 'YT',
    artist_name: video?.channelTitle || '',
    media_url: '',
    cover_url: video?.thumbnailUrl || '',

    // YouTube-specific
    duration_sec: video?.durationSec ?? null,
    metadata_json: { availabilityReason: video?.availabilityReason ?? null },
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
      source_title_name: item?.channelTitle || '',
      song_title: item?.title || '',
      theme_type: 'YT',
      artist_name: item?.channelTitle || '',
      media_url: '',
      cover_url: item?.thumbnailUrl || '',

      // YouTube-specific
      duration_sec: item?.durationSec ?? null,
      metadata_json: {
        availabilityReason: item?.availabilityReason ?? null,
        playlistId,
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
  const provider = item.provider || item?.providerMediaId ? 'youtube' : '';
  return (
    provider === 'youtube' ||
    item.provider === 'youtube' ||
    item.sourceKind === 'youtube_video' ||
    item.sourceKind === 'youtube_playlist' ||
    item.source_kind === 'youtube_video' ||
    item.source_kind === 'youtube_playlist'
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
