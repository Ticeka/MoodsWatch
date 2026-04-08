import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, CopyPlus, Flag, Layers, Library,
  RefreshCw, Search, TrendingUp, Zap, AlertTriangle,
  Eye, MousePointer, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import { fetchAdminAnalyticsData } from '@/features/admin/api';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { CONTENT_REPORT_ISSUE_OPTIONS, CONTENT_REPORT_STATUS_OPTIONS } from '@/shared/lib/contentReports';
import { DUPLICATE_STATUS_OPTIONS } from '@/shared/lib/duplicates';
import { getTitleTypeMeta } from '@/shared/lib/titleType';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

// ─── helpers ───────────────────────────────────────────────────────────────

function pct(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

function buildCountMap(rows, key, options) {
  return options.reduce((acc, o) => {
    acc[o.value] = rows.filter((r) => r[key] === o.value).length;
    return acc;
  }, {});
}

function buildTopItems(items = [], getKey, limit = 8) {
  const counts = new Map();
  items.forEach((item) => {
    const k = String(getKey(item) || '').trim();
    if (!k) return;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function groupByDay(rows, getDate, daysBack = 14) {
  const buckets = {};
  const now = Date.now();
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  rows.forEach((r) => {
    const d = getDate(r)?.slice(0, 10);
    if (d && d in buckets) buckets[d] += 1;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

// ─── chart primitives ──────────────────────────────────────────────────────

function BarChart({ data, color = 'var(--primary-500)', height = 120, label }) {
  if (!data?.length) return <div className="an-chart-empty">No data</div>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="an-bar-chart" style={{ '--bar-color': color }}>
      {label && <div className="an-chart-label">{label}</div>}
      <div className="an-bar-chart-inner" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="an-bar-col" title={`${d.label}: ${d.count}`}>
            <div className="an-bar-val">{d.count > 0 && d.count}</div>
            <div
              className="an-bar-fill"
              style={{ height: `${pct(d.count, max)}%` }}
            />
            <div className="an-bar-tick">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBar({ data, color = 'var(--primary-500)', maxLabel = 8 }) {
  if (!data?.length) return <div className="an-chart-empty">No data</div>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="an-hbar-list">
      {data.slice(0, maxLabel).map((d, i) => (
        <div key={i} className="an-hbar-row" title={`${d.label}: ${d.count}`}>
          <span className="an-hbar-rank">{i + 1}</span>
          <span className="an-hbar-label">{d.label}</span>
          <div className="an-hbar-track">
            <div
              className="an-hbar-fill"
              style={{ width: `${pct(d.count, max)}%`, background: color }}
            />
          </div>
          <span className="an-hbar-count">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ data, color = 'var(--primary-500)', height = 52 }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 200;
  const h = height;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.count / max) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `0,${h} ${pts.join(' ')} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="an-sparkline">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={area}
        fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`}
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DonutChart({ segments, size = 120 }) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (!total) return <div className="an-chart-empty">No data</div>;

  const r = 38;
  const cx = 60;
  const circ = 2 * Math.PI * r;
  const { arcs } = segments.reduce((acc, seg) => {
    const fraction = seg.value / total;
    const dash = fraction * circ;
    acc.arcs.push({ ...seg, dash, gap: circ - dash, offset: acc.offset });
    acc.offset += dash;
    return acc;
  }, { arcs: [], offset: 0 });

  return (
    <div className="an-donut-wrap">
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border-default)" strokeWidth="16" />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="16"
            strokeDasharray={`${arc.dash} ${arc.gap}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cx}px` }}
          >
            <title>{arc.label}: {arc.value}</title>
          </circle>
        ))}
        <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="800" fill="var(--text-primary)">
          {total.toLocaleString()}
        </text>
        <text x={cx} y={cx + 14} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="var(--text-tertiary)" textLength="50" lengthAdjust="spacing">
          total
        </text>
      </svg>
      <div className="an-donut-legend">
        {arcs.map((arc, i) => (
          <div key={i} className="an-legend-item">
            <span className="an-legend-dot" style={{ background: arc.color }} />
            <span className="an-legend-label">{arc.label}</span>
            <span className="an-legend-val">{arc.value}</span>
            <span className="an-legend-pct">{pct(arc.value, total)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({ steps }) {
  if (!steps?.length) return <div className="an-chart-empty">No data</div>;
  const max = steps[0]?.value || 1;

  return (
    <div className="an-funnel">
      {steps.map((step, i) => {
        const width = pct(step.value, max);
        const dropPct = i > 0 ? 100 - pct(step.value, steps[i - 1].value) : null;
        return (
          <div key={i} className="an-funnel-step">
            <div className="an-funnel-meta">
              <span className="an-funnel-name">{step.label}</span>
              {dropPct !== null && (
                <span className="an-funnel-drop" style={{ color: dropPct > 30 ? '#ef4444' : '#f59e0b' }}>
                  −{dropPct}%
                </span>
              )}
            </div>
            <div className="an-funnel-track">
              <div className="an-funnel-fill" style={{ width: `${width}%`, background: step.color || 'var(--primary-500)' }} />
            </div>
            <span className="an-funnel-val">{step.value.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatChip({ label, value, color, icon: Icon }) {
  return (
    <div className="an-stat-chip" style={{ '--chip-color': color }}>
      {Icon && <Icon size={14} className="an-chip-icon" />}
      <div>
        <div className="an-chip-value">{value}</div>
        <div className="an-chip-label">{label}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, accent = 'var(--primary-500)' }) {
  return (
    <div className="an-section-head" style={{ '--section-accent': accent }}>
      <div className="an-section-icon"><Icon size={18} /></div>
      <div>
        <h2 className="an-section-title">{title}</h2>
        {subtitle && <p className="an-section-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

function Panel({ children, className = '' }) {
  return <div className={`an-panel ${className}`}>{children}</div>;
}

function PanelTitle({ children }) {
  return <h3 className="an-panel-title">{children}</h3>;
}

// ─── main component ────────────────────────────────────────────────────────

export function AdminAnalytics() {
  const { language } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [activeTab, setActiveTab] = useState('search');

  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics-summary'],
    queryFn: fetchAdminAnalyticsData,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  const data = analyticsQuery.data || null;
  const isRefreshing = analyticsQuery.isFetching && !analyticsQuery.isLoading;

  // ─── derived metrics ──────────────────────────────────────────────────────

  const derived = useMemo(() => {
    if (!data) return null;

    const events = data.discoverEvents || [];
    const reports = data.reports || [];
    const dupes = data.duplicates || [];

    // Event types
    const searchViews = events.filter((e) => e.event_type === 'search_view');
    const resultClicks = events.filter((e) => e.event_type === 'result_click');
    const noResults = events.filter((e) => e.event_type === 'no_results_view');
    const presetApplies = events.filter((e) => e.event_type === 'preset_apply');
    const submits = events.filter((e) => e.event_type === 'search_submit');
    const abandons = events.filter((e) => e.event_type === 'search_abandon');
    const autocompletes = events.filter((e) => e.event_type === 'autocomplete_select');
    const recoveries = events.filter((e) => e.event_type === 'recovery_apply');

    // Rates
    const ctrRate = searchViews.length ? pct(resultClicks.length, searchViews.length) : null;
    const zeroResultRate = searchViews.length ? pct(noResults.length, searchViews.length) : null;
    const submitRate = (submits.length + abandons.length) > 0 ? pct(submits.length, submits.length + abandons.length) : null;
    const autocompleteRate = searchViews.length ? pct(autocompletes.length, searchViews.length) : null;

    const noResultSessions = new Set(noResults.map((e) => e.session_id).filter(Boolean));
    const recoverySessions = new Set(recoveries.map((e) => e.session_id).filter(Boolean));
    const recoveredCount = [...recoverySessions].filter((id) => noResultSessions.has(id)).length;
    const recoveryRate = noResultSessions.size > 0 ? pct(recoveredCount, noResultSessions.size) : null;

    // Timeseries
    const searchTimeseries = groupByDay(searchViews, (e) => e.created_at);
    const clickTimeseries = groupByDay(resultClicks, (e) => e.created_at);
    const reportTimeseries = groupByDay(reports, (e) => e.createdAt);

    // Top items
    const topQueries = buildTopItems(searchViews, (e) => e.normalized_query || e.query);
    const noResultQueries = buildTopItems(noResults, (e) => e.normalized_query || e.query);
    const clickTypes = buildTopItems(resultClicks, (e) => e.result_type);
    const presetSources = buildTopItems(presetApplies, (e) => e.preset_source || 'manual');
    const distinctQueries = new Set(searchViews.map((e) => String(e.normalized_query || e.query || '').trim()).filter(Boolean)).size;

    // Reports
    const reportStatusCounts = buildCountMap(reports, 'status', CONTENT_REPORT_STATUS_OPTIONS);
    const reportIssueCounts = buildCountMap(reports, 'issueType', CONTENT_REPORT_ISSUE_OPTIONS);
    const oldestOpen = reports.filter((r) => r.status === 'open').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;

    // Duplicates
    const dupeStatusCounts = buildCountMap(dupes, 'status', DUPLICATE_STATUS_OPTIONS);
    const avgConfidence = dupes.length ? Math.round(dupes.reduce((s, d) => s + d.confidence, 0) / dupes.length) : 0;
    const confidenceBuckets = [
      { label: 'High ≥80%', value: dupes.filter((d) => d.confidence >= 80).length, color: '#10b981' },
      { label: 'Mid 60–79%', value: dupes.filter((d) => d.confidence >= 60 && d.confidence < 80).length, color: '#f59e0b' },
      { label: 'Low <60%', value: dupes.filter((d) => d.confidence < 60).length, color: '#ef4444' },
    ];

    // Catalog type split
    const { totalAnime, totalManga, totalManhwa } = data.catalog;
    const catalogSplit = [
      { label: 'Anime', value: totalAnime, color: '#6366f1' },
      { label: 'Manga', value: totalManga, color: '#ec4899' },
      { label: 'Manhwa', value: totalManhwa, color: '#14b8a6' },
    ];

    // Collections status split
    const colSplit = [
      { label: 'Published', value: data.editorial.collections.filter((c) => c.status === 'published').length, color: '#10b981' },
      { label: 'Draft', value: data.editorial.collections.filter((c) => c.status === 'draft').length, color: '#f59e0b' },
      { label: 'Archived', value: data.editorial.collections.filter((c) => c.status === 'archived').length, color: '#94a3b8' },
    ];

    const blockTypeCounts = buildTopItems(data.editorial.blocks, (b) => b.block_type);

    // Search funnel
    const searchFunnel = [
      { label: 'Search Opened', value: searchViews.length, color: '#6366f1' },
      { label: 'Result Clicked', value: resultClicks.length, color: '#8b5cf6' },
      { label: 'Submit / Save', value: submits.length, color: '#a78bfa' },
      { label: 'No Results', value: noResults.length, color: '#ef4444' },
    ];

    // Report funnel
    const reportFunnel = [
      { label: 'Total Reports', value: reports.length, color: '#f59e0b' },
      { label: 'Open', value: reportStatusCounts.open || 0, color: '#ef4444' },
      { label: 'In Review', value: reportStatusCounts.in_review || 0, color: '#3b82f6' },
      { label: 'Resolved', value: reportStatusCounts.resolved || 0, color: '#10b981' },
    ];

    // Dupe funnel
    const dupeFunnel = [
      { label: 'All Candidates', value: dupes.length, color: '#6366f1' },
      { label: 'Pending', value: dupeStatusCounts.pending || 0, color: '#f59e0b' },
      { label: 'Approved', value: dupeStatusCounts.approved || 0, color: '#3b82f6' },
      { label: 'Merged', value: dupeStatusCounts.merged || 0, color: '#10b981' },
    ];

    return {
      searchViews, resultClicks, noResults, presetApplies, submits, abandons, autocompletes,
      ctrRate, zeroResultRate, submitRate, autocompleteRate, recoveryRate, recoveredCount,
      searchTimeseries, clickTimeseries, reportTimeseries,
      topQueries, noResultQueries, clickTypes, presetSources, distinctQueries,
      reportStatusCounts, reportIssueCounts, oldestOpen,
      dupeStatusCounts, avgConfidence, confidenceBuckets,
      catalogSplit, colSplit, blockTypeCounts,
      searchFunnel, reportFunnel, dupeFunnel,
    };
  }, [data]);

  const TABS = [
    { key: 'search', label: 'Search & Discovery', icon: Search },
    { key: 'catalog', label: 'Catalog', icon: Library },
    { key: 'editorial', label: 'Editorial', icon: Layers },
    { key: 'moderation', label: 'Moderation', icon: Flag },
    { key: 'duplicates', label: 'Duplicates', icon: CopyPlus },
  ];

  if (analyticsQuery.isLoading) {
    return (
      <div className="admin-page-content an-loading-state">
        <div className="an-loading-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="an-loading-panel">
              <div className="an-loading-bar" style={{ width: '40%', height: 14 }} />
              <div className="an-loading-bar" style={{ width: '60%', height: 80, marginTop: 12 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analyticsQuery.error || !data || !derived) {
    return (
      <div className="admin-page-content" style={{ padding: 'var(--space-10)' }}>
        <AdminStatePanel
          title="Failed to load analytics"
          description={analyticsQuery.error?.message || 'Something went wrong'}
          actionLabel="Retry"
          onAction={() => analyticsQuery.refetch()}
          tone="error"
        />
      </div>
    );
  }

  return (
    <div className="admin-page-content animate-fade-in an-root">

      {/* ─── Page header ─── */}
      <div className="an-page-header">
        <div>
          <div className="an-page-badge">
            <BarChart3 size={13} /> Analytics
          </div>
          <h1 className="an-page-title">Product Analytics</h1>
          <p className="an-page-sub">
            Deep-dive into search, catalog, editorial, and moderation health
            {data.freshness?.windowDays ? ` · last ${data.freshness.windowDays} days` : ''}
            {isRefreshing ? ' · refreshing in background' : ''}
          </p>
        </div>
        <button
          className="action-btn"
          onClick={() => analyticsQuery.refetch()}
          type="button"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          disabled={analyticsQuery.isFetching}
        >
          <RefreshCw size={14} className={analyticsQuery.isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ─── Global KPI ribbon ─── */}
      <div className="an-kpi-ribbon">
        <StatChip label="Search Views" value={derived.searchViews.length.toLocaleString()} color="#6366f1" icon={Eye} />
        <StatChip label="Result Clicks" value={derived.resultClicks.length.toLocaleString()} color="#8b5cf6" icon={MousePointer} />
        <StatChip label="CTR" value={derived.ctrRate !== null ? `${derived.ctrRate}%` : '—'} color="#10b981" icon={TrendingUp} />
        <StatChip label="Zero-Result" value={derived.zeroResultRate !== null ? `${derived.zeroResultRate}%` : '—'} color="#ef4444" icon={AlertTriangle} />
        <StatChip label="Open Reports" value={derived.reportStatusCounts.open || 0} color="#f59e0b" icon={Flag} />
        <StatChip label="Pending Dupes" value={derived.dupeStatusCounts.pending || 0} color="#ec4899" icon={CopyPlus} />
        <StatChip label="Recovery Rate" value={derived.recoveryRate !== null ? `${derived.recoveryRate}%` : '—'} color="#14b8a6" icon={CheckCircle} />
        <StatChip label="Auto-complete%" value={derived.autocompleteRate !== null ? `${derived.autocompleteRate}%` : '—'} color="#a78bfa" icon={Zap} />
      </div>

      {/* ─── Tab bar ─── */}
      <div className="an-tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`an-tab ${activeTab === tab.key ? 'an-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          TAB: Search & Discovery
      ════════════════════════════════════════ */}
      {activeTab === 'search' && (
        <div className="an-tab-content">

          <SectionHeader icon={TrendingUp} title="Activity Trends (Last 14 Days)" subtitle="Daily search views vs result clicks" accent="#6366f1" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Search Views per Day</PanelTitle>
              <BarChart
                data={derived.searchTimeseries.map((d) => ({ label: d.date.slice(5), count: d.count }))}
                color="#6366f1"
                height={120}
              />
            </Panel>
            <Panel>
              <PanelTitle>Result Clicks per Day</PanelTitle>
              <BarChart
                data={derived.clickTimeseries.map((d) => ({ label: d.date.slice(5), count: d.count }))}
                color="#8b5cf6"
                height={120}
              />
            </Panel>
          </div>

          <SectionHeader icon={Search} title="Search Funnel" subtitle="From search open → click → submit → dead end" accent="#8b5cf6" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Conversion Funnel</PanelTitle>
              <FunnelChart steps={derived.searchFunnel} />
            </Panel>
            <Panel>
              <PanelTitle>Exit Behavior Split</PanelTitle>
              <DonutChart
                segments={[
                  { label: 'Clicked result', value: derived.resultClicks.length, color: '#6366f1' },
                  { label: 'Submitted', value: derived.submits.length, color: '#10b981' },
                  { label: 'Abandoned', value: derived.abandons.length, color: '#ef4444' },
                  { label: 'No Results', value: derived.noResults.length, color: '#f59e0b' },
                ]}
              />
            </Panel>
          </div>

          <SectionHeader icon={BarChart3} title="Query Intelligence" subtitle="What users search for — and where they fail" accent="#10b981" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>🔥 Top Queries</PanelTitle>
              <HorizontalBar data={derived.topQueries} color="#6366f1" />
            </Panel>
            <Panel>
              <PanelTitle>⚠️ Zero-Result Queries</PanelTitle>
              <HorizontalBar data={derived.noResultQueries} color="#ef4444" />
            </Panel>
          </div>

          <div className="an-grid-3">
            <Panel>
              <PanelTitle>Click Type Mix</PanelTitle>
              <DonutChart
                size={100}
                segments={derived.clickTypes.map((c, i) => ({
                  label: c.label,
                  value: c.count,
                  color: ['#6366f1', '#8b5cf6', '#a78bfa', '#10b981', '#14b8a6'][i % 5],
                }))}
              />
            </Panel>
            <Panel>
              <PanelTitle>Preset Sources</PanelTitle>
              <HorizontalBar data={derived.presetSources} color="#f59e0b" maxLabel={5} />
            </Panel>
            <Panel>
              <PanelTitle>Search Health KPIs</PanelTitle>
              <div className="an-kv-grid">
                {[
                  { label: 'Distinct Queries', value: derived.distinctQueries },
                  { label: 'CTR', value: derived.ctrRate !== null ? `${derived.ctrRate}%` : '—' },
                  { label: 'Submit Rate', value: derived.submitRate !== null ? `${derived.submitRate}%` : '—' },
                  { label: 'Zero Result %', value: derived.zeroResultRate !== null ? `${derived.zeroResultRate}%` : '—' },
                  { label: 'Recovery Rate', value: derived.recoveryRate !== null ? `${derived.recoveryRate}%` : '—' },
                  { label: 'Autocomplete %', value: derived.autocompleteRate !== null ? `${derived.autocompleteRate}%` : '—' },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: Catalog
      ════════════════════════════════════════ */}
      {activeTab === 'catalog' && (
        <div className="an-tab-content">

          <SectionHeader icon={Library} title="Catalog Composition" subtitle="Type and subtype distribution across all canonical titles" accent="#10b981" />

          <div className="an-grid-3">
            <Panel>
              <PanelTitle>Type Split</PanelTitle>
              <DonutChart segments={derived.catalogSplit} />
            </Panel>
            <Panel className="an-col-span-2">
              <PanelTitle>Type Counts</PanelTitle>
              <HorizontalBar
                data={[
                  { label: 'Anime', count: data.catalog.totalAnime },
                  { label: 'Manga', count: data.catalog.totalManga },
                  { label: 'Manhwa', count: data.catalog.totalManhwa },
                ]}
                color="#10b981"
                maxLabel={3}
              />
              <div className="an-kv-grid" style={{ marginTop: 20 }}>
                {[
                  { label: 'Total Titles', value: data.catalog.totalTitles.toLocaleString() },
                  { label: 'Total Users', value: data.catalog.totalUsers.toLocaleString() },
                  { label: 'Total Lists', value: data.catalog.totalLists.toLocaleString() },
                  { label: 'Mood Tags', value: data.catalog.totalMoods.toLocaleString() },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <SectionHeader icon={TrendingUp} title="Top Rated Titles" subtitle="Highest avg_score in the catalog" accent="#6366f1" />
          <Panel>
            <PanelTitle>🏆 Top 10 Titles by Score</PanelTitle>
            <div className="an-title-table">
              <div className="an-title-table-head">
                <span>#</span><span>Title</span><span>Type</span><span>Score</span><span>Popularity</span>
              </div>
              {data.catalog.topTitles.map((title, i) => {
                const meta = getTitleTypeMeta(title.type);
                return (
                  <div key={title.id} className="an-title-row">
                    <span className="an-title-rank">{i + 1}</span>
                    <div className="an-title-info">
                      {title.cover && <img src={title.cover} alt="" className="an-title-thumb" />}
                      <span className="an-title-name">{title.title_en || title.canonical_title}</span>
                    </div>
                    <span><span className={`badge ${meta.badgeClass}`}>{meta.label}</span></span>
                    <span className="an-title-score">{title.score ? (title.score / 10).toFixed(1) : '—'}</span>
                    <div className="an-title-pop-bar">
                      <div
                        className="an-title-pop-fill"
                        style={{
                          width: `${pct(title.popularity_score || 0, Math.max(...data.catalog.topTitles.map((t) => t.popularity_score || 0), 1))}%`,
                        }}
                      />
                      <span>{title.popularity_score?.toLocaleString() || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <SectionHeader icon={Clock} title="Recently Added" subtitle="Latest 8 titles added to the catalog" accent="#f59e0b" />
          <Panel>
            <div className="an-recent-grid">
              {data.catalog.recentTitles.map((title) => {
                const meta = getTitleTypeMeta(title.type);
                return (
                  <div key={title.id} className="an-recent-card">
                    {title.cover && (
                      <img src={title.cover} alt="" className="an-recent-cover" />
                    )}
                    <div className="an-recent-info">
                      <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                      <strong>{title.title_en || title.canonical_title}</strong>
                      <span className="an-recent-date">
                        {title.created_at
                          ? new Date(title.created_at).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: Editorial
      ════════════════════════════════════════ */}
      {activeTab === 'editorial' && (
        <div className="an-tab-content">

          <SectionHeader icon={Layers} title="Collections Health" subtitle="Published vs draft vs archived" accent="#8b5cf6" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Collection Status Split</PanelTitle>
              <DonutChart segments={derived.colSplit} />
            </Panel>
            <Panel>
              <PanelTitle>Collections Overview</PanelTitle>
              <HorizontalBar
                data={derived.colSplit.map((s) => ({ label: s.label, count: s.value }))}
                color="#8b5cf6"
                maxLabel={3}
              />
              <div className="an-kv-grid" style={{ marginTop: 20 }}>
                {[
                  { label: 'Total Collections', value: data.editorial.collections.length },
                  { label: 'Published', value: data.editorial.collections.filter((c) => c.status === 'published').length },
                  { label: 'Featured', value: data.editorial.collections.filter((c) => c.is_featured).length },
                  { label: 'Total Items', value: data.editorial.collectionItems },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <SectionHeader icon={BarChart3} title="Homepage Blocks" subtitle="Block type distribution and status" accent="#ec4899" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Block Type Mix</PanelTitle>
              <DonutChart
                segments={derived.blockTypeCounts.map((b, i) => ({
                  label: b.label,
                  value: b.count,
                  color: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6'][i % 6],
                }))}
              />
            </Panel>
            <Panel>
              <PanelTitle>Block Types Ranked</PanelTitle>
              <HorizontalBar data={derived.blockTypeCounts} color="#ec4899" />
              <div className="an-kv-grid" style={{ marginTop: 20 }}>
                {[
                  { label: 'Total Blocks', value: data.editorial.blocks.length },
                  { label: 'Published', value: data.editorial.blocks.filter((b) => b.status === 'published').length },
                  { label: 'Draft', value: data.editorial.blocks.filter((b) => b.status === 'draft').length },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: Moderation
      ════════════════════════════════════════ */}
      {activeTab === 'moderation' && (
        <div className="an-tab-content">

          <SectionHeader icon={Flag} title="Content Reports Overview" subtitle="Report volume, status pipeline, and issue type breakdown" accent="#f59e0b" />

          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Report Volume (Last 14 Days)</PanelTitle>
              <BarChart
                data={derived.reportTimeseries.map((d) => ({ label: d.date.slice(5), count: d.count }))}
                color="#f59e0b"
                height={120}
              />
            </Panel>
            <Panel>
              <PanelTitle>Status Pipeline</PanelTitle>
              <FunnelChart steps={derived.reportFunnel} />
            </Panel>
          </div>

          <div className="an-grid-3">
            <Panel>
              <PanelTitle>Status Split</PanelTitle>
              <DonutChart
                segments={CONTENT_REPORT_STATUS_OPTIONS.map((o, i) => ({
                  label: o.label,
                  value: derived.reportStatusCounts[o.value] || 0,
                  color: ['#ef4444', '#3b82f6', '#10b981', '#94a3b8'][i],
                }))}
              />
            </Panel>
            <Panel>
              <PanelTitle>Issue Types Ranked</PanelTitle>
              <HorizontalBar
                data={CONTENT_REPORT_ISSUE_OPTIONS.map((o) => ({
                  label: o.label,
                  count: derived.reportIssueCounts[o.value] || 0,
                }))}
                color="#f59e0b"
              />
            </Panel>
            <Panel>
              <PanelTitle>Report Health KPIs</PanelTitle>
              <div className="an-kv-grid">
                {[
                  { label: 'Total Reports', value: data.reports.length },
                  { label: 'Open', value: derived.reportStatusCounts.open || 0 },
                  { label: 'In Review', value: derived.reportStatusCounts.in_review || 0 },
                  { label: 'Resolved', value: derived.reportStatusCounts.resolved || 0 },
                  { label: 'Dismissed', value: derived.reportStatusCounts.dismissed || 0 },
                  {
                    label: 'Oldest Open',
                    value: derived.oldestOpen
                      ? new Date(derived.oldestOpen.createdAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                      : '—',
                  },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: Duplicates
      ════════════════════════════════════════ */}
      {activeTab === 'duplicates' && (
        <div className="an-tab-content">

          <SectionHeader icon={CopyPlus} title="Duplicate Candidates" subtitle="Confidence levels, pipeline status, and merge burn-down" accent="#ec4899" />

          <div className="an-grid-3">
            <Panel>
              <PanelTitle>Status Split</PanelTitle>
              <DonutChart
                segments={DUPLICATE_STATUS_OPTIONS.map((o, i) => ({
                  label: o.label,
                  value: derived.dupeStatusCounts[o.value] || 0,
                  color: ['#f59e0b', '#3b82f6', '#94a3b8', '#10b981'][i],
                }))}
              />
            </Panel>
            <Panel>
              <PanelTitle>Confidence Buckets</PanelTitle>
              <DonutChart segments={derived.confidenceBuckets} />
            </Panel>
            <Panel>
              <PanelTitle>Pipeline KPIs</PanelTitle>
              <div className="an-kv-grid">
                {[
                  { label: 'Total Candidates', value: data.duplicates.length },
                  { label: 'Pending', value: derived.dupeStatusCounts.pending || 0 },
                  { label: 'Approved', value: derived.dupeStatusCounts.approved || 0 },
                  { label: 'Merged', value: derived.dupeStatusCounts.merged || 0 },
                  { label: 'Rejected', value: derived.dupeStatusCounts.rejected || 0 },
                  { label: 'Avg Confidence', value: `${derived.avgConfidence}%` },
                ].map((kv) => (
                  <div key={kv.label} className="an-kv-item">
                    <span>{kv.label}</span>
                    <strong>{kv.value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <SectionHeader icon={BarChart3} title="Duplicate Pipeline Flow" subtitle="How candidates move from detection to merge" accent="#3b82f6" />
          <div className="an-grid-2">
            <Panel>
              <PanelTitle>Resolution Funnel</PanelTitle>
              <FunnelChart steps={derived.dupeFunnel} />
            </Panel>
            <Panel>
              <PanelTitle>Confidence Distribution</PanelTitle>
              <BarChart
                data={[
                  { label: '≥80%', count: derived.confidenceBuckets[0].value },
                  { label: '60–79%', count: derived.confidenceBuckets[1].value },
                  { label: '<60%', count: derived.confidenceBuckets[2].value },
                ]}
                color="#ec4899"
                height={120}
              />
            </Panel>
          </div>

          <SectionHeader icon={XCircle} title="Recent Decisions" subtitle="Latest reviewed candidates" accent="#94a3b8" />
          <Panel>
            <div className="an-title-table">
              <div className="an-title-table-head">
                <span>Title A</span><span>Title B</span><span>Status</span><span>Confidence</span>
              </div>
              {data.duplicates.slice(0, 12).map((d) => (
                <div key={d.id} className="an-title-row">
                  <span className="an-title-name">{d.titleA?.name || '—'}</span>
                  <span className="an-title-name" style={{ color: 'var(--text-secondary)' }}>{d.titleB?.name || '—'}</span>
                  <span>
                    <span className={`admin-queue-pill status-${d.status}`}>{d.statusLabel}</span>
                  </span>
                  <div className="an-title-pop-bar">
                    <div className="an-title-pop-fill" style={{ width: `${d.confidence}%` }} />
                    <span>{d.confidence.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

    </div>
  );
}

export default AdminAnalytics;
