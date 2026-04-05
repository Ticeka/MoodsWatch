import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';

export function TierListEmptyPanel({ icon, title, message, action }) {
  return (
    <div className="glass-heavy tierlist-empty-state">
      <EmptyState
        className="empty-state"
        icon={icon}
        title={title}
        message={message}
        action={action}
      />
    </div>
  );
}

export function TierListErrorPanel({ message, onRetry, backLabel, backTo }) {
  return (
    <div className="glass-heavy tierlist-empty-state">
      <ErrorState message={message} onRetry={onRetry} />
      {backLabel && backTo ? (
        <div className="tierlist-template-actions">
          <Link className="btn btn-ghost btn-sm" to={backTo}>
            {backLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
