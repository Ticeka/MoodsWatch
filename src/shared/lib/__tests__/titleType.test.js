import { describe, it, expect } from 'vitest';
import {
  getTitleTypeMeta,
  isEpisodeBasedType,
  isChapterBasedType,
  getTitleFormatBadge,
} from '../titleType.js';

describe('getTitleTypeMeta', () => {
  it('returns English label by default', () => {
    expect(getTitleTypeMeta('anime').displayLabel).toBe('Anime');
    expect(getTitleTypeMeta('manga').displayLabel).toBe('Manga');
    expect(getTitleTypeMeta('manhwa').displayLabel).toBe('Manhwa');
  });

  it('returns Thai label when language is "th"', () => {
    expect(getTitleTypeMeta('anime', 'th').displayLabel).toBe('อนิเมะ');
    expect(getTitleTypeMeta('manga', 'th').displayLabel).toBe('มังงะ');
    expect(getTitleTypeMeta('manhwa', 'th').displayLabel).toBe('มันฮวา');
  });

  it('falls back to anime meta for unknown type', () => {
    const meta = getTitleTypeMeta('unknown');
    expect(meta.id).toBe('anime');
    expect(meta.displayLabel).toBe('Anime');
  });

  it('includes badgeClass, unitLabel, and fallbackFormat', () => {
    const meta = getTitleTypeMeta('manga');
    expect(meta.badgeClass).toBe('badge-manga');
    expect(meta.unitLabel).toBe('CH');
    expect(meta.fallbackFormat).toBe('Manga');
  });
});

describe('isEpisodeBasedType', () => {
  it('returns true only for anime', () => {
    expect(isEpisodeBasedType('anime')).toBe(true);
    expect(isEpisodeBasedType('manga')).toBe(false);
    expect(isEpisodeBasedType('manhwa')).toBe(false);
    expect(isEpisodeBasedType(null)).toBe(false);
  });
});

describe('isChapterBasedType', () => {
  it('returns true for manga and manhwa', () => {
    expect(isChapterBasedType('manga')).toBe(true);
    expect(isChapterBasedType('manhwa')).toBe(true);
    expect(isChapterBasedType('anime')).toBe(false);
    expect(isChapterBasedType(null)).toBe(false);
  });
});

describe('getTitleFormatBadge', () => {
  it('shows episode count with EP unit for anime', () => {
    expect(getTitleFormatBadge({ type: 'anime', episodes: 24 })).toBe('24 EP');
  });

  it('shows chapter count with CH unit for manga', () => {
    expect(getTitleFormatBadge({ type: 'manga', chapters: 120 })).toBe('120 CH');
  });

  it('falls back to type label when count is 0 or missing', () => {
    expect(getTitleFormatBadge({ type: 'anime', episodes: 0 })).toBe('Anime');
    expect(getTitleFormatBadge({ type: 'manga' })).toBe('Manga');
    expect(getTitleFormatBadge({ type: 'manhwa' })).toBe('Manhwa');
  });
});
