import React from 'react';
import { useLanguage } from '@/shared/contexts/LanguageContext';

export function DiscoverHero({ children }) {
  const { t } = useLanguage();
  const accent = t('discover.accent');
  const title = t('discover.title');
  const plainTitle = title.replace(accent, '');

  return (
    <section className="dv2-hero">
      <div className="dv2-hero-inner">
        <h1 className="dv2-hero-title">
          {plainTitle}
          {accent ? <span className="dv2-hero-title-accent">{accent}</span> : null}
        </h1>

        {children}
      </div>
    </section>
  );
}
