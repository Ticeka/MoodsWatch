import React, { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import './ThemeSongModal.css';

export function ThemeSongModal({ song, onClose }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="trailer-modal-backdrop" onClick={onClose}>
      <div className="trailer-modal theme-song-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trailer-modal-header">
          <div className="theme-song-modal-info">
            <span className="song-type-badge theme-song-modal-type-badge">
              {song.theme_type}{song.theme_sequence > 1 ? ` ${song.theme_sequence}` : ''}
            </span>
            <div className="theme-song-modal-text">
              <span className="trailer-modal-title">{song.song_title}</span>
              {song.artist_name && <span className="theme-song-modal-artist">{song.artist_name}</span>}
            </div>
          </div>
          <div className="trailer-modal-controls">
            {song.video_url && (
              <a href={song.video_url} target="_blank" rel="noreferrer" className="trailer-modal-ext" title="Open in new tab">
                <ExternalLink size={15} />
              </a>
            )}
            <button type="button" className="trailer-modal-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="trailer-modal-frame-wrap">
          {song.video_url ? (
            <video
              className="theme-song-video"
              src={song.video_url}
              controls
              autoPlay
            />
          ) : (
            <div className="trailer-modal-no-embed">
              <p>ไม่มีลิงก์วิดีโอ</p>
            </div>
          )}
        </div>
        {(song.episodes_text || song.is_creditless || song.is_spoiler || song.is_nsfw) && (
          <div className="theme-song-modal-meta">
            {song.episodes_text && <span className="theme-song-modal-eps">{song.episodes_text}</span>}
            {song.is_creditless && <span className="song-badge song-badge--nc">NC</span>}
            {song.is_spoiler && <span className="song-badge song-badge--spoiler">Spoiler</span>}
            {song.is_nsfw && <span className="song-badge song-badge--nsfw">NSFW</span>}
          </div>
        )}
      </div>
    </div>
  );
}
