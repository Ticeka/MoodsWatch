import { describe, expect, it } from 'vitest';
import {
  buildTrailerThumbnailUrl,
  buildTrailerUrl,
  getTrailerEmbed,
  normalizeTrailer,
  parseTrailerUrl,
} from '../trailers.js';

describe('parseTrailerUrl', () => {
  it('parses YouTube watch URLs', () => {
    expect(parseTrailerUrl('https://www.youtube.com/watch?v=OhNwckCLzis')).toEqual({
      site: 'youtube',
      videoId: 'OhNwckCLzis',
    });
  });

  it('parses Dailymotion URLs', () => {
    expect(parseTrailerUrl('https://www.dailymotion.com/video/x8abcde')).toEqual({
      site: 'dailymotion',
      videoId: 'x8abcde',
    });
  });
});

describe('buildTrailerUrl', () => {
  it('derives a watch URL from site and video id', () => {
    expect(buildTrailerUrl({ site: 'youtube', videoId: 'OhNwckCLzis' })).toBe(
      'https://www.youtube.com/watch?v=OhNwckCLzis'
    );
  });
});

describe('buildTrailerThumbnailUrl', () => {
  it('derives a YouTube thumbnail when none is provided', () => {
    expect(buildTrailerThumbnailUrl({ site: 'youtube', videoId: 'OhNwckCLzis' })).toBe(
      'https://i.ytimg.com/vi/OhNwckCLzis/hqdefault.jpg'
    );
  });
});

describe('getTrailerEmbed', () => {
  it('builds an embeddable YouTube URL', () => {
    expect(getTrailerEmbed({ site: 'youtube', videoId: 'OhNwckCLzis' })).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube.com/embed/OhNwckCLzis?rel=0',
      watchUrl: 'https://www.youtube.com/watch?v=OhNwckCLzis',
    });
  });

  it('falls back to the raw trailer URL for external links', () => {
    expect(getTrailerEmbed({ url: 'https://example.com/trailer.mp4' })).toEqual({
      provider: 'external',
      embedUrl: null,
      watchUrl: 'https://example.com/trailer.mp4',
    });
  });
});

describe('normalizeTrailer', () => {
  it('fills in trailer metadata from trailer_url when explicit fields are missing', () => {
    expect(normalizeTrailer({ trailer_url: 'https://youtu.be/OhNwckCLzis' })).toEqual({
      url: 'https://youtu.be/OhNwckCLzis',
      site: 'youtube',
      videoId: 'OhNwckCLzis',
      thumbnailUrl: 'https://i.ytimg.com/vi/OhNwckCLzis/hqdefault.jpg',
      source: null,
      embedUrl: 'https://www.youtube.com/embed/OhNwckCLzis?rel=0',
      watchUrl: 'https://www.youtube.com/watch?v=OhNwckCLzis',
      provider: 'youtube',
    });
  });

  it('prefers explicit thumbnail and source values when provided', () => {
    expect(normalizeTrailer({
      trailer_url: 'https://www.dailymotion.com/video/x8abcde',
      trailer_thumbnail_url: 'https://cdn.example.com/thumb.jpg',
      trailer_source: 'manual',
    })).toEqual({
      url: 'https://www.dailymotion.com/video/x8abcde',
      site: 'dailymotion',
      videoId: 'x8abcde',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      source: 'manual',
      embedUrl: 'https://www.dailymotion.com/embed/video/x8abcde',
      watchUrl: 'https://www.dailymotion.com/video/x8abcde',
      provider: 'dailymotion',
    });
  });

  it('does not treat a title record id as a trailer video id', () => {
    expect(normalizeTrailer({
      id: 1963,
      canonical_title: 'Fullmetal Alchemist: Brotherhood',
      trailer_url: null,
      trailer_video_id: null,
    })).toBeNull();
  });
});
