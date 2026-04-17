import {
  BookOpen,
  Clapperboard,
  Compass,
  ListOrdered,
  MessageCircle,
  ScrollText,
  Search,
  Users,
} from 'lucide-react';

export const SEARCH_SCOPE_TABS = [
  { id: 'all', labelKey: 'discover.scopeAll', icon: Compass },
  { id: 'titles', labelKey: 'discover.scopeTitles', icon: Search },
  { id: 'posts', labelKey: 'discover.scopePosts', icon: MessageCircle },
  { id: 'people', labelKey: 'discover.scopePeople', icon: Users },
  { id: 'tierlists', labelKey: 'discover.scopeTierlists', icon: ListOrdered },
];

export const TITLE_TYPE_TABS = [
  { id: 'all', labelKey: 'discover.typeAll', icon: Compass },
  { id: 'anime', labelKey: 'discover.typeAnime', icon: Clapperboard },
  { id: 'manga', labelKey: 'discover.typeManga', icon: BookOpen },
  { id: 'manhwa', labelKey: 'discover.typeManhwa', icon: ScrollText },
];

export const QUICK_TAGS = ['manhwa', 'action', 'romance', 'isekai', 'comedy', 'horror'];

export const SUGGESTED_SEARCHES = [
  { id: 'frieren', labelKey: 'discover.suggestionFrieren', scope: 'titles', query: 'Frieren', titleType: 'anime' },
  { id: 'action', labelKey: 'discover.suggestionAction', scope: 'titles', query: '', tag: 'action', titleType: 'all' },
  { id: 'people', labelKey: 'discover.suggestionPeople', scope: 'people', query: '', tag: '', titleType: 'all' },
  { id: 'tierlists', labelKey: 'discover.suggestionTierlists', scope: 'tierlists', query: 'romance', tag: '', titleType: 'all' },
];

export const CURATED_LANES = [
  {
    id: 'titles',
    accent: 'indigo',
    icon: BookOpen,
    titleKey: 'discover.laneTitlesTitle',
    descriptionKey: 'discover.laneTitlesDescription',
    countLabelKey: 'discover.laneTitlesCount',
    preset: { scope: 'titles', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'posts',
    accent: 'sky',
    icon: MessageCircle,
    titleKey: 'discover.lanePostsTitle',
    descriptionKey: 'discover.lanePostsDescription',
    countLabelKey: 'discover.lanePostsCount',
    preset: { scope: 'posts', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'people',
    accent: 'rose',
    icon: Users,
    titleKey: 'discover.lanePeopleTitle',
    descriptionKey: 'discover.lanePeopleDescription',
    countLabelKey: 'discover.lanePeopleCount',
    preset: { scope: 'people', query: '', tag: '', titleType: 'all' },
  },
  {
    id: 'tierlists',
    accent: 'purple',
    icon: ListOrdered,
    titleKey: 'discover.laneTierlistsTitle',
    descriptionKey: 'discover.laneTierlistsDescription',
    countLabelKey: 'discover.laneTierlistsCount',
    preset: { scope: 'tierlists', query: '', tag: '', titleType: 'all' },
  },
];

export const TITLE_PREVIEW_SIZE = 6;
export const TITLE_PAGE_SIZE = 20;
export const ENTITY_PREVIEW_LIMIT = 6;
export const ENTITY_FULL_LIMIT = 18;
export const ENTITY_FOCUSED_PREVIEW_LIMIT = 4;
export const ENTITY_FOCUSED_FULL_LIMIT = 12;

export function describeSearchPreset(preset, t) {
  if (preset?.label) return preset.label;

  const parts = [];
  const scopeTab = SEARCH_SCOPE_TABS.find((item) => item.id === preset.scope);
  const typeTab = TITLE_TYPE_TABS.find((item) => item.id === preset.titleType);

  if (preset.query) parts.push(preset.query);
  if (preset.tag) parts.push(`#${preset.tag}`);
  if (preset.scope !== 'all' && scopeTab) parts.push(t(scopeTab.labelKey));

  const isEntityScope = ['posts', 'people', 'tierlists'].includes(preset.scope);
  if (!isEntityScope && preset.titleType !== 'all' && typeTab) {
    parts.push(t(typeTab.labelKey));
  }

  return parts.join(' · ') || t('discover.scopeAll');
}
