import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { normalizeBattleLeaderboardRows } from '@/features/battle/lib/leaderboard';
import { Trophy, TrendingUp, Swords, ChevronLeft } from 'lucide-react';
import '../styles/BattleLeaderboard.css';

const PAGE_SIZE = 25;

const FILTERS = ['elo', 'wins', 'win_rate'];

export function BattleLeaderboard() {
  const { t } = useLanguage();
  const { showAdult } = useAgeGate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('elo');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLeaderboard = useCallback(async (sort, pageNum) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const orderCol = sort === 'elo' ? 'elo_score' : sort === 'wins' ? 'wins' : 'wins';
      const { data, error } = await supabase
        .from('battle_title_stats')
        .select(`
          title_id,
          wins,
          losses,
          total_votes,
          win_rate,
          elo_score,
          canonical_titles!inner(
            id, canonical_title, slug, cover_image, type, is_adult
          )
        `)
        .gte('total_votes', 3)
        .eq('canonical_titles.is_adult', showAdult)
        .order(orderCol, { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      const mapped = normalizeBattleLeaderboardRows(data, showAdult);

      if (sort === 'win_rate') {
        mapped.sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
      }

      setEntries(pageNum === 0 ? mapped : (prev) => [...prev, ...mapped]);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (err) {
      console.warn('Failed to load leaderboard:', err.message);
    } finally {
      setLoading(false);
    }
  }, [showAdult]);

  useEffect(() => {
    setPage(0);
    setEntries([]);
    fetchLeaderboard(sortBy, 0);
  }, [sortBy, showAdult, fetchLeaderboard]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(sortBy, nextPage);
  };

  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <div className="leaderboard-page animate-fade-in">
      <section className="section pb-0">
        <div className="container">
          <div className="leaderboard-header">
            <Link to="/battle" className="leaderboard-back">
              <ChevronLeft size={16} /> {t('leaderboard.back')}
            </Link>
            <div className="leaderboard-hero">
              <span className="leaderboard-eyebrow">
                <Trophy size={14} /> {t('leaderboard.eyebrow')}
              </span>
              <h1 className="section-heading">{t('leaderboard.title')}</h1>
              <p className="leaderboard-subtitle">{t('leaderboard.subtitle')}</p>
            </div>
          </div>

          <div className="leaderboard-filter-row">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`leaderboard-filter-btn${sortBy === f ? ' active' : ''}`}
                onClick={() => setSortBy(f)}
              >
                {t(`leaderboard.sortBy.${f}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {loading && entries.length === 0 ? (
            <div className="leaderboard-loading">
              <Swords size={32} opacity={0.3} />
              <p>{t('common.loading')}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="leaderboard-empty">
              <Swords size={32} opacity={0.25} />
              <p>{t('leaderboard.noData')}</p>
            </div>
          ) : (
            <>
              <div className="leaderboard-table">
                <div className="leaderboard-table-head">
                  <span className="lb-col lb-rank">#</span>
                  <span className="lb-col lb-title">{t('leaderboard.colTitle')}</span>
                  <span className="lb-col lb-stat">{t('leaderboard.colWins')}</span>
                  <span className="lb-col lb-stat">{t('leaderboard.colWinRate')}</span>
                  <span className="lb-col lb-stat lb-elo">ELO</span>
                </div>
                {entries.map((entry, i) => {
                  const displayTitle = entry.title?.canonical_title || '—';
                  const rankIcon = getRankIcon(i + 1);
                  const winPct = entry.winRate != null
                    ? `${Math.round(entry.winRate * 100)}%`
                    : '—';
                  return (
                    <Link
                      key={entry.titleId}
                      to={`/title/${entry.title?.slug || entry.titleId}`}
                      className={`leaderboard-row${i < 3 ? ' leaderboard-row--top' : ''}`}
                    >
                      <span className="lb-col lb-rank">
                        {rankIcon ? <span className="lb-rank-icon">{rankIcon}</span> : <span className="lb-rank-num">{i + 1}</span>}
                      </span>
                      <span className="lb-col lb-title">
                        {entry.title?.cover_image && (
                          <img
                            src={entry.title.cover_image}
                            alt=""
                            className="lb-cover"
                            loading="lazy"
                          />
                        )}
                        <span className="lb-title-text">{displayTitle}</span>
                      </span>
                      <span className="lb-col lb-stat">
                        <strong>{entry.wins}</strong>
                        <span className="lb-stat-sub">/ {entry.totalVotes}</span>
                      </span>
                      <span className="lb-col lb-stat">
                        <span className={`lb-winrate${entry.winRate >= 0.7 ? ' high' : entry.winRate <= 0.35 ? ' low' : ''}`}>
                          {winPct}
                        </span>
                      </span>
                      <span className="lb-col lb-stat lb-elo">
                        <TrendingUp size={12} />
                        {entry.elo}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {hasMore && (
                <div className="leaderboard-load-more">
                  <button
                    className="leaderboard-load-btn"
                    onClick={handleLoadMore}
                    disabled={loading}
                  >
                    {loading ? t('common.loading') : t('leaderboard.loadMore')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default BattleLeaderboard;
