import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Eye, EyeOff, Layers, Loader2, Monitor, Pencil, Play, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getTitlePreviewByIds } from '@/features/discover/lib/recommend';
import { TierListEmptyPanel, TierListErrorPanel } from '@/features/tierlist/components';
import { MANAGE_LISTS_PAGE_SIZE } from '@/features/tierlist/constants';
import { deleteTierList, deleteTierTemplate, findTierTemplate, loadTierListDetail, loadTierLibrary, loadOwnedTierListStats, loadOwnedTierListsPage, loadTierTemplates, saveTierList, saveTierTemplate } from '@/features/tierlist/lib/tierlistStore';
import { getEntityTypeLabel, getTierCategoryLabel } from '@/features/tierlist/lib/tierlistLabels';
import { fetchCharacterEntitiesByIds, fetchThemeSongEntitiesByIds, toCustomTierEntity } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { formatTierDate, isOwnedListByUser, isOwnedTemplateByUser, sortTemplates } from '@/features/tierlist/lib/tierlistPageUtils';
import { getTemplatePreviewArtworkSource, getTemplatePreviewMediaStyle, normalizeTemplatePreviewFit } from '@/features/tierlist/lib/tierlistPreviewUtils';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { CHARACTER_ENTITY_TYPE, THEME_SONG_ENTITY_TYPE, normalizeCatalogEntityType } from '@/shared/lib/catalogEntities';
import './TierList.css';

