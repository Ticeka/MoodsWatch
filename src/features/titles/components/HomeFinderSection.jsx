import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { MoodSelector } from '@/features/discover/components/MoodSelector';
import { TimeSelector } from '@/features/discover/components/TimeSelector';
import { Button } from '@/shared/components/ui/Button';
import { TYPE_OPTIONS, getLocalizedLabel } from '@/shared/data/moods';
import { TypeIcon } from '@/shared/components/ui/TypeIcon';

export function HomeFinderSection({
  language,
  t,
  hideSeen,
  onHideSeenChange,
  shouldShowTypeSelector,
  type,
  onTypeChange,
  moods,
  onMoodsChange,
  timeOption,
  onTimeOptionChange,
  onRecommend,
  isLoading,
  hasActiveFilters,
  onClearAllFilters,
}) {
  return (
    <section id="finder-section" className="section finder-section">
      <div className="container">
        <div className="glass-panel main-finder">
          <div className="finder-header">
            <h2 className="finder-title">{t('home.chooseWhatYouWant')}</h2>

            <label className="hide-seen-toggle">
              <input
                type="checkbox"
                checked={hideSeen}
                onChange={(event) => onHideSeenChange(event.target.checked)}
              />
              <span className="toggle-track">
                <span className="toggle-thumb"></span>
              </span>
              <span className="toggle-label">{t('home.hideSeenTitles')}</span>
            </label>
          </div>

          {shouldShowTypeSelector && (
            <div className="type-selector stagger-children" role="toolbar" aria-label={t('home.typeTabsAria')}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={type === opt.id}
                  className={`type-btn ${type === opt.id ? 'active' : ''}`}
                  data-type={opt.id}
                  onClick={() => onTypeChange(opt.id)}
                >
                  <span className="type-icon">
                    <TypeIcon option={opt} className="type-icon-graphic" />
                  </span>
                  <span className="type-btn-label">{getLocalizedLabel(opt, language)}</span>
                </button>
              ))}
            </div>
          )}

          <MoodSelector selected={moods} onChange={onMoodsChange} />
          <div className="divider"></div>
          <TimeSelector selected={timeOption} onChange={onTimeOptionChange} />

          <div className="finder-submit">
            <Button
              size="lg"
              fullWidth
              onClick={onRecommend}
              disabled={isLoading}
              icon={isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              className={isLoading ? 'spinning-icon' : 'pulse-glow-btn'}
            >
              {isLoading ? t('home.findingMatches') : t('home.findMyMatch')}
            </Button>

            {hasActiveFilters && (
              <button
                type="button"
                className="clear-all-btn"
                onClick={onClearAllFilters}
              >
                {t('home.clearAllFilters')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
