import React from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';
import { TierListArtworkImage as ArtworkImage, TierListEmptyPanel } from '@/features/tierlist/components';
import { CREATE_SORT_OPTIONS, CREATE_STATUS_OPTIONS } from '@/features/tierlist/constants';
import {
  getCatalogTypeChipLabel,
  getCreateSortLabel,
  getDisplayName,
  getMediaTypeLabel,
  getMetaLine,
  getStatusLabel,
} from '@/features/tierlist/lib/tierlistLabels';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';

export function TierListCreateCatalogPickerSection({
  catalogPage,
  catalogTotal,
  catalogTotalPages,
  filtered,
  groupedFiltered,
  hasActiveFilters,
  isCharacterMode,
  isLoading,
  onClearSelection,
  onClearTitleQuery,
  onNextPage,
  onPreviousPage,
  onResetFilters,
  onSelectAllFiltered,
  onSortByChange,
  onStatusFilterChange,
  onTitleQueryChange,
  onToggleTitle,
  onTypeFilterChange,
  pick,
  selectedIds,
  sortBy,
  statusFilter,
  titleQuery,
  typeFilter,
}) {
  return (
    <section className="container tierlist-section tierlist-create-rail">
      <div className="tierlist-section-head">
        <h2>
          {isCharacterMode
            ? pick('เลือก Character โดยแยกจาก Source Title ชัดเจน', 'Pick characters with source titles clearly separated')
            : pick('เลือกเรื่อง', 'Select Titles')}
          {selectedIds.size > 0 ? (
            <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('รายการที่เลือก', 'selected')}</span>
          ) : null}
        </h2>
        <div className="tierlist-picker-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onSelectAllFiltered}
            disabled={filtered.length === 0}
          >
            {pick('เลือกทั้งหมด', 'Select All')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClearSelection}
            disabled={selectedIds.size === 0}
          >
            {pick('ล้าง', 'Clear')}
          </button>
        </div>
      </div>

      <div className="tierlist-picker-filterbar">
        <div className="tierlist-picker-filterbar-top">
          <div className="tierlist-picker-type-pills" role="toolbar" aria-label={pick('กรองตามประเภท', 'Filter by type')}>
            {['all', 'anime', 'manga', 'manhwa'].map((type) => (
              <button
                key={type}
                type="button"
                className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                onClick={() => onTypeFilterChange(type)}
                aria-pressed={typeFilter === type}
              >
                {getMediaTypeLabel(type, pick)}
              </button>
            ))}
          </div>
          <SortSelect
            value={sortBy}
            onChange={onSortByChange}
            label={pick('เรียง', 'Sort')}
            className="results-sorter"
          >
            {CREATE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
            ))}
          </SortSelect>
          <SortSelect
            value={statusFilter}
            onChange={onStatusFilterChange}
            label={pick('สถานะ', 'Status')}
            className="results-sorter"
          >
            {CREATE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{getStatusLabel(status, pick)}</option>
            ))}
          </SortSelect>
          <div className="tierlist-picker-search-wrap">
            <input
              className="tierlist-picker-search"
              value={titleQuery}
              onChange={(event) => onTitleQueryChange(event.target.value)}
              placeholder={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง...', 'Search character or source title...') : pick('ค้นหาเรื่อง...', 'Search titles...')}
              aria-label={isCharacterMode ? pick('ค้นหาชื่อตัวละครหรือชื่อเรื่องต้นทาง', 'Search character or source title') : pick('ค้นหาเรื่อง', 'Search titles')}
            />
            {titleQuery ? (
              <button
                type="button"
                className="tierlist-picker-search-clear"
                onClick={onClearTitleQuery}
                aria-label={pick('ล้างคำค้นหา', 'Clear search')}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="tierlist-picker-result-count">
            {isCharacterMode ? filtered.length : catalogTotal} {pick('รายการ', 'items')}
          </span>
        </div>
      </div>

      {isLoading ? (
        <TierListEmptyPanel
          icon={<Loader2 size={28} className="animate-spin" />}
          title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
          message={pick('กำลังเตรียมรายการเรื่องให้เลือกสำหรับสร้างเทมเพลต', 'Preparing titles you can use in this template.')}
        />
      ) : filtered.length === 0 ? (
        <TierListEmptyPanel
          icon={<Search size={28} />}
          title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
          message={
            hasActiveFilters
              ? pick('ลองล้างคำค้นหา ปิดตัวกรองบางตัว หรือเลือกทุกประเภท', 'Try clearing search, relaxing filters, or switching back to all types.')
              : pick('ยังไม่มีข้อมูลเรื่องให้เลือกในตอนนี้', 'There are no titles available to pick right now.')
          }
          action={hasActiveFilters ? (
            <Button
              type="button"
              variant="outline"
              onClick={onResetFilters}
            >
              {pick('ล้างตัวกรอง', 'Clear filters')}
            </Button>
          ) : null}
        />
      ) : (
        <>
          <div className="tierlist-adult-split-wrap">
            {[{ key: 'safe', label: pick('ไม่ 18+', 'Non 18+') }, { key: 'adult', label: '18+' }].map((group) => (
              <section key={group.key} className="tierlist-adult-split-block">
                <h3>{group.label} <span>{groupedFiltered[group.key].length}</span></h3>
                <div className="tierlist-picker-grid">
                  {groupedFiltered[group.key].map((title) => {
                    const selected = selectedIds.has(Number(title.id));
                    return (
                      <button
                        key={title.id}
                        type="button"
                        className={`tierlist-picker-card${selected ? ' is-selected' : ''}`}
                        onClick={() => onToggleTitle(Number(title.id), title)}
                        title={getDisplayName(title)}
                        aria-pressed={selected}
                      >
                        <div className="tierlist-picker-thumb">
                          <ArtworkImage entity={title} alt="" loading="lazy" />
                          {selected ? <div className="tierlist-picker-check">{pick('เลือกแล้ว', 'Selected')}</div> : null}
                        </div>
                        <div className="tierlist-picker-card-body">
                          <div className="tierlist-picker-card-tags">
                            <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                            {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                            {isCharacterMode && title.role ? <span className="tierlist-chip">{title.role}</span> : null}
                          </div>
                          <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                          <span className="tierlist-picker-card-subtitle">
                            {isCharacterMode
                              ? `${title.sourceTitleName || pick('ไม่ทราบเรื่องต้นทาง', 'Unknown source title')}${title.voice_actor_name ? ` • ${title.voice_actor_name}` : ''}`
                              : getMetaLine(title)}
                          </span>
                          <small className="tierlist-picker-card-footnote">
                            {isCharacterMode
                              ? pick('บรรทัดบนคือชื่อตัวละคร บรรทัดล่างคือชื่อเรื่องต้นทาง', 'Top line is the character name, bottom line is the source title')
                              : getStatusLabel(title.status, pick)}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {catalogTotalPages > 1 ? (
            <div className="tierlist-picker-pagination">
              <Button
                size="sm"
                variant="ghost"
                disabled={catalogPage <= 1}
                onClick={onPreviousPage}
              >
                <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
              </Button>
              <span className="tierlist-picker-page-info">
                {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={catalogPage >= catalogTotalPages}
                onClick={onNextPage}
              >
                {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
