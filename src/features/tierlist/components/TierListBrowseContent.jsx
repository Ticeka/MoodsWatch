import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Compass, Loader2, Music, Search } from 'lucide-react';
import { BROWSE_ENTITY_IDS_PER_TEMPLATE } from '@/features/tierlist/constants';
import { getTemplateExplorerSummary } from '@/features/tierlist/lib/tierlistLabels';
import { getBestEntityMapForIds, getEntityMap } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import {
  getTemplatePreviewArtworkSource,
  getTemplatePreviewMediaStyle,
  normalizeTemplatePreviewFit,
} from '@/features/tierlist/lib/tierlistPreviewUtils';
import { getOwnerDisplayName } from '@/features/tierlist/lib/tierlistLabels';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { TierListCommunityCard } from './TierListCommunityCard';
import { TierListEmptyPanel } from './TierListPanels';

function buildOwnerProfilePath(ownerUsername) {
  const normalized = String(ownerUsername || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return '';
  }
  return `/u/${normalized}`;
}

export function TierListBrowseContent({
  entityMaps,
  filteredTemplatesCount,
  hasActiveFilters,
  handlePlayTemplate,
  handleRemixList,
  isCatalogHydrating,
  isLoading,
  onClearFilters,
  onNextPage,
  onPreviousPage,
  onQueryChange,
  onSortByChange,
  pagedTemplates,
  pick,
  query,
  recentCommunityLists,
  sortBy,
}) {
  return (
    <div className="tierlist-browse-main">
      <div className="tierlist-browse-search-bar" role="group" aria-label={pick('ควบคุมการค้นหาเทมเพลต', 'Template search controls')}>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={pick('ค้นหา tier lists...', 'Search tier lists...')}
          aria-label={pick('ค้นหาเทมเพลต', 'Search templates')}
        />
        <button type="button" className="tierlist-browse-search-icon" aria-hidden="true">
          <Search size={16} />
        </button>
      </div>

      <div className="tierlist-browse-sort-row">
        {!isLoading ? (
          <span className="tierlist-browse-result-count">{filteredTemplatesCount} {pick('เทมเพลต', 'templates')}</span>
        ) : null}
        <SortSelect
          value={sortBy}
          onChange={onSortByChange}
          label={pick('เรียงลำดับ', 'Sort')}
          className="tierlist-browse-sorter"
        >
          <option value="popular">{pick('ยอดนิยม', 'Popular')}</option>
          <option value="newest">{pick('ใหม่ล่าสุด', 'Newest')}</option>
          <option value="alphabet">{pick('ก-ฮ', 'A-Z')}</option>
        </SortSelect>
      </div>

      <section className="tierlist-browse-content">
        {isLoading ? (
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดเทมเพลต', 'Loading templates')}
            message={pick('กำลังเตรียมเทมเพลตและอันดับล่าสุดจากชุมชน', 'Fetching templates and recent community rankings.')}
          />
        ) : pagedTemplates.items.length === 0 ? (
          <TierListEmptyPanel
            icon={<Compass size={28} />}
            title={pick('ยังไม่พบเทมเพลตที่ตรง', 'No matching templates')}
            message={
              hasActiveFilters
                ? pick('ลองล้างคำค้นหา เปลี่ยนหมวดหมู่ หรือสลับการเรียงลำดับ', 'Try clearing your search, switching categories, or changing the sort order.')
                : pick('ยังไม่มีเทมเพลตสาธารณะในตอนนี้', 'There are no public templates yet.')
            }
            action={hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                onClick={onClearFilters}
              >
                {pick('ล้างตัวกรอง', 'Clear filters')}
              </Button>
            ) : null}
          />
        ) : (
          <div className="tierlist-browse-grid">
            {pagedTemplates.items.map((template, index) => {
              const entityById = getBestEntityMapForIds(entityMaps, template.titleIds, template.entityType);
              const templateItemCount = template.titleIds?.length || 0;
              const cover = template.titleIds
                .slice(0, BROWSE_ENTITY_IDS_PER_TEMPLATE)
                .map((id) => entityById.get(Number(id)))
                .filter(Boolean);
              const coverArtwork = getTemplatePreviewArtworkSource(template, cover[0]);
              const explorerSummary = getTemplateExplorerSummary(template, pick);
              const ownerLabel = getOwnerDisplayName(template.ownerName, template.ownerUsername, pick);
              const ownerProfilePath = buildOwnerProfilePath(template.ownerUsername);
              const ownerInitial = String(ownerLabel || '?').trim().charAt(0).toUpperCase() || '?';
              const hasOwnerMeta = Boolean(template.ownerAvatarUrl || template.ownerUsername || template.ownerName);

              return (
                <article key={template.id} className="tierlist-explorer-card">
                  <div
                    className={`tierlist-explorer-card-cover${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                    style={getTemplatePreviewMediaStyle(template)}
                  >
                    {coverArtwork ? (
                      <img
                        src={coverArtwork}
                        alt={template.title}
                        draggable={false}
                        loading={index < 3 ? 'eager' : 'lazy'}
                        decoding="async"
                        fetchPriority={index < 3 ? 'high' : 'auto'}
                      />
                    ) : isCatalogHydrating ? (
                      <div className="tierlist-explorer-card-cover-loading" />
                    ) : (
                      <div className="tierlist-explorer-card-cover-empty" />
                    )}
                    <div className="tierlist-explorer-card-cover-badges">
                      <span className="tierlist-explorer-card-tag">{explorerSummary.categoryLabel}</span>
                      <span className="tierlist-card-count-badge">{pick(`${templateItemCount} รายการ`, `${templateItemCount} items`)}</span>
                    </div>
                  </div>
                  <div className="tierlist-explorer-card-body">
                    <h3>{template.title}</h3>
                    <span className="tierlist-explorer-card-stat">{explorerSummary.statLine}</span>
                    {hasOwnerMeta ? (
                      <div className="tierlist-explorer-owner">
                        {ownerProfilePath ? (
                          <Link to={ownerProfilePath} className="tierlist-explorer-owner-link">
                            {template.ownerAvatarUrl ? (
                              <img src={template.ownerAvatarUrl} alt="" className="tierlist-explorer-owner-avatar" loading="lazy" />
                            ) : (
                              <span className="tierlist-explorer-owner-avatar tierlist-explorer-owner-avatar-fallback" aria-hidden="true">
                                {ownerInitial}
                              </span>
                            )}
                            <span className="tierlist-explorer-owner-copy">
                              <strong>{ownerLabel}</strong>
                              <span>@{template.ownerUsername}</span>
                            </span>
                          </Link>
                        ) : (
                          <div className="tierlist-explorer-owner-link is-static">
                            {template.ownerAvatarUrl ? (
                              <img src={template.ownerAvatarUrl} alt="" className="tierlist-explorer-owner-avatar" loading="lazy" />
                            ) : (
                              <span className="tierlist-explorer-owner-avatar tierlist-explorer-owner-avatar-fallback" aria-hidden="true">
                                {ownerInitial}
                              </span>
                            )}
                            <span className="tierlist-explorer-owner-copy">
                              <strong>{ownerLabel}</strong>
                              <span>{pick('เทมเพลตชุมชน', 'Community template')}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    ) : null}
                    <div className="tierlist-explorer-card-actions">
                      <Button size="sm" variant="primary" className="tierlist-explorer-btn-rank" onClick={() => handlePlayTemplate(template)}>
                        {pick('จัดอันดับ', 'Rank')}
                      </Button>
                      <Link className="tierlist-explorer-btn-view" to={`/tierlist/template/${template.id}`}>
                        {pick('ดู', 'View')}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {pagedTemplates.totalPages > 1 ? (
          <div className="tierlist-pagination">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft size={14} />}
              disabled={pagedTemplates.page <= 1}
              onClick={onPreviousPage}
            >
              {pick('ก่อนหน้า', 'Previous')}
            </Button>
            <span>{pagedTemplates.page} / {pagedTemplates.totalPages}</span>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={14} />}
              disabled={pagedTemplates.page >= pagedTemplates.totalPages}
              onClick={onNextPage}
            >
              {pick('ถัดไป', 'Next')}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="tierlist-browse-songs-section">
        <Link className="tierlist-songs-banner glass-heavy" to="/tierlist/songs">
          <div className="tierlist-songs-banner-icon"><Music size={28} /></div>
          <div className="tierlist-songs-banner-copy">
            <h2>{pick('จัดอันดับเพลงเปิด-ปิด', 'Rank Opening & Ending Songs')}</h2>
            <p>{pick('เลือกเรื่องที่มีข้อมูลเพลง แล้วจัดอันดับ OP/ED ในแบบของคุณเอง', 'Pick a title with song data and build your own OP/ED tier list.')}</p>
          </div>
          <span className="btn btn-primary btn-sm">
            {pick('ดูเทียร์ลิสต์เพลง', 'Explore Song Tier Lists')} <ArrowRight size={13} />
          </span>
        </Link>
      </section>

      {recentCommunityLists.length > 0 ? (
        <section className="tierlist-browse-community-section">
          <div className="tierlist-section-head">
            <h2>{pick('อันดับชุมชนล่าสุด', 'Fresh Community Rankings')}</h2>
          </div>
          <div className="tierlist-browse-grid">
            {recentCommunityLists.map((list) => (
              <TierListCommunityCard
                key={list.id}
                list={list}
                titleById={getEntityMap(entityMaps, list.entityType)}
                pick={pick}
                primaryLabel={pick('เปิดอันดับ', 'Open ranking')}
                primaryTo={`/tierlist/play/${list.id}`}
                secondaryLabel={pick('รีมิกซ์', 'Remix')}
                onSecondaryClick={() => handleRemixList(list)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
