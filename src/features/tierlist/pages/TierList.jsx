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
  Loader2,
  MessageSquare,
  Monitor,
  Music,
  Palette,
  Play,
  Plus,
  Search,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ErrorState } from '@/shared/components/ui/ErrorState';
import { SortSelect } from '@/shared/components/ui/SortSelect';
import { BRAND_NAME } from '@/shared/config/brand';
import { filterTitlesForAgeGate } from '@/shared/lib/ageGate';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { getAllTitles, getCharactersPage, getTitleBySlug, getTitlesByIds, getTitlesPage } from '@/features/discover/lib/recommend';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import {
  CHARACTER_ENTITY_TYPE,
  THEME_SONG_ENTITY_TYPE,
  TITLE_ENTITY_TYPE,
  buildThemeSongEntity,
  getCatalogEntities,
  getCatalogEntityMeta,
  getCatalogEntityName,
  isThemeSongEntity,
  normalizeCatalogEntityType,
} from '@/shared/lib/catalogEntities';
import {
  addTierRow,
  buildTierListFromTemplate,
  createTemplateFromCatalog,
  createTierListFromTemplate,
  findTierList,
  findTierTemplate,
  filterTierListToCatalog,
  loadTierLibrary,
  moveTitle,
  removeTierRow,
  saveTierList,
  saveTierTemplate,
  seedPoolFromCatalog,
} from '@/features/tierlist/lib/tierlistStore';
import { getTitleArtwork } from '@/shared/lib/titleArtwork';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { supabase } from '@/shared/lib/supabase';
import { ThemeSongModal } from '@/shared/components/ui/ThemeSongModal';
import './TierList.css';

const BROWSE_PAGE_SIZE = 8;
const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffff', '#7fbfff', '#7f7fff'];
const ENTITY_TYPE_OPTIONS = [
  { value: TITLE_ENTITY_TYPE, label: 'Titles' },
  { value: CHARACTER_ENTITY_TYPE, label: 'Characters' },
  { value: THEME_SONG_ENTITY_TYPE, label: 'Theme Songs' },
];

function getDisplayName(title) {
  return getCatalogEntityName(title);
}

function getMetaLine(title) {
  return getCatalogEntityMeta(title);
}

function getThemeSongSummary(song) {
  return [
    song?.theme_label || song?.role,
    song?.artist_name,
    song?.episodes_text,
  ].filter(Boolean);
}

function buildEntityMaps(titles = []) {
  const titleMap = new Map(titles.map((title) => [Number(title.id), title]));
  const characterMap = new Map(
    getCatalogEntities(titles, CHARACTER_ENTITY_TYPE).map((character) => [Number(character.id), character])
  );

  return {
    [TITLE_ENTITY_TYPE]: titleMap,
    [CHARACTER_ENTITY_TYPE]: characterMap,
  };
}

function getEntityMap(entityMaps, entityType = TITLE_ENTITY_TYPE) {
  return entityMaps[normalizeCatalogEntityType(entityType)] || entityMaps[TITLE_ENTITY_TYPE] || new Map();
}

function getCurrentUsername(user) {
  return user?.profile?.username || user?.user_metadata?.username || null;
}

function buildRemixedTierList(list, user) {
  const ownerUsername = getCurrentUsername(user);
  return {
    ...list,
    id: undefined,
    ownerName: ownerUsername || 'You',
    ownerUsername,
    ownerUserId: user?.id || null,
    isPublic: false,
    title: `${list.title} (Remix)`,
    playCount: 0,
  };
}

function TierListEmptyPanel({ icon, title, message, action }) {
  return (
    <div className="glass-heavy tierlist-empty-state">
      <EmptyState
        className="empty-state"
        icon={icon}
        title={title}
        message={message}
        action={action}
      />
    </div>
  );
}

