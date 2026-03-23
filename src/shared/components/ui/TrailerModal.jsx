import React, { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import './TrailerModal.css';

export function TrailerModal({ embedUrl, watchUrl, title, onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="trailer-modal-backdrop" onClick={onClose}>
      <div className="trailer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trailer-modal-header">
          {title && <span className="trailer-modal-title">{title}</span>}
          <div className="trailer-modal-controls">
            {watchUrl && (
              <a
                href={watchUrl}
                target="_blank"
                rel="noreferrer"
                className="trailer-modal-ext"
                title="Open in new tab"
              >
                <ExternalLink size={15} />
              </a>
            )}
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
          {embedUrl ? (
            <iframe
              className="trailer-modal-frame"
              src={embedUrl}
              title={title ? `Trailer: ${title}` : 'Trailer'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : watchUrl ? (
            <div className="trailer-modal-no-embed">
              <p>ไม่สามารถเล่นในหน้านี้ได้</p>
              <a href={watchUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                <ExternalLink size={14} /> เปิด Trailer
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
