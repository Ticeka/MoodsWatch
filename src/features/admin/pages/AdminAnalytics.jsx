import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CopyPlus, Flag, Layers, Library, RefreshCw } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { mapCanonicalTitle } from '@/shared/lib/catalog';
import {
  CONTENT_REPORT_ISSUE_OPTIONS,
  CONTENT_REPORT_SELECT,
  CONTENT_REPORT_STATUS_OPTIONS,
  mapContentReport,
} from '@/shared/lib/contentReports';
import { DUPLICATE_CANDIDATE_SELECT, DUPLICATE_STATUS_OPTIONS, mapDuplicateCandidate } from '@/shared/lib/duplicates';
import { supabase } from '@/shared/lib/supabase';
import { getTitleTypeMeta } from '@/shared/lib/titleType';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

function getPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isWithinRange(value, dateFrom, dateTo) {
  if (!value) return false;

  const current = new Date(value);
  if (Number.isNaN(current.getTime())) return false;

  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`);
    if (current < from) return false;
  }

  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`);
    if (current > to) return false;
  }

  return true;
}

function buildCountMap(rows, key, options) {
  return options.reduce((acc, option) => {
    acc[option.value] = rows.filter((row) => row[key] === option.value).length;
    return acc;
  }, {});
}

function MetricCard({ label, value, hint, tone = 'var(--primary-600)' }) {
  return (
    <div className="stat-card">
      <h3 className="stat-title">{label}</h3>
      <p className="stat-value" style={{ color: tone }}>{value}</p>
      {hint ? <p className="admin-analytics-card-note">{hint}</p> : null}
    </div>
  );
}

