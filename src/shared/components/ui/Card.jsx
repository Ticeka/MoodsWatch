import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useFavoriteTitles } from '@/features/profile/hooks/useFavoriteTitles';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useTopTitles } from '@/features/profile/hooks/useTopTitles';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { LIST_STATUS_OPTIONS, MOODS, getLocalizedMoodName, getLocalizedLabel } from '@/shared/data/moods';
import { Bookmark, ListPlus, EyeOff, Eye, Heart, Trophy } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitleFormatBadge } from '@/shared/lib/titleType';
import './Card.css';

const moodMap = new Map(MOODS.map((mood) => [mood.id, mood]));
const statusOptionMap = new Map(LIST_STATUS_OPTIONS.map((option) => [option.id, option]));

export const TitleCard = React.memo(function TitleCard({ title, hideActions = false, primaryAction = 'list' }) {
  const { language, t } = useLanguage();
  const { isInList, addToList, removeFromList, getItem, getStatus, updateItem } = useWatchlist();
  const { isFavorite, toggleFavorite } = useFavoriteTitles();
  const { isInTopTitles, addToTopTitles, removeFromTopTitles, getRank, limit } = useTopTitles();
  const { isHidden, hideTitle, unhideTitle } = useHiddenTitles();
  const saved = isInList(title.id);
  const favorite = isFavorite(title.id);
  const topTitle = isInTopTitles(title);
  const topTitleRank = getRank(title);
  const currentStatus = getStatus(title.id);
  const listItem = getItem(title.id);
  const hidden = isHidden(title.id);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const statusLabel = currentStatus
    ? statusOptionMap.get(currentStatus) || null
    : null;
  const progressEpisode = title._listProgressEpisode ?? listItem?.progressEpisode ?? null;
  const progressChapter = title._listProgressChapter ?? listItem?.progressChapter ?? null;
  const progressLabel = progressEpisode
    ? `EP ${progressEpisode}${title.episodes ? ` / ${title.episodes}` : ''}`
    : progressChapter
      ? `CH ${progressChapter}${title.chapters ? ` / ${title.chapters}` : ''}`
      : null;
  const displayScore = Number(title.score || 0);
  const displayPopularity = Number(title.popularity || 0);
  const popularityLabel = displayPopularity >= 1000
    ? `${(displayPopularity / 1000).toFixed(1)}K`
    : displayPopularity > 0
      ? `${displayPopularity}`
      : null;

  const toggleSave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (saved) {
      removeFromList(title.id);
      return;
    }

    addToList(title.id);
  };

  const handleQuickStatus = (event, statusId) => {
    event.preventDefault();
    event.stopPropagation();

    if (currentStatus === statusId) {
      removeFromList(title.id);
    } else if (saved) {
      updateItem(title.id, { status: statusId }, { title });
    } else {
      addToList(title.id, statusId);
    }

    setShowStatusMenu(false);
  };

  const toggleStatusMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setShowStatusMenu((current) => !current);
  };

  const handleStatusMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      setShowStatusMenu(false);
    }
  };

  const toggleFavoriteTitle = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      const result = await toggleFavorite(title.id);
      toast.success(result.isFavorite ? t('card.addedToFavorites') : t('card.removedFromFavorites'));
    } catch (error) {
      console.error(error);
      toast.error(t('card.failedFavoriteUpdate'));
    }
  };

  const toggleHidden = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (hidden) {
        await unhideTitle(title.id);
        toast.success(t('card.visibleAgain'));
      } else {
        await hideTitle(title.id);
        toast.success(t('card.titleHidden'));
      }
    } catch (error) {
      console.error(error);
      toast.error(t('card.failedHiddenUpdate'));
    }
  };

  const toggleTopTitle = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (topTitle) {
        await removeFromTopTitles(title);
        toast.success(t('card.removedFromTopTitles', { type: title.type }));
        return;
      }

      const result = await addToTopTitles(title);
      if (!result.ok && result.reason === 'limit') {
        toast.error(t('card.topTitlesFull', { limit, type: title.type }));
        return;
      }

      toast.success(t('card.addedToTopTitles', { type: title.type }));
    } catch (error) {
      console.error(error);
      toast.error(t('card.failedTopTitlesUpdate'));
    }
  };

  return (
    <Link to={`/title/${title.slug}`} className="title-card">
      <div className="card-image-wrapper">
        <img
          src={title.cover}
          alt={title.title_en || title.title_th}
          className="card-image"
          loading="lazy"
          decoding="async"
        />
        {(favorite || topTitle) && (
          <div className="card-persistent-pills">
            {favorite && <div className="card-favorite-pill">{t('card.favorite')}</div>}
            {topTitle && <div className="card-top-pill">{t('card.top', { rank: topTitleRank })}</div>}
          </div>
        )}
        <div className="card-overlay">
          {!hideActions && (
            <div className="card-top-actions">
              {primaryAction === 'favorite' ? null : (
                <button
                  className={`save-btn ${saved ? 'active' : ''}`}
                  aria-label={saved ? t('card.removeFromList') : t('card.saveToList')}
                  onClick={toggleSave}
                >
                  {saved ? <Bookmark fill="currentColor" size={20} aria-hidden="true" /> : <Bookmark size={20} aria-hidden="true" />}
                </button>
              )}
              <button
                className={`favorite-btn ${favorite ? 'active' : ''}`}
                aria-label={favorite ? t('card.removeFromFavorites') : t('card.addToFavorites')}
                onClick={toggleFavoriteTitle}
              >
                <Heart fill={favorite ? 'currentColor' : 'none'} size={20} aria-hidden="true" />
              </button>
              <button
                className={`top-title-btn ${topTitle ? 'active' : ''}`}
                aria-label={topTitle ? t('card.removeFromTopTitles', { type: title.type }) : t('card.addToTopTitles', { type: title.type })}
                onClick={toggleTopTitle}
              >
                <Trophy fill={topTitle ? 'currentColor' : 'none'} size={18} aria-hidden="true" />
              </button>
              {primaryAction !== 'favorite' && (
                <button
                  className={`quick-status-btn ${showStatusMenu ? 'active' : ''}`}
                  aria-label={t('card.changeStatus')}
                  aria-haspopup="menu"
                  aria-expanded={showStatusMenu}
                  onClick={toggleStatusMenu}
                >
                  <ListPlus size={20} aria-hidden="true" />
                </button>
              )}
              <button
                className={`hide-title-btn ${hidden ? 'active' : ''}`}
                aria-label={hidden ? t('card.showTitleAgain') : t('card.hideTitle')}
                onClick={toggleHidden}
              >
                {hidden ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
              </button>
            </div>
          )}

          <div className="card-overlay-bottom">
            {(displayScore > 0 || popularityLabel) && (
              <div className="score-badge">
                {displayScore > 0 && <span>★ {displayScore}</span>}
                {popularityLabel && <span>• {popularityLabel}</span>}
              </div>
            )}
          </div>
        </div>

        {statusLabel && (
          <div
            className="card-status-pill"
            style={{ backgroundColor: statusLabel.color }}
          >
            {statusLabel.icon} {getLocalizedLabel(statusLabel, language)}
          </div>
        )}
      </div>

      {showStatusMenu && (
        <div
          className="quick-status-menu"
          role="menu"
          onKeyDown={handleStatusMenuKeyDown}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          {LIST_STATUS_OPTIONS.map((option) => (
            <button
              key={option.id}
              role="menuitem"
              className={`quick-status-item ${currentStatus === option.id ? 'active' : ''}`}
              onClick={(event) => handleQuickStatus(event, option.id)}
              style={{ '--status-color': option.color }}
            >
              <span>{option.icon}</span>
              <span>{getLocalizedLabel(option, language)}</span>
              {currentStatus === option.id && <span className="check-mark">{t('card.selected')}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="card-content">
        <div className="card-meta">
          <span className="badge type-badge">{getTitleFormatBadge(title)}</span>
          <span className="badge year-badge">{title.year}</span>
          {displayScore > 0 && <span className="badge score-meta-badge">★ {displayScore}</span>}
          {popularityLabel && <span className="badge popularity-meta-badge">{t('card.popularity', { value: popularityLabel })}</span>}
          {progressLabel && <span className="badge progress-badge">{progressLabel}</span>}
          {title.status === 'completed' && <span className="badge status-badge">{t('card.completed')}</span>}
        </div>

        <h3 className="card-title">{title.title_th || title.title_en}</h3>

        {(title.moods && title.moods.length > 0) && (
          <div className="card-mood-tags">
            {title.moods.slice(0, 3).map((moodId) => (
              <span
                key={moodId}
                className="mood-tag"
                style={{ '--mood-tag-color': moodMap.get(moodId)?.color || '#818cf8' }}
              >
                {getLocalizedMoodName(moodMap.get(moodId), language) || moodId}
              </span>
            ))}
          </div>
        )}

        <div className="card-genres">
          {(title.genres || []).slice(0, 3).join(' / ')}
        </div>
      </div>
    </Link>
  );
});
