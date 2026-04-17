import React from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { CURATED_LANES } from '../../constants/discoverConfig';

export function DiscoverStarterLanes({ counts, onLaneClick }) {
  const { t } = useLanguage();

  return (
    <section className="dv2-starter">
      <header className="dv2-starter-head">
        <span className="dv2-starter-eyebrow">
          <Compass size={13} aria-hidden="true" />
          {t('discover.idleExploreLabel')}
        </span>
        <h2 className="dv2-starter-title">{t('discover.allResultsTitle')}</h2>
        <p className="dv2-starter-subtitle">{t('discover.idleExploreSubtitle')}</p>
      </header>

      <div className="dv2-starter-grid">
        {CURATED_LANES.map((lane) => {
          const Icon = lane.icon;
          const count = counts[lane.id] ?? 0;
          return (
            <button
              key={lane.id}
              type="button"
              className={`dv2-lane dv2-lane--${lane.accent}`}
              onClick={() => onLaneClick(lane.preset, 'lane')}
            >
              <span className="dv2-lane-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="dv2-lane-body">
                <strong className="dv2-lane-title">{t(lane.titleKey)}</strong>
                <span className="dv2-lane-desc">{t(lane.descriptionKey)}</span>
                <span className="dv2-lane-count">{t(lane.countLabelKey, { count })}</span>
              </span>
              <span className="dv2-lane-arrow" aria-hidden="true">
                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
