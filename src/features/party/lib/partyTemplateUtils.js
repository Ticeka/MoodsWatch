import { isDirectPartyMediaUrl } from './partyEngine';
import { PARTY_TEMPLATE_MIN_SONGS, PARTY_TEMPLATE_MODE_SCOPE } from './partyTemplateSchema';

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

/**
 * Validates that a template has enough songs for the intended mode.
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

export function isTemplateItemPlayable(item = {}) {
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

/**
 * Converts a catalog song search result into a template item row ready for DB insert.
 * The shape matches party_song_template_items columns.
 */
export function catalogSongToTemplateItem(song, position = 0) {
  return {
    // Accept both raw catalog search rows and UI playlist items.
    song_id: song.songId ?? song.song_id ?? song.id ?? null,
    source_title_id: song.sourceTitleId ?? song.source_title_id ?? null,
    source_title_name: song.sourceTitleName || song.source_title_name || song.source || '',
    song_title: song.songTitle || song.song_title || song.title || '',
    theme_type: song.themeType || song.theme_type || 'OP',
    artist_name: song.artistName || song.artist_name || song.artist || '',
    media_url: song.mediaUrl || song.media_url || '',
    cover_url: song.coverUrl || song.cover_url || '',
    position,
  };
}

/**
 * Converts a DB template item row into a UI-friendly object.
 */
export function mapTemplateItemFromDb(row, index = 0) {
  return {
    id: row.id,
    templateId: row.template_id,
    songId: row.song_id,
    sourceTitleId: row.source_title_id,
    sourceTitleName: row.source_title_name || '',
    songTitle: row.song_title || '',
    themeType: row.theme_type || 'OP',
    artistName: row.artist_name || '',
    mediaUrl: row.media_url || '',
    coverUrl: row.cover_url || '',
    position: row.position ?? index,
    // UI convenience
    title: row.song_title || '',
    artist: row.artist_name || '',
    source: row.source_title_name || '',
    provider: 'catalog',
  };
}

/**
 * Filters templates client-side (used while DB returns full set).
 * For real filtering prefer passing params to fetchPartyTemplates().
 */
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
