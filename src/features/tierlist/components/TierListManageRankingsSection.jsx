import React from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Eye, EyeOff, Layers, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { findTierTemplate } from '@/features/tierlist/lib/tierlistStore';
import { formatTierDate } from '@/features/tierlist/lib/tierlistPageUtils';
import { TierListEmptyPanel } from './TierListPanels';

export function TierListManageRankingsSection({
  draftDescription,
  draftTitle,
  editingKey,
  isSavingId,
  library,
  listPage,
  locale,
  managePageSize,
  myListStats,
  myLists,
  onBeginEditing,
  onDeleteList,
  onDraftDescriptionChange,
  onDraftTitleChange,
  onNextPage,
  onPreviousPage,
  onSaveListMeta,
  onStopEditing,
  onToggleListVisibility,
  pick,
  totalListPages,
}) {
  return (
    <section className="container tierlist-section">
      <div className="tierlist-section-head">
        <h2>{pick('ลิสต์ของฉัน', 'My Rankings')}</h2>
        <span className="tierlist-count">{myListStats.totalCount} {pick('รายการ', 'items')}</span>
      </div>

      {myListStats.totalCount === 0 ? (
        <TierListEmptyPanel
          icon={<Layers size={24} />}
          title={pick('ยังไม่มีลิสต์ของคุณ', 'No rankings yet')}
          message={pick('เล่นจากเทมเพลตสักอันก่อน แล้วลิสต์ของคุณจะกลับมาจัดการต่อได้จากหน้านี้', 'Play a template first and your rankings will be collected here for quick editing later.')}
          action={(
            <Link className="btn btn-primary btn-sm" to="/tierlist">
              {pick('ไปเลือกเทมเพลต', 'Browse Templates')}
            </Link>
          )}
        />
      ) : (
        <div className="tierlist-manage-grid">
          {myLists.map((list) => {
            const savingKey = `list:${list.id}`;
            const sourceTemplate = list.templateId ? findTierTemplate(list.templateId, library) : null;
            const isEditing = editingKey === `list:${list.id}`;
            const previewRows = list.rows.slice(0, 5);
            const maxItems = Math.max(1, ...previewRows.map((row) => row.titleIds.length));

            return (
              <article key={list.id} className="glass-heavy tierlist-manage-card">
                <div className="tierlist-manage-tier-preview">
                  {previewRows.length > 0 ? previewRows.map((row) => {
                    const barPct = Math.max(4, (row.titleIds.length / maxItems) * 100);
                    return (
                      <div key={row.id} className="tierlist-manage-tier-row" style={row.color ? { '--row-c': row.color } : undefined}>
                        <span className="tierlist-manage-tier-tag">{row.label}</span>
                        <div className="tierlist-manage-tier-bar-wrap">
                          <div className="tierlist-manage-tier-bar" style={{ width: row.titleIds.length > 0 ? `${barPct}%` : '0%' }} />
                        </div>
                        <span className="tierlist-manage-tier-n">{row.titleIds.length}</span>
                      </div>
                    );
                  }) : (
                    <div className="tierlist-manage-tier-empty">
                      <Layers size={18} />
                      <span>{pick('ยังไม่มี tier', 'No tiers yet')}</span>
                    </div>
                  )}
                </div>
                <div className="tierlist-manage-card-body">
                  <div className="tierlist-manage-card-head">
                    <small className="tierlist-chip">
                      {sourceTemplate ? pick('จากเทมเพลต', 'From template') : pick('ลิสต์เดี่ยว', 'Standalone')}
                    </small>
                    <span className={`tierlist-manage-visibility${list.isPublic ? ' is-public' : ''}`}>
                      {list.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                      {list.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                    </span>
                  </div>
                  <h3 className="tierlist-manage-card-title">{list.title}</h3>
                  {!isEditing ? (
                    <div className="tierlist-manage-meta">
                      <span>{list.rows.length} {pick('tier', 'tiers')}</span>
                      {Number(list.playCount || 0) > 0 ? <span>{Number(list.playCount)} {pick('ครั้งเล่น', 'plays')}</span> : null}
                      <span>{formatTierDate(list.updatedAt, locale)}</span>
                    </div>
                  ) : null}
                  {isEditing ? (
                    <div className="tierlist-manage-edit-form">
                      <label className="tierlist-field">
                        <span>{pick('ชื่อลิสต์', 'Ranking name')}</span>
                        <input value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} />
                      </label>
                      <label className="tierlist-field">
                        <span>{pick('คำอธิบาย', 'Description')}</span>
                        <input value={draftDescription} onChange={(event) => onDraftDescriptionChange(event.target.value)} />
                      </label>
                    </div>
                  ) : null}
                  <div className="tierlist-manage-actions">
                    <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/play/${list.id}`}>
                      {pick('เปิดแก้ไข', 'Open')}
                    </Link>
                    {isEditing ? (
                      <div className="tierlist-manage-action-icons">
                        <Button
                          size="sm"
                          variant="primary"
                          className="tierlist-manage-action-primary"
                          onClick={() => onSaveListMeta(list)}
                          disabled={isSavingId === `list:${list.id}:edit`}
                        >
                          {isSavingId === `list:${list.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
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
                          title={pick('แก้ไขชื่อ', 'Edit name')}
                          onClick={() => onBeginEditing('list', list)}
                        >
                          <Pencil size={14} />
                        </Button>
                        {sourceTemplate ? (
                          <Link
                            className="btn btn-ghost btn-sm"
                            to={`/tierlist/template/${sourceTemplate.id}`}
                            title={pick('ดูเทมเพลตต้นทาง', 'View source template')}
                          >
                            <ArrowRight size={14} />
                          </Link>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          title={list.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                          onClick={() => onToggleListVisibility(list)}
                          disabled={isSavingId === savingKey}
                        >
                          {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (list.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="tierlist-manage-icon-danger"
                          title={pick('ลบลิสต์', 'Delete ranking')}
                          onClick={() => onDeleteList(list)}
                          disabled={isSavingId === `list:${list.id}:delete`}
                        >
                          {isSavingId === `list:${list.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
      {myListStats.totalCount > managePageSize ? (
        <div className="tierlist-pagination">
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronLeft size={14} />}
            disabled={listPage <= 1}
            onClick={onPreviousPage}
          >
            {pick('ก่อนหน้า', 'Previous')}
          </Button>
          <span>{listPage} / {totalListPages}</span>
          <Button
            size="sm"
            variant="ghost"
            iconRight={<ChevronRight size={14} />}
            disabled={listPage >= totalListPages}
            onClick={onNextPage}
          >
            {pick('ถัดไป', 'Next')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
