import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Loader2, Music, Play, Search, X } from 'lucide-react';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { TierListArtworkImage as ArtworkImage, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { getMediaTypeLabel } from '@/features/tierlist/lib/tierlistLabels';
import { getSongCountMap } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { getCatalogEntityName } from '@/shared/lib/catalogEntities';
import './TierList.css';

export function SongTierListBrowsePage() {
  const { pick } = useLanguage();
  const { showAdult } = useAgeGate();
  const [titlesWithSongs, setTitlesWithSongs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');

      // Step 1: get only the title IDs that have songs (fast, no full catalog)
      const songCountMap = await getSongCountMap();

      const uniqueTitleIds = [...songCountMap.keys()];
      const catalog = await getTitlesByIds(uniqueTitleIds);
      if (cancelled) return;

      const filtered = filterTitlesForAgeGate(catalog, showAdult);

      const result = filtered
        .map((t) => ({ ...t, songCount: songCountMap.get(Number(t.id)) || 0 }))
        .filter((t) => t.songCount > 0)
        .sort((a, b) => b.songCount - a.songCount);

      setTitlesWithSongs(result);
      setIsLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setLoadError(err?.message || pick('โหลดไม่สำเร็จ', 'Failed to load'));
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult]);

  const filteredTitles = useMemo(() => {
    let result = typeFilter === 'all' ? titlesWithSongs : titlesWithSongs.filter((t) => t.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const haystack = [t.title_th, t.title_en, t.canonical_title].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  }, [titlesWithSongs, typeFilter, query]);

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <div className="container tierlist-browse-header">
        <div className="tierlist-browse-header-left">
          <h1><Music size={17} /> {pick('ลิสต์จัดอันดับเพลง', 'Song Tier Lists')}</h1>
          {!isLoading && (
            <span className="tierlist-count">{filteredTitles.length} {pick('เรื่อง', 'titles')}</span>
          )}
        </div>
        <Link className="btn btn-ghost btn-sm" to="/tierlist">
          <ChevronLeft size={13} /> {pick('ลิสต์จัดอันดับทั้งหมด', 'All Tier Lists')}
        </Link>
      </div>

      <div className="container tierlist-browse-filters">
        <div className="tierlist-browse-cats">
          {['all', 'anime', 'manga', 'manhwa'].map((type) => (
            <button
              key={type}
              type="button"
              className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
              onClick={() => setTypeFilter(type)}
              aria-pressed={typeFilter === type}
            >
              {getMediaTypeLabel(type, pick)}
            </button>
          ))}
        </div>
        <div className="tierlist-browse-search" role="group">
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
            aria-label={pick('ค้นหาชื่อเรื่อง', 'Search titles')}
          />
          {query ? (
            <Button size="sm" variant="ghost" onClick={() => setQuery('')} aria-label={pick('ล้างคำค้นหา', 'Clear search')}>
              <X size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      <section className="container tierlist-section">
        {isLoading ? (
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดรายชื่อ', 'Loading titles')}
            message={pick('กำลังค้นหาเรื่องที่มีเพลงสำหรับจัดอันดับ', 'Finding titles with songs available to rank.')}
          />
        ) : filteredTitles.length === 0 ? (
          <TierListEmptyPanel
            icon={<Music size={28} />}
            title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
            message={
              query || typeFilter !== 'all'
                ? pick('ลองล้างคำค้นหาหรือเปลี่ยนประเภท', 'Try clearing the search or switching the type filter.')
                : pick('ยังไม่มีเรื่องที่มีข้อมูลเพลงในตอนนี้', 'No titles with song data are available yet.')
            }
            action={query || typeFilter !== 'all' ? (
              <Button variant="outline" onClick={() => { setQuery(''); setTypeFilter('all'); }}>
                {pick('ล้างตัวกรอง', 'Clear filters')}
              </Button>
            ) : null}
          />
        ) : (
          <div className="tierlist-browse-grid">
            {filteredTitles.map((title) => (
              <article key={title.id} className="glass-heavy tierlist-browse-card">
                <div className="tierlist-browse-cover">
                  <ArtworkImage entity={title} alt="" loading="lazy" />
                </div>
                <div className="tierlist-browse-card-body">
                  <small className="tierlist-chip">{getMediaTypeLabel(title.type || 'anime', pick)}</small>
                  <h3>{getCatalogEntityName(title)}</h3>
                  <small className="tierlist-meta">
                    <Music size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {title.songCount} {pick('เพลง', 'songs')}
                  </small>
                </div>
                <div className="tierlist-browse-card-actions">
                  <Link className="btn btn-primary btn-sm" to={`/tierlist/songs/${title.slug}`}>
                    <Play size={12} /> {pick('จัดอันดับเพลง', 'Rank Songs')}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default SongTierListBrowsePage;
