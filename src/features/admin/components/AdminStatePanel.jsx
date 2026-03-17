import React from 'react';

export function AdminStatePanel({
  title,
  description,
  actionLabel = '',
  onAction = null,
  tone = 'default',
}) {
  return (
    <div className={`admin-empty-state ${tone === 'error' ? 'error' : ''}`}>
      {title ? <strong className="admin-state-title">{title}</strong> : null}
      {description ? <p className="admin-state-description">{description}</p> : null}
      {actionLabel && onAction ? (
        <button className="action-btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default AdminStatePanel;
