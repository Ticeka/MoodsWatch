import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getTitlePreviewByIds } from '@/features/discover/lib/recommend';
import {
  TierListEmptyPanel,
  TierListErrorPanel,
  TierListManageHero,
  TierListManageRankingsSection,
  TierListManageTemplatesSection,
} from '@/features/tierlist/components';
import { MANAGE_LISTS_PAGE_SIZE } from '@/features/tierlist/constants';
import { deleteTierList, deleteTierTemplate, loadTierListDetail, loadTierLibrary, loadOwnedTierListStats, loadOwnedTierListsPage, loadTierTemplates, saveTierList, saveTierTemplate } from '@/features/tierlist/lib/tierlistStore';
import { fetchCharacterEntitiesByIds, fetchThemeSongEntitiesByIds, toCustomTierEntity } from '@/features/tierlist/lib/tierlistBrowseHelpers';
import { isOwnedListByUser, isOwnedTemplateByUser, sortTemplates } from '@/features/tierlist/lib/tierlistPageUtils';
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
      <TierListManageHero
        myListStats={myListStats}
        myTemplatesCount={myTemplates.length}
        pick={pick}
      />

      <TierListManageTemplatesSection
        draftDescription={draftDescription}
        draftTitle={draftTitle}
        editingKey={editingKey}
        isSavingId={isSavingId}
        linkedCountByTemplateId={linkedCountByTemplateId}
        locale={locale}
        myTemplates={myTemplates}
        onBeginEditing={beginEditing}
        onDeleteTemplate={handleDeleteTemplate}
        onDraftDescriptionChange={setDraftDescription}
        onDraftTitleChange={setDraftTitle}
        onSaveTemplateMeta={handleSaveTemplateMeta}
        onStopEditing={stopEditing}
        onToggleTemplateVisibility={handleToggleTemplateVisibility}
        pick={pick}
        templatePreviewEntityMap={templatePreviewEntityMap}
      />

      <TierListManageRankingsSection
        draftDescription={draftDescription}
        draftTitle={draftTitle}
        editingKey={editingKey}
        isSavingId={isSavingId}
        library={library}
        listPage={listPage}
        locale={locale}
        managePageSize={MANAGE_LISTS_PAGE_SIZE}
        myListStats={myListStats}
        myLists={myLists}
        onBeginEditing={beginEditing}
        onDeleteList={handleDeleteList}
        onDraftDescriptionChange={setDraftDescription}
        onDraftTitleChange={setDraftTitle}
        onNextPage={() => setListPage((current) => Math.min(totalListPages, current + 1))}
        onPreviousPage={() => setListPage((current) => Math.max(1, current - 1))}
        onSaveListMeta={handleSaveListMeta}
        onStopEditing={stopEditing}
        onToggleListVisibility={handleToggleListVisibility}
        pick={pick}
        totalListPages={totalListPages}
      />
    </div>
  );
}

export default TierListManagePage;
