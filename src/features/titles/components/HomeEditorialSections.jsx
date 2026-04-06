import React from 'react';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { TitleCard } from '@/shared/components/ui/Card';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';

export function HomeEditorialSections({ isVisible, collectionBlocks, showAdult }) {
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {collectionBlocks.map((block) => {
        const collectionTitles = block.collection.items
          .slice(0, Math.max(1, Number(block.config?.maxItems || block.collection.itemLimit || 12)))
          .map((item) => item.title)
          .filter(Boolean);
        const visibleCollectionTitles = filterTitlesForAgeGate(collectionTitles, showAdult);

        if (visibleCollectionTitles.length === 0) return null;

        return (
          <section key={block.id} className="section editorial-section">
            <div className="container">
              <SectionHeader
                title={block.title}
                subtitle={block.subtitle && <p className="editorial-subtitle">{block.subtitle}</p>}
                action={block.collection?.slug && (
                  <span className="editorial-chip">{block.collection.badgeLabel || block.collection.slug}</span>
                )}
              />
              <div className="results-grid stagger-children">
                {visibleCollectionTitles.map((title) => (
                  <TitleCard key={`${block.id}-${title.id}`} title={title} />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
