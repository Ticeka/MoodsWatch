import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Sparkles, Users, Play, RefreshCw, Filter, ListCollapse } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import {
  buildEmptyRecommendationPersona,
  fetchRecommendationPreviewUsers,
  fetchRecommendationPreviewUserState,
} from '@/features/admin/api';
import { recommend } from '@/features/discover/lib/recommend';
import { MOODS, TYPE_OPTIONS, getLocalizedMoodName, getLocalizedLabel } from '@/shared/data/moods';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export function AdminRecommendationPreview() {
  const { t, language } = useLanguage();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [userState, setUserState] = useState(buildEmptyRecommendationPersona);
  const [controls, setControls] = useState({
    type: 'all',
    moods: [],
    timeOption: '',
    limit: 12,
  });
  const [results, setResults] = useState([]);

  const usersQuery = useQuery({
    queryKey: ['admin-recommendation-preview-users'],
    queryFn: fetchRecommendationPreviewUsers,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  const users = useMemo(() => usersQuery.data || [], [usersQuery.data]);

  const userStateQuery = useQuery({
    queryKey: ['admin-recommendation-preview-user-state', selectedUserId || null],
    queryFn: () => fetchRecommendationPreviewUserState(selectedUserId),
    enabled: Boolean(selectedUserId),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId('');
      return;
    }

    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUserId) {
      setUserState(buildEmptyRecommendationPersona());
      return;
    }

    if (userStateQuery.data) {
      setUserState(userStateQuery.data);
      setControls((current) => ({
        ...current,
        moods: current.moods.length > 0 ? current.moods : userStateQuery.data.prefs.favoriteMoods,
      }));
    }
  }, [selectedUserId, userStateQuery.data]);

  const fetchUsers = useCallback(async () => {
    try {
      setErrorMessage('');
      const [usersResult, userStateResult] = await Promise.all([
        usersQuery.refetch(),
        selectedUserId ? userStateQuery.refetch() : Promise.resolve({ error: null }),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (userStateResult?.error) throw userStateResult.error;
    } catch (error) {
      console.error('Failed to load preview users', error);
      setErrorMessage(error.message || 'Failed to load users');
      toast.error(error.message || 'Failed to load users');
    }
  }, [selectedUserId, userStateQuery, usersQuery]);

  useEffect(() => {
    if (usersQuery.error || userStateQuery.error) {
      const nextMessage = usersQuery.error?.message || userStateQuery.error?.message || 'Failed to load preview data';
      setErrorMessage(nextMessage);
      toast.error(nextMessage);
      setUserState(buildEmptyRecommendationPersona());
    }
  }, [userStateQuery.error, usersQuery.error]);

  const runPreview = useCallback(async () => {
    setIsRunning(true);
    try {
      setErrorMessage('');
      const nextResults = await recommend({
        type: controls.type,
        moods: controls.moods,
        timeOption: controls.timeOption ? { id: controls.timeOption } : null,
        likedTitleIds: userState.favoriteTitleIds,
        limit: Number(controls.limit) || 12,
        watchlist: userState.watchlist,
        preferences: userState.prefs,
        hiddenTitleIds: userState.hiddenTitleIds,
        debug: true,
      });
      setResults(nextResults);
    } catch (error) {
      console.error('Failed to generate preview', error);
      setErrorMessage(error.message || 'Failed to generate preview');
      toast.error(error.message || 'Failed to generate preview');
    } finally {
      setIsRunning(false);
    }
  }, [controls.limit, controls.moods, controls.timeOption, controls.type, userState]);

  useEffect(() => {
    if (selectedUserId) {
      runPreview();
    }
  }, [selectedUserId, runPreview]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const handleMoodToggle = (moodId) => {
    setControls((current) => ({
      ...current,
      moods: current.moods.includes(moodId)
        ? current.moods.filter((value) => value !== moodId)
        : [...current.moods, moodId].slice(-5),
    }));
  };

  return (
    <div className="admin-page-content animate-fade-in">
      <div className="admin-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Sparkles size={30} color="var(--primary-500)" />
            {t('admin.recommendations.pageTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.recommendations.pageSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="action-btn" onClick={fetchUsers} type="button">
            <RefreshCw size={16} style={{ marginRight: 8 }} />
            {t('admin.recommendations.refreshUsers')}
          </button>
          <button className="primary-btn" onClick={runPreview} type="button" disabled={isRunning}>
            <Play size={18} />
            {isRunning ? t('admin.recommendations.running') : t('admin.recommendations.runPreview')}
          </button>
        </div>
      </div>

      <div className="admin-split-layout">
        <section className="admin-form-container">
          <div className="glass-panel">
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Users size={20} color="var(--primary-500)" />
                  {t('admin.recommendations.personaTitle')}
                </h2>
                <p>{t('admin.recommendations.personaHint')}</p>
              </div>
            </div>

            {errorMessage ? (
              <AdminStatePanel
                title="Preview data is unavailable"
                description={errorMessage}
                actionLabel="Retry"
                onAction={fetchUsers}
                tone="error"
              />
            ) : null}

            <div className="admin-form-grid">
              <label className="admin-form-grid-wide">
                <span className="form-label">{t('admin.recommendations.fieldUser')}</span>
                <select
                  className="form-select"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={usersQuery.isLoading}
                >
                  <option value="">{t('admin.recommendations.selectUser')}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {(user.name || user.id).trim()} ({user.role || 'user'})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.recommendations.fieldType')}</span>
                <select
                  className="form-select"
                  value={controls.type}
                  onChange={(event) => setControls((current) => ({ ...current, type: event.target.value }))}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{getLocalizedLabel(option, language)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.recommendations.fieldLength')}</span>
                <select
                  className="form-select"
                  value={controls.timeOption}
                  onChange={(event) => setControls((current) => ({ ...current, timeOption: event.target.value }))}
                >
                  <option value="">{t('admin.recommendations.lengthAny')}</option>
                  <option value="short">{t('admin.recommendations.lengthShort')}</option>
                  <option value="medium">{t('admin.recommendations.lengthMedium')}</option>
                  <option value="long">{t('admin.recommendations.lengthLong')}</option>
                  <option value="binge">{t('admin.recommendations.lengthBinge')}</option>
                </select>
              </label>
              <label>
                <span className="form-label">{t('admin.recommendations.fieldResultLimit')}</span>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  max="24"
                  value={controls.limit}
                  onChange={(event) => setControls((current) => ({ ...current, limit: event.target.value }))}
                />
              </label>
            </div>

            <div style={{ marginTop: 'var(--space-5)' }}>
              <span className="form-label">{t('admin.recommendations.moodSignals')}</span>
              <div className="admin-chip-grid">
                {MOODS.map((mood) => {
                  const active = controls.moods.includes(mood.id);
                  return (
                    <button
                      key={mood.id}
                      type="button"
                      className={`admin-filter-chip ${active ? 'active' : ''}`}
                      onClick={() => handleMoodToggle(mood.id)}
                      style={{ '--chip-accent': mood.color }}
                    >
                      <span>{mood.icon}</span>
                      <span>{getLocalizedMoodName(mood, language)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="glass-panel">
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Filter size={20} color="var(--primary-500)" />
                  {t('admin.recommendations.inputSummary')}
                </h2>
                <p>{t('admin.recommendations.inputSummaryHint')}</p>
              </div>
            </div>

            <div className="admin-stat-list">
              <div><span>{t('admin.recommendations.statUser')}</span><strong>{selectedUser?.name || selectedUser?.id || 'None selected'}</strong></div>
              <div><span>{t('admin.recommendations.statTracked')}</span><strong>{userState.counts.tracked}</strong></div>
              <div><span>{t('admin.recommendations.statFavoriteSeeds')}</span><strong>{userState.counts.favorites}</strong></div>
              <div><span>{t('admin.recommendations.statHidden')}</span><strong>{userState.counts.hidden}</strong></div>
              <div><span>{t('admin.recommendations.statFavoriteMoods')}</span><strong>{userState.prefs.favoriteMoods.join(', ') || '-'}</strong></div>
              <div><span>{t('admin.recommendations.statAllowedTypes')}</span><strong>{(userState.prefs.recommendationTypes || []).join(', ')}</strong></div>
              <div><span>{t('admin.recommendations.statMinScore')}</span><strong>{userState.prefs.minRecommendationScore}</strong></div>
              <div><span>{t('admin.recommendations.statLengthPref')}</span><strong>{userState.prefs.recommendationLength}</strong></div>
              <div><span>{t('admin.recommendations.statUnseenPriority')}</span><strong>{userState.prefs.prioritizeUnseen ? t('admin.common.on') : t('admin.common.off')}</strong></div>
              <div><span>{t('admin.recommendations.statForceUnseen')}</span><strong>{userState.prefs.forceUnseenOnly ? t('admin.common.on') : t('admin.common.off')}</strong></div>
            </div>
          </div>
        </section>

        <section className="admin-form-container">
          <div className="glass-panel">
            <div className="admin-panel-heading">
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <ListCollapse size={20} color="var(--primary-500)" />
                  {t('admin.recommendations.previewTitle')}
                </h2>
                <p>{t('admin.recommendations.previewCount', { count: results.length })}</p>
              </div>
            </div>

            {results.length === 0 ? (
              <AdminStatePanel
                title={selectedUserId ? t('admin.recommendations.noPreview') : t('admin.recommendations.noUser')}
                description={selectedUserId ? t('admin.recommendations.noPreviewHint') : t('admin.recommendations.noUserHint')}
              />
            ) : (
              <div className="admin-list-stack">
                {results.map((title, index) => (
                  <article key={title.id} className="admin-preview-result">
                    <div className="admin-preview-result-top">
                      <div className="admin-preview-rank">#{index + 1}</div>
                      <img src={title.cover} alt="" className="admin-preview-cover" />
                      <div className="admin-preview-copy">
                        <h3>{title.title_th || title.title_en}</h3>
                        <p>{title._reason || 'No summary reason generated.'}</p>
                        <div className="admin-preview-meta">
                          <span className="badge badge-user">{title.type}</span>
                          <span>Score {title.score || 'n/a'}</span>
                          <span>Rank {formatPercent(title._score)}</span>
                        </div>
                      </div>
                    </div>

                    {title._debug && (
                      <div className="admin-debug-grid">
                        <div><span>{t('admin.recommendations.debugMoodMatch')}</span><strong>{formatPercent(title._debug.scores.moodMatch)}</strong></div>
                        <div><span>{t('admin.recommendations.debugGenreFit')}</span><strong>{formatPercent(title._debug.scores.genreTagMatch)}</strong></div>
                        <div><span>{t('admin.recommendations.debugLengthFit')}</span><strong>{formatPercent(title._debug.scores.lengthFit)}</strong></div>
                        <div><span>{t('admin.recommendations.debugSimilarity')}</span><strong>{formatPercent(title._debug.scores.similarTitle)}</strong></div>
                        <div><span>{t('admin.recommendations.debugPopularity')}</span><strong>{formatPercent(title._debug.scores.popularityScore)}</strong></div>
                        <div><span>{t('admin.recommendations.debugFreshness')}</span><strong>{formatPercent(title._debug.scores.freshness)}</strong></div>
                        <div><span>{t('admin.recommendations.debugProgress')}</span><strong>{title._debug.progressState}</strong></div>
                        <div><span>{t('admin.recommendations.debugTracked')}</span><strong>{title._debug.isTracked ? t('admin.common.yes') : t('admin.common.no')}</strong></div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AdminRecommendationPreview;
