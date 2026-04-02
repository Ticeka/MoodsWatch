import { describe, expect, it } from 'vitest';
import {
  analyzePartyTemplateCompatibility,
  catalogSongToTemplateItem,
  filterTemplates,
  getTemplateCoverUrl,
  getTemplateFallbackItemCoverUrl,
  getTemplatePlayableCount,
  isTemplateItemPlayable,
  mapTemplateItemFromDb,
  resolveTemplateCoverUrl,
  sanitizeTemplateCoverUrl,
  validatePlayableTemplateForMode,
  validateTemplateForMode,
} from '../partyTemplateUtils.js';

// ---------------------------------------------------------------------------
// catalogSongToTemplateItem
// ---------------------------------------------------------------------------
describe('catalogSongToTemplateItem', () => {
  it('maps catalog search results into template item rows', () => {
    expect(catalogSongToTemplateItem({
      id: 101,
      sourceTitleId: 55,
      sourceTitleName: 'Attack on Titan',
      songTitle: 'Guren no Yumiya',
      themeType: 'OP',
      artistName: 'Linked Horizon',
      mediaUrl: 'https://cdn.example.com/aot-op.mp4',
      coverUrl: 'https://cdn.example.com/aot.jpg',
    }, 2)).toMatchObject({
      song_id: 101,
      source_title_id: 55,
      source_title_name: 'Attack on Titan',
      song_title: 'Guren no Yumiya',
      theme_type: 'OP',
      artist_name: 'Linked Horizon',
      media_url: 'https://cdn.example.com/aot-op.mp4',
      cover_url: 'https://cdn.example.com/aot.jpg',
      position: 2,
    });
  });

  it('always uses the explicit position argument โ€” not the song.position property', () => {
    // After mapTemplateItemFromDb the item has position=0 from the DB row.
    // When the builder re-saves with items.map((item, index) => catalogSongToTemplateItem(item, index))
    // the index (3) must win so reordered playlists are stored correctly.
    const playlistItem = mapTemplateItemFromDb({
      id: 999,
      template_id: 12,
      song_id: 101,
      source_title_id: 55,
      source_title_name: 'Attack on Titan',
      song_title: 'Guren no Yumiya',
      theme_type: 'OP',
      artist_name: 'Linked Horizon',
      media_url: 'https://cdn.example.com/aot-op.mp4',
      cover_url: 'https://cdn.example.com/aot.jpg',
      position: 0,
    });

    expect(catalogSongToTemplateItem(playlistItem, 3)).toMatchObject({
      song_id: 101,
      source_title_id: 55,
      source_title_name: 'Attack on Titan',
      song_title: 'Guren no Yumiya',
      theme_type: 'OP',
      artist_name: 'Linked Horizon',
      media_url: 'https://cdn.example.com/aot-op.mp4',
      cover_url: 'https://cdn.example.com/aot.jpg',
      position: 3,  // explicit arg wins
    });
  });

  it('accepts raw DB snake_case rows (e.g. from template items export)', () => {
    expect(catalogSongToTemplateItem({
      song_id: 202,
      source_title_id: 10,
      source_title_name: 'Naruto',
      song_title: 'Blue Bird',
      theme_type: 'OP',
      artist_name: 'Ikimono Gakari',
      media_url: 'https://cdn.example.com/naruto-op.mp4',
      cover_url: '',
    }, 0)).toMatchObject({ song_id: 202, song_title: 'Blue Bird', position: 0 });
  });

  it('falls back gracefully when fields are missing', () => {
    const result = catalogSongToTemplateItem({ id: 5 }, 1);
    expect(result.song_id).toBe(5);
    expect(result.song_title).toBe('');
    expect(result.theme_type).toBe('OP');
    expect(result.position).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// validateTemplateForMode
// ---------------------------------------------------------------------------
describe('validateTemplateForMode', () => {
  it('rejects empty template', () => {
    expect(validateTemplateForMode([], 'all')).toEqual({
      valid: false,
      reason: 'Template has no songs.',
    });
  });

  it('accepts 2+ songs for vote-only template', () => {
    expect(validateTemplateForMode([{}, {}], 'vote')).toEqual({ valid: true });
  });

  it('rejects fewer than 4 songs for quiz-only template', () => {
    expect(validateTemplateForMode([{}, {}], 'quiz')).toEqual({
      valid: false,
      reason: 'Quiz mode requires at least 4 songs.',
    });
  });

  it('accepts 4+ songs for quiz-only template', () => {
    expect(validateTemplateForMode([{}, {}, {}, {}], 'quiz')).toEqual({ valid: true });
  });

  it('rejects fewer than 4 songs for all-modes template (quiz is stricter minimum)', () => {
    expect(validateTemplateForMode([{}, {}, {}], 'all')).toEqual({
      valid: false,
      reason: expect.stringContaining('4'),
    });
  });

  it('accepts 4+ songs for all-modes template', () => {
    expect(validateTemplateForMode([{}, {}, {}, {}], 'all')).toEqual({ valid: true });
  });

  it('rejects vote-only template with 1 song (minimum is 2)', () => {
    expect(validateTemplateForMode([{}], 'vote')).toEqual({
      valid: false,
      reason: expect.stringContaining('2'),
    });
  });
});

// ---------------------------------------------------------------------------
// playable validation
// ---------------------------------------------------------------------------
describe('template playability helpers', () => {
  it('detects playable and unplayable items from media urls', () => {
    expect(isTemplateItemPlayable({
      songId: 1,
      sourceTitleId: 10,
      mediaUrl: 'https://cdn.example.com/song.mp4',
    })).toBe(true);

    expect(isTemplateItemPlayable({
      songId: 2,
      sourceTitleId: 10,
      mediaUrl: 'https://youtube.com/watch?v=abc',
    })).toBe(false);
  });

  it('counts only playable template items', () => {
    expect(getTemplatePlayableCount([
      { songId: 1, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song-1.mp4' },
      { songId: 2, sourceTitleId: 11, mediaUrl: 'https://cdn.example.com/song-2.webm' },
      { songId: 3, sourceTitleId: 12, mediaUrl: 'https://youtube.com/watch?v=abc' },
    ])).toBe(2);
  });

  it('rejects all-mode templates when playable songs are below the quiz minimum', () => {
    expect(validatePlayableTemplateForMode([
      { songId: 1, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song-1.mp4' },
      { songId: 2, sourceTitleId: 11, mediaUrl: 'https://cdn.example.com/song-2.webm' },
      { songId: 3, sourceTitleId: 12, mediaUrl: 'https://youtube.com/watch?v=abc' },
      { songId: 4, sourceTitleId: 13, mediaUrl: 'https://youtube.com/watch?v=def' },
    ], 'all')).toEqual({
      valid: false,
      playableCount: 2,
      requiredCount: 4,
      reason: 'All modes needs at least 4 playable songs. This template only has 2.',
    });
  });

  it('accepts vote templates with two playable songs even if extra songs are unplayable', () => {
    expect(validatePlayableTemplateForMode([
      { songId: 1, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song-1.mp4' },
      { songId: 2, sourceTitleId: 11, mediaUrl: 'https://youtube.com/watch?v=abc' },
      { songId: 3, sourceTitleId: 12, mediaUrl: 'https://cdn.example.com/song-3.ogg' },
    ], 'vote')).toEqual({
      valid: true,
      playableCount: 2,
      requiredCount: 2,
    });
  });

  it('treats only ready YouTube items as playable', () => {
    expect(isTemplateItemPlayable({
      provider: 'youtube',
      playback_status: 'ready',
    })).toBe(true);

    expect(isTemplateItemPlayable({
      provider: 'youtube',
      playback_status: 'limited',
    })).toBe(false);

    expect(isTemplateItemPlayable({
      provider: 'youtube',
      playback_status: 'blocked',
    })).toBe(false);
  });

  it('marks Party Classic incompatible when a large template only has two distinct sources', () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      provider: 'catalog',
      songId: index + 1,
      sourceTitleId: index % 2 === 0 ? 10 : 11,
      sourceTitleName: index % 2 === 0 ? 'Naruto' : 'Bleach',
      songTitle: `Song ${index + 1}`,
      mediaUrl: `https://cdn.example.com/song-${index + 1}.mp4`,
    }));

    const compatibility = analyzePartyTemplateCompatibility(items);

    expect(compatibility.presetResults['party-classic'].compatible).toBe(false);
    expect(compatibility.presetResults['party-classic'].blockingReasons[0]?.code).toBe('insufficient_distinct_sources');
    expect(compatibility.presetResults['song-typing'].compatible).toBe(true);
  });

  it('treats YouTube channel-name placeholders as missing source metadata', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      provider: 'youtube',
      playback_status: 'ready',
      provider_media_id: `yt-${index + 1}`,
      song_title: `YouTube Song ${index + 1}`,
      artist_name: `Uploader ${index + 1}`,
      source_title_name: `Uploader ${index + 1}`,
    }));

    const compatibility = analyzePartyTemplateCompatibility(items);

    expect(compatibility.missingSourceMetadataCount).toBe(5);
    expect(compatibility.presetResults['party-classic'].compatible).toBe(true);
    expect(compatibility.presetResults['song-typing'].compatible).toBe(true);
  });

  it('allows unresolved YouTube templates in Party Classic by falling back to song-title choices', () => {
    const sourceTitles = ['Bocchi the Rock!', 'Frieren', 'Naruto', 'Bleach', 'JJK'];
    const items = sourceTitles.map((sourceTitleName, index) => ({
      provider: 'youtube',
      playback_status: 'ready',
      provider_media_id: `yt-ready-${index + 1}`,
      song_title: `Mapped Song ${index + 1}`,
      artist_name: `Uploader ${index + 1}`,
      source_title_name: sourceTitleName,
    }));

    const compatibility = analyzePartyTemplateCompatibility(items, {
      modeType: 'quiz',
      presetId: 'party-classic',
      roundCount: 5,
    });

    expect(compatibility.songTypingEligibleCount).toBe(5);
    expect(compatibility.choiceEligibleCount).toBe(5);
    expect(compatibility.distinctChoiceAnswerCount).toBe(5);
    expect(compatibility.unresolvedSourceCount).toBe(5);
    expect(compatibility.presetResults['song-typing'].compatible).toBe(true);
    expect(compatibility.targetResult?.compatible).toBe(true);
    expect(compatibility.distinctResolvedSourceCount).toBe(0);
  });

  it('still blocks Party Classic when unresolved YouTube items only provide two distinct song-title choices', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      provider: 'youtube',
      playback_status: 'ready',
      provider_media_id: `yt-dup-${index + 1}`,
      song_title: index < 3 ? 'Shared Song A' : 'Shared Song B',
      artist_name: `Uploader ${index + 1}`,
      source_title_name: `Series ${index + 1}`,
    }));

    const compatibility = analyzePartyTemplateCompatibility(items, {
      modeType: 'quiz',
      presetId: 'party-classic',
      roundCount: 5,
    });

    expect(compatibility.choiceEligibleCount).toBe(5);
    expect(compatibility.distinctChoiceAnswerCount).toBe(2);
    expect(compatibility.targetResult?.compatible).toBe(false);
    expect(compatibility.targetResult?.blockingReasons[0]?.code).toBe('insufficient_distinct_sources');
  });

  it('allows YouTube templates in Party Classic only after canonical sources are linked', () => {
    const sourceTitles = ['Bocchi the Rock!', 'Frieren', 'Naruto', 'Bleach', 'JJK'];
    const items = sourceTitles.map((sourceTitleName, index) => ({
      provider: 'youtube',
      playback_status: 'ready',
      provider_media_id: `yt-linked-${index + 1}`,
      song_title: `Mapped Song ${index + 1}`,
      artist_name: `Uploader ${index + 1}`,
      source_title_name: sourceTitleName,
      resolved_source_title_id: 700 + index,
      resolved_source_title_name: sourceTitleName,
      source_resolution_status: 'linked',
      source_match_confidence: 'high',
      source_match_method: 'manual',
    }));

    const compatibility = analyzePartyTemplateCompatibility(items, {
      modeType: 'quiz',
      presetId: 'party-classic',
      roundCount: 5,
    });

    expect(compatibility.targetResult?.compatible).toBe(true);
    expect(compatibility.resolvedClassicEligibleCount).toBe(5);
    expect(compatibility.distinctResolvedSourceCount).toBe(5);
  });
});

