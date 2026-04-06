import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

export function TierListCreateSelectedPoolSummary({
  customItemsCount,
  getArtworkSource,
  getDisplayName,
  getMetaLine,
  onRemoveSelectedPoolItem,
  pick,
  selectedItems,
}) {
  return (
    <div className="tierlist-create-summary is-visible">
      <div className="tierlist-create-summary-head">
        <strong>{pick('พูลที่เลือกแล้ว', 'Selected pool')}</strong>
        <div className="tierlist-create-summary-meta">
          <span>{pick(`${selectedItems.length} รายการพร้อมใช้`, `${selectedItems.length} items ready`)}</span>
          <span>{pick(`${customItemsCount} รูปจากการอิมพอร์ต`, `${customItemsCount} imported images`)}</span>
        </div>
      </div>
      {selectedItems.length > 0 ? (
        <div className="tierlist-create-summary-list">
          {selectedItems.map((entry) => {
            const artworkSource = getArtworkSource(entry);
            const metaLine = entry?.isCustomTierItem
              ? pick('อิมพอร์ตจากข้างนอก', 'Imported from outside')
              : getMetaLine(entry) || pick('เลือกจากคลังในเว็บ', 'Selected from the site catalog');
            return (
              <article key={`selected-pool-${entry.id}`} className="tierlist-create-summary-item">
                <div className="tierlist-create-summary-thumb">
                  {artworkSource ? <img src={artworkSource} alt={getDisplayName(entry)} loading="lazy" /> : null}
                </div>
                <div className="tierlist-create-summary-copy">
                  <div className="tierlist-create-summary-item-tags">
                    <span className="tierlist-chip">
                      {entry?.isCustomTierItem
                        ? pick('อิมพอร์ต', 'Imported')
                        : pick('จากเว็บ', 'Catalog')}
                    </span>
                    {entry?.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                  </div>
                  <strong>{getDisplayName(entry)}</strong>
                  <span>{metaLine}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveSelectedPoolItem(entry)}
                >
                  <Trash2 size={14} /> {pick('เอาออก', 'Remove')}
                </Button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="tierlist-create-summary-empty">
          {pick('พอเลือกจากในเว็บหรืออิมพอร์ตจากข้างนอกแล้ว รายการทั้งหมดจะมาโชว์รวมกันตรงนี้', 'Once you pick items from the site or import them, everything will appear together here.')}
        </p>
      )}
    </div>
  );
}
