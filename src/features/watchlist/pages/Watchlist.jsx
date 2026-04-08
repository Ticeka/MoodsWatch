import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useFavoriteTitles } from '@/features/profile/hooks/useFavoriteTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { LIST_STATUS_OPTIONS, MOODS, getLocalizedLabel, getLocalizedMoodName, getMoodOptionsForAgeGate } from '@/shared/data/moods';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { getTitleTypeMeta, isEpisodeBasedType } from '@/shared/lib/titleType';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { Plus, Target, FastForward, Play, CheckCircle2, Heart, List, Share2, BookOpen } from 'lucide-react';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SkeletonGrid } from '@/shared/components/ui/SkeletonGrid';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { StarRating } from '@/features/watchlist/components/StarRating';
import { ShareCardModal } from '@/features/watchlist/components/ShareCardModal';
import { MoodJournal } from '@/features/watchlist/components/MoodJournal';
import '../styles/Watchlist.css';

function WatchlistProgressRow({ title, onUpdate }) {
  const isEp = isEpisodeBasedType(title.type);
  const current = Number(isEp ? title._listProgressEpisode : title._listProgressChapter) || 0;
  const total = isEp ? title.episodes : title.chapters;
  const unit = getTitleTypeMeta(title.type).unitLabel;
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(current);
  const inputRef = useRef(null);

  const clamp = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) return 0;
    return total ? Math.min(n, total) : n;
  };

  const commit = (val) => {
    const next = clamp(val);
    setEditing(false);
    if (next !== current) onUpdate(next);
  };

  const decrement = () => onUpdate(clamp(current - 1));
  const increment = () => onUpdate(clamp(current + 1));

  return (
    <div className="watchlist-progress-row">
      <span className="watchlist-progress-unit">{unit}</span>
      <button
        className="watchlist-progress-stepper"
        onClick={decrement}
        aria-label={`Decrease ${unit}`}
        disabled={current <= 0}
      >
        –
      </button>
      {editing ? (
        <input
          ref={inputRef}
          className="watchlist-progress-input"
          type="number"
          value={inputVal}
          min={0}
          max={total || undefined}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(inputVal);
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button
          className="watchlist-progress-value"
          onClick={() => { setInputVal(current); setEditing(true); }}
          aria-label={`Edit ${unit} progress, currently ${current}`}
        >
          {current}
        </button>
      )}
      {total != null && (
        <span className="watchlist-progress-total">/ {total}</span>
      )}
      <button
        className="watchlist-progress-stepper"
        onClick={increment}
        aria-label={`Increase ${unit}`}
        disabled={total != null && current >= total}
      >
        +
      </button>
    </div>
  );
}

function buildStableIdList(items = []) {
  return [...new Set(items.map((value) => Number(value)).filter(Boolean))].sort((a, b) => a - b);
}

