import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, Copy, RotateCcw, Swords, Trash2, Play, Search, Layers, Trophy, Medal, Crown, Plus, Wand2, Sparkles, Globe, Lock } from 'lucide-react';
import { getAllTitles } from '@/features/discover/lib/recommend';
import {
  buildBattleDeck,
  buildBattleShareText,
  collectBattleFilters,
  createBattleSession,
  createStoredBattleDeck,
  deleteBattleSession,
  deleteStoredBattleDeck,
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
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import './Battle.css';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All titles' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
];

const SIZE_OPTIONS = [8, 16, 24, 32, 48];
const RECENT_BATTLE_SESSION_LIMIT = 4;
const BATTLE_CATALOG_PAGE_SIZE = 6;
const TITLE_DRAG_MIME = 'application/x-battle-title-id';
const SLOT_DRAG_MIME = 'application/x-battle-slot-index';

function getDisplayName(title) {
  return title?.title_th || title?.title_en || title?.title_native || 'Unknown title';
}

function getMetaLine(title) {
  return [title?.type, ...(title?.genres || []).slice(0, 2)].filter(Boolean).join(' / ');
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
  return {
    title,
    type: title.type,
    moods: new Set((title.moods || []).map(normalizeBattleText)),
    genres: (title.genres || []).map(normalizeBattleText),
    tags: (title.tags || []).map(normalizeBattleText),
    haystack: [
      title.title_en,
      title.title_th,
      title.title_native,
      title.slug,
    ].map(normalizeBattleText),
  };
}

