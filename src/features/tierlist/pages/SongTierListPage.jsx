import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Music } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getTitleBySlug } from '@/features/discover/lib/recommend';
import { TierListEditor, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { createTierListFromTemplate, loadTierLibrary, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { fetchSongsForTitle } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { THEME_SONG_ENTITY_TYPE, getCatalogEntityName, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import '../styles/TierList.css';

export function SongTierListPage() {
  const { titleSlug } = useParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const [sourceTitle, setSourceTitle] = useState(null);
  const [songs, setSongs] = useState([]);
  const [tierList, setTierList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!titleSlug) return undefined;
    let cancelled = false;

    async function load() {
      setLoadError('');
      try {
        const title = await getTitleBySlug(titleSlug);
        if (cancelled) return;
        if (!title) {
          setLoadError(pick('ไม่พบชื่อเรื่องนี้', 'Title not found'));
          return;
        }
        setSourceTitle(title);

        const songEntities = await fetchSongsForTitle(title);
        if (cancelled) return;
        setSongs(songEntities);

        if (songEntities.length === 0) {
          setLoadError(pick('ไม่มีเพลงสำหรับชื่อเรื่องนี้', 'No songs found for this title'));
          return;
        }

        // Load library to find an existing song tierlist for this title
        const library = await loadTierLibrary([], {
          userId: user?.id || null,
          includePublic: false,
          fetchTemplates: false,
          showAdult,
        });
        if (cancelled) return;

        const songSourceKey = `song-source:${title.id}`;
        const isCurrentOwnerList = (list) => (
          user?.id
            ? String(list.ownerUserId || '') === String(user.id)
            : !list.ownerUserId && String(list.ownerName || '').trim().toLowerCase() === 'you'
        );
        const existing = library.lists
          .filter((list) => (
            list.description === songSourceKey &&
            normalizeCatalogEntityType(list.entityType) === THEME_SONG_ENTITY_TYPE &&
            isCurrentOwnerList(list)
          ))
          .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())[0];

        const songIds = songEntities.map((s) => s.id);
        const baseList = existing
          ? seedPoolFromCatalog({
            ...existing,
            entityType: THEME_SONG_ENTITY_TYPE,
            description: songSourceKey,
          }, songIds)
          : createTierListFromTemplate({
            id: '',
            title: `${pick('เพลงจาก', 'Songs of')} ${getCatalogEntityName(title)}`,
            description: songSourceKey,
            defaultRows: ['S', 'A', 'B', 'C', 'D'],
            titleIds: songIds,
            entityType: THEME_SONG_ENTITY_TYPE,
            hasAdultContent: Boolean(title?.is_adult),
          });

        if (!cancelled) {
          setTierList(baseList);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || pick('โหลดไม่สำเร็จ', 'Failed to load'));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [titleSlug, user?.id, showAdult, pick]);

  const titleById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs]
  );

  const _titleName = sourceTitle ? getCatalogEntityName(sourceTitle) : titleSlug;

  if (!tierList) {
    return (
      <div className="tierlist-play-page">
        <section className="container tierlist-section">
          {loadError ? (
            <TierListErrorPanel
              message={loadError}
              onRetry={() => window.location.reload()}
              backLabel={pick('กลับ', 'Back')}
              backTo={`/title/${titleSlug}`}
            />
          ) : (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดเพลง', 'Loading songs')}
              message={pick('กำลังเตรียมรายการเพลงสำหรับจัด Tierlist', 'Preparing song list for tierlist')}
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-play-page">
      <div className="container tierlist-play-topbar">
        <div className="tierlist-play-topbar-left">
          <Link className="btn btn-ghost btn-sm" to="/tierlist/songs">
            <ChevronLeft size={14} /> {pick('ลิสต์จัดอันดับเพลง', 'Song Tier Lists')}
          </Link>
          <span className="tierlist-by-line">
            <Music size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {pick('จัดอันดับเพลง', 'Song Tierlist')}
          </span>
        </div>
      </div>

      <TierListEditor
        tierList={tierList}
        setTierList={setTierList}
        titleById={titleById}
        query={query}
        setQuery={setQuery}
        pick={pick}
      />
    </div>
  );
}

export default SongTierListPage;