export function AdminAnalytics() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    editorialStatus: 'all',
    reportStatus: 'all',
    reportIssueType: 'all',
    duplicateStatus: 'all',
    blockType: 'all',
  });

  const EDITORIAL_STATUS_OPTIONS = [
    { value: 'all', label: t('admin.analytics.allStatuses') },
    { value: 'draft', label: t('admin.analytics.statusDraft') },
    { value: 'published', label: t('admin.analytics.statusPublished') },
    { value: 'archived', label: t('admin.analytics.statusArchived') },
  ];

  const HOMEPAGE_BLOCK_TYPE_OPTIONS = [
    { value: 'all', label: t('admin.analytics.allBlockTypes') },
    { value: 'hero', label: t('admin.analytics.blockHero') },
    { value: 'collection', label: t('admin.analytics.blockCollection') },
    { value: 'manual_list', label: t('admin.analytics.blockManualList') },
    { value: 'recommendation', label: t('admin.analytics.blockRecommendation') },
    { value: 'continue', label: t('admin.analytics.blockContinue') },
    { value: 'trending', label: t('admin.analytics.blockTrending') },
  ];

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    if (!supabase) {
      setErrorMessage('Supabase is not available.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const [
        titlesRes,
        animeRes,
        mangaRes,
        manhwaRes,
        usersRes,
        listsRes,
        moodsRes,
        topTitlesRes,
        recentTitlesRes,
        collectionsRes,
        collectionItemsRes,
        blocksRes,
        reportsRes,
        duplicatesRes,
      ] = await Promise.all([
        supabase.from('canonical_titles').select('*', { count: 'exact', head: true }),
        supabase.from('canonical_titles').select('*', { count: 'exact', head: true }).eq('type', 'anime'),
        supabase.from('canonical_titles').select('*', { count: 'exact', head: true }).eq('type', 'manga').eq('subtype', 'manga'),
        supabase.from('canonical_titles').select('*', { count: 'exact', head: true }).eq('type', 'manga').eq('subtype', 'manhwa'),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('user_lists').select('*', { count: 'exact', head: true }),
        supabase.from('moods').select('*', { count: 'exact', head: true }),
        supabase.from('canonical_titles')
          .select('id, slug, canonical_title, type, subtype, avg_score, cover_image, popularity_score')
          .order('avg_score', { ascending: false, nullsFirst: false })
          .limit(10),
        supabase.from('canonical_titles')
          .select('id, slug, canonical_title, type, subtype, created_at, cover_image')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('editor_collections').select('id, status, visibility, is_featured, created_at, updated_at'),
        supabase.from('editor_collection_items').select('*', { count: 'exact', head: true }),
        supabase.from('homepage_content_blocks').select('id, status, visibility, block_type, created_at, updated_at'),
        supabase.from('content_reports').select(CONTENT_REPORT_SELECT).order('created_at', { ascending: false }).limit(1000),
        supabase.from('duplicate_candidates').select(DUPLICATE_CANDIDATE_SELECT).order('created_at', { ascending: false }).limit(1000),
      ]);

      const responseErrors = [
        titlesRes.error,
        animeRes.error,
        mangaRes.error,
        manhwaRes.error,
        usersRes.error,
        listsRes.error,
        moodsRes.error,
        topTitlesRes.error,
        recentTitlesRes.error,
        collectionsRes.error,
        collectionItemsRes.error,
        blocksRes.error,
        reportsRes.error,
        duplicatesRes.error,
      ].filter(Boolean);

      if (responseErrors.length > 0) {
        throw responseErrors[0];
      }

      setData({
        catalog: {
          totalTitles: titlesRes.count || 0,
          totalAnime: animeRes.count || 0,
          totalManga: mangaRes.count || 0,
          totalManhwa: manhwaRes.count || 0,
          totalUsers: usersRes.count || 0,
          totalLists: listsRes.count || 0,
          totalMoods: moodsRes.count || 0,
          topTitles: (topTitlesRes.data || []).map(mapCanonicalTitle),
          recentTitles: (recentTitlesRes.data || []).map(mapCanonicalTitle),
        },
        editorial: {
          collections: collectionsRes.data || [],
          collectionItems: collectionItemsRes.count || 0,
          blocks: blocksRes.data || [],
        },
        reports: (reportsRes.data || []).map((row) => mapContentReport(row)),
        duplicates: (duplicatesRes.data || []).map((row) => mapDuplicateCandidate(row)),
      });
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setErrorMessage(err.message || 'Unable to load analytics.');
    } finally {
      setIsLoading(false);
    }
  }

  const derived = useMemo(() => {
    if (!data) return null;

    const filteredCollections = data.editorial.collections.filter((collection) => (
      (filters.editorialStatus === 'all' || collection.status === filters.editorialStatus) &&
      isWithinRange(collection.updated_at || collection.created_at, filters.dateFrom, filters.dateTo)
    ));

    const filteredBlocks = data.editorial.blocks.filter((block) => (
      (filters.editorialStatus === 'all' || block.status === filters.editorialStatus) &&
      (filters.blockType === 'all' || block.block_type === filters.blockType) &&
      isWithinRange(block.updated_at || block.created_at, filters.dateFrom, filters.dateTo)
    ));

    const filteredReports = data.reports.filter((report) => (
      (filters.reportStatus === 'all' || report.status === filters.reportStatus) &&
      (filters.reportIssueType === 'all' || report.issueType === filters.reportIssueType) &&
      isWithinRange(report.createdAt, filters.dateFrom, filters.dateTo)
    ));

    const filteredDuplicates = data.duplicates.filter((candidate) => (
      (filters.duplicateStatus === 'all' || candidate.status === filters.duplicateStatus) &&
      isWithinRange(candidate.createdAt, filters.dateFrom, filters.dateTo)
    ));

    const reportStatusCounts = buildCountMap(filteredReports, 'status', CONTENT_REPORT_STATUS_OPTIONS);
    const reportIssueCounts = buildCountMap(filteredReports, 'issueType', CONTENT_REPORT_ISSUE_OPTIONS);
    const duplicateStatusCounts = buildCountMap(filteredDuplicates, 'status', DUPLICATE_STATUS_OPTIONS);
    const blockTypeCounts = buildCountMap(filteredBlocks, 'block_type', HOMEPAGE_BLOCK_TYPE_OPTIONS.filter((option) => option.value !== 'all'));

    const oldestOpenReport = filteredReports
      .filter((report) => report.status === 'open')
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))[0] || null;

    const averageDuplicateConfidence = filteredDuplicates.length
      ? Math.round(filteredDuplicates.reduce((sum, candidate) => sum + candidate.confidence, 0) / filteredDuplicates.length)
      : 0;

    const confidenceBuckets = {
      high: filteredDuplicates.filter((candidate) => candidate.confidence >= 80).length,
      medium: filteredDuplicates.filter((candidate) => candidate.confidence >= 60 && candidate.confidence < 80).length,
      low: filteredDuplicates.filter((candidate) => candidate.confidence < 60).length,
    };

    return {
      filteredCollections,
      filteredBlocks,
      filteredReports,
      filteredDuplicates,
      reportStatusCounts,
      reportIssueCounts,
      duplicateStatusCounts,
      blockTypeCounts,
      oldestOpenReport,
      averageDuplicateConfidence,
      confidenceBuckets,
    };
  }, [data, filters]);

  if (isLoading) {
    return (
      <div className="admin-page-content" style={{ padding: 'var(--space-10)' }}>
        <AdminStatePanel title="Loading analytics" description="Collecting catalog, editorial, report, and duplicate metrics." />
      </div>
    );
  }

  if (!data || !derived) {
    return (
      <div className="admin-page-content" style={{ padding: 'var(--space-10)' }}>
        <AdminStatePanel
          title="Unable to load analytics"
          description={errorMessage || 'Analytics data could not be loaded.'}
          actionLabel="Retry"
          onAction={fetchAnalytics}
          tone="error"
        />
      </div>
    );
  }

  const editorialPublishedRatio = getPercent(
    derived.filteredCollections.filter((collection) => collection.status === 'published').length,
    derived.filteredCollections.length
  );
  const blocksPublishedRatio = getPercent(
    derived.filteredBlocks.filter((block) => block.status === 'published').length,
    derived.filteredBlocks.length
  );

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <BarChart3 size={30} color="var(--primary-500)" />
            {t('admin.analytics.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {t('admin.analytics.pageSubtitle')}
          </p>
        </div>
        <button className="action-btn" onClick={fetchAnalytics} type="button">
          <RefreshCw size={16} style={{ marginRight: 8 }} />
          {t('admin.common.refresh')}
        </button>
      </div>

      <section className="glass-panel admin-analytics-filter-panel" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-panel-heading" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h2>{t('admin.analytics.filtersTitle')}</h2>
            <p>{t('admin.analytics.filtersHint')}</p>
          </div>
        </div>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">{t('admin.analytics.dateFrom')}</span>
            <input
              className="form-input"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.dateTo')}</span>
            <input
              className="form-input"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.editorialStatus')}</span>
            <select
              className="form-select"
              value={filters.editorialStatus}
              onChange={(event) => setFilters((current) => ({ ...current, editorialStatus: event.target.value }))}
            >
              {EDITORIAL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.blockType')}</span>
            <select
              className="form-select"
              value={filters.blockType}
              onChange={(event) => setFilters((current) => ({ ...current, blockType: event.target.value }))}
            >
              {HOMEPAGE_BLOCK_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.reportStatus')}</span>
            <select
              className="form-select"
              value={filters.reportStatus}
              onChange={(event) => setFilters((current) => ({ ...current, reportStatus: event.target.value }))}
            >
              <option value="all">{t('admin.analytics.allReportStatuses')}</option>
              {CONTENT_REPORT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.reportIssueType')}</span>
            <select
              className="form-select"
              value={filters.reportIssueType}
              onChange={(event) => setFilters((current) => ({ ...current, reportIssueType: event.target.value }))}
            >
              <option value="all">{t('admin.analytics.allIssueTypes')}</option>
              {CONTENT_REPORT_ISSUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.analytics.duplicateStatus')}</span>
            <select
              className="form-select"
              value={filters.duplicateStatus}
              onChange={(event) => setFilters((current) => ({ ...current, duplicateStatus: event.target.value }))}
            >
              <option value="all">{t('admin.analytics.allDuplicateStatuses')}</option>
              {DUPLICATE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="admin-analytics-section" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="admin-panel-heading">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Library size={20} color="var(--primary-500)" />
              {t('admin.analytics.catalogTitle')}
            </h2>
            <p>{t('admin.analytics.catalogHint')}</p>
          </div>
        </div>

        <div className="admin-analytics-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <MetricCard label={t('admin.analytics.statTitles')} value={data.catalog.totalTitles} hint="All canonical titles" />
          <MetricCard label={t('admin.analytics.statAnime')} value={data.catalog.totalAnime} hint="Type split" tone="#3b82f6" />
          <MetricCard label={t('admin.analytics.statManga')} value={data.catalog.totalManga} hint="Subtype = manga" tone="#ec4899" />
          <MetricCard label={t('admin.analytics.statManhwa')} value={data.catalog.totalManhwa} hint="Subtype = manhwa" tone="#22c55e" />
          <MetricCard label={t('admin.analytics.statUsers')} value={data.catalog.totalUsers} hint="Profiles in system" tone="var(--success)" />
          <MetricCard label={t('admin.analytics.statLists')} value={data.catalog.totalLists} hint="Tracked list entries" tone="var(--warning)" />
        </div>

        <div className="admin-analytics-two-up">
          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">Top rated titles</h3>
            <div className="admin-list-stack">
              {data.catalog.topTitles.map((title, index) => {
                const typeMeta = getTitleTypeMeta(title.type);
                return (
                  <div key={title.id} className="admin-analytics-row">
                    <span className="admin-analytics-rank">{index + 1}</span>
                    <img src={title.cover} alt="" className="admin-preview-cover" style={{ width: 34, height: 48 }} />
                    <div className="admin-title-cell" style={{ flex: 1 }}>
                      <div className="admin-title-primary">{title.title_en}</div>
                      <div className="admin-title-meta">
                        <span className={`badge ${typeMeta.badgeClass}`}>{typeMeta.label}</span>
                      </div>
                    </div>
                    <strong style={{ color: 'var(--warning)' }}>{title.score ? (title.score / 10).toFixed(1) : 'N/A'}</strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">Recently added</h3>
            <div className="admin-list-stack">
              {data.catalog.recentTitles.map((title) => {
                const typeMeta = getTitleTypeMeta(title.type);
                return (
                  <div key={title.id} className="admin-analytics-row">
                    <img src={title.cover} alt="" className="admin-preview-cover" style={{ width: 34, height: 48 }} />
                    <div className="admin-title-cell" style={{ flex: 1 }}>
                      <div className="admin-title-primary">{title.title_en}</div>
                      <div className="admin-title-meta">
                        <span className={`badge ${typeMeta.badgeClass}`}>{typeMeta.label}</span>
                      </div>
                    </div>
                    <span className="admin-queue-pill subtle">{formatDate(title.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-analytics-section" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="admin-panel-heading">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Layers size={20} color="var(--primary-500)" />
              {t('admin.analytics.editorialTitle')}
            </h2>
            <p>{t('admin.analytics.editorialHint')}</p>
          </div>
        </div>

        <div className="admin-analytics-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <MetricCard label="Collections" value={derived.filteredCollections.length} hint={`${editorialPublishedRatio}% published`} />
          <MetricCard
            label="Homepage blocks"
            value={derived.filteredBlocks.length}
            hint={`${blocksPublishedRatio}% published`}
            tone="#3b82f6"
          />
          <MetricCard
            label={t('admin.analytics.statPublishedCollections')}
            value={derived.filteredCollections.filter((collection) => collection.status === 'published').length}
            hint="Ready for public surfaces"
            tone="#10b981"
          />
          <MetricCard
            label={t('admin.analytics.statFeaturedCollections')}
            value={derived.filteredCollections.filter((collection) => collection.is_featured).length}
            hint="Marked as featured"
            tone="#f59e0b"
          />
          <MetricCard
            label={t('admin.analytics.statCollectionItems')}
            value={data.editorial.collectionItems}
            hint="Total items across collections"
            tone="var(--secondary-600)"
          />
          <MetricCard label={t('admin.analytics.statMoodTags')} value={data.catalog.totalMoods} hint="Catalog mood vocabulary" tone="#8b5cf6" />
        </div>

        <div className="admin-analytics-two-up">
          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">Collection status mix</h3>
            <div className="admin-stat-list">
              {EDITORIAL_STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => {
                const count = derived.filteredCollections.filter((collection) => collection.status === option.value).length;
                return (
                  <div key={option.value}>
                    <span>{option.label}</span>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">Homepage block types</h3>
            <div className="admin-stat-list">
              {HOMEPAGE_BLOCK_TYPE_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                <div key={option.value}>
                  <span>{option.label}</span>
                  <strong>{derived.blockTypeCounts[option.value] || 0}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-analytics-section" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="admin-panel-heading">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Flag size={20} color="var(--primary-500)" />
              {t('admin.analytics.reportsTitle')}
            </h2>
            <p>{t('admin.analytics.reportsHint')}</p>
          </div>
        </div>

        <div className="admin-analytics-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <MetricCard label={t('admin.analytics.statMatchingReports')} value={derived.filteredReports.length} hint="Rows in current filter set" />
          <MetricCard label={t('admin.analytics.statOpen')} value={derived.reportStatusCounts.open || 0} hint={t('admin.analytics.needsTriage')} tone="#f59e0b" />
          <MetricCard label={t('admin.analytics.statInReview')} value={derived.reportStatusCounts.in_review || 0} hint={t('admin.analytics.activeModeration')} tone="#3b82f6" />
          <MetricCard label={t('admin.analytics.statResolved')} value={derived.reportStatusCounts.resolved || 0} hint={t('admin.analytics.closedWithAction')} tone="#10b981" />
          <MetricCard label={t('admin.analytics.statDismissed')} value={derived.reportStatusCounts.dismissed || 0} hint={t('admin.analytics.closedWithoutAction')} tone="#64748b" />
          <MetricCard
            label={t('admin.analytics.statOldestOpen')}
            value={derived.oldestOpenReport ? formatDate(derived.oldestOpenReport.createdAt) : '-'}
            hint={derived.oldestOpenReport ? derived.oldestOpenReport.title.name : 'No open reports in current filters'}
            tone="#ef4444"
          />
        </div>

        <div className="admin-analytics-two-up">
          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">{t('admin.analytics.issueTypeBreakdown')}</h3>
            <div className="admin-stat-list">
              {CONTENT_REPORT_ISSUE_OPTIONS.map((option) => (
                <div key={option.value}>
                  <span>{option.label}</span>
                  <strong>{derived.reportIssueCounts[option.value] || 0}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">{t('admin.analytics.recentReportQueue')}</h3>
            {derived.filteredReports.length === 0 ? (
              <AdminStatePanel title="No reports in view" description="Adjust the report filters or date range to inspect moderation activity." />
            ) : (
              <div className="admin-list-stack">
                {derived.filteredReports.slice(0, 6).map((report) => (
                  <div key={report.id} className="admin-analytics-queue-card">
                    <div className="admin-record-main">
                      <strong className="admin-queue-card-title">{report.title.name}</strong>
                      <span className="admin-queue-card-subtitle">{report.issueLabel}</span>
                    </div>
                    <div className="admin-chip-grid" style={{ gap: '0.45rem', marginTop: '0.75rem' }}>
                      <span className={`admin-queue-pill status-${report.status}`}>{report.statusLabel}</span>
                      <span className="admin-queue-pill subtle">{formatDateTime(report.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="admin-analytics-section">
        <div className="admin-panel-heading">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <CopyPlus size={20} color="var(--primary-500)" />
              {t('admin.analytics.duplicatesTitle')}
            </h2>
            <p>{t('admin.analytics.duplicatesHint')}</p>
          </div>
        </div>

        <div className="admin-analytics-grid" style={{ marginBottom: 'var(--space-6)' }}>
          <MetricCard label={t('admin.analytics.statMatchingCandidates')} value={derived.filteredDuplicates.length} hint="Rows in current filter set" />
          <MetricCard label={t('admin.analytics.statPending')} value={derived.duplicateStatusCounts.pending || 0} hint={t('admin.analytics.awaitingReview')} tone="#f59e0b" />
          <MetricCard label={t('admin.analytics.statApproved')} value={derived.duplicateStatusCounts.approved || 0} hint={t('admin.analytics.readyToMerge')} tone="#3b82f6" />
          <MetricCard label={t('admin.analytics.statRejected')} value={derived.duplicateStatusCounts.rejected || 0} hint={t('admin.analytics.reviewedDeclined')} tone="#64748b" />
          <MetricCard label={t('admin.analytics.statMerged')} value={derived.duplicateStatusCounts.merged || 0} hint={t('admin.analytics.completedDedupe')} tone="#10b981" />
          <MetricCard
            label={t('admin.analytics.statAvgConfidence')}
            value={`${derived.averageDuplicateConfidence}%`}
            hint="Across filtered candidates"
            tone="#8b5cf6"
          />
        </div>

        <div className="admin-analytics-two-up">
          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">{t('admin.analytics.confidenceBuckets')}</h3>
            <div className="admin-stat-list">
              <div><span>{t('admin.analytics.confidenceHigh')}</span><strong>{derived.confidenceBuckets.high}</strong></div>
              <div><span>{t('admin.analytics.confidenceMed')}</span><strong>{derived.confidenceBuckets.medium}</strong></div>
              <div><span>{t('admin.analytics.confidenceLow')}</span><strong>{derived.confidenceBuckets.low}</strong></div>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="admin-analytics-panel-title">{t('admin.analytics.recentDuplicateDecisions')}</h3>
            {derived.filteredDuplicates.length === 0 ? (
              <AdminStatePanel title="No duplicate candidates in view" description="Adjust duplicate filters or date range to inspect review activity." />
            ) : (
              <div className="admin-list-stack">
                {derived.filteredDuplicates.slice(0, 6).map((candidate) => (
                  <div key={candidate.id} className="admin-analytics-queue-card">
                    <div className="admin-record-main">
                      <strong className="admin-queue-card-title">{candidate.titleA.name}</strong>
                      <span className="admin-queue-card-subtitle">{candidate.titleB.name}</span>
                    </div>
                    <div className="admin-chip-grid" style={{ gap: '0.45rem', marginTop: '0.75rem' }}>
                      <span className={`admin-queue-pill status-${candidate.status}`}>{candidate.statusLabel}</span>
                      <span className="admin-queue-pill subtle">{candidate.confidence.toFixed(0)} confidence</span>
                      <span className="admin-queue-pill subtle">{formatDateTime(candidate.reviewedAt || candidate.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default AdminAnalytics;
