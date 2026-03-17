import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Users, Play, RefreshCw, Filter, ListCollapse } from 'lucide-react';
import { AdminStatePanel } from '@/features/admin/components/AdminStatePanel';
import { recommend } from '@/features/discover/lib/recommend';
import { extractProfilePreferences, DEFAULT_PROFILE_PREFERENCES } from '@/features/profile/lib/profileStore';
import { MOODS, TYPE_OPTIONS, getLocalizedMoodName, getLocalizedLabel } from '@/shared/data/moods';
import { supabase } from '@/shared/lib/supabase';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import '../styles/Admin.css';

const TIME_OPTIONS = [
  { id: '', label: 'Any length' },
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
  { id: 'binge', label: 'Binge' },
];

function summarizePersona(profile, watchlist, favoriteTitleIds, hiddenTitleIds) {
  const prefs = extractProfilePreferences(profile);
  return {
    prefs,
    watchlist,
    favoriteTitleIds,
    hiddenTitleIds,
    counts: {
      tracked: watchlist.length,
      favorites: favoriteTitleIds.length,
      hidden: hiddenTitleIds.length,
    },
  };
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export function AdminRecommendationPreview() {
  const { t, language } = useLanguage();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [userState, setUserState] = useState({
    prefs: DEFAULT_PROFILE_PREFERENCES,
    watchlist: [],
    favoriteTitleIds: [],
    hiddenTitleIds: [],
    counts: { tracked: 0, favorites: 0, hidden: 0 },
  });
  const [controls, setControls] = useState({
    type: 'all',
    moods: [],
    timeOption: '',
    limit: 12,
  });
  const [results, setResults] = useState([]);

  const fetchUsers = useCallback(async () => {
    if (!supabase) {
      setErrorMessage('Unable to connect to Supabase');
      setIsLoadingUsers(false);
      return;
    }

    setIsLoadingUsers(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, role, favorite_moods, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setUsers(data || []);
      if (!selectedUserId && data?.length) {
        setSelectedUserId(data[0].id);
      }
    } catch (error) {
      console.error('Failed to load preview users', error);
      setErrorMessage(error.message || 'Failed to load users');
      toast.error(error.message || 'Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    async function loadSelectedUserState() {
      if (!supabase || !selectedUserId) {
        setUserState({
          prefs: DEFAULT_PROFILE_PREFERENCES,
          watchlist: [],
          favoriteTitleIds: [],
          hiddenTitleIds: [],
          counts: { tracked: 0, favorites: 0, hidden: 0 },
        });
        return;
      }

      try {
        const [profileRes, watchlistRes, favoritesRes, hiddenRes] = await Promise.all([
          supabase.from('user_profiles').select('*').eq('id', selectedUserId).maybeSingle(),
          supabase.from('user_lists').select('title_id, list_status, progress_episode, progress_chapter').eq('user_id', selectedUserId),
          supabase.from('user_favorite_titles').select('title_id').eq('user_id', selectedUserId),
          supabase.from('user_hidden_titles').select('title_id, hide_from_recommendations').eq('user_id', selectedUserId),
        ]);

        if (profileRes.error) throw profileRes.error;
        if (watchlistRes.error) throw watchlistRes.error;
        if (favoritesRes.error) throw favoritesRes.error;
        if (hiddenRes.error) throw hiddenRes.error;

        const watchlist = (watchlistRes.data || []).map((item) => ({
          titleId: item.title_id,
          status: item.list_status,
          progressEpisode: item.progress_episode,
          progressChapter: item.progress_chapter,
        }));
        const favoriteTitleIds = (favoritesRes.data || []).map((item) => item.title_id);
        const hiddenTitleIds = (hiddenRes.data || [])
          .filter((item) => item.hide_from_recommendations !== false)
          .map((item) => item.title_id);
        const nextState = summarizePersona(profileRes.data, watchlist, favoriteTitleIds, hiddenTitleIds);

        setUserState(nextState);
        setControls((current) => ({
          ...current,
          moods: current.moods.length > 0 ? current.moods : nextState.prefs.favoriteMoods,
        }));
      } catch (error) {
        console.error('Failed to load preview data', error);
        setErrorMessage(error.message || 'Failed to load preview data');
        toast.error(error.message || 'Failed to load preview data');
        setUserState({
          prefs: DEFAULT_PROFILE_PREFERENCES,
          watchlist: [],
          favoriteTitleIds: [],
          hiddenTitleIds: [],
          counts: { tracked: 0, favorites: 0, hidden: 0 },
        });
      }
    }

    loadSelectedUserState();
  }, [selectedUserId]);

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
    [users, selectedUserId]
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
                  disabled={isLoadingUsers}
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
