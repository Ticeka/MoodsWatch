import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';

export function HomeContinueSection({
  isVisible,
  continueCards,
  onContinueAdvance,
  onSetNextTarget,
  onCatchUpTarget,
  onContinueComplete,
  t,
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <section className="section">
      <div className="container">
        <SectionHeader
          title={t('home.continueSection')}
          action={(
            <Link to="/watchlist" className="quick-link">
              <span>{t('common.list')}</span> {t('home.openWatchlist')}
            </Link>
          )}
        />
        <div className="continue-grid stagger-children">
          {continueCards.map((title) => (
            <div key={title.id} className="continue-card-shell">
              <TitleCard title={title} />
              <div className="continue-actions-panel">
                <div className="continue-copy">
                  <strong>{title._continueSummary}</strong>
                  <span>
                    {title._continueRemaining === null
                      ? t('home.continueAt', { unit: title._continueUnitLabel, value: title._continueNextUnit })
                      : title._continueRemaining <= 1
                        ? t('home.almostDone')
                        : t('home.continueAt', { unit: title._continueUnitLabel, value: title._continueNextUnit })}
                  </span>
                  {title._continueTargetUnits && (
                    <span className="continue-target-pill">
                      {t('common.target')}: {title._continueUnitLabel} {title._continueTargetUnits}
                    </span>
                  )}
                </div>
                <div className="continue-actions-row">
                  <Button variant="secondary" onClick={() => onContinueAdvance(title)}>
                    +1 {title._continueUnitLabel}
                  </Button>
                  <Button variant="ghost" onClick={() => onSetNextTarget(title)}>
                    {t('home.setTarget')}
                  </Button>
                  {title._continueTargetUnits && title._continueTargetUnits > title._continueCurrentProgress && (
                    <Button variant="ghost" onClick={() => onCatchUpTarget(title)}>
                      {t('home.catchUp')}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => onContinueComplete(title)}>
                    {t('home.markComplete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
