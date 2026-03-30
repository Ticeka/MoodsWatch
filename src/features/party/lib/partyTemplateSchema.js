/**
 * Canonical schema constants for Party Song Templates — v1 (catalog-only).
 * YouTube / provider-abstraction is reserved for v2.
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

// v1 only supports 'catalog'. 'youtube' is blocked by DB constraint until v2.
export const PARTY_TEMPLATE_SOURCE_TYPE = {
  CATALOG: 'catalog',
};

export const PARTY_TEMPLATE_DEFAULT_PRESET_ID = 'party-classic';

export const PARTY_TEMPLATE_PRESET_IDS = [
  'party-classic',
  'song-typing',
  'full-recall',
];

/**
 * Minimum number of songs required per mode.
 */
export const PARTY_TEMPLATE_MIN_SONGS = {
  quiz: 4,
  vote: 2,
  all: 4,
};