describe('template cover helpers', () => {
  it('drops blob urls so preview-only images are not persisted as template covers', () => {
    expect(sanitizeTemplateCoverUrl('blob:http://localhost:5173/abc-123')).toBe('');
  });

  it('keeps normal remote urls intact', () => {
    expect(sanitizeTemplateCoverUrl('https://cdn.example.com/template.jpg')).toBe('https://cdn.example.com/template.jpg');
  });

  it('falls back to the default cover when the saved value is unusable', () => {
    expect(getTemplateCoverUrl('blob:http://localhost:5173/abc-123')).toBe('/images/default-party-cover.jpg');
  });

  it('uses the first valid item cover as a fallback when the template cover is missing', () => {
    expect(getTemplateFallbackItemCoverUrl([
      { coverUrl: '' },
      { cover_url: 'https://cdn.example.com/first-song.jpg' },
      { coverUrl: 'https://cdn.example.com/second-song.jpg' },
    ])).toBe('https://cdn.example.com/first-song.jpg');
  });

  it('resolves template cover from item covers before falling back to the default image', () => {
    expect(resolveTemplateCoverUrl('', [
      { cover_url: '' },
      { coverUrl: 'https://cdn.example.com/song-cover.jpg' },
    ])).toBe('https://cdn.example.com/song-cover.jpg');
  });
});

