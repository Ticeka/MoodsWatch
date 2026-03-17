import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  Layers,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getAllTitles } from '@/features/discover/lib/recommend';
import {
  addTierRow,
  buildTierListFromTemplate,
  createTemplateFromCatalog,
  findTierList,
  findTierTemplate,
  loadTierLibrary,
  moveTitle,
  removeTierRow,
  saveTierList,
  saveTierTemplate,
  seedPoolFromCatalog,
} from '@/features/tierlist/lib/tierlistStore';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './TierList.css';

const BROWSE_PAGE_SIZE = 8;
const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffff', '#7fbfff', '#7f7fff'];

function getDisplayName(title) {
  return title?.title_th || title?.title_en || title?.title_native || 'Unknown title';
}

function getMetaLine(title) {
  return [title?.type, ...(title?.genres || []).slice(0, 2)].filter(Boolean).join(' / ');
}

function sortTemplates(templates, sortBy) {
  if (sortBy === 'newest') {
    return [...templates].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }
  if (sortBy === 'alphabet') {
    return [...templates].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }
  return [...templates].sort((a, b) => Number(b.plays || 0) - Number(a.plays || 0));
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: clampedPage,
    totalPages,
  };
}

function sortListsByRecentAndPopularity(lists = []) {
  return [...lists].sort((a, b) => {
    const updatedDelta = new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    if (updatedDelta !== 0) return updatedDelta;
    return Number(b.playCount || 0) - Number(a.playCount || 0);
  });
}

function getTierListPreviewTitles(list, titleById, limit = 4) {
  const ids = [
    ...list.rows.flatMap((row) => row.titleIds),
    ...list.poolTitleIds,
  ];

  return ids
    .map((id) => titleById.get(Number(id)))
    .filter(Boolean)
    .slice(0, limit);
}

function TierListCommunityCard({ list, titleById, pick, primaryLabel, primaryTo, onPrimaryClick, secondaryLabel, onSecondaryClick }) {
  const coverTitles = getTierListPreviewTitles(list, titleById);
  const previewRows = list.rows
    .map((row, index) => ({
      id: row.id,
      label: row.label || `Tier ${index + 1}`,
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
                  <img key={`${list.id}-${row.id}-${title.id}`} src={getTitleArtwork(title)} alt="" loading="lazy" />
                ))}
              </div>
            </div>
          ))
        ) : coverTitles.length > 0 ? (
          <div className="tierlist-browse-cover">
            {coverTitles.map((title) => (
              <img key={`${list.id}-${title.id}`} src={getTitleArtwork(title)} alt="" loading="lazy" />
            ))}
          </div>
        ) : (
          <div className="tierlist-browse-cover-empty" />
        )}
      </div>
      <div className="tierlist-browse-card-body">
        <small className="tierlist-chip">{pick('by', 'by')} {list.ownerName || 'User'}</small>
        <h3>{list.title}</h3>
        <small className="tierlist-meta">
          {list.rows.length} {pick('tiers', 'tiers')} · {list.playCount || 0} {pick('plays', 'plays')}
        </small>
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

function TierTitleCard({
  title,
  fromRowId = '',
  fromIndex = null,
  eager = false,
  isDragging = false,
  onPointerDragStart = null,
}) {
  return (
    <article
      className={`tiermaker-tile${isDragging ? ' is-dragging-origin' : ''}`}
      title={getDisplayName(title)}
      data-tier-tile="true"
      onPointerDown={(event) => {
        if (event.button !== 0 || !onPointerDragStart) {
          return;
        }
        onPointerDragStart(event, {
          titleId: Number(title.id),
          fromRowId,
          fromIndex,
        });
      }}
    >
      <div className="tierlist-item-thumb">
        <img src={getTitleArtwork(title)} alt="" loading={eager ? 'eager' : 'lazy'} draggable={false} />
      </div>
    </article>
  );
}

function loadExportImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function TierListEditor({ tierList, setTierList, titleById, query, setQuery, pick, readOnly = false }) {
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
  const boardRef = useRef(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

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

  const filteredPoolIds = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) return tierList.poolTitleIds;

    return tierList.poolTitleIds.filter((titleId) => {
      const title = titleById.get(Number(titleId));
      if (!title) return false;
      const haystack = [title.title_th, title.title_en, title.title_native, title.slug]
        .map((entry) => String(entry || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [query, tierList.poolTitleIds, titleById]);

  const persist = async (nextTierList) => {
    setIsSaving(true);
    setSaveState('idle');

    try {
      const savedLibrary = await saveTierList(nextTierList, null, { userId: user?.id || null });
      const savedList = findTierList(nextTierList.id, savedLibrary) || savedLibrary.lists[0] || nextTierList;
      setTierList(savedList);
      setSaveState('success');
      setSaveMessage(pick('Latest changes are saved', 'Latest changes are saved'));
      toast.success(pick('Saved', 'Saved'));
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error?.message || pick('Save failed', 'Save failed'));
      toast.error(error?.message || pick('Save failed', 'Save failed'));
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
      context.fillText(pick('Ranked with MoodToon Tier List', 'Ranked with MoodToon Tier List'), boardPadding + 14, boardPadding + 47);

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
        context.fillText(row.label || `Tier ${rowIndex + 1}`, boardPadding + labelWidth / 2, top + tileSize / 2);

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
        toast.error(pick('Export failed', 'Export failed'));
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
      toast.success(pick('Image downloaded', 'Image downloaded'));
    } catch {
      toast.error(pick('Export failed', 'Export failed'));
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

  const toolbarCompact = isMobileViewport && isToolbarCollapsed && !isToolbarExpanded;

  const statusClass = saveState === 'success' ? 'is-success' : saveState === 'error' ? 'is-error' : '';
  const dragOverRowId = dragTarget?.type === 'row' ? dragTarget.rowId : null;
  const isDragOverPool = dragTarget?.type === 'pool';
  const dragPreviewTitle = dragState ? titleById.get(Number(dragState.titleId)) : null;

  return (
    <section className={`container tiermaker-editor ${isPresentationMode ? 'is-presentation' : ''} ${dragState ? 'is-pointer-dragging' : ''} ${readOnly ? 'is-readonly' : ''}`}>

      {/* ── Sticky toolbar ── */}
      <section className={[
        'tiermaker-toolbar glass-heavy',
        toolbarCompact ? 'is-collapsed' : '',
        isSaving ? 'is-saving' : '',
        saveState === 'success' ? 'is-saved' : '',
      ].filter(Boolean).join(' ')}>

        {/* Mobile: toggle button */}
        <div className="tiermaker-toolbar-compact-toggle">
          <Button variant="ghost" size="sm" onClick={() => setIsToolbarExpanded((c) => !c)}>
            {toolbarCompact ? pick('Show Controls', 'Show Controls') : pick('Hide Controls', 'Hide Controls')}
          </Button>
        </div>

        {/* Tier list name */}
        <div className="tiermaker-toolbar-title">
          <input
            type="text"
            value={tierList.title}
            placeholder={pick('Tier list name', 'Tier list name')}
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
            placeholder={pick('Search pool...', 'Search pool...')}
          />
        </div>

        <div className="tiermaker-toolbar-sep" />

        {/* Action buttons */}
        <div className="tiermaker-toolbar-actions">
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            onClick={resetRows}
            disabled={isSaving || readOnly}
            title={pick('Reset all rows', 'Reset all rows')}
          >
            {pick('Reset', 'Reset')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus size={14} />}
            onClick={handleAddRow}
            disabled={readOnly}
            title={pick('Add row', 'Add row')}
          >
            {pick('Row', 'Row')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            disabled={isSaving || readOnly}
          >
            {isSaving ? pick('Saving…', 'Saving…') : pick('Save', 'Save')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownload}
            disabled={isExporting}
            title={pick('Download image', 'Download image')}
          >
            {isExporting ? pick('…', '…') : pick('IMG', 'IMG')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Layers size={14} />}
            onClick={handleTogglePin}
            title={isPoolPinned ? pick('Unpin pool', 'Unpin pool') : pick('Pin pool', 'Pin pool')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Monitor size={14} />}
            onClick={handleTogglePresentation}
            title={isPresentationMode ? pick('Exit presentation', 'Exit presentation') : pick('Presentation mode', 'Presentation mode')}
          />
        </div>

        {saveState !== 'idle' && (
          <span className={`tiermaker-toolbar-status ${statusClass}`}>
            {saveState === 'success'
              ? saveMessage || pick('Saved', 'Saved')
              : saveMessage || pick('Save failed', 'Save failed')}
          </span>
        )}
      </section>

      {/* ── Board ── */}
      <div className="tiermaker-export-board">
        <div className="tiermaker-export-head">
          <strong>{tierList.title}</strong>
          <span>{pick('Ranked with MoodToon Tier List', 'Ranked with MoodToon Tier List')}</span>
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
            ].filter(Boolean).join(' ')}
          >
            {/* Colored label */}
            <div
              className="tiermaker-label"
              style={{ background: row.color || TIER_COLORS[index % TIER_COLORS.length] }}
            >
              <input
                type="text"
                aria-label={pick('Tier label', 'Tier label')}
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
            {/* Actions revealed on row hover — floats outside the label */}
            <div className="tiermaker-label-actions">
              <Button
                  variant="ghost"
                  size="sm"
                  icon={<Palette size={12} />}
                  onClick={() => cycleRowColor(row.id, row.color, index)}
                  disabled={readOnly}
                  title={pick('Change color', 'Change color')}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={12} />}
                  onClick={() => resetRow(row.id)}
                  disabled={readOnly || row.titleIds.length === 0}
                  title={pick('Clear row', 'Clear row')}
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
                  title={pick('Remove row', 'Remove row')}
                />
            </div>

            {/* Drop zone */}
            <div className={`tiermaker-dropzone ${row.titleIds.length === 0 ? 'is-empty' : ''}`}>
              {row.titleIds.length === 0
                ? <span className="tierlist-empty-row">{pick('Drop here', 'Drop here')}</span>
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
                        aria-label={pick('Insert here', 'Insert here')}
                      />,
                      <TierTitleCard
                        key={title.id}
                        title={title}
                        fromRowId={row.id}
                        fromIndex={titleIndex}
                        isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === row.id && dragState?.fromIndex === titleIndex}
                        onPointerDragStart={readOnly ? null : beginPointerDrag}
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
                          aria-label={pick('Insert at end', 'Insert at end')}
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

      {/* ── Image pool ── */}
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
          <h2><Layers size={13} /> {pick('Image Pool', 'Image Pool')}</h2>
          <span>{filteredPoolIds.length}</span>
        </div>
        <div className="tiermaker-pool-rail">
          {filteredPoolIds.length === 0 ? (
            <p className="tierlist-pool-state">
              {pick('All images ranked!', 'All images ranked!')}
            </p>
          ) : (
            filteredPoolIds
              .map((id) => titleById.get(Number(id)))
              .filter(Boolean)
              .map((title, index) => (
                <TierTitleCard
                  key={title.id}
                  title={title}
                  fromIndex={index}
                  eager
                  isDragging={dragState?.titleId === Number(title.id) && dragState?.fromRowId === '' && dragState?.fromIndex === index}
                  onPointerDragStart={readOnly ? null : beginPointerDrag}
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
            <img src={getTitleArtwork(dragPreviewTitle)} alt="" draggable={false} />
          </div>
        </div>
      )}
    </section>
  );
}

export function TierListBrowsePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const [titles, setTitles] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [page, setPage] = useState(1);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const catalog = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
      if (cancelled) return;
      setTitles(catalog);
      const nextLibrary = await loadTierLibrary(catalog, { userId: user?.id || null });
      if (cancelled) return;
      setLibrary(nextLibrary);
      setIsLoading(false);
    }
    load().catch(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const publicTemplates = useMemo(
    () => library.templates.filter((template) => template.isPublic),
    [library.templates]
  );
  const publicLists = useMemo(
    () => library.lists.filter((list) => list.isPublic),
    [library.lists]
  );
  const recentCommunityLists = useMemo(
    () => sortListsByRecentAndPopularity(publicLists).slice(0, 8),
    [publicLists]
  );

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return publicTemplates.filter((template) => {
      if (category !== 'all' && template.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = `${template.title} ${template.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, publicTemplates, query]);

  const pagedTemplates = useMemo(() => {
    const sorted = sortTemplates(filteredTemplates, sortBy);
    return paginate(sorted, page, BROWSE_PAGE_SIZE);
  }, [filteredTemplates, page, sortBy]);

  const titleById = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );

  const handlePlayTemplate = async (template) => {
    const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
    const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, library, { userId: user?.id || null });
    const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
    const list = buildTierListFromTemplate(savedTemplate);
    const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
    const libraryAfterList = await saveTierList({
      ...seeded,
      ownerName: user?.profile?.username || user?.user_metadata?.username || 'You',
      ownerUserId: user?.id || null,
    }, libraryAfterTemplate, { userId: user?.id || null });
    setLibrary(libraryAfterList);
    navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
  };

  const handleRemixList = async (list) => {
    const remixed = {
      ...list,
      id: undefined,
      ownerName: 'You',
      ownerUserId: user?.id || null,
      isPublic: false,
      title: `${list.title} (Remix)`,
      playCount: 0,
    };
    const saved = await saveTierList(remixed, library, { userId: user?.id || null });
    setLibrary(saved);
    navigate(`/tierlist/play/${saved.lists[0].id}`);
  };

  const categoryOptions = ['all', ...new Set(publicTemplates.map((template) => template.category))];

  return (
    <div className="tierlist-page">
      {/* ── Slim header ── */}
      <div className="container tierlist-browse-header">
        <div className="tierlist-browse-header-left">
          <h1><Compass size={17} /> {pick('Tier Lists', 'Tier Lists')}</h1>
          {!isLoading && (
            <span className="tierlist-count">{filteredTemplates.length} {pick('templates', 'templates')}</span>
          )}
        </div>
        <Link className="btn btn-primary btn-sm" to="/tierlist/create">
          <Plus size={13} /> {pick('Create', 'Create')}
        </Link>
      </div>

      {/* ── Filter bar ── */}
      <div className="container tierlist-browse-filters">
        <div className="tierlist-browse-cats">
          {categoryOptions.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`tierlist-cat-pill${category === cat ? ' is-active' : ''}`}
              onClick={() => { setCategory(cat); setPage(1); }}
            >
              {cat === 'all' ? pick('All', 'All') : cat}
            </button>
          ))}
        </div>
        <div className="tierlist-browse-search">
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder={pick('Search...', 'Search...')}
          />
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1); }}>
            <option value="popular">{pick('Popular', 'Popular')}</option>
            <option value="newest">{pick('Newest', 'Newest')}</option>
            <option value="alphabet">A-Z</option>
          </select>
        </div>
      </div>

      {/* ── Template grid ── */}
      <section className="container tierlist-section">
        {isLoading ? (
          <div className="glass-heavy tierlist-empty-state">{pick('Loading...', 'Loading...')}</div>
        ) : pagedTemplates.items.length === 0 ? (
          <div className="glass-heavy tierlist-empty-state">{pick('No templates found', 'No templates found')}</div>
        ) : (
          <div className="tierlist-browse-grid">
            {pagedTemplates.items.map((template) => {
              const cover = template.titleIds
                .slice(0, 4)
                .map((id) => titleById.get(Number(id)))
                .filter(Boolean);

              return (
                <article key={template.id} className="glass-heavy tierlist-browse-card">
                  <div className="tierlist-browse-cover">
                    {cover.length > 0
                      ? cover.map((title) => (
                        <img key={title.id} src={getTitleArtwork(title)} alt="" loading="lazy" />
                      ))
                      : <div className="tierlist-browse-cover-empty" />}
                  </div>
                  <div className="tierlist-browse-card-body">
                    <small className="tierlist-chip">{template.category}</small>
                    <h3>{template.title}</h3>
                    <small className="tierlist-meta">{template.titleIds.length} {pick('titles', 'titles')} · {template.plays || 0} plays</small>
                  </div>
                  <div className="tierlist-browse-card-actions">
                    <Button size="sm" variant="primary" onClick={() => handlePlayTemplate(template)}>
                      {pick('Play', 'Play')}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {pagedTemplates.totalPages > 1 && (
          <div className="tierlist-pagination">
            <Button
              size="sm"
              variant="ghost"
              icon={<ChevronLeft size={14} />}
              disabled={pagedTemplates.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {pick('Prev', 'Prev')}
            </Button>
            <span>{pagedTemplates.page} / {pagedTemplates.totalPages}</span>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={14} />}
              disabled={pagedTemplates.page >= pagedTemplates.totalPages}
              onClick={() => setPage((current) => Math.min(pagedTemplates.totalPages, current + 1))}
            >
              {pick('Next', 'Next')}
            </Button>
          </div>
        )}
      </section>

      {/* ── Community lists ── */}
      {recentCommunityLists.length > 0 && (
        <section className="container tierlist-section">
          <div className="tierlist-section-head">
            <h2>{pick('Fresh Community Rankings', 'Fresh Community Rankings')}</h2>
            <Link className="tierlist-inline-link" to="/tierlist">
              {pick('Explore templates', 'Explore templates')}
            </Link>
          </div>
          <div className="tierlist-browse-grid">
            {recentCommunityLists.map((list) => (
              <TierListCommunityCard
                key={list.id}
                list={list}
                titleById={titleById}
                pick={pick}
                primaryLabel={pick('Open', 'Open')}
                primaryTo={`/tierlist/play/${list.id}`}
                secondaryLabel={pick('Remix', 'Remix')}
                onSecondaryClick={() => handleRemixList(list)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function TierListTemplatePage() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const [titles, setTitles] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [template, setTemplate] = useState(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsTemplateLoading(true);
      setIsPreviewLoading(true);
      setLoadError('');

      const loadedLibrary = await loadTierLibrary([], { userId: user?.id || null });
      if (cancelled) return;
      setLibrary(loadedLibrary);

      const found = findTierTemplate(templateId, loadedLibrary);
      if (!found) {
        setIsTemplateLoading(false);
        setIsPreviewLoading(false);
        setLoadError(pick('Template not found', 'Template not found'));
        return;
      }

      setTemplate(found);
      setIsTemplateLoading(false);

      const catalog = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
      if (cancelled) return;
      setTitles(catalog);

      const hydratedLibrary = await loadTierLibrary(catalog, { userId: user?.id || null });
      if (cancelled) return;
      setLibrary(hydratedLibrary);
      setTemplate(findTierTemplate(templateId, hydratedLibrary) || found);
      setIsPreviewLoading(false);
    }

    load().catch((error) => {
      if (cancelled) return;
      setIsTemplateLoading(false);
      setIsPreviewLoading(false);
      setLoadError(error?.message || pick('Failed to load template', 'Failed to load template'));
    });

    return () => { cancelled = true; };
  }, [navigate, pick, templateId, user?.id]);

  const titleById = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );

  const relatedPublicLists = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => list.isPublic && String(list.templateId || '') === String(templateId))
    ),
    [library.lists, templateId]
  );

  if (isTemplateLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <div className="glass-heavy tierlist-empty-state">{pick('Loading template...', 'Loading template...')}</div>
        </section>
      </div>
    );
  }

  if (!template || loadError) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <div className="glass-heavy tierlist-empty-state">
            <p>{loadError || pick('Template not found', 'Template not found')}</p>
            <div className="tierlist-template-actions">
              <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('Back to Browse', 'Back to Browse')}</Link>
              <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                {pick('Try Again', 'Try Again')}
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const previewTitles = template.titleIds
    .slice(0, 16)
    .map((id) => titleById.get(Number(id)))
    .filter(Boolean);

  const handlePlay = async () => {
    const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
    const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, library, { userId: user?.id || null });
    const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
    setLibrary(libraryAfterTemplate);
    setTemplate(savedTemplate);
    const list = buildTierListFromTemplate(savedTemplate);
    const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
    const libraryAfterList = await saveTierList({
      ...seeded,
      ownerName: user?.profile?.username || user?.user_metadata?.username || 'You',
      ownerUserId: user?.id || null,
    }, libraryAfterTemplate, { userId: user?.id || null });
    navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
  };

  return (
    <div className="tierlist-page">
      <section className="container tierlist-hero">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('Template Detail', 'Template Detail')}</span>
          <h1>{template.title}</h1>
          <p>{template.description || pick('No description', 'No description')}</p>
          <div className="tierlist-hero-actions">
            <Link className="btn btn-ghost" to="/tierlist">{pick('Back to Browse', 'Back to Browse')}</Link>
            <Button variant="primary" iconRight={<ArrowRight size={14} />} onClick={handlePlay}>
              {pick('Play This Template', 'Play This Template')}
            </Button>
          </div>
        </div>
        <div className="tierlist-hero-panel glass-heavy">
          <div className="tierlist-stat"><strong>{template.titleIds.length}</strong><span>{pick('Titles', 'Titles')}</span></div>
          <div className="tierlist-stat"><strong>{template.plays || 0}</strong><span>{pick('Plays', 'Plays')}</span></div>
          <div className="tierlist-stat"><strong>{relatedPublicLists.length}</strong><span>{pick('Public Remixes', 'Public Remixes')}</span></div>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('Preview Titles', 'Preview Titles')}</h2>
        </div>
        <div className="tierlist-preview-gallery">
          {isPreviewLoading ? (
            <div className="glass-heavy tierlist-empty-state">{pick('Loading previews...', 'Loading previews...')}</div>
          ) : previewTitles.length === 0 ? (
            <div className="glass-heavy tierlist-empty-state">{pick('No preview titles available', 'No preview titles available')}</div>
          ) : (
            previewTitles.map((title) => (
              <article key={title.id} className="tierlist-preview-tile">
                <div className="tierlist-preview-poster">
                  <img src={getTitleArtwork(title)} alt={getDisplayName(title)} loading="lazy" />
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
          <h2>{pick('Community Rankings For This Template', 'Community Rankings For This Template')}</h2>
          <span className="tierlist-count">{relatedPublicLists.length} {pick('public lists', 'public lists')}</span>
        </div>

        {relatedPublicLists.length === 0 ? (
          <div className="glass-heavy tierlist-empty-state">
            {pick('No public rankings yet. Be the first to publish one from this template.', 'No public rankings yet. Be the first to publish one from this template.')}
          </div>
        ) : (
          <div className="tierlist-browse-grid">
            {relatedPublicLists.slice(0, 8).map((list) => (
              <TierListCommunityCard
                key={list.id}
                list={list}
                titleById={titleById}
                pick={pick}
                primaryLabel={pick('Open Ranking', 'Open Ranking')}
                primaryTo={`/tierlist/play/${list.id}`}
                secondaryLabel={pick('Remix', 'Remix')}
                onSecondaryClick={async () => {
                  const remixed = {
                    ...list,
                    id: undefined,
                    ownerName: 'You',
                    ownerUserId: user?.id || null,
                    isPublic: false,
                    title: `${list.title} (Remix)`,
                    playCount: 0,
                  };
                  const saved = await saveTierList(remixed, library, { userId: user?.id || null });
                  navigate(`/tierlist/play/${saved.lists[0].id}`);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TierListCreatePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [category, setCategory] = useState('general');
  const [typeFilter, setTypeFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState(new Set());
  const [titleQuery, setTitleQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const catalog = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
      if (!cancelled) {
        setTitles(catalog);
        await loadTierLibrary(catalog, { userId: user?.id || null });
        setIsLoading(false);
      }
    }
    load().catch(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const availableGenres = useMemo(() => {
    const counts = new Map();
    titles.forEach((title) => {
      (title.genres || []).forEach((genre) => {
        counts.set(genre, (counts.get(genre) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);
  }, [titles]);

  const filtered = useMemo(() => {
    let result = typeFilter === 'all' ? titles : titles.filter((title) => title.type === typeFilter);
    if (genreFilter.size > 0) {
      result = result.filter((title) => (title.genres || []).some((g) => genreFilter.has(g)));
    }
    const q = titleQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((title) => {
        const hay = [title.title_th, title.title_en, title.title_native]
          .map((s) => String(s || '').toLowerCase()).join(' ');
        return hay.includes(q);
      });
    }
    return result.slice(0, 200);
  }, [titles, typeFilter, genreFilter, titleQuery]);

  const selectedTitles = useMemo(
    () => titles.filter((title) => selectedIds.has(Number(title.id))),
    [titles, selectedIds]
  );

  const toggleTitle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selectedIds.size < 8) {
      toast.error(pick('Please select at least 8 titles', 'Please select at least 8 titles'));
      return;
    }

    setIsSaving(true);
    try {
      const template = createTemplateFromCatalog(selectedTitles, {
        title: templateName.trim() || pick('New Template', 'New Template'),
        description: templateDesc.trim(),
        category,
        isPublic: true,
        isSystem: false,
        defaultRows: ['S', 'A', 'B', 'C', 'D'],
        ownerUserId: user?.id || null,
      });

      const currentLibrary = await loadTierLibrary(titles, { userId: user?.id || null });
      const libraryAfterTemplate = await saveTierTemplate(template, currentLibrary, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(template.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || template;
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog(list, selectedTitles.map((title) => Number(title.id)));
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: user?.profile?.username || user?.user_metadata?.username || 'You',
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('Save failed', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="tierlist-page">
      <section className="container tierlist-hero">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('Create Tierlist', 'Create Tierlist')}</span>
          <h1>{pick('Create a template from catalog data', 'Create a template from catalog data')}</h1>
          <p>{pick('Pick the titles you want to rank, then start playing.', 'Pick the titles you want to rank, then start playing.')}</p>
        </div>
      </section>

      <section className="container tierlist-toolbar glass-heavy">
        <label className="tierlist-field">
          <span>{pick('Template Name', 'Template Name')}</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={pick('e.g. Best Romance 2026', 'e.g. Best Romance 2026')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('Description', 'Description')}</span>
          <input
            value={templateDesc}
            onChange={(event) => setTemplateDesc(event.target.value)}
            placeholder={pick('Short description', 'Short description')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('Category', 'Category')}</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="anime / manga / action / romance"
          />
        </label>

        <div className="tierlist-toolbar-actions">
          <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('Back to Browse', 'Back to Browse')}</Link>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={isLoading || isSaving || selectedIds.size < 8}
          >
            {isSaving ? pick('Creating...', 'Creating...') : `${pick('Create & Play', 'Create & Play')}${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </Button>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>
            {pick('Select Titles', 'Select Titles')}
            {selectedIds.size > 0 && (
              <span className="tierlist-count">&nbsp;· {selectedIds.size} {pick('selected', 'selected')}</span>
            )}
          </h2>
          <div className="tierlist-picker-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set(filtered.map((title) => Number(title.id))))}
            >
              {pick('Select All', 'Select All')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
            >
              {pick('Clear', 'Clear')}
            </button>
          </div>
        </div>

        <div className="tierlist-picker-filterbar">
          <div className="tierlist-picker-filterbar-top">
            <div className="tierlist-picker-type-pills">
              {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                  onClick={() => setTypeFilter(type)}
                >
                  {type === 'all' ? pick('All Types', 'All Types') : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            <div className="tierlist-picker-search-wrap">
              <input
                className="tierlist-picker-search"
                value={titleQuery}
                onChange={(event) => setTitleQuery(event.target.value)}
                placeholder={pick('Search titles...', 'Search titles...')}
              />
              {titleQuery && (
                <button
                  type="button"
                  className="tierlist-picker-search-clear"
                  onClick={() => setTitleQuery('')}
                  aria-label="Clear search"
                >×</button>
              )}
            </div>
            <span className="tierlist-picker-result-count">
              {filtered.length} {pick('titles', 'titles')}
            </span>
          </div>

          {availableGenres.length > 0 && (
            <div className="tierlist-picker-genre-row">
              <button
                type="button"
                className={`tierlist-cat-pill${genreFilter.size === 0 ? ' is-active' : ''}`}
                onClick={() => setGenreFilter(new Set())}
              >
                {pick('All Genres', 'All Genres')}
              </button>
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  className={`tierlist-cat-pill${genreFilter.has(genre) ? ' is-active' : ''}`}
                  onClick={() => setGenreFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(genre)) next.delete(genre);
                    else next.add(genre);
                    return next;
                  })}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="glass-heavy tierlist-empty-state">{pick('Loading catalog...', 'Loading catalog...')}</div>
        ) : filtered.length === 0 ? (
          <div className="glass-heavy tierlist-empty-state">{pick('No titles found', 'No titles found')}</div>
        ) : (
          <div className="tierlist-picker-grid">
            {filtered.map((title) => {
              const selected = selectedIds.has(Number(title.id));
              return (
                <button
                  key={title.id}
                  type="button"
                  className={`tierlist-picker-card${selected ? ' is-selected' : ''}`}
                  onClick={() => toggleTitle(Number(title.id))}
                  title={getDisplayName(title)}
                >
                  <div className="tierlist-picker-thumb">
                    <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                    {selected && <div className="tierlist-picker-check">✓</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function TierListPlayPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const [titles, setTitles] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [tierList, setTierList] = useState(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError('');

      const library = await loadTierLibrary([], { userId: user?.id || null });
      if (!cancelled) {
        setLibrary(library);
      }
      const quickList = findTierList(listId, library);
      if (!cancelled && quickList) {
        setTierList(quickList);
      }

      const catalog = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY });
      if (cancelled) return;
      setTitles(catalog);
      const hydratedLibrary = await loadTierLibrary(catalog, { userId: user?.id || null });
      if (!cancelled) {
        setLibrary(hydratedLibrary);
      }
      const list = findTierList(listId, hydratedLibrary);
      if (!list) {
        setLoadError(pick('Tierlist not found', 'Tierlist not found'));
        return;
      }
      const sourceTemplate = list.templateId
        ? findTierTemplate(list.templateId, hydratedLibrary)
        : null;
      const allowedTitleIds = sourceTemplate?.titleIds?.length
        ? sourceTemplate.titleIds
        : [
          ...list.poolTitleIds,
          ...list.rows.flatMap((row) => row.titleIds),
        ];
      setTierList(seedPoolFromCatalog(list, allowedTitleIds));
    }
    load().catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('Failed to load tierlist', 'Failed to load tierlist'));
    });
    return () => { cancelled = true; };
  }, [listId, navigate, pick, user?.id]);

  const titleById = useMemo(
    () => new Map(titles.map((title) => [Number(title.id), title])),
    [titles]
  );
  const sourceTemplate = tierList?.templateId ? findTierTemplate(tierList.templateId, library) : null;
  const isOwner = Boolean(user?.id && tierList?.ownerUserId && String(user.id) === String(tierList.ownerUserId));
  const canEdit = !tierList?.ownerUserId || isOwner;
  const relatedPublicLists = tierList?.templateId
    ? sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        list.id !== tierList.id &&
        String(list.templateId || '') === String(tierList.templateId)
      ))
    )
    : [];

  if (!tierList) {
    return (
      <div className="tierlist-play-page">
        <section className="container tierlist-section">
          <div className="glass-heavy tierlist-empty-state">
            <p>{loadError || pick('Loading tierlist...', 'Loading tierlist...')}</p>
            {loadError && (
              <div className="tierlist-template-actions">
                <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('Back to Browse', 'Back to Browse')}</Link>
                <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
                  {pick('Try Again', 'Try Again')}
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-play-page">
      {/* Slim topbar: back link + visibility toggle */}
      <div className="container tierlist-play-topbar">
        <Link className="btn btn-ghost btn-sm" to={sourceTemplate ? `/tierlist/template/${sourceTemplate.id}` : '/tierlist'}>
          <ChevronLeft size={14} /> {sourceTemplate ? pick('Back to Template', 'Back to Template') : pick('Browse', 'Browse')}
        </Link>
        {canEdit ? (
          <Button
            size="sm"
            variant={tierList.isPublic ? 'secondary' : 'ghost'}
            onClick={async () => {
              const next = { ...tierList, isPublic: !tierList.isPublic };
              setTierList(next);
              try {
                const savedLibrary = await saveTierList(next, null, { userId: user?.id || null });
                setLibrary(savedLibrary);
                setTierList(findTierList(next.id, savedLibrary) || savedLibrary.lists[0] || next);
              } catch (error) {
                setTierList(tierList);
                toast.error(error?.message || pick('Save failed', 'Save failed'));
              }
            }}
          >
            {tierList.isPublic ? pick('Public: ON', 'Public: ON') : pick('Make Public', 'Make Public')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const remixed = {
                ...tierList,
                id: undefined,
                ownerName: user?.profile?.username || user?.user_metadata?.username || 'You',
                ownerUserId: user?.id || null,
                isPublic: false,
                title: `${tierList.title} (Remix)`,
                playCount: 0,
              };
              const saved = await saveTierList(remixed, library, { userId: user?.id || null });
              setLibrary(saved);
              navigate(`/tierlist/play/${saved.lists[0].id}`);
            }}
          >
            {pick('Remix This Ranking', 'Remix This Ranking')}
          </Button>
        )}
      </div>

      <TierListEditor
        tierList={tierList}
        setTierList={setTierList}
        titleById={titleById}
        query={query}
        setQuery={setQuery}
        pick={pick}
        readOnly={!canEdit}
      />

      {sourceTemplate && (
        <section className="container tierlist-section">
          <div className="tierlist-community-banner glass-heavy">
            <div className="tierlist-community-banner-copy">
              <small className="tierlist-chip">{pick('Template Community', 'Template Community')}</small>
              <h2>{pick('See how other people ranked this same template', 'See how other people ranked this same template')}</h2>
              <p>
                {canEdit
                  ? pick('Publish your version, compare tier choices, or remix a community ranking to start your own branch.', 'Publish your version, compare tier choices, or remix a community ranking to start your own branch.')
                  : pick('This ranking is view-only. Compare tier choices here, then remix it to create your own editable version.', 'This ranking is view-only. Compare tier choices here, then remix it to create your own editable version.')}
              </p>
            </div>
            <div className="tierlist-community-banner-actions">
              <Link className="btn btn-ghost" to={`/tierlist/template/${sourceTemplate.id}`}>
                {pick('Template Page', 'Template Page')}
              </Link>
              {canEdit && !tierList.isPublic ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    const next = { ...tierList, isPublic: true };
                    setTierList(next);
                    try {
                      const savedLibrary = await saveTierList(next, null, { userId: user?.id || null });
                      setLibrary(savedLibrary);
                      setTierList(findTierList(next.id, savedLibrary) || savedLibrary.lists[0] || next);
                    } catch (error) {
                      setTierList(tierList);
                      toast.error(error?.message || pick('Save failed', 'Save failed'));
                    }
                  }}
                >
                  {pick('Publish Your Ranking', 'Publish Your Ranking')}
                </Button>
              ) : null}
              {!canEdit ? (
                <Button
                  variant="primary"
                  onClick={async () => {
                    const remixed = {
                      ...tierList,
                      id: undefined,
                      ownerName: user?.profile?.username || user?.user_metadata?.username || 'You',
                      ownerUserId: user?.id || null,
                      isPublic: false,
                      title: `${tierList.title} (Remix)`,
                      playCount: 0,
                    };
                    const saved = await saveTierList(remixed, library, { userId: user?.id || null });
                    setLibrary(saved);
                    navigate(`/tierlist/play/${saved.lists[0].id}`);
                  }}
                >
                  {pick('Remix To Edit', 'Remix To Edit')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="tierlist-section-head">
            <h2>{pick('Community Rankings', 'Community Rankings')}</h2>
            <span className="tierlist-count">{relatedPublicLists.length} {pick('related lists', 'related lists')}</span>
          </div>

          {relatedPublicLists.length === 0 ? (
            <div className="glass-heavy tierlist-empty-state">
              {pick('No other public rankings for this template yet.', 'No other public rankings for this template yet.')}
            </div>
          ) : (
            <div className="tierlist-browse-grid">
              {relatedPublicLists.slice(0, 8).map((list) => (
                <TierListCommunityCard
                  key={list.id}
                  list={list}
                  titleById={titleById}
                  pick={pick}
                  primaryLabel={pick('Open Ranking', 'Open Ranking')}
                  primaryTo={`/tierlist/play/${list.id}`}
                  secondaryLabel={pick('Remix', 'Remix')}
                  onSecondaryClick={async () => {
                    const remixed = {
                      ...list,
                      id: undefined,
                      ownerName: 'You',
                      ownerUserId: user?.id || null,
                      isPublic: false,
                      title: `${list.title} (Remix)`,
                      playCount: 0,
                    };
                    const saved = await saveTierList(remixed, library, { userId: user?.id || null });
                    setLibrary(saved);
                    navigate(`/tierlist/play/${saved.lists[0].id}`);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default TierListBrowsePage;
