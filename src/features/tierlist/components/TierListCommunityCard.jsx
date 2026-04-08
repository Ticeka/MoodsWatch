import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { TIER_COLORS } from '@/features/tierlist/constants';
import { getOwnerDisplayName, getTierRowFallbackLabel } from '@/features/tierlist/lib/tierlistLabels';
import { getTierListPreviewTitles } from '@/features/tierlist/lib/tierlistPageUtils';
import { TierListArtworkImage } from './TierListArtworkImage';

function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
}

export function TierListCommunityCard({
  list,
  titleById,
  pick,
  primaryLabel,
  primaryTo,
  onPrimaryClick,
  secondaryLabel,
  onSecondaryClick,
}) {
  const coverTitles = getTierListPreviewTitles(list, titleById);
  const ownerLabel = getOwnerDisplayName(list.ownerName, list.ownerUsername, pick);
  const ownerProfilePath = buildOwnerProfilePath(list.ownerUsername);
  const ownerInitial = String(ownerLabel || '?').trim().charAt(0).toUpperCase() || '?';
  const hasOwnerMeta = Boolean(list.ownerAvatarUrl || list.ownerUsername || list.ownerName);
  const previewRows = list.rows
    .map((row, index) => ({
      id: row.id,
      label: row.label || getTierRowFallbackLabel(index, pick),
      color: row.color || TIER_COLORS[index % TIER_COLORS.length],
      titles: row.titleIds
        .map((id) => titleById.get(Number(id)))
        .filter(Boolean)
        .slice(0, 4),
    }))
    .filter((row) => row.titles.length > 0)
    .slice(0, 4);

  return (
    <article className="glass-heavy tierlist-browse-card tierlist-community-card">
      <div className="tierlist-community-preview">
        {previewRows.length > 0 ? (
          previewRows.map((row) => (
            <div key={`${list.id}-${row.id}`} className="tierlist-community-preview-row">
              <span
                className="tierlist-community-preview-label"
                style={{ background: row.color }}
              >
                {row.label}
              </span>
              <div className="tierlist-community-preview-strip">
                {row.titles.map((title) => (
                  <TierListArtworkImage key={`${list.id}-${row.id}-${title.id}`} entity={title} alt="" loading="lazy" />
                ))}
              </div>
            </div>
          ))
        ) : coverTitles.length > 0 ? (
          <div className="tierlist-browse-cover">
            {coverTitles.map((title) => (
              <TierListArtworkImage key={`${list.id}-${title.id}`} entity={title} alt="" loading="lazy" />
            ))}
          </div>
        ) : (
          <div className="tierlist-browse-cover-empty" />
        )}
      </div>
      <div className="tierlist-browse-card-body">
        <h3>{list.title}</h3>
        <small className="tierlist-meta">
          {list.rows.length} {pick('ชั้น', 'tiers')} • {list.playCount || 0} {pick('ครั้งเล่น', 'plays')}
        </small>
        {hasOwnerMeta ? (
          <div className="tierlist-community-owner">
            {ownerProfilePath ? (
              <Link to={ownerProfilePath} className="tierlist-community-owner-link" onClick={(event) => event.stopPropagation()}>
                {list.ownerAvatarUrl ? (
                  <img src={list.ownerAvatarUrl} alt="" className="tierlist-community-owner-avatar" loading="lazy" />
                ) : (
                  <span className="tierlist-community-owner-avatar tierlist-community-owner-avatar-fallback" aria-hidden="true">
                    {ownerInitial}
                  </span>
                )}
                <span className="tierlist-community-owner-copy">
                  <strong>{ownerLabel}</strong>
                  <span>@{list.ownerUsername}</span>
                </span>
              </Link>
            ) : (
              <div className="tierlist-community-owner-link is-static">
                {list.ownerAvatarUrl ? (
                  <img src={list.ownerAvatarUrl} alt="" className="tierlist-community-owner-avatar" loading="lazy" />
                ) : (
                  <span className="tierlist-community-owner-avatar tierlist-community-owner-avatar-fallback" aria-hidden="true">
                    {ownerInitial}
                  </span>
                )}
                <span className="tierlist-community-owner-copy">
                  <strong>{ownerLabel}</strong>
                  <span>{pick('ผู้เล่นชุมชน', 'Community member')}</span>
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>
      <div className="tierlist-browse-card-actions">
        {primaryTo ? (
          <Link className="btn btn-primary btn-sm" to={primaryTo}>{primaryLabel}</Link>
        ) : (
          <Button size="sm" variant="primary" onClick={onPrimaryClick}>{primaryLabel}</Button>
        )}
        {secondaryLabel ? (
          <Button size="sm" variant="ghost" onClick={onSecondaryClick}>{secondaryLabel}</Button>
        ) : null}
      </div>
    </article>
  );
}