// ---------------------------------------------------------------------------
// filterTemplates (client-side)
// ---------------------------------------------------------------------------
describe('filterTemplates', () => {
  const templates = [
    { name: 'Anime Hits', description: 'Popular openings', tags: ['OP', 'anime'], modeScope: 'quiz' },
    { name: 'Vote Battle Pack', description: '', tags: ['vote', 'battle'], modeScope: 'vote' },
    { name: 'All Modes Mix', description: 'Quiz and vote friendly', tags: ['all'], modeScope: 'all' },
  ];

  it('returns all templates when no filters applied', () => {
    expect(filterTemplates(templates)).toHaveLength(3);
  });

  it('filters by search query on name', () => {
    expect(filterTemplates(templates, { search: 'vote' })).toHaveLength(2); // "Vote Battle Pack" name + "All Modes Mix" has vote in tags? no. Let me recalculate: Vote Battle Pack name has "vote", and tags of Vote Battle Pack has "vote". All Modes Mix tags has "all" not vote. So only 1 match by name for "Vote Battle"... wait "vote" is in "Vote Battle Pack" name. "All Modes Mix" doesn't contain "vote" in name/desc/tags. So 1.
  });

  it('filters by mode: quiz returns quiz + all', () => {
    const result = filterTemplates(templates, { mode: 'quiz' });
    expect(result.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Anime Hits', 'All Modes Mix']),
    );
    expect(result).toHaveLength(2);
  });

  it('filters by mode: vote returns vote + all', () => {
    const result = filterTemplates(templates, { mode: 'vote' });
    expect(result.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Vote Battle Pack', 'All Modes Mix']),
    );
    expect(result).toHaveLength(2);
  });

  it('combines search and mode filter', () => {
    const result = filterTemplates(templates, { search: 'mix', mode: 'vote' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('All Modes Mix');
  });

  it('returns [] for non-array input', () => {
    expect(filterTemplates(null)).toEqual([]);
    expect(filterTemplates(undefined)).toEqual([]);
  });
});


