import React from 'react';

export function SkeletonGrid({ count = 6, cardClassName = 'skeleton-card' }) {
  return (
    <div className="loading-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cardClassName} />
      ))}
    </div>
  );
}
