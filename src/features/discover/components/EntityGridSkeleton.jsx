import React from 'react';

export function EntityGridSkeleton() {
  return (
    <div className="dv2-entity-grid">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="dv2-entity-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
