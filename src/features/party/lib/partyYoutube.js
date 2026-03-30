/**
 * YouTube utilities for Party Templates — STATUS: Coming Soon (v2)
 *
 * v1 only supports catalog songs. YouTube import is disabled at the DB level
 * (source_type check constraint allows 'catalog' only).
 * These helpers are kept for reference and future enablement.
 */

export const YOUTUBE_SUPPORT_ENABLED = false;

/**
 * Parses a YouTube playlist ID from a URL or raw ID string.
 * Returns null if the input is not a valid playlist URL/ID.
 */
export function parseYoutubePlaylistId(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const listId = urlObj.searchParams.get('list');
    return listId || null;
  } catch {
    if (/^[a-zA-Z0-9_-]{12,34}$/.test(url.trim())) {
      return url.trim();
    }
  }

  return null;
}

/**
 * Parses a YouTube video ID from a URL or raw ID string.
 */
export function parseYoutubeVideoId(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    }
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1);
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
      return url.trim();
    }
  }

  return null;
}

/**
 * Placeholder — will call a server-side API function in v2.
 * Returns an empty array and logs a warning in development.
 */
export async function fetchYoutubePlaylistItems(_playlistId) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[partyYoutube] YouTube import is not available in v1.');
  }
  return [];
}