function TierListErrorPanel({ message, onRetry, backLabel, backTo }) {
  return (
    <div className="glass-heavy tierlist-empty-state">
      <ErrorState message={message} onRetry={onRetry} />
      {backLabel && backTo ? (
        <div className="tierlist-template-actions">
          <Link className="btn btn-ghost btn-sm" to={backTo}>
            {backLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
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

function hasVisibleTemplateTitles(template, titleById) {
  return (template?.titleIds || []).some((id) => titleById.has(Number(id)));
}

function hasVisibleTierListTitles(list, titleById) {
  const ids = [
    ...(list?.rows || []).flatMap((row) => row.titleIds || []),
    ...(list?.poolTitleIds || []),
  ];

  return ids.some((id) => titleById.has(Number(id)));
}

function hasTierListStructureChanged(left, right) {
  if (!left || !right) {
    return false;
  }

  return JSON.stringify({
    rows: left.rows?.map((row) => ({
      id: row.id,
      titleIds: row.titleIds,
    })),
    poolTitleIds: left.poolTitleIds,
  }) !== JSON.stringify({
    rows: right.rows?.map((row) => ({
      id: row.id,
      titleIds: row.titleIds,
    })),
    poolTitleIds: right.poolTitleIds,
  });
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
        <small className="tierlist-chip">
          {pick('โดย', 'by')}{' '}
          {(() => {
            const slug = list.ownerUsername || list.ownerName;
            const label = list.ownerName || list.ownerUsername || pick('ผู้ใช้', 'User');
            return slug && slug !== 'You' ? (
              <Link to={`/u/${slug}`} className="tierlist-owner-link" onClick={(e) => e.stopPropagation()}>
                {label}
              </Link>
            ) : label;
          })()}
        </small>
        <h3>{list.title}</h3>
        <small className="tierlist-meta">
          {list.rows.length} {pick('ชั้น', 'tiers')} · {list.playCount || 0} {pick('ครั้งเล่น', 'plays')}
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
  onPreviewSong = null,
}) {
  const isSong = isThemeSongEntity(title);
  const canPreviewSong = isSong && title?.video_url && typeof onPreviewSong === 'function';

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
      <div className={`tierlist-item-thumb${isSong ? ' is-song' : ''}`}>
        <img src={getTitleArtwork(title)} alt="" loading={eager ? 'eager' : 'lazy'} draggable={false} />
        {isSong ? (
          <>
            <span className="tier-song-badge">{title.role || title.theme_label}</span>
            {canPreviewSong ? (
              <button
                type="button"
                className="tiermaker-song-play"
                aria-label={`Play ${getDisplayName(title)}`}
                title={`Play ${getDisplayName(title)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPreviewSong(title);
                }}
              >
                <Play size={14} />
              </button>
            ) : null}
            <div className="tiermaker-song-meta">
              <strong>{title.song_title || getDisplayName(title)}</strong>
              <span>{title.artist_name || title.sourceTitleName || 'Theme song'}</span>
            </div>
          </>
        ) : null}
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
  const [activeSong, setActiveSong] = useState(null);
  const [isSongModalOpen, setIsSongModalOpen] = useState(false);
  const boardRef = useRef(null);
  const dragStateRef = useRef(null);
  const sampleEntity = titleById.values().next().value;
  const isSongTierList = normalizeCatalogEntityType(tierList?.entityType) === THEME_SONG_ENTITY_TYPE || isThemeSongEntity(sampleEntity);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

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
      const haystack = [title.title_th, title.title_en, title.title_native, title.sourceTitleName, title.slug]
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
      context.fillText(pick(`Ranked with ${BRAND_NAME} Tier List`, `Ranked with ${BRAND_NAME} Tier List`), boardPadding + 14, boardPadding + 47);

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
  const activeSongSummary = getThemeSongSummary(activeSong);

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
            variant="primary"
            size="sm"
            icon={<Save size={14} />}
            onClick={handleSave}
            disabled={isSaving || readOnly}
          >
            {isSaving ? pick('กำลังบันทึก...', 'Saving...') : pick('บันทึก', 'Save')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownload}
            disabled={isExporting}
            title={pick('ดาวน์โหลดรูปภาพ', 'Download image')}
          >
            {isExporting ? pick('…', '…') : pick('IMG', 'IMG')}
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

      {/* ── Board ── */}
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
            ].filter(Boolean).join(' ')}
          >
            {/* Colored label */}
            <div
              className="tiermaker-label"
              style={{ background: row.color || TIER_COLORS[index % TIER_COLORS.length] }}
            >
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
            {/* Actions revealed on row hover — floats outside the label */}
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
          <h2><Layers size={13} /> {pick('คลังรูป', 'Image Pool')}</h2>
          <span>{filteredPoolIds.length}</span>
        </div>
        <div className="tiermaker-pool-rail">
          {filteredPoolIds.length === 0 ? (
            <p className="tierlist-pool-state">
              {pick('จัดอันดับรูปทั้งหมดแล้ว', 'All images ranked!')}
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
            <img src={getTitleArtwork(dragPreviewTitle)} alt="" draggable={false} />
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

function formatCmtDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

function TierListCommentSection({ listId, listOwnerId, pick }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [replyError, setReplyError] = useState('');
  const replyInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !listId) return;
      setIsLoading(true);
      try {
        const { data, error: loadErr } = await supabase
          .from('tierlist_comments')
          .select('id, comment_body, created_at, parent_comment_id, author_user_id, author:user_profiles!tierlist_comments_author_user_id_fkey(id, name, username, avatar_url)')
          .eq('list_id', listId)
          .order('created_at', { ascending: true })
          .limit(100);
        if (loadErr) throw loadErr;
        if (!cancelled) setComments(data || []);
      } catch {
        // silently ignore load error
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [listId]);

  const fireNotifications = (parentEntry) => {
    const actorName = user?.profile?.name || user?.profile?.username || pick('ใครบางคน', 'Someone');
    const notifInserts = [];
    if (listOwnerId && listOwnerId !== user.id) {
      notifInserts.push(supabase.from('notifications').insert({
        user_id: listOwnerId,
        type: parentEntry ? 'comment_reply' : 'tierlist_comment',
        reference_id: listId,
        actor_user_id: user.id,
        message: parentEntry
          ? `${actorName} ${pick('ตอบกลับคอมเมนต์บน tierlist ของคุณ', 'replied to a comment on your tierlist')}`
          : `${actorName} ${pick('คอมเมนต์บน tierlist ของคุณ', 'commented on your tierlist')}`,
      }));
    }
    if (parentEntry?.author_user_id && parentEntry.author_user_id !== user.id && parentEntry.author_user_id !== listOwnerId) {
      notifInserts.push(supabase.from('notifications').insert({
        user_id: parentEntry.author_user_id,
        type: 'comment_reply',
        reference_id: listId,
        actor_user_id: user.id,
        message: `${actorName} ${pick('ตอบกลับคอมเมนต์ของคุณ', 'replied to your comment')}`,
      }));
    }
    if (notifInserts.length) Promise.allSettled(notifInserts);
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user?.id || !draft.trim() || !supabase) return;
    const body = draft.trim();
    if (body.length > 500) { setError(pick('คอมเมนต์ยาวเกินไป (สูงสุด 500 ตัวอักษร)', 'Comment too long (max 500 chars)')); return; }
    setIsSubmitting(true);
    setError('');
    try {
      const { data, error: insertErr } = await supabase
        .from('tierlist_comments')
        .insert({ list_id: listId, author_user_id: user.id, parent_comment_id: null, comment_body: body })
        .select('id, comment_body, created_at, parent_comment_id, author_user_id, author:user_profiles!tierlist_comments_author_user_id_fkey(id, name, username, avatar_url)')
        .single();
      if (insertErr) throw insertErr;
      setComments((c) => [...c, data]);
      setDraft('');
      fireNotifications(null);
    } catch {
      setError(pick('โพสต์คอมเมนต์ไม่สำเร็จ', 'Failed to post comment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitReply = async (e, parentEntry) => {
    e.preventDefault();
    if (!user?.id || !replyDraft.trim() || !supabase) return;
    const body = replyDraft.trim();
    if (body.length > 500) { setReplyError(pick('คอมเมนต์ยาวเกินไป (สูงสุด 500 ตัวอักษร)', 'Comment too long (max 500 chars)')); return; }
    setIsSubmitting(true);
    setReplyError('');
    try {
      const { data, error: insertErr } = await supabase
        .from('tierlist_comments')
        .insert({ list_id: listId, author_user_id: user.id, parent_comment_id: parentEntry.id, comment_body: body })
        .select('id, comment_body, created_at, parent_comment_id, author_user_id, author:user_profiles!tierlist_comments_author_user_id_fkey(id, name, username, avatar_url)')
        .single();
      if (insertErr) throw insertErr;
      setComments((c) => [...c, data]);
      setReplyDraft('');
      setActiveReplyId(null);
      setExpandedReplies((prev) => new Set([...prev, parentEntry.id]));
      fireNotifications(parentEntry);
    } catch {
      setReplyError(pick('โพสต์คอมเมนต์ไม่สำเร็จ', 'Failed to post comment'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyClick = (entry) => {
    const isSame = activeReplyId === entry.id;
    setActiveReplyId(isSame ? null : entry.id);
    setReplyDraft('');
    setReplyError('');
    if (!isSame) {
      setExpandedReplies((prev) => new Set([...prev, entry.id]));
      setTimeout(() => replyInputRef.current?.focus(), 50);
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesMap = {};
  comments.filter((c) => c.parent_comment_id).forEach((c) => {
    if (!repliesMap[c.parent_comment_id]) repliesMap[c.parent_comment_id] = [];
    repliesMap[c.parent_comment_id].push(c);
  });

  const renderThread = (entry) => {
    const author = entry.author_profile || entry.author || {};
    const authorName = author.name || author.username || pick('ผู้ใช้', 'User');
    const authorInitial = authorName.charAt(0).toUpperCase();
    const replies = repliesMap[entry.id] || [];
    const hasReplies = replies.length > 0;
    const isExpanded = expandedReplies.has(entry.id);
    const isReplyFormOpen = activeReplyId === entry.id;

    return (
      <div key={entry.id} className="tl-comment-thread">
        <div className="tl-comment">
          <div className="tl-comment-avatar">
            {author.avatar_url
              ? <img src={author.avatar_url} alt="" />
              : <span>{authorInitial}</span>}
          </div>
          <div className="tl-comment-body">
            <div className="tl-comment-meta">
              {author.username
                ? <Link to={`/u/${author.username}`} className="tl-comment-author">{authorName}</Link>
                : <span className="tl-comment-author">{authorName}</span>}
              <span className="tl-comment-date">{formatCmtDate(entry.created_at)}</span>
            </div>
            <p className="tl-comment-text">{entry.comment_body}</p>
            {user?.id && (
              <button
                type="button"
                className="tl-comment-reply-btn"
                onClick={() => handleReplyClick(entry)}
              >
                {pick('ตอบกลับ', 'Reply')}
              </button>
            )}
          </div>
        </div>

        {(hasReplies || isReplyFormOpen) && (
          <div className="tl-comment-thread-indent">
            {hasReplies && (
              <button
                type="button"
                className="tl-comment-show-replies-btn"
                onClick={() => toggleReplies(entry.id)}
              >
                <span className={`tl-reply-chevron${isExpanded ? ' expanded' : ''}`}>▶</span>
                {isExpanded
                  ? pick('ซ่อนการตอบกลับ', 'Hide replies')
                  : pick(`${replies.length} การตอบกลับ`, `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`)}
              </button>
            )}

            {isExpanded && (
              <div className="tl-comment-replies">
                {replies.map((reply) => {
                  const rAuthor = reply.author_profile || reply.author || {};
                  const rAuthorName = rAuthor.name || rAuthor.username || pick('ผู้ใช้', 'User');
                  const rAuthorInitial = rAuthorName.charAt(0).toUpperCase();
                  return (
                    <div key={reply.id} className="tl-comment tl-comment-reply">
                      <div className="tl-comment-avatar tl-comment-avatar-sm">
                        {rAuthor.avatar_url
                          ? <img src={rAuthor.avatar_url} alt="" />
                          : <span>{rAuthorInitial}</span>}
                      </div>
                      <div className="tl-comment-body">
                        <div className="tl-comment-meta">
                          {rAuthor.username
                            ? <Link to={`/u/${rAuthor.username}`} className="tl-comment-author">{rAuthorName}</Link>
                            : <span className="tl-comment-author">{rAuthorName}</span>}
                          <span className="tl-comment-date">{formatCmtDate(reply.created_at)}</span>
                        </div>
                        <p className="tl-comment-text">{reply.comment_body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isReplyFormOpen && (
              <form className="tl-comment-inline-form" onSubmit={(e) => submitReply(e, entry)}>
                <textarea
                  ref={replyInputRef}
                  value={replyDraft}
                  onChange={(e) => { setReplyDraft(e.target.value); setReplyError(''); }}
                  placeholder={pick(`ตอบกลับ ${authorName}...`, `Reply to ${authorName}...`)}
                  maxLength={500}
                  rows={2}
                  disabled={isSubmitting}
                  className="tl-comment-inline-textarea"
                />
                <div className="tl-comment-inline-actions">
                  <small>{replyDraft.length}/500</small>
                  {replyError && <span className="tl-comment-error">{replyError}</span>}
                  <button
                    type="button"
                    className="tl-comment-cancel-btn"
                    onClick={() => { setActiveReplyId(null); setReplyDraft(''); }}
                  >
                    {pick('ยกเลิก', 'Cancel')}
                  </button>
                  <Button type="submit" size="sm" variant="primary" disabled={isSubmitting || !replyDraft.trim()}>
                    {isSubmitting ? pick('กำลังโพสต์...', 'Posting...') : pick('ตอบกลับ', 'Reply')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="container tl-comments-section">
      <h2 className="tl-comments-title">
        <MessageSquare size={16} />
        {pick('ความคิดเห็น', 'Comments')}
        <span className="tierlist-count">{comments.length}</span>
      </h2>

      {user?.id ? (
        <form className="tl-comment-form" onSubmit={submitComment}>
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(''); }}
            placeholder={pick('เขียนความคิดเห็น...', 'Write a comment...')}
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
          />
          <div className="tl-comment-form-row">
            <small>{draft.length}/500</small>
            {error && <span className="tl-comment-error">{error}</span>}
            <Button type="submit" size="sm" variant="primary" disabled={isSubmitting || !draft.trim()}>
              {isSubmitting ? pick('กำลังโพสต์...', 'Posting...') : pick('โพสต์', 'Post')}
            </Button>
          </div>
        </form>
      ) : (
        <p className="tl-comment-login-hint">
          <Link to="/login">{pick('เข้าสู่ระบบ', 'Log in')}</Link> {pick('เพื่อแสดงความคิดเห็น', 'to leave a comment')}
        </p>
      )}

      {isLoading ? (
        <div className="tl-comment-loading"><Loader2 size={18} className="animate-spin" /></div>
      ) : topLevel.length === 0 ? (
        <p className="tl-comment-empty">{pick('ยังไม่มีความคิดเห็น มาเป็นคนแรกได้เลย', 'No comments yet. Be the first!')}</p>
      ) : (
        <div className="tl-comments-list">
          {topLevel.map((entry) => renderThread(entry))}
        </div>
      )}
    </section>
  );
}

export function TierListBrowsePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [query, setQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [page, setPage] = useState(1);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');
      // Step 1: load library fast (no full catalog needed)
      const nextLibrary = await loadTierLibrary([], { userId: user?.id || null });
      if (cancelled) return;
      setLibrary(nextLibrary);

      // Step 2: collect only title-entity IDs referenced by templates/lists for cover images
      const titleIds = [
        ...nextLibrary.templates
          .filter((t) => normalizeCatalogEntityType(t.entityType) !== CHARACTER_ENTITY_TYPE)
          .flatMap((t) => t.titleIds || []),
        ...nextLibrary.lists
          .filter((l) => normalizeCatalogEntityType(l.entityType) !== CHARACTER_ENTITY_TYPE)
          .flatMap((l) => [
            ...(l.rows || []).flatMap((r) => r.titleIds || []),
            ...(l.poolTitleIds || []),
          ]),
      ];

      // Step 3: fetch only those titles (not the full catalog)
      const fetchedTitles = await getTitlesByIds(titleIds);
      if (cancelled) return;
      setTitles(filterTitlesForAgeGate(fetchedTitles, showAdult));
      setIsLoading(false);
    }
    load().catch((error) => {
      if (!cancelled) {
        setLoadError(error?.message || pick('โหลดหน้า Tier List ไม่สำเร็จ', 'Failed to load tier lists'));
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [pick, showAdult, user?.id]);

  const entityMaps = useMemo(
    () => buildEntityMaps(titles),
    [titles]
  );
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
      if (entityTypeFilter !== 'all' && normalizeCatalogEntityType(template.entityType) !== entityTypeFilter) return false;
      if (category !== 'all' && template.category !== category) return false;
      if (!normalizedQuery) return true;
      const haystack = `${template.title} ${template.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [category, entityTypeFilter, publicTemplates, query]);

  const pagedTemplates = useMemo(() => {
    const sorted = sortTemplates(filteredTemplates, sortBy);
    return paginate(sorted, page, BROWSE_PAGE_SIZE);
  }, [filteredTemplates, page, sortBy]);

  const handlePlayTemplate = async (template) => {
    try {
      const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
      const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, library, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
      const ownerUsername = getCurrentUsername(user);
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      setLibrary(libraryAfterList);
      navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemixList = async (list) => {
    try {
      const saved = await saveTierList(buildRemixedTierList(list, user), library, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  const categoryOptions = ['all', ...new Set(
    publicTemplates
      .filter((template) => entityTypeFilter === 'all' || normalizeCatalogEntityType(template.entityType) === entityTypeFilter)
      .map((template) => template.category)
      .filter(Boolean)
  )];
  const hasActiveFilters = entityTypeFilter !== 'all' || category !== 'all' || query.trim().length > 0 || sortBy !== 'popular';

  if (loadError && !isLoading) {
    return (
      <div className="tierlist-page">
        <section className="container tierlist-section">
          <TierListErrorPanel
            message={loadError}
            onRetry={() => window.location.reload()}
            backLabel={pick('กลับหน้าแรก', 'Back home')}
            backTo="/"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="tierlist-page">
      <div className="container tierlist-browse-header">
        <div className="tierlist-browse-header-left">
          <h1><Compass size={17} /> {pick('สำรวจ Tier Lists', 'Explore Tier Lists')}</h1>
          {!isLoading && (
            <span className="tierlist-count">{filteredTemplates.length} {pick('เทมเพลต', 'templates')}</span>
          )}
        </div>
        <Link className="btn btn-primary btn-sm" to="/tierlist/create">
          <Plus size={13} /> {pick('สร้างเทมเพลต', 'Create Template')}
        </Link>
      </div>

      <div className="container tierlist-browse-filters">
        <div className="tierlist-browse-cats">
          {[
            { value: 'all', label: pick('ทั้งหมด', 'All') },
            ...ENTITY_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              className={`tierlist-cat-pill${entityTypeFilter === option.value ? ' is-active' : ''}`}
              onClick={() => {
                setEntityTypeFilter(option.value);
                setCategory('all');
                setPage(1);
              }}
              aria-pressed={entityTypeFilter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="tierlist-browse-cats">
          {categoryOptions.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`tierlist-cat-pill${category === cat ? ' is-active' : ''}`}
              onClick={() => { setCategory(cat); setPage(1); }}
              aria-pressed={category === cat}
            >
              {cat === 'all' ? pick('ทั้งหมด', 'All') : cat}
            </button>
          ))}
        </div>
        <div className="tierlist-browse-search" role="group" aria-label={pick('ควบคุมการค้นหาเทมเพลต', 'Template search controls')}>
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            placeholder={pick('ค้นหาเทมเพลตหรือคำอธิบาย...', 'Search templates or descriptions...')}
            aria-label={pick('ค้นหาเทมเพลต', 'Search templates')}
          />
          {query ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setQuery(''); setPage(1); }}
              aria-label={pick('ล้างคำค้นหา', 'Clear search')}
            >
              <X size={14} />
            </Button>
          ) : null}
          <SortSelect
            value={sortBy}
            onChange={(value) => { setSortBy(value); setPage(1); }}
            label={pick('เรียงลำดับ', 'Sort')}
            className="tierlist-browse-sorter"
          >
            <option value="popular">{pick('ยอดนิยม', 'Popular')}</option>
            <option value="newest">{pick('ใหม่ล่าสุด', 'Newest')}</option>
            <option value="alphabet">{pick('ก-ฮ', 'A-Z')}</option>
          </SortSelect>
        </div>
      </div>

      <section className="container tierlist-section">
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
                onClick={() => {
                  setEntityTypeFilter('all');
                  setCategory('all');
                  setQuery('');
                  setSortBy('popular');
                  setPage(1);
                }}
              >
                {pick('ล้างตัวกรอง', 'Clear filters')}
              </Button>
            ) : null}
          />
        ) : (
          <div className="tierlist-browse-grid">
            {pagedTemplates.items.map((template) => {
              const entityById = getEntityMap(entityMaps, template.entityType);
              const cover = template.titleIds
                .slice(0, 4)
                .map((id) => entityById.get(Number(id)))
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
                    <small className="tierlist-chip">{template.category || pick('ทั่วไป', 'General')}</small>
                    <h3>{template.title}</h3>
                    <small className="tierlist-meta">
                      {template.titleIds.length} {pick('เรื่อง', 'titles')} · {template.plays || 0} {pick('ครั้งที่เล่น', 'plays')}
                    </small>
                    {template.description ? <p>{template.description}</p> : null}
                  </div>
                  <div className="tierlist-browse-card-actions">
                    <Link className="btn btn-ghost btn-sm" to={`/tierlist/template/${template.id}`}>
                      {pick('ดูรายละเอียด', 'View details')}
                    </Link>
                    <Button size="sm" variant="primary" onClick={() => handlePlayTemplate(template)}>
                      {pick('เล่นเลย', 'Play now')}
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
              {pick('ก่อนหน้า', 'Previous')}
            </Button>
            <span>{pagedTemplates.page} / {pagedTemplates.totalPages}</span>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronRight size={14} />}
              disabled={pagedTemplates.page >= pagedTemplates.totalPages}
              onClick={() => setPage((current) => Math.min(pagedTemplates.totalPages, current + 1))}
            >
              {pick('ถัดไป', 'Next')}
            </Button>
          </div>
        )}
      </section>

      <section className="container tierlist-section">
        <Link className="tierlist-songs-banner glass-heavy" to="/tierlist/songs">
          <div className="tierlist-songs-banner-icon"><Music size={28} /></div>
          <div className="tierlist-songs-banner-copy">
            <h2>{pick('จัดอันดับเพลงเปิด-ปิด', 'Rank Opening & Ending Songs')}</h2>
            <p>{pick('เลือกเรื่องที่มีข้อมูลเพลง แล้วจัดอันดับ OP/ED ในแบบของคุณเอง', 'Pick a title with song data and build your own OP/ED tier list.')}</p>
          </div>
          <span className="btn btn-primary btn-sm">
            {pick('ดู Song Tier Lists', 'Explore Song Tier Lists')} <ArrowRight size={13} />
          </span>
        </Link>
      </section>

      {recentCommunityLists.length > 0 && (
        <section className="container tierlist-section">
          <div className="tierlist-section-head">
            <h2>{pick('อันดับชุมชนล่าสุด', 'Fresh Community Rankings')}</h2>
            <Link className="tierlist-inline-link" to="/tierlist">
              {pick('ดูเทมเพลตทั้งหมด', 'Explore templates')}
            </Link>
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
      )}
    </div>
  );
}

export function TierListTemplatePage() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
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
        setLoadError(pick('ไม่พบเทมเพลต', 'Template not found'));
        return;
      }

      setTemplate(found);
      setIsTemplateLoading(false);

      // For character templates: still need full catalog; for others: fetch only needed IDs
      const isCharacterType = normalizeCatalogEntityType(found.entityType) === CHARACTER_ENTITY_TYPE;
      let fetchedTitles;
      if (isCharacterType) {
        fetchedTitles = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY, includeCharacters: true });
      } else {
        const communityListIds = loadedLibrary.lists
          .filter((l) => String(l.templateId) === String(templateId))
          .flatMap((l) => [
            ...(l.rows || []).flatMap((r) => r.titleIds || []),
            ...(l.poolTitleIds || []),
          ]);
        fetchedTitles = await getTitlesByIds([...found.titleIds, ...communityListIds]);
      }
      if (cancelled) return;
      setTitles(filterTitlesForAgeGate(fetchedTitles, showAdult));
      setIsPreviewLoading(false);
    }

    load().catch((error) => {
      if (cancelled) return;
      setIsTemplateLoading(false);
      setIsPreviewLoading(false);
      setLoadError(error?.message || pick('โหลดเทมเพลตไม่สำเร็จ', 'Failed to load template'));
    });

    return () => { cancelled = true; };
  }, [pick, templateId, showAdult, user?.id]);

  const entityMaps = useMemo(() => buildEntityMaps(titles), [titles]);
  const titleById = useMemo(
    () => getEntityMap(entityMaps, template?.entityType),
    [entityMaps, template?.entityType]
  );

  const relatedPublicLists = useMemo(
    () => sortListsByRecentAndPopularity(
      library.lists.filter((list) => (
        list.isPublic &&
        String(list.templateId || '') === String(templateId) &&
        hasVisibleTierListTitles(list, titleById)
      ))
    ),
    [library.lists, templateId, titleById]
  );

  const handlePlay = async () => {
    try {
      const updatedTemplate = { ...template, plays: Number(template.plays || 0) + 1 };
      const libraryAfterTemplate = await saveTierTemplate(updatedTemplate, library, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(updatedTemplate.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || updatedTemplate;
      setLibrary(libraryAfterTemplate);
      setTemplate(savedTemplate);
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog(list, savedTemplate.titleIds);
      const ownerUsername = getCurrentUsername(user);
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('เริ่มเล่นเทมเพลตไม่สำเร็จ', 'Failed to start this template'));
    }
  };

  const handleRemix = async (list) => {
    try {
      const saved = await saveTierList(buildRemixedTierList(list, user), library, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
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

  return (
    <div className="tierlist-page">
      <section className="container tierlist-hero">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('รายละเอียดเทมเพลต', 'Template Detail')}</span>
          <h1>{template.title}</h1>
          <p>{template.description || pick('ยังไม่มีคำอธิบาย', 'No description yet.')}</p>
          <div className="tierlist-hero-actions">
            <Link className="btn btn-ghost" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
            <Button variant="primary" iconRight={<ArrowRight size={14} />} onClick={handlePlay}>
              {pick('เล่นเทมเพลตนี้', 'Play This Template')}
            </Button>
          </div>
        </div>
        <div className="tierlist-hero-panel glass-heavy">
          <div className="tierlist-stat"><strong>{template.titleIds.length}</strong><span>{pick('เรื่อง', 'Titles')}</span></div>
          <div className="tierlist-stat"><strong>{template.plays || 0}</strong><span>{pick('ครั้งที่เล่น', 'Plays')}</span></div>
          <div className="tierlist-stat"><strong>{relatedPublicLists.length}</strong><span>{pick('รีมิกซ์สาธารณะ', 'Public remixes')}</span></div>
        </div>
      </section>

      <section className="container tierlist-section">
        <div className="tierlist-section-head">
          <h2>{pick('ตัวอย่างเรื่อง', 'Preview Titles')}</h2>
        </div>
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

export function TierListCreatePage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const [pagedEntries, setPagedEntries] = useState([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [category, setCategory] = useState('anime');
  const [entityType, setEntityType] = useState(TITLE_ENTITY_TYPE);
  const [typeFilter, setTypeFilter] = useState('all');
  const [titleQuery, setTitleQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedEntityCache, setSelectedEntityCache] = useState(new Map());
  // Song-specific state
  const [browsingTitle, setBrowsingTitle] = useState(null);
  const [songEntityCache, setSongEntityCache] = useState(new Map());
  const [isSongsLoading, setIsSongsLoading] = useState(false);

  // Initialise library in background (no catalog needed)
  useEffect(() => {
    loadTierLibrary([], { userId: user?.id || null }).catch(() => {});
  }, [user?.id]);

  // Debounce search query and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(titleQuery);
      setCatalogPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [titleQuery]);

  // Server-side paginated fetch for all entity types (title, character, song)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    const isCharMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;
    const fetchFn = isCharMode ? getCharactersPage : getTitlesPage;
    fetchFn({
      type: typeFilter === 'all' ? undefined : typeFilter,
      query: debouncedQuery,
      page: catalogPage,
      pageSize: 30,
      showAdult,
    }).then((result) => {
      if (cancelled) return;
      setPagedEntries(result.items);
      setCatalogTotalPages(result.totalPages);
      setCatalogTotal(result.total);
      setIsLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลดแคตตาล็อกสำหรับสร้างเทมเพลตไม่สำเร็จ', 'Failed to load the catalog for template creation'));
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [entityType, typeFilter, debouncedQuery, catalogPage, showAdult, pick]);

  // Load songs when user drills into a title (song picker mode)
  useEffect(() => {
    const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;
    if (!isSongMode || !browsingTitle) return undefined;
    const titleId = Number(browsingTitle.id);
    if (songEntityCache.has(titleId)) return undefined;
    let cancelled = false;
    setIsSongsLoading(true);
    supabase
      .from('title_theme_songs')
      .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
      .eq('canonical_title_id', titleId)
      .order('display_order')
      .then(({ data, error }) => {
        if (cancelled) return;
        setIsSongsLoading(false);
        if (error || !data) return;
        const entities = data.map((song) => buildThemeSongEntity(song, browsingTitle));
        setSongEntityCache((prev) => {
          const next = new Map(prev);
          next.set(titleId, entities);
          return next;
        });
      });
    return () => { cancelled = true; };
  }, [browsingTitle, entityType, songEntityCache]);

  const isCharacterMode = normalizeCatalogEntityType(entityType) === CHARACTER_ENTITY_TYPE;

  const catalogEntries = useMemo(() => pagedEntries, [pagedEntries]);

  // All modes are now server-side paginated
  const filtered = useMemo(() => catalogEntries, [catalogEntries]);

  const selectedTitles = useMemo(
    () => Array.from(selectedIds).map((id) => selectedEntityCache.get(id)).filter(Boolean),
    [selectedIds, selectedEntityCache]
  );

  const isSongMode = normalizeCatalogEntityType(entityType) === THEME_SONG_ENTITY_TYPE;

  // Titles for browsing in song mode — already filtered server-side
  const filteredForSongBrowse = useMemo(() => {
    if (!isSongMode) return [];
    return pagedEntries;
  }, [isSongMode, pagedEntries]);

  // Songs currently shown in the drill-down panel
  const currentBrowseSongs = useMemo(() => {
    if (!isSongMode || !browsingTitle) return [];
    return songEntityCache.get(Number(browsingTitle.id)) || [];
  }, [isSongMode, browsingTitle, songEntityCache]);

  // All selected song entities (accumulated across titles)
  const selectedSongEntities = useMemo(() => {
    if (!isSongMode) return [];
    const result = [];
    for (const songs of songEntityCache.values()) {
      songs.forEach((s) => { if (selectedIds.has(s.id)) result.push(s); });
    }
    return result;
  }, [isSongMode, selectedIds, songEntityCache]);

  const hasActiveFilters = typeFilter !== 'all' || titleQuery.trim().length > 0;

  const toggleTitle = (id, entity) => {
    const numId = Number(id);
    const isCurrentlySelected = selectedIds.has(numId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) next.delete(numId);
      else next.add(numId);
      return next;
    });
    setSelectedEntityCache((prev) => {
      const next = new Map(prev);
      if (isCurrentlySelected) next.delete(numId);
      else if (entity) next.set(numId, entity);
      return next;
    });
  };

  const handleCreate = async () => {
    const entitiesToUse = isSongMode ? selectedSongEntities : selectedTitles;
    const minCount = isSongMode ? 2 : 8;
    if (entitiesToUse.length < minCount) {
      toast.error(
        isSongMode
          ? pick('กรุณาเลือกอย่างน้อย 2 เพลง', 'Please select at least 2 songs')
          : pick('กรุณาเลือกอย่างน้อย 8 เรื่อง', 'Please select at least 8 titles')
      );
      return;
    }

    setIsSaving(true);
    try {
      const template = createTemplateFromCatalog(entitiesToUse, {
        title: templateName.trim() || (isSongMode ? pick('เทมเพลตเพลงใหม่', 'New Song Template') : pick('เทมเพลตใหม่', 'New Template')),
        description: templateDesc.trim(),
        category: isSongMode ? 'songs' : category,
        entityType,
        isPublic: true,
        isSystem: false,
        defaultRows: ['S', 'A', 'B', 'C', 'D'],
        ownerUserId: user?.id || null,
      });

      const currentLibrary = await loadTierLibrary(titles, { userId: user?.id || null });
      const libraryAfterTemplate = await saveTierTemplate(template, currentLibrary, { userId: user?.id || null });
      const savedTemplate = findTierTemplate(template.id, libraryAfterTemplate) || libraryAfterTemplate.templates[0] || template;
      const list = buildTierListFromTemplate(savedTemplate);
      const seeded = seedPoolFromCatalog(list, entitiesToUse.map((e) => Number(e.id)));
      const ownerUsername = getCurrentUsername(user);
      const libraryAfterList = await saveTierList({
        ...seeded,
        ownerName: ownerUsername || 'You',
        ownerUsername,
        ownerUserId: user?.id || null,
      }, libraryAfterTemplate, { userId: user?.id || null });
      navigate(`/tierlist/play/${libraryAfterList.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('บันทึกไม่สำเร็จ', 'Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

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
      <section className="container tierlist-hero">
        <div className="tierlist-hero-copy">
          <span className="tierlist-kicker"><Sparkles size={14} /> {pick('สร้าง Tier List', 'Create Tier List')}</span>
          <h1>{pick('สร้างเทมเพลตจากข้อมูลในแคตตาล็อก', 'Create a template from catalog data')}</h1>
          <p>{pick('เลือกเรื่องที่อยากจัดอันดับ ตั้งชื่อเทมเพลต แล้วเริ่มเล่นได้ทันที', 'Pick the titles you want to rank, name the template, and start playing right away.')}</p>
        </div>
      </section>

      <section className="container tierlist-toolbar glass-heavy">
        <label className="tierlist-field">
          <span>{pick('ชื่อเทมเพลต', 'Template name')}</span>
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={pick('เช่น Best Romance 2026', 'e.g. Best Romance 2026')}
          />
        </label>

        <label className="tierlist-field">
          <span>{pick('คำอธิบาย', 'Description')}</span>
          <input
            value={templateDesc}
            onChange={(event) => setTemplateDesc(event.target.value)}
            placeholder={pick('อธิบายสั้น ๆ ว่าเทมเพลตนี้เหมาะกับอะไร', 'Add a short description for this template')}
          />
        </label>

        {!isSongMode && (
          <label className="tierlist-field">
            <span>{pick('หมวดหมู่', 'Category')}</span>
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={pick('เช่น anime / manga / action / romance', 'e.g. anime / manga / action / romance')}
            />
          </label>
        )}

        <label className="tierlist-field">
          <span>Catalog</span>
          <select
            value={entityType}
            onChange={(event) => {
              setEntityType(normalizeCatalogEntityType(event.target.value));
              setSelectedIds(new Set());
              setSelectedEntityCache(new Map());
              setBrowsingTitle(null);
              setTypeFilter('all');
              setTitleQuery('');
              setCatalogPage(1);
            }}
          >
            {ENTITY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="tierlist-toolbar-actions">
          <Link className="btn btn-ghost btn-sm" to="/tierlist">{pick('กลับไปหน้ารวม', 'Back to Browse')}</Link>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={isLoading || isSaving || (isSongMode ? selectedSongEntities.length < 2 : selectedIds.size < 8)}
          >
            {isSaving
              ? pick('กำลังสร้าง...', 'Creating...')
              : `${pick('สร้างและเล่น', 'Create & Play')}${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
          </Button>
        </div>
      </section>

      {/* ── Song picker (song mode only) ── */}
      {isSongMode ? (
        <section className="container tierlist-section">
          {browsingTitle ? (
            // ── Song drill-down: songs of the selected title ──
            <>
              <div className="tierlist-section-head">
                <div className="tierlist-songs-drilldown-head">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowsingTitle(null)}
                  >
                    <ChevronLeft size={14} /> {pick('กลับเลือกเรื่อง', 'Back to titles')}
                  </button>
                  <h2>
                    {getCatalogEntityName(browsingTitle)}
                    <span className="tierlist-count">
                      &nbsp;·&nbsp;
                      {currentBrowseSongs.filter((s) => selectedIds.has(s.id)).length}/{currentBrowseSongs.length} {pick('เพลงที่เลือก', 'songs selected')}
                    </span>
                  </h2>
                </div>
                <div className="tierlist-picker-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.add(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.length === 0}
                  >
                    {pick('เลือกทั้งหมด', 'Select All')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedIds((prev) => {
                      const next = new Set(prev);
                      currentBrowseSongs.forEach((s) => next.delete(s.id));
                      return next;
                    })}
                    disabled={currentBrowseSongs.every((s) => !selectedIds.has(s.id))}
                  >
                    {pick('ยกเลิกทั้งหมด', 'Deselect All')}
                  </button>
                </div>
              </div>

              {isSongsLoading ? (
                <TierListEmptyPanel
                  icon={<Loader2 size={24} className="animate-spin" />}
                  title={pick('กำลังโหลดเพลง', 'Loading songs')}
                  message={pick('กำลังดึงรายการเพลงสำหรับเรื่องนี้', 'Fetching song list for this title.')}
                />
              ) : currentBrowseSongs.length === 0 ? (
                <TierListEmptyPanel
                  icon={<Music size={24} />}
                  title={pick('ไม่พบเพลงสำหรับเรื่องนี้', 'No songs found for this title')}
                  message={pick('เรื่องนี้ยังไม่มีข้อมูลเพลงในระบบ', 'This title has no song data in the database.')}
                />
              ) : (
                <div className="tierlist-song-picker-list">
                  {currentBrowseSongs.map((song) => {
                    const selected = selectedIds.has(song.id);
                    return (
                      <button
                        key={song.id}
                        type="button"
                        className={`tierlist-song-picker-row${selected ? ' is-selected' : ''}`}
                        onClick={() => toggleTitle(song.id)}
                        aria-pressed={selected}
                      >
                        <div className="tierlist-song-picker-thumb">
                          <img src={getTitleArtwork(song)} alt="" loading="lazy" />
                        </div>
                        <div className="tierlist-song-picker-info">
                          <strong>{song.song_title || getCatalogEntityName(song)}</strong>
                          <span>{[song.theme_label, song.artist_name].filter(Boolean).join(' · ')}</span>
                          {song.episodes_text ? <small>{song.episodes_text}</small> : null}
                        </div>
                        <span className="tierlist-song-picker-check" aria-hidden="true">
                          {selected ? <span className="tierlist-picker-check-dot is-on" /> : <span className="tierlist-picker-check-dot" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            // ── Title browser: pick which title to drill into ──
            <>
              <div className="tierlist-section-head">
                <h2>
                  {pick('เลือกเรื่องที่ต้องการเพลง', 'Pick a title to browse songs')}
                  {selectedIds.size > 0 && (
                    <span className="tierlist-count">&nbsp;· {selectedIds.size} {pick('เพลงที่เลือกแล้ว', 'songs selected')}</span>
                  )}
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
                        onClick={() => setTypeFilter(type)}
                        aria-pressed={typeFilter === type}
                      >
                        {type === 'all' ? pick('ทุกประเภท', 'All Types') : type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className="tierlist-picker-search-wrap">
                    <input
                      className="tierlist-picker-search"
                      value={titleQuery}
                      onChange={(e) => setTitleQuery(e.target.value)}
                      placeholder={pick('ค้นหาชื่อเรื่อง...', 'Search titles...')}
                    />
                    {titleQuery && (
                      <button type="button" className="tierlist-picker-search-clear" onClick={() => setTitleQuery('')}>
                        <X size={14} />
                      </button>
                    )}
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
                <div className="tierlist-picker-grid">
                  {filteredForSongBrowse.map((title) => {
                    const titleSongs = songEntityCache.get(Number(title.id)) || [];
                    const selectedCount = titleSongs.filter((s) => selectedIds.has(s.id)).length;
                    return (
                      <button
                        key={title.id}
                        type="button"
                        className={`tierlist-picker-card${selectedCount > 0 ? ' is-selected' : ''}`}
                        onClick={() => setBrowsingTitle(title)}
                        title={getDisplayName(title)}
                      >
                        <div className="tierlist-picker-thumb">
                          <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                          {selectedCount > 0 && (
                            <div className="tierlist-picker-check">
                              <Music size={10} /> {selectedCount}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        /* ── Normal title/character picker ── */
        <section className="container tierlist-section">
          <div className="tierlist-section-head">
            <h2>
              {pick('เลือกเรื่อง', 'Select Titles')}
              {selectedIds.size > 0 && (
                <span className="tierlist-count">&nbsp;· {selectedIds.size} {pick('รายการที่เลือก', 'selected')}</span>
              )}
            </h2>
            <div className="tierlist-picker-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const toAdd = filtered.filter((t) => !selectedIds.has(Number(t.id)));
                  setSelectedIds((prev) => { const n = new Set(prev); toAdd.forEach((t) => n.add(Number(t.id))); return n; });
                  setSelectedEntityCache((prev) => { const n = new Map(prev); toAdd.forEach((t) => n.set(Number(t.id), t)); return n; });
                }}
                disabled={filtered.length === 0}
              >
                {pick('เลือกทั้งหมด', 'Select All')}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setSelectedIds(new Set()); setSelectedEntityCache(new Map()); }}
                disabled={selectedIds.size === 0}
              >
                {pick('ล้าง', 'Clear')}
              </button>
            </div>
          </div>

          <div className="tierlist-picker-filterbar">
            <div className="tierlist-picker-filterbar-top">
              <div className="tierlist-picker-type-pills" role="toolbar" aria-label={pick('กรองตามประเภท', 'Filter by type')}>
                {['all', 'anime', 'manga', 'manhwa'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`tierlist-cat-pill${typeFilter === type ? ' is-active' : ''}`}
                    onClick={() => { setTypeFilter(type); setCatalogPage(1); }}
                    aria-pressed={typeFilter === type}
                  >
                    {type === 'all' ? pick('ทุกประเภท', 'All Types') : type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
              <div className="tierlist-picker-search-wrap">
                <input
                  className="tierlist-picker-search"
                  value={titleQuery}
                  onChange={(event) => setTitleQuery(event.target.value)}
                  placeholder={pick('ค้นหาเรื่อง...', 'Search titles...')}
                  aria-label={pick('ค้นหาเรื่อง', 'Search titles')}
                />
                {titleQuery && (
                  <button
                    type="button"
                    className="tierlist-picker-search-clear"
                    onClick={() => setTitleQuery('')}
                    aria-label={pick('ล้างคำค้นหา', 'Clear search')}
                  ><X size={14} /></button>
                )}
              </div>
              <span className="tierlist-picker-result-count">
                {catalogTotal} {pick('เรื่อง', 'titles')}
              </span>
            </div>
          </div>

          {isLoading ? (
            <TierListEmptyPanel
              icon={<Loader2 size={28} className="animate-spin" />}
              title={pick('กำลังโหลดแคตตาล็อก', 'Loading catalog')}
              message={pick('กำลังเตรียมรายการเรื่องให้เลือกสำหรับสร้างเทมเพลต', 'Preparing titles you can use in this template.')}
            />
          ) : filtered.length === 0 ? (
            <TierListEmptyPanel
              icon={<Search size={28} />}
              title={pick('ไม่พบเรื่องที่ตรง', 'No titles found')}
              message={
                hasActiveFilters
                  ? pick('ลองล้างคำค้นหา ปิดตัวกรองบางตัว หรือเลือกทุกประเภท', 'Try clearing search, relaxing filters, or switching back to all types.')
                  : pick('ยังไม่มีข้อมูลเรื่องให้เลือกในตอนนี้', 'There are no titles available to pick right now.')
              }
              action={hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setTypeFilter('all'); setTitleQuery(''); setCatalogPage(1); }}
                >
                  {pick('ล้างตัวกรอง', 'Clear filters')}
                </Button>
              ) : null}
            />
          ) : (
            <>
              <div className="tierlist-picker-grid">
                {filtered.map((title) => {
                  const selected = selectedIds.has(Number(title.id));
                  return (
                    <button
                      key={title.id}
                      type="button"
                      className={`tierlist-picker-card${selected ? ' is-selected' : ''}`}
                      onClick={() => toggleTitle(Number(title.id), title)}
                      title={getDisplayName(title)}
                      aria-pressed={selected}
                    >
                      <div className="tierlist-picker-thumb">
                        <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                        {selected && <div className="tierlist-picker-check">{pick('เลือกแล้ว', 'Selected')}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {catalogTotalPages > 1 && (
                <div className="tierlist-picker-pagination">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={catalogPage <= 1}
                    onClick={() => setCatalogPage((p) => p - 1)}
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
                    onClick={() => setCatalogPage((p) => p + 1)}
                  >
                    {pick('ถัดไป', 'Next')} <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function TierListPlayPage() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { pick } = useLanguage();
  const { user } = useAuth();
  const { showAdult } = useAgeGate();
  const [titles, setTitles] = useState([]);
  const [library, setLibrary] = useState({ templates: [], lists: [] });
  const [tierList, setTierList] = useState(null);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [songEntityMap, setSongEntityMap] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError('');

      const initialLibrary = await loadTierLibrary([], { userId: user?.id || null });
      if (!cancelled) {
        setLibrary(initialLibrary);
      }
      const quickList = findTierList(listId, initialLibrary);
      if (!cancelled && quickList) {
        setTierList(quickList);
      }

      const list = findTierList(listId, initialLibrary);
      if (!list) {
        setLoadError(pick('ไม่พบ Tier List', 'Tier list not found'));
        return;
      }
      const sourceTemplate = list.templateId
        ? findTierTemplate(list.templateId, initialLibrary)
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

      let filteredCatalog;
      if (resolvedEntityTypeForLoad === CHARACTER_ENTITY_TYPE) {
        // Character lists still need full catalog with character data
        const catalog = await getAllTitles({ maxRows: Number.POSITIVE_INFINITY, includeCharacters: true });
        if (cancelled) return;
        filteredCatalog = filterTitlesForAgeGate(catalog, showAdult);
      } else if (resolvedEntityTypeForLoad !== THEME_SONG_ENTITY_TYPE) {
        // Title lists: fetch only the IDs referenced by this list/template
        const idsNeeded = [...new Set([
          ...allowedTitleIds,
          ...list.poolTitleIds,
          ...list.rows.flatMap((row) => row.titleIds),
        ].map(Number).filter(Boolean))];
        const catalog = await getTitlesByIds(idsNeeded);
        if (cancelled) return;
        filteredCatalog = filterTitlesForAgeGate(catalog, showAdult);
      } else {
        filteredCatalog = [];
      }
      setTitles(filteredCatalog);

      const cleanedList = filterTierListToCatalog(list, allowedTitleIds);
      if (cancelled) return;

      if (hasTierListStructureChanged(list, cleanedList)) {
        const cleanedLibrary = await saveTierList(cleanedList, initialLibrary, { userId: user?.id || null });
        if (cancelled) return;
        setLibrary(cleanedLibrary);
        setTierList(findTierList(cleanedList.id, cleanedLibrary) || cleanedList);
        return;
      }

      setTierList(cleanedList);

      // Load song entities for song-type tier lists
      const resolvedEntityType = normalizeCatalogEntityType(
        cleanedList.entityType || (sourceTemplate ? sourceTemplate.entityType : null)
      );
      if (resolvedEntityType === THEME_SONG_ENTITY_TYPE) {
        const songIds = [
          ...(sourceTemplate?.titleIds || []),
          ...cleanedList.poolTitleIds,
          ...cleanedList.rows.flatMap((row) => row.titleIds),
        ].map(Number).filter((id) => Number.isFinite(id) && id > 0);

        const uniqueSongIds = [...new Set(songIds)];
        if (uniqueSongIds.length > 0) {
          const { data: songRows, error: songErr } = await supabase
            .from('title_theme_songs')
            .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw, canonical_title_id')
            .in('id', uniqueSongIds);

          if (cancelled) return;
          if (songErr) throw songErr;

          const uniqueTitleIds = [...new Set((songRows || []).map((r) => r.canonical_title_id).filter(Boolean))];
          let titleLookup = new Map();
          if (uniqueTitleIds.length > 0) {
            const { data: titleRows } = await supabase
              .from('canonical_titles')
              .select('id, slug, title_th, title_en, title_native, cover_image, banner_image, is_adult')
              .in('id', uniqueTitleIds);
            if (cancelled) return;
            titleLookup = new Map((titleRows || []).map((t) => [t.id, { ...t, cover: t.cover_image, banner: t.banner_image }]));
          }

          const songEntities = (songRows || []).map((song) =>
            buildThemeSongEntity(song, titleLookup.get(song.canonical_title_id) || null)
          );
          setSongEntityMap(new Map(songEntities.map((e) => [e.id, e])));
        }
      }
    }
    load().catch((error) => {
      if (cancelled) return;
      setLoadError(error?.message || pick('โหลด Tier List ไม่สำเร็จ', 'Failed to load tier list'));
    });
    return () => { cancelled = true; };
  }, [listId, pick, showAdult, user?.id]);

  const sourceTemplate = tierList?.templateId ? findTierTemplate(tierList.templateId, library) : null;
  const entityMaps = useMemo(() => buildEntityMaps(titles), [titles]);
  const activeEntityType = normalizeCatalogEntityType(tierList?.entityType || sourceTemplate?.entityType);
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
        list.id !== tierList.id &&
        String(list.templateId || '') === String(tierList.templateId) &&
        hasVisibleTierListTitles(list, effectiveTitleById)
      ))
    )
    : [];

  const handleToggleVisibility = async () => {
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
      const saved = await saveTierList(buildRemixedTierList(list, user), library, { userId: user?.id || null });
      setLibrary(saved);
      navigate(`/tierlist/play/${saved.lists[0].id}`);
    } catch (error) {
      toast.error(error?.message || pick('สร้างรีมิกซ์ไม่สำเร็จ', 'Failed to create remix'));
    }
  };

  if (!tierList) {
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
              title={pick('กำลังโหลด Tier List', 'Loading tier list')}
              message={pick('กำลังเตรียมข้อมูลการจัดอันดับและเรื่องในพูล', 'Preparing the ranking board and title pool.')}
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
            const label = tierList.ownerName || tierList.ownerUsername || pick('ผู้ใช้', 'User');
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

export function SongTierListPage() {
  const { titleSlug } = useParams();
  const { pick } = useLanguage();
  const { user } = useAuth();
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

        const { data: songData, error: songError } = await supabase
          .from('title_theme_songs')
          .select('id, theme_type, theme_sequence, song_title, artist_name, episodes_text, video_url, is_creditless, is_spoiler, is_nsfw')
          .eq('canonical_title_id', title.id)
          .order('display_order');

        if (cancelled) return;
        if (songError) throw songError;

        const songEntities = (songData || []).map((song) => buildThemeSongEntity(song, title));
        setSongs(songEntities);

        if (songEntities.length === 0) {
          setLoadError(pick('ไม่มีเพลงสำหรับชื่อเรื่องนี้', 'No songs found for this title'));
          return;
        }

        // Load library to find an existing song tierlist for this title
        const library = await loadTierLibrary([], { userId: user?.id || null });
        if (cancelled) return;

        const songSourceKey = `song-source:${title.id}`;
        const existing = library.lists.find((list) => list.description === songSourceKey);

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
  }, [titleSlug, user?.id, pick]);

  const titleById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs]
  );

  const titleName = sourceTitle ? getCatalogEntityName(sourceTitle) : titleSlug;

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
            <ChevronLeft size={14} /> {pick('Song Tier Lists', 'Song Tier Lists')}
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
      const { data: songRows, error: songError } = await supabase
        .from('title_theme_songs')
        .select('canonical_title_id');

      if (cancelled) return;
      if (songError) throw songError;

      const songCountMap = new Map();
      (songRows || []).forEach((row) => {
        const id = Number(row.canonical_title_id);
        songCountMap.set(id, (songCountMap.get(id) || 0) + 1);
      });

      // Step 2: fetch only those titles (not the full catalog)
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
          <h1><Music size={17} /> {pick('Song Tier Lists', 'Song Tier Lists')}</h1>
          {!isLoading && (
            <span className="tierlist-count">{filteredTitles.length} {pick('เรื่อง', 'titles')}</span>
          )}
        </div>
        <Link className="btn btn-ghost btn-sm" to="/tierlist">
          <ChevronLeft size={13} /> {pick('Tier Lists ทั้งหมด', 'All Tier Lists')}
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
              {type === 'all' ? pick('ทุกประเภท', 'All Types') : type.charAt(0).toUpperCase() + type.slice(1)}
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
                  <img src={getTitleArtwork(title)} alt="" loading="lazy" />
                </div>
                <div className="tierlist-browse-card-body">
                  <small className="tierlist-chip">{title.type || 'anime'}</small>
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

export default TierListBrowsePage;
