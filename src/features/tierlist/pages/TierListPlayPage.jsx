import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Compass, Crown, Loader2, Medal, Save } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { TierListArtworkImage as ArtworkImage, TierListCommentSection, TierListCommunityCard, TierListEditor, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { findTierList, findTierTemplate, filterTierListToCatalog, loadTierListDetail, saveTierList, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getDisplayName, getMetaLine, getOwnerDisplayName } from '@/features/tierlist/lib/tierlistLabels';
import { buildEntityMaps, fetchCharacterEntitiesByIds, fetchThemeSongEntitiesByIds, getEntityMap, getTierEntryEntityIds, toCustomTierEntity } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { buildRemixedTierList, getTierListPodium, hasMeaningfulTierRanking, hasTierListStructureChanged, hasVisibleTierListTitles, sortListsByRecentAndPopularity } from '@/features/tierlist/lib/tierlistPageUtils';
import { getTierListProgressMedal } from '@/features/tierlist/lib/tierlistMedals';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, TITLE_ENTITY_TYPE, YOUTUBE_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import '../styles/TierList.css';

export function TierListPlayPage() {
  const { listId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [tierList, setTierList] = useState(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [songEntityMap, setSongEntityMap] = useState(new Map());

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      setLoadError('');
      setSongEntityMap(new Map());
      const initialTierList = String(location.state?.initialTierList?.id || '') === String(listId || '')
        ? location.state.initialTierList
        : null;
      const initialLibrary = initialTierList && location.state?.initialLibrary
        ? location.state.initialLibrary
        : { templates: [], lists: [] };
      const isTransientSession = Boolean(initialTierList);

      let loadedLibrary = initialLibrary;
      let foundList = initialTierList;

      if (!initialTierList) {
        const loadedDetail = await loadTierListDetail(listId, {
          userId: user?.id || null,
          showAdult,
        });
        loadedLibrary = loadedDetail.library;
        foundList = loadedDetail.list;
      }

      if (!cancelled) {
        setLibrary(loadedLibrary);
      }

      if (!foundList) {
        setLoadError(pick('ไม่พบเทียร์ลิสต์', 'Tier list not found'));
        return;
      }

      const list = foundList;

      if (!cancelled) {
        setTierList(list);
      }
      const sourceTemplate = list.templateId
        ? findTierTemplate(list.templateId, loadedLibrary)
        : null;
      const allowedTitleIds = sourceTemplate?.titleIds?.length
        ? sourceTemplate.titleIds
        : [
          ...list.poolTitleIds,
          ...list.rows.flatMap((row) => row.titleIds),
        ];

      // Determine entity type to choose loading strategy
      const resolvedEntityTypeForLoad = normalizeCatalogEntityType(
        list.entityType || (sourceTemplate ? sourceTemplate.entityType : null)
      );

      const persistedEntityIds = [...new Set([
        ...list.poolTitleIds,
        ...list.rows.flatMap((row) => row.titleIds),
      ].map(Number).filter(Boolean))];
      const referencedEntityIds = [...new Set([
        ...allowedTitleIds,
        ...persistedEntityIds,
      ].map(Number).filter(Boolean))];

      let filteredCatalog;
      let availableCatalogIds = referencedEntityIds;
      if (resolvedEntityTypeForLoad === CHARACTER_ENTITY_TYPE) {
        const catalog = await fetchCharacterEntitiesByIds(referencedEntityIds, { showAdult });
        if (cancelled) return;
        filteredCatalog = catalog;
        availableCatalogIds = catalog.map((entity) => Number(entity.id)).filter(Boolean);
      } else if (resolvedEntityTypeForLoad !== THEME_SONG_ENTITY_TYPE && resolvedEntityTypeForLoad !== YOUTUBE_ENTITY_TYPE) {
        const catalog = await getTitlesByIds(referencedEntityIds, { showAdult });
        if (cancelled) return;
        filteredCatalog = catalog;
        availableCatalogIds = catalog.map((entry) => Number(entry.id)).filter(Boolean);
      } else {
        filteredCatalog = [];
      }
      setTitles(filteredCatalog);

      const shouldReseedFromTemplate = (
        persistedEntityIds.length === 0 &&
        Array.isArray(sourceTemplate?.titleIds) &&
        sourceTemplate.titleIds.length > 0
      );
      const baseListForFilter = shouldReseedFromTemplate
        ? seedPoolFromCatalog({
          ...list,
          entityType: resolvedEntityTypeForLoad,
        }, sourceTemplate.titleIds)
        : {
          ...list,
          entityType: resolvedEntityTypeForLoad,
        };

      let cleanedList = filterTierListToCatalog(baseListForFilter, availableCatalogIds);
      const canRepairFromTemplate = (
        Array.isArray(sourceTemplate?.titleIds) &&
        sourceTemplate.titleIds.length > 0 &&
        resolvedEntityTypeForLoad !== TITLE_ENTITY_TYPE
      );
      if (canRepairFromTemplate && getTierEntryEntityIds(cleanedList).length === 0) {
        const repairedList = seedPoolFromCatalog({
          ...list,
          entityType: resolvedEntityTypeForLoad,
        }, sourceTemplate.titleIds);
        cleanedList = resolvedEntityTypeForLoad === CHARACTER_ENTITY_TYPE
          ? filterTierListToCatalog(repairedList, availableCatalogIds)
          : repairedList;
      }
      if (cancelled) return;

      let nextPlayableList = cleanedList;

      if (hasTierListStructureChanged(list, cleanedList)) {
        if (isTransientSession) {
          nextPlayableList = cleanedList;
        } else {
          const cleanedLibrary = await saveTierList(cleanedList, null, { userId: user?.id || null });
          if (cancelled) return;
          setLibrary(cleanedLibrary);
          nextPlayableList = findTierList(cleanedList.id, cleanedLibrary) || cleanedList;
        }
      }

      // Load song entities for song-type tier lists
      const resolvedEntityType = normalizeCatalogEntityType(
        cleanedList.entityType || (sourceTemplate ? sourceTemplate.entityType : null)
      );
      nextPlayableList = {
        ...nextPlayableList,
        entityType: resolvedEntityType,
      };
      setTierList(nextPlayableList);

      if (resolvedEntityType === THEME_SONG_ENTITY_TYPE || resolvedEntityType === YOUTUBE_ENTITY_TYPE) {
        let songIds = [
          ...(sourceTemplate?.titleIds || []),
          ...nextPlayableList.poolTitleIds,
          ...nextPlayableList.rows.flatMap((row) => row.titleIds),
        ].map(Number).filter((id) => Number.isFinite(id) && id > 0);

        let uniqueSongIds = [...new Set(songIds)];
        let serverSongEntities = [];

        if (resolvedEntityType === THEME_SONG_ENTITY_TYPE && uniqueSongIds.length > 0) {
          serverSongEntities = await fetchThemeSongEntitiesByIds(uniqueSongIds, { showAdult });

          if (cancelled) return;
          if (
            serverSongEntities.length === 0 &&
            canRepairFromTemplate
          ) {
            const repairedSongList = seedPoolFromCatalog({
              ...nextPlayableList,
              entityType: THEME_SONG_ENTITY_TYPE,
            }, sourceTemplate.titleIds);
            nextPlayableList = repairedSongList;
            setTierList(repairedSongList);
            songIds = [...new Set(sourceTemplate.titleIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
            uniqueSongIds = songIds;
            serverSongEntities = uniqueSongIds.length > 0
              ? await fetchThemeSongEntitiesByIds(uniqueSongIds, { showAdult })
              : [];
            if (cancelled) return;
          }
        }

        // Always include custom items (negative IDs from YouTube/manual entries) in the entity map
        const customSongEntities = (nextPlayableList.customItems || []).map(
          (item) => toCustomTierEntity(item, resolvedEntityType)
        );
        const allSongEntities = [...serverSongEntities, ...customSongEntities];
        if (allSongEntities.length > 0) {
          setSongEntityMap(new Map(allSongEntities.map((e) => [e.id, e])));
        }
      }
    }
    load().catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลดเทียร์ลิสต์ไม่สำเร็จ', 'Failed to load tier list'));
    });
    return () => { cancelled = true; };
  }, [listId, location.state, pick, showAdult, user?.id, isAuthLoading]);

  const sourceTemplate = tierList?.templateId ? findTierTemplate(tierList.templateId, library) : null;
  const activeEntityType = normalizeCatalogEntityType(tierList?.entityType || sourceTemplate?.entityType);
  const entityMaps = useMemo(
    () => buildEntityMaps(titles, tierList?.customItems || sourceTemplate?.customItems || [], activeEntityType),
    [activeEntityType, sourceTemplate, tierList, titles]
  );
  const titleById = useMemo(
    () => getEntityMap(entityMaps, activeEntityType),
    [activeEntityType, entityMaps]
  );
  // For song-type lists, override titleById with the loaded song entity map
  const effectiveTitleById = songEntityMap.size > 0 ? songEntityMap : titleById;
  const isOwner = Boolean(user?.id && tierList?.ownerUserId && String(user.id) === String(tierList.ownerUserId));
  const canEdit = !tierList?.ownerUserId || isOwner;
  const relatedPublicLists = tierList?.templateId
    ? sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        list.id !== tierList.id &&
        String(list.templateId || '') === String(tierList.templateId) &&
        hasVisibleTierListTitles(list, effectiveTitleById)
      ))
    )
    : [];

  const requiredEntityIds = useMemo(
    () => [...new Set([
      ...(tierList?.poolTitleIds || []),
      ...((tierList?.rows || []).flatMap((row) => row.titleIds || [])),
    ].map(Number).filter(Boolean))],
    [tierList]
  );
  const hasResolvedRequiredEntities = useMemo(
    () => requiredEntityIds.every((id) => effectiveTitleById.has(id)),
    [effectiveTitleById, requiredEntityIds]
  );

  const handleToggleVisibility = async () => {
    if (!tierList.isPublic && !hasMeaningfulTierRanking(tierList)) {
      const totalEntityCount = [
        ...(tierList?.poolTitleIds || []),
        ...((tierList?.rows || []).flatMap((row) => row.titleIds || [])),
      ].length;

      if (totalEntityCount === 0 && sourceTemplate?.titleIds?.length) {
        setTierList((current) => seedPoolFromCatalog(current, sourceTemplate.titleIds));
      }

      toast.error(
        pick(
          'จัดอันดับอย่างน้อย 1 รายการก่อนเผยแพร่',
          'Rank at least one item before publishing',
        ),
      );
      return;
    }

    const next = { ...tierList, isPublic: !tierList.isPublic };
    setTierList(next);
    try {
      const savedLibrary = await saveTierList(next, null, { userId: user?.id || null });
      setLibrary(savedLibrary);
      setTierList(findTierList(next.id, savedLibrary) || savedLibrary.lists[0] || next);
    } catch (error) {
      setTierList(tierList);
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    }
  };

  const handleRemixTierList = async (list) => {
    try {
      const ownerUsername = user?.profile?.username || user?.user_metadata?.username || null;
      const nextList = seedPoolFromCatalog({
        ...buildRemixedTierList(list, user),
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, [
        ...(list?.poolTitleIds || []),
        ...((list?.rows || []).flatMap((row) => row?.titleIds || [])),
      ]);
      navigate(`/tierlist/play/${nextList.id}`, {
        state: {
          initialTierList: nextList,
          initialLibrary: library,
        },
      });
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  const isSongType = activeEntityType === THEME_SONG_ENTITY_TYPE || activeEntityType === YOUTUBE_ENTITY_TYPE;
  const isWaitingForSongs = isSongType && songEntityMap.size === 0 && !loadError;
  const isWaitingForPoolEntities = Boolean(tierList) && requiredEntityIds.length > 0 && !hasResolvedRequiredEntities && !loadError;
  const podium = useMemo(() => getTierListPodium(tierList, effectiveTitleById), [effectiveTitleById, tierList]);
  const progressMedal = useMemo(() => getTierListProgressMedal(tierList, pick), [pick, tierList]);
  const ProgressMedalIcon = progressMedal?.icon || null;
  const winner = podium[0] || null;
  const runnerUps = podium.slice(1, 3);

  if (!tierList || isWaitingForSongs || isWaitingForPoolEntities) {
    return (
      <div className="tierlist-play-page">
        <section className="container tierlist-section">
          {loadError ? (
            <TierListErrorPanel
              message={loadError}
              onRetry={() => window.location.reload()}
              backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
              backTo="/tierlist"
            />
          ) : (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดเทียร์ลิสต์', 'Loading tier list')}
              message={isWaitingForPoolEntities
                ? pick('กำลังเตรียมภาพในคลัง tier list', 'Preparing artwork for the tier list pool.')
                : isSongType
                  ? pick('กำลังโหลดข้อมูลเพลงสำหรับคลังรูป', 'Loading song data for the image pool.')
                  : pick('กำลังเตรียมข้อมูลการจัดอันดับและเรื่องในพูล', 'Preparing the ranking board and title pool.')}
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
          <Link className="btn btn-ghost btn-sm" to={sourceTemplate ? `/tierlist/template/${sourceTemplate.id}` : '/tierlist'}>
            <ChevronLeft size={14} /> {sourceTemplate ? pick('กลับไปเทมเพลต', 'Back to Template') : pick('กลับไปหน้ารวม', 'Back to Browse')}
          </Link>
          {!canEdit && (() => {
            const slug = tierList.ownerUsername || tierList.ownerName;
            const label = getOwnerDisplayName(tierList.ownerName, tierList.ownerUsername, pick);
            return slug && slug !== 'You' ? (
              <span className="tierlist-by-line">
                {pick('โดย', 'by')}{' '}
                <Link to={`/u/${slug}`} className="tierlist-owner-link">{label}</Link>
              </span>
            ) : null;
          })()}
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant={tierList.isPublic ? 'secondary' : 'ghost'}
            onClick={handleToggleVisibility}
          >
            {tierList.isPublic ? pick('สาธารณะ: เปิด', 'Public: ON') : pick('ทำเป็นสาธารณะ', 'Make Public')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => handleRemixTierList(tierList)}
          >
            {pick('รีมิกซ์อันดับนี้', 'Remix This Ranking')}
          </Button>
        )}
      </div>

      <TierListEditor
        tierList={tierList}
        setTierList={setTierList}
        titleById={effectiveTitleById}
        query={query}
        setQuery={setQuery}
        pick={pick}
        readOnly={!canEdit}
      />

      {progressMedal ? (
        <section className="container tierlist-section">
          <div className={`tierlist-play-medal tierlist-play-medal-${progressMedal.key} glass-heavy`}>
            <span className="tierlist-play-medal-icon">
              {ProgressMedalIcon ? <ProgressMedalIcon size={18} /> : null}
            </span>
            <div className="tierlist-play-medal-copy">
              <strong>{progressMedal.label}</strong>
              <span>{progressMedal.description}</span>
            </div>
          </div>
        </section>
      ) : null}

      {winner ? (
        <section className="container tierlist-section">
          <div className="tierlist-section-head">
            <h2>{pick('อันดับเด่นตอนนี้', 'Current Podium')}</h2>
          </div>
          <div className="tierlist-podium-grid">
            <article className="tierlist-podium-card tierlist-podium-card-winner glass-heavy">
              <div className="tierlist-podium-cover">
                <ArtworkImage entity={winner} alt={getDisplayName(winner)} loading="lazy" />
              </div>
              <span className="tierlist-podium-rank"><Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #1</span>
              <strong>{getDisplayName(winner)}</strong>
              <small>{getMetaLine(winner) || pick('อันดับสูงสุดของลิสต์นี้', 'Top ranked in this tier list')}</small>
            </article>
            {runnerUps.map((entry, index) => (
              <article key={entry.id} className="tierlist-podium-card glass-heavy">
                <div className="tierlist-podium-cover">
                  <ArtworkImage entity={entry} alt={getDisplayName(entry)} loading="lazy" />
                </div>
                <span className="tierlist-podium-rank"><Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> #{index + 2}</span>
                <strong>{getDisplayName(entry)}</strong>
                <small>{getMetaLine(entry) || pick('ตัวท็อปของการจัดอันดับนี้', 'Top ranked in this tier list')}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sourceTemplate && (
        <section className="container tierlist-section">
          <div className="tierlist-community-banner glass-heavy">
            <div className="tierlist-community-banner-copy">
              <small className="tierlist-chip">{pick('ชุมชนของเทมเพลต', 'Template Community')}</small>
              <h2>{pick('ดูว่าคนอื่นจัดอันดับเทมเพลตเดียวกันนี้อย่างไร', 'See how other people ranked this same template')}</h2>
              <p>
                {canEdit
                  ? pick('เผยแพร่อันดับของคุณ เปรียบเทียบลำดับกับคนอื่น หรือรีมิกซ์จากลิสต์ชุมชนเพื่อแตกกิ่งแนวคิดใหม่ได้เลย', 'Publish your version, compare tier choices, or remix a community ranking to start your own branch.')
                  : pick('ลิสต์นี้แก้ไขไม่ได้ แต่คุณยังดูความต่างของแต่ละอันดับ แล้วรีมิกซ์เป็นเวอร์ชันที่แก้ไขได้ของตัวเองต่อได้', 'This ranking is view-only. Compare tier choices here, then remix it to create your own editable version.')}
              </p>
            </div>
            <div className="tierlist-community-banner-actions">
              <Link className="btn btn-ghost" to={`/tierlist/template/${sourceTemplate.id}`}>
                {pick('หน้าเทมเพลต', 'Template Page')}
              </Link>
              {canEdit && !tierList.isPublic ? (
                <Button variant="primary" onClick={handleToggleVisibility}>
                  {pick('เผยแพร่อันดับของคุณ', 'Publish Your Ranking')}
                </Button>
              ) : null}
              {!canEdit ? (
                <Button variant="primary" onClick={() => handleRemixTierList(tierList)}>
                  {pick('รีมิกซ์เพื่อแก้ไข', 'Remix To Edit')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="tierlist-section-head">
            <h2>{pick('อันดับจากชุมชน', 'Community Rankings')}</h2>
            <span className="tierlist-count">{relatedPublicLists.length} {pick('ลิสต์ที่เกี่ยวข้อง', 'related lists')}</span>
          </div>

          {relatedPublicLists.length === 0 ? (
            <TierListEmptyPanel
              icon={<Compass size={24} />}
              title={pick('ยังไม่มีอันดับสาธารณะอื่น', 'No other public rankings yet')}
              message={pick('ยังไม่มีอันดับสาธารณะอื่นสำหรับเทมเพลตนี้ในตอนนี้', 'There are no other public rankings for this template yet.')}
            />
          ) : (
            <div className="tierlist-browse-grid">
              {relatedPublicLists.slice(0, 8).map((list) => (
                <TierListCommunityCard
                  key={list.id}
                  list={list}
                  titleById={titleById}
                  pick={pick}
                  primaryLabel={pick('เปิดอันดับ', 'Open Ranking')}
                  primaryTo={`/tierlist/play/${list.id}`}
                  secondaryLabel={pick('รีมิกซ์', 'Remix')}
                  onSecondaryClick={() => handleRemixTierList(list)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tierList.isPublic && (
        <TierListCommentSection
          listId={tierList.id}
          listOwnerId={tierList.ownerUserId}
          pick={pick}
        />
      )}
    </div>
  );
}

export default TierListPlayPage;
