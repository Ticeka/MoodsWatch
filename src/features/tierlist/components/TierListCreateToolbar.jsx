import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { CREATE_CATEGORY_OPTIONS, ENTITY_TYPE_OPTIONS } from '@/features/tierlist/constants';
import { TierListCreateCoverEditorPanel } from './TierListCreateCoverEditorPanel';
import { TierListCreateSelectedPoolSummary } from './TierListCreateSelectedPoolSummary';
import {
  getDisplayName,
  getEntityTypeLabel,
  getMetaLine,
  getTierCategoryLabel,
} from '@/features/tierlist/lib/tierlistLabels';
import { getTierEntityArtworkSource } from '@/features/tierlist/lib/tierlistPreviewUtils';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
} from '@/shared/lib/catalogEntities';

export function TierListCreateToolbar({
  category,
  coverFileInputRef,
  coverImageUrl,
  coverStageRef,
  customItemsCount,
  draftCoverImageOffsetX,
  draftCoverImageOffsetY,
  draftCoverPreviewStyle,
  draftCoverStageCropRect,
  entityType,
  hasPendingCoverFrameChanges,
  isAudienceSwitching,
  isCharacterMode,
  isCoverEditorOpen,
  isLoading,
  isSaving,
  isSongMode,
  isUploadingCover,
  isUploadingPoolItems,
  minimumRequired,
  onCatalogEntityTypeChange,
  onCategoryChange,
  onCloseCoverEditor,
  onCreate,
  onCoverPreviewPointerDown,
  onCoverPreviewPointerMove,
  onCoverPreviewPointerUp,
  onCoverPreviewResizePointerDown,
  onCoverStageImageLoad,
  onDraftCoverImageOffsetXChange,
  onDraftCoverImageOffsetYChange,
  onRemoveSelectedPoolItem,
  onResetCoverPreviewFrame,
  onSaveCoverPreviewFrame,
  onSwitchAudienceMode,
  onTemplateDescChange,
  onTemplateNameChange,
  onUploadCover,
  onUploadPoolItems,
  openCoverEditor,
  pick,
  savedCoverPreviewStyle,
  selectedItems,
  showAdult,
  templateDesc,
  templateName,
}) {
  return (
    <section className="container tierlist-create-toolbar-shell tierlist-create-rail">
      <div className="tierlist-toolbar glass-heavy tierlist-create-toolbar">
        <div className="tierlist-create-audience-row" role="group" aria-label={pick('โหมดคอนเทนต์', 'Audience mode')}>
          <button
            type="button"
            className={`tierlist-create-audience-pill${!showAdult ? ' is-active' : ''}`}
            onClick={() => onSwitchAudienceMode(false)}
            aria-pressed={!showAdult}
            disabled={isAudienceSwitching}
          >
            {pick('ทั่วไป', 'General')}
          </button>
          <button
            type="button"
            className={`tierlist-create-audience-pill${showAdult ? ' is-active' : ''}`}
            onClick={() => onSwitchAudienceMode(true)}
            aria-pressed={showAdult}
            disabled={isAudienceSwitching}
          >
            18+
          </button>
          <span className="tierlist-create-audience-note">
            {showAdult
              ? pick('ตอนนี้ manhwa 18+ จะถูกดึงตรงตามโหมดผู้ใหญ่', '18+ manhwa is now fetched through the adult catalog mode.')
              : pick('ตอนนี้จะแสดงเฉพาะคอนเทนต์ทั่วไป', 'General-only catalog is active right now.')}
          </span>
        </div>

        <label className="tierlist-field">
          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
          <input
            value={templateName}
            onChange={(event) => onTemplateNameChange(event.target.value)}
            placeholder={pick('เช่น Best Romance 2026', 'e.g. Best Romance 2026')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('คำอธิบาย', 'Description')}</span>
          <input
            value={templateDesc}
            onChange={(event) => onTemplateDescChange(event.target.value)}
            placeholder={pick('อธิบายสั้น ๆ ว่าเทมเพลตนี้เหมาะกับอะไร', 'Add a short description for this template')}
          />
        </label>

        <div className="tierlist-create-external-panel glass-heavy">
          <div className="tierlist-create-external-head">
            <strong>{pick('อัปโหลดรูป', 'Upload Images')}</strong>
            <span>{pick('อัปโหลดไฟล์สำหรับหน้าปกและรูปใน pool ได้เลย โดยไม่ต้องตั้งชื่อเอง', 'Upload files for the cover and pool items without naming them manually')}</span>
          </div>
          <div className="tierlist-create-external-grid">
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปหน้าปก', 'Cover image')}</span>
              <label className={`tierlist-upload-button${isUploadingCover ? ' is-uploading' : ''}`}>
                <input
                  ref={coverFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onUploadCover}
                  disabled={isUploadingCover || isSaving}
                />
                <span>{isUploadingCover ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหน้าปก', 'Choose cover image')}</span>
              </label>
              <small>{coverImageUrl ? pick('อัปโหลดแล้ว พร้อมใช้เป็นหน้าปก', 'Uploaded and ready as the cover') : pick('ใช้รูปเดียวสำหรับหน้าปกเทมเพลต', 'Use a single image as the template cover')}</small>
            </label>
            <label className="tierlist-field tierlist-create-upload-field">
              <span>{pick('รูปสำหรับ pool', 'Pool images')}</span>
              <label className={`tierlist-upload-button${isUploadingPoolItems ? ' is-uploading' : ''}`}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onUploadPoolItems}
                  disabled={isUploadingPoolItems || isSaving}
                />
                <span>{isUploadingPoolItems ? pick('กำลังอัปโหลด...', 'Uploading...') : pick('เลือกรูปหลายไฟล์', 'Choose multiple images')}</span>
              </label>
              <small>{pick('ระบบจะเพิ่มเข้าพูลให้อัตโนมัติ', 'Files will be added to the pool automatically')}</small>
            </label>
          </div>
          <div className="tierlist-create-external-status">
            <span className="tierlist-chip">{coverImageUrl ? pick('มีหน้าปกแล้ว', 'Cover ready') : pick('ยังไม่มีหน้าปก', 'No cover yet')}</span>
            <span className="tierlist-chip">{pick(`${customItemsCount} รูปในพูล`, `${customItemsCount} pool images`)}</span>
          </div>
          <TierListCreateCoverEditorPanel
            coverFileInputRef={coverFileInputRef}
            coverImageUrl={coverImageUrl}
            savedCoverPreviewStyle={savedCoverPreviewStyle}
            isCoverEditorOpen={isCoverEditorOpen}
            hasPendingCoverFrameChanges={hasPendingCoverFrameChanges}
            isSaving={isSaving}
            isUploadingCover={isUploadingCover}
            openCoverEditor={openCoverEditor}
            draftCoverImageOffsetX={draftCoverImageOffsetX}
            draftCoverImageOffsetY={draftCoverImageOffsetY}
            onDraftCoverImageOffsetXChange={onDraftCoverImageOffsetXChange}
            onDraftCoverImageOffsetYChange={onDraftCoverImageOffsetYChange}
            coverStageRef={coverStageRef}
            draftCoverStageCropRect={draftCoverStageCropRect}
            onCoverPreviewPointerDown={onCoverPreviewPointerDown}
            onCoverPreviewPointerMove={onCoverPreviewPointerMove}
            onCoverPreviewPointerUp={onCoverPreviewPointerUp}
            onCoverPreviewResizePointerDown={onCoverPreviewResizePointerDown}
            onCoverStageImageLoad={onCoverStageImageLoad}
            draftCoverPreviewStyle={draftCoverPreviewStyle}
            onResetCoverPreviewFrame={onResetCoverPreviewFrame}
            onCloseCoverEditor={onCloseCoverEditor}
            onSaveCoverPreviewFrame={onSaveCoverPreviewFrame}
            pick={pick}
          />
          <TierListCreateSelectedPoolSummary
            customItemsCount={customItemsCount}
            getArtworkSource={getTierEntityArtworkSource}
            getDisplayName={getDisplayName}
            getMetaLine={getMetaLine}
            onRemoveSelectedPoolItem={onRemoveSelectedPoolItem}
            pick={pick}
            selectedItems={selectedItems}
          />
        </div>

        {!isSongMode ? (
          <label className="tierlist-field">
            <span>{pick('หมวดหมู่', 'Category')}</span>
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              {CREATE_CATEGORY_OPTIONS
                .filter((option) => !isCharacterMode || option.value !== 'anime')
                .map((option) => (
                  <option key={option.value} value={option.value}>{getTierCategoryLabel(option.value, pick)}</option>
                ))}
            </select>
          </label>
        ) : null}

        <label className="tierlist-field">
          <span>{pick('แคตตาล็อก', 'Catalog')}</span>
          <select
            value={entityType}
            onChange={(event) => onCatalogEntityTypeChange(event.target.value)}
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getEntityTypeLabel(option.value, pick)}</option>
            ))}
          </select>
        </label>

        <div className="tierlist-toolbar-actions">
          <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
          <Button
            variant="primary"
            onClick={onCreate}
            disabled={isLoading || isSaving || selectedItems.length < minimumRequired}
          >
            {isSaving
              ? pick('กำลังสร้าง...', 'Creating...')
              : `${pick('สร้างและเล่น', 'Create & Play')}${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`}
          </Button>
        </div>
      </div>
    </section>
  );
}
