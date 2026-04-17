import React from 'react';
import { Bookmark, PencilLine, Pin, PinOff, X as XIcon } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { SEARCH_SCOPE_TABS, describeSearchPreset } from '../../constants/discoverConfig';

export function DiscoverSavedSearches({
  open,
  savedSearches,
  error,
  editingId,
  labelDraft,
  onLabelDraftChange,
  inputRef,
  chipRefs,
  savedOffset,
  onApplyPreset,
  onChipKeyDown,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onTogglePin,
  onDelete,
  onClearAll,
}) {
  const { t } = useLanguage();

  if (!open || savedSearches.length === 0) {
    return error ? <p className="dv2-helper-note" role="status">{error}</p> : null;
  }

  return (
    <div id="discover-search-workbench" className="dv2-workbench">
      <div className="dv2-workbench-head">
        <span className="dv2-workbench-label">
          <Bookmark size={13} aria-hidden="true" />
          {t('discover.savedSearchesLabel')}
        </span>
        <button type="button" className="dv2-workbench-clear" onClick={onClearAll}>
          {t('discover.clearSavedSearches')}
        </button>
      </div>

      <div className="dv2-saved-grid">
        {savedSearches.map((preset, index) => {
          const isEditing = editingId === preset.id;
          return (
            <article
              key={preset.id}
              className={`dv2-saved-card ${preset.pinned ? 'is-pinned' : ''}`}
            >
              {isEditing ? (
                <form
                  className="dv2-saved-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmitRename(preset);
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={labelDraft}
                    onChange={(event) => onLabelDraftChange(event.target.value)}
                    className="dv2-saved-input"
                    aria-label={t('discover.renameSavedSearch')}
                  />
                  <div className="dv2-saved-edit-actions">
                    <button type="submit" className="dv2-mini-btn">{t('common.save')}</button>
                    <button type="button" className="dv2-mini-btn is-ghost" onClick={onCancelRename}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    ref={(node) => { chipRefs.current[savedOffset + index] = node; }}
                    type="button"
                    className="dv2-saved-open"
                    onClick={() => onApplyPreset(preset, 'saved')}
                    onKeyDown={(event) => onChipKeyDown(event, savedOffset + index)}
                  >
                    <strong>{describeSearchPreset(preset, t)}</strong>
                    <span>{[
                      preset.query || null,
                      preset.tag ? `#${preset.tag}` : null,
                      preset.scope !== 'all'
                        ? t(SEARCH_SCOPE_TABS.find((item) => item.id === preset.scope)?.labelKey || 'discover.scopeAll')
                        : null,
                    ].filter(Boolean).join(' / ')}</span>
                  </button>
                  <div className="dv2-saved-actions">
                    <button
                      type="button"
                      className="dv2-saved-icon-btn"
                      onClick={() => onStartRename(preset)}
                      aria-label={t('discover.renameSavedSearch')}
                      title={t('discover.renameSavedSearch')}
                    >
                      <PencilLine size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="dv2-saved-icon-btn"
                      onClick={() => void onTogglePin(preset)}
                      aria-label={preset.pinned ? t('discover.unpinSavedSearch') : t('discover.pinSavedSearch')}
                      title={preset.pinned ? t('discover.unpinSavedSearch') : t('discover.pinSavedSearch')}
                    >
                      {preset.pinned ? <PinOff size={12} aria-hidden="true" /> : <Pin size={12} aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      className="dv2-saved-icon-btn is-danger"
                      onClick={() => void onDelete(preset)}
                      aria-label={t('discover.removeSavedSearch')}
                      title={t('discover.removeSavedSearch')}
                    >
                      <XIcon size={11} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      {error ? <p className="dv2-helper-note" role="status">{error}</p> : null}
    </div>
  );
}
