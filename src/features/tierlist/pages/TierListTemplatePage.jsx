import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Compass, Crown, Loader2, Medal, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { TierListArtworkImage as ArtworkImage, TierListCommunityCard, TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { buildTierListFromTemplate, loadTierTemplateDetail, seedPoolFromCatalog } from '@/features/tierlist/lib/tierlistStore';
import { getDisplayName, getMetaLine } from '@/features/tierlist/lib/tierlistLabels';
import { buildEntityMaps, fetchCharacterEntitiesByIds, fetchThemeSongEntitiesByIds, getBestEntityMapForIds } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { buildRemixedTierList, getCurrentUsername, hasMeaningfulTierRanking, hasVisibleTierListTitles, sortListsByRecentAndPopularity } from '@/features/tierlist/lib/tierlistPageUtils';
import { getTemplatePreviewArtworkSource, getTemplatePreviewMediaStyle, normalizeTemplatePreviewFit } from '@/features/tierlist/lib/tierlistPreviewUtils';
import { Button } from '@/shared/components/ui/Button';
import { PlayModeModal } from '@/shared/components/ui/PlayModeModal';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import '../styles/TierList.css';

export function TierListTemplatePage() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { pick } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [songEntities, setSongEntities] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [template, setTemplate] = useState(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModeModal, setShowModeModal] = useState(false);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    async function load() {
      setIsTemplateLoading(true);
      setIsPreviewLoading(true);
      setLoadError('');

      const loadedDetail = await loadTierTemplateDetail(templateId, {
        userId: user?.id || null,
        showAdult,
      });
      if (cancelled) return;
      setLibrary(loadedDetail.library);

      const found = loadedDetail.template;
      if (!found) {
        setIsTemplateLoading(false);
        setIsPreviewLoading(false);
        setLoadError(pick('ไม่พบเทมเพลต', 'Template not found'));
        return;
      }

      let resolvedTemplate = found;
      let resolvedTemplateEntityType = normalizeCatalogEntityType(found.entityType);

      setTemplate(resolvedTemplate);
      setIsTemplateLoading(false);

      const communityListIds = loadedDetail.library.lists
        .filter((l) => String(l.templateId) === String(templateId))
        .flatMap((l) => [
          ...(l.rows || []).flatMap((r) => r.titleIds || []),
          ...(l.poolTitleIds || []),
        ]);
      const previewIds = [...new Set([...resolvedTemplate.titleIds, ...communityListIds].map(Number).filter(Boolean))];

      // Preview pages only need the referenced entities, not the whole catalog.
      const isCharacterType = resolvedTemplateEntityType === CHARACTER_ENTITY_TYPE;
      const isSongType = resolvedTemplateEntityType === THEME_SONG_ENTITY_TYPE;
      let fetchedTitles;
      if (isCharacterType) {
        fetchedTitles = await fetchCharacterEntitiesByIds(previewIds);
        if (cancelled) return;
        setSongEntities([]);
      } else if (isSongType) {
        fetchedTitles = [];
        const fetchedSongs = await fetchThemeSongEntitiesByIds(previewIds);
        if (cancelled) return;
        setSongEntities(fetchedSongs);
      } else {
        fetchedTitles = await getTitlesByIds(previewIds);
        if (cancelled) return;
        setSongEntities([]);
      }
      if (cancelled) return;
      setTitles(fetchedTitles);
      setIsPreviewLoading(false);
    }

    load().catch((error) => {
      if (cancelled) return;
      setIsTemplateLoading(false);
      setIsPreviewLoading(false);
      setLoadError(error?.message || pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load template'));
    });

    return () => { cancelled = true; };
  }, [pick, templateId, showAdult, user?.id, isAuthLoading]);

  const entityMaps = useMemo(
    () => buildEntityMaps([...titles, ...songEntities], template?.customItems || [], template?.entityType),
    [songEntities, template?.customItems, template?.entityType, titles]
  );
  const titleById = useMemo(
    () => getBestEntityMapForIds(entityMaps, template?.titleIds || [], template?.entityType),
    [entityMaps, template?.entityType, template?.titleIds]
  );

  const relatedPublicLists = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        hasMeaningfulTierRanking(list) &&
        String(list.templateId || '') === String(templateId) &&
        hasVisibleTierListTitles(list, titleById)
      ))
    ),
    [library.lists, templateId, titleById]
  );

  const handlePlay = async () => {
    try {
      const ownerUsername = getCurrentUsername(user);
      const list = buildTierListFromTemplate(template, {
        ownerUserId: user?.id || null,
      });
      const seeded = seedPoolFromCatalog(list, template.titleIds);
      const nextList = {
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      };
      const nextLibrary = {
        ...library,
        templates: [
          template,
          ...library.templates.filter((entry) => String(entry?.id || '') !== String(template?.id || '')),
        ],
        lists: [
          nextList,
          ...library.lists.filter((entry) => String(entry?.id || '') !== String(nextList.id)),
        ],
      };
      setLibrary(nextLibrary);
      navigate(`/tierlist/play/${nextList.id}`, {
        state: {
          initialTierList: nextList,
          initialLibrary: nextLibrary,
        },
      });
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemix = async (list) => {
    try {
      const ownerUsername = getCurrentUsername(user);
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

  if (isTemplateLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดเทมเพลต', 'Loading template')}
            message={pick('กำลังดึงรายละเอียดและรายการเรื่องตัวอย่าง', 'Fetching template details and preview titles.')}
          />
        </section>
      </div>
    );
  }

  if (!template || loadError) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError || pick('ไม่พบเทมเพลต', 'Template not found')}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับไปหน้ารวม', 'Back to Browse')}
            backTo="/tierlist"
          />
        </section>
      </div>
    );
  }

  const previewTitles = template.titleIds
    .slice(0, 16)
    .map((id) => titleById.get(Number(id)))
    .filter(Boolean);
  const heroCoverArtwork = getTemplatePreviewArtworkSource(template, previewTitles[0]);
  const previewPodium = previewTitles.slice(0, 3);

  const heroCover = heroCoverArtwork || previewTitles[0]?.cover || '';

  return (
    <div className="tierlist-page">

      <PlayModeModal
        isOpen={showModeModal}
        onClose={() => setShowModeModal(false)}
        onSolo={handlePlay}
        onMulti={() => { setShowModeModal(false); navigate('/party'); }}
        title={template.title}
        cover={heroCover}
        multiLabel="Play with Friends"
        multiHint="Create a party room and rank together"
      />

      <section className="container tierlist-hero tierlist-create-hero tierlist-create-rail">
        <div className="tierlist-create-hero">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('รายละเอียดเทมเพลต', 'Template Detail')}</span>
          <h1>{template.title}</h1>
          <p>{template.description || pick('ยังไม่มีคำอธิบาย', 'No description yet.')}</p>
          <div className="tierlist-hero-actions">
            <button className="btn btn-ghost" onClick={() => navigate('/tierlist')}>{pick('กลับไปหน้ารวม', 'Back to Browse')}</button>
            <Button variant="primary" iconRight={<ArrowRight size={14} />} onClick={() => setShowModeModal(true)}>
              {pick('เล่นเทมเพลตนี้', 'Play This Template')}
            </Button>
          </div>
        </div>
        <div className="tierlist-hero-panel glass-heavy">
          {heroCoverArtwork ? (
            <div
              className={`tierlist-hero-cover${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
              style={getTemplatePreviewMediaStyle(template)}
            >
              <img
                src={heroCoverArtwork}
                alt={template.title}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </div>
          ) : null}
          <div className="tierlist-stat"><strong>{template.titleIds.length}</strong><span>{pick('เรื่อง', 'Titles')}</span></div>
          <div className="tierlist-stat"><strong>{template.plays || 0}</strong><span>{pick('ครั้งที่เล่น', 'Plays')}</span></div>
          <div className="tierlist-stat"><strong>{relatedPublicLists.length}</strong><span>{pick('รีมิกซ์สาธารณะ', 'Public remixes')}</span></div>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('ตัวอย่างเรื่อง', 'Preview Titles')}</h2>
        </div>
        {previewPodium.length > 0 ? (
          <div className="tierlist-podium-grid tierlist-preview-podium">
            {previewPodium.map((entry, index) => (
              <article
                key={`preview-podium-${entry.id}`}
                className={`tierlist-podium-card${index === 0 ? ' tierlist-podium-card-winner' : ''} glass-heavy`}
              >
                <div className="tierlist-podium-cover">
                  <ArtworkImage entity={entry} alt={getDisplayName(entry)} loading="lazy" />
                </div>
                <span className="tierlist-podium-rank">
                  {index === 0 ? (
                    <Crown size={20} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  ) : (
                    <Medal size={18} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
                  )}
                  #{index + 1}
                </span>
                <strong>{getDisplayName(entry)}</strong>
                <small>{getMetaLine(entry) || pick('ตัวอย่างจากเทมเพลตนี้', 'Example from this template')}</small>
              </article>
            ))}
          </div>
        ) : null}
        <div className="tierlist-preview-gallery">
          {isPreviewLoading ? (
            <TierListEmptyPanel
              icon={<Loader2 size={24} className="animate-spin" />}
              title={pick('กำลังโหลดตัวอย่าง', 'Loading previews')}
              message={pick('กำลังเตรียมรายชื่อเรื่องจากแคตตาล็อก', 'Preparing preview titles from the catalog.')}
            />
          ) : previewTitles.length === 0 ? (
            <TierListEmptyPanel
              icon={<Compass size={24} />}
              title={pick('ยังไม่มีเรื่องตัวอย่าง', 'No preview titles available')}
              message={pick('เทมเพลตนี้ยังไม่มีรายการเรื่องให้แสดงตัวอย่าง', 'This template does not have any titles to preview yet.')}
            />
          ) : (
            previewTitles.map((title) => (
              <article key={title.id} className="tierlist-preview-tile">
                <div className="tierlist-preview-poster">
                  <ArtworkImage entity={title} alt={getDisplayName(title)} loading="lazy" />
                </div>
                <div className="tierlist-preview-caption">
                  <h3>{getDisplayName(title)}</h3>
                  <p>{getMetaLine(title)}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('อันดับชุมชนของเทมเพลตนี้', 'Community Rankings For This Template')}</h2>
          <span className="tierlist-count">{relatedPublicLists.length} {pick('ลิสต์สาธารณะ', 'public lists')}</span>
        </div>

        {relatedPublicLists.length === 0 ? (
          <TierListEmptyPanel
            icon={<Sparkles size={24} />}
            title={pick('ยังไม่มีอันดับสาธารณะ', 'No public rankings yet')}
            message={pick('ลองเล่นเทมเพลตนี้แล้วเผยแพร่อันดับของคุณเป็นคนแรก', 'Play this template and publish the first community ranking.')}
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
                onSecondaryClick={() => handleRemix(list)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default TierListTemplatePage;
