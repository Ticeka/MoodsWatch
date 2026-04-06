import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Copy, ExternalLink, Music, RotateCcw, Swords, Trash2, Play, Search, Layers, Trophy, Medal, Crown, Plus, Wand2, Sparkles, Globe, Lock } from 'lucide-react';
import { getAllTitles, getTitleBySlug, fetchTitleCharacters } from '@/features/discover/lib/recommend';
import {
  buildBattleDeck,
  buildBattleShareText,
  collectBattleFilters,
  createBattleSession,
  createStoredBattleDeck,
  dedupeBattleSessionsByRecency,
  deleteBattleSession,
  finalizeBattleSession,
  getBattlePresets,
  getBattleDecisionCount,
  getLiveBattleRanking,
  getBattleSession,
  getBattleSessionSummary,
  getStoredBattleDecks,
  getStoredBattleSessions,
  recordBattleVote,
  restartBattleSession,
  saveBattleSession,
  saveStoredBattleDeck,
  undoBattleVote,
} from '@/features/battle/lib/battleStore';
import {
  deleteRemoteBattleSession,
  deleteRemotePublicBattleDeck,
  fetchBattleCommunityRollup,
  fetchPublicBattleDecks,
  fetchRemoteBattleSession,
  fetchRemoteBattleSessions,
  persistRemoteBattleSession,
  persistRemotePublicBattleDeck,
} from '@/features/battle/lib/battleRemote';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  TRAILER_ENTITY_TYPE,
  buildThemeSongEntity,
  getCatalogEntities,
  getCatalogEntityMeta,
  getCatalogEntityName,
  isThemeSongEntity,
  isTrailerEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { supabase } from '@/shared/lib/supabase';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { normalizeTrailer } from '@/shared/lib/trailers';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterDecksForAgeGate } from '@/shared/lib/ageGate';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import { TrailerModal } from '@/shared/components/ui/TrailerModal';
import './Battle.css';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All entries' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];
const ENTITY_TYPE_OPTIONS = [
  { value: TITLE_ENTITY_TYPE, label: 'Titles' },
  { value: CHARACTER_ENTITY_TYPE, label: 'Characters' },
  { value: THEME_SONG_ENTITY_TYPE, label: 'Songs' },
  { value: TRAILER_ENTITY_TYPE, label: 'Trailers' },
];

const SIZE_OPTIONS = [8, 16, 24, 32, 48];
const RECENT_BATTLE_SESSION_LIMIT = 4;
const BATTLE_CATALOG_PAGE_SIZE = 6;
const TITLE_DRAG_MIME = 'application/x-battle-title-id';
const SLOT_DRAG_MIME = 'application/x-battle-slot-index';

function getDisplayName(title) {
  return getCatalogEntityName(title);
}

function getMetaLine(title) {
  return getCatalogEntityMeta(title);
}

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

function getBattleTrailerBadge(title, t) {
  const trailer = normalizeTrailer(title || {});
  if (!trailer) {
    return {
      tone: 'missing',
      label: t('battle.trailerNone'),
    };
  }

  return {
    tone: 'ready',
    label: t('battle.trailerProviderBadge', {
      provider: formatTrailerProviderLabel(trailer.provider || trailer.site || '', t),
    }),
  };
}

function getBattleSongRoleLabel(title) {
  return title?.theme_label || title?.role || 'Theme song';
}

function hasBattleMedia(title) {
  if (isThemeSongEntity(title)) {
    return Boolean(title?.video_url);
  }

  return Boolean(normalizeTrailer(title || {}));
}

function getBattleEntryBadges(title, t, options = {}) {
  if (!title) {
    return [];
  }

  if (isThemeSongEntity(title)) {
    const badges = [
      {
        tone: 'song',
        label: getBattleSongRoleLabel(title),
      },
      {
        tone: title.video_url ? 'ready' : 'missing',
        label: title.video_url ? 'Preview ready' : 'No preview',
      },
    ];

    if (!options.compact && title.episodes_text) {
      badges.push({
        tone: 'default',
        label: title.episodes_text,
      });
    }

    if (!options.compact && title.is_creditless) {
      badges.push({
        tone: 'song',
        label: 'Creditless',
      });
    }

    if (!options.compact && title.is_spoiler) {
      badges.push({
        tone: 'warning',
        label: 'Spoiler',
      });
    }

    if (!options.compact && title.is_nsfw) {
      badges.push({
        tone: 'warning',
        label: 'NSFW',
      });
    }

    return badges;
  }

  const trailerBadge = getBattleTrailerBadge(title, t);
  return trailerBadge ? [trailerBadge] : [];
}

function countBattleReadyMedia(titles = []) {
  return (titles || []).filter((title) => hasBattleMedia(title)).length;
}

function buildThemeSongCatalog(songRows = [], titleById = new Map()) {
  return (songRows || [])
    .map((song) => {
      const sourceTitle = titleById.get(Number(song.canonical_title_id));
      return sourceTitle ? buildThemeSongEntity(song, sourceTitle) : null;
    })
    .filter(Boolean);
}

function getActiveBattleFilterSummary(filters, t) {
  const items = [];

  if (filters.type && filters.type !== 'all') {
    items.push(filters.type[0].toUpperCase() + filters.type.slice(1));
  }

  if (filters.tag) {
    items.push(`#${filters.tag}`);
  }

  if (filters.mood) {
    items.push(filters.mood);
  }

  if (filters.query) {
    items.push(`"${filters.query}"`);
  }

  if (filters.trailerState === 'has') {
    items.push(t('battle.trailerHas'));
  } else if (filters.trailerState === 'none') {
    items.push(t('battle.trailerNone'));
  }

  if (filters.trailerProvider && filters.trailerProvider !== 'all') {
    items.push(t('battle.trailerProviderBadge', {
      provider: formatTrailerProviderLabel(filters.trailerProvider, t),
    }));
  }

  return items;
}

function normalizeBattleText(value) {
  return String(value || '').trim().toLowerCase();
}

function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
}

function buildPreparedBattleTitle(title) {
  const trailer = normalizeTrailer(title || {});
  return {
    title,
    type: title.type,
    moods: new Set((title.moods || []).map(normalizeBattleText)),
    genres: (title.genres || []).map(normalizeBattleText),
    tags: (title.tags || []).map(normalizeBattleText),
    hasTrailer: Boolean(trailer),
    trailerProvider: normalizeBattleText(trailer?.provider || trailer?.site),
    haystack: [
      title.title_en,
      title.title_th,
      title.title_native,
      title.song_title,
      title.artist_name,
      title.voice_actor_name,
      title.theme_label,
      title.episodes_text,
      title.sourceTitleName,
      title.slug,
    ].map(normalizeBattleText),
  };
}

function sortBattleTitles(titles = []) {
  return [...titles].sort((a, b) => {
    if (isThemeSongEntity(a) && isThemeSongEntity(b)) {
      const sourceTitleDiff = String(a.sourceTitleName || '').localeCompare(String(b.sourceTitleName || ''));
      if (sourceTitleDiff !== 0) return sourceTitleDiff;

      const roleDiff = String(getBattleSongRoleLabel(a)).localeCompare(String(getBattleSongRoleLabel(b)));
      if (roleDiff !== 0) return roleDiff;
    }

    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const popularityDiff = Number(b.popularity || 0) - Number(a.popularity || 0);
    if (popularityDiff !== 0) return popularityDiff;
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });
}

function matchesPreparedBattleFilters(entry, filters = {}) {
  const normalizedTag = normalizeBattleText(filters.tag);
  const normalizedMood = normalizeBattleText(filters.mood);
  const normalizedQuery = normalizeBattleText(filters.query);
  const normalizedTrailerState = normalizeBattleText(filters.trailerState);
  const normalizedTrailerProvider = normalizeBattleText(filters.trailerProvider);

  if (filters.type && filters.type !== 'all' && entry.type !== filters.type) {
    return false;
  }

  if (normalizedMood && !entry.moods.has(normalizedMood)) {
    return false;
  }

  if (normalizedTag) {
    const hasTag = entry.genres.some((genre) => genre.includes(normalizedTag)) || entry.tags.some((tag) => tag.includes(normalizedTag));
    if (!hasTag) {
      return false;
    }
  }

  if (normalizedQuery && !entry.haystack.some((value) => value.includes(normalizedQuery))) {
    return false;
  }

  if (normalizedTrailerState === 'has' && !entry.hasTrailer) {
    return false;
  }

  if (normalizedTrailerState === 'none' && entry.hasTrailer) {
    return false;
  }

  if (normalizedTrailerProvider && normalizedTrailerProvider !== 'all' && entry.trailerProvider !== normalizedTrailerProvider) {
    return false;
  }

  return true;
}

function buildEmptyDeckSlots(size) {
  return Array.from({ length: size }, () => null);
}

function createManualBattleDeck({ filters, deckName, deckSlots, sourceCount }) {
  const titles = deckSlots.filter(Boolean);
  const entityType = normalizeCatalogEntityType(filters.entityType);
  const normalizedFilters = {
    ...filters,
    entityType,
    size: deckSlots.length,
  };

  return {
    key: JSON.stringify({
      ...normalizedFilters,
      titleIds: titles.map((title) => title.id),
    }),
    fingerprint: titles
      .map((title) => Number(title?.id))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .join(':'),
    label: deckName.trim() || `Custom ${getEntryUnitLabel(entityType, { singular: true })} deck ${titles.length}/${deckSlots.length}`,
    filters: normalizedFilters,
    sourceCount,
    titles,
  };
}

