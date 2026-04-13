import {
  createPartySettings,
  getPartyPresetById,
  isDirectPartyMediaUrl,
  normalizePartyText,
  resolvePartyChoiceIdentity,
  resolvePartySourceTitleName,
} from './partyEngine';
import {
  PARTY_TEMPLATE_MIN_SONGS,
  PARTY_TEMPLATE_MODE_SCOPE,
  PARTY_TEMPLATE_PLAYBACK_STATUS,
  PARTY_TEMPLATE_ITEM_PROVIDER,
  PARTY_TEMPLATE_ITEM_SOURCE_KIND,
  PARTY_TEMPLATE_PRESET_IDS,
  PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE,
  PARTY_TEMPLATE_SOURCE_MATCH_METHOD,
  PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS,
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
  const explicitProvider = String(item.provider || '').trim().toLowerCase();

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
 * Looser playability check for vote battle mode.
 * Accepts image-only items (coverUrl present, no mediaUrl) in addition to audio/video items.
 */
export function isVoteItemPlayable(item = {}) {
  if (isTemplateItemPlayable(item)) return true;
  return Boolean(
    item.coverUrl
    && (item.id || item.templateItemId || item.sourceTitleName || item.songTitle),
  );
}

function getTemplateSongTitle(item = {}) {
  return String(item.songTitle ?? item.song_title ?? item.title ?? '').trim();
}

function normalizeSourceResolutionStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED) {
    return PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED;
  }
  if (normalized === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED) {
    return PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED;
  }
  return PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.UNRESOLVED;
}

function normalizeSourceMatchConfidence(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.values(PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE).includes(normalized)) {
    return normalized;
  }
  return PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.LOW;
}

function normalizeSourceMatchMethod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.values(PARTY_TEMPLATE_SOURCE_MATCH_METHOD).includes(normalized)) {
    return normalized;
  }
  return PARTY_TEMPLATE_SOURCE_MATCH_METHOD.YOUTUBE_TITLE_PARSE;
}

export function getTemplateResolvedSource(item = {}) {
  const provider = String(item?.provider || '').trim().toLowerCase();
  const sourceTitleId = Number(item?.sourceTitleId ?? item?.source_title_id ?? 0);
  const sourceTitleName = String(item?.sourceTitleName ?? item?.source_title_name ?? '').trim();
  const resolvedSourceTitleId = Number(item?.resolvedSourceTitleId ?? item?.resolved_source_title_id ?? 0);
  const resolvedSourceTitleName = String(item?.resolvedSourceTitleName ?? item?.resolved_source_title_name ?? '').trim();
  const fallbackAnswerableSourceTitle = resolvePartySourceTitleName(item);

  if (provider !== PARTY_TEMPLATE_ITEM_PROVIDER.YOUTUBE && sourceTitleId > 0) {
    return {
      sourceResolutionStatus: PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
      resolvedSourceTitleId: sourceTitleId,
      resolvedSourceTitleName: sourceTitleName,
      sourceMatchConfidence: PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT,
      sourceMatchMethod: PARTY_TEMPLATE_SOURCE_MATCH_METHOD.CATALOG_EXACT,
      answerableSourceTitleName: sourceTitleName || fallbackAnswerableSourceTitle,
      isClassicResolved: Boolean(sourceTitleId && sourceTitleName),
      resolvedSourceKey: sourceTitleId ? `id:${sourceTitleId}` : '',
    };
  }

  const sourceResolutionStatus = normalizeSourceResolutionStatus(
    item?.sourceResolutionStatus ?? item?.source_resolution_status,
  );
  const linkedResolvedId = resolvedSourceTitleId || (sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED ? sourceTitleId : 0);
  const linkedResolvedName = resolvedSourceTitleName || (sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED ? sourceTitleName : '');
  const isClassicResolved = sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED
    && linkedResolvedId > 0
    && Boolean(normalizePartyText(linkedResolvedName));

  return {
    sourceResolutionStatus,
    resolvedSourceTitleId: linkedResolvedId || 0,
    resolvedSourceTitleName: linkedResolvedName,
    sourceMatchConfidence: normalizeSourceMatchConfidence(item?.sourceMatchConfidence ?? item?.source_match_confidence),
    sourceMatchMethod: normalizeSourceMatchMethod(item?.sourceMatchMethod ?? item?.source_match_method),
    answerableSourceTitleName: linkedResolvedName || fallbackAnswerableSourceTitle,
    isClassicResolved,
    resolvedSourceKey: isClassicResolved ? `id:${linkedResolvedId}` : '',
  };
}

