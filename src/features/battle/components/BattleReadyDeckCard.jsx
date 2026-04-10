import React from 'react';
import { Globe, Lock, Play } from 'lucide-react';
import {
  getBattleDeckEntryUnitLabel,
  getBattleDeckMeta,
} from '@/features/battle/lib/battleDeckPresentation';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';

export function BattleReadyDeckCard({
  title,
  subtitle,
  deck,
  badge,
  badgeClassName = '',
  disabled,
  onStart,
  actionLabel = '',
  className = '',
  children,
  variant = 'default',
}) {
  const { t } = useLanguage();
  const deckCount = deck?.titles?.length || 0;
  const getLocalizedReadyUnit = (entityType) => {
    const unit = getBattleDeckEntryUnitLabel(entityType);
    if (unit === 'characters') return t('battle.unitCharacters');
    if (unit === 'songs') return t('battle.unitSongs');
    return t('battle.unitTitles');
  };
  const countBadgeLabel = `${deckCount} ${getLocalizedReadyUnit(deck?.filters?.entityType)}`;
  const resolvedActionLabel = actionLabel || t('battle.startBattle');
  const previewTitles = (() => {
    const items = deck?.titles?.slice(0, 3) || [];
    if (items.length === 2) {
      return [...items, items[1]];
    }
    if (items.length === 1) {
      return [items[0], items[0], items[0]];
    }
    return items;
  })();
  const canStart = deckCount >= 8;
  const metaLabel = getBattleDeckMeta(deck);
  const isCardDisabled = disabled || !canStart;
  const handlePresetActivate = () => {
    if (isCardDisabled) {
      return;
    }
    onStart?.();
  };
  const handlePresetKeyDown = (event) => {
    if (isCardDisabled) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onStart?.();
    }
  };

  if (variant === 'preset') {
    return (
      <div
        role="button"
        tabIndex={isCardDisabled ? -1 : 0}
        aria-disabled={isCardDisabled}
        className={`battle-preset-card glass-heavy ${!canStart ? 'is-disabled' : ''} ${className}`.trim()}
        onClick={handlePresetActivate}
        onKeyDown={handlePresetKeyDown}
      >
        <div className="battle-preset-art">
          {previewTitles.length > 0 ? (
            previewTitles.map((item, index) => (
              <div
                key={item.id}
                className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
              >
                <img src={getTitleArtwork(item)} alt="" loading="lazy" />
              </div>
            ))
          ) : (
            <div className="battle-preset-art-empty">
              <Play size={20} />
            </div>
          )}
          <span className="battle-card-count-badge">{countBadgeLabel}</span>
        </div>
        <div className="battle-preset-head">
          <span className={`battle-preset-badge ${badgeClassName}`.trim()}>{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <span className="battle-preset-meta">{metaLabel}</span>
        <span className="battle-preset-cta">{resolvedActionLabel}</span>
      </div>
    );
  }

  return (
    <div className={`battle-deck-card glass-heavy ${!canStart ? 'is-disabled' : ''} ${className}`.trim()}>
      <div className="battle-preset-art">
        {previewTitles.length > 0 ? (
          previewTitles.map((item, index) => (
            <div
              key={item.id}
              className={`battle-preset-art-tile battle-preset-art-tile-${index + 1}`}
            >
              <img src={getTitleArtwork(item)} alt="" loading="lazy" />
            </div>
          ))
        ) : (
          <div className="battle-preset-art-empty">
            <Play size={20} />
          </div>
        )}
        <span className="battle-card-count-badge">{countBadgeLabel}</span>
      </div>

      <div className="battle-deck-card-body">
        <div className="battle-preset-head">
          <span className={`battle-preset-badge ${badgeClassName}`.trim()}>{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <div className="battle-deck-meta-row">
          <span className="battle-preset-meta">
            {t('battle.deckReadyMeta', {
              count: deckCount,
              unit: getLocalizedReadyUnit(deck?.filters?.entityType),
            })}
          </span>
          <span className={`battle-visibility-pill ${deck?.isPublic ? 'is-public' : 'is-private'}`}>
            {deck?.isPublic ? <Globe size={12} /> : <Lock size={12} />}
            {deck?.isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}
          </span>
        </div>
      </div>

      <div className="battle-deck-card-actions">
        <Button onClick={onStart} disabled={isCardDisabled} icon={<Play size={16} />}>
          {actionLabel || t('battle.startBattle')}
        </Button>
        {children}
      </div>
    </div>
  );
}
