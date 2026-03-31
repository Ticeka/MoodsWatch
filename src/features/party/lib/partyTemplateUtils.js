import { isDirectPartyMediaUrl } from './partyEngine';
import {
  PARTY_TEMPLATE_MIN_SONGS,
  PARTY_TEMPLATE_MODE_SCOPE,
  PARTY_TEMPLATE_PLAYBACK_STATUS,
  PARTY_TEMPLATE_ITEM_PROVIDER,
  PARTY_TEMPLATE_ITEM_SOURCE_KIND,
} from './partyTemplateSchema';
import { isYoutubeItemPlayable } from './partyYoutube';

export const PARTY_TEMPLATE_FALLBACK_COVER_URL = '/images/default-party-cover.jpg';

export function sanitizeTemplateCoverUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const lower = raw.toLowerCase();
  if (lower.startsWith('blob:') || lower.startsWith('javascript:')) {
    return '';
  }

  return raw;
}

export function getTemplateCoverUrl(value, fallback = PARTY_TEMPLATE_FALLBACK_COVER_URL) {
  return sanitizeTemplateCoverUrl(value) || fallback;
}

export function getTemplateFallbackItemCoverUrl(items = []) {
  if (!Array.isArray(items)) {
    return '';
  }

  for (const item of items) {
    const candidate = sanitizeTemplateCoverUrl(item?.coverUrl ?? item?.cover_url);
    if (candidate) {
      return candidate;
    }
  }

  return '';
}

export function resolveTemplateCoverUrl(value, items = [], fallback = PARTY_TEMPLATE_FALLBACK_COVER_URL) {
  return sanitizeTemplateCoverUrl(value) || getTemplateFallbackItemCoverUrl(items) || fallback;
}

// ─────────────────────────────────────────────────────────────────
// Playability helpers (mixed-provider aware)
// ─────────────────────────────────────────────────────────────────

/**
 * Returns true when an item is ready for runtime playback.
 *
 * - catalog items:  must have a direct media URL (mp4/webm/ogg)
 *                   OR playback_status = 'ready'
 * - YouTube items:  playback_status = 'ready'
 *                   (limited is treated as not-ready to match runtime playback)
 */
export function isTemplateItemPlayable(item = {}) {
  const explicitProvider = item.provider || '';

  if (explicitProvider === PARTY_TEMPLATE_ITEM_PROVIDER.YOUTUBE) {
    return isYoutubeItemPlayable(item);
  }

  // Catalog (default) — check playback_status first (set by backfill), then direct URL
  const status = item.playbackStatus || item.playback_status;
  if (status === PARTY_TEMPLATE_PLAYBACK_STATUS.READY) return true;
  if (status === PARTY_TEMPLATE_PLAYBACK_STATUS.BLOCKED) return false;

  // Fallback to URL check for legacy rows without playback_status
  const mediaUrl = item.mediaUrl || item.media_url || '';
  if (!mediaUrl) return false;
  return Boolean(
    (item.songId ?? item.song_id ?? item.id) &&
    (item.sourceTitleId ?? item.source_title_id) &&
    isDirectPartyMediaUrl(mediaUrl)
  );
}

/**
 * Returns true only for catalog items that have a fully valid direct URL.
 * Use when you need strict catalog-only filtering (e.g. existing preset pool).
 */
export function isTemplateItemDirectPlayable(item = {}) {
  return Boolean(
    (item.songId ?? item.song_id ?? item.id)
    && (item.sourceTitleId ?? item.source_title_id)
    && (item.mediaUrl ?? item.media_url)
    && isDirectPartyMediaUrl(item.mediaUrl ?? item.media_url)
  );
}

export function getTemplatePlayableCount(items = []) {
  if (!Array.isArray(items)) {
    return 0;
  }
  return items.filter(isTemplateItemPlayable).length;
}

/**
 * Returns { total, ready, limited, blocked, unknown } counts for a playlist.
 */
