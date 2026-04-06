import React from 'react';
import { Pencil, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { TEMPLATE_PREVIEW_MAX_OFFSET } from '@/features/tierlist/lib/tierlistPreviewUtils';

export function TierListCreateCoverEditorPanel({
  coverFileInputRef,
  coverImageUrl,
  savedCoverPreviewStyle,
  isCoverEditorOpen,
  hasPendingCoverFrameChanges,
  isSaving,
  isUploadingCover,
  openCoverEditor,
  draftCoverImageOffsetX,
  draftCoverImageOffsetY,
  onDraftCoverImageOffsetXChange,
  onDraftCoverImageOffsetYChange,
  coverStageRef,
  draftCoverStageCropRect,
  onCoverPreviewPointerDown,
  onCoverPreviewPointerMove,
  onCoverPreviewPointerUp,
  onCoverPreviewResizePointerDown,
  onCoverStageImageLoad,
  draftCoverPreviewStyle,
  onResetCoverPreviewFrame,
  onCloseCoverEditor,
  onSaveCoverPreviewFrame,
  pick,
}) {
  if (!coverImageUrl) {
    return null;
  }

  return (
    <div className="tierlist-create-cover-shell">
      <div className="tierlist-create-cover-summary">
        <div className="tierlist-create-cover-summary-media" style={savedCoverPreviewStyle}>
          <img src={coverImageUrl} alt={pick('หน้าปกที่บันทึกแล้ว', 'Saved cover preview')} loading="lazy" />
        </div>
        <div className="tierlist-create-cover-summary-copy">
          <div className="tierlist-create-cover-stage-head">
            <strong>{pick('หน้าปกที่ใช้จริง', 'Saved cover')}</strong>
            <span>
              {isCoverEditorOpen
                ? pick('กำลังแก้ไขครอปอยู่ กดบันทึกการครอปเพื่ออัปเดตหน้าปกจริง', 'You are editing the crop. Save it to update the actual cover.')
                : pick('รูปนี้จะถูกใช้เป็นหน้าปกเทมเพลตหลังจากกดสร้าง', 'This saved frame will be used as the template cover when you create it.')}
            </span>
          </div>
          <div className="tierlist-create-cover-summary-status">
            <span className={`tierlist-chip${hasPendingCoverFrameChanges ? ' tierlist-chip-warning' : ' tierlist-chip-success'}`}>
              {hasPendingCoverFrameChanges ? pick('มีการแก้ไขที่ยังไม่บันทึก', 'Unsaved crop changes') : pick('บันทึกครอปแล้ว', 'Crop saved')}
            </span>
            <span className="tierlist-chip">{pick('อัตราส่วน 5:3', '5:3 cover')}</span>
          </div>
        </div>
        <div className="tierlist-create-cover-summary-actions">
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={<Pencil size={14} />}
            onClick={openCoverEditor}
            disabled={isSaving || isUploadingCover || isCoverEditorOpen}
          >
            {isCoverEditorOpen ? pick('กำลังแก้ไขครอป', 'Editing crop') : pick('แก้ไขครอป', 'Edit crop')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={14} />}
            onClick={() => coverFileInputRef.current?.click()}
            disabled={isSaving || isUploadingCover}
          >
            {pick('เปลี่ยนรูป', 'Change image')}
          </Button>
        </div>
      </div>
      {isCoverEditorOpen ? (
        <div className="tierlist-create-cover-editor-card">
          <div className="tierlist-create-cover-controls">
            <div className="tierlist-create-cover-control-group">
              <span className="tierlist-create-cover-control-label">{pick('เลื่อนซ้ายขวา', 'Horizontal position')}</span>
              <div className="tierlist-create-cover-slider-row">
                <input
                  className="tierlist-create-cover-slider"
                  type="range"
                  min={-TEMPLATE_PREVIEW_MAX_OFFSET}
                  max={TEMPLATE_PREVIEW_MAX_OFFSET}
                  step="0.5"
                  value={draftCoverImageOffsetX}
                  onChange={(event) => onDraftCoverImageOffsetXChange(event.target.value)}
                  disabled={isSaving}
                  aria-label={pick('เลื่อนรูปแนวนอน', 'Move image horizontally')}
                />
                <strong>{Math.round(draftCoverImageOffsetX)}%</strong>
              </div>
            </div>
            <div className="tierlist-create-cover-control-group">
              <span className="tierlist-create-cover-control-label">{pick('เลื่อนบนล่าง', 'Vertical position')}</span>
              <div className="tierlist-create-cover-slider-row">
                <input
                  className="tierlist-create-cover-slider"
                  type="range"
                  min={-TEMPLATE_PREVIEW_MAX_OFFSET}
                  max={TEMPLATE_PREVIEW_MAX_OFFSET}
                  step="0.5"
                  value={draftCoverImageOffsetY}
                  onChange={(event) => onDraftCoverImageOffsetYChange(event.target.value)}
                  disabled={isSaving}
                  aria-label={pick('เลื่อนรูปแนวตั้ง', 'Move image vertically')}
                />
                <strong>{Math.round(draftCoverImageOffsetY)}%</strong>
              </div>
            </div>
            <small className="tierlist-create-cover-control-hint">
              {pick('ลากทั้งกรอบเพื่อย้ายตำแหน่ง หรือดึงที่มุมกรอบเพื่อย่อขยายขนาดได้เลย จากนั้นค่อยกดบันทึกการครอป', 'Drag the frame to reposition it, or pull its corners to resize it before saving.')}
            </small>
          </div>
          <div className="tierlist-create-cover-editor">
            <div className="tierlist-create-cover-stage-panel">
              <div className="tierlist-create-cover-stage-head">
                <strong>{pick('แก้ไขครอป', 'Crop editor')}</strong>
                <span>{pick('ภาพเต็มอยู่ด้านหลัง ส่วนกรอบคือพื้นที่ที่จะถูกใช้จริง', 'The full image stays in the background, and the frame shows what will actually be used.')}</span>
              </div>
              <div className="tierlist-create-cover-stage" ref={coverStageRef}>
                <img
                  className="tierlist-create-cover-stage-base"
                  src={coverImageUrl}
                  alt={pick('รูปต้นฉบับ', 'Original image')}
                  loading="lazy"
                  draggable={false}
                  onLoad={onCoverStageImageLoad}
                />
                {draftCoverStageCropRect ? (
                  <div
                    className="tierlist-create-cover-stage-crop"
                    style={draftCoverStageCropRect}
                    onPointerDown={onCoverPreviewPointerDown}
                    onPointerMove={onCoverPreviewPointerMove}
                    onPointerUp={onCoverPreviewPointerUp}
                    onPointerCancel={onCoverPreviewPointerUp}
                    aria-label={pick('กรอบครอปรูปหน้าปก', 'Cover crop frame')}
                  >
                    {['nw', 'ne', 'sw', 'se'].map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        className={`tierlist-create-cover-stage-handle is-${corner}`}
                        onPointerDown={(event) => onCoverPreviewResizePointerDown(event, corner)}
                        onPointerMove={onCoverPreviewPointerMove}
                        onPointerUp={onCoverPreviewPointerUp}
                        onPointerCancel={onCoverPreviewPointerUp}
                        aria-label={pick('ลากเพื่อย่อขยายกรอบครอป', 'Drag to resize the crop frame')}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="tierlist-create-cover-preview-panel">
              <div className="tierlist-create-cover-stage-head">
                <strong>{pick('ตัวอย่างหลังบันทึก', 'Saved result preview')}</strong>
                <span>{pick('พอกดบันทึกการครอป หน้าปกจริงจะอัปเดตเป็นมุมนี้', 'Once you save the crop, the actual cover will update to this framing.')}</span>
              </div>
              <div
                className="tierlist-create-cover-preview"
                style={draftCoverPreviewStyle}
              >
                <img src={coverImageUrl} alt={pick('ตัวอย่างหน้าปก', 'Cover preview')} loading="lazy" />
              </div>
            </div>
          </div>
          <div className="tierlist-create-cover-actions tierlist-create-cover-actions-editor">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => coverFileInputRef.current?.click()}
              disabled={isSaving || isUploadingCover}
            >
              {pick('เปลี่ยนรูป', 'Change image')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onResetCoverPreviewFrame} disabled={isSaving}>
              {pick('รีเซ็ตเฟรม', 'Reset framing')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCloseCoverEditor} disabled={isSaving}>
              {pick('ยกเลิก', 'Cancel')}
            </Button>
            <Button type="button" size="sm" variant="primary" icon={<Save size={14} />} onClick={onSaveCoverPreviewFrame} disabled={isSaving}>
              {hasPendingCoverFrameChanges ? pick('บันทึกการครอป', 'Save crop') : pick('ใช้เฟรมนี้', 'Use this frame')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
