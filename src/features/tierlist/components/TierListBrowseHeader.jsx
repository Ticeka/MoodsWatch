import React from 'react';
import { LayoutGrid, Plus, Monitor, ListOrdered, Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const TIER_LABELS = ['S', 'A', 'B', 'C', 'D'];
const TIER_COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#6366f1'];

export function TierListBrowseHeader({ pick, userId }) {
  return (
    <header className="tl-hero">
      {/* Decorative floating tier labels */}
      <div className="tl-hero-tiers-bg" aria-hidden="true">
        {TIER_LABELS.map((label, i) => (
          <span
            key={label}
            className="tl-hero-tier-float"
            style={{
              '--tier-color': TIER_COLORS[i],
              animationDelay: `${i * 0.4}s`,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="container tl-hero-container">
        {/* Badge */}
        <div className="tl-hero-badge animate-fade-in-up">
          <span className="tl-hero-badge-icon">
            <ListOrdered size={13} strokeWidth={2.5} />
          </span>
          {pick('อนิเมะ · มังงะ · มันฮวา', 'Anime · Manga · Manhwa')}
        </div>

        {/* Title */}
        <h1 className="tl-hero-title animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
          {pick('เทียร์ลิสต์', 'TIER LIST')}
        </h1>

        {/* Subtitle */}
        <p className="tl-hero-tagline animate-fade-in-up" style={{ animationDelay: '0.12s' }}>
          {pick(
            'จัดอันดับตามใจชอบ · แชร์ให้โลกเห็น',
            'Rank what you love · Share what you think',
          )}
        </p>

        {/* CTA Buttons */}
        <div className="tl-hero-actions animate-fade-in-up" style={{ animationDelay: '0.18s' }}>
          <Link className="tl-btn-primary action-pulse" to="/tierlist/create">
            <Plus size={18} />
            {pick('สร้างเทียร์ลิสต์', 'Create Tier List')}
          </Link>
          {userId ? (
            <Link className="tl-btn-secondary" to="/tierlist/me">
              <Monitor size={18} />
              {pick('จัดการของฉัน', 'Manage Mine')}
            </Link>
          ) : null}
        </div>

        {/* 3-Step Guide */}
        <div className="tl-hero-steps animate-fade-in-up" style={{ animationDelay: '0.26s' }}>
          <div className="tl-step-item">
            <div className="tl-step-icon">
              <LayoutGrid size={18} />
            </div>
            <span>{pick('เลือกเทมเพลต', 'Pick a template')}</span>
          </div>
          <ChevronRight size={14} className="tl-step-sep" aria-hidden="true" />
          <div className="tl-step-item">
            <div className="tl-step-icon">
              <ListOrdered size={18} />
            </div>
            <span>{pick('ลากจัดอันดับ', 'Drag to rank')}</span>
          </div>
          <ChevronRight size={14} className="tl-step-sep" aria-hidden="true" />
          <div className="tl-step-item">
            <div className="tl-step-icon">
              <Sparkles size={18} />
            </div>
            <span>{pick('บันทึก & แชร์', 'Save & share')}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
