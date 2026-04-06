import React from 'react';
import { Sparkles } from 'lucide-react';

export function TierListCreateHero({
  isSongMode,
  minimumRequired,
  modeSummary,
  pick,
  selectedItemsCount,
}) {
  return (
    <section className="container tierlist-hero tierlist-create-hero tierlist-create-rail">
      <div className="tierlist-hero-copy">
        <span className="tierlist-kicker"><Sparkles size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}</span>
        <h1>{modeSummary.title}</h1>
        <p>{modeSummary.description}</p>
        <div className="tierlist-create-hero-meta" aria-label={pick('ภาพรวมการสร้าง', 'Creation summary')}>
          <span className="tierlist-create-meta-pill">
            <strong>{minimumRequired}</strong>
            {isSongMode
              ? pick(' ขั้นต่ำที่ต้องเลือก', ' minimum picks')
              : pick(' ขั้นต่ำก่อนสร้าง', ' minimum to create')}
          </span>
          <span className="tierlist-create-meta-pill">
            <strong>{selectedItemsCount}</strong>
            {pick(' รายการที่เลือก', ' selected')}
          </span>
        </div>
      </div>
    </section>
  );
}
