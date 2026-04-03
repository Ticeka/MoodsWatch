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

  it('always uses the explicit position argument, not the song.position property', () => {
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
      { songId: 1, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song.mp4' },
      { songId: 2, sourceTitleId: 10, mediaUrl: 'https://youtube.com/watch?v=abc' },
      { songId: 3, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/other.webm' },
    ])).toBe(2);
  });

  it('requires a playable minimum for each mode', () => {
    const items = [
      { songId: 1, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song.mp4' },
      { songId: 2, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song2.mp4' },
      { songId: 3, sourceTitleId: 10, mediaUrl: 'https://cdn.example.com/song3.mp4' },
    ];

    expect(validatePlayableTemplateForMode(items, 'vote')).toEqual({
      valid: true,
      playableCount: 3,
      requiredCount: 2,
    });
    expect(validatePlayableTemplateForMode(items, 'quiz')).toEqual({
      valid: false,
      playableCount: 3,
      requiredCount: 4,
      reason: expect.stringContaining('4'),
    });
  });
});

// ---------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------
describe('template url helpers', () => {
  it('sanitizes dangerous cover urls', () => {
    expect(sanitizeTemplateCoverUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeTemplateCoverUrl('blob:abc')).toBe('');
    expect(sanitizeTemplateCoverUrl('https://cdn.example.com/cover.jpg')).toBe('https://cdn.example.com/cover.jpg');
  });

  it('falls back to the default cover when needed', () => {
    expect(getTemplateCoverUrl('')).toContain('/images/default-party-cover.jpg');
  });

  it('picks a fallback cover from items when the template cover is missing', () => {
    expect(getTemplateFallbackItemCoverUrl([
      { coverUrl: '' },
      { cover_url: 'https://cdn.example.com/fallback.jpg' },
    ])).toBe('https://cdn.example.com/fallback.jpg');
  });

  it('resolves the final cover from explicit cover, items, or fallback', () => {
    expect(resolveTemplateCoverUrl('', [{ cover_url: 'https://cdn.example.com/fallback.jpg' }], '/fallback.jpg'))
      .toBe('https://cdn.example.com/fallback.jpg');
  });
});

describe('template compatibility analysis', () => {
  it('reports compatibility metrics for quiz and vote modes', () => {
    const items = [
      {
        songId: 1,
        sourceTitleId: 100,
        sourceTitleName: 'Attack on Titan',
        songTitle: 'Guren no Yumiya',
        mediaUrl: 'https://cdn.example.com/song1.mp4',
      },
      {
        songId: 2,
        sourceTitleId: 200,
        sourceTitleName: 'Naruto',
        songTitle: 'Blue Bird',
        mediaUrl: 'https://cdn.example.com/song2.mp4',
      },
      {
        songId: 3,
        sourceTitleId: 300,
        sourceTitleName: 'Bleach',
        songTitle: 'Asterisk',
        mediaUrl: 'https://cdn.example.com/song3.mp4',
      },
      {
        songId: 4,
        sourceTitleId: 400,
        sourceTitleName: 'Fullmetal Alchemist',
        songTitle: 'Again',
        mediaUrl: 'https://cdn.example.com/song4.mp4',
      },
      {
        songId: 5,
        sourceTitleId: 500,
        sourceTitleName: 'Death Note',
        songTitle: 'The World',
        mediaUrl: 'https://cdn.example.com/song5.mp4',
      },
    ];

    const result = analyzePartyTemplateCompatibility(items, {
      modeType: 'quiz',
      presetId: 'party-classic',
      roundCount: 5,
    });

    expect(result.playableSongCount).toBe(5);
    expect(result.choiceEligibleCount).toBe(5);
    expect(result.distinctChoiceAnswerCount).toBe(5);
    expect(result.targetResult?.compatible).toBe(true);
  });

  it('filters templates by query and mode', () => {
    const templates = [
      { name: 'Anime Hits', description: 'Popular openings', tags: ['OP', 'anime'], modeScope: 'quiz' },
      { name: 'Vote Battle Pack', description: '', tags: ['vote', 'battle'], modeScope: 'vote' },
      { name: 'All Modes Mix', description: 'Quiz and vote friendly', tags: ['all'], modeScope: 'all' },
    ];

    expect(filterTemplates(templates, { search: 'anime', mode: 'all' })).toHaveLength(1);
    expect(filterTemplates(templates, { search: '', mode: 'vote' })).toHaveLength(2);
  });
});


