import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Loader2, Plus, Search, XCircle } from 'lucide-react';
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
} from '@/shared/lib/catalogEntities';

export function TierListCreateToolbar({
  category,
  coverFileInputRef,
  coverImageUrl,
  coverStageRef,
  customItemsCount,
  customVideoDraft,
  customVideoError,
  customVideoPreview,
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
  isYoutubeMode,
  isSubmittingCustomVideo,
  isUploadingCover,
  isUploadingPoolItems,
  minimumRequired,
  onCustomVideoDraftChange,
  onCatalogEntityTypeChange,
  onCategoryChange,
  onCloseCoverEditor,
  onCreateCustomVideo,
  onCreate,
  onCoverPreviewPointerDown,
  onCoverPreviewPointerMove,
  onCoverPreviewPointerUp,
  onCoverPreviewResizePointerDown,
  onCoverStageImageLoad,
  onDraftCoverImageOffsetXChange,
  onDraftCoverImageOffsetYChange,
  onImportYoutubePreviewItems,
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
  youtubeAvailabilityReasonLabel,
  youtubePlaybackLabel,
  savedCoverPreviewStyle,
  selectedItems,
  showAdult,
  templateDesc,
  templateName,
}) {
  const renderYoutubeStatusBadge = (status) => {
    const normalized = ['ready', 'limited', 'blocked'].includes(String(status || '').toLowerCase())
      ? String(status).toLowerCase()
      : 'unknown';
    const Icon = normalized === 'ready' ? CheckCircle : normalized === 'blocked' ? XCircle : AlertTriangle;
    return (
      <span className={`tierlist-youtube-status tierlist-youtube-status-${normalized}`}>
        <Icon size={12} />
        {youtubePlaybackLabel(normalized, pick)}
      </span>
    );
  };

  const renderYoutubePreview = () => {
    if (!customVideoPreview) {
      return null;
    }

    if (customVideoPreview.type === 'video') {
      const video = customVideoPreview.video;
      const status = video?.playback_status || 'unknown';
      const canImportVideo = status === 'ready' || status === 'limited';
      const reason = youtubeAvailabilityReasonLabel(video?.metadata_json?.availabilityReason || status, pick);
      return (
        <div className="tierlist-youtube-preview-card">
          {video?.cover_url ? <img src={video.cover_url} alt="" className="tierlist-youtube-preview-thumb" /> : null}
          <div className="tierlist-youtube-preview-copy">
            <strong>{video?.song_title || pick('ไม่ทราบชื่อ', 'Unknown title')}</strong>
            <span>{video?.artist_name || 'YouTube'}</span>
            <div className="tierlist-youtube-status-row">{renderYoutubeStatusBadge(status)}</div>
            {status !== 'ready' ? <small>{reason}</small> : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onImportYoutubePreviewItems([video])}
            disabled={!canImportVideo}
          >
            <Plus size={14} /> {pick('เพิ่ม', 'Add')}
          </Button>
        </div>
      );
    }

    const playlist = customVideoPreview.playlist || {};
    const items = Array.isArray(customVideoPreview.items) ? customVideoPreview.items : [];
    const ready = items.filter((item) => item.playback_status === 'ready').length;
    const limited = items.filter((item) => item.playback_status === 'limited').length;
    const blocked = items.filter((item) => item.playback_status === 'blocked').length;
    const unknown = items.filter((item) => !['ready', 'limited', 'blocked'].includes(String(item.playback_status || ''))).length;
    const playable = ready + limited;

    return (
      <div className="tierlist-youtube-playlist-preview">
        <div className="tierlist-youtube-playlist-head">
          {playlist.thumbnailUrl ? <img src={playlist.thumbnailUrl} alt="" className="tierlist-youtube-playlist-cover" /> : null}
          <div className="tierlist-youtube-preview-copy">
            <strong>{playlist.title || pick('YouTube Playlist', 'YouTube Playlist')}</strong>
            <span>{playlist.channelTitle || 'YouTube'}</span>
            <div className="tierlist-youtube-status-row">
              <span className="tierlist-youtube-stat is-ready"><CheckCircle size={12} /> Ready {ready}</span>
              {limited > 0 ? <span className="tierlist-youtube-stat is-limited"><AlertTriangle size={12} /> Limited {limited}</span> : null}
              {blocked > 0 ? <span className="tierlist-youtube-stat is-blocked"><XCircle size={12} /> Blocked {blocked}</span> : null}
              {unknown > 0 ? <span className="tierlist-youtube-stat is-blocked"><XCircle size={12} /> Unknown {unknown}</span> : null}
            </div>
          </div>
        </div>

        <div className={`tierlist-youtube-alert${blocked > 0 || unknown > 0 || limited > 0 ? ' is-warning' : ' is-ok'}`}>
          {blocked > 0 || unknown > 0 || limited > 0 ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
          <span>
            {pick(
              `ตรวจแล้ว ${items.length} วิดีโอ: นำเข้าได้ ${playable}, บล็อก/ไม่ทราบ ${blocked + unknown}`,
              `Checked ${items.length} videos: importable ${playable}, blocked/unknown ${blocked + unknown}`
            )}
          </span>
        </div>

        <div className="tierlist-youtube-playlist-items">
          {items.slice(0, 8).map((item, index) => {
            const status = item.playback_status || 'unknown';
            return (
              <div key={item.provider_media_id || index} className={`tierlist-youtube-playlist-row is-${status}`}>
                {item.cover_url ? <img src={item.cover_url} alt="" /> : null}
                <span>{item.song_title || `YouTube ${index + 1}`}</span>
                {renderYoutubeStatusBadge(status)}
              </div>
            );
          })}
          {items.length > 8 ? (
            <p className="tierlist-youtube-preview-more">+{items.length - 8} {pick('เพิ่มเติม', 'more')}</p>
          ) : null}
        </div>

        <div className="tierlist-youtube-import-actions">
          <Button
            type="button"
            variant="primary"
            onClick={() => onImportYoutubePreviewItems(items)}
            disabled={playable === 0}
          >
            <Plus size={14} />
            {pick(`นำเข้าที่ใช้ได้ ${playable}`, `Import importable ${playable}`)}
          </Button>
        </div>
      </div>
    );
  };

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
            <span className="tierlist-chip">{pick(`${customItemsCount} รายการข้างนอก`, `${customItemsCount} external items`)}</span>
          </div>
          {isYoutubeMode ? (
            <div className="tierlist-create-video-link-panel">
              <div className="tierlist-create-external-head">
                <strong>{pick('เพิ่มลิงก์ YouTube / เพลย์ลิสต์', 'Add YouTube Link / Playlist')}</strong>
                <span>{pick('วางลิงก์วิดีโอหรือเพลย์ลิสต์ YouTube ระบบจะนำเข้าทุกวิดีโอที่ดึงได้และเช็กสถานะพร้อมเล่น จำกัด หรือบล็อก', 'Paste a YouTube video or playlist link. The app imports every fetched video and checks ready, limited, or blocked status.')}</span>
              </div>
              <div className="tierlist-create-video-link-grid">
                <label className="tierlist-field">
                  <span>{pick('ลิงก์ YouTube', 'YouTube URL')}</span>
                  <input
                    value={customVideoDraft.url}
                    onChange={(event) => onCustomVideoDraftChange('url', event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isSubmittingCustomVideo || isSaving}
                  />
                  <small>{pick('รองรับ watch, youtu.be, shorts, live และ playlist/list', 'Supports watch, youtu.be, shorts, live, and playlist/list URLs')}</small>
                </label>
              </div>
              <div className="tierlist-toolbar-actions">
                <Button
                  variant="secondary"
                  onClick={onCreateCustomVideo}
                  disabled={isSubmittingCustomVideo || isSaving || !String(customVideoDraft.url || '').trim()}
                >
                  {isSubmittingCustomVideo ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> {pick('กำลังตรวจ...', 'Checking...')}
                    </>
                  ) : (
                    <>
                      <Search size={14} /> {pick('ดูตัวอย่าง', 'Preview')}
                    </>
                  )}
                </Button>
              </div>
              {customVideoError ? (
                <div className="tierlist-youtube-alert is-warning">
                  <AlertTriangle size={15} />
                  <span>{customVideoError}</span>
                </div>
              ) : null}
              {renderYoutubePreview()}
            </div>
          ) : null}
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
