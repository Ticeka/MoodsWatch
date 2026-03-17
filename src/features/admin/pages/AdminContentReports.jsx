import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Flag, RefreshCw } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import {
  CONTENT_REPORT_ISSUE_OPTIONS,
  CONTENT_REPORT_SELECT,
  CONTENT_REPORT_STATUS_OPTIONS,
  mapContentReport,
} from '@/shared/lib/contentReports';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

async function resolveMatchingTitleIds(searchTerm) {
  if (!supabase) return [];

  const normalized = searchTerm.trim();
  if (!normalized) return [];

  const wildcard = `%${normalized}%`;
  const [titleRes, aliasRes] = await Promise.all([
    supabase
      .from('canonical_titles')
      .select('id')
      .or(`canonical_title.ilike.${wildcard},slug.ilike.${wildcard}`)
      .limit(100),
    supabase
      .from('title_aliases')
      .select('canonical_title_id')
      .ilike('alias', wildcard)
      .limit(100),
  ]);

  if (titleRes.error) throw titleRes.error;
  if (aliasRes.error) throw aliasRes.error;

  const ids = new Set();
  (titleRes.data || []).forEach((item) => ids.add(item.id));
  (aliasRes.data || []).forEach((item) => ids.add(item.canonical_title_id));
  return [...ids];
}

