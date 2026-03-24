import { describe, expect, it } from 'vitest';
import { buildBattleDeck, createStoredBattleDeck } from '../battleStore.js';
import { THEME_SONG_ENTITY_TYPE } from '../../../../shared/lib/catalogEntities.js';

function makeSong(overrides = {}) {
  return {
    id: 101,
    slug: 'song-101',
    entityType: THEME_SONG_ENTITY_TYPE,
    type: 'theme_song',
    subtype: 'OP',
    title_en: 'Idol',
    title_th: 'Idol',
    title_native: '',
    cover: '/idol.jpg',
    banner: '',
    synopsis: '',
    score: null,
    popularity: 0,
    year: 2023,
    is_adult: false,
    genres: [],
    tags: [],
    moods: [],
    role: 'OP 1',
    voice_actor_name: 'YOASOBI',
    voice_actor_image: '',
    song_title: 'Idol',
    artist_name: 'YOASOBI',
    theme_type: 'OP',
    theme_sequence: 1,
    theme_label: 'OP 1',
    video_url: 'https://cdn.example.com/idol.mp4',
    is_creditless: true,
    is_spoiler: false,
    is_nsfw: false,
    episodes_text: 'EP 1-11',
    sourceTitleId: 55,
    sourceTitleSlug: 'oshi-no-ko',
    sourceTitleName: 'Oshi no Ko',
    ...overrides,
  };
}

describe('battleStore song support', () => {
  it('searches song decks using song-specific fields and labels them as songs', () => {
    const songs = [
      makeSong(),
      makeSong({
        id: 102,
        slug: 'song-102',
        title_en: 'Mephisto',
        title_th: 'Mephisto',
        song_title: 'Mephisto',
        artist_name: 'Queen Bee',
        voice_actor_name: 'Queen Bee',
        theme_type: 'ED',
        theme_sequence: 1,
        theme_label: 'ED 1',
      }),
    ];

    const deck = buildBattleDeck(songs, {
      entityType: THEME_SONG_ENTITY_TYPE,
      query: 'yoasobi',
      size: 8,
    });

    expect(deck.label).toBe('All songs');
    expect(deck.titles).toHaveLength(1);
    expect(deck.titles[0]).toEqual(expect.objectContaining({
      id: 101,
      artist_name: 'YOASOBI',
    }));
  });

  it('preserves song metadata when storing a deck', () => {
    const storedDeck = createStoredBattleDeck({
      label: 'Oshi no Ko themes',
      filters: {
        entityType: THEME_SONG_ENTITY_TYPE,
        type: 'anime',
        trailerState: 'has',
        trailerProvider: 'youtube',
        size: 8,
      },
      titles: [makeSong()],
      sourceCount: 1,
    });

    expect(storedDeck.filters).toEqual(expect.objectContaining({
      entityType: THEME_SONG_ENTITY_TYPE,
      type: 'all',
      trailerState: 'all',
      trailerProvider: 'all',
    }));
    expect(storedDeck.titles[0]).toEqual(expect.objectContaining({
      entityType: THEME_SONG_ENTITY_TYPE,
      song_title: 'Idol',
      artist_name: 'YOASOBI',
      theme_type: 'OP',
      theme_sequence: 1,
      theme_label: 'OP 1',
      video_url: 'https://cdn.example.com/idol.mp4',
      is_creditless: true,
      episodes_text: 'EP 1-11',
      sourceTitleName: 'Oshi no Ko',
    }));
  });
});
