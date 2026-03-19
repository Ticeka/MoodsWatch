import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fn } from '@storybook/test';
import { vi } from '@storybook/test';
import { TitleCard } from './Card';

// ── Mock all hooks TitleCard depends on ───────────────────────────────────
vi.mock('@/features/profile/hooks/useFavoriteTitles', () => ({
  useFavoriteTitles: () => ({
    isFavorite: () => false,
    toggleFavorite: fn(),
    favoriteTitleIds: [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/profile/hooks/useHiddenTitles', () => ({
  useHiddenTitles: () => ({
    isHidden: () => false,
    hideTitle: fn(),
    unhideTitle: fn(),
  }),
}));

vi.mock('@/features/profile/hooks/useTopTitles', () => ({
  useTopTitles: () => ({
    isInTopTitles: () => false,
    addToTopTitles: fn(),
    removeFromTopTitles: fn(),
    getRank: () => null,
    limit: 5,
  }),
}));

vi.mock('@/features/watchlist/contexts/WatchlistContext', () => ({
  useWatchlist: () => ({
    isInList: () => false,
    addToList: fn(),
    removeFromList: fn(),
    getItem: () => null,
    getStatus: () => null,
    updateItem: fn(),
  }),
}));

vi.mock('@/shared/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'th',
    t: (key) => key,
  }),
}));

// ── Sample data ────────────────────────────────────────────────────────────
const ANIME_TITLE = {
  id: 1,
  slug: 'attack-on-titan',
  title_en: 'Attack on Titan',
  title_th: 'ผ่าพิภพไททัน',
  title_native: '進撃の巨人',
  type: 'anime',
  episodes: 87,
  year: 2013,
  score: 90,
  popularity: 8200,
  status: 'completed',
  cover: 'https://placehold.co/300x420/ff6b6b/fff?text=AoT',
  genres: ['Action', 'Drama', 'Fantasy'],
  tags: ['Gore', 'Military'],
  moods: ['intense', 'dark'],
};

const MANGA_TITLE = {
  id: 2,
  slug: 'berserk',
  title_en: 'Berserk',
  title_th: 'เบอร์เซิร์ก',
  type: 'manga',
  chapters: 374,
  year: 1989,
  score: 96,
  popularity: 5100,
  status: 'ongoing',
  cover: 'https://placehold.co/300x420/3a3a3a/fff?text=Berserk',
  genres: ['Action', 'Horror', 'Fantasy'],
  tags: ['Dark Fantasy'],
  moods: ['dark', 'epic'],
};

const MINIMAL_TITLE = {
  id: 3,
  slug: 'minimal-title',
  title_en: 'Minimal Title',
  title_th: null,
  type: 'manhwa',
  year: null,
  score: 0,
  popularity: 0,
  status: 'ongoing',
  cover: null,
  genres: [],
  tags: [],
  moods: [],
};

// ── Storybook config ───────────────────────────────────────────────────────
export default {
  title: 'UI/TitleCard',
  component: TitleCard,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ maxWidth: '280px', padding: '1rem' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
};

// ── Stories ────────────────────────────────────────────────────────────────

export const AnimeCompleted = {
  name: 'Anime — Completed',
  args: { title: ANIME_TITLE },
};

export const MangaOngoing = {
  name: 'Manga — Ongoing',
  args: { title: MANGA_TITLE },
};

export const MinimalData = {
  name: 'Minimal data (no score, no cover)',
  args: { title: MINIMAL_TITLE },
};

export const HideActions = {
  name: 'No action buttons (hideActions)',
  args: { title: ANIME_TITLE, hideActions: true },
};

export const FavoriteMode = {
  name: 'Primary action: favorite',
  args: { title: MANGA_TITLE, primaryAction: 'favorite' },
};

export const WithProgress = {
  name: 'With episode progress',
  args: {
    title: {
      ...ANIME_TITLE,
      _listProgressEpisode: 45,
      _listStatus: 'watching',
    },
  },
};

export const Mobile = {
  name: 'Mobile viewport (375px)',
  args: { title: ANIME_TITLE },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ width: '100%', padding: '0.5rem' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

export const GridLayout = {
  name: 'Grid — 3 cards',
  render: () => (
    <MemoryRouter>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 280px)', gap: '1.5rem', padding: '1rem' }}>
        <TitleCard title={ANIME_TITLE} />
        <TitleCard title={MANGA_TITLE} />
        <TitleCard title={MINIMAL_TITLE} />
      </div>
    </MemoryRouter>
  ),
};