export function getTemplatePlaybackSummary(items = []) {
  if (!Array.isArray(items)) {
    return { total: 0, ready: 0, limited: 0, blocked: 0, unknown: 0 };
  }

  let ready = 0, limited = 0, blocked = 0, unknown = 0;
  for (const item of items) {
    const status = item.playbackStatus || item.playback_status || '';
    if (status === PARTY_TEMPLATE_PLAYBACK_STATUS.READY) ready++;
    else if (status === PARTY_TEMPLATE_PLAYBACK_STATUS.LIMITED) limited++;
    else if (status === PARTY_TEMPLATE_PLAYBACK_STATUS.BLOCKED) blocked++;
    else unknown++;
  }

  return { total: items.length, ready, limited, blocked, unknown };
}

// ─────────────────────────────────────────────────────────────────
// Validation (total count — save gate)
// ─────────────────────────────────────────────────────────────────

/**
 * Validates that a template has enough songs (total) for the intended mode.
 * Used as a save gate — allows saving with blocked items.
 * Returns { valid: boolean, reason?: string }
 */
export function validateTemplateForMode(items = [], modeScope = 'all') {
  const count = items.length;
  const minQuiz = PARTY_TEMPLATE_MIN_SONGS.quiz;
  const minVote = PARTY_TEMPLATE_MIN_SONGS.vote;

  if (count === 0) {
    return { valid: false, reason: 'Template has no songs.' };
  }

  if (modeScope === PARTY_TEMPLATE_MODE_SCOPE.QUIZ && count < minQuiz) {
    return { valid: false, reason: `Quiz mode requires at least ${minQuiz} songs.` };
  }

  if (modeScope === PARTY_TEMPLATE_MODE_SCOPE.VOTE && count < minVote) {
    return { valid: false, reason: `Vote Battle requires at least ${minVote} songs.` };
  }

  if (modeScope === PARTY_TEMPLATE_MODE_SCOPE.ALL && count < minQuiz) {
    return {
      valid: false,
      reason: `Templates for all modes require at least ${minQuiz} songs (Quiz minimum).`,
    };
  }

  return { valid: true };
}

/**
 * Validates that a template has enough *playable* songs for the mode.
 * Used as a Play Now gate.
 */
export function validatePlayableTemplateForMode(items = [], modeScope = 'all') {
  const totalCount = Array.isArray(items) ? items.length : 0;
  const playableCount = getTemplatePlayableCount(items);
  const modeKey = modeScope === PARTY_TEMPLATE_MODE_SCOPE.VOTE
    ? PARTY_TEMPLATE_MODE_SCOPE.VOTE
    : modeScope === PARTY_TEMPLATE_MODE_SCOPE.QUIZ
      ? PARTY_TEMPLATE_MODE_SCOPE.QUIZ
      : PARTY_TEMPLATE_MODE_SCOPE.ALL;
  const requiredCount = PARTY_TEMPLATE_MIN_SONGS[modeKey];

  if (totalCount === 0) {
    return {
      valid: false,
      playableCount,
      requiredCount,
      reason: 'Template has no songs.',
    };
  }

  if (playableCount < requiredCount) {
    const modeLabel = modeKey === PARTY_TEMPLATE_MODE_SCOPE.VOTE
      ? 'Vote Battle'
      : modeKey === PARTY_TEMPLATE_MODE_SCOPE.QUIZ
        ? 'Quiz'
        : 'All modes';

    return {
      valid: false,
      playableCount,
      requiredCount,
      reason: `${modeLabel} needs at least ${requiredCount} playable songs. This template only has ${playableCount}.`,
    };
  }

  return {
    valid: true,
    playableCount,
    requiredCount,
  };
}

// ─────────────────────────────────────────────────────────────────
// Item mappers
// ─────────────────────────────────────────────────────────────────

/**
 * Converts a catalog song search result into a template item row
 * ready for DB insert. Shape matches party_song_template_items columns.
 */
