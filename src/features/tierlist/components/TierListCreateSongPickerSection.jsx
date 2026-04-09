import React from 'react';
import { ChevronLeft, ChevronRight, Loader2, Music, Search, X } from 'lucide-react';
import { CREATE_SORT_OPTIONS } from '@/features/tierlist/constants';
import {
  getCatalogTypeChipLabel,
  getCreateSortLabel,
  getDisplayName,
  getMediaTypeLabel,
  getMetaLine,
  getStatusLabel,
} from '@/features/tierlist/lib/tierlistLabels';
import { TierListArtworkImage as ArtworkImage } from './TierListArtworkImage';
import { TierListEmptyPanel } from './TierListPanels';
import { Button } from '@/shared/components/ui/Button';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { getCatalogEntityName } from '@/shared/lib/catalogEntities';

function getAudienceGroups(pick) {
  return [
    { key: 'safe', label: pick('ไม่ 18+', 'Non 18+') },
    { key: 'adult', label: '18+' },
  ];
}

function TierListCreateSongDrilldown({
  browsingTitle,
  currentBrowseSongs,
  filteredBrowseSongs,
  groupedFilteredBrowseSongs,
  isSongsLoading,
  onBackToTitles,
  onClearSongQuery,
  onDeselectAllCurrentSongs,
  onSelectAllCurrentSongs,
  onSongQueryChange,
  onToggleSong,
  pick,
  selectedIds,
  songQuery,
}) {
  const selectedSongCount = currentBrowseSongs.filter((song) => selectedIds.has(song.id)).length;

  return (
    <>
      <div className="tierlist-section-head">
        <div className="tierlist-songs-drilldown-head">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onBackToTitles}
          >
            <ChevronLeft size={14} /> {pick('กลับเลือกเรื่อง', 'Back to titles')}
          </button>
          <h2>
            {getCatalogEntityName(browsingTitle)}
            <span className="tierlist-count">
              &nbsp;•&nbsp;
              {selectedSongCount}/{currentBrowseSongs.length} {pick('เพลงที่เลือก', 'songs selected')}
            </span>
          </h2>
        </div>
        <div className="tierlist-picker-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onSelectAllCurrentSongs}
            disabled={currentBrowseSongs.length === 0}
          >
            {pick('เลือกทั้งหมด', 'Select All')}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDeselectAllCurrentSongs}
            disabled={currentBrowseSongs.every((song) => !selectedIds.has(song.id))}
          >
            {pick('ยกเลิกทั้งหมด', 'Deselect All')}
          </button>
        </div>
      </div>

      <div className="tierlist-picker-filterbar">
        <div className="tierlist-picker-filterbar-top">
          <div className="tierlist-picker-search-wrap">
            <input
              className="tierlist-picker-search"
              value={songQuery}
              onChange={(event) => onSongQueryChange(event.target.value)}
              placeholder={pick('ค้นหาเพลง ศิลปิน หรือ OP/ED...', 'Search by song, artist, or OP/ED...')}
              aria-label={pick('ค้นหาเพลง', 'Search songs')}
            />
            {songQuery ? (
              <button type="button" className="tierlist-picker-search-clear" onClick={onClearSongQuery}>
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="tierlist-picker-result-count">{filteredBrowseSongs.length} {pick('เพลง', 'songs')}</span>
        </div>
      </div>

      {isSongsLoading ? (
        <TierListEmptyPanel
          icon={<Loader2 size={24} className="animate-spin" />}
          title={pick('กำลังโหลดเพลง', 'Loading songs')}
          message={pick('กำลังดึงรายการเพลงสำหรับเรื่องนี้', 'Fetching song list for this title.')}
        />
      ) : filteredBrowseSongs.length === 0 ? (
        <TierListEmptyPanel
          icon={<Music size={24} />}
          title={pick('ไม่พบเพลงสำหรับเรื่องนี้', 'No songs found for this title')}
          message={pick('เรื่องนี้ยังไม่มีข้อมูลเพลงในระบบ', 'This title has no song data in the database.')}
        />
      ) : (
        <div className="tierlist-adult-split-wrap">
          {getAudienceGroups(pick).map((group) => (
            <section key={group.key} className="tierlist-adult-split-block">
              <h3>{group.label} <span>{groupedFilteredBrowseSongs[group.key].length}</span></h3>
              <div className="tierlist-song-picker-list">
                {groupedFilteredBrowseSongs[group.key].length === 0 ? (
                  <p className="tierlist-pool-state">{pick('ไม่มีรายการฝั่งนี้', 'No items in this side')}</p>
                ) : groupedFilteredBrowseSongs[group.key].map((song) => {
                  const selected = selectedIds.has(song.id);
                  return (
                    <button
                      key={song.id}
                      type="button"
                      className={`tierlist-song-picker-row${selected ? ' is-selected' : ''}`}
                      onClick={() => onToggleSong(song.id)}
                      aria-pressed={selected}
                    >
                      <div className="tierlist-song-picker-thumb">
                        <ArtworkImage entity={song} alt="" loading="lazy" />
                      </div>
                      <div className="tierlist-song-picker-info">
                        <strong>{song.song_title || getCatalogEntityName(song)}</strong>
                        <span>{[song.theme_label, song.artist_name].filter(Boolean).join(' | ')}</span>
                        {song.episodes_text ? <small>{song.episodes_text}</small> : null}
                      </div>
                      <span className="tierlist-song-picker-check" aria-hidden="true">
                        {selected ? <span className="tierlist-picker-check-dot is-on" /> : <span className="tierlist-picker-check-dot" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TierListCreateSongTitleBrowser({
  catalogPage,
  catalogTotalPages,
  filteredForSongBrowse,
  groupedFilteredForSongBrowse,
  isLoading,
  onClearTitleQuery,
  onNextPage,
  onOpenTitle,
  onPreviousPage,
  onSortByChange,
  onTitleQueryChange,
  onTypeFilterChange,
  pick,
  preloadSongsForTitle,
  selectedIds,
  songEntityCache,
  sortBy,
  titleQuery,
  typeFilter,
}) {
  return (
    <>
      <div className="tierlist-section-head">
        <h2>
          {pick('เลือกเรื่องที่ต้องการเพลง', 'Pick a title to browse songs')}
          {selectedIds.size > 0 ? (
            <span className="tierlist-count">&nbsp;• {selectedIds.size} {pick('เพลงที่เลือกแล้ว', 'songs selected')}</span>
          ) : null}
        </h2>
      </div>

      <div className="tierlist-picker-filterbar">
        <div className="tierlist-picker-filterbar-top">
          <div className="tierlist-picker-type-pills" role="toolbar">
            {['all', 'anime', 'manga', 'manhwa'].map((type) => (
              <button
                key={type}
                type="button"
                className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                onClick={() => onTypeFilterChange(type)}
                aria-pressed={typeFilter === type}
              >
                {getMediaTypeLabel(type, pick)}
              </button>
            ))}
          </div>
          <SortSelect
            value={sortBy}
            onChange={onSortByChange}
            label={pick('เรียง', 'Sort')}
            className="results-sorter"
          >
            {CREATE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getCreateSortLabel(option.value, pick)}</option>
            ))}
          </SortSelect>
          <div className="tierlist-picker-search-wrap">
            <input
              className="tierlist-picker-search"
              value={titleQuery}
              onChange={(event) => onTitleQueryChange(event.target.value)}
              placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
            />
            {titleQuery ? (
              <button type="button" className="tierlist-picker-search-clear" onClick={onClearTitleQuery}>
                <X size={14} />
              </button>
            ) : null}
          </div>
          <span className="tierlist-picker-result-count">{filteredForSongBrowse.length} {pick('เรื่อง', 'titles')}</span>
        </div>
      </div>

      {isLoading ? (
        <TierListEmptyPanel
          icon={<Loader2 size={28} className="animate-spin" />}
          title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
          message={pick('กำลังเตรียมรายชื่อเรื่อง', 'Preparing titles.')}
        />
      ) : filteredForSongBrowse.length === 0 ? (
        <TierListEmptyPanel
          icon={<Search size={28} />}
          title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
          message={pick('ลองล้างคำค้นหา', 'Try clearing the search.')}
        />
      ) : (
        <>
          <div className="tierlist-adult-split-wrap">
            {getAudienceGroups(pick).map((group) => (
              <section key={group.key} className="tierlist-adult-split-block">
                <h3>{group.label} <span>{groupedFilteredForSongBrowse[group.key].length}</span></h3>
                <div className="tierlist-picker-grid">
                  {groupedFilteredForSongBrowse[group.key].map((title) => {
                    const titleSongs = songEntityCache.get(Number(title.id)) || [];
                    const selectedCount = titleSongs.filter((song) => selectedIds.has(song.id)).length;
                    return (
                      <button
                        key={title.id}
                        type="button"
                        className={`tierlist-picker-card${selectedCount > 0 ? ' is-selected' : ''}`}
                        onClick={() => onOpenTitle(title)}
                        onMouseEnter={() => preloadSongsForTitle(title)}
                        onFocus={() => preloadSongsForTitle(title)}
                        title={getDisplayName(title)}
                      >
                        <div className="tierlist-picker-thumb">
                          <ArtworkImage entity={title} alt="" loading="lazy" />
                          {selectedCount > 0 ? (
                            <div className="tierlist-picker-check">
                              <Music size={10} /> {selectedCount}
                            </div>
                          ) : null}
                        </div>
                        <div className="tierlist-picker-card-body">
                          <div className="tierlist-picker-card-tags">
                            <span className="tierlist-chip">{getCatalogTypeChipLabel(title, pick)}</span>
                            {title.is_adult ? <span className="tierlist-chip tierlist-chip-adult">18+</span> : null}
                          </div>
                          <strong className="tierlist-picker-card-title">{getDisplayName(title)}</strong>
                          <span className="tierlist-picker-card-subtitle">{getMetaLine(title) || getStatusLabel(title.status, pick)}</span>
                          <small className="tierlist-picker-card-footnote">
                            {pick('กดเพื่อเข้าไปเลือก OP / ED ของเรื่องนี้', 'Open this title to pick its OP / ED tracks')}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {catalogTotalPages > 1 ? (
            <div className="tierlist-picker-pagination">
              <Button
                size="sm"
                variant="ghost"
                disabled={catalogPage <= 1}
                onClick={onPreviousPage}
              >
                <ChevronLeft size={14} /> {pick('ก่อนหน้า', 'Prev')}
              </Button>
              <span className="tierlist-picker-page-info">
                {pick('หน้า', 'Page')} {catalogPage} / {catalogTotalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={catalogPage >= catalogTotalPages}
                onClick={onNextPage}
              >
                {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

export function TierListCreateSongPickerSection({
  browsingTitle,
  catalogPage,
  catalogTotalPages,
  currentBrowseSongs,
  filteredBrowseSongs,
  filteredForSongBrowse,
  groupedFilteredBrowseSongs,
  groupedFilteredForSongBrowse,
  isLoading,
  isSongsLoading,
  onBackToTitles,
  onClearSongQuery,
  onClearTitleQuery,
  onDeselectAllCurrentSongs,
  onNextPage,
  onOpenTitle,
  onPreviousPage,
  onSelectAllCurrentSongs,
  onSongQueryChange,
  onSortByChange,
  onTitleQueryChange,
  onToggleSong,
  onTypeFilterChange,
  pick,
  preloadSongsForTitle,
  sectionRef,
  selectedIds,
  songEntityCache,
  songQuery,
  sortBy,
  titleQuery,
  typeFilter,
}) {
  return (
    <section ref={sectionRef} className="container tierlist-section tierlist-create-rail">
      {browsingTitle ? (
        <TierListCreateSongDrilldown
          browsingTitle={browsingTitle}
          currentBrowseSongs={currentBrowseSongs}
          filteredBrowseSongs={filteredBrowseSongs}
          groupedFilteredBrowseSongs={groupedFilteredBrowseSongs}
          isSongsLoading={isSongsLoading}
          onBackToTitles={onBackToTitles}
          onClearSongQuery={onClearSongQuery}
          onDeselectAllCurrentSongs={onDeselectAllCurrentSongs}
          onSelectAllCurrentSongs={onSelectAllCurrentSongs}
          onSongQueryChange={onSongQueryChange}
          onToggleSong={onToggleSong}
          pick={pick}
          selectedIds={selectedIds}
          songQuery={songQuery}
        />
      ) : (
        <TierListCreateSongTitleBrowser
          catalogPage={catalogPage}
          catalogTotalPages={catalogTotalPages}
          filteredForSongBrowse={filteredForSongBrowse}
          groupedFilteredForSongBrowse={groupedFilteredForSongBrowse}
          isLoading={isLoading}
          onClearTitleQuery={onClearTitleQuery}
          onNextPage={onNextPage}
          onOpenTitle={onOpenTitle}
          onPreviousPage={onPreviousPage}
          onSortByChange={onSortByChange}
          onTitleQueryChange={onTitleQueryChange}
          onTypeFilterChange={onTypeFilterChange}
          pick={pick}
          preloadSongsForTitle={preloadSongsForTitle}
          selectedIds={selectedIds}
          songEntityCache={songEntityCache}
          sortBy={sortBy}
          titleQuery={titleQuery}
          typeFilter={typeFilter}
        />
      )}
    </section>
  );
}
