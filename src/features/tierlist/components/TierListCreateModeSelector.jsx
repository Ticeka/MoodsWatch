import React from 'react';
import { ENTITY_TYPE_OPTIONS } from '@/features/tierlist/constants';
import { getEntityTypeLabel } from '@/features/tierlist/lib/tierlistLabels';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, YOUTUBE_ENTITY_TYPE } from '@/shared/lib/catalogEntities';

export function TierListCreateModeSelector({
  entityType,
  onSelectEntityType,
  pick,
}) {
  return (
    <section className="container tierlist-create-mode-row tierlist-create-rail">
      {ENTITY_TYPE_OPTIONS.map((option) => {
        const active = option.value === entityType;
        return (
          <button
            key={option.value}
            type="button"
            className={`glass-heavy tierlist-create-mode-card${active ? ' is-active' : ''}`}
            onClick={() => onSelectEntityType(option.value)}
            aria-pressed={active}
          >
            <strong>{getEntityTypeLabel(option.value, pick)}</strong>
            <span>
              {option.value === TITLE_ENTITY_TYPE
                ? pick('คัดชื่อเรื่องตรง ๆ พร้อมตัวกรองเพิ่ม', 'Curate titles directly with richer filtering')
                : option.value === CHARACTER_ENTITY_TYPE
                  ? pick('แยกค้นหาชื่อเรื่องต้นทางกับชื่อตัวละครออกจากกัน', 'Keep source-title search and character-name search separate')
                  : option.value === THEME_SONG_ENTITY_TYPE
                    ? pick('เลือกเรื่องก่อน แล้วค่อยเจาะ OP/ED ด้านใน', 'Pick a title first, then drill into its OP/ED tracks')
                    : option.value === YOUTUBE_ENTITY_TYPE
                      ? pick('วางลิงก์ YouTube แล้วสร้างพูลจากวิดีโอได้ทันที', 'Paste YouTube links and build a pool directly from videos')
                    : ''}
            </span>
          </button>
        );
      })}
    </section>
  );
}
