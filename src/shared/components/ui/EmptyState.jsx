import React from 'react';

export function EmptyState({ icon, title, message, action, className = 'empty-state' }) {
  return (
    <div className={className}>
      {icon && <span className="empty-icon">{icon}</span>}
      {title && <h3>{title}</h3>}
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
