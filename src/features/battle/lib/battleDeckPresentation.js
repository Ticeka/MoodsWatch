import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';

function getEntryUnitLabel(entityType, options = {}) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) {
    return options.singular ? 'character' : 'characters';
  }
  if (normalized === THEME_SONG_ENTITY_TYPE) {
    return options.singular ? 'song' : 'songs';
  }
  return options.singular ? 'title' : 'titles';
}

function getAnyTypeLabel(entityType) {
  const normalized = normalizeCatalogEntityType(entityType);
  if (normalized === CHARACTER_ENTITY_TYPE) {
    return 'All characters';
  }
  if (normalized === THEME_SONG_ENTITY_TYPE) {
    return 'All songs';
  }
  return 'All titles';
}

function normalizeBattleText(value) {
  return String(value || '').trim().toLowerCase();
}

function formatTrailerProviderLabel(provider, t) {
  const normalized = normalizeBattleText(provider);
  if (!normalized) {
    return t('battle.trailerPlatformUnknown');
  }
  if (normalized === 'youtube') {
    return 'YouTube';
  }
  if (normalized === 'dailymotion') {
    return 'Dailymotion';
  }
  if (normalized === 'external') {
    return t('battle.trailerPlatformExternal');
  }
  return provider[0].toUpperCase() + provider.slice(1);
}

export function getBattleDeckSubtitle(deck, t) {
  const parts = [
    deck?.filters?.type && deck.filters.type !== 'all'
      ? deck.filters.type
      : getAnyTypeLabel(deck?.filters?.entityType),
    deck?.filters?.tag ? `#${deck.filters.tag}` : '',
    deck?.filters?.mood || '',
  ];

  if (deck?.filters?.trailerState === 'has') {
    parts.push(t ? t('battle.trailerHas') : 'Has trailer');
  } else if (deck?.filters?.trailerState === 'none') {
    parts.push(t ? t('battle.trailerNone') : 'No trailer');
  }

  if (deck?.filters?.trailerProvider && deck.filters.trailerProvider !== 'all') {
    const providerLabel = t
      ? formatTrailerProviderLabel(deck.filters.trailerProvider, t)
      : deck.filters.trailerProvider;
    parts.push(t ? t('battle.trailerProviderBadge', { provider: providerLabel }) : `${providerLabel} trailer`);
  }

  return parts.filter(Boolean).join(' / ');
}

export function getBattleDeckMeta(deck) {
  const typeLabel = deck?.filters?.type && deck.filters.type !== 'all'
    ? deck.filters.type.toUpperCase()
    : getAnyTypeLabel(deck?.filters?.entityType);
  return `${typeLabel} / ${(deck?.titles?.length || 0)} ${getEntryUnitLabel(deck?.filters?.entityType)}`;
}

export function getBattleDeckEntryUnitLabel(entityType) {
  return getEntryUnitLabel(entityType);
}
