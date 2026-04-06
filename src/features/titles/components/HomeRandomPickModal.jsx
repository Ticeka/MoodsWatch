import React from 'react';
import { Dices, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { EmptyState } from '@/shared/components/ui/EmptyState';

export function HomeRandomPickModal({
  isOpen,
  isLoading,
  randomPick,
  onClose,
  onPickAgain,
  t,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="random-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('home.randomDialogLabel')}
        className="random-modal animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        {isLoading ? (
          <div className="random-modal-loading">
            <div className="random-modal-skeleton"></div>
          </div>
        ) : randomPick ? (
          <div className="random-modal-card">
            <TitleCard title={randomPick} hideActions />
          </div>
        ) : (
          <EmptyState
            className="empty-state random-modal-empty"
            title={t('home.noRandomTitle')}
            message={t('home.tryRandomAgain')}
          />
        )}

        <div className="random-modal-actions">
          <Button
            size="lg"
            variant="secondary"
            onClick={onPickAgain}
            icon={isLoading ? <Loader2 size={18} className="animate-spin" /> : <Dices size={18} />}
            className={`random-modal-button ${isLoading ? 'spinning-icon' : ''}`}
          >
            {isLoading ? t('home.picking') : t('home.pickAgain')}
          </Button>
        </div>
      </div>
    </div>
  );
}