export function Watchlist() {
  const statusOptionMap = useMemo(
    () => new Map(LIST_STATUS_OPTIONS.map((option) => [option.id, option])),
    []
  );
  const { showAdult } = useAgeGate();
  const { language, t } = useLanguage();
  const {
    watchlist,
    watchlistTitles,
    advanceProgress,
    updateItem,
    setConsumptionTarget,
    catchUpToTarget,
    isLoading: isWatchlistLoading,
    isTitleMetadataLoading: isWatchlistTitleMetadataLoading,
  } = useWatchlist();
  const { favoriteTitleIds, isLoading: isFavoritesLoading, error: favoritesError } = useFavoriteTitles();
  const { prefs, savePreferences } = useProfilePreferences();
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [listPage, setListPage] = useState(0);
  const [titleLibrary, setTitleLibrary] = useState([]);
  const [isTitlesLoading, setIsTitlesLoading] = useState(true);
  const [isSavingMoods, setIsSavingMoods] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [shareTarget, setShareTarget] = useState(null);
  const hydratedTitleMap = useMemo(
    () => new Map((watchlistTitles || []).map((entry) => [entry.id, entry])),
    [watchlistTitles]
  );

  const titleIds = useMemo(
    () => buildStableIdList([
      ...watchlist
        .map((item) => item.titleId)
        .filter((titleId) => !hydratedTitleMap.has(titleId)),
      ...favoriteTitleIds.filter((titleId) => !hydratedTitleMap.has(titleId)),
    ]),
    [favoriteTitleIds, hydratedTitleMap, watchlist]
  );
  const titleIdsKey = useMemo(() => titleIds.join(','), [titleIds]);

  useEffect(() => {
    async function fetchWatchlistTitles() {
      const requestedIds = titleIdsKey
        ? titleIdsKey.split(',').map((value) => Number(value)).filter(Boolean)
        : [];

      if (requestedIds.length === 0) {
        setTitleLibrary([]);
        setIsTitlesLoading(false);
        return;
      }

      setIsTitlesLoading(true);

      try {
        const titlesData = await getTitlesByIds(requestedIds);
        setTitleLibrary(titlesData);
      } catch (error) {
        console.error('Failed to load watchlist titles', error);
      } finally {
        setIsTitlesLoading(false);
      }
    }

    fetchWatchlistTitles();
  }, [titleIdsKey]);

  const mergedTitleMap = useMemo(() => {
    const next = new Map(hydratedTitleMap);
    titleLibrary.forEach((entry) => {
      next.set(entry.id, entry);
    });
    return next;
  }, [hydratedTitleMap, titleLibrary]);

  const isPageLoading =
    isWatchlistLoading ||
    ((titleIds.length > 0 || isWatchlistTitleMetadataLoading) && isTitlesLoading && mergedTitleMap.size === 0) ||
    (watchlist.length > 0 && mergedTitleMap.size === 0);

  const populatedList = useMemo(() => {
    return watchlist
      .map((item) => {
        const title = mergedTitleMap.get(item.titleId);
        return title ? {
          ...title,
          _listStatus: item.status,
          _listProgressEpisode: item.progressEpisode ?? null,
          _listProgressChapter: item.progressChapter ?? null,
          _listUpdatedAt: item.updatedAt || item.addedAt || null,
          _listAddedAt: item.addedAt || null,
          _lastConsumedAt: item.lastConsumedAt ?? null,
          _targetEpisode: item.targetEpisode ?? null,
          _targetChapter: item.targetChapter ?? null,
          _userScore: item.score ?? null,
        } : null;
      })
      .filter(Boolean);
  }, [mergedTitleMap, watchlist]);
  const visiblePopulatedList = useMemo(
    () => filterTitlesForAgeGate(populatedList, showAdult),
    [populatedList, showAdult]
  );

  const watchlistItemMap = useMemo(
    () => new Map(watchlist.map((item) => [item.titleId, item])),
    [watchlist]
  );

  const statusCounts = useMemo(
    () => visiblePopulatedList.reduce((acc, item) => {
      acc[item._listStatus] = (acc[item._listStatus] || 0) + 1;
      return acc;
    }, {}),
    [visiblePopulatedList]
  );

  const LIST_PAGE_SIZE = 48;

  useEffect(() => { setListPage(0); }, [filter, sortBy]);

  const displayList = useMemo(() => {
    const filtered = filter === 'all'
      ? visiblePopulatedList
      : visiblePopulatedList.filter((title) => title._listStatus === filter);

    const statusPriority = {
      watching: 0,
      reading: 1,
      planned: 2,
      'on-hold': 3,
      completed: 4,
      dropped: 5,
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'status') {
        const statusDiff = (statusPriority[a._listStatus] ?? 99) - (statusPriority[b._listStatus] ?? 99);
        if (statusDiff !== 0) return statusDiff;
      }

	      if (sortBy === 'progress') {
	        const aProgress = Math.max(a._listProgressEpisode || 0, a._listProgressChapter || 0);
	        const bProgress = Math.max(b._listProgressEpisode || 0, b._listProgressChapter || 0);
	        if (bProgress !== aProgress) return bProgress - aProgress;
	      }

	      if (sortBy === 'score') {
	        const scoreDiff = Number(b._userScore || 0) - Number(a._userScore || 0);
	        if (scoreDiff !== 0) return scoreDiff;
	      }

	      if (sortBy === 'popularity') {
	        const popularityDiff = Number(b.popularity || 0) - Number(a.popularity || 0);
	        if (popularityDiff !== 0) return popularityDiff;
	      }

	      if (sortBy === 'year') {
	        const yearDiff = Number(b.year || 0) - Number(a.year || 0);
	        if (yearDiff !== 0) return yearDiff;
	      }

	      if (sortBy === 'title') {
	        return String(a.title_th || a.title_en || '').localeCompare(String(b.title_th || b.title_en || ''));
	      }

	      const consumedDiff = new Date(b._lastConsumedAt || b._listUpdatedAt || b._listAddedAt || 0).getTime()
	        - new Date(a._lastConsumedAt || a._listUpdatedAt || a._listAddedAt || 0).getTime();
      if (consumedDiff !== 0) return consumedDiff;

      return String(a.title_th || a.title_en || '').localeCompare(String(b.title_th || b.title_en || ''));
    });
  }, [filter, visiblePopulatedList, sortBy]);

  const pagedDisplayList = useMemo(
    () => displayList.slice(0, (listPage + 1) * LIST_PAGE_SIZE),
    [displayList, listPage]
  );
  const hasMorePages = pagedDisplayList.length < displayList.length;

  const favoriteList = useMemo(() => {
    return favoriteTitleIds
      .map((id) => {
        const title = mergedTitleMap.get(id);
        const listItem = watchlistItemMap.get(id);

        return title ? {
          ...title,
          _listStatus: listItem?.status ?? null,
          _listProgressEpisode: listItem?.progressEpisode ?? null,
          _listProgressChapter: listItem?.progressChapter ?? null,
          _listUpdatedAt: listItem?.updatedAt || listItem?.addedAt || null,
          _listAddedAt: listItem?.addedAt || null,
          _lastConsumedAt: listItem?.lastConsumedAt ?? null,
          _targetEpisode: listItem?.targetEpisode ?? null,
          _targetChapter: listItem?.targetChapter ?? null,
        } : null;
      })
      .filter(Boolean);
  }, [favoriteTitleIds, mergedTitleMap, watchlistItemMap]);
  const visibleFavoriteList = useMemo(
    () => filterTitlesForAgeGate(favoriteList, showAdult),
    [favoriteList, showAdult]
  );

  const favoriteMoodDetails = useMemo(
    () => MOODS.filter((mood) => prefs.favoriteMoods.includes(mood.id) && (showAdult || !mood.isAdult)),
    [prefs.favoriteMoods, showAdult]
  );
  const selectableMoods = useMemo(
    () => getMoodOptionsForAgeGate(showAdult),
    [showAdult]
  );
  const inProgressCount = (statusCounts.watching || 0) + (statusCounts.reading || 0);
  const planningCount = (statusCounts.planned || 0) + (statusCounts['on-hold'] || 0);
  const currentFilterLabel = filter === 'all'
    ? t('watchlist.all')
    : getLocalizedLabel(statusOptionMap.get(filter), language);

  const handleQuickAdvance = async (title) => {
    try {
      await advanceProgress(title, 1);
      toast.success(t('watchlist.updatedProgress', { unit: getTitleTypeMeta(title.type).unitLabel }));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedUpdateProgress'));
    }
  };

  const handleResume = async (title) => {
    const nextStatus = isEpisodeBasedType(title.type) ? 'watching' : 'reading';
    try {
      await updateItem(title.id, { status: nextStatus, lastConsumedAt: new Date().toISOString() }, { title });
      toast.success(t('watchlist.movedToStatus', { status: nextStatus }));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedUpdateStatus'));
    }
  };

  const handleComplete = async (title) => {
    try {
      await updateItem(title.id, { status: 'completed' }, { title });
      toast.success(t('watchlist.markedCompleted'));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedUpdateStatus'));
    }
  };

  const handleSetTarget = async (title) => {
    const nextTarget = Math.max(Number(title._listProgressEpisode || title._listProgressChapter || 0) + 1, 1);

    try {
      await setConsumptionTarget(title, nextTarget);
      toast.success(t('watchlist.setTargetSuccess', { unit: getTitleTypeMeta(title.type).unitLabel, value: nextTarget }));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedSetTarget'));
    }
  };

  const handleCatchUpTarget = async (title) => {
    try {
      await catchUpToTarget(title);
      toast.success(t('watchlist.caughtUp'));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedCatchUp'));
    }
  };

  const handleRate = async (title, score) => {
    try {
      await updateItem(title.id, { score });
      if (score != null) {
        toast.success(t('watchlist.ratedSuccess', { score: Math.round(score / 10) }));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.rateFailed'));
    }
  };

  const handleProgressSet = async (title, value) => {
    const isEp = isEpisodeBasedType(title.type);
    const total = isEp ? title.episodes : title.chapters;
    const updates = {
      [isEp ? 'progressEpisode' : 'progressChapter']: value,
      lastConsumedAt: new Date().toISOString(),
      metadata: { sessionSource: 'manual-input' },
    };
    if (total && value >= total) {
      updates.status = 'completed';
    } else if (title._listStatus === 'planned' || title._listStatus === 'on-hold') {
      updates.status = isEp ? 'watching' : 'reading';
    }
    try {
      await updateItem(title.id, updates, { title });
      toast.success(t('watchlist.updatedProgress', { unit: getTitleTypeMeta(title.type).unitLabel }));
    } catch (error) {
      console.error(error);
      toast.error(t('watchlist.failedUpdateProgress'));
    }
  };

  const getQuickActions = (title) => {
    const actions = [];
    const status = title._listStatus;
    const hasTarget = Boolean(title._targetEpisode || title._targetChapter);
    const progressValue = title._listProgressEpisode || title._listProgressChapter || 0;
    const targetValue = title._targetEpisode || title._targetChapter || 0;
    const canCatchUp = hasTarget && targetValue > progressValue;

    if (status === 'watching' || status === 'reading') {
      actions.push({
        key: 'advance',
        variant: 'secondary',
        icon: <Plus size={16} />,
        label: `1 ${getTitleTypeMeta(title.type).unitLabel}`,
        onClick: () => handleQuickAdvance(title),
      });
    }

    if (status === 'planned' || status === 'on-hold') {
      actions.push({
        key: 'resume',
        variant: 'secondary',
        icon: <Play size={16} />,
        label: t('watchlist.resume'),
        onClick: () => handleResume(title),
      });
    }

    if ((status === 'planned' || status === 'on-hold' || status === 'watching' || status === 'reading') && !canCatchUp) {
      actions.push({
        key: 'target',
        variant: 'ghost',
        icon: <Target size={16} />,
        label: t('watchlist.setTarget'),
        onClick: () => handleSetTarget(title),
      });
    }

    if (canCatchUp) {
      actions.push({
        key: 'catch-up',
        variant: 'ghost',
        icon: <FastForward size={16} />,
        label: t('watchlist.catchUp'),
        onClick: () => handleCatchUpTarget(title),
      });
    }

    if (status !== 'completed') {
      actions.push({
        key: 'complete',
        variant: 'ghost',
        icon: <CheckCircle2 size={16} />,
        label: t('watchlist.complete'),
        onClick: () => handleComplete(title),
      });
    }

    return actions.slice(0, 2);
  };

  const toggleMood = async (moodId) => {
    const nextPrefs = {
      ...prefs,
      favoriteMoods: prefs.favoriteMoods.includes(moodId)
        ? prefs.favoriteMoods.filter((item) => item !== moodId)
        : [...prefs.favoriteMoods, moodId].slice(-5),
    };

    setIsSavingMoods(true);
    try {
      await savePreferences(nextPrefs);
    } catch (error) {
      console.error(error);
      toast.error(t('profile.preferencesSaveFailed'));
    } finally {
      setIsSavingMoods(false);
    }
  };

  return (
    <div className="watchlist-page animate-fade-in">
      <section className="section pb-0">
        <div className="container">
          <div className="watchlist-header">
            <div className="watchlist-header-copy">
              <span className="watchlist-eyebrow">{t('watchlist.libraryEyebrow')}</span>
              <h1 className="section-heading">{t('watchlist.title')}</h1>
              <p className="watchlist-subtitle">{t('watchlist.subtitle')}</p>
            </div>

            <div className="watchlist-stats glass-heavy">
              <div className="stat-item">
                <span className="stat-value">{visiblePopulatedList.length}</span>
                <span className="stat-label">{t('watchlist.total')}</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{inProgressCount}</span>
                <span className="stat-label">{t('watchlist.inProgress')}</span>
              </div>
              <div className="stat-item">
                <span className="stat-value text-success">{statusCounts.completed || 0}</span>
                <span className="stat-label">{t('watchlist.completed')}</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{visibleFavoriteList.length}</span>
                <span className="stat-label">{t('watchlist.favoritesStat')}</span>
              </div>
            </div>
          </div>

          <div className="watchlist-overview-grid">
            <div className="watchlist-overview-card glass-heavy">
              <span className="watchlist-overview-label">{t('watchlist.currentPace')}</span>
              <strong>{t('watchlist.currentPaceSummary', { count: inProgressCount })}</strong>
              <p>{t('watchlist.currentPaceHint')}</p>
            </div>
            <div className="watchlist-overview-card glass-heavy">
              <span className="watchlist-overview-label">{t('watchlist.queue')}</span>
              <strong>{t('watchlist.queueSummary', { count: planningCount })}</strong>
              <p>{t('watchlist.queueHint')}</p>
            </div>
            <div className="watchlist-overview-card glass-heavy">
              <span className="watchlist-overview-label">{t('watchlist.taste')}</span>
              <strong>{t('watchlist.tasteSummary', { count: prefs.favoriteMoods.length })}</strong>
              <p>{t('watchlist.tasteHint')}</p>
            </div>
          </div>

          <div className="watchlist-controls-shell glass-heavy">
            <div className="watchlist-tabs-nav" role="tablist" aria-label={t('watchlist.title')}>
              <button
                role="tab"
                aria-selected={activeTab === 'list'}
                aria-controls="watchlist-list-panel"
                className={`watchlist-tab ${activeTab === 'list' ? 'active' : ''}`}
                onClick={() => setActiveTab('list')}
              >
                <List size={18} aria-hidden="true" /> {t('watchlist.myList')}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'favorites'}
                aria-controls="watchlist-favorites-panel"
                className={`watchlist-tab ${activeTab === 'favorites' ? 'active' : ''}`}
                onClick={() => setActiveTab('favorites')}
              >
                <Heart size={18} aria-hidden="true" /> {t('watchlist.favoritesAndMoods')}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'journal'}
                aria-controls="watchlist-journal-panel"
                className={`watchlist-tab ${activeTab === 'journal' ? 'active' : ''}`}
                onClick={() => setActiveTab('journal')}
              >
                <BookOpen size={18} aria-hidden="true" /> {t('moodJournal.tabLabel')}
              </button>
            </div>

            {activeTab === 'list' && (
              <>
                <div id="watchlist-list-panel" role="tabpanel" className="watchlist-filter-row">
                  <div className="status-filters scrollbar-hide" role="group" aria-label={t('watchlist.filterByStatus')}>
                    <button
                      className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                      aria-pressed={filter === 'all'}
                      onClick={() => setFilter('all')}
                    >
                      {t('watchlist.all')}
                    </button>
                    {LIST_STATUS_OPTIONS.map((option) => {
                      const count = statusCounts[option.id] || 0;
                      if (count === 0 && filter !== option.id) return null;

                      return (
                        <button
                          key={option.id}
                          className={`filter-btn ${filter === option.id ? 'active' : ''}`}
                          aria-pressed={filter === option.id}
                          onClick={() => setFilter(option.id)}
                          style={filter === option.id ? { '--filter-color': option.color } : {}}
                        >
                          <span className="mr-1" aria-hidden="true">{option.icon}</span> {getLocalizedLabel(option, language)} <span className="count-badge" aria-label={t('watchlist.titlesInStatus', { count, status: getLocalizedLabel(option, language) })}>{count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="watchlist-toolbar">
                    <SortSelect
                      value={sortBy}
                      onChange={setSortBy}
                      label={t('watchlist.sort')}
                      className="watchlist-sorter"
                    >
                      <option value="recent">{t('watchlist.sortOption.recent')}</option>
                      <option value="progress">{t('watchlist.sortOption.progress')}</option>
                      <option value="status">{t('watchlist.sortOption.status')}</option>
                      <option value="score">{t('watchlist.sortOption.score')}</option>
                      <option value="popularity">{t('watchlist.sortOption.popularity')}</option>
                      <option value="year">{t('watchlist.sortOption.year')}</option>
                      <option value="title">{t('watchlist.sortOption.title')}</option>
                    </SortSelect>
                  </div>
                </div>

                <div className="watchlist-list-head">
                  <div>
                    <h2>{t('watchlist.entriesTitle')}</h2>
                    <p>{t('watchlist.entriesSummary', { count: displayList.length, filter: currentFilterLabel.toLowerCase() })}</p>
                  </div>
                  <span className="watchlist-list-pill">
                    {sortBy === 'recent' ? t('watchlist.sortedByRecent') : t('watchlist.sortedBy', { value: t(`watchlist.sortOption.${sortBy}`) })}
                  </span>
                </div>
              </>
            )}
          </div>

          {activeTab === 'favorites' && (
            <div id="watchlist-favorites-panel" role="tabpanel" className="watchlist-favorites glass-heavy">
              <div className="watchlist-favorites-header">
                <div>
                  <h2><Heart size={18} /> {t('watchlist.favoritesHeader')}</h2>
                  <p>{t('watchlist.favoritesHint')}</p>
                </div>
                  <span>{t('watchlist.pinnedCount', { count: visibleFavoriteList.length })}</span>
              </div>

              {favoritesError && <ErrorState message={favoritesError} />}

              <div className="watchlist-moods">
                <div className="watchlist-favorites-subheader">
                  <h3>{t('watchlist.favoriteTags')}</h3>
                  <span>{isSavingMoods ? t('watchlist.savingTags') : t('watchlist.selectedCount', { count: prefs.favoriteMoods.length })}</span>
                </div>
                <div className="watchlist-mood-grid" role="group" aria-label={t('watchlist.favoriteTags')}>
                  {selectableMoods.map((mood) => {
                    const active = prefs.favoriteMoods.includes(mood.id);
                    return (
                      <button
                        key={mood.id}
                        className={`watchlist-mood-chip ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        style={{ '--mood-color': mood.color }}
                        onClick={() => toggleMood(mood.id)}
                      >
                        <span aria-hidden="true">{mood.icon}</span>
                        <span>{getLocalizedMoodName(mood, language)}</span>
                      </button>
                    );
                  })}
                </div>
                {favoriteMoodDetails.length > 0 && (
                  <div className="watchlist-selected-moods">
                    {favoriteMoodDetails.map((mood) => (
                      <span key={mood.id} className="watchlist-selected-mood" style={{ '--mood-color': mood.color }}>
                        {mood.icon} {getLocalizedMoodName(mood, language)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

                <div className="watchlist-favorites-subheader">
                  <h3>{t('watchlist.favoriteTitles')}</h3>
                  <span>{t('watchlist.pinnedCount', { count: visibleFavoriteList.length })}</span>
                </div>
              {isFavoritesLoading && visibleFavoriteList.length === 0 ? (
                <div className="watchlist-favorites-empty">{t('watchlist.favoriteTitlesLoading')}</div>
              ) : visibleFavoriteList.length > 0 ? (
                <div className="results-grid stagger-children">
                  {visibleFavoriteList.map((title) => (
                    <div key={`favorite-${title.id}`} className="watchlist-item-wrapper">
                      <TitleCard title={title} primaryAction="favorite" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="watchlist-favorites-empty">{t('watchlist.noFavoriteTitlesYet')}</div>
              )}
            </div>
          )}
        </div>
      </section>

      {activeTab === 'journal' && (
        <section id="watchlist-journal-panel" role="tabpanel" className="section">
          <div className="container">
            <MoodJournal />
          </div>
        </section>
      )}

      {activeTab === 'list' && (
        <section className="section watchlist-results-section min-h-screen">
          <div className="container">
            {isPageLoading ? (
              <SkeletonGrid count={4} cardClassName="skeleton-card glass" />
            ) : displayList.length > 0 ? (
              <>
              <div className="results-grid stagger-children">
                {pagedDisplayList.map((title) => {
                  const quickActions = getQuickActions(title);

                  return (
                    <div key={title.id} className="watchlist-item-wrapper">
                      <div className="watchlist-item-top-row">
                        <div
                          className="status-indicator"
                          style={{
                            backgroundColor: statusOptionMap.get(title._listStatus)?.color,
                          }}
                        >
                          {getLocalizedLabel(statusOptionMap.get(title._listStatus), language)}
                        </div>
                        <button
                          className="watchlist-share-btn"
                          onClick={() => setShareTarget({ title, listItem: watchlistItemMap.get(title.id) })}
                          aria-label="Share card"
                        >
                          <Share2 size={14} />
                        </button>
                      </div>
                      <TitleCard title={title} />
                      {(title._listStatus === 'watching' || title._listStatus === 'reading') && (
                        <WatchlistProgressRow
                          title={title}
                          onUpdate={(val) => handleProgressSet(title, val)}
                        />
                      )}
                      {(title._targetEpisode || title._targetChapter || title._lastConsumedAt) && (
                        <div className="watchlist-item-meta">
                          {title._targetEpisode || title._targetChapter ? (
                            <span className="watchlist-meta-pill">
                              {t('watchlist.targetLabel')} {getTitleTypeMeta(title.type).unitLabel} {title._targetEpisode || title._targetChapter}
                            </span>
                          ) : null}
                          {title._lastConsumedAt ? (
                            <span className="watchlist-meta-pill subtle">
                              {t('watchlist.lastLabel')} {new Date(title._lastConsumedAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US')}
                            </span>
                          ) : null}
                        </div>
                      )}
                      <StarRating
                        score={title._userScore}
                        onRate={(score) => handleRate(title, score)}
                        label={t('watchlist.myScoreFor', { title: title.title_en || title.title_th || '' })}
                      />
                      {quickActions.length > 0 && (
                        <div className="watchlist-quick-actions">
                          {quickActions.map((action) => (
                            <Button
                              key={`${title.id}-${action.key}`}
                              variant={action.variant}
                              onClick={action.onClick}
                              icon={action.icon}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasMorePages && (
                <div className="watchlist-load-more">
                  <Button variant="secondary" onClick={() => setListPage((p) => p + 1)}>
                    {t('watchlist.loadMore', { count: displayList.length - pagedDisplayList.length })}
                  </Button>
                </div>
              )}
              </>
            ) : (
              <EmptyState
                title={t('watchlist.noTitlesYet')}
                message={filter === 'all' ? t('watchlist.watchlistEmpty') : t('watchlist.noTitlesForStatus')}
              />
            )}
          </div>
        </section>
      )}

      {shareTarget && (
        <ShareCardModal
          title={shareTarget.title}
          listItem={shareTarget.listItem}
          language={language}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}

export default Watchlist;
