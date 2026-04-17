import React, { useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/shared/contexts/LanguageContext';

function SkeletonCard() {
  return (
    <div className="hv2-card hv2-card--skeleton">
      <div className="hv2-card-img hv2-skeleton-pulse" />
      <div className="hv2-card-body">
        <div className="hv2-skeleton-line hv2-skeleton-pulse" style={{ width: '80%' }} />
        <div className="hv2-skeleton-line hv2-skeleton-pulse" style={{ width: '50%' }} />
      </div>
    </div>
  );
}

export function SkeletonRow({ count = 6 }) {
  return (
    <div className="hv2-carousel">
      <div className="hv2-carousel-track">
        <div className="hv2-carousel-row">
          {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}

export function Carousel({ children }) {
  const ref = useRef(null);
  const { pick } = useLanguage();

  const scroll = useCallback((dir) => {
    if (!ref.current) return;
    const amount = window.innerWidth > 768 ? 600 : 300;
    ref.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  return (
    <div className="hv2-carousel">
      <button className="hv2-scroll-btn hv2-scroll-left" onClick={() => scroll('left')} aria-label={pick('เลื่อนไปทางซ้าย', 'Scroll left')}>
        <ChevronLeft size={20} />
      </button>
      <div className="hv2-carousel-track" ref={ref}>
        <div className="hv2-carousel-row">
          {children}
        </div>
      </div>
      <button className="hv2-scroll-btn hv2-scroll-right" onClick={() => scroll('right')} aria-label={pick('เลื่อนไปทางขวา', 'Scroll right')}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
