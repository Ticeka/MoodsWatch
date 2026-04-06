import React from 'react';
import { Monitor, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TierListBrowseHeader({
  pick,
  userId,
}) {
  return (
    <div className="container tierlist-browse-title-row">
      <div className="tierlist-browse-title-row-left">
        <h1>{pick('ศูนย์รวม Tier List', 'Tier List Explorer')}</h1>
      </div>
      <div className="tierlist-browse-title-row-actions">
        {userId ? (
          <Link className="tierlist-browse-manage-btn" to="/tierlist/me">
            <Monitor size={14} /> {pick('จัดการของฉัน', 'Manage Mine')}
          </Link>
        ) : null}
        <Link className="tierlist-browse-create-btn" to="/tierlist/create">
          <Plus size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}
        </Link>
      </div>
    </div>
  );
}
