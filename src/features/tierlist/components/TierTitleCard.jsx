import React from 'react';
import { Play } from 'lucide-react';
import { getDisplayName } from '@/features/tierlist/lib/tierlistLabels';
import { TierListArtworkImage as ArtworkImage } from '@/features/tierlist/components/TierListArtworkImage';
import {
  isCharacterEntity,
  isThemeSongEntity,
} from '@/shared/lib/catalogEntities';

export function TierTitleCard({
  title,
  fromRowId = '',
  fromIndex = null,
  eager = false,
  isDragging = false,
  onPointerDragStart = null,
  onPreviewSong = null,
}) {
  const isSong = isThemeSongEntity(title);
  const isCharacter = isCharacterEntity(title);
  const canPreviewSong = isSong && title?.video_url && typeof onPreviewSong === 'function';
  const entityChip = isSong ? 'Theme Song' : (isCharacter ? 'Character' : 'Title');

  return (
    <article
      className={`tiermaker-tile${isDragging ? ' is-dragging-origin' : ''}`}
      title={getDisplayName(title)}
      data-tier-tile="true"
      onPointerDown={(event) => {
        if (event.button !== 0 || !onPointerDragStart) {
          return;
        }
        onPointerDragStart(event, {
          titleId: Number(title.id),
          fromRowId,
          fromIndex,
        });
      }}
    >
      <div className={`tierlist-item-thumb${isSong ? ' is-song' : ''}`}>
        <ArtworkImage entity={title} alt="" loading={eager ? 'eager' : 'lazy'} />
        <span className="tiermaker-entity-chip">{entityChip}</span>
        {title?.is_adult ? <span className="tiermaker-age-chip">18+</span> : null}
        {isSong ? (
          <>
            <span className="tier-song-badge">{title.role || title.theme_label}</span>
            {canPreviewSong ? (
              <button
                type="button"
                className="tiermaker-song-play"
                aria-label={`Play ${getDisplayName(title)}`}
                title={`Play ${getDisplayName(title)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPreviewSong(title);
                }}
              >
                <Play size={14} />
              </button>
            ) : null}
            <div className="tiermaker-song-meta">
              <strong>{title.song_title || getDisplayName(title)}</strong>
              <span>{title.artist_name || title.sourceTitleName || 'Theme song'}</span>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
