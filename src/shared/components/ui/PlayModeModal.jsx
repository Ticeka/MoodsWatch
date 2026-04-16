import React, { useEffect } from 'react';
import { User, Users, X } from 'lucide-react';
import './PlayModeModal.css';

/**
 * PlayModeModal — modal ให้เลือก Solo หรือ Multiplayer ก่อนเล่น
 *
 * Props:
 *   isOpen       boolean
 *   onClose      () => void
 *   onSolo       () => void
 *   onMulti      () => void
 *   title        string  — ชื่อ template/deck
 *   cover        string  — URL รูปปก (optional)
 *   multiLabel   string  — ข้อความปุ่ม multi (optional)
 *   multiDisabled boolean — ถ้า multi ยังไม่พร้อม
 *   multiHint    string  — hint ใต้ปุ่ม multi (optional)
 */
export function PlayModeModal({
  isOpen,
  onClose,
  onSolo,
  onMulti,
  title = '',
  cover = '',
  multiLabel = 'Play with Friends',
  multiDisabled = false,
  multiHint = '',
}) {
  /* close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="pmm-backdrop" onClick={onClose}>
      <div className="pmm-sheet" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pmm-header">
          {cover && (
            <div className="pmm-cover">
              <img src={cover} alt={title} loading="lazy" />
            </div>
          )}
          <div className="pmm-meta">
            <p className="pmm-eyebrow">Choose mode</p>
            <h2 className="pmm-title">{title}</h2>
          </div>
          <button className="pmm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Mode cards */}
        <div className="pmm-modes">

          <button className="pmm-mode pmm-mode--solo" onClick={onSolo}>
            <div className="pmm-mode-icon">
              <User size={28} strokeWidth={1.5} />
            </div>
            <div className="pmm-mode-body">
              <strong>Solo</strong>
              <span>Play on your own at your own pace</span>
            </div>
            <div className="pmm-mode-arrow">›</div>
          </button>

          <button
            className={`pmm-mode pmm-mode--multi${multiDisabled ? ' pmm-mode--disabled' : ''}`}
            onClick={multiDisabled ? undefined : onMulti}
            disabled={multiDisabled}
          >
            <div className="pmm-mode-icon">
              <Users size={28} strokeWidth={1.5} />
            </div>
            <div className="pmm-mode-body">
              <strong>{multiLabel}</strong>
              <span>{multiHint || 'Invite friends and play together'}</span>
            </div>
            {multiDisabled
              ? <span className="pmm-soon">Soon</span>
              : <div className="pmm-mode-arrow">›</div>
            }
          </button>

        </div>
      </div>
    </div>
  );
}

export default PlayModeModal;
