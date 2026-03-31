/**
 * Canonical schema constants for Party Song Templates — v2 (catalog + YouTube).
 */

export const PARTY_TEMPLATE_VISIBILITY = {
  PUBLIC: 'public',
  UNLISTED: 'unlisted',
  PRIVATE: 'private',
};

export const PARTY_TEMPLATE_MODE_SCOPE = {
  ALL: 'all',
  QUIZ: 'quiz',
  VOTE: 'vote',
};

/**
 * Template-level source type.
 *   catalog         — all items come from the internal song catalog
 *   youtube         — all items imported from YouTube
 *   mixed           — catalog items and YouTube items coexist
 */
export const PARTY_TEMPLATE_SOURCE_TYPE = {
  CATALOG: 'catalog',
  YOUTUBE: 'youtube',
  MIXED: 'mixed',
};

/**
 * Item-level provider (which system owns the media).
 */
export const PARTY_TEMPLATE_ITEM_PROVIDER = {
  CATALOG: 'catalog',
  YOUTUBE: 'youtube',
};

/**
 * Item-level source kind (how the item was obtained).
 *   catalog          — from internal catalog
 *   youtube_video    — a direct YouTube video link
 *   youtube_playlist — imported from a YouTube playlist snapshot
 */
export const PARTY_TEMPLATE_ITEM_SOURCE_KIND = {
  CATALOG: 'catalog',
  YOUTUBE_VIDEO: 'youtube_video',
  YOUTUBE_PLAYLIST: 'youtube_playlist',
};

/**
 * Item-level playback status.
 *   ready    — embeddable, public → engine will include in pool
 *   limited  — unlisted or embed-disabled → included but warn
 *   blocked  — private / deleted / region-locked → excluded from pool
 *   unknown  — not yet resolved (just imported or resolution failed)
 */
export const PARTY_TEMPLATE_PLAYBACK_STATUS = {
  READY: 'ready',
  LIMITED: 'limited',
  BLOCKED: 'blocked',
  UNKNOWN: 'unknown',
};

export const PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS = {
  LINKED: 'linked',
  SUGGESTED: 'suggested',
  UNRESOLVED: 'unresolved',
};

export const PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE = {
  EXACT: 'exact',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const PARTY_TEMPLATE_SOURCE_MATCH_METHOD = {
  CATALOG_EXACT: 'catalog_exact',
  ALIAS_MATCH: 'alias_match',
  YOUTUBE_TITLE_PARSE: 'youtube_title_parse',
  MANUAL: 'manual',
};

/**
 * Playlist sync modes.
 *   snapshot           — imported once, never auto-synced
 *   snapshot_syncable  — snapshot that the owner can manually re-sync
 */
export const PARTY_TEMPLATE_YOUTUBE_SYNC_MODE = {
  SNAPSHOT: 'snapshot',
  SNAPSHOT_SYNCABLE: 'snapshot_syncable',
};

export const PARTY_TEMPLATE_DEFAULT_PRESET_ID = 'party-classic';

export const PARTY_TEMPLATE_PRESET_IDS = [
  'party-classic',
  'song-typing',
  'full-recall',
];

/**
 * Minimum number of *playable* songs required per mode.
 */
export const PARTY_TEMPLATE_MIN_SONGS = {
  quiz: 4,
  vote: 2,
  all: 4,
};