export function TierListManagePage() {
  const { pick, locale } = useLanguage();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { showAdult } = useAgeGate();
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [templatePreviewEntityMap, setTemplatePreviewEntityMap] = useState(new Map());
  const [myListStats, setMyListStats] = useState({
    totalCount: 0,
    publicCount: 0,
    linkedCountByTemplateId: {},
  });
  const [listPage, setListPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSavingId, setIsSavingId] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  useEffect(() => {
    setListPage(1);
  }, [showAdult, user?.id]);

  const refreshLibrary = useCallback(async (options = {}) => {
    if (!user?.id) {
      const emptyLibrary = { templates: [], lists: [] };
      setLibrary(emptyLibrary);
      setMyListStats({
        totalCount: 0,
        publicCount: 0,
        linkedCountByTemplateId: {},
      });
      return emptyLibrary;
    }

    const targetPage = Number.isFinite(options?.page) && options.page > 0
      ? Math.floor(options.page)
      : listPage;
    const offset = (targetPage - 1) * MANAGE_LISTS_PAGE_SIZE;

    const [ownedTemplates, pagedLists, nextStats] = await Promise.all([
      loadTierTemplates([], {
        userId: user.id,
        includePublic: false,
        includeOwned: true,
        showAdult,
      }),
      loadOwnedTierListsPage(user.id, {
        limit: MANAGE_LISTS_PAGE_SIZE,
        offset,
        showAdult,
      }),
      loadOwnedTierListStats(user.id, { showAdult }),
    ]);

    const totalPages = Math.max(1, Math.ceil(nextStats.totalCount / MANAGE_LISTS_PAGE_SIZE));
    const nextPage = Math.min(targetPage, totalPages);
    const nextLists = nextPage === targetPage
      ? pagedLists
      : await loadOwnedTierListsPage(user.id, {
        limit: MANAGE_LISTS_PAGE_SIZE,
        offset: (nextPage - 1) * MANAGE_LISTS_PAGE_SIZE,
        showAdult,
      });
    const nextLibrary = {
      templates: ownedTemplates,
      lists: nextLists,
    };

    if (nextPage !== listPage) {
      setListPage(nextPage);
    }

    setLibrary(nextLibrary);
    setMyListStats(nextStats);
    return nextLibrary;
  }, [listPage, showAdult, user?.id]);

  useEffect(() => {
    if (isAuthLoading || !user?.id) {
      return;
    }

    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');
      try {
        await refreshLibrary();
        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || pick('โหลดรายการของคุณไม่สำเร็จ', 'Failed to load your tier lists'));
          setIsLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isAuthLoading, pick, refreshLibrary, user?.id]);

  const myTemplates = useMemo(
    () => sortTemplates(
      (library.templates || []).filter((template) => isOwnedTemplateByUser(template, user)),
      'newest'
    ),
    [library.templates, user]
  );
  const myLists = useMemo(
    () => [...(library.lists || [])]
      .filter((list) => isOwnedListByUser(list, user))
      .sort((left, right) => {
        const updatedDelta = new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
        if (updatedDelta !== 0) {
          return updatedDelta;
        }
        return Number(right?.playCount || 0) - Number(left?.playCount || 0);
      }),
    [library.lists, user]
  );
  const totalListPages = Math.max(1, Math.ceil(myListStats.totalCount / MANAGE_LISTS_PAGE_SIZE));
  const linkedCountByTemplateId = myListStats.linkedCountByTemplateId || {};

  useEffect(() => {
    let cancelled = false;

    async function loadTemplatePreviewEntities() {
      if (myTemplates.length === 0) {
        setTemplatePreviewEntityMap(new Map());
        return;
      }

      const previewCustomMap = new Map();
      const titleIds = new Set();
      const characterIds = new Set();
      const songIds = new Set();

      myTemplates.forEach((template) => {
        const entityType = normalizeCatalogEntityType(template.entityType);
        const previewIds = [...new Set((template.titleIds || []).map(Number).filter((id) => Number.isFinite(id) && id !== 0))].slice(0, 4);

        previewIds.forEach((id) => {
          if (id < 0) {
            return;
          }
          if (entityType === CHARACTER_ENTITY_TYPE) {
            characterIds.add(id);
            return;
          }
          if (entityType === THEME_SONG_ENTITY_TYPE) {
            songIds.add(id);
            return;
          }
          titleIds.add(id);
        });

        (template.customItems || []).forEach((item) => {
          const normalizedId = Number(item?.id);
          if (!Number.isFinite(normalizedId) || normalizedId === 0) {
            return;
          }
          previewCustomMap.set(normalizedId, toCustomTierEntity(item, entityType));
        });
      });

      try {
        const [previewTitles, previewCharacters, previewSongs] = await Promise.all([
          titleIds.size > 0 ? getTitlePreviewByIds([...titleIds]) : [],
          characterIds.size > 0 ? fetchCharacterEntitiesByIds([...characterIds]) : [],
          songIds.size > 0 ? fetchThemeSongEntitiesByIds([...songIds]) : [],
        ]);

        if (cancelled) {
          return;
        }

        const nextMap = new Map(previewCustomMap);
        previewTitles.forEach((entry) => nextMap.set(Number(entry.id), entry));
        previewCharacters.forEach((entry) => nextMap.set(Number(entry.id), entry));
        previewSongs.forEach((entry) => nextMap.set(Number(entry.id), entry));
        setTemplatePreviewEntityMap(nextMap);
      } catch {
        if (!cancelled) {
          setTemplatePreviewEntityMap(new Map(previewCustomMap));
        }
      }
    }

    loadTemplatePreviewEntities();
    return () => {
      cancelled = true;
    };
  }, [myTemplates, showAdult]);

  const loadFullListForAction = useCallback(async (listId) => {
    const detail = await loadTierListDetail(listId, {
      userId: user?.id || null,
      showAdult,
    });
    if (!detail?.list) {
      throw new Error(pick('ไม่พบลิสต์ที่ต้องการแก้ไข', 'Ranking not found'));
    }
    return detail;
  }, [pick, showAdult, user?.id]);

  const beginEditing = (kind, entry) => {
    setEditingKey(`${kind}:${entry.id}`);
    setDraftTitle(String(entry?.title || ''));
    setDraftDescription(String(entry?.description || ''));
  };

  const stopEditing = () => {
    setEditingKey('');
    setDraftTitle('');
    setDraftDescription('');
  };

  const handleToggleTemplateVisibility = async (template) => {
    const nextTemplate = { ...template, isPublic: !template.isPublic };
    const savingKey = `template:${template.id}`;
    setIsSavingId(savingKey);

    try {
      await saveTierTemplate(nextTemplate, library, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      await refreshLibrary();
      toast.success(
        nextTemplate.isPublic
          ? pick('เผยแพร่เทมเพลตแล้ว', 'Template is now public')
          : pick('ซ่อนเทมเพลตแล้ว', 'Template is now private')
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปเดตสถานะเทมเพลตไม่สำเร็จ', 'Failed to update template visibility'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleSaveTemplateMeta = async (template) => {
    const nextTemplate = {
      ...template,
      title: draftTitle.trim() || template.title,
      description: draftDescription.trim(),
    };
    const savingKey = `template:${template.id}:edit`;
    setIsSavingId(savingKey);

    try {
      await saveTierTemplate(nextTemplate, library, {
        userId: user?.id || null,
        preserveOwnership: true,
      });
      await refreshLibrary();
      stopEditing();
      toast.success(pick('อัปเดตเทมเพลตแล้ว', 'Template updated'));
    } catch (error) {
      toast.error(error?.message || pick('บันทึกเทมเพลตไม่สำเร็จ', 'Failed to save template'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleToggleListVisibility = async (list) => {
    const savingKey = `list:${list.id}`;
    setIsSavingId(savingKey);

    try {
      const detail = await loadFullListForAction(list.id);
      const nextList = { ...detail.list, isPublic: !detail.list.isPublic };
      await saveTierList(nextList, detail.library, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      toast.success(
        nextList.isPublic
          ? pick('เผยแพร่อันดับแล้ว', 'Ranking is now public')
          : pick('ซ่อนอันดับแล้ว', 'Ranking is now private')
      );
    } catch (error) {
      toast.error(error?.message || pick('อัปเดตสถานะลิสต์ไม่สำเร็จ', 'Failed to update list visibility'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleSaveListMeta = async (list) => {
    const savingKey = `list:${list.id}:edit`;
    setIsSavingId(savingKey);

    try {
      const detail = await loadFullListForAction(list.id);
      const nextList = {
        ...detail.list,
        title: draftTitle.trim() || detail.list.title,
        description: draftDescription.trim(),
      };
      await saveTierList(nextList, detail.library, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      stopEditing();
      toast.success(pick('อัปเดตลิสต์แล้ว', 'Ranking updated'));
    } catch (error) {
      toast.error(error?.message || pick('บันทึกลิสต์ไม่สำเร็จ', 'Failed to save ranking'));
    } finally {
      setIsSavingId('');
    }
  };

  const handleDeleteTemplate = async (template) => {
    const linkedCount = Number(linkedCountByTemplateId[String(template.id)] || 0);
    const confirmMessage = linkedCount > 0
      ? pick(
        `ลบเทมเพลต "${template.title}" ใช่ไหม\n\nลิสต์ที่อ้างอิงอยู่ ${linkedCount} รายการจะถูกเก็บไว้ต่อ และเปลี่ยนเป็นลิสต์เดี่ยว`,
        `Delete template "${template.title}"?\n\n${linkedCount} linked rankings will be kept and converted into standalone rankings.`
      )
      : pick(`ลบเทมเพลต "${template.title}" ใช่ไหม`, `Delete template "${template.title}"?`);

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const savingKey = `template:${template.id}:delete`;
    setIsSavingId(savingKey);
    try {
      const fullOwnedLibrary = await loadTierLibrary([], {
        userId: user?.id || null,
        includePublic: false,
        includeOwned: true,
        showAdult,
      });
      await deleteTierTemplate(template.id, {
        templates: fullOwnedLibrary.templates,
        lists: fullOwnedLibrary.lists,
      }, {
        userId: user?.id || null,
      });
      await refreshLibrary();
      if (editingKey === `template:${template.id}`) {
        stopEditing();
      }
      toast.success(
        linkedCount > 0
          ? pick('ลบเทมเพลตแล้ว และแปลงลิสต์ที่อ้างอิงเป็นลิสต์เดี่ยว', 'Template deleted and linked rankings were converted to standalone')
          : pick('ลบเทมเพลตแล้ว', 'Template deleted')
      );
    } catch (error) {
      const message = String(error?.message || '');
      if (message === 'Template is still referenced by rankings that cannot be detached automatically') {
        toast.error(
          pick(
            'ยังลบเทมเพลตไม่ได้ เพราะยังมีลิสต์บางรายการอ้างอิงอยู่และระบบถอดออกให้อัตโนมัติไม่ได้',
            'This template cannot be deleted yet because some rankings still reference it and could not be detached automatically'
          )
        );
      } else {
        toast.error(error?.message || pick('ลบเทมเพลตไม่สำเร็จ', 'Failed to delete template'));
      }
    } finally {
      setIsSavingId('');
    }
  };

  const handleDeleteList = async (list) => {
    console.info('tierlist delete requested', {
      listId: list?.id || '',
      title: list?.title || '',
      userId: user?.id || null,
      libraryListCount: Array.isArray(library?.lists) ? library.lists.length : 0,
    });

    if (!window.confirm(pick(`ลบลิสต์ "${list.title}" ใช่ไหม`, `Delete ranking "${list.title}"?`))) {
      return;
    }

    const savingKey = `list:${list.id}:delete`;
    setIsSavingId(savingKey);
    try {
      await deleteTierList(list.id, library, {
        userId: user?.id || null,
      });
      console.info('tierlist delete remote step resolved', {
        listId: list?.id || '',
      });
      await refreshLibrary();
      console.info('tierlist delete refresh resolved', {
        listId: list?.id || '',
      });
      if (editingKey === `list:${list.id}`) {
        stopEditing();
      }
      toast.success(pick('ลบลิสต์แล้ว', 'Ranking deleted'));
    } catch (error) {
      console.error('tierlist delete failed', {
        listId: list?.id || '',
        title: list?.title || '',
        debug: error?.tierlistDebug || null,
        error,
      });
      toast.error(error?.message || pick('ลบลิสต์ไม่สำเร็จ', 'Failed to delete ranking'));
    } finally {
      setIsSavingId('');
    }
  };

  if (isAuthLoading || (isLoading && !loadError)) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListEmptyPanel
            icon={<Loader2 size={28} className="animate-spin" />}
            title={pick('กำลังโหลดพื้นที่จัดการ', 'Loading your workspace')}
            message={pick('กำลังดึงเทมเพลตและลิสต์ของคุณ', 'Fetching your templates and rankings.')}
          />
        </section>
      </div>
    );
  }

  if (loadError) {
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
      <section className="container tierlist-manage-hero">
        <div className="tierlist-manage-hero-copy">
          <span className="tierlist-kicker"><Monitor size={14} /> {pick('พื้นที่จัดการส่วนตัว', 'Personal Workspace')}</span>
          <h1>{pick('จัดการ Tier List ของฉัน', 'Manage My Tier Lists')}</h1>
          <p>{pick('รวมเทมเพลตและอันดับที่คุณสร้างไว้ทั้งหมดในที่เดียว เปิดแก้ไขต่อหรือสลับ public/private ได้เร็วขึ้น', 'See every template and ranking you created in one place, then jump back in to edit or switch visibility faster.')}</p>
        </div>
        <div className="tierlist-manage-hero-actions">
          <Link className="tierlist-browse-manage-btn" to="/tierlist">
            <ChevronLeft size={14} /> {pick('กลับไปหน้ารวม', 'Back to Browse')}
          </Link>
          <Link className="tierlist-browse-create-btn" to="/tierlist/create">
            <Plus size={14} /> {pick('สร้าง Tier List ใหม่', 'Create New Tier List')}
          </Link>
        </div>
        <div className="tierlist-manage-summary-grid">
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myTemplates.length}</strong>
            <span>{pick('เทมเพลตของฉัน', 'My templates')}</span>
          </article>
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myListStats.totalCount}</strong>
            <span>{pick('ลิสต์ของฉัน', 'My rankings')}</span>
          </article>
          <article className="glass-heavy tierlist-manage-summary-card">
            <strong>{myListStats.publicCount}</strong>
            <span>{pick('ลิสต์สาธารณะ', 'Public rankings')}</span>
          </article>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('เทมเพลตของฉัน', 'My Templates')}</h2>
          <span className="tierlist-count">{myTemplates.length} {pick('รายการ', 'items')}</span>
        </div>

        {myTemplates.length === 0 ? (
          <TierListEmptyPanel
            icon={<Sparkles size={24} />}
            title={pick('ยังไม่มีเทมเพลตของคุณ', 'No templates yet')}
            message={pick('เริ่มจากสร้างเทมเพลตแรก แล้วมันจะมารวมที่หน้านี้อัตโนมัติ', 'Create your first template and it will show up here automatically.')}
            action={(
              <Link className="btn btn-primary btn-sm" to="/tierlist/create">
                {pick('เริ่มสร้าง', 'Start Creating')}
              </Link>
            )}
          />
        ) : (
          <div className="tierlist-manage-grid">
            {myTemplates.map((template) => {
              const savingKey = `template:${template.id}`;
              const linkedCount = Number(linkedCountByTemplateId[String(template.id)] || 0);
              const isEditing = editingKey === `template:${template.id}`;
              const templateCoverFallback = (template.titleIds || [])
                .map((id) => templatePreviewEntityMap.get(Number(id)))
                .find(Boolean) || null;
              const templateCoverArtwork = getTemplatePreviewArtworkSource(template, templateCoverFallback);
              return (
                <article key={template.id} className="glass-heavy tierlist-manage-card">
                  <div
                    className={`tierlist-manage-card-cover${normalizeTemplatePreviewFit(template.previewArtworkFit) === 'contain' ? ' is-contain' : ''}`}
                    style={getTemplatePreviewMediaStyle(template)}
                  >
                    {templateCoverArtwork ? (
                      <img
                        src={templateCoverArtwork}
                        alt=""
                        className="tierlist-manage-card-cover-image"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    ) : (
                      <div className="tierlist-manage-cover-fallback">
                        <Sparkles size={30} />
                      </div>
                    )}
                    <div className="tierlist-manage-cover-badges">
                      <small className="tierlist-chip">{getTierCategoryLabel(template.category, pick)}</small>
                      <span className={`tierlist-manage-visibility${template.isPublic ? ' is-public' : ''}`}>
                        {template.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                        {template.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                      </span>
                    </div>
                  </div>
                  <div className="tierlist-manage-card-body">
                    <h3 className="tierlist-manage-card-title">{template.title}</h3>
                    {!isEditing && (
                      <p className="tierlist-manage-description">
                        {template.description || pick('ยังไม่ได้ใส่คำอธิบาย', 'No description yet.')}
                      </p>
                    )}
                    {!isEditing && (
                      <div className="tierlist-manage-meta">
                        <span>{getEntityTypeLabel(template.entityType, pick)}</span>
                        <span>{template.titleIds.length} {pick('รายการ', 'items')}</span>
                        {Number(template.plays || 0) > 0 && <span>{Number(template.plays)} {pick('ครั้งเล่น', 'plays')}</span>}
                        {linkedCount > 0 && <span>{linkedCount} {pick('ลิสต์ที่ผูก', 'linked')}</span>}
                        <span>{formatTierDate(template.updatedAt, locale)}</span>
                      </div>
                    )}
                    {isEditing && (
                      <div className="tierlist-manage-edit-form">
                        <label className="tierlist-field">
                          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
                          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                        </label>
                        <label className="tierlist-field">
                          <span>{pick('คำอธิบาย', 'Description')}</span>
                          <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                        </label>
                      </div>
                    )}
                    <div className="tierlist-manage-actions">
                      <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/template/${template.id}`}>
                        {pick('เปิดเทมเพลต', 'Open')}
                      </Link>
                      {isEditing ? (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="primary"
                            className="tierlist-manage-action-primary"
                            onClick={() => handleSaveTemplateMeta(template)}
                            disabled={isSavingId === `template:${template.id}:edit`}
                          >
                            {isSavingId === `template:${template.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={stopEditing}>
                            {pick('ยกเลิก', 'Cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={pick('แก้ไขชื่อและคำอธิบาย', 'Edit name & description')}
                            onClick={() => beginEditing('template', template)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={template.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                            onClick={() => handleToggleTemplateVisibility(template)}
                            disabled={isSavingId === savingKey}
                          >
                            {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (template.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="tierlist-manage-icon-danger"
                            title={linkedCount > 0 ? pick('ลบแล้วลิสต์ที่ผูกจะเปลี่ยนเป็นลิสต์เดี่ยว', 'Deleting converts linked rankings to standalone') : pick('ลบเทมเพลต', 'Delete template')}
                            onClick={() => handleDeleteTemplate(template)}
                            disabled={isSavingId === `template:${template.id}:delete`}
                          >
                            {isSavingId === `template:${template.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('ลิสต์ของฉัน', 'My Rankings')}</h2>
          <span className="tierlist-count">{myListStats.totalCount} {pick('รายการ', 'items')}</span>
        </div>

        {myListStats.totalCount === 0 ? (
          <TierListEmptyPanel
            icon={<Layers size={24} />}
            title={pick('ยังไม่มีลิสต์ของคุณ', 'No rankings yet')}
            message={pick('เล่นจากเทมเพลตสักอันก่อน แล้วลิสต์ของคุณจะกลับมาจัดการต่อได้จากหน้านี้', 'Play a template first and your rankings will be collected here for quick editing later.')}
            action={(
              <Link className="btn btn-primary btn-sm" to="/tierlist">
                {pick('ไปเลือกเทมเพลต', 'Browse Templates')}
              </Link>
            )}
          />
        ) : (
          <div className="tierlist-manage-grid">
            {myLists.map((list) => {
              const savingKey = `list:${list.id}`;
              const sourceTemplate = list.templateId ? findTierTemplate(list.templateId, library) : null;
              const isEditing = editingKey === `list:${list.id}`;
              const previewRows = list.rows.slice(0, 5);
              const maxItems = Math.max(1, ...previewRows.map((r) => r.titleIds.length));
              return (
                <article key={list.id} className="glass-heavy tierlist-manage-card">
                  <div className="tierlist-manage-tier-preview">
                    {previewRows.length > 0 ? previewRows.map((row) => {
                      const barPct = Math.max(4, (row.titleIds.length / maxItems) * 100);
                      return (
                        <div key={row.id} className="tierlist-manage-tier-row" style={row.color ? { '--row-c': row.color } : undefined}>
                          <span className="tierlist-manage-tier-tag">{row.label}</span>
                          <div className="tierlist-manage-tier-bar-wrap">
                            <div className="tierlist-manage-tier-bar" style={{ width: row.titleIds.length > 0 ? `${barPct}%` : '0%' }} />
                          </div>
                          <span className="tierlist-manage-tier-n">{row.titleIds.length}</span>
                        </div>
                      );
                    }) : (
                      <div className="tierlist-manage-tier-empty">
                        <Layers size={18} />
                        <span>{pick('ยังไม่มี tier', 'No tiers yet')}</span>
                      </div>
                    )}
                  </div>
                  <div className="tierlist-manage-card-body">
                    <div className="tierlist-manage-card-head">
                      <small className="tierlist-chip">
                        {sourceTemplate ? pick('จากเทมเพลต', 'From template') : pick('ลิสต์เดี่ยว', 'Standalone')}
                      </small>
                      <span className={`tierlist-manage-visibility${list.isPublic ? ' is-public' : ''}`}>
                        {list.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
                        {list.isPublic ? pick('สาธารณะ', 'Public') : pick('ส่วนตัว', 'Private')}
                      </span>
                    </div>
                    <h3 className="tierlist-manage-card-title">{list.title}</h3>
                    {!isEditing && (
                      <div className="tierlist-manage-meta">
                        <span>{list.rows.length} {pick('tier', 'tiers')}</span>
                        {Number(list.playCount || 0) > 0 && <span>{Number(list.playCount)} {pick('ครั้งเล่น', 'plays')}</span>}
                        <span>{formatTierDate(list.updatedAt, locale)}</span>
                      </div>
                    )}
                    {isEditing && (
                      <div className="tierlist-manage-edit-form">
                        <label className="tierlist-field">
                          <span>{pick('ชื่อลิสต์', 'Ranking name')}</span>
                          <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                        </label>
                        <label className="tierlist-field">
                          <span>{pick('คำอธิบาย', 'Description')}</span>
                          <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} />
                        </label>
                      </div>
                    )}
                    <div className="tierlist-manage-actions">
                      <Link className="btn btn-primary btn-sm tierlist-manage-action-primary" to={`/tierlist/play/${list.id}`}>
                        {pick('เปิดแก้ไข', 'Open')}
                      </Link>
                      {isEditing ? (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="primary"
                            className="tierlist-manage-action-primary"
                            onClick={() => handleSaveListMeta(list)}
                            disabled={isSavingId === `list:${list.id}:edit`}
                          >
                            {isSavingId === `list:${list.id}:edit` ? pick('บันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={stopEditing}>
                            {pick('ยกเลิก', 'Cancel')}
                          </Button>
                        </div>
                      ) : (
                        <div className="tierlist-manage-action-icons">
                          <Button
                            size="sm"
                            variant="ghost"
                            title={pick('แก้ไขชื่อ', 'Edit name')}
                            onClick={() => beginEditing('list', list)}
                          >
                            <Pencil size={14} />
                          </Button>
                          {sourceTemplate && (
                            <Link
                              className="btn btn-ghost btn-sm"
                              to={`/tierlist/template/${sourceTemplate.id}`}
                              title={pick('ดูเทมเพลตต้นทาง', 'View source template')}
                            >
                              <ArrowRight size={14} />
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title={list.isPublic ? pick('ทำเป็นส่วนตัว', 'Make Private') : pick('เผยแพร่', 'Publish')}
                            onClick={() => handleToggleListVisibility(list)}
                            disabled={isSavingId === savingKey}
                          >
                            {isSavingId === savingKey ? <Loader2 size={14} className="animate-spin" /> : (list.isPublic ? <EyeOff size={14} /> : <Eye size={14} />)}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="tierlist-manage-icon-danger"
                            title={pick('ลบลิสต์', 'Delete ranking')}
                            onClick={() => handleDeleteList(list)}
                            disabled={isSavingId === `list:${list.id}:delete`}
                          >
                            {isSavingId === `list:${list.id}:delete` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {myListStats.totalCount > MANAGE_LISTS_PAGE_SIZE ? (
          <div className="tierlist-pagination">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft size={14} />}
              disabled={listPage <= 1}
              onClick={() => setListPage((current) => Math.max(1, current - 1))}
            >
              {pick('ก่อนหน้า', 'Previous')}
            </Button>
            <span>{listPage} / {totalListPages}</span>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={14} />}
              disabled={listPage >= totalListPages}
              onClick={() => setListPage((current) => Math.min(totalListPages, current + 1))}
            >
              {pick('ถัดไป', 'Next')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default TierListManagePage;
