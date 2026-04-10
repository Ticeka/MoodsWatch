import React from 'react';
import { ChevronLeft, Monitor, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TierListManageHero({
  myListStats,
  myTemplatesCount,
  pick,
}) {
  return (
    <section className="container tierlist-manage-hero">
      <div className="tierlist-manage-hero-copy">
        <span className="tierlist-kicker"><Monitor size={14} /> {pick('พื้นที่จัดการส่วนตัว', 'Personal Workspace')}</span>
        <h1>{pick('จัดการเทียร์ลิสต์ของฉัน', 'Manage My Tier Lists')}</h1>
        <p>{pick('รวมเทมเพลตและอันดับที่คุณสร้างไว้ทั้งหมดในที่เดียว เปิดแก้ไขต่อหรือสลับ public/private ได้เร็วขึ้น', 'See every template and ranking you created in one place, then jump back in to edit or switch visibility faster.')}</p>
      </div>
      <div className="tierlist-manage-hero-actions">
        <Link className="tierlist-browse-manage-btn" to="/tierlist">
          <ChevronLeft size={14} /> {pick('กลับไปหน้ารวม', 'Back to Browse')}
        </Link>
        <Link className="tierlist-browse-create-btn" to="/tierlist/create">
          <Plus size={14} /> {pick('สร้างเทียร์ลิสต์ใหม่', 'Create New Tier List')}
        </Link>
      </div>
      <div className="tierlist-manage-summary-grid">
        <article className="glass-heavy tierlist-manage-summary-card">
          <strong>{myTemplatesCount}</strong>
          <span>{pick('เทมเพลตของฉัน', 'My templates')}</span>
        </article>
        <article className="glass-heavy tierlist-manage-summary-card">
          <strong>{myListStats.totalCount}</strong>
          <span>{pick('ลิสต์ของฉัน', 'My rankings')}</span>
        </article>
        <article className="glass-heavy tierlist-manage-summary-card">
          <strong>{myListStats.publicCount}</strong>
          <span>{pick('ลิสต์สาธารณะ', 'Public rankings')}</span>
        </article>
      </div>
    </section>
  );
}
