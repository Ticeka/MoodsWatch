import React, { useEffect, useState } from 'react';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';

export function TierListArtworkImage({ entity, alt = '', className = '', loading = 'lazy', fetchPriority = 'auto' }) {
  const [src, setSrc] = useState(() => getTitleArtwork(entity));

  useEffect(() => {
    setSrc(getTitleArtwork(entity));
  }, [entity]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      draggable={false}
      onError={() => {
        if (src !== '/battle-placeholder.svg') {
          setSrc('/battle-placeholder.svg');
        }
      }}
    />
  );
}
