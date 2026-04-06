import React from 'react';
import { Eye, EyeOff, Loader2, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { getEntityTypeLabel, getTierCategoryLabel } from '@/features/tierlist/lib/tierlistLabels';
import { formatTierDate } from '@/features/tierlist/lib/tierlistPageUtils';
import {
  getTemplatePreviewArtworkSource,
  getTemplatePreviewMediaStyle,
  normalizeTemplatePreviewFit,
} from '@/features/tierlist/lib/tierlistPreviewUtils';
import { TierListEmptyPanel } from './TierListPanels';

export function TierListManageTemplatesSection({
  draftDescription,
  draftTitle,
  editingKey,
  isSavingId,
  linkedCountByTemplateId,
  locale,
  myTemplates,
  onBeginEditing,
  onDeleteTemplate,
  onDraftDescriptionChange,
  onDraftTitleChange,
  onSaveTemplateMeta,
  onStopEditing,
  onToggleTemplateVisibility,
  pick,
  templatePreviewEntityMap,
}) {
  return (
    <section className="container tierlist-section">
      <div className="tierlist-section-head">
        <h2>{pick('เทมเพลตของฉัน', 'My Templates')}</h2>
        <span className="tierlist-count">{myTemplates.length} {pick('รายการ', 'items')}</span>
      </div>

      {myTemplates.length === 0 ? (
        <TierListEmptyPanel
          icon={<Sparkles size={24} />}
          title={pick('ยังไม่มีเทมเพลตของคุณ', 'No templates yet')}
          message={pick('เริ่มจากสร้างเทมเพลตแรก แล้วมันจะมารวมที่หน้านี้อัตโนมัติ', 'Create your first template and it will show up here automatically.')}
          action={(
            <Link className="btn btn-primary btn-sm" to="/tierlist/create">
              {pick('เริ่มสร้าง', 'Start Creating')}
            </Link>
          )}
        />
      ) : (
        <div className="tierlist-manage-grid">
          {myTemplates.map((template) => {
            const savingKey = `template:${template.id}`;
            const linkedCount = Number(linkedCountByTemplateId[String(template.id)] || 0);
            const isEditing = editingKey === `template:${template.id}`;
            const templateCoverFallback = (template.titleIds || [])
              .map((id) => templatePreviewEntityMap.get(Number(id)))
              .find(Boolean) || null;
            const templateCoverArtwork = getTemplatePreviewArtworkSource(template, templateCoverFallback);

            return (
              <article key={template.id} className="glass-heavy tierlist-manage-card">
                <div
                  className={`tierlist-manage-card-cover${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                  style={getTemplatePreviewMediaStyle(template)}
                >
                  {templateCoverArtwork ? (
                    <img
                      src={templateCoverArtwork}
                      alt=""
                      className="tierlist-manage-card-cover-image"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <div className="tierlist-manage-cover-fallback">
                      <Sparkles size={30} />
                    </div>
                  )}
                  <div className="tierlist-manage-cover-badges">
                    <small className="tierlist-chip">{getTierCategoryLabel(template.category, pick)}</small>
                    <span className={`tierlist-manage-visibility${template.isPublic ? ' is-public' : ''}`}>
                      {template.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                      {template.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                    </span>
                  </div>
                </div>
                <div className="tierlist-manage-card-body">
                  <h3 className="tierlist-manage-card-title">{template.title}</h3>
                  {!isEditing ? (
                    <p className="tierlist-manage-description">
                      {template.description || pick('ยังไม่ได้ใส่คำอธิบาย', 'No description yet.')}
                    </p>
                  ) : null}
                  {!isEditing ? (
                    <div className="tierlist-manage-meta">
                      <span>{getEntityTypeLabel(template.entityType, pick)}</span>
                      <span>{template.titleIds.length} {pick('รายการ', 'items')}</span>
                      {Number(template.plays || 0) > 0 ? <span>{Number(template.plays)} {pick('ครั้งเล่น', 'plays')}</span> : null}
                      {linkedCount > 0 ? <span>{linkedCount} {pick('ลิสต์ที่ผูก', 'linked')}</span> : null}
                      <span>{formatTierDate(template.updatedAt, locale)}</span>
                    </div>
                  ) : null}
                  {isEditing ? (
                    <div className="tierlist-manage-edit-form">
                      <label className="tierlist-field">
                        <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
                        <input value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} />
                      </label>
                      <label className="tierlist-field">
                        <span>{pick('คำอธิบาย', 'Description')}</span>
                        <input value={draftDescription} onChange={(event) => onDraftDescriptionChange(event.target.value)} />
                      </label>
                    </div>
                  ) : null}
                  <div className="tierlist-manage-actions">
                    <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/template/${template.id}`}>
                      {pick('เปิดเทมเพลต', 'Open')}
                    </Link>
                    {isEditing ? (
                      <div className="tierlist-manage-action-icons">
                        <Button
                          size="sm"
                          variant="primary"
                          className="tierlist-manage-action-primary"
                          onClick={() => onSaveTemplateMeta(template)}
                          disabled={isSavingId === `template:${template.id}:edit`}
                        >
                          {isSavingId === `template:${template.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={onStopEditing}>
                          {pick('ยกเลิก', 'Cancel')}
                        </Button>
                      </div>
                    ) : (
                      <div className="tierlist-manage-action-icons">
                        <Button
                          size="sm"
                          variant="ghost"
                          title={pick('แก้ไขชื่อและคำอธิบาย', 'Edit name & description')}
                          onClick={() => onBeginEditing('template', template)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title={template.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                          onClick={() => onToggleTemplateVisibility(template)}
                          disabled={isSavingId === savingKey}
                        >
                          {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (template.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="tierlist-manage-icon-danger"
                          title={linkedCount > 0 ? pick('ลบแล้วลิสต์ที่ผูกจะเปลี่ยนเป็นลิสต์เดี่ยว', 'Deleting converts linked rankings to standalone') : pick('ลบเทมเพลต', 'Delete template')}
                          onClick={() => onDeleteTemplate(template)}
                          disabled={isSavingId === `template:${template.id}:delete`}
                        >
                          {isSavingId === `template:${template.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
