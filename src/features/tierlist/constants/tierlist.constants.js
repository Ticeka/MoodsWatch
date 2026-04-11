import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, YOUTUBE_ENTITY_TYPE } from '@/shared/lib/catalogEntities';

export const BROWSE_PAGE_SIZE = 9;
export const MANAGE_LISTS_PAGE_SIZE = 12;
export const BROWSE_ENTITY_LIST_LIMIT = 8;
export const BROWSE_ENTITY_ID_LIMIT = 320;
export const BROWSE_ENTITY_IDS_PER_TEMPLATE = 8;
export const BROWSE_ENTITY_IDS_PER_LIST = 18;
export const ENTITY_VISIBILITY_CHUNK_SIZE = 200;
export const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffff', '#7fbfff', '#7f7fff'];

export const ENTITY_TYPE_OPTIONS = [
  { value: TITLE_ENTITY_TYPE, label: 'Titles' },
  { value: CHARACTER_ENTITY_TYPE, label: 'Characters' },
  { value: THEME_SONG_ENTITY_TYPE, label: 'Theme Songs' },
  { value: YOUTUBE_ENTITY_TYPE, label: 'YouTube' },
];

export const CREATE_SORT_OPTIONS = [
  { value: 'popularity', label: 'Popular' },
  { value: 'score', label: 'Score' },
  { value: 'year', label: 'Newest' },
  { value: 'title', label: 'A-Z' },
];

export const CREATE_CATEGORY_OPTIONS = [
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'romance', label: 'Romance' },
  { value: 'action', label: 'Action' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'drama', label: 'Drama' },
  { value: 'characters', label: 'Characters' },
];

export const CREATE_STATUS_OPTIONS = ['all', 'ongoing', 'completed', 'upcoming', 'hiatus', 'cancelled'];
