import React from 'react';
import { Link } from 'react-router-dom';
import { collectMatchReasonKeys } from '@/features/discover/lib/searchMatch';
import { formatCompactDate } from '@/features/discover/lib/discoverPageUtils';
import { SearchHighlightText } from './SearchHighlightText';
import { SearchMatchReasons } from './SearchMatchReasons';

export function DiscoverTierlistCard({ item, locale, t, query = '', onOpen = null }) {
  const hasCover = Boolean(item.coverUrl);
  const matchReasonKeys = collectMatchReasonKeys(query, [
    { reasonKey: 'matchReasonTitle', texts: [item.title] },
    { reasonKey: 'matchReasonDescription', texts: [item.description] },
    { reasonKey: 'matchReasonAuthor', texts: [item.ownerName, item.ownerUsername] },
    { reasonKey: 'matchReasonCategory', texts: [item.category, item.kind] },
  ]);

  return (
    <Link to={item.href} className={`discover-entity-card discover-tierlist-card ${hasCover ? 'has-cover' : ''}`} onClick={onOpen}>
      {hasCover && (
        <div className="discover-tierlist-bg">
          <img src={item.coverUrl} alt="" className="discover-tierlist-image" loading="lazy" />
          <div className="discover-tierlist-overlay" />
        </div>
      )}
      <div className="discover-tierlist-content">
        <div className="discover-tierlist-head">
          <span className={`discover-kind-pill ${item.kind === 'template' ? 'is-template' : 'is-list'}`}>
            {item.kind === 'template' ? t('discover.tierlistTemplate') : t('discover.tierlistList')}
          </span>
          <span className={`discover-privacy-pill ${item.isPublic ? 'is-public' : 'is-private'}`}>
            {item.isPublic ? t('discover.publicLabel') : t('discover.privateLabel')}
          </span>
        </div>
        <div className="discover-tierlist-copy">
          <h3><SearchHighlightText text={item.title} query={query} /></h3>
          <p className="discover-entity-description">
            {item.description ? <SearchHighlightText text={item.description} query={query} /> : t('discover.tierlistCardFallback')}
          </p>
        </div>
        <SearchMatchReasons reasonKeys={matchReasonKeys} t={t} />
        <div className="discover-entity-meta">
          <span>{t('discover.tierlistItems', { count: item.itemCount || 0 })}</span>
          <span>{t('discover.tierlistPlays', { count: item.playCount || 0 })}</span>
        </div>
        <div className="discover-tierlist-foot">
          <span>{item.ownerName || item.ownerUsername || t('discover.communityLabel')}</span>
          {item.updatedAt ? <span>{formatCompactDate(item.updatedAt, locale)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
