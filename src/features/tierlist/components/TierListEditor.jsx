import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Download,
  GripVertical,
  Layers,
  Monitor,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { TierListArtworkImage as ArtworkImage } from '@/features/tierlist/components/TierListArtworkImage';
import { TierTitleCard } from '@/features/tierlist/components/TierTitleCard';
import { TIER_COLORS } from '@/features/tierlist/constants';
import {
  addTierRow,
  findTierList,
  moveTitle,
  moveTierRow,
  removeTierRow,
  saveTierList,
} from '@/features/tierlist/lib/tierlistStore';
import {
  getThemeSongSummary,
  getTierRowFallbackLabel,
} from '@/features/tierlist/lib/tierlistLabels';
import { loadExportImage } from '@/features/tierlist/lib/tierlistExportUtils';
import { Button } from '@/shared/components/ui/Button';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import { BRAND_NAME } from '@/shared/config/brand';
import {
  THEME_SONG_ENTITY_TYPE,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';

export function TierListEditor({ tierList, setTierList, titleById, query, setQuery, pick, readOnly = false }) {
  const { user } = useAuth();
  const [saveState, setSaveState] = useState('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [highlightPool, setHighlightPool] = useState(false);
  const [isPoolPinned, setIsPoolPinned] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [rowDragState, setRowDragState] = useState(null);
  const [rowDragTarget, setRowDragTarget] = useState(null);
  const [activeSong, setActiveSong] = useState(null);
  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const boardRef = useRef(null);
  const dragStateRef = useRef(null);
  const rowDragStateRef = useRef(null);
  const sampleEntity = titleById.values().next().value;
  const isSongTierList = normalizeCatalogEntityType(tierList?.entityType) === THEME_SONG_ENTITY_TYPE || isThemeSongEntity(sampleEntity);
  const normalizedPoolQuery = useMemo(() => String(query || '').trim().toLowerCase(), [query]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    rowDragStateRef.current = rowDragState;
  }, [rowDragState]);

  useEffect(() => {
    if (!isSongTierList) {
      setActiveSong(null);
      setIsSongModalOpen(false);
      return;
    }

    const activeSongId = Number(activeSong?.id);
    if (activeSongId && titleById.has(activeSongId)) {
      return;
    }

    const firstSongId = [...tierList.rows.flatMap((row) => row.titleIds), ...tierList.poolTitleIds]
      .map(Number)
      .find((id) => titleById.has(id));

    setActiveSong(firstSongId ? titleById.get(firstSongId) : null);
  }, [activeSong?.id, isSongTierList, tierList.poolTitleIds, tierList.rows, titleById]);

  const beginPointerDrag = (event, payload) => {
    if (readOnly) {
      return;
    }
    const tile = event.currentTarget;
    const rect = tile.getBoundingClientRect();

    event.preventDefault();

    setDragState({
      ...payload,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    setDragTarget(null);
    setHighlightPool(false);
  };

  const beginRowPointerDrag = (event, payload) => {
    if (readOnly) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setRowDragState({
      ...payload,
      y: event.clientY,
    });
    setRowDragTarget(payload.index);
  };

  const autoScrollDuringDrag = useEffectEvent((clientY, eventTarget = null) => {
    const viewportEdge = 88;
    const poolRail = eventTarget instanceof HTMLElement ? eventTarget.closest('.tiermaker-pool-rail') : null;

    if (poolRail instanceof HTMLElement) {
      const railRect = poolRail.getBoundingClientRect();
      if (clientY < railRect.top + 56) {
        poolRail.scrollTop -= 18;
      } else if (clientY > railRect.bottom - 56) {
        poolRail.scrollTop += 18;
      }
      return;
    }

    if (clientY < viewportEdge) {
      window.scrollBy({ top: -18, behavior: 'instant' });
    } else if (clientY > window.innerHeight - viewportEdge) {
      window.scrollBy({ top: 18, behavior: 'instant' });
    }
  });

  const resolveInsertIndex = (dropzone, clientX) => {
    const tiles = Array.from(dropzone.querySelectorAll('.tiermaker-tile[data-tier-tile="true"]'));
    for (let index = 0; index < tiles.length; index += 1) {
      const rect = tiles[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
    }
    return tiles.length;
  };

  const resolveDragTarget = useEffectEvent((clientX, clientY) => {
    const hovered = document.elementFromPoint(clientX, clientY);
    if (!(hovered instanceof HTMLElement)) {
      return null;
    }

    const slot = hovered.closest('.tiermaker-insert-slot[data-row-id]');
    if (slot instanceof HTMLElement) {
      return {
        type: 'row',
        rowId: slot.dataset.rowId || '',
        insertIndex: Number(slot.dataset.insertIndex || 0),
      };
    }

    const row = hovered.closest('.tiermaker-row[data-row-id]');
    if (row instanceof HTMLElement) {
      const rowId = row.dataset.rowId || '';
      const dropzone = row.querySelector('.tiermaker-dropzone');
      return {
        type: 'row',
        rowId,
        insertIndex: dropzone instanceof HTMLElement ? resolveInsertIndex(dropzone, clientX) : null,
      };
    }

    const pool = hovered.closest('.tiermaker-pool[data-drop-pool="true"], .tiermaker-pool-rail');
    if (pool instanceof HTMLElement) {
      return { type: 'pool' };
    }

    return null;
  });

  const resolveRowDragTarget = useEffectEvent((clientY) => {
    const rows = Array.from(document.querySelectorAll('.tiermaker-row[data-row-id]'));
    if (rows.length === 0) {
      return null;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!(row instanceof HTMLElement)) {
        continue;
      }
      const rect = row.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        return index;
      }
    }

    return rows.length;
  });

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      event.preventDefault();
      autoScrollDuringDrag(event.clientY, event.target);
      setDragState((current) => (
        current
          ? {
            ...current,
            x: event.clientX,
            y: event.clientY,
          }
          : current
      ));
      setDragTarget(resolveDragTarget(event.clientX, event.clientY));
    };

    const finishDrag = (event) => {
      const current = dragStateRef.current;
      const target = resolveDragTarget(event.clientX, event.clientY);

      if (current && !readOnly && target?.type === 'row' && target.rowId) {
        setTierList((existing) => moveTitle(
          existing,
          current.titleId,
          current.fromRowId,
          target.rowId,
          target.insertIndex
        ));
        setSaveState('idle');
        setSaveMessage('');
      } else if (current && !readOnly && target?.type === 'pool') {
        setTierList((existing) => moveTitle(existing, current.titleId, current.fromRowId, ''));
        setSaveState('idle');
        setSaveMessage('');
        setHighlightPool(true);
      }

      setDragState(null);
      setDragTarget(null);
    };

    const cancelDrag = () => {
      setDragState(null);
      setDragTarget(null);
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', cancelDrag);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', cancelDrag);
    };
  }, [dragState, readOnly, setTierList]);

  useEffect(() => {
    if (!rowDragState) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      event.preventDefault();
      autoScrollDuringDrag(event.clientY, event.target);
      setRowDragState((current) => (
        current
          ? {
            ...current,
            y: event.clientY,
          }
          : current
      ));
      setRowDragTarget(resolveRowDragTarget(event.clientY));
    };

    const finishRowDrag = (event) => {
      const current = rowDragStateRef.current;
      const targetIndex = resolveRowDragTarget(event.clientY);

      if (current && !readOnly && targetIndex != null) {
        setTierList((existing) => moveTierRow(existing, current.rowId, targetIndex));
        setSaveState('idle');
        setSaveMessage('');
      }

      setRowDragState(null);
      setRowDragTarget(null);
    };

    const cancelRowDrag = () => {
      setRowDragState(null);
      setRowDragTarget(null);
    };

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishRowDrag);
    window.addEventListener('pointercancel', cancelRowDrag);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishRowDrag);
      window.removeEventListener('pointercancel', cancelRowDrag);
    };
  }, [readOnly, rowDragState, setTierList]);

  const filteredPoolIds = useMemo(() => {
    if (!normalizedPoolQuery) return tierList.poolTitleIds;

    return tierList.poolTitleIds.filter((titleId) => {
      const title = titleById.get(Number(titleId));
      if (!title) return false;
      const haystack = [title.title_th, title.title_en, title.title_native, title.sourceTitleName, title.slug]
        .map((entry) => String(entry || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedPoolQuery);
    });
  }, [normalizedPoolQuery, tierList.poolTitleIds, titleById]);

  const visiblePoolEntities = useMemo(
    () => filteredPoolIds
      .map((id) => titleById.get(Number(id)))
      .filter(Boolean),
    [filteredPoolIds, titleById]
  );

  const persist = async (nextTierList) => {
    setIsSaving(true);
    setSaveState('idle');

    try {
      const savedLibrary = await saveTierList(nextTierList, null, { userId: user?.id || null });
      const savedList = findTierList(nextTierList.id, savedLibrary) || savedLibrary.lists[0] || nextTierList;
      setTierList(savedList);
      setSaveState('success');
      setSaveMessage(pick('บันทึกล่าสุดเรียบร้อยแล้ว', 'Latest changes are saved'));
      toast.success(pick('บันทึกแล้ว', 'Saved'));
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (saveState !== 'success') {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setSaveState('idle');
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [saveState]);

  useEffect(() => {
    if (!highlightPool) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setHighlightPool(false);
    }, 550);

    return () => window.clearTimeout(timeout);
  }, [highlightPool]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth > 768) {
        setIsToolbarCollapsed(false);
        setIsToolbarExpanded(true);
        setIsMobileViewport(false);
        return;
      }
      setIsMobileViewport(true);
      const collapsed = window.scrollY > 180;
      setIsToolbarCollapsed(collapsed);
      if (!collapsed) {
        setIsToolbarExpanded(true);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const resetRows = () => {
    if (readOnly) return;
    setTierList((current) => {
      const movedBack = current.rows.flatMap((row) => row.titleIds);
      const poolSet = new Set([...current.poolTitleIds, ...movedBack]);
      return {
        ...current,
        rows: current.rows.map((row) => ({ ...row, titleIds: [] })),
        poolTitleIds: Array.from(poolSet),
      };
    });
    setSaveState('idle');
    setSaveMessage('');
  };

  const resetRow = (rowId) => {
    if (readOnly) return;
    setTierList((current) => {
      const target = current.rows.find((row) => row.id === rowId);
      if (!target || target.titleIds.length === 0) return current;

      const poolSet = new Set([...current.poolTitleIds, ...target.titleIds]);
      return {
        ...current,
        rows: current.rows.map((row) => (row.id === rowId ? { ...row, titleIds: [] } : row)),
        poolTitleIds: Array.from(poolSet),
      };
    });
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const labelWidth = 108;
      const tileSize = 74;
      const rowGap = 4;
      const boardPadding = 18;
      const titleBarHeight = 54;
      const longestRow = Math.max(1, ...tierList.rows.map((row) => row.titleIds.length));
      const canvas = document.createElement('canvas');
      const width = boardPadding * 2 + labelWidth + longestRow * tileSize;
      const height = boardPadding * 2 + titleBarHeight + tierList.rows.length * (tileSize + rowGap) - rowGap;

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas unavailable');
      }

      context.fillStyle = '#111111';
      context.fillRect(0, 0, width, height);

      context.fillStyle = '#1b1b1b';
      context.fillRect(boardPadding, boardPadding, width - boardPadding * 2, titleBarHeight);
      context.fillStyle = '#ffffff';
      context.font = '700 22px Arial';
      context.fillText(tierList.title || 'Tier List', boardPadding + 14, boardPadding + 32);
      context.fillStyle = 'rgba(255,255,255,0.72)';
      context.font = '14px Arial';
      context.fillText(pick(`จัดอันดับด้วย ${BRAND_NAME} Tier List`, `Ranked with ${BRAND_NAME} Tier List`), boardPadding + 14, boardPadding + 47);

      const imageEntries = await Promise.all(
        tierList.rows.flatMap((row) => row.titleIds).map(async (titleId) => {
          const title = titleById.get(Number(titleId));
          if (!title) {
            return [titleId, null];
          }
          const image = await loadExportImage(getTitleArtwork(title));
          return [titleId, image];
        })
      );
      const imageByTitleId = new Map(imageEntries);

      tierList.rows.forEach((row, rowIndex) => {
        const top = boardPadding + titleBarHeight + 12 + rowIndex * (tileSize + rowGap);
        const labelColor = row.color || TIER_COLORS[rowIndex % TIER_COLORS.length];

        context.fillStyle = labelColor;
        context.fillRect(boardPadding, top, labelWidth, tileSize);

        context.fillStyle = 'rgba(17,17,17,0.88)';
        context.font = '700 30px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(row.label || getTierRowFallbackLabel(rowIndex, pick), boardPadding + labelWidth / 2, top + tileSize / 2);

        context.fillStyle = '#222222';
        context.fillRect(boardPadding + labelWidth, top, width - boardPadding * 2 - labelWidth, tileSize);

        row.titleIds.forEach((titleId, titleIndex) => {
          const image = imageByTitleId.get(titleId);
          const tileLeft = boardPadding + labelWidth + titleIndex * tileSize;
          context.fillStyle = '#2e2e2e';
          context.fillRect(tileLeft, top, tileSize, tileSize);

          if (image) {
            context.drawImage(image, tileLeft, top, tileSize, tileSize);
          } else {
            context.fillStyle = 'rgba(255,255,255,0.16)';
            context.fillRect(tileLeft + 4, top + 4, tileSize - 8, tileSize - 8);
          }
        });
      });

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        toast.error(pick('ส่งออกไม่สำเร็จ', 'Export failed'));
        return;
      }

      const link = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `${(tierList.title || 'tier-list').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(pick('ดาวน์โหลดรูปภาพแล้ว', 'Image downloaded'));
    } catch {
      toast.error(pick('ส่งออกไม่สำเร็จ', 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const cycleRowColor = (rowId, currentColor, fallbackIndex) => {
    if (readOnly) return;
    const baseColor = currentColor || TIER_COLORS[fallbackIndex % TIER_COLORS.length];
    const colorIndex = TIER_COLORS.indexOf(baseColor);
    const nextColor = TIER_COLORS[(colorIndex + 1) % TIER_COLORS.length];

    setTierList((current) => ({
      ...current,
      rows: current.rows.map((row) => (
        row.id === rowId ? { ...row, color: nextColor } : row
      )),
    }));
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleAddRow = () => {
    if (readOnly) return;
    setTierList((current) => addTierRow(current));
    setSaveState('idle');
    setSaveMessage('');
  };

  const handleSave = () => {
    if (readOnly) return;
    persist(tierList);
  };
  const handleTogglePin = () => setIsPoolPinned((current) => !current);
  const handleTogglePresentation = () => setIsPresentationMode((current) => !current);
  const handlePreviewSong = (song) => {
    setActiveSong(song);

    if (!song?.video_url) {
      toast.error(pick('เพลงนี้ยังไม่มีตัวอย่างให้เปิด', 'This song does not have a playable preview yet'));
      return;
    }

    setIsSongModalOpen(true);
  };

  const toolbarCompact = isMobileViewport && isToolbarCollapsed && !isToolbarExpanded;

  const statusClass = saveState === 'success' ? 'is-success' : saveState === 'error' ? 'is-error' : '';
  const dragOverRowId = dragTarget?.type === 'row' ? dragTarget.rowId : null;
  const isDragOverPool = dragTarget?.type === 'pool';
  const dragPreviewTitle = dragState ? titleById.get(Number(dragState.titleId)) : null;
  const rowDragInsertIndex = rowDragState ? rowDragTarget : null;
  const activeSongSummary = getThemeSongSummary(activeSong);

  return (
    <section className={`container tiermaker-editor ${isPresentationMode ? 'is-presentation' : ''} ${dragState ? 'is-pointer-dragging' : ''} ${readOnly ? 'is-readonly' : ''}`}>

      {/* Sticky toolbar */}
      <section className={[
        'tiermaker-toolbar glass-heavy',
        toolbarCompact ? 'is-collapsed' : '',
        isSaving ? 'is-saving' : '',
        saveState === 'success' ? 'is-saved' : '',
      ].filter(Boolean).join(' ')}>

        {/* Mobile: toggle button */}
        <div className="tiermaker-toolbar-compact-toggle">
          <Button variant="ghost" size="sm" onClick={() => setIsToolbarExpanded((c) => !c)}>
            {toolbarCompact ? pick('แสดงตัวควบคุม', 'Show Controls') : pick('ซ่อนตัวควบคุม', 'Hide Controls')}
          </Button>
        </div>

        {/* Tier list name */}
        <div className="tiermaker-toolbar-title">
          <input
            type="text"
            value={tierList.title}
            placeholder={pick('ชื่อ Tier List', 'Tier list name')}
            readOnly={readOnly}
            onChange={(event) => {
              if (readOnly) return;
              setTierList((current) => ({ ...current, title: event.target.value }));
              setSaveState('idle');
              setSaveMessage('');
            }}
          />
        </div>

        {/* Search pool */}
        <div className="tiermaker-toolbar-search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={pick('ค้นหาในพูล...', 'Search pool...')}
            aria-label={pick('ค้นหาในพูล', 'Search pool')}
          />
          {query ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQuery('')}
              aria-label={pick('ล้างการค้นหาในพูล', 'Clear pool search')}
              title={pick('ล้างการค้นหา', 'Clear search')}
            >
              <X size={14} />
            </Button>
          ) : null}
        </div>

        <div className="tiermaker-toolbar-sep" />

        {/* Action buttons */}
        <div className="tiermaker-toolbar-actions" role="group" aria-label={pick('การกระทำของตัวแก้ไข Tier List', 'Tier list editor actions')}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={resetRows}
            disabled={isSaving || readOnly}
            title={pick('รีเซ็ตทุกแถว', 'Reset all rows')}
          >
            {pick('รีเซ็ต', 'Reset')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddRow}
            disabled={readOnly}
            title={pick('เพิ่มแถว', 'Add row')}
          >
            {pick('แถว', 'Row')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownload}
            disabled={isExporting}
            title={pick('ดาวน์โหลดรูปภาพ', 'Download image')}
          >
            {isExporting ? '...' : pick('IMG', 'IMG')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Layers size={14} />}
            onClick={handleTogglePin}
            title={isPoolPinned ? pick('เลิกปักหมุดพูล', 'Unpin pool') : pick('ปักหมุดพูล', 'Pin pool')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Monitor size={14} />}
            onClick={handleTogglePresentation}
            title={isPresentationMode ? pick('ออกจากโหมดพรีเซนต์', 'Exit presentation') : pick('โหมดพรีเซนต์', 'Presentation mode')}
          />
        </div>

        {saveState !== 'idle' && (
          <span className={`tiermaker-toolbar-status ${statusClass}`}>
            {saveState === 'success'
              ? saveMessage || pick('บันทึกแล้ว', 'Saved')
              : saveMessage || pick('บันทึกไม่สำเร็จ', 'Save failed')}
          </span>
        )}
      </section>

      {!readOnly ? (
        <section className={`tiermaker-savebar glass-heavy ${isSaving ? 'is-saving' : ''} ${statusClass}`}>
          <div className="tiermaker-savebar-copy">
            <strong>{pick('บันทึกเมื่อจัดเสร็จแล้ว', 'Save when you finish arranging')}</strong>
            <span>
              {saveState === 'success'
                ? saveMessage || pick('บันทึกล่าสุดเรียบร้อยแล้ว', 'Latest changes are saved')
                : saveState === 'error'
                  ? saveMessage || pick('บันทึกไม่สำเร็จ ลองอีกครั้งได้เลย', 'Save failed. Please try again.')
                  : pick('การลากจัดอันดับจะยังไม่ถูกบันทึกจนกว่าจะกดปุ่มนี้', 'Your ranking changes will not be saved until you press this button.')}
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึกการจัดอันดับ', 'Save Ranking')}
          </Button>
        </section>
      ) : null}

      {/* Board */}
      {isSongTierList ? (
        <section className="tiermaker-song-preview glass-heavy" aria-label={pick('ตัวอย่างเพลงที่เลือก', 'Selected song preview')}>
          <div className="tiermaker-song-preview-copy">
            <small className="tierlist-chip">{pick('โหมดจัดอันดับเพลง', 'Song tierlist mode')}</small>
            <strong>{activeSong?.song_title || activeSong?.title_en || pick('เลือกเพลงจากการ์ดด้านล่าง', 'Pick a song tile to preview')}</strong>
            <p>
              {activeSong
                ? activeSongSummary.join(' • ')
                : pick('กดปุ่มเล่นบนการ์ดเพลงเพื่อฟังระหว่างจัด tier ได้ทันที', 'Use the play button on any song card to listen while ranking.')}
            </p>
          </div>
          <div className="tiermaker-song-preview-actions">
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={14} />}
              onClick={() => {
                if (!activeSong?.video_url) {
                  toast.error(pick('เพลงนี้ยังไม่มีตัวอย่างให้เปิด', 'This song does not have a playable preview yet'));
                  return;
                }
                setIsSongModalOpen(true);
              }}
              disabled={!activeSong?.video_url}
            >
              {pick('เปิดเพลง', 'Play song')}
            </Button>
            <span className="tiermaker-song-preview-hint">
              {pick('เพิ่ม tier ได้จากปุ่มด้านบน แล้วลากเพลงลงแต่ละช่องได้เลย', 'Create tiers from the toolbar, then drag songs into each slot.')}
            </span>
          </div>
        </section>
      ) : null}
      <div className="tiermaker-export-board">
        <div className="tiermaker-export-head">
          <strong>{tierList.title}</strong>
          <span>{pick(`จัดอันดับด้วย ${BRAND_NAME} Tier List`, `Ranked with ${BRAND_NAME} Tier List`)}</span>
        </div>
        <div className="tiermaker-board" ref={boardRef}>
          {tierList.rows.map((row, index) => (
            <article
              key={row.id}
              data-row-id={row.id}
              className={[
                'tiermaker-row',
                row.titleIds.length === 0 ? 'is-empty' : 'has-items',
                dragOverRowId === row.id ? 'is-drag-over' : '',
                rowDragState?.rowId === row.id ? 'is-row-dragging' : '',
                rowDragInsertIndex === index ? 'is-row-insert-before' : '',
                rowDragInsertIndex === index + 1 ? 'is-row-insert-after' : '',
              ].filter(Boolean).join(' ')}
            >
              {/* Colored label */}
              <div
                className="tiermaker-label"
                style={{ background: row.color || TIER_COLORS[index % TIER_COLORS.length] }}
              >
                {!readOnly ? (
                  <button
                    type="button"
                    className="tiermaker-row-handle"
                    onPointerDown={(event) => beginRowPointerDrag(event, { rowId: row.id, index })}
                    aria-label={pick('ลากเพื่อจัดลำดับแถว Tier', 'Drag to reorder tier row')}
                    title={pick('ลากเพื่อจัดลำดับแถว Tier', 'Drag to reorder tier row')}
                  >
                    <GripVertical size={14} />
                  </button>
                ) : null}
                <input
                  type="text"
                  aria-label={pick('ป้ายชื่อ Tier', 'Tier label')}
                  value={row.label}
                  readOnly={readOnly}
                  onChange={(event) => {
                    if (readOnly) return;
                    const nextLabel = event.target.value;
                    setTierList((current) => ({
                      ...current,
                      rows: current.rows.map((entry) => (
                        entry.id === row.id ? { ...entry, label: nextLabel } : entry
                      )),
                    }));
                    setSaveState('idle');
                    setSaveMessage('');
                  }}
                />
              </div>
              {/* Actions revealed on row hover; floats outside the label */}
              <div className="tiermaker-label-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Palette size={12} />}
                  onClick={() => cycleRowColor(row.id, row.color, index)}
                  disabled={readOnly}
                  title={pick('เปลี่ยนสี', 'Change color')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={12} />}
                  onClick={() => resetRow(row.id)}
                  disabled={readOnly || row.titleIds.length === 0}
                  title={pick('ล้างแถว', 'Clear row')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={12} />}
                  onClick={() => {
                    if (readOnly) return;
                    setTierList((current) => removeTierRow(current, row.id));
                    setSaveState('idle');
                    setSaveMessage('');
                  }}
                  disabled={readOnly || tierList.rows.length <= 1}
                  title={pick('ลบแถว', 'Remove row')}
                />
              </div>

              {/* Drop zone */}
              <div className={`tiermaker-dropzone ${row.titleIds.length === 0 ? 'is-empty' : ''}`}>
                {row.titleIds.length === 0
                  ? <span className="tierlist-empty-row">{pick('วางตรงนี้', 'Drop here')}</span>
                  : row.titleIds
                    .map((id) => titleById.get(Number(id)))
                    .filter(Boolean)
                    .flatMap((title, titleIndex, arr) => {
                      const nodes = [
                        <button
                          key={`slot-${row.id}-${title.id}-${titleIndex}`}
                          className={`tiermaker-insert-slot${dragTarget?.type === 'row' && dragTarget.rowId === row.id && dragTarget.insertIndex === titleIndex ? ' is-active' : ''}`}
                          type="button"
                          data-row-id={row.id}
                          data-insert-index={titleIndex}
                          aria-label={pick('แทรกตรงนี้', 'Insert here')}
                        />,
                        <TierTitleCard
                          key={title.id}
                          title={title}
                          fromRowId={row.id}
                          fromIndex={titleIndex}
                          isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === row.id && dragState?.fromIndex === titleIndex}
                          onPointerDragStart={readOnly ? null : beginPointerDrag}
                          onPreviewSong={isSongTierList ? handlePreviewSong : null}
                        />,
                      ];
                      if (titleIndex === arr.length - 1) {
                        nodes.push(
                          <button
                            key={`slot-end-${row.id}`}
                            className={`tiermaker-insert-slot${dragTarget?.type === 'row' && dragTarget.rowId === row.id && dragTarget.insertIndex === arr.length ? ' is-active' : ''}`}
                            type="button"
                            data-row-id={row.id}
                            data-insert-index={arr.length}
                            aria-label={pick('แทรกท้ายแถว', 'Insert at end')}
                          />
                        );
                      }
                      return nodes;
                    })}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Image pool */}
      <aside
        data-drop-pool="true"
        className={[
          'tiermaker-pool glass-heavy',
          isPoolPinned ? 'is-pinned' : '',
          highlightPool ? 'is-highlighted' : '',
          isDragOverPool ? 'is-drag-over' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="tiermaker-pool-head">
          <h2><Layers size={13} /> {isSongTierList ? pick('คลังเพลง', 'Song Pool') : pick('คลังรูป', 'Image Pool')}</h2>
          <span>{visiblePoolEntities.length}</span>
        </div>
        <div className="tiermaker-pool-rail">
          {filteredPoolIds.length === 0 ? (
            <p className="tierlist-pool-state">
              {normalizedPoolQuery
                ? (isSongTierList ? pick('ไม่พบเพลงที่ตรงกับคำค้น', 'No songs match this search') : pick('ไม่พบรูปที่ตรงกับคำค้น', 'No images match this search'))
                : (isSongTierList ? pick('จัดอันดับเพลงทั้งหมดแล้ว', 'All songs ranked!') : pick('จัดอันดับรูปทั้งหมดแล้ว', 'All images ranked!'))}
            </p>
          ) : visiblePoolEntities.length === 0 ? (
            <p className="tierlist-pool-state">
              {isSongTierList
                ? pick('ยังโหลดข้อมูลเพลงไม่ครบ ลองรีเฟรชอีกครั้ง', 'Song data is not ready yet. Try refreshing.')
                : pick('ยังโหลดข้อมูลรูปไม่ครบ ลองรีเฟรชอีกครั้ง', 'Image data is not ready yet. Try refreshing.')}
            </p>
          ) : (
            visiblePoolEntities.map((title, index) => (
              <TierTitleCard
                key={title.id}
                title={title}
                fromIndex={index}
                eager
                isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === '' && dragState?.fromIndex === index}
                onPointerDragStart={readOnly ? null : beginPointerDrag}
                onPreviewSong={isSongTierList ? handlePreviewSong : null}
              />
            ))
          )}
        </div>
      </aside>

      {dragState && dragPreviewTitle && (
        <div
          className="tiermaker-drag-preview"
          aria-hidden="true"
          style={{
            width: `${dragState.width}px`,
            height: `${dragState.height}px`,
            transform: `translate(${dragState.x - dragState.offsetX}px, ${dragState.y - dragState.offsetY}px) rotate(-2deg)`,
          }}
        >
          <div className="tierlist-item-thumb">
            <ArtworkImage entity={dragPreviewTitle} alt="" />
          </div>
        </div>
      )}
      {isSongTierList && isSongModalOpen && activeSong ? (
        <ThemeSongModal
          song={activeSong}
          onClose={() => setIsSongModalOpen(false)}
        />
      ) : null}
    </section>
  );
}
