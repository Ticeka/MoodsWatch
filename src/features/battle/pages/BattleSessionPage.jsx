import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, ChevronLeft, Copy, Crown, ExternalLink, Medal, Music, Play, RotateCcw, Swords, Trophy } from 'lucide-react';
import {
  getBattleDecisionCount,
  getBattleSession,
  getBattleSessionSummary,
  getLiveBattleRanking,
  getStoredBattleSessions,
  recordBattleVote,
  restartBattleSession,
  saveBattleSession,
  undoBattleVote,
} from '@/features/battle/lib/battleStore';
import {
  fetchBattleCommunityRollup,
  fetchRemoteBattleSession,
  persistRemoteBattleSession as persistRemoteBattleSessionRemote,
} from '@/features/battle/lib/battleRemote';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import {
  getCatalogEntityMeta,
  getCatalogEntityName,
  isThemeSongEntity,
  isTrailerEntity,
} from '@/shared/lib/catalogEntities';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { normalizeTrailer } from '@/shared/lib/trailers';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import { TrailerModal } from '@/shared/components/ui/TrailerModal';
import './Battle.css';

const COMMUNITY_ROLLUP_RETRY_DELAYS_MS = [0, 250, 500, 1000, 1500, 2000];

function getDisplayName(title) { return getCatalogEntityName(title); }
function getMetaLine(title) { return getCatalogEntityMeta(title); }

function getBattleSongRoleLabel(title) {
  return title?.theme_label || title?.role || 'Theme song';
}

