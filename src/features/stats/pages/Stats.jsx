import React, { useMemo } from 'react';
import { BarChart2, Clock, Star, TrendingUp } from 'lucide-react';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './Stats.css';

const MONTH_NAMES = {
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function buildStats(watchlist, watchlistTitles) {
  const titleMap = new Map(watchlistTitles.map((t) => [t.id, t]));

  let completedCount = 0;
  let totalMinutes = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  const genreCount = new Map();
  const genreMinutes = new Map();
  const genreScoreSum = new Map();
  const genreScoreCount = new Map();
  const activityMap = new Map(); // date → count

  for (const item of watchlist) {
    const title = titleMap.get(item.titleId);

    if (item.status === 'completed') completedCount++;

    if (item.score != null && item.score > 0) {
      scoreSum += item.score;
      scoredCount++;
    }

    // mapCanonicalTitle returns genres as string[]
    const genres = title?.genres || [];
    for (const g of genres) {
      genreCount.set(g, (genreCount.get(g) || 0) + 1);
      if (item.score != null && item.score > 0) {
        genreScoreSum.set(g, (genreScoreSum.get(g) || 0) + item.score);
        genreScoreCount.set(g, (genreScoreCount.get(g) || 0) + 1);
      }
    }

    // Activity — use lastConsumedAt, fall back to updatedAt, addedAt
    const actDate = item.lastConsumedAt || item.updatedAt || item.addedAt;
    if (actDate) {
      const d = actDate.slice(0, 10);
      activityMap.set(d, (activityMap.get(d) || 0) + 1);
    }
  }

  const genres = [...genreCount.entries()]
    .map(([name, count]) => ({
      name,
      count,
      avgScore: genreScoreCount.get(name)
        ? genreScoreSum.get(name) / genreScoreCount.get(name)
        : null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalTitles: watchlist.length,
    completedCount,
    avgScore: scoredCount > 0 ? scoreSum / scoredCount : null,
    genres,
    activityMap,
  };
}

function buildHeatmap(activityMap) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start at Sunday of the week that was 52 weeks ago
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - 52 * 7);

  const weeks = [];
  const monthLabels = []; // { weekIdx, month }
  let seenMonth = -1;
  let cur = new Date(start);
  let weekIdx = 0;

  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      if (cur > today) {
        week.push(null);
      } else {
        const iso = cur.toISOString().slice(0, 10);
        const count = activityMap.get(iso) || 0;
        const month = cur.getMonth();
        if (d === 0 && month !== seenMonth) {
          monthLabels.push({ weekIdx, month });
          seenMonth = month;
        }
        week.push({ date: iso, count, month: cur.getMonth() });
      }
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    weekIdx++;
  }

  return { weeks, monthLabels };
}

function cellLevel(count) {
  if (count === 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

export function Stats() {
  const { watchlist, watchlistTitles, isLoading } = useWatchlist();
  const { t, language } = useLanguage();

  const stats = useMemo(
    () => buildStats(watchlist, watchlistTitles),
    [watchlist, watchlistTitles]
  );

  const { weeks, monthLabels } = useMemo(
    () => buildHeatmap(stats.activityMap),
    [stats.activityMap]
  );

  const topGenres = stats.genres.slice(0, 10);
  const maxCount = topGenres.length > 0 ? topGenres[0].count : 1;
  const monthNames = MONTH_NAMES[language] ?? MONTH_NAMES.en;

  if (isLoading) {
    return (
      <div className="stats-page container">
        <div className="stats-loading">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="stats-page container">
      {/* Header */}
      <div className="stats-header">
        <div className="stats-eyebrow">
          <BarChart2 size={14} />
          {t('stats.eyebrow')}
        </div>
        <h1 className="stats-title">{t('stats.title')}</h1>
        <p className="stats-subtitle">{t('stats.subtitle')}</p>
      </div>

      {/* Summary Cards */}
      <div className="stats-summary-grid">
        <div className="stats-card">
          <div className="stats-card-value">{stats.totalTitles}</div>
          <div className="stats-card-label">{t('stats.totalTitles')}</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{stats.completedCount}</div>
          <div className="stats-card-label">{t('stats.completed')}</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">
            {stats.avgScore != null ? stats.avgScore.toFixed(1) : '—'}
          </div>
          <div className="stats-card-label">{t('stats.avgScore')}</div>
        </div>
      </div>

      {/* Activity Heatmap */}
      <section className="stats-section">
        <h2 className="stats-section-title">
          <Clock size={16} />
          {t('stats.heatmapTitle')}
        </h2>
        <div className="stats-heatmap-outer">
          {/* Month labels */}
          <div className="stats-heatmap-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 12px)` }}>
            {weeks.map((_, wi) => {
              const label = monthLabels.find((m) => m.weekIdx === wi);
              return (
                <div key={wi} className="stats-month-label">
                  {label ? monthNames[label.month] : ''}
                </div>
              );
            })}
          </div>
          {/* Grid */}
          <div className="stats-heatmap">
            {weeks.map((week, wi) => (
              <div key={wi} className="stats-heatmap-col">
                {week.map((day, di) =>
                  day === null ? (
                    <div key={di} className="stats-cell stats-cell--empty" />
                  ) : (
                    <div
                      key={di}
                      className={`stats-cell stats-cell--l${cellLevel(day.count)}`}
                      title={`${day.date}${day.count > 0 ? ` · ${day.count}` : ''}`}
                    />
                  )
                )}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="stats-heatmap-legend">
            <span>{t('stats.less')}</span>
            <div className="stats-cell stats-cell--l0" />
            <div className="stats-cell stats-cell--l1" />
            <div className="stats-cell stats-cell--l2" />
            <div className="stats-cell stats-cell--l3" />
            <span>{t('stats.more')}</span>
          </div>
        </div>
      </section>

      {/* Top Genres Bar Chart */}
      <section className="stats-section">
        <h2 className="stats-section-title">
          <TrendingUp size={16} />
          {t('stats.topGenres')}
        </h2>
        {topGenres.length === 0 ? (
          <div className="stats-empty">{t('stats.noData')}</div>
        ) : (
          <div className="stats-bars">
            {topGenres.map((g) => (
              <div key={g.name} className="stats-bar-row">
                <div className="stats-bar-label">{g.name}</div>
                <div className="stats-bar-track">
                  <div
                    className="stats-bar-fill"
                    style={{ width: `${(g.count / maxCount) * 100}%` }}
                  />
                </div>
                <div className="stats-bar-count">{g.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Genre Breakdown Table */}
      <section className="stats-section">
        <h2 className="stats-section-title">
          <Star size={16} />
          {t('stats.genreBreakdown')}
        </h2>
        {stats.genres.length === 0 ? (
          <div className="stats-empty">{t('stats.noData')}</div>
        ) : (
          <div className="stats-genre-table">
            <div className="stats-genre-head">
              <span>{t('stats.colGenre')}</span>
              <span>{t('stats.colCount')}</span>
              <span>{t('stats.colAvgScore')}</span>
            </div>
            {stats.genres.slice(0, 25).map((g) => (
              <div key={g.name} className="stats-genre-row">
                <span className="stats-genre-name">{g.name}</span>
                <span>{g.count}</span>
                <span>{g.avgScore != null ? g.avgScore.toFixed(1) : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
