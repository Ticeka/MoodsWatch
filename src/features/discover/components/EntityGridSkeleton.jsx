import React from 'react';

export function EntityGridSkeleton() {
  return (
    <div className="discover-entity-grid">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="discover-entity-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
