import { describe, expect, it } from 'vitest';
import {
  parseYoutubeUrl,
  parseYoutubeVideoId,
} from '../partyYoutube.js';

describe('parseYoutubeVideoId', () => {
  it('parses standard watch URLs', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=Hc4OrO4LRWw')).toBe('Hc4OrO4LRWw');
  });

  it('parses youtu.be short links', () => {
    expect(parseYoutubeVideoId('https://youtu.be/Hc4OrO4LRWw?si=test-share')).toBe('Hc4OrO4LRWw');
  });

  it('parses youtube shorts URLs', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/shorts/Hc4OrO4LRWw?feature=share')).toBe('Hc4OrO4LRWw');
  });

  it('parses youtube live/embed style path URLs', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/live/Hc4OrO4LRWw?feature=share')).toBe('Hc4OrO4LRWw');
  });
});

describe('parseYoutubeUrl', () => {
  it('returns video for shorts URLs', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/shorts/Hc4OrO4LRWw')).toEqual({
      type: 'video',
      id: 'Hc4OrO4LRWw',
    });
  });

  it('keeps playlist priority when a URL includes both list and a shorts path', () => {
    expect(parseYoutubeUrl('https://www.youtube.com/shorts/Hc4OrO4LRWw?list=PL1234567890')).toEqual({
      type: 'playlist',
      id: 'PL1234567890',
    });
  });

  it('returns invalid for unsupported URLs', () => {
    expect(parseYoutubeUrl('https://example.com/video/Hc4OrO4LRWw')).toEqual({
      type: 'invalid',
      id: null,
    });
  });
});
