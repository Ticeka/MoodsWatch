import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';
import { normalizeTrailer } from '@/shared/lib/trailers';
import './TrailerModal.css';
import './ThemeSongModal.css';

function isDirectVideoUrl(url) {
  const value = String(url || '').trim().toLowerCase();
  return (
    value.endsWith('.mp4') ||
    value.endsWith('.webm') ||
    value.endsWith('.ogg') ||
    value.includes('.mp4?') ||
    value.includes('.webm?') ||
    value.includes('.ogg?')
  );
}

export function ThemeSongModal({ song, onClose }) {
  const rawUrl = String(song?.video_url || '').trim();
  const trailer = normalizeTrailer({ trailer_url: rawUrl });
  const modalTitle = song?.sourceTitleName || song?.song_title || 'Theme song';
  const canPlayInlineVideo = Boolean(rawUrl) && !trailer?.embedUrl && isDirectVideoUrl(rawUrl);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="trailer-modal-backdrop theme-song-modal-backdrop" onClick={onClose}>
      <div className="trailer-modal theme-song-modal" onClick={(event) => event.stopPropagation()}>
        <div className="trailer-modal-header">
          <span className="trailer-modal-title">{modalTitle}</span>
          <div className="trailer-modal-controls">
            {(trailer?.watchUrl || rawUrl) ? (
              <a
                href={trailer?.watchUrl || rawUrl}
                target="_blank"
                rel="noreferrer"
                className="trailer-modal-ext"
                title="Open in new tab"
              >
                <ExternalLink size={15} />
              </a>
            ) : null}
            <button
              type="button"
              className="trailer-modal-close"
              onClick={onClose}
              aria-label="Close trailer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="trailer-modal-frame-wrap">
          {trailer?.embedUrl ? (
            <iframe
              className="trailer-modal-frame"
              src={trailer.embedUrl}
              title={`Trailer: ${modalTitle}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : canPlayInlineVideo ? (
            <video
              className="theme-song-modal-video"
              src={rawUrl}
              controls
              autoPlay
              playsInline
            />
          ) : (trailer?.watchUrl || rawUrl) ? (
            <div className="trailer-modal-no-embed">
              <p>Cannot embed this preview here.</p>
              <a href={trailer?.watchUrl || rawUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                <ExternalLink size={14} /> Open Preview
              </a>
            </div>
          ) : (
            <div className="trailer-modal-no-embed">
              <p>No preview link available.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