function sortBattleTitles(titles = []) {
  return [...titles].sort((a, b) => {
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

  return true;
}

function buildEmptyDeckSlots(size) {
  return Array.from({ length: size }, () => null);
}

function createManualBattleDeck({ filters, deckName, deckSlots, sourceCount }) {
  const titles = deckSlots.filter(Boolean);
  const normalizedFilters = {
    ...filters,
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
    label: deckName.trim() || `Custom deck ${titles.length}/${deckSlots.length}`,
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
  const sessionMap = new Map();

  [...localSessions, ...remoteSessions].forEach((session) => {
    if (!session?.id) {
      return;
    }

    const existing = sessionMap.get(session.id);
    if (!existing) {
      sessionMap.set(session.id, session);
      return;
    }

    const existingUpdatedAt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextUpdatedAt = new Date(session.updatedAt || session.createdAt || 0).getTime();
    if (nextUpdatedAt >= existingUpdatedAt) {
      sessionMap.set(session.id, session);
    }
  });

  return [...sessionMap.values()]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, RECENT_BATTLE_SESSION_LIMIT);
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
  const subtitle = [
    deck.filters?.type && deck.filters.type !== 'all' ? deck.filters.type : 'all titles',
    deck.filters?.tag ? `#${deck.filters.tag}` : '',
    deck.filters?.mood || '',
  ].filter(Boolean).join(' / ');

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
      <span className="battle-preset-meta">{(deck.filters?.type || 'all').toUpperCase()} / {t('battle.titlesReady', { count: deck?.titles?.length || 0 })}</span>
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
  const metaLabel = `${(deck?.filters?.type || 'all').toUpperCase()} / ${t('battle.titlesReady', { count: deck?.titles?.length || 0 })}`;

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
          <span className="battle-preset-meta">{t('battle.titlesReady', { count: deck?.titles?.length || 0 })}</span>
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

export function BattleHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { prefs } = useProfilePreferences();
  const { hiddenTitleIds } = useHiddenTitles();
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentSessions, setRecentSessions] = useState([]);
  const [savedDecks, setSavedDecks] = useState([]);
  const [publicDecks, setPublicDecks] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadTitles() {
      setIsLoading(true);
      setError('');
      try {
        const allTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
        const remoteSessions = user?.id
          ? await fetchRemoteBattleSessions(user.id).catch(() => [])
          : [];
        const remotePublicDecks = await fetchPublicBattleDecks().catch(() => []);
        if (!cancelled) {
          setTitles(allTitles);
          const localSessions = getStoredBattleSessions();
          const mergedSessions = mergeSessionsByRecency(localSessions, remoteSessions);
          mergedSessions.forEach((session) => {
            saveBattleSession(session);
          });
          setRecentSessions(mergedSessions);
          setSavedDecks(getStoredBattleDecks());
          setPublicDecks(remotePublicDecks);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || t('battle.loadCatalogFailed'));
          setRecentSessions(getStoredBattleSessions());
          setSavedDecks(getStoredBattleDecks());
          setPublicDecks([]);
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
  }, [user?.id]);

  const deckOptions = useMemo(() => ({
    hiddenTitleIds,
    excludeAdult: prefs.hideAdultContent,
  }), [hiddenTitleIds, prefs.hideAdultContent]);
  const visibleCatalogTitles = useMemo(
    () => titles.filter((title) => !hiddenTitleIds.includes(title.id) && (!prefs.hideAdultContent || !title.is_adult)),
    [hiddenTitleIds, prefs.hideAdultContent, titles]
  );
  const hiddenExcludedCount = Math.max(0, titles.length - visibleCatalogTitles.length);
  const presets = useMemo(() => getBattlePresets(), []);
  const presetDecks = useMemo(
    () => presets.map((preset) => ({
      preset,
      deck: buildBattleDeck(visibleCatalogTitles, { ...preset.filters, label: preset.label }, deckOptions),
    })),
    [deckOptions, presets, visibleCatalogTitles]
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

    return mergedDecks.filter((deck) => (deck?.titles?.length || 0) >= 8);
  }, [publicDecks, readySavedDecks]);

  const startBattle = async (deck) => {
    if ((deck?.titles?.length || 0) < 8) {
      toast.error(t('battle.needAtLeastEight'));
      return;
    }

    const session = saveBattleSession(createBattleSession(deck, {
      catalogCount: visibleCatalogTitles.length,
      hiddenExcludedCount,
      excludesAdultContent: prefs.hideAdultContent,
    }));
    if (user?.id) {
      try {
        await persistRemoteBattleSession(user.id, session);
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
      <section className="battle-hero container">
        <div className="battle-hero-copy">
          <span className="battle-kicker">{t('battle.mode')}</span>
          <h1>{t('battle.heroTitle')}</h1>
          <p>{t('battle.heroSubtitle')}</p>
          <div className="battle-hero-actions">
            <Link className="btn btn-primary" to="/battle/build">
              <Plus size={16} />
              <span>{t('battle.buildDeck')}</span>
            </Link>
            <Link className="btn btn-secondary" to="/battle/decks">
              <Layers size={16} />
              <span>{t('battle.manageDecks')}</span>
            </Link>
          </div>
        </div>
        <div className="battle-hero-panel glass-heavy">
          {isLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="battle-hero-stat" aria-hidden="true">
                  <div className="battle-skeleton-block" style={{ height: '1.75rem', width: '3.5rem', borderRadius: '6px' }} />
                  <div className="battle-skeleton-block" style={{ height: '0.85rem', width: '6rem', borderRadius: '5px', marginTop: '0.1rem' }} />
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="battle-hero-stat">
                <strong>{readyPresetDecks.length + publicSavedDecks.length}</strong>
                <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.readyDecks')}</span>
              </div>
              <div className="battle-hero-stat">
                <strong>{recentSessions.length}</strong>
                <span><Swords size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.savedRuns')}</span>
              </div>
              <div className="battle-hero-stat">
                <strong>{visibleCatalogTitles.length}</strong>
                <span><Play size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.visibleCatalogTitles')}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.quickPresets')}</h2>
          <p>{t('battle.quickPresetsHint')}</p>
        </div>
        {isLoading ? (
          <div className="battle-preset-grid">
            {[0, 1, 2, 3].map((i) => <BattlePresetCardSkeleton key={i} />)}
          </div>
        ) : readyPresetDecks.length === 0 ? (
          <div className="glass-heavy battle-empty-state">{t('battle.noPresetReady')}</div>
        ) : (
          <div className="battle-preset-grid">
            {readyPresetDecks.map(({ preset, deck }) => (
              <BattlePresetCard
                key={preset.id}
                preset={preset}
                deck={deck}
                disabled={isLoading}
                onApply={(_, readyDeck) => handleApplyPreset(readyDeck)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.publicDecks')}</h2>
          <p>{t('battle.publicDecksHint')}</p>
        </div>
        {isLoading ? (
          <div className="battle-preset-grid battle-preset-grid-compact">
            {[0, 1, 2, 3].map((i) => <BattlePresetCardSkeleton key={i} />)}
          </div>
        ) : publicSavedDecks.length === 0 ? (
          <div className="glass-heavy battle-empty-state">
            <strong>{t('battle.noPublicDeck')}</strong>
            <p>{t('battle.publicDeckEmptyHint')}</p>
            <Link className="btn btn-secondary" to="/battle/decks">{t('battle.manageDecks')}</Link>
          </div>
        ) : (
          <div className="battle-preset-grid battle-preset-grid-compact">
            {publicSavedDecks.map((deck) => (
              <BattleSavedDeckPresetCard
                key={deck.id}
                deck={deck}
                disabled={isLoading || Boolean(error)}
                onStart={startBattle}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

export function BattleBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { prefs } = useProfilePreferences();
  const { hiddenTitleIds } = useHiddenTitles();
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [deckName, setDeckName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [filters, setFilters] = useState({
    type: 'all',
    tag: '',
    mood: '',
    query: '',
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

  useEffect(() => {
    let cancelled = false;

    async function loadTitles() {
      setIsLoading(true);
      setError('');
      try {
        const allTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
        if (!cancelled) {
          setTitles(allTitles);
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

  const hiddenTitleIdSet = useMemo(
    () => new Set(hiddenTitleIds),
    [hiddenTitleIds]
  );
  const visibleCatalogTitles = useMemo(
    () => titles.filter((title) => !hiddenTitleIdSet.has(title.id) && (!prefs.hideAdultContent || !title.is_adult)),
    [hiddenTitleIdSet, prefs.hideAdultContent, titles]
  );
  const hiddenExcludedCount = Math.max(0, titles.length - visibleCatalogTitles.length);
  const filterOptions = useMemo(() => collectBattleFilters(visibleCatalogTitles), [visibleCatalogTitles]);
  const preparedCatalogTitles = useMemo(
    () => visibleCatalogTitles.map(buildPreparedBattleTitle),
    [visibleCatalogTitles]
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
    () => [...filterOptions.genres, ...filterOptions.tags].slice(0, 80),
    [filterOptions.genres, filterOptions.tags]
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
  const firstEmptySlotIndex = useMemo(
    () => deckSlots.findIndex((title) => !title),
    [deckSlots]
  );
  const titleById = useMemo(
    () => new Map(visibleCatalogTitles.map((title) => [String(title.id), title])),
    [visibleCatalogTitles]
  );
  const titleByAnyId = useMemo(
    () => new Map(titles.map((title) => [String(title.id), title])),
    [titles]
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
    if (!editingDeck || hasLoadedEditDeck || titles.length === 0) {
      return;
    }

    const nextSize = Number(editingDeck.filters?.size || editingDeck.titles?.length || 16);
    const normalizedSize = Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 16;
    const nextFilters = {
      type: editingDeck.filters?.type || 'all',
      tag: editingDeck.filters?.tag || '',
      mood: editingDeck.filters?.mood || '',
      query: '',
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
  }, [editingDeck, hasLoadedEditDeck, titleByAnyId, titles.length]);

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
  }, [deferredFilters, visibleCatalogTitles.length]);

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
      toast.error(t('battle.onlyTitlesMatch', { count: battleDeck.titles.length }));
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
        const session = saveBattleSession(createBattleSession(storedDeck, {
          catalogCount: visibleCatalogTitles.length,
          hiddenExcludedCount,
          excludesAdultContent: prefs.hideAdultContent,
        }));
        if (user?.id) {
          try {
            await persistRemoteBattleSession(user.id, session);
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
            <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.titlesInDeck')}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{visibleCatalogTitles.length}</strong>
            <span><Play size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.visibleTitles')}</span>
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
              <span>{t('battle.type')}</span>
              <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span><Search size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.tagGenre')}</span>
              <select
                value={filters.tag}
                onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}
              >
                <option value="">{t('battle.anyTagGenre')}</option>
                {tagOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="battle-field">
              <span>{t('battle.mood')}</span>
              <select value={filters.mood} onChange={(event) => setFilters((current) => ({ ...current, mood: event.target.value }))}>
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
              <span>{t('battle.deckSize')}</span>
              <select value={filters.size} onChange={(event) => setFilters((current) => ({ ...current, size: Number(event.target.value) }))}>
                {SIZE_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value} titles</option>
                ))}
              </select>
            </label>

            <div className="battle-builder-actions battle-builder-toolbar-actions">
              <Button variant="ghost" onClick={handleAutoFillDeck} disabled={isLoading || Boolean(error) || filteredCatalogTitles.length === 0}>
                {t('battle.fillFromFilters')}
              </Button>
              <Button variant="ghost" onClick={handleClearDeck} disabled={isLoading}>
                {t('battle.clearDeck')}
              </Button>
              <Link className="btn btn-ghost" to="/battle">{t('battle.backToBattle')}</Link>
              <Button variant="secondary" onClick={() => saveDeck()} disabled={isLoading || isSaving || Boolean(error)}>
                {t('battle.saveDeck')}
              </Button>
              <Button onClick={() => saveDeck({ startAfterSave: true })} disabled={isLoading || isSaving || Boolean(error)}>
                {t('battle.saveAndStart')}
              </Button>
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
              ) : error ? (
                <p>{error}</p>
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
                          <>
                            <div className="battle-slot-thumb">
                              <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                            </div>
                            <div className="battle-slot-copy">
                              <strong>{getDisplayName(title)}</strong>
                              <small>{getMetaLine(title) || title.type}</small>
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
                <span>{t('battle.titlesFound', { count: filteredCatalogTitles.length, sourceCount: visibleCatalogTitles.length })}</span>
              </div>
              {isLoading ? (
                <div className="battle-catalog-grid">
                  {Array.from({ length: 10 }).map((_, i) => <BattleCatalogCardSkeleton key={i} />)}
                </div>
              ) : error ? (
                <p>{error}</p>
              ) : filteredCatalogTitles.length === 0 ? (
                <p>{t('battle.noTitlesMatch')}</p>
              ) : (
                <div className="battle-catalog-grid">
                  {previewCatalogTitles.map((title) => {
                    const isSelected = selectedTitleIds.has(title.id);
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
                        <div className="battle-catalog-copy">
                          <strong>{getDisplayName(title)}</strong>
                          <small>{getMetaLine(title) || title.type}</small>
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

export function BattleDeckLibraryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [savedDecks, setSavedDecks] = useState(() => getStoredBattleDecks());

  const readySavedDecks = useMemo(
    () => savedDecks.filter((deck) => (deck?.titles?.length || 0) >= 8),
    [savedDecks]
  );

  const privateDecks = useMemo(
    () => readySavedDecks.filter((deck) => !deck.isPublic),
    [readySavedDecks]
  );

  const publicDecks = useMemo(
    () => readySavedDecks.filter((deck) => deck.isPublic),
    [readySavedDecks]
  );

  const handleDeleteDeck = async (deck) => {
    if (!deck?.id) {
      return;
    }

    if (deck.isPublic && user?.id) {
      try {
        await deleteRemotePublicBattleDeck(user.id, deck.id);
      } catch (deleteError) {
        console.warn('Failed to delete remote public battle deck', deleteError);
      }
    }

    deleteStoredBattleDeck(deck.id);
    setSavedDecks(getStoredBattleDecks());
  };

  const handleToggleDeckPublic = async (deck) => {
    if (!deck?.id) {
      return;
    }

    if (!deck.isPublic && !user?.id) {
      toast.error(t('battle.loginToPublishDeck'));
      return;
    }

    const nextDeck = saveStoredBattleDeck({
      ...deck,
      isPublic: !deck.isPublic,
    });

    try {
      if (nextDeck.isPublic && user?.id) {
        await persistRemotePublicBattleDeck(user, nextDeck);
      } else if (!nextDeck.isPublic && user?.id) {
        await deleteRemotePublicBattleDeck(user.id, nextDeck.id);
      }
    } catch (saveError) {
      console.warn('Failed to sync public battle deck', saveError);
      toast.error(t('battle.publishDeckFailed'));
      saveStoredBattleDeck(deck);
    }

    setSavedDecks(getStoredBattleDecks());
  };

  return (
    <div className="battle-page">
      <section className="battle-hero container battle-builder-hero">
        <div className="battle-hero-copy">
          <span className="battle-kicker"><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.myDeckLibrary')}</span>
          <h1><Sparkles size={18} style={{ display: 'inline', color: 'var(--primary-500)', verticalAlign: 'middle', marginRight: '0.28rem' }} /> {t('battle.myBuiltDecks')}</h1>
          <p>{t('battle.myDeckLibraryHint')}</p>
        </div>
        <div className="battle-hero-panel glass-heavy">
          <div className="battle-hero-stat">
            <strong>{readySavedDecks.length}</strong>
            <span><Layers size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.readyDecks')}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{privateDecks.length}</strong>
            <span><Lock size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.privateDeck')}</span>
          </div>
          <div className="battle-hero-stat">
            <strong>{publicDecks.length}</strong>
            <span><Globe size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {t('battle.publicDeck')}</span>
          </div>
        </div>
      </section>

      <section className="container battle-section">
        <div className="battle-section-head">
          <h2>{t('battle.privateDecks')}</h2>
          <p>{t('battle.privateDecksHint')}</p>
        </div>
        {privateDecks.length === 0 ? (
          <div className="glass-heavy battle-empty-state">
            <strong>{t('battle.noSavedCustomDeck')}</strong>
            <p>{t('battle.openBuilderHint')}</p>
            <div className="battle-hero-actions">
              <Link className="btn btn-primary" to="/battle/build">{t('battle.openBuilder')}</Link>
              <Link className="btn btn-secondary" to="/battle">{t('battle.backToBattle')}</Link>
            </div>
          </div>
        ) : (
          <div className="battle-deck-list-grid">
            {privateDecks.map((deck) => (
              <BattleReadyDeckCard
                key={deck.id}
                title={deck.label}
                subtitle={[
                  deck.filters?.type && deck.filters.type !== 'all' ? deck.filters.type : 'all titles',
                  deck.filters?.tag ? `#${deck.filters.tag}` : '',
                  deck.filters?.mood || '',
                ].filter(Boolean).join(' / ')}
                deck={deck}
                badge={t('battle.customDeck')}
                className="battle-deck-card-compact"
                disabled={false}
                onStart={() => navigate('/battle')}
                actionLabel={t('battle.readyForPublish')}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleDeckPublic(deck)}
                  icon={<Globe size={14} />}
                >
                  {t('battle.makePublic')}
                </Button>
                <Link className="btn btn-secondary btn-sm" to={`/battle/build?deckId=${deck.id}`}>
                  Edit
                </Link>
                <button type="button" className="battle-icon-btn" onClick={() => handleDeleteDeck(deck)} aria-label={t('battle.deleteDeck')}>
                  <Trash2 size={16} />
                </button>
              </BattleReadyDeckCard>
            ))}
          </div>
        )}
      </section>

      {publicDecks.length > 0 ? (
        <section className="container battle-section">
          <div className="battle-section-head">
            <h2>{t('battle.publicDecks')}</h2>
            <p>{t('battle.publicDecksManageHint')}</p>
          </div>
          <div className="battle-deck-list-grid">
            {publicDecks.map((deck) => (
              <div key={deck.id} className="battle-deck-preset-wrap">
                <BattleReadyDeckCard
                  title={deck.label}
                  subtitle={[
                    deck.filters?.type && deck.filters.type !== 'all' ? deck.filters.type : 'all titles',
                    deck.filters?.tag ? `#${deck.filters.tag}` : '',
                    deck.filters?.mood || '',
                  ].filter(Boolean).join(' / ')}
                  deck={deck}
                  badge={t('battle.publicDeck')}
                  className="battle-deck-card-compact"
                  disabled={false}
                  onStart={() => navigate('/battle')}
                  actionLabel={t('battle.visibleOnHub')}
                  variant="preset"
                />
                <div className="battle-deck-preset-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleDeckPublic(deck)}
                    icon={<Lock size={14} />}
                  >
                    {t('battle.makePrivate')}
                  </Button>
                  <Link className="btn btn-secondary btn-sm" to={`/battle/build?deckId=${deck.id}`}>
                    Edit
                  </Link>
                  <button type="button" className="battle-icon-btn" onClick={() => handleDeleteDeck(deck)} aria-label={t('battle.deleteDeck')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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
    const persisted = saveBattleSession(nextSession);
    setSession(persisted);
    if (user?.id) {
      try {
        await persistRemoteBattleSession(user.id, persisted);
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

  return (
    <div className="battle-page">
      <section className="container battle-session-head">
        <div>
            <span className="battle-kicker"><Swords size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> {t('battle.soloBattle')}</span>
          <h1>{session.deckLabel}</h1>
          <p>{t('battle.deckProgress', { count: session.titles.length, current: decisionCount, total: session.targetRounds })}</p>
        </div>
        {session.status !== 'completed' && (
          <div className="battle-session-actions">
            <Link className="btn btn-ghost btn-sm" to="/battle">{t('battle.hub')}</Link>
            <Button variant="secondary" size="sm" icon={<RotateCcw size={16} />} onClick={handleRestart}>{t('battle.restart')}</Button>
          </div>
        )}
      </section>

      {session.status !== 'completed' ? (
        <>
          <section className="container battle-progress-panel glass-heavy">
            <div className="battle-progress-copy">
              <strong>{t('battle.percentComplete', { percent: progressPercent })}</strong>
              <span>{t('battle.remainingMatchesEstimate', { count: Math.max(0, session.targetRounds - decisionCount) })}</span>
            </div>
            <div className="battle-phase-note">
              <strong>{battlePhase}</strong>
              <span>{battlePhaseDescription}</span>
            </div>
            <div className="battle-progress-bar">
              <div className="battle-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </section>

          <section className="container battle-match-grid">
            <article className="battle-card glass-heavy">
              <div className="battle-card-cover">
                <img src={getTitleArtwork(leftTitle)} alt="" />
                <div className="battle-card-body">
                  <small className="battle-card-meta">{getMetaLine(leftTitle)}</small>
                  <h2>{getDisplayName(leftTitle)}</h2>
                  <div className="battle-card-tags">
                    {(leftTitle?.tags || []).slice(0, 3).map(tag => (
                      <span key={tag} className="battle-card-tag">{tag}</span>
                    ))}
                  </div>
                  <Button variant="primary" icon={<Swords size={16} />} onClick={() => handleVote('left')}>{t('battle.chooseLeft')}</Button>
                </div>
              </div>
            </article>

            <div className="battle-vs-column">
              <div className="battle-vs-badge">{t('battle.versus')}</div>
              <div className="battle-center-actions">
                <Button variant="ghost" size="sm" onClick={() => handleVote('tie')}>{t('battle.tie')}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleVote('skip')}>{t('battle.skip')}</Button>
                <Button variant="ghost" size="sm" onClick={handleUndo} disabled={session.history.length === 0}>{t('battle.back')}</Button>
                <Button variant="secondary" size="sm" onClick={handleFinish}>{t('battle.finishNow')}</Button>
              </div>
            </div>

            <article className="battle-card glass-heavy">
              <div className="battle-card-cover">
                <img src={getTitleArtwork(rightTitle)} alt="" />
                <div className="battle-card-body">
                  <small className="battle-card-meta">{getMetaLine(rightTitle)}</small>
                  <h2>{getDisplayName(rightTitle)}</h2>
                  <div className="battle-card-tags">
                    {(rightTitle?.tags || []).slice(0, 3).map(tag => (
                      <span key={tag} className="battle-card-tag">{tag}</span>
                    ))}
                  </div>
                  <Button variant="primary" icon={<ArrowLeftRight size={16} />} onClick={() => handleVote('right')}>{t('battle.chooseRight')}</Button>
                </div>
              </div>
            </article>
          </section>

          <section className="container battle-section">
            <div className="battle-section-head">
              <h2>{t('battle.currentLeaders')}</h2>
              <p>{t('battle.currentLeadersHint')}</p>
            </div>
            <div className="battle-leaderboard glass-heavy">
              {leaders.length === 0 ? (
                <p>{t('battle.noLeaderYet')}</p>
              ) : (
                leaders.map((title, index) => (
                  <div key={title.id} className="battle-leader-row">
                    <span className="battle-leader-pos">#{index + 1}</span>
                    <div className="battle-leader-thumb">
                      <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                    </div>
                    <strong className="battle-leader-name">{getDisplayName(title)}</strong>
                    <small className="battle-leader-score">{t('battle.points', { count: title.score || 0 })}</small>
                  </div>
                ))
              )}
            </div>
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
    </div>
  );
}

export default BattleHub;