function createCompatibilityReason(code, params = {}) {
  if (code === 'insufficient_playable_songs') {
    return {
      code,
      message: `${params.label} needs at least ${params.requiredCount} playable songs, but this template only has ${params.actualCount}.`,
      ...params,
    };
  }

  if (code === 'insufficient_distinct_sources') {
    return {
      code,
      message: `${params.label} needs at least ${params.requiredCount} distinct answer choices, but this template only has ${params.actualCount}.`,
      ...params,
    };
  }

  if (code === 'insufficient_answerable_songs') {
    return {
      code,
      message: `${params.label} needs at least ${params.requiredCount} playable songs with ${params.requirementLabel}, but this template only has ${params.actualCount}.`,
      ...params,
    };
  }

  if (code === 'missing_source_metadata') {
    return {
      code,
      message: `${params.actualCount} playable song${params.actualCount === 1 ? '' : 's'} ${params.actualCount === 1 ? 'is' : 'are'} missing a usable source title.`,
      ...params,
    };
  }

  if (code === 'missing_song_titles') {
    return {
      code,
      message: `${params.actualCount} playable song${params.actualCount === 1 ? '' : 's'} ${params.actualCount === 1 ? 'is' : 'are'} missing a song title.`,
      ...params,
    };
  }

  return {
    code,
    message: params.message || 'Template compatibility check failed.',
    ...params,
  };
}

function getTemplateCompatibilityTarget(settingsOrPreset = {}) {
  if (typeof settingsOrPreset === 'string') {
    const preset = getPartyPresetById(settingsOrPreset);
    return {
      type: 'preset',
      id: preset.id,
      requiredCount: preset.id === 'party-classic' ? 5 : 2,
      label: preset.label,
    };
  }

  const raw = settingsOrPreset || {};
  const hasExplicitTarget = Object.keys(raw).some((key) => raw[key] != null && raw[key] !== '');
  if (!hasExplicitTarget) {
    return null;
  }

  if (raw.modeType === 'vote') {
    const normalizedSettings = createPartySettings({ ...raw, modeType: 'vote' });
    return {
      type: 'vote',
      id: 'vote',
      requiredCount: Math.max(2, Number(normalizedSettings.entrantCount || 0)),
      label: 'Vote Battle',
    };
  }

  const normalizedSettings = createPartySettings({
    ...raw,
    modeType: 'quiz',
    presetId: raw.presetId || PARTY_TEMPLATE_PRESET_IDS[0],
  });
  const preset = getPartyPresetById(normalizedSettings.presetId);
  return {
    type: 'preset',
    id: preset.id,
    requiredCount: preset.id === 'party-classic'
      ? Math.max(5, Number(normalizedSettings.roundCount || 0))
      : Math.max(2, Number(normalizedSettings.roundCount || 0)),
    label: preset.label,
  };
}