function escapeSvgText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildBattleShareCardSvg(session, winner, communityWinner, rankDeltaInsights, t) {
  const decisionCount = getBattleDecisionCount(session);
  const podium = (session?.ranking || []).slice(0, 3);
  const lines = podium
    .map((title, index) => {
      const label = `${index + 1}. ${getDisplayName(title)}`;
      return `<text x="388" y="${348 + (index * 34)}" fill="#f8fafc" font-size="22" font-weight="700">${escapeSvgText(label)}</text>`;
    })
    .join('');

  const communityLine = communityWinner
    ? `<text x="388" y="474" fill="#cbd5e1" font-size="18">${escapeSvgText(t('battle.shareCardCommunityWinner', { title: getDisplayName(communityWinner) }))}</text>`
    : `<text x="388" y="474" fill="#94a3b8" font-size="18">${escapeSvgText(t('battle.shareCardCommunityPending'))}</text>`;

  const higherInsight = rankDeltaInsights?.mostHigherThanCommunity
    ? t('battle.shareCardHigherInsight', {
      title: getDisplayName(rankDeltaInsights.mostHigherThanCommunity.title),
      yourRank: rankDeltaInsights.mostHigherThanCommunity.yourRank,
      communityRank: rankDeltaInsights.mostHigherThanCommunity.communityRank,
    })
    : t('battle.shareCardHigherInsightEmpty');
  const lowerInsight = rankDeltaInsights?.mostLowerThanCommunity
    ? t('battle.shareCardLowerInsight', {
      title: getDisplayName(rankDeltaInsights.mostLowerThanCommunity.title),
      yourRank: rankDeltaInsights.mostLowerThanCommunity.yourRank,
      communityRank: rankDeltaInsights.mostLowerThanCommunity.communityRank,
    })
    : t('battle.shareCardLowerInsightEmpty');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="55%" stop-color="#1e293b" />
          <stop offset="100%" stop-color="#451a03" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fb7185" />
          <stop offset="100%" stop-color="#f59e0b" />
        </linearGradient>
        <linearGradient id="cool" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
      </defs>
      <rect width="1200" height="630" rx="36" fill="url(#bg)" />
      <circle cx="1030" cy="118" r="180" fill="rgba(251,113,133,0.18)" />
      <circle cx="134" cy="564" r="220" fill="rgba(245,158,11,0.14)" />
      <circle cx="988" cy="534" r="150" fill="rgba(56,189,248,0.12)" />
      <rect x="56" y="56" width="250" height="518" rx="28" fill="#020617" stroke="rgba(255,255,255,0.08)" />
      <image href="${escapeSvgText(getTitleArtwork(winner))}" x="56" y="56" width="250" height="518" preserveAspectRatio="xMidYMid slice" />
      <rect x="56" y="394" width="250" height="180" rx="0" fill="url(#bg)" opacity="0.82" />
      <text x="70" y="430" fill="#fbbf24" font-size="18" font-weight="800">${escapeSvgText(t('battle.shareCardTitle'))}</text>
      <text x="70" y="466" fill="#ffffff" font-size="30" font-weight="800">${escapeSvgText(getDisplayName(winner))}</text>
      <text x="70" y="498" fill="#cbd5e1" font-size="18">${escapeSvgText(getMetaLine(winner) || t('battle.catalogFallback'))}</text>
      <text x="70" y="536" fill="#e2e8f0" font-size="20">${escapeSvgText(session?.deckLabel || t('battle.shareCardDeckFallback'))}</text>

      <text x="388" y="108" fill="url(#accent)" font-size="20" font-weight="800">${escapeSvgText(t('battle.soloBattle'))}</text>
      <text x="388" y="156" fill="#ffffff" font-size="44" font-weight="800">${escapeSvgText(session?.deckLabel || t('battle.shareCardResultFallback'))}</text>
      <text x="388" y="198" fill="#cbd5e1" font-size="22">${escapeSvgText(t('battle.shareCardWinnerAfter', { count: decisionCount }))}</text>

      <rect x="388" y="236" width="230" height="84" rx="22" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.08)" />
      <text x="414" y="270" fill="#94a3b8" font-size="16">${escapeSvgText(t('battle.shareCardWinnerScore'))}</text>
      <text x="414" y="302" fill="#f8fafc" font-size="30" font-weight="800">${escapeSvgText(t('battle.points', { count: winner?.score || 0 }))}</text>

      <rect x="638" y="236" width="230" height="84" rx="22" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.08)" />
      <text x="664" y="270" fill="#94a3b8" font-size="16">${escapeSvgText(t('battle.shareCardWins'))}</text>
      <text x="664" y="302" fill="#f8fafc" font-size="30" font-weight="800">${escapeSvgText(winner?.wins || 0)}</text>

      <rect x="888" y="236" width="256" height="84" rx="22" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.08)" />
      <text x="914" y="270" fill="#94a3b8" font-size="16">${escapeSvgText(t('battle.shareCardTitlesInDeck'))}</text>
      <text x="914" y="302" fill="#f8fafc" font-size="30" font-weight="800">${escapeSvgText(session?.titles?.length || 0)}</text>

      <text x="388" y="302" fill="#94a3b8" font-size="18"></text>
      <text x="388" y="316" fill="#f8fafc" font-size="24" font-weight="700">${escapeSvgText(t('battle.shareCardTopThree'))}</text>
      ${lines}
      ${communityLine}
      <rect x="388" y="506" width="356" height="74" rx="22" fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.24)" />
      <text x="412" y="534" fill="url(#cool)" font-size="16" font-weight="800">${escapeSvgText(t('battle.shareCardTasteInsight'))}</text>
      <text x="412" y="560" fill="#e2e8f0" font-size="16">${escapeSvgText(higherInsight)}</text>

      <rect x="764" y="506" width="380" height="74" rx="22" fill="rgba(249,115,22,0.1)" stroke="rgba(249,115,22,0.24)" />
      <text x="788" y="534" fill="url(#accent)" font-size="16" font-weight="800">${escapeSvgText(t('battle.shareCardCommunityInsight'))}</text>
      <text x="788" y="560" fill="#e2e8f0" font-size="16">${escapeSvgText(lowerInsight)}</text>
      <text x="388" y="605" fill="#94a3b8" font-size="18">${escapeSvgText(t('battle.shareCardGeneratedFrom'))}</text>
    </svg>
  `.trim();
}

function formatBattleTimestamp(value) {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatRankDelta(delta, t) {
  if (!Number.isFinite(delta) || delta === 0) {
    return t('battle.sameAsCommunity');
  }

  return delta > 0
    ? t('battle.lowerThanCommunity', { count: delta })
    : t('battle.higherThanCommunity', { count: Math.abs(delta) });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mergeSessionsByRecency(localSessions = [], remoteSessions = []) {
  return dedupeBattleSessionsByRecency([...localSessions, ...remoteSessions])
    .slice(0, RECENT_BATTLE_SESSION_LIMIT);
}

function getBattleDeckSubtitle(deck, t) {
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

function getBattleDeckMeta(deck) {
  const typeLabel = deck?.filters?.type && deck.filters.type !== 'all'
    ? deck.filters.type.toUpperCase()
    : getAnyTypeLabel(deck?.filters?.entityType);
  return `${typeLabel} / ${(deck?.titles?.length || 0)} ${getEntryUnitLabel(deck?.filters?.entityType)}`;
}

function BattlePresetCard({ preset, deck, disabled, onApply }) {
  const { t } = useLanguage();
  const previewTitles = deck?.titles?.slice(0, 3) || [];
  const canStart = (deck?.titles?.length || 0) >= 8;

  return (
    <button
      type="button"
      className={`battle-preset-card glass-heavy ${!canStart ? 'is-disabled' : ''}`}
      onClick={() => onApply(preset, deck)}
      disabled={disabled}
    >
      <div className="battle-preset-art">
        {previewTitles.length > 0 ? (
          previewTitles.map((title, index) => (
            <div
              key={title.id}
              className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
            >
              <img src={getTitleArtwork(title)} alt="" loading="lazy" />
            </div>
          ))
        ) : (
          <div className="battle-preset-art-empty">
            <Play size={20} />
          </div>
        )}
      </div>
      <div className="battle-preset-head">
        <span className="battle-preset-badge">
          <Play size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          {t('battle.preset')}
        </span>
        <strong>{preset.label}</strong>
      </div>
      <p>{preset.description}</p>
      <span className="battle-preset-meta">
        {(preset.filters.type || 'all').toUpperCase()} / {t('battle.titlesReady', { count: deck?.titles?.length || 0 })}
      </span>
      <span className="battle-preset-cta">
        {disabled ? t('battle.checkingLiveDeck') : canStart ? t('battle.startInstantly') : t('battle.needMoreTitles')}
      </span>
    </button>
  );
}

function BattleSavedDeckPresetCard({ deck, disabled, onStart }) {
  const { t } = useLanguage();
  const previewTitles = deck?.titles?.slice(0, 3) || [];
  const canStart = (deck?.titles?.length || 0) >= 8;
  const ownerProfilePath = buildOwnerProfilePath(deck?.ownerUsername);
  const ownerLabel = deck?.ownerUsername || deck?.ownerDisplayName || '';
  const subtitle = getBattleDeckSubtitle(deck, t);

  return (
    <div className={`battle-preset-card glass-heavy is-static ${!canStart ? 'is-disabled' : ''}`}>
      <div className="battle-preset-art">
        {previewTitles.length > 0 ? (
          previewTitles.map((title, index) => (
            <div
              key={title.id}
              className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
            >
              <img src={getTitleArtwork(title)} alt="" loading="lazy" />
            </div>
          ))
        ) : (
          <div className="battle-preset-art-empty">
            <Play size={20} />
          </div>
        )}
      </div>
      <div className="battle-preset-head">
        <span className="battle-preset-badge">
          <Globe size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          {t('battle.publicDeck')}
        </span>
        <strong>{deck.label}</strong>
      </div>
      <p>
        {ownerLabel ? t('battle.publicDeckBy', { owner: ownerLabel }) : (subtitle || t('battle.publicDeckHint'))}
        {ownerProfilePath ? (
          <>
            {' · '}
            <Link to={ownerProfilePath} className="battle-owner-profile-link">
              {t('layout.profile')}
            </Link>
          </>
        ) : null}
      </p>
      <span className="battle-preset-meta">{getBattleDeckMeta(deck)}</span>
      <button
        type="button"
        className="battle-preset-cta"
        onClick={() => onStart(deck)}
        disabled={disabled || !canStart}
      >
        {disabled ? t('battle.checkingLiveDeck') : t('battle.startInstantly')}
      </button>
    </div>
  );
}

function BattleReadyDeckCard({ title, subtitle, deck, badge, disabled, onStart, actionLabel = '', className = '', children, variant = 'default' }) {
  const { t } = useLanguage();
  const resolvedActionLabel = actionLabel || t('battle.startBattle');
  const previewTitles = deck?.titles?.slice(0, 3) || [];
  const canStart = (deck?.titles?.length || 0) >= 8;
  const metaLabel = getBattleDeckMeta(deck);

  if (variant === 'preset') {
    return (
      <button
        type="button"
        className={`battle-preset-card glass-heavy ${!canStart ? 'is-disabled' : ''} ${className}`.trim()}
        onClick={onStart}
        disabled={disabled || !canStart}
      >
        <div className="battle-preset-art">
          {previewTitles.length > 0 ? (
            previewTitles.map((item, index) => (
              <div
                key={item.id}
                className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
              >
                <img src={getTitleArtwork(item)} alt="" loading="lazy" />
              </div>
            ))
          ) : (
            <div className="battle-preset-art-empty">
              <Play size={20} />
            </div>
          )}
        </div>
        <div className="battle-preset-head">
          <span className="battle-preset-badge">{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <span className="battle-preset-meta">{metaLabel}</span>
        <span className="battle-preset-cta">{resolvedActionLabel}</span>
      </button>
    );
  }

  return (
    <div className={`battle-deck-card glass-heavy ${!canStart ? 'is-disabled' : ''} ${className}`.trim()}>
      <div className="battle-preset-art">
        {previewTitles.length > 0 ? (
          previewTitles.map((item, index) => (
            <div
              key={item.id}
              className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
            >
              <img src={getTitleArtwork(item)} alt="" loading="lazy" />
            </div>
          ))
        ) : (
          <div className="battle-preset-art-empty">
            <Play size={20} />
          </div>
        )}
      </div>

      <div className="battle-deck-card-body">
        <div className="battle-preset-head">
          <span className="battle-preset-badge">{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <div className="battle-deck-meta-row">
          <span className="battle-preset-meta">{deck?.titles?.length || 0} {getEntryUnitLabel(deck?.filters?.entityType)} ready</span>
          <span className={`battle-visibility-pill ${deck?.isPublic ? 'is-public' : 'is-private'}`}>
            {deck?.isPublic ? <Globe size={12} /> : <Lock size={12} />}
            {deck?.isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}
          </span>
        </div>
      </div>

      <div className="battle-deck-card-actions">
        <Button onClick={onStart} disabled={disabled || !canStart} icon={<Play size={16} />}>
          {actionLabel || t('battle.startBattle')}
        </Button>
        {children}
      </div>
    </div>
  );
}

function BattlePresetCardSkeleton() {
  return (
    <div className="battle-preset-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ minHeight: '164px', borderRadius: '0' }} />
      <div className="battle-skeleton-body">
        <div className="battle-skeleton-block" style={{ height: '1.3rem', width: '38%', borderRadius: '999px' }} />
        <div className="battle-skeleton-block" style={{ height: '1.1rem', width: '82%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '92%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '68%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.78rem', width: '50%', marginTop: '0.5rem' }} />
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '62%' }} />
      </div>
    </div>
  );
}

function BattlePresetRow({ preset, deck, disabled, onApply }) {
  const { t } = useLanguage();
  const requestedSize = Number(preset?.filters?.size || 0);
  const canStart = deck ? (deck?.titles?.length || 0) >= 8 : requestedSize >= 8;
  const artTile = deck?.titles?.[0];

  return (
    <button
      type="button"
      className={`battle-preset-row${!canStart ? ' is-disabled' : ''}`}
      onClick={() => onApply(preset, deck)}
      disabled={disabled || !canStart}
    >
      <div className="battle-preset-row-art">
        {artTile ? (
          <img src={getTitleArtwork(artTile)} alt="" loading="lazy" />
        ) : (
          <Play size={16} />
        )}
      </div>
      <div className="battle-preset-row-info">
        <strong>{preset.label}</strong>
        <span>{(preset.filters.type || 'all').toUpperCase()} · {t('battle.titlesReady', { count: deck?.titles?.length || 0 })}</span>
      </div>
      <span className="battle-preset-row-cta">
        {disabled ? '···' : canStart ? t('battle.startInstantly') : t('battle.needMoreTitles')}
      </span>
    </button>
  );
}

function BattleSavedDeckRow({ deck, disabled, onStart }) {
  const { t } = useLanguage();
  const canStart = (deck?.titles?.length || 0) >= 8;
  const artTile = deck?.titles?.[0];
  const ownerLabel = deck?.ownerUsername || deck?.ownerDisplayName || '';

  return (
    <div className={`battle-preset-row${!canStart ? ' is-disabled' : ''}`}>
      <div className="battle-preset-row-art">
        {artTile ? (
          <img src={getTitleArtwork(artTile)} alt="" loading="lazy" />
        ) : (
          <Play size={16} />
        )}
      </div>
      <div className="battle-preset-row-info">
        <strong>{deck.label}</strong>
        <span>{ownerLabel ? t('battle.publicDeckBy', { owner: ownerLabel }) : getBattleDeckMeta(deck)}</span>
      </div>
      <button
        type="button"
        className="battle-preset-row-cta-btn"
        onClick={() => onStart(deck)}
        disabled={disabled || !canStart}
      >
        <Play size={13} />
        {t('battle.startInstantly')}
      </button>
    </div>
  );
}

function BattleSlotCardSkeleton() {
  return (
    <div className="battle-slot-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ width: '44px', height: '60px', borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: '0.4rem' }}>
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '72%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.75rem', width: '46%' }} />
      </div>
    </div>
  );
}

function BattleCatalogCardSkeleton() {
  return (
    <div className="battle-catalog-card-skeleton" aria-hidden="true">
      <div className="battle-skeleton-block" style={{ width: '50px', height: '70px', borderRadius: '10px', flexShrink: 0 }} />
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <div className="battle-skeleton-block" style={{ height: '0.88rem', width: '76%' }} />
        <div className="battle-skeleton-block" style={{ height: '0.75rem', width: '50%' }} />
      </div>
      <div className="battle-skeleton-block" style={{ width: '72px', height: '30px', borderRadius: '8px', flexShrink: 0 }} />
    </div>
  );
}

function BattleMatchCard({ title, trailer, voteLabel, voteIcon, onVote, onPlayTrailer }) {
  const { t } = useLanguage();

  if (!title) return null;

  const displayName = getDisplayName(title) || t('battle.catalogFallback');
  const isSong = isThemeSongEntity(title);

  // ── SONG TYPE: Inline video card ─────────────────────────────────
  if (isSong) {
    let embedUrl = null;
    let watchUrl = null;
    let isDirectVideo = false;

    if (title.video_url) {
      const rawUrl = String(title.video_url).trim();
      const normalized = normalizeTrailer({ trailer_url: rawUrl });
      embedUrl = normalized?.embedUrl || null;
      watchUrl = normalized?.watchUrl || rawUrl;
      const lower = rawUrl.toLowerCase();
      isDirectVideo = !embedUrl && (
        lower.endsWith('.mp4') || lower.endsWith('.webm') ||
        lower.includes('.mp4?') || lower.includes('.webm?')
      );
    }

    const hasSongMedia = Boolean(embedUrl || isDirectVideo || watchUrl);

    return (
      <article className="battle-card battle-card--media glass-heavy">
        <div className="battle-card-media-wrap">
          {embedUrl ? (
            <iframe
              className="battle-card-media-frame"
              src={embedUrl}
              title={displayName}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : isDirectVideo ? (
            <video
              className="battle-card-media-frame"
              src={watchUrl}
              controls
              playsInline
              preload="metadata"
            />
          ) : hasSongMedia ? (
            <div className="battle-card-media-nonembed">
              <img src={getTitleArtwork(title)} alt="" />
              <div className="battle-card-media-nonembed-overlay">
                <a href={watchUrl} target="_blank" rel="noreferrer" className="battle-card-media-open-btn">
                  <ExternalLink size={18} />
                  <span>Open Song</span>
                </a>
              </div>
            </div>
          ) : (
            <img src={getTitleArtwork(title)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div className="battle-card-info">
          <div className="battle-card-info-text">
            <span className="battle-card-song-type-badge">
              <Music size={10} />
              {getBattleSongRoleLabel(title)}
            </span>
            <h2>{displayName}</h2>
            <p className="battle-card-info-sub">
              {[title.artist_name || title.voice_actor_name, title.sourceTitleName].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Button variant="primary" icon={voteIcon} onClick={onVote}>{voteLabel}</Button>
        </div>
      </article>
    );
  }

  // ── TRAILER TYPE: Inline embed card ──────────────────────────────
  if (isTrailerEntity(title)) {
    const trailerNorm = normalizeTrailer(title);
    const embedUrl = title.trailer_embed_url || trailerNorm?.embedUrl || null;
    const watchUrl = title.trailer_watch_url || trailerNorm?.watchUrl || null;
    const thumbnailUrl = title.trailer_thumbnail_url || getTitleArtwork(title);
    const providerName = trailerNorm?.provider || title.trailer_site || 'Trailer';
    const providerBadge = String(providerName).charAt(0).toUpperCase() + String(providerName).slice(1);

    return (
      <article className="battle-card battle-card--media glass-heavy">
        <div className="battle-card-media-wrap">
          {embedUrl ? (
            <iframe
              className="battle-card-media-frame"
              src={embedUrl}
              title={displayName}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : watchUrl ? (
            <div className="battle-card-media-nonembed">
              <img src={thumbnailUrl} alt="" />
              <div className="battle-card-media-nonembed-overlay">
                <a href={watchUrl} target="_blank" rel="noreferrer" className="battle-card-media-open-btn">
                  <ExternalLink size={18} />
                  <span>ดู {providerBadge}</span>
                </a>
              </div>
            </div>
          ) : (
            <img src={thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div className="battle-card-info">
          <div className="battle-card-info-text">
            <span className="battle-card-song-type-badge">
              <Play size={10} />
              {providerBadge}
            </span>
            <h2>{displayName}</h2>
            <p className="battle-card-info-sub">{getMetaLine(title)}</p>
          </div>
          <Button variant="primary" icon={voteIcon} onClick={onVote}>{voteLabel}</Button>
        </div>
      </article>
    );
  }

  // ── TITLE / CHARACTER TYPE: Classic cover card ────────────────────
  const providerLabel = trailer?.site
    ? `${String(trailer.site).charAt(0).toUpperCase()}${String(trailer.site).slice(1)}`
    : '';

  return (
    <article className="battle-card battle-card--title glass-heavy">
      <div className="battle-card-cover">
        <img src={getTitleArtwork(title)} alt="" />
        <div className="battle-card-body">
          <small className="battle-card-meta">{getMetaLine(title)}</small>
          <h2>{displayName}</h2>
          <div className="battle-card-tags">
            {(title?.tags || []).slice(0, 3).map((tag) => (
              <span key={tag} className="battle-card-tag">{tag}</span>
            ))}
          </div>
          <Button variant="primary" icon={voteIcon} onClick={onVote}>{voteLabel}</Button>
        </div>
      </div>

      {trailer ? (
        <div className="battle-card-trailer">
          <div className="battle-card-trailer-head">
            <div className="battle-card-trailer-copy">
              <span className="battle-card-trailer-label">{t('titleDetail.metaTrailer')}</span>
              <strong className="battle-card-trailer-provider">{providerLabel || t('titleDetail.metaTrailer')}</strong>
            </div>
            <div className="battle-card-trailer-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Play size={14} />}
                className="battle-card-trailer-inline-action"
                onClick={onPlayTrailer}
                aria-label={t('titleDetail.playTrailerForTitle', { title: displayName })}
              >
                {t('titleDetail.metaTrailer')}
              </Button>
              {trailer.watchUrl ? (
                <a
                  href={trailer.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm battle-card-trailer-inline-action battle-card-trailer-link"
                >
                  <span className="btn-slot" aria-hidden="true"><ExternalLink size={14} /></span>
                  <span className="btn-text">{t('titleDetail.openTrailer')}</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function BattleHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPresetsLoading, setIsPresetsLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentSessions, setRecentSessions] = useState([]);
  const [savedDecks, setSavedDecks] = useState([]);
  const [publicDecks, setPublicDecks] = useState([]);
  const [publicDecksPage, setPublicDecksPage] = useState(0);
  const [hasNextPublicPage, setHasNextPublicPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const PUBLIC_DECK_PAGE_SIZE = 8;

  useEffect(() => {
    let cancelled = false;

    async function loadHub() {
      setIsLoading(true);
      setIsPresetsLoading(true);
      setError('');
      try {
        // Phase 1 — fast: sessions + public decks only (hub usable immediately)
        const [remoteSessions, remotePublicDecks] = await Promise.all([
          user?.id ? fetchRemoteBattleSessions(user.id).catch(() => []) : Promise.resolve([]),
          fetchPublicBattleDecks({ limit: PUBLIC_DECK_PAGE_SIZE + 1, offset: 0 }).catch(() => []),
        ]);
        if (!cancelled) {
          const localSessions = getStoredBattleSessions();
          const mergedSessions = mergeSessionsByRecency(localSessions, remoteSessions);
          mergedSessions.forEach((session) => {
            saveBattleSession(session);
          });
          setRecentSessions(getStoredBattleSessions());
          setSavedDecks(getStoredBattleDecks());
          const hasNext = remotePublicDecks.length > PUBLIC_DECK_PAGE_SIZE;
          setPublicDecks(hasNext ? remotePublicDecks.slice(0, PUBLIC_DECK_PAGE_SIZE) : remotePublicDecks);
          setHasNextPublicPage(hasNext);
          setPublicDecksPage(0);
          setIsLoading(false);
        }

        // Phase 2 — background: full catalog for preset deck building
        const allTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
        if (!cancelled) {
          setTitles(allTitles);
          setIsPresetsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t('battle.loadCatalogFailed'));
          setRecentSessions(getStoredBattleSessions());
          setSavedDecks(getStoredBattleDecks());
          setPublicDecks([]);
          setHasNextPublicPage(false);
          setIsLoading(false);
          setIsPresetsLoading(false);
        }
      }
    }

    loadHub();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handlePublicDecksPage = async (newPage) => {
    if (isLoadingMore || newPage < 0) return;
    setIsLoadingMore(true);
    try {
      const fetched = await fetchPublicBattleDecks({
        limit: PUBLIC_DECK_PAGE_SIZE + 1,
        offset: newPage * PUBLIC_DECK_PAGE_SIZE,
      });
      const hasNext = fetched.length > PUBLIC_DECK_PAGE_SIZE;
      setPublicDecks(hasNext ? fetched.slice(0, PUBLIC_DECK_PAGE_SIZE) : fetched);
      setHasNextPublicPage(hasNext);
      setPublicDecksPage(newPage);
    } catch {
      // silently fail — page stays
    } finally {
      setIsLoadingMore(false);
    }
  };

  const deckOptions = useMemo(() => ({
    hiddenTitleIds,
    excludeAdult: !showAdult,
    onlyAdult: showAdult,
  }), [hiddenTitleIds, showAdult]);
  const visibleCatalogTitles = useMemo(
    () => titles.filter((title) => !hiddenTitleIds.includes(title.id) && (showAdult ? title.is_adult : !title.is_adult)),
    [hiddenTitleIds, showAdult, titles]
  );
  const visibleCharacterCatalog = useMemo(
    () => getCatalogEntities(visibleCatalogTitles, CHARACTER_ENTITY_TYPE),
    [visibleCatalogTitles]
  );
  const titleLookup = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );
  const hiddenExcludedCount = Math.max(0, titles.length - visibleCatalogTitles.length);
  const deferredCatalogTitlesForPresets = useDeferredValue(visibleCatalogTitles);
  const isComputingPresets = deferredCatalogTitlesForPresets !== visibleCatalogTitles;
  const presets = useMemo(() => getBattlePresets(), []);
  const presetDecks = useMemo(
    () => presets.map((preset) => ({
      preset,
      deck: buildBattleDeck(deferredCatalogTitlesForPresets, { ...preset.filters, label: preset.label }, deckOptions),
    })),
    [deckOptions, presets, deferredCatalogTitlesForPresets]
  );

  const readyPresetDecks = useMemo(
    () => presetDecks.filter(({ deck }) => (deck?.titles?.length || 0) >= 8),
    [presetDecks]
  );
  const readySavedDecks = useMemo(
    () => savedDecks.filter((deck) => (deck?.titles?.length || 0) >= 8),
    [savedDecks]
  );
  const publicSavedDecks = useMemo(() => {
    const readyLocalDeckMap = new Map(
      readySavedDecks
        .filter((deck) => deck.isPublic)
        .map((deck) => [deck.id, deck])
    );

    const mergedDecks = [...publicDecks];
    readyLocalDeckMap.forEach((deck, deckId) => {
      if (!mergedDecks.some((entry) => entry.id === deckId)) {
        mergedDecks.unshift(deck);
      }
    });

    const visibleDecks = filterDecksForAgeGate(mergedDecks, showAdult, titleLookup);
    return visibleDecks.filter((deck) => (deck?.titles?.length || deck?.titleIds?.length || 0) >= 8);
  }, [publicDecks, readySavedDecks, showAdult, titleLookup]);

  const startBattle = async (deck) => {
    if ((deck?.titles?.length || 0) < 8) {
      toast.error(t('battle.needAtLeastEight'));
      return;
    }

    let session = saveBattleSession(createBattleSession(deck, {
      catalogCount: normalizeCatalogEntityType(deck?.filters?.entityType) === CHARACTER_ENTITY_TYPE
        ? visibleCharacterCatalog.length
        : normalizeCatalogEntityType(deck?.filters?.entityType) === THEME_SONG_ENTITY_TYPE
          ? Number(deck?.sourceCount || deck?.titles?.length || 0)
          : normalizeCatalogEntityType(deck?.filters?.entityType) === TRAILER_ENTITY_TYPE
            ? Number(deck?.sourceCount || deck?.titles?.length || 0)
            : visibleCatalogTitles.length,
      hiddenExcludedCount,
      excludesAdultContent: !showAdult,
    }));
    if (user?.id) {
      try {
        session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
      } catch (saveError) {
        console.warn('Failed to persist battle session remotely', saveError);
        toast.error(t('battle.savedLocalCloudFailed'));
      }
    }
    navigate(`/battle/${session.id}`);
  };

  const handleApplyPreset = async (presetDeck) => {
    await startBattle(presetDeck);
  };

  const _handleDeleteRecent = async (sessionId) => {
    deleteBattleSession(sessionId);
    if (user?.id) {
      try {
        await deleteRemoteBattleSession(user.id, sessionId);
      } catch (deleteError) {
        console.warn('Failed to delete remote battle session', deleteError);
      }
    }
    setRecentSessions(getStoredBattleSessions());
  };

  return (
    <div className="battle-page">
      {/* ── Compact Header ── */}
      <div className="battle-hub-header-wrap">
      <div className="battle-hub-header container">
        <div className="battle-hub-header-content">
          <div>
            <h1 className="battle-hub-title">
              <Swords size={20} />
              {t('battle.heroTitle')}
            </h1>
            <p className="battle-hub-subtitle">{t('battle.heroSubtitle')}</p>
          </div>
          <div className="battle-hub-header-actions">
            <Link className="btn btn-primary" to="/battle/build">
              <Plus size={15} />
              {t('battle.buildDeck')}
            </Link>
            <Link className="btn btn-secondary" to="/battle/decks">
              <Layers size={15} />
              {t('battle.manageDecks')}
            </Link>
          </div>
        </div>
        {!isLoading && (
          <div className="battle-hub-stats">
            <span><Layers size={12} /> {publicSavedDecks.length + (isPresetsLoading ? 0 : readyPresetDecks.length)} {t('battle.readyDecks')}</span>
            <span><Swords size={12} /> {recentSessions.length} {t('battle.savedRuns')}</span>
            {!isPresetsLoading && (
              <span><Play size={12} /> {visibleCatalogTitles.length} {t('battle.visibleCatalogTitles')}</span>
            )}
          </div>
        )}
      </div>
      </div>

      {/* ── Quick Nav Pills ── */}
      <div className="container battle-hub-nav">
        <Link to="/battle/daily" className="battle-hub-nav-item">
          <CalendarDays size={15} />
          {t('dailyChallenge.todayTheme')}
        </Link>
        <Link to="/battle/leaderboard" className="battle-hub-nav-item">
          <Trophy size={15} />
          {t('leaderboard.title')}
        </Link>
      </div>

      {/* ── Quick Presets ── */}
      <div className="container battle-hub-section">
        <h2 className="battle-hub-section-title">{t('battle.quickPresets')}</h2>
        {isPresetsLoading || isComputingPresets ? (
          <div className="battle-preset-list">
            {[0, 1, 2, 3].map((i) => <div key={i} className="battle-preset-row-skeleton battle-skeleton-block" />)}
          </div>
        ) : readyPresetDecks.length === 0 ? (
          <p className="battle-hub-empty">{t('battle.noPresetReady')}</p>
        ) : (
          <div className="battle-preset-list">
            {readyPresetDecks.map(({ preset, deck }) => (
              <BattlePresetRow
                key={preset.id}
                preset={preset}
                deck={deck}
                disabled={isPresetsLoading}
                onApply={(_, readyDeck) => handleApplyPreset(readyDeck)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Public Decks ── */}
      <div className="container battle-hub-section">
        <div className="battle-hub-section-header">
          <h2 className="battle-hub-section-title">{t('battle.publicDecks')}</h2>
          {(publicDecksPage > 0 || hasNextPublicPage) && !isLoading && (
            <div className="battle-hub-pagination">
              <button
                type="button"
                className="battle-hub-page-btn"
                onClick={() => handlePublicDecksPage(publicDecksPage - 1)}
                disabled={publicDecksPage === 0 || isLoadingMore}
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="battle-hub-page-label">{publicDecksPage + 1}</span>
              <button
                type="button"
                className="battle-hub-page-btn"
                onClick={() => handlePublicDecksPage(publicDecksPage + 1)}
                disabled={!hasNextPublicPage || isLoadingMore}
                aria-label="หน้าถัดไป"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="battle-preset-list">
            {[0, 1, 2].map((i) => <div key={i} className="battle-preset-row-skeleton battle-skeleton-block" />)}
          </div>
        ) : publicSavedDecks.length === 0 ? (
          <p className="battle-hub-empty">
            {t('battle.noPublicDeck')} <Link to="/battle/decks" className="battle-hub-empty-link">{t('battle.manageDecks')}</Link>
          </p>
        ) : (
          <div className={`battle-preset-list${isLoadingMore ? ' is-paging' : ''}`}>
            {publicSavedDecks.map((deck) => (
              <BattleSavedDeckRow
                key={deck.id}
                deck={deck}
                disabled={isLoading || Boolean(error)}
                onStart={startBattle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BattleBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { hiddenTitleIds } = useHiddenTitles();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [songCatalog, setSongCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [songCatalogError, setSongCatalogError] = useState('');
  const [characterMap, setCharacterMap] = useState(new Map());
  const fetchedCharTypesRef = React.useRef(new Set());
  const [deckName, setDeckName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [filters, setFilters] = useState({
    entityType: TITLE_ENTITY_TYPE,
    type: 'all',
    tag: '',
    mood: '',
    query: '',
    trailerState: 'all',
    trailerProvider: 'all',
    size: 16,
  });
  const [deckSlots, setDeckSlots] = useState(() => buildEmptyDeckSlots(16));
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [editingDeck, setEditingDeck] = useState(null);
  const [hasLoadedEditDeck, setHasLoadedEditDeck] = useState(false);
  const deferredFilters = useDeferredValue(filters);
  const editDeckId = searchParams.get('deckId');
  const songTitleSlug = searchParams.get('songTitleSlug');

  // Song battle mode: auto-fetch songs for a title and start a battle session
  useEffect(() => {
    if (!songTitleSlug) return undefined;
    let cancelled = false;

    async function startSongBattle() {
      setIsLoading(true);
      setError('');
      try {
        const sourceTitle = await getTitleBySlug(songTitleSlug);
        if (cancelled) return;
        if (!sourceTitle) {
          setError('ไม่พบชื่อเรื่องนี้ / Title not found');
          setIsLoading(false);
          return;
        }

        const { data: songData, error: songError } = await supabase
          .from('title_theme_songs')
          .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
          .eq('canonical_title_id', sourceTitle.id)
          .order('display_order');

        if (cancelled) return;
        if (songError || !songData || songData.length < 2) {
          setError('เพลงไม่เพียงพอสำหรับ Battle (ต้องมีอย่างน้อย 2 เพลง) / Not enough songs for battle (need at least 2)');
          setIsLoading(false);
          return;
        }

        const songEntities = songData.map((song) => buildThemeSongEntity(song, sourceTitle));
        const titleName = sourceTitle.title_th || sourceTitle.title_en || sourceTitle.title_native || 'Songs';
        const deck = {
          key: `song-battle:${sourceTitle.id}`,
          fingerprint: songEntities.map((s) => s.id).sort((a, b) => a - b).join(':'),
          label: `เพลงจาก ${titleName}`,
          filters: { entityType: THEME_SONG_ENTITY_TYPE, size: songEntities.length },
          titles: songEntities,
          sourceCount: songEntities.length,
        };

        let session = saveBattleSession(createBattleSession(deck, {}));
        if (user?.id) {
          try {
            session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
          } catch (saveError) {
            console.warn('Failed to persist song battle session remotely', saveError);
          }
        }
        if (!cancelled) {
          navigate(`/battle/${session.id}`);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to start song battle');
          setIsLoading(false);
        }
      }
    }

    startSongBattle();
    return () => { cancelled = true; };
  }, [songTitleSlug, user?.id, navigate]);

  useEffect(() => {
    if (songTitleSlug) return undefined;
    let cancelled = false;

    async function loadTitles() {
      setIsLoading(true);
      setError('');
      setSongCatalogError('');
      try {
        const allTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
        const titleById = new Map(allTitles.map((title) => [Number(title.id), title]));
        let nextSongCatalog = [];
        let nextSongCatalogError = '';

        try {
          const { data: songRows, error: songLoadError } = await supabase
            .from('title_theme_songs')
            .select('id, canonical_title_id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
            .order('canonical_title_id')
            .order('display_order');

          if (songLoadError) {
            throw songLoadError;
          }

          nextSongCatalog = buildThemeSongCatalog(songRows, titleById);
        } catch (loadSongError) {
          nextSongCatalogError = loadSongError?.message || 'Failed to load songs catalog';
        }

        if (!cancelled) {
          setTitles(allTitles);
          setSongCatalog(nextSongCatalog);
          setSongCatalogError(nextSongCatalogError);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t('battle.loadCatalogFailed'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadTitles();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazy-load characters only for titles matching the current entity/type filter
  useEffect(() => {
    if (filters.entityType !== CHARACTER_ENTITY_TYPE) return;
    if (titles.length === 0) return;

    const fetchKey = filters.type === 'all' ? 'all' : (filters.type || 'all');
    if (fetchedCharTypesRef.current.has(fetchKey)) return;
    fetchedCharTypesRef.current.add(fetchKey);

    let cancelled = false;
    const titleIds = fetchKey === 'all'
      ? titles.map((t) => t.id)
      : titles.filter((t) => t.type === fetchKey).map((t) => t.id);

    fetchTitleCharacters(titleIds).then((characterRows) => {
      if (cancelled) return;
      setCharacterMap((prev) => {
        const next = new Map(prev);
        for (const row of characterRows) {
          const id = Number(row.canonical_title_id);
          if (!next.has(id)) next.set(id, []);
          next.get(id).push(row);
        }
        return next;
      });
    }).catch(() => {
      fetchedCharTypesRef.current.delete(fetchKey);
    });

    return () => { cancelled = true; };
  }, [filters.entityType, filters.type, titles.length]);

  const hiddenTitleIdSet = useMemo(
    () => new Set(hiddenTitleIds),
    [hiddenTitleIds]
  );
  const titlesWithCharacters = useMemo(
    () => characterMap.size === 0 ? titles : titles.map((t) => ({
      ...t,
      characters: (characterMap.get(Number(t.id)) || [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    })),
    [titles, characterMap]
  );
  const isSongEntity = filters.entityType === THEME_SONG_ENTITY_TYPE;
  const visibleCatalogTitles = useMemo(
    () => titlesWithCharacters.filter((title) => !hiddenTitleIdSet.has(title.id) && (showAdult ? title.is_adult : !title.is_adult)),
    [hiddenTitleIdSet, showAdult, titlesWithCharacters]
  );
  const visibleSongCatalog = useMemo(
    () => songCatalog.filter((song) => !hiddenTitleIdSet.has(Number(song.sourceTitleId || 0)) && (showAdult ? song.is_adult : !song.is_adult)),
    [hiddenTitleIdSet, showAdult, songCatalog]
  );
  const visibleCatalogEntries = useMemo(
    () => (isSongEntity ? visibleSongCatalog : getCatalogEntities(visibleCatalogTitles, filters.entityType)),
    [filters.entityType, isSongEntity, visibleCatalogTitles, visibleSongCatalog]
  );
  const allCatalogEntries = useMemo(
    () => (isSongEntity ? songCatalog : getCatalogEntities(titlesWithCharacters, filters.entityType)),
    [filters.entityType, isSongEntity, songCatalog, titlesWithCharacters]
  );
  const hiddenExcludedCount = Math.max(0, allCatalogEntries.length - visibleCatalogEntries.length);
  const filterOptions = useMemo(() => collectBattleFilters(visibleCatalogEntries), [visibleCatalogEntries]);
  const preparedCatalogTitles = useMemo(
    () => visibleCatalogEntries.map(buildPreparedBattleTitle),
    [visibleCatalogEntries]
  );
  const filteredCatalogTitles = useMemo(
    () => sortBattleTitles(
      preparedCatalogTitles
        .filter((entry) => matchesPreparedBattleFilters(entry, deferredFilters))
        .map((entry) => entry.title)
    ),
    [deferredFilters, preparedCatalogTitles]
  );
  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalogTitles.length / BATTLE_CATALOG_PAGE_SIZE));
  const previewCatalogTitles = useMemo(() => {
    const start = catalogPage * BATTLE_CATALOG_PAGE_SIZE;
    return filteredCatalogTitles.slice(start, start + BATTLE_CATALOG_PAGE_SIZE);
  }, [catalogPage, filteredCatalogTitles]);
  const tagOptions = useMemo(
    () => [...new Set([...filterOptions.genres, ...filterOptions.tags])].slice(0, 80),
    [filterOptions.genres, filterOptions.tags]
  );
  const trailerProviderOptions = useMemo(
    () => filterOptions.trailerProviders || [],
    [filterOptions.trailerProviders]
  );
  const battleDeck = useMemo(
    () => createManualBattleDeck({
      filters,
      deckName,
      deckSlots,
      sourceCount: filteredCatalogTitles.length,
    }),
    [deckName, deckSlots, filteredCatalogTitles.length, filters]
  );
  const selectedTitleIds = useMemo(
    () => new Set(deckSlots.filter(Boolean).map((title) => title.id)),
    [deckSlots]
  );
  const filledSlotCount = battleDeck.titles.length;
  const filteredReadyMediaCount = useMemo(
    () => countBattleReadyMedia(filteredCatalogTitles),
    [filteredCatalogTitles]
  );
  const deckReadyMediaCount = useMemo(
    () => countBattleReadyMedia(battleDeck.titles),
    [battleDeck.titles]
  );
  const activeFilterSummary = useMemo(
    () => getActiveBattleFilterSummary(filters, t),
    [filters, t]
  );
  const catalogError = error || (isSongEntity ? songCatalogError : '');
  const mediaResultsLabel = isSongEntity ? 'Songs with preview' : t('battle.trailersInResults');
  const mediaDeckLabel = isSongEntity ? 'Songs with preview in deck' : t('battle.trailersInDeck');
  const firstEmptySlotIndex = useMemo(
    () => deckSlots.findIndex((title) => !title),
    [deckSlots]
  );
  const titleById = useMemo(
    () => new Map(visibleCatalogEntries.map((title) => [String(title.id), title])),
    [visibleCatalogEntries]
  );
  const titleByAnyId = useMemo(
    () => new Map(allCatalogEntries.map((title) => [String(title.id), title])),
    [allCatalogEntries]
  );

  useEffect(() => {
    if (!editDeckId) {
      setEditingDeck(null);
      setHasLoadedEditDeck(false);
      return;
    }

    const stored = getStoredBattleDecks().find((deck) => deck.id === editDeckId) || null;
    setEditingDeck(stored);
    setHasLoadedEditDeck(false);
  }, [editDeckId]);

  useEffect(() => {
    if (!editingDeck || hasLoadedEditDeck || allCatalogEntries.length === 0) {
      return;
    }

    const nextSize = Number(editingDeck.filters?.size || editingDeck.titles?.length || 16);
    const normalizedSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 16;
    const nextFilters = {
      entityType: normalizeCatalogEntityType(editingDeck.filters?.entityType),
      type: editingDeck.filters?.type || 'all',
      tag: editingDeck.filters?.tag || '',
      mood: editingDeck.filters?.mood || '',
      query: '',
      trailerState: editingDeck.filters?.trailerState || 'all',
      trailerProvider: editingDeck.filters?.trailerProvider || 'all',
      size: normalizedSize,
    };

    const nextSlots = buildEmptyDeckSlots(normalizedSize);
    (editingDeck.titles || []).forEach((entry, index) => {
      const resolved = titleByAnyId.get(String(entry.id)) || entry;
      if (index < nextSlots.length) {
        nextSlots[index] = resolved;
      }
    });

    setDeckName(editingDeck.label || '');
    setIsPublic(Boolean(editingDeck.isPublic));
    setFilters(nextFilters);
    setDeckSlots(nextSlots);
    setActiveSlotIndex(0);
    setHasLoadedEditDeck(true);
  }, [allCatalogEntries.length, editingDeck, hasLoadedEditDeck, titleByAnyId]);

  useEffect(() => {
    setDeckSlots((current) => {
      if (current.length === filters.size) {
        return current;
      }

      const next = current.slice(0, filters.size);
      while (next.length < filters.size) {
        next.push(null);
      }
      return next;
    });
  }, [filters.size]);

  useEffect(() => {
    if (activeSlotIndex >= deckSlots.length) {
      setActiveSlotIndex(Math.max(0, deckSlots.length - 1));
    }
  }, [activeSlotIndex, deckSlots.length]);

  useEffect(() => {
    setCatalogPage(0);
  }, [deferredFilters, visibleCatalogEntries.length]);

  useEffect(() => {
    if (catalogPage > totalCatalogPages - 1) {
      setCatalogPage(Math.max(0, totalCatalogPages - 1));
    }
  }, [catalogPage, totalCatalogPages]);

  const assignTitleToSlot = (title, preferredIndex = 0) => {
    if (!title) {
      return false;
    }

    const existingIndex = deckSlots.findIndex((entry) => entry?.id === title.id);
    if (existingIndex >= 0) {
      setActiveSlotIndex(existingIndex);
      return true;
    }

    const normalizedIndex = Math.min(Math.max(preferredIndex, 0), deckSlots.length - 1);
    const candidateIndexes = [
      normalizedIndex,
      ...deckSlots.map((_, index) => index).filter((index) => index !== normalizedIndex),
    ];
    const emptyIndex = candidateIndexes.find((index) => !deckSlots[index]);

    if (emptyIndex == null) {
      toast.error(t('battle.deckFull'));
      return false;
    }

    setDeckSlots((current) => current.map((entry, index) => (index === emptyIndex ? title : entry)));
    setActiveSlotIndex(emptyIndex);
    return true;
  };

  const handleAutoFillDeck = () => {
    const nextSlots = buildEmptyDeckSlots(filters.size);
    filteredCatalogTitles.slice(0, filters.size).forEach((title, index) => {
      nextSlots[index] = title;
    });
    setDeckSlots(nextSlots);
    setActiveSlotIndex(0);
  };

  const handleClearDeck = () => {
    setDeckSlots(buildEmptyDeckSlots(filters.size));
    setActiveSlotIndex(0);
  };

  const handleEntityTypeChange = (nextEntityType) => {
    const normalizedEntityType = normalizeCatalogEntityType(nextEntityType);
    setFilters((current) => ({
      ...current,
      entityType: normalizedEntityType,
      type: 'all',
      tag: '',
      mood: '',
      query: '',
      trailerState: 'all',
      trailerProvider: 'all',
    }));
    setDeckSlots(buildEmptyDeckSlots(filters.size));
    setActiveSlotIndex(0);
    setCatalogPage(0);
  };

  const handleRemoveFromSlot = (slotIndex) => {
    setDeckSlots((current) => current.map((entry, index) => (index === slotIndex ? null : entry)));
    setActiveSlotIndex(slotIndex);
  };

  const handleDropOnSlot = (event, slotIndex) => {
    event.preventDefault();
    setDragOverSlotIndex(null);

    const draggedSlotIndex = event.dataTransfer.getData(SLOT_DRAG_MIME);
    if (draggedSlotIndex !== '') {
      const sourceIndex = Number(draggedSlotIndex);
      if (Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < deckSlots.length && sourceIndex !== slotIndex) {
        setDeckSlots((current) => {
          const next = [...current];
          [next[sourceIndex], next[slotIndex]] = [next[slotIndex], next[sourceIndex]];
          return next;
        });
        setActiveSlotIndex(slotIndex);
      }
      return;
    }

    const draggedTitleId = event.dataTransfer.getData(TITLE_DRAG_MIME);
    if (!draggedTitleId) {
      return;
    }

    const title = titleById.get(String(draggedTitleId));
    if (!title) {
      return;
    }

    const existingIndex = deckSlots.findIndex((entry) => entry?.id === title.id);
    if (existingIndex >= 0 && existingIndex !== slotIndex) {
      setDeckSlots((current) => {
        const next = [...current];
        next[existingIndex] = current[slotIndex];
        next[slotIndex] = title;
        return next;
      });
      setActiveSlotIndex(slotIndex);
      return;
    }

    setDeckSlots((current) => current.map((entry, index) => (index === slotIndex ? title : entry)));
    setActiveSlotIndex(slotIndex);
  };

  const saveDeck = async ({ startAfterSave = false } = {}) => {
    if (battleDeck.titles.length < 8) {
      toast.error(`Only ${battleDeck.titles.length} ${getEntryUnitLabel(filters.entityType)} match right now.`);
      return;
    }

    if (isPublic && !user?.id) {
      toast.error(t('battle.loginToPublishDeck'));
      return;
    }

    setIsSaving(true);
    try {
      const baseDeck = createStoredBattleDeck({
        ...battleDeck,
        label: deckName.trim() || battleDeck.label,
        isPublic,
      });
      let storedDeck = saveStoredBattleDeck({
        ...baseDeck,
        id: editingDeck?.id || baseDeck.id,
        createdAt: editingDeck?.createdAt || baseDeck.createdAt,
      });

      if (editingDeck?.isPublic && !storedDeck.isPublic && user?.id) {
        try {
          await deleteRemotePublicBattleDeck(user.id, storedDeck.id);
        } catch (publishError) {
          console.warn('Failed to unpublish public battle deck', publishError);
        }
      }

      if (storedDeck.isPublic && user?.id) {
        try {
          await persistRemotePublicBattleDeck(user, storedDeck);
        } catch (publishError) {
          console.warn('Failed to persist public battle deck remotely', publishError);
          storedDeck = saveStoredBattleDeck({
            ...storedDeck,
            isPublic: false,
          });
          toast.error(t('battle.publishDeckFailed'));
        }
      }

      if (startAfterSave) {
        let session = saveBattleSession(createBattleSession(storedDeck, {
          catalogCount: visibleCatalogEntries.length,
          hiddenExcludedCount,
          excludesAdultContent: !showAdult,
        }));
        if (user?.id) {
          try {
            session = saveBattleSession(await persistRemoteBattleSession(user.id, session));
          } catch (saveError) {
            console.warn('Failed to persist battle session remotely', saveError);
            toast.error(t('battle.startAfterSaveFailed'));
          }
        }
        toast.success(t('battle.deckSavedAndStarted'));
        navigate(`/battle/${session.id}`);
        return;
      }

      toast.success(t('battle.deckSaved'));
      navigate(storedDeck.isPublic ? '/battle' : '/battle/decks');
    } finally {
      setIsSaving(false);
    }
  };

  if (songTitleSlug) {
    return (
      <div className="battle-page">
        <section className="container battle-section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div className="glass-heavy battle-empty-state">
              <Music size={28} style={{ opacity: 0.4 }} />
              <strong>{error}</strong>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                ← กลับ / Back
              </button>
            </div>
          ) : (
            <div className="glass-heavy battle-empty-state">
              <Music size={28} style={{ opacity: 0.6 }} />
              <strong>กำลังเตรียม Song Battle... / Preparing Song Battle...</strong>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="battle-page">
      <section className="container battle-hero battle-builder-hero">
        <div className="battle-hero-copy">
          <span className="battle-kicker"><Wand2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.builderKicker')}</span>
          <h1><Sparkles size={18} style={{ display: 'inline', color: 'var(--primary-500)', verticalAlign: 'middle', marginRight: '0.28rem' }} /> {t('battle.builderHeroTitle')}</h1>
          <p>{t('battle.builderHeroSubtitle')}</p>
        </div>
        <div className="battle-hero-panel glass-heavy">
          <div className="battle-hero-stat">
            <strong>{filledSlotCount}</strong>
            <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {getEntryUnitLabel(filters.entityType)} in deck</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{visibleCatalogEntries.length}</strong>
            <span><Play size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> visible {getEntryUnitLabel(filters.entityType)}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{hiddenExcludedCount}</strong>
            <span><Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.excludedByVisibility')}</span>
          </div>
        </div>
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.buildDeckTitle')}</h2>
          <p>{t('battle.buildDeckHint')}</p>
        </div>

        <div className="battle-builder-stack">
          <div className="battle-builder-toolbar glass-heavy">
            <label className="battle-field">
              <span>{t('battle.deckName')}</span>
              <input
                value={deckName}
                onChange={(event) => setDeckName(event.target.value)}
                placeholder={t('battle.deckNamePlaceholder')}
              />
            </label>

            <label className="battle-field battle-checkbox-field">
              <span>{t('battle.visibility')}</span>
              <button
                type="button"
                className={`battle-visibility-toggle ${isPublic ? 'is-public' : 'is-private'}`}
                onClick={() => setIsPublic((current) => !current)}
                aria-pressed={isPublic}
              >
                <span className="battle-visibility-toggle-copy">
                  {isPublic ? <Globe size={15} /> : <Lock size={15} />}
                  <strong>{isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}</strong>
                </span>
              </button>
            </label>

            <label className="battle-field">
              <span>Catalog</span>
              <select value={filters.entityType} onChange={(event) => handleEntityTypeChange(event.target.value)}>
                {ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.type')}</span>
              <select
                value={filters.type}
                onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
                disabled={isSongEntity}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'all' ? getAnyTypeLabel(filters.entityType) : option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span><Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.tagGenre')}</span>
              <select
                value={filters.tag}
                onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}
                disabled={isSongEntity}
              >
                <option value="">{t('battle.anyTagGenre')}</option>
                {tagOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.mood')}</span>
              <select
                value={filters.mood}
                onChange={(event) => setFilters((current) => ({ ...current, mood: event.target.value }))}
                disabled={isSongEntity}
              >
                <option value="">{t('battle.anyMood')}</option>
                {filterOptions.moods.map((mood) => (
                  <option key={mood} value={mood}>{mood}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.search')}</span>
              <input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder={t('battle.searchPlaceholder')}
              />
            </label>

            <label className="battle-field">
              <span>{t('battle.trailerStatus')}</span>
              <select
                value={filters.trailerState}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  trailerState: event.target.value,
                  trailerProvider: event.target.value === 'none' ? 'all' : current.trailerProvider,
                }))}
                disabled={filters.entityType !== TITLE_ENTITY_TYPE}
              >
                <option value="all">{t('battle.anyTrailerStatus')}</option>
                <option value="has">{t('battle.trailerHas')}</option>
                <option value="none">{t('battle.trailerNone')}</option>
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.trailerPlatform')}</span>
              <select
                value={filters.trailerProvider}
                onChange={(event) => setFilters((current) => ({ ...current, trailerProvider: event.target.value }))}
                disabled={filters.entityType !== TITLE_ENTITY_TYPE || filters.trailerState === 'none'}
              >
                <option value="all">{t('battle.anyTrailerPlatform')}</option>
                {trailerProviderOptions.map((provider) => (
                  <option key={provider} value={provider}>
                    {formatTrailerProviderLabel(provider, t)}
                  </option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.deckSize')}</span>
              <select value={filters.size} onChange={(event) => setFilters((current) => ({ ...current, size: Number(event.target.value) }))}>
                {SIZE_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value} {getEntryUnitLabel(filters.entityType)}</option>
                ))}
              </select>
            </label>

            <div className="battle-builder-actions battle-builder-toolbar-actions">
              <Button variant="ghost" onClick={handleAutoFillDeck} disabled={isLoading || Boolean(catalogError) || filteredCatalogTitles.length === 0}>
                {t('battle.fillFromFilters')}
              </Button>
              <Button variant="ghost" onClick={handleClearDeck} disabled={isLoading}>
                {t('battle.clearDeck')}
              </Button>
              <Link className="btn btn-ghost" to="/battle">{t('battle.backToBattle')}</Link>
              <Button variant="secondary" onClick={() => saveDeck()} disabled={isLoading || isSaving || Boolean(catalogError)}>
                {t('battle.saveDeck')}
              </Button>
              <Button onClick={() => saveDeck({ startAfterSave: true })} disabled={isLoading || isSaving || Boolean(catalogError)}>
                {t('battle.saveAndStart')}
              </Button>
            </div>
          </div>

          <div className="battle-builder-summary">
            <div className="battle-builder-summary-card">
              <span>{t('battle.filteredResults')}</span>
              <strong>{filteredCatalogTitles.length}</strong>
              <small>{t('battle.builderSummaryHint')}</small>
            </div>
            <div className="battle-builder-summary-card">
              <span>{mediaResultsLabel}</span>
              <strong>{filteredReadyMediaCount}</strong>
              <small>{t('battle.builderSummaryHint')}</small>
            </div>
            <div className="battle-builder-summary-card">
              <span>{mediaDeckLabel}</span>
              <strong>{deckReadyMediaCount}</strong>
              <small>{t('battle.deckComposition', { count: filledSlotCount, size: deckSlots.length })}</small>
            </div>
          </div>

          <div className="battle-builder-filter-summary glass-heavy">
            <span className="battle-builder-filter-summary-label">{t('battle.filterSummary')}</span>
            <div className="battle-builder-filter-chip-row">
              {activeFilterSummary.length > 0 ? activeFilterSummary.map((item) => (
                <span key={item} className="battle-builder-filter-chip">{item}</span>
              )) : (
                <span className="battle-builder-filter-chip is-muted">{t('battle.filterSummaryEmpty')}</span>
              )}
            </div>
          </div>

          <div className="battle-builder-grid">
            <div className="battle-builder-preview glass-heavy">
              <div className="battle-preview-head">
                <strong>{deckName.trim() || battleDeck.label}</strong>
                <span>{t('battle.deckComposition', { count: filledSlotCount, size: deckSlots.length })}</span>
              </div>
              {isLoading ? (
                <div className="battle-slot-focus">
                  <div className="battle-slot-scroller">
                    {Array.from({ length: 8 }).map((_, i) => <BattleSlotCardSkeleton key={i} />)}
                  </div>
                </div>
              ) : catalogError ? (
                <p>{catalogError}</p>
              ) : (
                <div className="battle-slot-focus">
                  <div className="battle-slot-scroller">
                    {deckSlots.map((title, index) => (
                      <div
                        key={`slot-${index}`}
                        className={`battle-slot-card ${title ? 'is-filled' : 'is-empty'} ${dragOverSlotIndex === index ? 'is-drag-over' : ''} ${activeSlotIndex === index ? 'is-active' : ''}`}
                        onClick={() => setActiveSlotIndex(index)}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDragEnter={() => setDragOverSlotIndex((current) => (current === index ? current : index))}
                        onDragLeave={() => setDragOverSlotIndex((current) => (current === index ? null : current))}
                        onDrop={(event) => handleDropOnSlot(event, index)}
                        draggable={Boolean(title)}
                        onDragStart={(event) => {
                          if (!title) {
                            return;
                          }
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(SLOT_DRAG_MIME, String(index));
                        }}
                        onDragEnd={() => setDragOverSlotIndex(null)}
                      >
                        <span className="battle-slot-index">{index + 1}</span>
                        {title ? (
                          (() => {
                            const entryBadges = getBattleEntryBadges(title, t, { compact: true });

                            return (
                              <>
                            <div className="battle-slot-thumb">
                              <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                            </div>
                            <div className={`battle-slot-copy ${isThemeSongEntity(title) ? 'is-song-entry' : ''}`}>
                              <strong>{getDisplayName(title)}</strong>
                              <small>{getMetaLine(title) || title.type}</small>
                              {entryBadges.length > 0 ? (
                                <div className="battle-entry-badges">
                                  {entryBadges.map((badge) => (
                                    <span key={`${badge.tone}-${badge.label}`} className={`battle-entry-badge is-${badge.tone || 'default'}`}>
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="battle-icon-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveFromSlot(index);
                              }}
                              aria-label={t('battle.removeFromDeck')}
                            >
                              <Trash2 size={16} />
                            </button>
                              </>
                            );
                          })()
                        ) : (
                          <div className="battle-slot-empty" aria-label={t('battle.dropTitleHere')} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="battle-builder-preview glass-heavy">
              <div className="battle-preview-head">
                <strong>{t('battle.filteredCatalog')}</strong>
                <span>{filteredCatalogTitles.length} / {visibleCatalogEntries.length} {getEntryUnitLabel(filters.entityType)}</span>
              </div>
              {isLoading ? (
                <div className="battle-catalog-grid">
                  {Array.from({ length: 10 }).map((_, i) => <BattleCatalogCardSkeleton key={i} />)}
                </div>
              ) : catalogError ? (
                <p>{catalogError}</p>
              ) : filteredCatalogTitles.length === 0 ? (
                <p>No {getEntryUnitLabel(filters.entityType)} match the current filters.</p>
              ) : (
                <div className="battle-catalog-grid">
                  {previewCatalogTitles.map((title) => {
                    const isSelected = selectedTitleIds.has(title.id);
                    const entryBadges = getBattleEntryBadges(title, t, { compact: true });
                    return (
                      <div
                        key={title.id}
                        className={`battle-catalog-card ${isSelected ? 'is-selected' : ''}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData(TITLE_DRAG_MIME, String(title.id));
                        }}
                      >
                        <div className="battle-catalog-thumb">
                          <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                        </div>
                        <div className={`battle-catalog-copy ${isThemeSongEntity(title) ? 'is-song-entry' : ''}`}>
                          <strong>{getDisplayName(title)}</strong>
                          <small>{getMetaLine(title) || title.type}</small>
                          {entryBadges.length > 0 ? (
                            <div className="battle-entry-badges">
                              {entryBadges.map((badge) => (
                                <span key={`${badge.tone}-${badge.label}`} className={`battle-entry-badge is-${badge.tone || 'default'}`}>
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant={isSelected ? 'secondary' : 'primary'}
                          onClick={() => assignTitleToSlot(title, firstEmptySlotIndex >= 0 ? firstEmptySlotIndex : activeSlotIndex)}
                        >
                          {isSelected ? t('battle.inDeck') : t('battle.addToDeck')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {filteredCatalogTitles.length > 0 ? (
                <div className="battle-catalog-pagination">
                  <span className="battle-preview-muted">
                    {t('battle.catalogPage', { current: catalogPage + 1, total: totalCatalogPages })}
                  </span>
                  <div className="battle-catalog-pagination-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCatalogPage((current) => Math.max(0, current - 1))}
                      disabled={catalogPage === 0}
                    >
                      {t('battle.previousPage')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCatalogPage((current) => Math.min(totalCatalogPages - 1, current + 1))}
                      disabled={catalogPage >= totalCatalogPages - 1}
                    >
                      {t('battle.nextPage')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function BattleSessionPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [session, setSession] = useState(() => getBattleSession(sessionId));
  const [communityRollup, setCommunityRollup] = useState(null);
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isExportingCard, setIsExportingCard] = useState(false);
  const [communityRankView, setCommunityRankView] = useState('top5');
  const [trailerModal, setTrailerModal] = useState(null);
  const [songModal, setSongModal] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const localSession = getBattleSession(sessionId);
      if (!cancelled) {
        setSession(localSession || null);
      }

      if (user?.id) {
        try {
          const remoteSession = await fetchRemoteBattleSession(user.id, sessionId);
          const resolvedSession = mergeSessionsByRecency(
            localSession ? [localSession] : [],
            remoteSession ? [remoteSession] : []
          )[0] || null;
          if (!cancelled) {
            setSession(resolvedSession);
            if (resolvedSession) {
              saveBattleSession(resolvedSession);
            }
          }
          return;
        } catch (loadError) {
          console.warn('Failed to load remote battle session', loadError);
        }
      }

      if (!cancelled && !localSession) {
        setSession(null);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId, user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadCommunityRollup() {
      if (session?.status !== 'completed' || !session?.deckFingerprint) {
        if (!cancelled) {
          setCommunityRollup(null);
          setIsCommunityLoading(false);
        }
        return;
      }

      setIsCommunityLoading(true);
      try {
        const rollup = await fetchBattleCommunityRollup(session.deckFingerprint);
        if (!cancelled) {
          setCommunityRollup(rollup);
        }
      } catch (loadError) {
        console.warn('Failed to load battle community rollup', loadError);
        if (!cancelled) {
          setCommunityRollup(null);
        }
      } finally {
        if (!cancelled) {
          setIsCommunityLoading(false);
        }
      }
    }

    loadCommunityRollup();
    return () => {
      cancelled = true;
    };
  }, [session?.deckFingerprint, session?.status]);

  const titleMap = useMemo(
    () => new Map((session?.titles || []).map((title) => [title.id, title])),
    [session]
  );

  const leftTitle = session?.currentPair ? titleMap.get(session.currentPair.leftId) : null;
  const rightTitle = session?.currentPair ? titleMap.get(session.currentPair.rightId) : null;
  const leftTrailer = useMemo(() => normalizeTrailer(leftTitle || {}), [leftTitle]);
  const rightTrailer = useMemo(() => normalizeTrailer(rightTitle || {}), [rightTitle]);
  const ranking = session?.ranking || getLiveBattleRanking(session);
  const leaders = ranking.slice(0, 5);
  const winner = ranking[0] || null;
  const runnerUps = ranking.slice(1, 3);
  const communityRanking = communityRollup?.community_ranking || [];
  const communityWinner = communityRanking[0] || null;
  const communitySampleCount = Number(communityRollup?.completed_session_count || 0);
  const visibleCommunityRanking = useMemo(
    () => (communityRankView === 'all' ? communityRanking : communityRanking.slice(0, 5)),
    [communityRankView, communityRanking]
  );
  const communityRankMap = useMemo(
    () => new Map(communityRanking.map((title, index) => [title.id, index + 1])),
    [communityRanking]
  );
  const rankDeltaInsights = useMemo(() => {
    const comparableTitles = ranking
      .map((title, index) => {
        const communityRank = communityRankMap.get(title.id);
        if (!communityRank) {
          return null;
        }

        return {
          title,
          yourRank: index + 1,
          communityRank,
          delta: (index + 1) - communityRank,
        };
      })
      .filter(Boolean);

    const mostHigherThanCommunity = comparableTitles
      .filter((entry) => entry.delta < 0)
      .sort((a, b) => a.delta - b.delta)[0] || null;
    const mostLowerThanCommunity = comparableTitles
      .filter((entry) => entry.delta > 0)
      .sort((a, b) => b.delta - a.delta)[0] || null;

    return {
      comparableCount: comparableTitles.length,
      mostHigherThanCommunity,
      mostLowerThanCommunity,
    };
  }, [communityRankMap, ranking]);
  const recentBattleHistory = useMemo(
    () => getStoredBattleSessions().filter((entry) => entry.id !== session?.id).slice(0, 4),
    [session?.id, session?.updatedAt]
  );
  const decisionCount = getBattleDecisionCount(session);
  const battlePhase = session?.fastState?.phase === 'playoff' ? t('battle.playoffPhase') : t('battle.knockoutPhase');
  const battlePhaseDescription = session?.fastState?.phase === 'playoff'
    ? t('battle.playoffPhaseDescription')
    : t('battle.knockoutPhaseDescription');

  useEffect(() => {
    setTrailerModal(null);
    setSongModal(null);
  }, [session?.currentPair?.leftId, session?.currentPair?.rightId]);

  if (!session) {
    return (
      <div className="battle-page container">
        <div className="glass-heavy battle-empty-state">
          <h1>{t('battle.sessionNotFound')}</h1>
          <Button onClick={() => navigate('/battle')}>{t('battle.backToHub')}</Button>
        </div>
      </div>
    );
  }

  const progressPercent = Math.min(100, Math.round((decisionCount / session.targetRounds) * 100));

  const updateSession = async (nextSession) => {
    let persisted = saveBattleSession(nextSession);
    setSession(persisted);
    if (user?.id) {
      try {
        const remotePersisted = await persistRemoteBattleSession(user.id, persisted);
        if (remotePersisted?.id && remotePersisted.id !== persisted.id) {
          persisted = saveBattleSession(remotePersisted);
          setSession(persisted);
          navigate(`/battle/${persisted.id}`, { replace: true });
        }
      } catch (saveError) {
        console.warn('Failed to persist remote battle update', saveError);
        toast.error(t('battle.updateSyncFailed'));
      }
    }
  };

  const handleVote = async (result) => {
    await updateSession(recordBattleVote(session, result));
  };

  const handleUndo = async () => {
    await updateSession(undoBattleVote(session));
  };

  const handleRestart = async () => {
    await updateSession(restartBattleSession(session));
  };

  const handleFinish = async () => {
    await updateSession(finalizeBattleSession(session));
  };

  const handleShare = async () => {
    const shareText = buildBattleShareText(session);
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/battle/${session.id}`
      : `/battle/${session.id}`;
    const sharePayload = {
      title: `${session.deckLabel} result`,
      text: shareText,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        toast.success(t('battle.shareCopied'));
      } else {
        toast.error(t('battle.shareNotSupported'));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        toast.error(t('battle.shareFailed'));
      }
    }
  };

  const handleDownloadShareCard = async () => {
    if (!session || !winner) {
      toast.error(t('battle.exportNotReady'));
      return;
    }

    setIsExportingCard(true);
    try {
      const svg = buildBattleShareCardSvg(session, winner, communityWinner, rankDeltaInsights, t);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      downloadBlob(blob, `moodtoon-battle-${session.id}.svg`);
      toast.success(t('battle.shareCardDownloaded'));
    } catch (error) {
      console.error(error);
      toast.error(t('battle.exportFailed'));
    } finally {
      setIsExportingCard(false);
    }
  };

  const handlePlayTrailer = (side) => {
    const trailer = side === 'left' ? leftTrailer : rightTrailer;
    const titleObj = side === 'left' ? leftTitle : rightTitle;
    if (isThemeSongEntity(titleObj)) {
      if (titleObj?.video_url) {
        setSongModal(titleObj);
      }
      return;
    }

    if (trailer) {
      setTrailerModal({
        embedUrl: trailer.embedUrl || null,
        watchUrl: trailer.watchUrl || null,
        title: getDisplayName(titleObj) || '',
      });
    }
  };

  return (
    <div className="battle-page">
      <div className="battle-play-bar">
        <div className="container battle-play-bar-inner">
          <Link className="battle-play-back" to="/battle">
            <ChevronLeft size={15} />
            <span>{t('battle.hub')}</span>
          </Link>
          <div className="battle-play-bar-center">
            <span className="battle-play-deck-name">{session.deckLabel}</span>
            <div className="battle-play-progress-wrap">
              <div className="battle-play-progress-track">
                <div className="battle-play-progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="battle-play-progress-pct">{progressPercent}%</span>
            </div>
          </div>
          {session.status !== 'completed' && (
            <div className="battle-play-bar-actions">
              <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={handleRestart}>{t('battle.restart')}</Button>
            </div>
          )}
        </div>
      </div>
      <div className="battle-play-bar-spacer" />

      {session.status !== 'completed' ? (
        <>
          <div className="container battle-play-phase">
            <span className="battle-play-phase-badge">{battlePhase}</span>
            <span className="battle-play-phase-desc">{battlePhaseDescription}</span>
            <span className="battle-play-phase-remain">{t('battle.remainingMatchesEstimate', { count: Math.max(0, session.targetRounds - decisionCount) })}</span>
          </div>

          <section className="battle-match-grid">
            <BattleMatchCard
              key={leftTitle?.id}
              title={leftTitle}
              trailer={leftTrailer}
              voteLabel={t('battle.chooseLeft')}
              voteIcon={<Swords size={16} />}
              onVote={() => handleVote('left')}
              onPlayTrailer={() => handlePlayTrailer('left')}
            />

            <div className="battle-vs-column">
              <div className="battle-vs-badge">{t('battle.versus')}</div>
            </div>

            <BattleMatchCard
              key={rightTitle?.id}
              title={rightTitle}
              trailer={rightTrailer}
              voteLabel={t('battle.chooseRight')}
              voteIcon={<ArrowLeftRight size={16} />}
              onVote={() => handleVote('right')}
              onPlayTrailer={() => handlePlayTrailer('right')}
            />
          </section>

        </>
      ) : (
        <>
	          <section className="container battle-result-hero glass-heavy">
            <div className="battle-result-spotlight">
              <div className="battle-result-cover">
                <img src={getTitleArtwork(winner)} alt="" />
              </div>
              <div className="battle-result-copy">
                <span className="battle-kicker"><Trophy size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.resultLabel')}</span>
                <h2>{winner ? getDisplayName(winner) : t('battle.noWinner')}</h2>
                <p>{t('battle.championSummary', { deck: session.deckLabel, count: decisionCount })}</p>
                <div className="battle-result-meta">
                  <span>{t('battle.points', { count: winner?.score || 0 })}</span>
                  <span>{t('battle.winsLabel', { count: winner?.wins || 0 })}</span>
                  <span>{getMetaLine(winner) || t('battle.catalogFallback')}</span>
                </div>
              </div>
	            </div>
              <div className="battle-result-actions">
                <Button variant="secondary" icon={<Copy size={16} />} onClick={handleShare}>{t('battle.shareResult')}</Button>
                <Button variant="secondary" onClick={handleDownloadShareCard} disabled={isExportingCard}>
                  {isExportingCard ? t('battle.exportingCard') : t('battle.downloadCard')}
                </Button>
                <Button variant="ghost" icon={<BarChart3 size={16} />} disabled={isCommunityLoading || !communityWinner}>
                  {isCommunityLoading ? t('battle.loadingCommunity') : communityWinner ? t('battle.communitySynced') : t('battle.communityPending')}
                </Button>
                <div className="battle-result-actions-right">
                  <Link className="btn btn-ghost btn-md" to="/battle">{t('battle.hub')}</Link>
                  <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={handleRestart}>{t('battle.restart')}</Button>
                </div>
              </div>
            </section>

            <section className="container battle-section">
              <div className="battle-section-head">
                <h2>{t('battle.communityCompare')}</h2>
                <p>
                  {communityWinner
                    ? t('battle.communityCompareSummary', { count: communitySampleCount })
                    : t('battle.communityComparePending')}
                </p>
              </div>
	              {communityWinner ? (
	                <div className="battle-community-grid">
	                  <article className="battle-community-card glass-heavy">
	                    <span className="battle-kicker">{t('battle.yourWinner')}</span>
                      <div className="battle-community-highlight">
                        <div className="battle-community-thumb">
                          <img src={getTitleArtwork(winner)} alt="" loading="lazy" />
                        </div>
                        <div className="battle-community-copy">
	                    <strong>{winner ? getDisplayName(winner) : '-'}</strong>
	                    <small>{winner ? getMetaLine(winner) : t('battle.noResultYet')}</small>
	                    <span>{t('battle.points', { count: winner?.score || 0 })}</span>
                        </div>
                      </div>
	                  </article>
	                  <article className="battle-community-card glass-heavy">
	                    <span className="battle-kicker">{t('battle.communityWinner')}</span>
                      <div className="battle-community-highlight">
                        <div className="battle-community-thumb">
                          <img src={getTitleArtwork(communityWinner)} alt="" loading="lazy" />
                        </div>
                        <div className="battle-community-copy">
	                    <strong>{getDisplayName(communityWinner)}</strong>
	                    <small>{getMetaLine(communityWinner)}</small>
	                    <span>
	                      {t('battle.avgRankSummary', {
                          avg: Number(communityWinner.avg_rank || 0).toFixed(2),
                          count: communityWinner.first_place_count || 0,
                        })}
	                    </span>
                        </div>
                      </div>
	                  </article>
	                </div>
	              ) : (
	                <div className="glass-heavy battle-empty-state">
	                  {t('battle.noCommunityComparison')}
	                </div>
	              )}
	            </section>

            {communityRanking.length > 0 && (
              <section className="container battle-section">
                <div className="battle-section-head">
                  <div>
                    <h2>{t('battle.communityRanking')}</h2>
                    <p>
                      {t('battle.communityRankingSummary')}
                      {communityRankView === 'all'
                        ? ` ${t('battle.communityRankingAll', { count: communityRanking.length })}`
                        : ` ${t('battle.communityRankingTop', { count: Math.min(5, communityRanking.length) })}`}
                    </p>
                  </div>
                  <div className="battle-community-toggle" role="group" aria-label={t('battle.communityRankingView')}>
                    <Button
                      variant={communityRankView === 'top5' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setCommunityRankView('top5')}
                    >
                      {t('battle.showTopFive')}
                    </Button>
                    <Button
                      variant={communityRankView === 'all' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setCommunityRankView('all')}
                    >
                      {t('battle.showAll')}
                    </Button>
                  </div>
                </div>
                <div className="battle-ranking-list glass-heavy">
                  {visibleCommunityRanking.map((title, index) => (
                    <div key={title.id} className="battle-ranking-row">
                      <div className="battle-ranking-main">
                        <span className="battle-ranking-position">
                          #{communityRankView === 'all' ? communityRankMap.get(title.id) || index + 1 : index + 1}
                        </span>
                        <div className="battle-ranking-thumb">
                          <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                        </div>
                        <div className="battle-ranking-title-group">
                          <strong>{getDisplayName(title)}</strong>
                          <small>{getMetaLine(title)}</small>
                        </div>
                      </div>
                      <div className="battle-ranking-metrics">
                        <span>{t('battle.avgRank', { value: Number(title.avg_rank || 0).toFixed(2) })}</span>
                        <span>{t('battle.firstPlaceCount', { count: title.first_place_count || 0 })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {rankDeltaInsights.comparableCount > 0 && (
              <section className="container battle-section">
                <div className="battle-section-head">
                  <h2>{t('battle.rankingInsights')}</h2>
                  <p>{t('battle.rankingInsightsHint')}</p>
                </div>
                <div className="battle-community-grid">
                  <article className="battle-community-card glass-heavy">
                    <span className="battle-kicker">{t('battle.youRatedHigher')}</span>
                    {rankDeltaInsights.mostHigherThanCommunity ? (
                      <div className="battle-community-highlight">
                        <div className="battle-community-thumb">
                          <img src={getTitleArtwork(rankDeltaInsights.mostHigherThanCommunity.title)} alt="" loading="lazy" />
                        </div>
                        <div className="battle-community-copy">
                          <strong>{getDisplayName(rankDeltaInsights.mostHigherThanCommunity.title)}</strong>
                          <small>{getMetaLine(rankDeltaInsights.mostHigherThanCommunity.title)}</small>
                          <span>
                            {t('battle.yourRankVsCommunity', {
                              yourRank: rankDeltaInsights.mostHigherThanCommunity.yourRank,
                              communityRank: rankDeltaInsights.mostHigherThanCommunity.communityRank,
                            })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span>{t('battle.noHigherThanCommunity')}</span>
                    )}
                  </article>
                  <article className="battle-community-card glass-heavy">
                    <span className="battle-kicker">{t('battle.communityRatedHigher')}</span>
                    {rankDeltaInsights.mostLowerThanCommunity ? (
                      <div className="battle-community-highlight">
                        <div className="battle-community-thumb">
                          <img src={getTitleArtwork(rankDeltaInsights.mostLowerThanCommunity.title)} alt="" loading="lazy" />
                        </div>
                        <div className="battle-community-copy">
                          <strong>{getDisplayName(rankDeltaInsights.mostLowerThanCommunity.title)}</strong>
                          <small>{getMetaLine(rankDeltaInsights.mostLowerThanCommunity.title)}</small>
                          <span>
                            {t('battle.yourRankVsCommunity', {
                              yourRank: rankDeltaInsights.mostLowerThanCommunity.yourRank,
                              communityRank: rankDeltaInsights.mostLowerThanCommunity.communityRank,
                            })}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span>{t('battle.noLowerThanCommunity')}</span>
                    )}
                  </article>
                </div>
              </section>
            )}

	          <section className="container battle-section">
	            <div className="battle-podium-grid">
              <div className="battle-podium-card battle-podium-card-winner glass-heavy">
                <div className="battle-podium-cover">
                  <img src={getTitleArtwork(winner)} alt="" loading="lazy" />
                </div>
                <span className="battle-podium-rank"><Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> #1</span>
                <strong>{winner ? getDisplayName(winner) : '-'}</strong>
                <small>{winner ? getMetaLine(winner) : t('battle.winnerFallback')}</small>
              </div>
              {runnerUps.map((title, index) => (
                <div key={title.id} className="battle-podium-card glass-heavy">
                  <div className="battle-podium-cover">
                    <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                  </div>
                  <span className="battle-podium-rank"><Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/> #{index + 2}</span>
                  <strong>{getDisplayName(title)}</strong>
                  <small>{getMetaLine(title)}</small>
                </div>
              ))}
            </div>
          </section>

	          <section className="container battle-section">
	            <div className="battle-section-head">
	              <h2>{t('battle.yourRanking')}</h2>
	              <p>{communityWinner ? t('battle.yourRankingHintWithCommunity') : t('battle.yourRankingHintSolo')}</p>
	            </div>
		            <div className="battle-ranking-list glass-heavy">
		              {ranking.map((title, index) => {
		                const tier = session.tiers?.find((entry) => entry.titleId === title.id)?.tier || '-';
                    const communityRank = communityRankMap.get(title.id) || null;
                    const rankDelta = communityRank ? (index + 1) - communityRank : null;
		                return (
		                  <div key={title.id} className="battle-ranking-row">
		                    <div className="battle-ranking-main">
		                      <span className="battle-ranking-position">#{index + 1}</span>
                        <div className="battle-ranking-thumb">
                          <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                        </div>
	                      <div className="battle-ranking-title-group">
	                        <strong>{getDisplayName(title)}</strong>
	                        <small>{getMetaLine(title)}</small>
	                      </div>
		                    </div>
		                    <div className="battle-ranking-metrics">
		                      <span>{t('battle.tierLabel', { tier })}</span>
                          {communityRank ? (
                            <span
                              className={`battle-rank-delta ${
                                rankDelta === 0 ? 'is-even' : rankDelta < 0 ? 'is-higher' : 'is-lower'
                              }`}
                              title={formatRankDelta(rankDelta, t)}
                            >
                              {rankDelta === 0
                                ? t('battle.communityRank', { rank: communityRank })
                                : rankDelta < 0
                                  ? t('battle.aboveCommunity', { count: Math.abs(rankDelta) })
                                  : t('battle.belowCommunity', { count: rankDelta })}
                            </span>
                          ) : (
                            <span className="battle-rank-delta is-missing">{t('battle.noCommunityRank')}</span>
                          )}
	                      <span>{t('battle.winsLabel', { count: title.wins || 0 })}</span>
	                      <span>{t('battle.lossesLabel', { count: title.losses || 0 })}</span>
	                      <span>{t('battle.points', { count: title.score || 0 })}</span>
		                    </div>
		                  </div>
                );
              })}
	            </div>
	          </section>

            <section className="container battle-section">
              <div className="battle-section-head">
                <h2>{t('battle.recentBattleHistory')}</h2>
                <p>{t('battle.recentBattleHistoryHint')}</p>
              </div>
              {recentBattleHistory.length > 0 ? (
                <div className="battle-history-grid">
                  {recentBattleHistory.map((entry) => {
                    const summary = getBattleSessionSummary(entry);
                    return (
                      <Link key={entry.id} to={`/battle/${entry.id}`} className="battle-history-card glass-heavy">
                        <div className="battle-history-thumb">
                          <img src={getTitleArtwork(summary?.winner || entry.titles?.[0])} alt="" loading="lazy" />
                        </div>
                        <div className="battle-history-copy">
                          <strong>{summary?.deckLabel || entry.deckLabel}</strong>
                          <small>{summary?.winner ? t('battle.winner', { title: getDisplayName(summary.winner) }) : t('battle.inProgress')}</small>
                          <span>{formatBattleTimestamp(summary?.completedAt || entry.updatedAt || entry.createdAt)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-heavy battle-empty-state">
                  {t('battle.noOtherBattleSessions')}
                </div>
              )}
            </section>
	        </>
	      )}
      {trailerModal && (
        <TrailerModal
          embedUrl={trailerModal.embedUrl}
          watchUrl={trailerModal.watchUrl}
          title={trailerModal.title}
          onClose={() => setTrailerModal(null)}
        />
      )}
      {songModal && (
        <ThemeSongModal
          song={songModal}
          onClose={() => setSongModal(null)}
        />
      )}
    </div>
  );
}

export default BattleHub;
