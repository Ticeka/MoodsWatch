import React from 'react';
import { Link } from 'react-router-dom';
import { BROWSE_ENTITY_IDS_PER_TEMPLATE } from '@/features/tierlist/constants';
import { getBestEntityMapForIds } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import {
  getTemplatePreviewArtworkSource,
  getTemplatePreviewMediaStyle,
  normalizeTemplatePreviewFit,
} from '@/features/tierlist/lib/tierlistPreviewUtils';

export function TierListBrowseSidebar({
  entityMaps,
  pick,
  trendingTemplates,
}) {
  return (
    <aside className="tierlist-browse-sidebar">
      <div className="tierlist-browse-sidebar-card">
        <h3>{pick('เทมเพลตยอดนิยม', 'Trending Templates')}</h3>
        <ul className="tierlist-trending-list">
          {trendingTemplates.map((template, index) => {
            const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
            const fallbackEntity = template.titleIds
              .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
              .map((id) => entityById.get(Number(id)))
              .filter(Boolean)[0] || null;
            const coverArtwork = getTemplatePreviewArtworkSource(template, fallbackEntity);

            return (
              <li key={template.id}>
                <Link className="tierlist-trending-item" to={`/tierlist/template/${template.id}`}>
                  <span className="tierlist-trending-rank">{index + 1}.</span>
                  {coverArtwork ? (
                    <img
                      className={`tierlist-trending-thumb${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                      style={getTemplatePreviewMediaStyle(template)}
                      src={coverArtwork}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  ) : (
                    <span className="tierlist-trending-thumb tierlist-trending-thumb-empty" />
                  )}
                  <span className="tierlist-trending-name">{template.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