function buildPresetCompatibilityResult(presetId, metrics, requiredCount) {
  const preset = getPartyPresetById(presetId);
  const label = preset.label;
  const blockingReasons = [];
  const warnings = [];

  if (metrics.playableSongCount < requiredCount) {
    blockingReasons.push(createCompatibilityReason('insufficient_playable_songs', {
      presetId,
      label,
      requiredCount,
      actualCount: metrics.playableSongCount,
    }));
  }

  if (presetId === 'party-classic') {
    if (metrics.choiceEligibleCount < requiredCount && metrics.playableSongCount >= requiredCount) {
      blockingReasons.push(createCompatibilityReason('insufficient_answerable_songs', {
        presetId,
        label,
        requiredCount,
        actualCount: metrics.choiceEligibleCount,
        requirementLabel: 'usable choice answers',
      }));
    }

    if (metrics.distinctChoiceAnswerCount < 4) {
      blockingReasons.push(createCompatibilityReason('insufficient_distinct_sources', {
        presetId,
        label,
        requiredCount: 4,
        actualCount: metrics.distinctChoiceAnswerCount,
      }));
    }
  } else if (presetId === 'song-typing') {
    if (metrics.songTypingEligibleCount < requiredCount && metrics.playableSongCount >= requiredCount) {
      blockingReasons.push(createCompatibilityReason('insufficient_answerable_songs', {
        presetId,
        label,
        requiredCount,
        actualCount: metrics.songTypingEligibleCount,
        requirementLabel: 'song titles',
      }));
    }
  }

  if (metrics.missingSourceMetadataCount > 0) {
    warnings.push(createCompatibilityReason('missing_source_metadata', {
      presetId,
      actualCount: metrics.missingSourceMetadataCount,
    }));
  }

  if (metrics.missingSongTitleCount > 0) {
    warnings.push(createCompatibilityReason('missing_song_titles', {
      presetId,
      actualCount: metrics.missingSongTitleCount,
    }));
  }

  return {
    presetId,
    label,
    requiredCount,
    compatible: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  };
}

function buildVoteCompatibilityResult(metrics, requiredCount) {
  const blockingReasons = [];
  if (metrics.playableSongCount < requiredCount) {
    blockingReasons.push(createCompatibilityReason('insufficient_playable_songs', {
      presetId: 'vote',
      label: 'Vote Battle',
      requiredCount,
      actualCount: metrics.playableSongCount,
    }));
  }

  return {
    presetId: 'vote',
    label: 'Vote Battle',
    requiredCount,
    compatible: blockingReasons.length === 0,
    blockingReasons,
    warnings: [],
  };
}

