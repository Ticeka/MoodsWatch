import React, { useRef } from 'react';
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
  onOpenDetail = null,
}) {
  const pointerSessionRef = useRef(null);
  const isSong = isThemeSongEntity(title);
  const isCharacter = isCharacterEntity(title);
  const canPreviewSong = isSong && title?.video_url && typeof onPreviewSong === 'function';
  const canOpenDetail = typeof onOpenDetail === 'function';
  const entityChip = isSong ? 'Theme Song' : (isCharacter ? 'Character' : 'Title');
  const cardTitle = canOpenDetail
    ? `${getDisplayName(title)}\nDouble click to open details`
    : getDisplayName(title);

  return (
    <article
      className={`tiermaker-tile${isDragging ? ' is-dragging-origin' : ''}${canOpenDetail ? ' can-open-detail' : ''}`}
      title={cardTitle}
      data-tier-tile="true"
      onPointerDown={(event) => {
        if (event.button !== 0 || !onPointerDragStart) {
          return;
        }
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          hasStartedDrag: false,
        };
      }}
      onPointerMove={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId || session.hasStartedDrag) {
          return;
        }

        const deltaX = event.clientX - session.startX;
        const deltaY = event.clientY - session.startY;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance < 6) {
          return;
        }

        session.hasStartedDrag = true;
        event.preventDefault();
        onPointerDragStart(event, {
          titleId: Number(title.id),
          fromRowId,
          fromIndex,
        });
      }}
      onPointerUp={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) {
          return;
        }
        pointerSessionRef.current = null;
      }}
      onPointerCancel={(event) => {
        const session = pointerSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) {
          return;
        }
        pointerSessionRef.current = null;
      }}
      onClick={(event) => {
        if (event.detail < 2) {
          return;
        }
        if (!canOpenDetail) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onOpenDetail(title);
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