function mergeSessionsByRecency(localSessions = [], remoteSessions = []) {
  const all = [...localSessions, ...remoteSessions];
  const seen = new Map();
  for (const s of all) {
    const existing = seen.get(s.id);
    if (!existing || new Date(s.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      seen.set(s.id, s);
    }
  }
  return [...seen.values()].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function waitForBattleRollup(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchBattleCommunityRollupWithRetry(deckFingerprint, { isCancelled = () => false } = {}) {
  const normalizedFingerprint = String(deckFingerprint || '').trim();
  if (!normalizedFingerprint) {
    return null;
  }

  for (let attempt = 0; attempt < COMMUNITY_ROLLUP_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await waitForBattleRollup(COMMUNITY_ROLLUP_RETRY_DELAYS_MS[attempt]);
    }

    if (isCancelled()) {
      return null;
    }

    try {
      const rollup = await fetchBattleCommunityRollup(normalizedFingerprint);
      if (rollup) {
        return rollup;
      }
    } catch (error) {
      if (attempt === COMMUNITY_ROLLUP_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
    }
  }

  return null;
}

function buildLocalBattleCommunityRollup(session) {
  if (session?.status !== 'completed') {
    return null;
  }

  const ranking = Array.isArray(session?.ranking) && session.ranking.length > 0
    ? session.ranking
    : getLiveBattleRanking(session);

  if (!Array.isArray(ranking) || ranking.length === 0) {
    return null;
  }

  return {
    deck_fingerprint: session?.deckFingerprint || '',
    completed_session_count: 1,
    community_ranking: ranking.map((title, index) => ({
      ...title,
      avg_rank: index + 1,
      avg_score: Number(title?.score || 0),
      first_place_count: index === 0 ? 1 : 0,
    })),
  };
}

function hasCommunityRollupSamples(rollup) {
  return Boolean(
    Number(rollup?.completed_session_count || 0) > 0
    || (Array.isArray(rollup?.community_ranking) && rollup.community_ranking.length > 0)
  );
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
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatRankDelta(delta, t) {
  if (!Number.isFinite(delta) || delta === 0) return t('battle.sameAsCommunity');
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

function BattleMatchCard({ title, trailer, voteLabel, voteIcon, onVote, onPlayTrailer }) {
  const { t } = useLanguage();
  if (!title) return null;
  const displayName = getDisplayName(title) || t('battle.catalogFallback');
  const isSong = isThemeSongEntity(title);

  if (isSong) {
    let embedUrl = null;
    let watchUrl = null;
    if (title.video_url) {
      const rawUrl = String(title.video_url).trim();
      const normalized = normalizeTrailer({ trailer_url: rawUrl });
      embedUrl = normalized?.embedUrl || null;
      watchUrl = normalized?.watchUrl || rawUrl;
    }
    const hasSongMedia = Boolean(embedUrl || watchUrl);
    const posterUrl = title.trailer_thumbnail_url || getTitleArtwork(title);

    return (
      <article className="battle-card battle-card--media glass-heavy">
        <div className="battle-card-media-wrap">
          <div className="battle-card-media-nonembed battle-card-media-nonembed--song">
            <div className="battle-card-media-blur-bg" style={{ backgroundImage: `url(${posterUrl})` }} />
            <img src={posterUrl} alt="" className="battle-card-media-foreground" />
            <div className="battle-card-media-nonembed-overlay battle-card-media-nonembed-overlay--song">
              {hasSongMedia ? (
                <button
                  type="button"
                  className="battle-card-media-open-btn"
                  onClick={onPlayTrailer}
                  aria-label={`Preview ${displayName}`}
                >
                  <Play size={18} /><span>Preview song</span>
                </button>
              ) : (
                <span className="battle-card-media-status">No preview available</span>
              )}
            </div>
          </div>
        </div>
        <div className="battle-card-info">
          <div className="battle-card-info-text">
            <span className="battle-card-song-type-badge"><Music size={10} />{getBattleSongRoleLabel(title)}</span>
            <h2>{displayName}</h2>
            <p className="battle-card-info-sub">{[title.artist_name || title.voice_actor_name, title.sourceTitleName].filter(Boolean).join(' · ')}</p>
          </div>
          <Button variant="primary" icon={voteIcon} onClick={onVote}>{voteLabel}</Button>
        </div>
      </article>
    );
  }

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
            <iframe className="battle-card-media-frame" src={embedUrl} title={displayName} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          ) : watchUrl ? (
            <div className="battle-card-media-nonembed">
              <div className="battle-card-media-blur-bg" style={{ backgroundImage: `url(${thumbnailUrl})` }} />
              <img src={thumbnailUrl} alt="" className="battle-card-media-foreground" />
              <div className="battle-card-media-nonembed-overlay">
                <a href={watchUrl} target="_blank" rel="noreferrer" className="battle-card-media-open-btn">
                  <ExternalLink size={18} /><span>ดู {providerBadge}</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="battle-card-media-nonembed">
              <div className="battle-card-media-blur-bg" style={{ backgroundImage: `url(${thumbnailUrl})` }} />
              <img src={thumbnailUrl} alt="" className="battle-card-media-foreground" />
            </div>
          )}
        </div>
        <div className="battle-card-info">
          <div className="battle-card-info-text">
            <span className="battle-card-song-type-badge"><Play size={10} />{providerBadge}</span>
            <h2>{displayName}</h2>
            <p className="battle-card-info-sub">{getMetaLine(title)}</p>
          </div>
          <Button variant="primary" icon={voteIcon} onClick={onVote}>{voteLabel}</Button>
        </div>
      </article>
    );
  }

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
              <Button type="button" variant="ghost" size="sm" icon={<Play size={14} />} className="battle-card-trailer-inline-action" onClick={onPlayTrailer} aria-label={t('titleDetail.playTrailerForTitle', { title: displayName })}>
                {t('titleDetail.metaTrailer')}
              </Button>
              {trailer.watchUrl ? (
                <a href={trailer.watchUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm battle-card-trailer-inline-action battle-card-trailer-link">
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
  const [communityRefreshTick, setCommunityRefreshTick] = useState(0);
  const [trailerModal, setTrailerModal] = useState(null);
  const [songModal, setSongModal] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const localSession = getBattleSession(sessionId);
      if (!cancelled) setSession(localSession || null);

      if (user?.id) {
        try {
          const remoteSession = await fetchRemoteBattleSession(user.id, sessionId);
          const resolvedSession = mergeSessionsByRecency(
            localSession ? [localSession] : [],
            remoteSession ? [remoteSession] : []
          )[0] || null;
          if (!cancelled) {
            setSession(resolvedSession);
            if (resolvedSession) saveBattleSession(resolvedSession);
          }
          return;
        } catch (loadError) {
          console.warn('Failed to load remote battle session', loadError);
        }
      }

      if (!cancelled && !localSession) setSession(null);
    }

    loadSession();
    return () => { cancelled = true; };
  }, [sessionId, user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadCommunityRollup() {
      if (!session?.deckFingerprint) {
        if (!cancelled) {
          setCommunityRollup(null);
          setIsCommunityLoading(false);
        }
        return;
      }

      if (session?.status !== 'completed') {
        setIsCommunityLoading(false);
        try {
          const rollup = await fetchBattleCommunityRollup(session.deckFingerprint);
          if (!cancelled) {
            setCommunityRollup(rollup);
          }
        } catch (loadError) {
          console.warn('Failed to prefetch battle community rollup', loadError);
          if (!cancelled) {
            setCommunityRollup(null);
          }
        }
        return;
      }

      setIsCommunityLoading(true);
      try {
        const rollup = await fetchBattleCommunityRollupWithRetry(session.deckFingerprint, {
          isCancelled: () => cancelled,
        });
        if (!cancelled) setCommunityRollup(rollup);
      } catch (loadError) {
        console.warn('Failed to load battle community rollup', loadError);
        if (!cancelled) setCommunityRollup(null);
      } finally {
        if (!cancelled) setIsCommunityLoading(false);
      }
    }

    loadCommunityRollup();
    return () => { cancelled = true; };
  }, [communityRefreshTick, session?.deckFingerprint, session?.status]);

  const titleMap = useMemo(
    () => new Map((session?.titles || []).map((title) => [title.id, title])),
    [session]
  );

  const leftTitle = session?.currentPair ? titleMap.get(session.currentPair.leftId) : null;
  const rightTitle = session?.currentPair ? titleMap.get(session.currentPair.rightId) : null;
  const leftTrailer = useMemo(() => normalizeTrailer(leftTitle || {}), [leftTitle]);
  const rightTrailer = useMemo(() => normalizeTrailer(rightTitle || {}), [rightTitle]);
  const ranking = session?.ranking || getLiveBattleRanking(session);
  const winner = ranking[0] || null;
  const runnerUps = ranking.slice(1, 3);
  const fallbackCommunityRollup = useMemo(
    () => buildLocalBattleCommunityRollup(session),
    [session]
  );
  const hasRemoteCommunityRollup = hasCommunityRollupSamples(communityRollup);
  const isUsingFallbackCommunityRollup = !hasRemoteCommunityRollup && Boolean(fallbackCommunityRollup);
  const effectiveCommunityRollup = hasRemoteCommunityRollup ? communityRollup : fallbackCommunityRollup;
  const communityRanking = useMemo(
    () => effectiveCommunityRollup?.community_ranking || [],
    [effectiveCommunityRollup]
  );
  const communityWinner = communityRanking[0] || null;
  const communitySampleCount = Number(effectiveCommunityRollup?.completed_session_count || 0);
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
        if (!communityRank) return null;
        return { title, yourRank: index + 1, communityRank, delta: (index + 1) - communityRank };
      })
      .filter(Boolean);
    const mostHigherThanCommunity = comparableTitles.filter((e) => e.delta < 0).sort((a, b) => a.delta - b.delta)[0] || null;
    const mostLowerThanCommunity = comparableTitles.filter((e) => e.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null;
    return { comparableCount: comparableTitles.length, mostHigherThanCommunity, mostLowerThanCommunity };
  }, [communityRankMap, ranking]);
  const recentBattleHistory = useMemo(
    () => getStoredBattleSessions().filter((entry) => entry.id !== session?.id).slice(0, 4),
    [session?.id]
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
    if (persisted?.status === 'completed') {
      setCommunityRollup((current) => (
        hasCommunityRollupSamples(current)
          ? current
          : buildLocalBattleCommunityRollup(persisted)
      ));
    }
    if (user?.id) {
      try {
        const remotePersisted = await persistRemoteBattleSessionRemote(user.id, persisted);
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
    if (persisted?.status === 'completed' && persisted?.deckFingerprint) {
      setCommunityRefreshTick((current) => current + 1);
    }
  };

  const handleVote = async (result) => { await updateSession(recordBattleVote(session, result)); };
  const handleUndo = async () => { await updateSession(undoBattleVote(session)); };
  const handleRestart = async () => { await updateSession(restartBattleSession(session)); };

  const handleShare = async () => {
    const text = `${session?.deckLabel || 'Battle'}\nWinner: ${winner ? getDisplayName(winner) : '-'}\nmoodtoon.app/battle/${session?.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Battle Result', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success(t('battle.copiedToClipboard'));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error(t('battle.shareFailed'));
    }
  };

  const handleDownloadShareCard = async () => {
    if (!session || !winner) { toast.error(t('battle.exportNotReady')); return; }
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
      if (titleObj?.video_url) setSongModal(titleObj);
      return;
    }
    if (trailer) setTrailerModal({ embedUrl: trailer.embedUrl || null, watchUrl: trailer.watchUrl || null, title: getDisplayName(titleObj) || '' });
  };

  return (
    <div className="battle-page">
      <div className="battle-play-bar">
        <div className="container battle-play-bar-inner">
          <Link className="battle-play-back" to="/battle">
            <ChevronLeft size={15} /><span>{t('battle.hub')}</span>
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
              <div className="battle-result-cover"><img src={getTitleArtwork(winner)} alt="" /></div>
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
                {isCommunityLoading
                  ? t('battle.loadingCommunity')
                  : hasRemoteCommunityRollup
                    ? t('battle.communitySynced')
                    : isUsingFallbackCommunityRollup
                      ? t('battle.communityStarting')
                      : t('battle.communityPending')}
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
                {hasRemoteCommunityRollup
                  ? t('battle.communityCompareSummary', { count: communitySampleCount })
                  : isUsingFallbackCommunityRollup
                    ? t('battle.communityStartingSummary')
                    : t('battle.communityComparePending')}
              </p>
            </div>
            {communityWinner ? (
              <div className="battle-community-grid">
                <article className="battle-community-card glass-heavy">
                  <span className="battle-kicker">{t('battle.yourWinner')}</span>
                  <div className="battle-community-highlight">
                    <div className="battle-community-thumb"><img src={getTitleArtwork(winner)} alt="" loading="lazy" /></div>
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
                    <div className="battle-community-thumb"><img src={getTitleArtwork(communityWinner)} alt="" loading="lazy" /></div>
                    <div className="battle-community-copy">
                      <strong>{getDisplayName(communityWinner)}</strong>
                      <small>{getMetaLine(communityWinner)}</small>
                      <span>{t('battle.avgRankSummary', { avg: Number(communityWinner.avg_rank || 0).toFixed(2), count: communityWinner.first_place_count || 0 })}</span>
                    </div>
                  </div>
                </article>
              </div>
            ) : (
              <div className="glass-heavy battle-empty-state">{t('battle.noCommunityComparison')}</div>
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
                  <Button variant={communityRankView === 'top5' ? 'primary' : 'ghost'} size="sm" onClick={() => setCommunityRankView('top5')}>{t('battle.showTopFive')}</Button>
                  <Button variant={communityRankView === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setCommunityRankView('all')}>{t('battle.showAll')}</Button>
                </div>
              </div>
              <div className="battle-ranking-list glass-heavy">
                {visibleCommunityRanking.map((title, index) => (
                  <div key={title.id} className="battle-ranking-row">
                    <div className="battle-ranking-main">
                      <span className="battle-ranking-position">#{communityRankView === 'all' ? communityRankMap.get(title.id) || index + 1 : index + 1}</span>
                      <div className="battle-ranking-thumb"><img src={getTitleArtwork(title)} alt="" loading="lazy" /></div>
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
                      <div className="battle-community-thumb"><img src={getTitleArtwork(rankDeltaInsights.mostHigherThanCommunity.title)} alt="" loading="lazy" /></div>
                      <div className="battle-community-copy">
                        <strong>{getDisplayName(rankDeltaInsights.mostHigherThanCommunity.title)}</strong>
                        <small>{getMetaLine(rankDeltaInsights.mostHigherThanCommunity.title)}</small>
                        <span>{t('battle.yourRankVsCommunity', { yourRank: rankDeltaInsights.mostHigherThanCommunity.yourRank, communityRank: rankDeltaInsights.mostHigherThanCommunity.communityRank })}</span>
                      </div>
                    </div>
                  ) : <span>{t('battle.noHigherThanCommunity')}</span>}
                </article>
                <article className="battle-community-card glass-heavy">
                  <span className="battle-kicker">{t('battle.communityRatedHigher')}</span>
                  {rankDeltaInsights.mostLowerThanCommunity ? (
                    <div className="battle-community-highlight">
                      <div className="battle-community-thumb"><img src={getTitleArtwork(rankDeltaInsights.mostLowerThanCommunity.title)} alt="" loading="lazy" /></div>
                      <div className="battle-community-copy">
                        <strong>{getDisplayName(rankDeltaInsights.mostLowerThanCommunity.title)}</strong>
                        <small>{getMetaLine(rankDeltaInsights.mostLowerThanCommunity.title)}</small>
                        <span>{t('battle.yourRankVsCommunity', { yourRank: rankDeltaInsights.mostLowerThanCommunity.yourRank, communityRank: rankDeltaInsights.mostLowerThanCommunity.communityRank })}</span>
                      </div>
                    </div>
                  ) : <span>{t('battle.noLowerThanCommunity')}</span>}
                </article>
              </div>
            </section>
          )}

          <section className="container battle-section">
            <div className="battle-podium-grid">
              <div className="battle-podium-card battle-podium-card-winner glass-heavy">
                <div className="battle-podium-cover"><img src={getTitleArtwork(winner)} alt="" loading="lazy" /></div>
                <span className="battle-podium-rank"><Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #1</span>
                <strong>{winner ? getDisplayName(winner) : '-'}</strong>
                <small>{winner ? getMetaLine(winner) : t('battle.winnerFallback')}</small>
              </div>
              {runnerUps.map((title, index) => (
                <div key={title.id} className="battle-podium-card glass-heavy">
                  <div className="battle-podium-cover"><img src={getTitleArtwork(title)} alt="" loading="lazy" /></div>
                  <span className="battle-podium-rank"><Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #{index + 2}</span>
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
                      <div className="battle-ranking-thumb"><img src={getTitleArtwork(title)} alt="" loading="lazy" /></div>
                      <div className="battle-ranking-title-group">
                        <strong>{getDisplayName(title)}</strong>
                        <small>{getMetaLine(title)}</small>
                      </div>
                    </div>
                    <div className="battle-ranking-metrics">
                      <span>{t('battle.tierLabel', { tier })}</span>
                      {communityRank ? (
                        <span className={`battle-rank-delta ${rankDelta === 0 ? 'is-even' : rankDelta < 0 ? 'is-higher' : 'is-lower'}`} title={formatRankDelta(rankDelta, t)}>
                          {rankDelta === 0 ? t('battle.communityRank', { rank: communityRank }) : rankDelta < 0 ? t('battle.aboveCommunity', { count: Math.abs(rankDelta) }) : t('battle.belowCommunity', { count: rankDelta })}
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
                      <div className="battle-history-thumb"><img src={getTitleArtwork(summary?.winner || entry.titles?.[0])} alt="" loading="lazy" /></div>
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
              <div className="glass-heavy battle-empty-state">{t('battle.noOtherBattleSessions')}</div>
            )}
          </section>
        </>
      )}
      {trailerModal && (
        <TrailerModal embedUrl={trailerModal.embedUrl} watchUrl={trailerModal.watchUrl} title={trailerModal.title} onClose={() => setTrailerModal(null)} />
      )}
      {songModal && (
        <ThemeSongModal song={songModal} onClose={() => setSongModal(null)} />
      )}
    </div>
  );
}