export function analyzePartyTemplateCompatibility(items = [], settingsOrPreset = {}) {
  const playableItems = Array.isArray(items)
    ? items
      .filter(isTemplateItemPlayable)
      .map((item) => {
        const songTitle = getTemplateSongTitle(item);
        const resolvedSource = getTemplateResolvedSource(item);
        const sourceTitleName = resolvedSource.answerableSourceTitleName;
        const choiceIdentity = resolvePartyChoiceIdentity({
          ...item,
          songTitle,
          sourceTitleName,
          ...resolvedSource,
        });
        return {
          ...item,
          songTitle,
          sourceTitleName,
          ...resolvedSource,
          ...choiceIdentity,
          hasSongTitle: Boolean(normalizePartyText(songTitle)),
          hasSourceTitle: Boolean(normalizePartyText(sourceTitleName)),
        };
      })
    : [];
  const metrics = {
    playableSongCount: playableItems.length,
    distinctChoiceAnswerCount: new Set(
      playableItems
        .filter((item) => item.hasSongTitle && item.answerKey)
        .map((item) => item.answerKey)
    ).size,
    distinctResolvedSourceCount: new Set(
      playableItems
        .filter((item) => item.hasSongTitle && item.isClassicResolved && item.resolvedSourceKey)
        .map((item) => item.resolvedSourceKey)
    ).size,
    missingSourceMetadataCount: playableItems.filter((item) => !item.hasSourceTitle).length,
    missingSongTitleCount: playableItems.filter((item) => !item.hasSongTitle).length,
    classicEligibleCount: playableItems.filter((item) => item.hasSongTitle && item.isClassicResolved).length,
    choiceEligibleCount: playableItems.filter((item) => item.hasSongTitle && item.answerKey).length,
    resolvedClassicEligibleCount: playableItems.filter((item) => item.hasSongTitle && item.isClassicResolved).length,
    songTypingEligibleCount: playableItems.filter((item) => item.hasSongTitle).length,
    unresolvedSourceCount: playableItems.filter((item) => item.sourceResolutionStatus !== PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED).length,
    sourceSuggestionCount: playableItems.filter((item) => item.sourceResolutionStatus === PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.SUGGESTED).length,
  };

  const presetResults = Object.fromEntries(
    PARTY_TEMPLATE_PRESET_IDS.map((presetId) => [
      presetId,
      buildPresetCompatibilityResult(
        presetId,
        metrics,
        presetId === 'party-classic' ? 5 : 2,
      ),
    ])
  );
  const votePlayableCount = Array.isArray(items) ? items.filter(isVoteItemPlayable).length : 0;
  const voteMetrics = { ...metrics, playableSongCount: votePlayableCount };
  const voteResult = buildVoteCompatibilityResult(voteMetrics, 2);
  const compatiblePresets = PARTY_TEMPLATE_PRESET_IDS.filter((presetId) => presetResults[presetId]?.compatible);
  const target = getTemplateCompatibilityTarget(settingsOrPreset);
  const targetResult = !target
    ? null
    : target.type === 'vote'
      ? buildVoteCompatibilityResult(voteMetrics, target.requiredCount)
      : buildPresetCompatibilityResult(target.id, metrics, target.requiredCount);

  return {
    playableSongCount: metrics.playableSongCount,
    classicEligibleCount: metrics.classicEligibleCount,
    choiceEligibleCount: metrics.choiceEligibleCount,
    resolvedClassicEligibleCount: metrics.resolvedClassicEligibleCount,
    songTypingEligibleCount: metrics.songTypingEligibleCount,
    distinctChoiceAnswerCount: metrics.distinctChoiceAnswerCount,
    distinctSourceCount: metrics.distinctResolvedSourceCount,
    distinctResolvedSourceCount: metrics.distinctResolvedSourceCount,
    missingSourceMetadataCount: metrics.missingSourceMetadataCount,
    missingSongTitleCount: metrics.missingSongTitleCount,
    unresolvedSourceCount: metrics.unresolvedSourceCount,
    sourceSuggestionCount: metrics.sourceSuggestionCount,
    compatiblePresets,
    blockingReasons: targetResult?.blockingReasons || [],
    warnings: targetResult?.warnings || [],
    presetResults,
    voteResult,
    targetResult,
  };
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
    resolved_source_title_id: song.resolvedSourceTitleId ?? song.resolved_source_title_id ?? song.sourceTitleId ?? song.source_title_id ?? null,
    resolved_source_title_name: (
      song.resolvedSourceTitleName
      ?? song.resolved_source_title_name
      ?? song.sourceTitleName
      ?? song.source_title_name
      ?? song.source
      ?? ''
    ),
    source_resolution_status: song.sourceResolutionStatus ?? song.source_resolution_status ?? PARTY_TEMPLATE_SOURCE_RESOLUTION_STATUS.LINKED,
    source_match_confidence: song.sourceMatchConfidence ?? song.source_match_confidence ?? PARTY_TEMPLATE_SOURCE_MATCH_CONFIDENCE.EXACT,
    source_match_method: song.sourceMatchMethod ?? song.source_match_method ?? PARTY_TEMPLATE_SOURCE_MATCH_METHOD.CATALOG_EXACT,
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
    resolvedSourceTitleId: row.resolved_source_title_id ?? null,
    resolvedSourceTitleName: row.resolved_source_title_name || '',
    sourceResolutionStatus: row.source_resolution_status || '',
    sourceMatchConfidence: row.source_match_confidence || '',
    sourceMatchMethod: row.source_match_method || '',
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
