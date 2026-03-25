import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CopyPlus, GitMerge, RefreshCw, ScanSearch, ListCollapse, GitPullRequest } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import {
  buildDuplicateCandidates,
  DUPLICATE_CANDIDATE_SELECT,
  DUPLICATE_STATUS_OPTIONS,
  mapDuplicateCandidate,
} from '@/shared/lib/duplicates';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const TITLE_SCAN_SELECT = `
  id,
  slug,
  canonical_title,
  type,
  subtype,
  release_year,
  origin_country,
  popularity_score,
  cover_image,
  aliases:title_aliases(alias, language_code, alias_type, is_primary),
  source_refs:title_source_refs(provider, external_id)
`;

export function AdminDuplicates() {
  const { t, language } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [candidates, setCandidates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    searchTerm: '',
    status: 'pending',
    adultFilter: 'all',
  });
  const [editorState, setEditorState] = useState({
    status: 'pending',
    reviewNote: '',
    primaryTitleId: '',
  });

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) || null,
    [candidates, selectedId]
  );

  const syncEditorState = useCallback((candidate) => {
    if (!candidate) {
      setEditorState({ status: 'pending', reviewNote: '', primaryTitleId: '' });
      return;
    }

    setEditorState({
      status: candidate.status,
      reviewNote: candidate.reviewNote || '',
      primaryTitleId: String(candidate.suggestedPrimaryTitleId || candidate.titleAId || ''),
    });
  }, []);

  const fetchCandidates = useCallback(async () => {
    if (!supabase) {
      setErrorMessage(t('admin.duplicates.supabaseUnavailable'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      let query = supabase
        .from('duplicate_candidates')
        .select(DUPLICATE_CANDIDATE_SELECT)
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      let mapped = (data || []).map(mapDuplicateCandidate);

      const searchTerm = filters.searchTerm.trim().toLowerCase();
      if (searchTerm) {
        mapped = mapped.filter((candidate) => {
          const haystack = [
            candidate.titleA.name,
            candidate.titleA.slug,
            candidate.titleA.canonicalTitle,
            candidate.titleB.name,
            candidate.titleB.slug,
            candidate.titleB.canonicalTitle,
            candidate.reason,
          ].join(' ').toLowerCase();
          return haystack.includes(searchTerm);
        });
      }

      if (filters.adultFilter === 'adult') {
        mapped = mapped.filter((c) => c.titleA.isAdult || c.titleB.isAdult);
      } else if (filters.adultFilter === 'sfw') {
        mapped = mapped.filter((c) => !c.titleA.isAdult && !c.titleB.isAdult);
      }

      setCandidates(mapped);

      if (mapped.length === 0) {
        setSelectedId(null);
        syncEditorState(null);
        return;
      }

      const nextSelectedId = mapped.some((candidate) => candidate.id === selectedId)
        ? selectedId
        : mapped[0].id;
      setSelectedId(nextSelectedId);
      syncEditorState(mapped.find((candidate) => candidate.id === nextSelectedId));
    } catch (error) {
      console.error('Failed to load duplicate candidates:', error);
      setErrorMessage(error.message || t('admin.duplicates.loadFailed'));
      toast.error(t('admin.duplicates.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [filters.adultFilter, filters.searchTerm, filters.status, selectedId, syncEditorState, t]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  useEffect(() => {
    syncEditorState(selectedCandidate);
  }, [selectedCandidate, syncEditorState]);

  const summary = useMemo(() => {
    return candidates.reduce((acc, candidate) => {
      acc.total += 1;
      acc[candidate.status] += 1;
      return acc;
    }, { total: 0, pending: 0, approved: 0, rejected: 0, merged: 0 });
  }, [candidates]);

  const handleRunScan = async () => {
    if (!supabase) return;

    setIsScanning(true);
    try {
      const [{ data, error }, { data: adultData, error: adultError }] = await Promise.all([
        supabase
          .from('canonical_titles')
          .select(TITLE_SCAN_SELECT)
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(1500),
        supabase
          .from('canonical_titles')
          .select(TITLE_SCAN_SELECT)
          .eq('is_adult', true)
          .order('popularity_score', { ascending: false, nullsFirst: false })
          .limit(500),
      ]);

      if (error) throw error;
      if (adultError) throw adultError;

      const seenIds = new Set();
      const allRecords = [...(data || []), ...(adultData || [])].filter((record) => {
        if (seenIds.has(record.id)) return false;
        seenIds.add(record.id);
        return true;
      });

      const generated = buildDuplicateCandidates(
        allRecords.map((record) => ({
          id: record.id,
          slug: record.slug,
          canonicalTitle: record.canonical_title,
          type: record.subtype === 'manhwa' ? 'manhwa' : record.type,
          subtype: record.subtype,
          year: record.release_year,
          originCountry: record.origin_country || '',
          popularity: record.popularity_score || 0,
          cover: record.cover_image || '',
          aliases: (record.aliases || []).map((alias) => alias.alias).filter(Boolean),
          sourceRefs: (record.source_refs || []).map((ref) => ({
            provider: ref.provider,
            externalId: ref.external_id,
          })),
        }))
      );

      if (generated.length === 0) {
        toast(t('admin.duplicates.noScanCandidates'));
        setIsScanning(false);
        return;
      }

      const { error: upsertError } = await supabase
        .from('duplicate_candidates')
        .upsert(generated, { onConflict: 'title_a_id,title_b_id' });
      if (upsertError) throw upsertError;

      toast.success(t('admin.duplicates.scanUpserted', { count: generated.length }));
      await fetchCandidates();
    } catch (error) {
      console.error('Failed to run duplicate scan:', error);
      toast.error(t('admin.duplicates.scanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveReview = async (event) => {
    event.preventDefault();
    if (!supabase || !selectedCandidate) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('duplicate_candidates')
        .update({
          status: editorState.status,
          review_note: editorState.reviewNote.trim() || null,
          suggested_primary_title_id: Number(editorState.primaryTitleId) || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedCandidate.id);
      if (error) throw error;

      toast.success(t('admin.duplicates.reviewUpdated'));
      await fetchCandidates();
    } catch (error) {
      console.error('Failed to save duplicate review:', error);
      toast.error(t('admin.duplicates.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMerge = async () => {
    if (!supabase || !selectedCandidate) return;

    const primaryTitleId = Number(editorState.primaryTitleId);
    const duplicateTitleId = primaryTitleId === selectedCandidate.titleAId
      ? selectedCandidate.titleBId
      : selectedCandidate.titleAId;

    if (!primaryTitleId || !duplicateTitleId) {
      toast.error(t('admin.duplicates.selectPrimaryFirst'));
      return;
    }

    if (!window.confirm(t('admin.duplicates.confirmMerge'))) return;

    setIsSaving(true);
    try {
      const { error: approveError } = await supabase
        .from('duplicate_candidates')
        .update({
          status: 'approved',
          review_note: editorState.reviewNote.trim() || null,
          suggested_primary_title_id: primaryTitleId || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedCandidate.id);
      if (approveError) throw approveError;

      const { data, error } = await supabase.rpc('admin_merge_duplicate_titles', {
        p_candidate_id: selectedCandidate.id,
        p_primary_title_id: primaryTitleId,
        p_duplicate_title_id: duplicateTitleId,
        p_note: editorState.reviewNote.trim() || null,
      });
      if (error) throw error;
      if (data?.ok !== true) throw new Error(t('admin.duplicates.mergeNotCompleted'));

      toast.success(t('admin.duplicates.mergeSuccess'));
      await fetchCandidates();
    } catch (error) {
      console.error('Failed to merge duplicate titles:', error);
      toast.error(error.message || t('admin.duplicates.mergeFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <CopyPlus size={30} color="var(--primary-500)" />
            {t('admin.duplicates.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.duplicates.pageSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="action-btn" type="button" onClick={fetchCandidates}>
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            {t('admin.common.refresh')}
          </button>
          <button className="primary-btn" type="button" onClick={handleRunScan} disabled={isScanning}>
            <ScanSearch size={18} />
            {isScanning ? t('admin.duplicates.scanning') : t('admin.duplicates.runScan')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        <div className="stat-card"><h3 className="stat-title">{t('admin.duplicates.statFiltered')}</h3><p className="stat-value" style={{ color: 'var(--primary-600)' }}>{summary.total}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.duplicates.statPending')}</h3><p className="stat-value" style={{ color: '#f59e0b' }}>{summary.pending}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.duplicates.statApproved')}</h3><p className="stat-value" style={{ color: '#3b82f6' }}>{summary.approved}</p></div>
        <div className="stat-card"><h3 className="stat-title">{t('admin.duplicates.statMerged')}</h3><p className="stat-value" style={{ color: '#10b981' }}>{summary.merged}</p></div>
      </div>

      <section className="glass-panel" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="admin-form-grid" role="toolbar" aria-label={t('admin.duplicates.filtersToolbar')}>
          <label>
            <span className="form-label">{t('admin.duplicates.searchTitles')}</span>
            <input
              className="form-input"
              value={filters.searchTerm}
              onChange={(event) => setFilters((current) => ({ ...current, searchTerm: event.target.value }))}
              placeholder={t('admin.duplicates.searchPlaceholder')}
            />
          </label>
          <SortSelect
            value={filters.status}
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            label={t('admin.duplicates.filterStatus')}
            className="results-sorter"
          >
              <option value="all">{t('admin.duplicates.allStatuses')}</option>
              {DUPLICATE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
          </SortSelect>
          <SortSelect
            value={filters.adultFilter}
            onChange={(value) => setFilters((current) => ({ ...current, adultFilter: value }))}
            label={t('admin.duplicates.filterAdult')}
            className="results-sorter"
          >
            <option value="all">{t('admin.duplicates.adultAll')}</option>
            <option value="adult">{t('admin.duplicates.adultOnly')}</option>
            <option value="sfw">{t('admin.duplicates.adultSfw')}</option>
          </SortSelect>
        </div>
      </section>

      <div className="admin-split-layout">
        <section className="admin-form-container">
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ListCollapse size={20} color="var(--primary-500)" />
                {t('admin.duplicates.queueTitle')}
              </h2>
              <p>{t('admin.duplicates.queueHint')}</p>
            </div>
          </div>

          {isLoading ? (
            <AdminStatePanel title={t('admin.duplicates.loadingTitle')} description={t('admin.duplicates.loadingHint')} />
          ) : errorMessage ? (
            <ErrorState message={errorMessage} onRetry={fetchCandidates} />
          ) : candidates.length === 0 ? (
            <EmptyState title={t('admin.duplicates.noResults')} message={t('admin.duplicates.noFilterResults')} />
          ) : (
            <div className="admin-list-stack">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`admin-record-card ${selectedId === candidate.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  <div className="admin-record-main">
                    <strong className="admin-queue-card-title">{candidate.titleA.name}</strong>
                    <span className="admin-queue-card-subtitle">{candidate.titleB.name}</span>
                    <div className="admin-chip-grid" style={{ gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span className={`admin-queue-pill status-${candidate.status}`}>{candidate.statusLabel}</span>
                      <span className="admin-queue-pill">{candidate.confidence.toFixed(0)} {t('admin.duplicates.confidenceSuffix')}</span>
                      {candidate.heuristicFlags.slice(0, 2).map((flag) => (
                        <span key={flag} className="admin-queue-pill subtle">{flag}</span>
                      ))}
                    </div>
                    <span className="admin-clamp-2">{candidate.reason || t('admin.duplicates.noHeuristicDetail')}</span>
                  </div>
                  <div className="admin-record-meta">
                    <span>#{candidate.id}</span>
                    <span>{new Date(candidate.createdAt).toLocaleDateString(locale)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-form-container">
          <div className="admin-panel-heading">
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <GitPullRequest size={20} color="var(--primary-500)" />
                {t('admin.duplicates.reviewTitle')}
              </h2>
              <p>{t('admin.duplicates.reviewHint')}</p>
            </div>
          </div>

          {!selectedCandidate ? (
            <AdminStatePanel title={t('admin.duplicates.noSelection')} description={t('admin.duplicates.noSelectionHint')} />
          ) : (
            <form className="glass-panel" onSubmit={handleSaveReview}>
              <div className="admin-debug-grid" style={{ marginTop: 0, marginBottom: 'var(--space-5)' }}>
                <div><span>{t('admin.duplicates.confidence')}</span><strong>{selectedCandidate.confidence.toFixed(0)}</strong></div>
                <div><span>{t('admin.duplicates.metaStatus')}</span><strong>{selectedCandidate.statusLabel}</strong></div>
                <div><span>{t('admin.duplicates.primarySuggestion')}</span><strong>#{selectedCandidate.suggestedPrimaryTitleId || '-'}</strong></div>
                <div><span>{t('admin.duplicates.flags')}</span><strong>{selectedCandidate.heuristicFlags.join(', ') || '-'}</strong></div>
              </div>

              <div className="admin-two-up" style={{ marginBottom: 'var(--space-5)' }}>
                <article className="admin-compare-card">
                  <div className="admin-compare-head">
                    <span className="admin-section-label">{t('admin.duplicates.optionA')}</span>
                    <span className={`admin-queue-pill ${Number(editorState.primaryTitleId) === selectedCandidate.titleAId ? 'status-approved' : 'subtle'}`}>
                      {Number(editorState.primaryTitleId) === selectedCandidate.titleAId ? t('admin.duplicates.labelPrimary') : t('admin.duplicates.labelCandidate')}
                    </span>
                  </div>
                  <div className="admin-preview-result-top admin-preview-result-top-compact">
                    <img src={selectedCandidate.titleA.cover} alt="" className="admin-preview-cover" />
                    <div className="admin-preview-copy">
                      <h3>{selectedCandidate.titleA.name}</h3>
                      <p>{selectedCandidate.titleA.canonicalTitle}</p>
                    </div>
                  </div>
                  <div className="admin-inline-kv-grid">
                    <div><span>{t('admin.duplicates.metaId')}</span><strong>#{selectedCandidate.titleA.id}</strong></div>
                    <div><span>{t('admin.duplicates.metaSlug')}</span><strong>{selectedCandidate.titleA.slug || '-'}</strong></div>
                    <div><span>{t('admin.duplicates.metaYear')}</span><strong>{selectedCandidate.titleA.year || '-'}</strong></div>
                    <div><span>{t('admin.duplicates.metaType')}</span><strong>{selectedCandidate.titleA.type || '-'}</strong></div>
                  </div>
                </article>

                <article className="admin-compare-card">
                  <div className="admin-compare-head">
                    <span className="admin-section-label">{t('admin.duplicates.optionB')}</span>
                    <span className={`admin-queue-pill ${Number(editorState.primaryTitleId) === selectedCandidate.titleBId ? 'status-approved' : 'subtle'}`}>
                      {Number(editorState.primaryTitleId) === selectedCandidate.titleBId ? t('admin.duplicates.labelPrimary') : t('admin.duplicates.labelCandidate')}
                    </span>
                  </div>
                  <div className="admin-preview-result-top admin-preview-result-top-compact">
                    <img src={selectedCandidate.titleB.cover} alt="" className="admin-preview-cover" />
                    <div className="admin-preview-copy">
                      <h3>{selectedCandidate.titleB.name}</h3>
                      <p>{selectedCandidate.titleB.canonicalTitle}</p>
                    </div>
                  </div>
                  <div className="admin-inline-kv-grid">
                    <div><span>{t('admin.duplicates.metaId')}</span><strong>#{selectedCandidate.titleB.id}</strong></div>
                    <div><span>{t('admin.duplicates.metaSlug')}</span><strong>{selectedCandidate.titleB.slug || '-'}</strong></div>
                    <div><span>{t('admin.duplicates.metaYear')}</span><strong>{selectedCandidate.titleB.year || '-'}</strong></div>
                    <div><span>{t('admin.duplicates.metaType')}</span><strong>{selectedCandidate.titleB.type || '-'}</strong></div>
                  </div>
                </article>
              </div>

              <div className="admin-preview-card admin-note-box" style={{ marginBottom: 'var(--space-5)' }}>
                <h3>{t('admin.duplicates.whyFlagged')}</h3>
                <p>{selectedCandidate.reason || t('admin.duplicates.noHeuristicDetail')}</p>
              </div>

              <div className="admin-form-grid">
                <label>
                  <span className="form-label">{t('admin.duplicates.reviewStatus')}</span>
                  <select
                    className="form-select"
                    value={editorState.status}
                    onChange={(event) => setEditorState((current) => ({ ...current, status: event.target.value }))}
                  >
                    {DUPLICATE_STATUS_OPTIONS.filter((option) => option.value !== 'merged').map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="form-label">{t('admin.duplicates.primaryToKeep')}</span>
                  <select
                    className="form-select"
                    value={editorState.primaryTitleId}
                    onChange={(event) => setEditorState((current) => ({ ...current, primaryTitleId: event.target.value }))}
                  >
                    <option value={selectedCandidate.titleAId}>{selectedCandidate.titleA.name} (#{selectedCandidate.titleAId})</option>
                    <option value={selectedCandidate.titleBId}>{selectedCandidate.titleB.name} (#{selectedCandidate.titleBId})</option>
                  </select>
                </label>
                <label className="admin-form-grid-wide">
                  <span className="form-label">{t('admin.duplicates.reviewNote')}</span>
                  <textarea
                    className="form-input"
                    rows={5}
                    value={editorState.reviewNote}
                    onChange={(event) => setEditorState((current) => ({ ...current, reviewNote: event.target.value }))}
                    placeholder={t('admin.duplicates.reviewNotePlaceholder')}
                  />
                </label>
              </div>

              <div className="admin-action-bar">
                <button className="action-btn" type="submit" disabled={isSaving}>
                  {isSaving ? t('admin.common.saving') : t('admin.duplicates.saveReview')}
                </button>
                <button
                  className="primary-btn"
                  type="button"
                  disabled={isSaving || editorState.status !== 'approved'}
                  onClick={handleMerge}
                >
                  <GitMerge size={18} />
                  {t('admin.duplicates.mergeApproved')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

export default AdminDuplicates;