export function AdminContentReports() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    searchTerm: '',
    issueType: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [editorState, setEditorState] = useState({
    status: 'open',
    assignedTo: '',
    internalNote: '',
  });

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedId) || null,
    [reports, selectedId]
  );

  const syncEditorState = useCallback((report) => {
    if (!report) {
      setEditorState({ status: 'open', assignedTo: '', internalNote: '' });
      return;
    }

    setEditorState({
      status: report.status,
      assignedTo: report.assignedTo || '',
      internalNote: report.internalNote || '',
    });
  }, []);

  const fetchReports = useCallback(async () => {
    if (!supabase) {
      setErrorMessage('Unable to connect to Supabase');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      let query = supabase
        .from('content_reports')
        .select(CONTENT_REPORT_SELECT)
        .order('created_at', { ascending: false });

      if (filters.issueType !== 'all') {
        query = query.eq('issue_type', filters.issueType);
      }

      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
      }

      if (filters.searchTerm.trim()) {
        const matchingTitleIds = await resolveMatchingTitleIds(filters.searchTerm);
        if (matchingTitleIds.length === 0) {
          setReports([]);
          setSelectedId(null);
          syncEditorState(null);
          setIsLoading(false);
          return;
        }
        query = query.in('title_id', matchingTitleIds);
      }

      const [{ data: reportRows, error: reportError }, { data: staffRows, error: staffError }] = await Promise.all([
        query,
        supabase
          .from('user_profiles')
          .select('id, name, role')
          .in('role', ['admin', 'editor'])
          .order('role', { ascending: true })
          .order('name', { ascending: true }),
      ]);

      if (reportError) throw reportError;
      if (staffError) throw staffError;

      const relatedUserIds = new Set();
      (reportRows || []).forEach((row) => {
        if (row.reported_by) relatedUserIds.add(row.reported_by);
        if (row.assigned_to) relatedUserIds.add(row.assigned_to);
        if (row.resolved_by) relatedUserIds.add(row.resolved_by);
      });
      (staffRows || []).forEach((row) => relatedUserIds.add(row.id));

      let userMap = new Map();
      if (relatedUserIds.size > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('user_profiles')
          .select('id, name, role')
          .in('id', [...relatedUserIds]);
        if (profileError) throw profileError;
        userMap = new Map((profileRows || []).map((entry) => [entry.id, entry]));
      }

      const mappedReports = (reportRows || []).map((row) => mapContentReport(row, userMap));
      setReports(mappedReports);
      setStaffOptions(staffRows || []);

      if (mappedReports.length === 0) {
        setSelectedId(null);
        syncEditorState(null);
        return;
      }

      const nextSelectedId = mappedReports.some((report) => report.id === selectedId)
        ? selectedId
        : mappedReports[0].id;
      setSelectedId(nextSelectedId);
      syncEditorState(mappedReports.find((report) => report.id === nextSelectedId));
    } catch (error) {
      console.error('Failed to load content reports:', error);
      setErrorMessage(error.message || 'Failed to load content reports');
      toast.error('Failed to load content reports');
    } finally {
      setIsLoading(false);
    }
  }, [filters, selectedId, syncEditorState]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    syncEditorState(selectedReport);
  }, [selectedReport, syncEditorState]);

  const summary = useMemo(() => {
    return reports.reduce((acc, report) => {
      acc.total += 1;
      acc[report.status] += 1;
      return acc;
    }, { total: 0, open: 0, in_review: 0, resolved: 0, dismissed: 0 });
  }, [reports]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!supabase || !selectedReport) return;

    setIsSaving(true);
    try {
      const isClosed = editorState.status === 'resolved' || editorState.status === 'dismissed';
      const payload = {
        status: editorState.status,
        assigned_to: editorState.assignedTo || null,
        internal_note: editorState.internalNote.trim() || null,
        resolved_at: isClosed ? new Date().toISOString() : null,
        resolved_by: isClosed ? user?.id || null : null,
      };

      const { error } = await supabase
        .from('content_reports')
        .update(payload)
        .eq('id', selectedReport.id);

      if (error) throw error;

      toast.success('Report updated');
      await fetchReports();
    } catch (error) {
      console.error('Failed to update report:', error);
      toast.error('Failed to update report');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Flag size={30} color="var(--primary-500)" />
            {t('admin.reports.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.reports.pageSubtitle')}</p>
        </div>
        <button className="action-btn" type="button" onClick={fetchReports}>
          <RefreshCw size={16} style={{ marginRight: 8 }} />
          {t('admin.common.refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <div className="stat-card"><h3 className="stat-title">{t('admin.reports.statFiltered')}</h3><p className="stat-value" style={{ color: 'var(--primary-600)' }}>{summary.total}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.reports.statOpen')}</h3><p className="stat-value" style={{ color: '#f59e0b' }}>{summary.open}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.reports.statInReview')}</h3><p className="stat-value" style={{ color: '#3b82f6' }}>{summary.in_review}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.reports.statResolved')}</h3><p className="stat-value" style={{ color: '#10b981' }}>{summary.resolved}</p></div>
      </div>

      <section className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-form-grid">
          <label>
            <span className="form-label">Title search</span>
            <input
              className="form-input"
              value={filters.searchTerm}
              onChange={(event) => setFilters((current) => ({ ...current, searchTerm: event.target.value }))}
              placeholder={t('admin.reports.searchPlaceholder')}
            />
          </label>
          <label>
            <span className="form-label">{t('admin.reports.filterIssueType')}</span>
            <select
              className="form-select"
              value={filters.issueType}
              onChange={(event) => setFilters((current) => ({ ...current, issueType: event.target.value }))}
            >
              <option value="all">{t('admin.reports.allIssueTypes')}</option>
              {CONTENT_REPORT_ISSUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.reports.filterStatus')}</span>
            <select
              className="form-select"
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">{t('admin.reports.allStatuses')}</option>
              {CONTENT_REPORT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">{t('admin.reports.filterDateFrom')}</span>
            <input
              className="form-input"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
          </label>
          <label>
            <span className="form-label">{t('admin.reports.filterDateTo')}</span>
            <input
              className="form-input"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <div className="admin-split-layout">
        <section className="admin-form-container">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('admin.reports.queueTitle')}</h2>
              <p>{t('admin.reports.queueHint', { count: reports.length })}</p>
            </div>
          </div>

          {isLoading ? (
            <AdminStatePanel title={t('admin.reports.loadingTitle')} description={t('admin.reports.loadingHint')} />
          ) : errorMessage ? (
            <AdminStatePanel title={t('admin.reports.errorTitle')} description={errorMessage} actionLabel="Retry" onAction={fetchReports} tone="error" />
          ) : reports.length === 0 ? (
            <AdminStatePanel title="No reports found" description={t('admin.reports.noResults')} />
          ) : (
            <div className="admin-list-stack">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={`admin-record-card ${selectedId === report.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(report.id)}
                >
                  <div className="admin-record-main">
                    <strong className="admin-queue-card-title">{report.title.name}</strong>
                    <span className="admin-queue-card-subtitle">{report.title.slug || report.title.canonicalTitle}</span>
                    <div className="admin-chip-grid" style={{ gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span className={`admin-queue-pill status-${report.status}`}>{report.statusLabel}</span>
                      <span className="admin-queue-pill">{report.issueLabel}</span>
                      {report.assigneeName && <span className="admin-queue-pill subtle">Assigned: {report.assigneeName}</span>}
                    </div>
                    <span className="admin-clamp-2">{report.description || t('admin.reports.noReporterNote')}</span>
                  </div>
                  <div className="admin-record-meta">
                    <span>#{report.id}</span>
                    <span>{new Date(report.createdAt).toLocaleDateString('en-US')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-form-container">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('admin.reports.detailTitle')}</h2>
              <p>{t('admin.reports.detailHint')}</p>
            </div>
          </div>

          {!selectedReport ? (
            <AdminStatePanel title={t('admin.reports.noSelection')} description={t('admin.reports.noSelectionHint')} />
          ) : (
            <form className="glass-panel" onSubmit={handleSave}>
              <div className="admin-preview-result admin-note-box" style={{ marginBottom: 'var(--space-5)' }}>
                <div className="admin-preview-result-top">
                  <div className="admin-preview-rank">#{selectedReport.id}</div>
                  <img src={selectedReport.title.cover} alt="" className="admin-preview-cover" />
                  <div className="admin-preview-copy">
                    <h3>{selectedReport.title.name}</h3>
                    <p className="admin-clamp-3">{selectedReport.description || t('admin.reports.noReporterNote')}</p>
                  </div>
                </div>
                <div className="admin-inline-kv-grid">
                  <div><span>{t('admin.reports.metaIssue')}</span><strong>{selectedReport.issueLabel}</strong></div>
                  <div><span>{t('admin.reports.metaSource')}</span><strong>{selectedReport.sourceContext}</strong></div>
                  <div><span>{t('admin.reports.metaReporter')}</span><strong>{selectedReport.reporterName}</strong></div>
                  <div><span>{t('admin.reports.metaAssignee')}</span><strong>{selectedReport.assigneeName || '-'}</strong></div>
                </div>
              </div>

              <div className="admin-inline-kv-grid admin-inline-kv-grid-wide" style={{ marginBottom: 'var(--space-5)' }}>
                <div><span>{t('admin.reports.metaCanonicalTitle')}</span><strong>{selectedReport.title.canonicalTitle || '-'}</strong></div>
                <div><span>{t('admin.reports.metaSlug')}</span><strong>{selectedReport.title.slug || '-'}</strong></div>
                <div><span>{t('admin.reports.metaCreated')}</span><strong>{new Date(selectedReport.createdAt).toLocaleString('en-US')}</strong></div>
                <div><span>{t('admin.reports.metaResolved')}</span><strong>{selectedReport.resolvedAt ? new Date(selectedReport.resolvedAt).toLocaleString('en-US') : '-'}</strong></div>
              </div>

              <div className="admin-form-grid">
                <label>
                  <span className="form-label">{t('admin.reports.filterStatus')}</span>
                  <select
                    className="form-select"
                    value={editorState.status}
                    onChange={(event) => setEditorState((current) => ({ ...current, status: event.target.value }))}
                  >
                    {CONTENT_REPORT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="form-label">{t('admin.reports.assignToStaff')}</span>
                  <select
                    className="form-select"
                    value={editorState.assignedTo}
                    onChange={(event) => setEditorState((current) => ({ ...current, assignedTo: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {staffOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name || option.id}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-form-grid-wide">
                  <span className="form-label">{t('admin.reports.internalNote')}</span>
                  <textarea
                    className="form-input"
                    value={editorState.internalNote}
                    onChange={(event) => setEditorState((current) => ({ ...current, internalNote: event.target.value }))}
                    placeholder={t('admin.reports.noteHint')}
                    rows={6}
                  />
                </label>
              </div>

              <div className="admin-action-bar">
                <button className="primary-btn" type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : t('admin.reports.saveUpdate')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

export default AdminContentReports;
