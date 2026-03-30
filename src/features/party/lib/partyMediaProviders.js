/**
 * Provider-based playback router.
 * Routes play/pause and rendering based on provider.
 */

export const PARTY_MEDIA_PROVIDERS = {
  NATIVE: 'native',
  YOUTUBE: 'youtube',
};

/**
 * Resolves the playback source for a given item.
 */
export function resolvePlaybackSource(item) {
  if (!item) return null;

  const provider = item.provider || PARTY_MEDIA_PROVIDERS.NATIVE;
  const mediaId = item.providerMediaId || item.songId;

  if (provider === PARTY_MEDIA_PROVIDERS.YOUTUBE) {
    return {
      type: 'youtube',
      videoId: mediaId,
      url: `https://www.youtube.com/watch?v=${mediaId}`,
    };
  }

  // Native catalog playback
  return {
    type: 'native',
    songId: mediaId,
    url: `/api/v1/songs/${mediaId}/stream`, // Adjust to actual endpoint
  };
}

/**
 * Returns a label for a given provider.
 * Useful for iconography/labels in UI.
 */
export function getProviderLabel(provider) {
  switch (provider) {
    case PARTY_MEDIA_PROVIDERS.YOUTUBE:
      return 'YouTube';
    case PARTY_MEDIA_PROVIDERS.NATIVE:
    default:
      return 'Catalog';
  }
}
