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
  disabled,
  onStart,
  actionLabel = '',
  className = '',
  children,
  variant = 'default',
}) {
  const { t } = useLanguage();
  const resolvedActionLabel = actionLabel || t('battle.startBattle');
  const previewTitles = deck?.titles?.slice(0, 3) || [];
  const canStart = (deck?.titles?.length || 0) >= 8;
  const metaLabel = getBattleDeckMeta(deck);

  if (variant === 'preset') {
    return (
      <button
        type="button"
        className={`battle-preset-card glass-heavy ${!canStart ? 'is-disabled' : ''} ${className}`.trim()}
        onClick={onStart}
        disabled={disabled || !canStart}
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
        </div>
        <div className="battle-preset-head">
          <span className="battle-preset-badge">{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <span className="battle-preset-meta">{metaLabel}</span>
        <span className="battle-preset-cta">{resolvedActionLabel}</span>
      </button>
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
      </div>

      <div className="battle-deck-card-body">
        <div className="battle-preset-head">
          <span className="battle-preset-badge">{badge}</span>
          <strong>{title}</strong>
        </div>
        {subtitle ? <p>{subtitle}</p> : null}
        <div className="battle-deck-meta-row">
          <span className="battle-preset-meta">{deck?.titles?.length || 0} {getBattleDeckEntryUnitLabel(deck?.filters?.entityType)} ready</span>
          <span className={`battle-visibility-pill ${deck?.isPublic ? 'is-public' : 'is-private'}`}>
            {deck?.isPublic ? <Globe size={12} /> : <Lock size={12} />}
            {deck?.isPublic ? t('battle.publicDeck') : t('battle.privateDeck')}
          </span>
        </div>
      </div>

      <div className="battle-deck-card-actions">
        <Button onClick={onStart} disabled={disabled || !canStart} icon={<Play size={16} />}>
          {actionLabel || t('battle.startBattle')}
        </Button>
        {children}
      </div>
    </div>
  );
}
