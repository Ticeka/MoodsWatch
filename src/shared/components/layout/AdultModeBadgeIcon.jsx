import React from 'react';

export function AdultModeBadgeIcon({ size = 18, active = false, className = '' }) {
  return (
    <span
      className={`adult-mode-icon ${active ? 'is-active' : ''} ${className}`.trim()}
      style={{ '--adult-mode-icon-size': `${size}px` }}
      aria-hidden="true"
    >
      <span>18+</span>
    </span>
  );
}