export function catalogSongToTemplateItem(song, position = 0) {
  return {
    song_id: song.songId ?? song.song_id ?? song.id ?? null,
    source_title_id: song.sourceTitleId ?? song.source_title_id ?? null,
    source_title_name: song.sourceTitleName || song.source_title_name || song.source || '',
    song_title: song.songTitle || song.song_title || song.title || '',
    theme_type: song.themeType || song.theme_type || 'OP',
    artist_name: song.artistName || song.artist_name || song.artist || '',
    media_url: song.mediaUrl || song.media_url || '',
    cover_url: song.coverUrl || song.cover_url || '',
    position,
    provider: PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG,
    source_kind: PARTY_TEMPLATE_ITEM_SOURCE_KIND.CATALOG,
    playback_status: song.playbackStatus || song.playback_status || PARTY_TEMPLATE_PLAYBACK_STATUS.UNKNOWN,
  };
}

/**
 * Converts a YouTube video payload (from partyYoutube.normalizeYoutubeVideoPayload)
 * into a template item row ready for DB insert.
 */
export function youtubeVideoToTemplateItem(video, position = 0) {
  return {
    ...video,
    position,
  };
}

/**
 * Converts an array of YouTube playlist item payloads into template item rows.
 * positionOffset lets you append after existing catalog items.
 */
export function youtubePlaylistItemsToTemplateItems(items = [], positionOffset = 0) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    ...item,
    position: positionOffset + index,
  }));
}

/**
 * Converts a DB template item row into a UI-friendly object.
 * Handles both catalog and YouTube items.
 */
export function mapTemplateItemFromDb(row, index = 0) {
  const provider = row.provider || PARTY_TEMPLATE_ITEM_PROVIDER.CATALOG;
  const sourceKind = row.source_kind || PARTY_TEMPLATE_ITEM_SOURCE_KIND.CATALOG;
  const playbackStatus = row.playback_status || PARTY_TEMPLATE_PLAYBACK_STATUS.UNKNOWN;

  return {
    // identity
    id: row.id,
    templateId: row.template_id,

    // catalog fields
    songId: row.song_id,
    sourceTitleId: row.source_title_id,
    sourceTitleName: row.source_title_name || '',
    songTitle: row.song_title || '',
    themeType: row.theme_type || 'OP',
    artistName: row.artist_name || '',
    mediaUrl: row.media_url || '',
    coverUrl: row.cover_url || '',
    position: row.position ?? index,

    // provider / YouTube fields
    provider,
    sourceKind,
    playbackStatus,
    providerMediaId: row.provider_media_id || null,
    providerCollectionId: row.provider_collection_id || null,
    providerUrl: row.provider_url || null,
    durationSec: row.duration_sec ?? null,
    metadataJson: row.metadata_json || {},
    importedAt: row.imported_at || null,
    importSourcePosition: row.import_source_position ?? null,
    syncState: row.sync_state || null,

    // UI convenience aliases
    title: row.song_title || '',
    artist: row.artist_name || '',
    source: row.source_title_name || '',
  };
}

/**
 * Returns true when the item was imported from a YouTube playlist.
 */
export function isTemplateItemImportedFromPlaylist(item = {}) {
  return (
    item.sourceKind === PARTY_TEMPLATE_ITEM_SOURCE_KIND.YOUTUBE_PLAYLIST ||
    item.source_kind === PARTY_TEMPLATE_ITEM_SOURCE_KIND.YOUTUBE_PLAYLIST
  );
}

// ─────────────────────────────────────────────────────────────────
// Template list helpers
// ─────────────────────────────────────────────────────────────────

export function filterTemplates(templates, { search = '', mode = 'all' } = {}) {
  if (!Array.isArray(templates)) return [];

  return templates.filter((t) => {
    if (mode !== 'all' && t.modeScope !== 'all' && t.modeScope !== mode) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return true;
  });
}
