import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bookmark,
  Compass,
  History,
  ListOrdered,
  Loader2,
  MessageCircle,
  Pin,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useSearchAutocomplete } from '@/features/discover/hooks/useSearchAutocomplete';
import { recordAutocompleteSelection } from '@/features/discover/lib/autocompleteFeedback';
import { trackDiscoverEvent } from '@/features/discover/api/discoverAnalyticsApi';
import { readRecentSearches, removeRecentSearch, writeRecentSearches } from '@/features/discover/lib/discoverSearchState';
import { SearchHighlightText } from '@/features/discover/components/SearchHighlightText';
import { useAgeGate } from '@/shared/contexts/AgeGateContext';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import './CommandPalette.css';

const GROUP_ICONS = {
  recent: History,
  titles: BookOpen,
  posts: MessageCircle,
  people: Users,
  tierlists: ListOrdered,
  recovery: Sparkles,
  pages: Compass,
};

const GROUP_LABELS_FOR_CROSSLANE = {
  people: 'discover.scopePeople',
  posts: 'discover.scopePosts',
  tierlists: 'discover.scopeTierlists',
};

// Static route definitions for page navigation search
const ROUTES = [
  { id: 'home',        href: '/',                  labelTh: 'หน้าแรก',            labelEn: 'Home',            terms: ['home', 'หน้าแรก', 'main'] },
  { id: 'discover',    href: '/discover',           labelTh: 'ค้นหา / Discover',   labelEn: 'Discover',        terms: ['discover', 'ค้นหา', 'search', 'explore', 'สำรวจ'] },
  { id: 'battle',      href: '/battle',             labelTh: 'แบทเทิล',            labelEn: 'Battle',          terms: ['battle', 'แบทเทิล', 'vote', 'voting', 'โหวต'] },
  { id: 'daily',       href: '/battle/daily',       labelTh: 'ความท้าทายรายวัน',   labelEn: 'Daily Challenge', terms: ['daily', 'challenge', 'ความท้าทาย', 'รายวัน', 'daily challenge'] },
  { id: 'leaderboard', href: '/battle/leaderboard', labelTh: 'ลีดเดอร์บอร์ด',     labelEn: 'Leaderboard',     terms: ['leaderboard', 'rank', 'ranking', 'ลีดเดอร์บอร์ด', 'อันดับ'] },
  { id: 'tierlist',    href: '/tierlist',           labelTh: 'Tier List',           labelEn: 'Tier List',       terms: ['tier list', 'tierlist', 'เทียร์ลิสต์', 'tier'] },
  { id: 'watchlist',   href: '/watchlist',          labelTh: 'ลิสต์ของฉัน',        labelEn: 'My List',         terms: ['watchlist', 'my list', 'ลิสต์', 'list', 'รายการ'] },
  { id: 'feed',        href: '/feed',               labelTh: 'ฟีด',                labelEn: 'Feed',            terms: ['feed', 'ฟีด', 'social', 'activity', 'กิจกรรม'] },
  { id: 'stats',       href: '/stats',              labelTh: 'สถิติ',               labelEn: 'Stats',           terms: ['stats', 'statistics', 'สถิติ', 'stat'] },
  { id: 'profile',     href: '/profile',            labelTh: 'โปรไฟล์',            labelEn: 'Profile',         terms: ['profile', 'โปรไฟล์', 'account', 'บัญชี'] },
];

function matchesRoute(query, route) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 1) return false;
  return route.terms.some((term) => term.toLowerCase().startsWith(q) || term.toLowerCase().includes(q));
}

function GroupIcon({ groupId }) {
  const Icon = GROUP_ICONS[groupId] || Search;
  return <Icon size={15} aria-hidden="true" />;
}

function buildDiscoverHref(query) {
  if (!query) return '/discover';
  return `/discover?q=${encodeURIComponent(query)}`;
}

function buildSavedSearchHref(saved) {
  const params = new URLSearchParams();
  if (saved.query) params.set('q', saved.query);
  if (saved.scope && saved.scope !== 'all') params.set('scope', saved.scope);
  if (saved.tag) params.set('tag', saved.tag);
  if (saved.titleType && saved.titleType !== 'all') params.set('type', saved.titleType);
  return params.toString() ? `/discover?${params.toString()}` : '/discover';
}

function savedSearchLabel(saved) {
  const parts = [];
  if (saved.label) return saved.label;
  if (saved.query) parts.push(`"${saved.query}"`);
  if (saved.scope && saved.scope !== 'all') parts.push(saved.scope);
  if (saved.tag) parts.push(`#${saved.tag}`);
  if (saved.titleType && saved.titleType !== 'all') parts.push(saved.titleType);
  return parts.join(' · ') || '/discover';
}

export function CommandPalette({ isOpen, onClose, userId = null, savedSearches = [] }) {
  const { t, language } = useLanguage();
  const { showAdult } = useAgeGate();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  const { groups, flatItems, isLoading, crossLaneNote } = useSearchAutocomplete(query, {
    enabled: isOpen,
    userId,
    recentSearches,
    surface: 'header',
    showAdult,
  });

  // Static page items matched against query
  const pageItems = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return ROUTES
      .filter((route) => matchesRoute(q, route))
      .slice(0, 4)
      .map((route) => ({
        id: `page-${route.id}`,
        entityId: route.id,
        kind: 'pages',
        title: language === 'th' ? route.labelTh : route.labelEn,
        meta: route.href,
        href: route.href,
      }));
  }, [query, language]);

  // Total navigatable items: saved searches (when no query) + autocomplete flat items + page items
  const showSavedSearches = query.trim().length === 0 && savedSearches.length > 0;
  const savedOffset = showSavedSearches ? savedSearches.length : 0;
  const pageOffset = savedOffset + flatItems.length;
  const totalItems = savedOffset + flatItems.length + pageItems.length;

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      setQuery('');
      setHighlightedIndex(-1);
      setRecentSearches(readRecentSearches());
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleSelectItem = useCallback((item) => {
    if (item.kind === 'recent') {
      setRecentSearches(readRecentSearches());
    } else {
      void recordAutocompleteSelection(query, item.id);
      void trackDiscoverEvent({
        eventType: 'autocomplete_select',
        userId,
        query,
        resultType: item.kind,
        resultId: String(item.entityId || ''),
        resultRank: item.flatIndex,
        metadata: { surface: 'cmdpalette' },
      });
    }
    onClose();
  }, [query, userId, onClose]);

  const handleSubmitSearch = useCallback(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const next = readRecentSearches();
    writeRecentSearches([normalized, ...next.filter((r) => r.toLowerCase() !== normalized.toLowerCase())]);
    void trackDiscoverEvent({
      eventType: 'search_submit',
      userId,
      query: normalized,
      metadata: { surface: 'cmdpalette' },
    });
    navigate(buildDiscoverHref(normalized));
    onClose();
  }, [query, userId, navigate, onClose]);

  // Focus trap: keep focus inside dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((idx) => (idx + 1) % Math.max(1, totalItems));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((idx) => (idx - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();

        // Saved searches range
        if (showSavedSearches && highlightedIndex >= 0 && highlightedIndex < savedSearches.length) {
          const saved = savedSearches[highlightedIndex];
          navigate(buildSavedSearchHref(saved));
          onClose();
          return;
        }

        // Autocomplete flat items range
        const flatIdx = highlightedIndex - savedOffset;
        if (flatIdx >= 0 && flatIdx < flatItems.length) {
          const item = flatItems[flatIdx];
          handleSelectItem(item);
          navigate(item.href, item.navigateState ? { state: item.navigateState } : undefined);
          return;
        }

        // Page items range
        const pageIdx = highlightedIndex - pageOffset;
        if (pageIdx >= 0 && pageIdx < pageItems.length) {
          navigate(pageItems[pageIdx].href);
          onClose();
          return;
        }

        // Submit as text search
        if (query.trim().length >= 2) {
          handleSubmitSearch();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, totalItems, showSavedSearches, savedSearches, flatItems, pageItems, savedOffset, pageOffset, query, onClose, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on backdrop click
  const handleOverlayClick = useCallback((e) => {
    if (dialogRef.current && !dialogRef.current.contains(e.target)) {
      onClose();
    }
  }, [onClose]);

  const handleRemoveRecent = useCallback((term) => {
    setRecentSearches(removeRecentSearch(term));
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="cmd-palette-overlay"
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-label={t('cmdPalette.dialogLabel')}
    >
      <div
        ref={dialogRef}
        className="cmd-palette-dialog"
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="cmd-palette-input-row">
          <Search size={18} className="cmd-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="text"
            placeholder={t('cmdPalette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            aria-label={t('cmdPalette.inputLabel')}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="button"
            className="cmd-palette-close"
            onClick={onClose}
            aria-label={t('common.close')}
            title="Esc"
          >
            Esc
          </button>
        </div>

        {/* Body */}
        <div className="cmd-palette-body" role="listbox">

          {/* Saved searches (shown only when no query) */}
          {showSavedSearches ? (
            <>
              <div className="cmd-palette-section-header">
                <Bookmark size={12} aria-hidden="true" />
                {t('cmdPalette.savedSearchesLabel')}
              </div>
              <div className="cmd-palette-saved-list">
                {savedSearches.map((saved, idx) => (
                  <button
                    key={saved.id}
                    type="button"
                    className={`cmd-palette-saved-item ${highlightedIndex === idx ? 'is-highlighted' : ''}`}
                    onClick={() => {
                      navigate(buildSavedSearchHref(saved));
                      onClose();
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    role="option"
                    aria-selected={highlightedIndex === idx}
                  >
                    <span className="cmd-palette-saved-icon">
                      <Search size={14} aria-hidden="true" />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {savedSearchLabel(saved)}
                    </span>
                    <span className="cmd-palette-saved-meta">
                      {saved.tag ? (
                        <span className="cmd-palette-tag-pill">#{saved.tag}</span>
                      ) : null}
                      {saved.scope && saved.scope !== 'all' ? (
                        <span className="cmd-palette-tag-pill">{saved.scope}</span>
                      ) : null}
                      {saved.pinned ? <span className="cmd-palette-pin-dot" aria-label={t('discover.pinSavedSearch')} /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {/* Autocomplete results */}
          {isLoading ? (
            <div className="cmd-palette-status">
              <Loader2 size={15} className="cmd-palette-spinner" aria-hidden="true" />
              {t('discover.autocompleteSearching')}
            </div>
          ) : null}

          {!isLoading && query.trim().length >= 2 && flatItems.length === 0 && pageItems.length === 0 ? (
            <div className="cmd-palette-status">
              {t('discover.autocompleteNoResults')}
            </div>
          ) : null}

          {/* Cross-lane note: titles missing but people/posts/tierlists found results */}
          {crossLaneNote && Array.isArray(crossLaneNote) && crossLaneNote.length > 0 ? (
            <div className="cmd-palette-crosslane" aria-live="polite">
              {t('discover.crossLaneTitlesMissed', {
                query: query.trim(),
                lanes: crossLaneNote.map((id) => t(GROUP_LABELS_FOR_CROSSLANE[id] || id)).join(', '),
              })}
            </div>
          ) : null}

          {groups.length > 0 ? (
            <div className="cmd-palette-groups">
              {groups.map((group) => {
                const isRecoveryGroup = group.id === 'recovery';
                return (
                  <div key={group.id} className="cmd-palette-group">
                    <div className="cmd-palette-group-label">
                      <GroupIcon groupId={group.id} />
                      <span>{t(group.labelKey || `discover.scope${group.id.charAt(0).toUpperCase() + group.id.slice(1)}`)}</span>
                    </div>

                    {/* Recovery group: render as chips */}
                    {isRecoveryGroup ? (
                      <div className="cmd-palette-recovery-chips">
                        {group.items.map((item) => {
                          const globalIdx = item.flatIndex + savedOffset;
                          const isHighlighted = highlightedIndex === globalIdx;
                          return (
                            <Link
                              key={item.id}
                              to={item.href}
                              className={`cmd-palette-recovery-chip ${isHighlighted ? 'is-highlighted' : ''}`}
                              role="option"
                              aria-selected={isHighlighted}
                              onMouseEnter={() => setHighlightedIndex(globalIdx)}
                              onClick={() => onClose()}
                              tabIndex={-1}
                            >
                              <Search size={11} aria-hidden="true" />
                              {item.title}
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="cmd-palette-group-items">
                        {group.items.map((item) => {
                          const globalIdx = item.flatIndex + savedOffset;
                          const isHighlighted = highlightedIndex === globalIdx;
                          const isRecent = item.kind === 'recent';
                          return (
                            <div
                              key={item.id}
                              className={`cmd-palette-item ${isHighlighted ? 'is-highlighted' : ''}`}
                              role="option"
                              aria-selected={isHighlighted}
                              onMouseEnter={() => setHighlightedIndex(globalIdx)}
                            >
                              <Link
                                to={item.href}
                                state={item.navigateState}
                                className="cmd-palette-item-link"
                                onClick={() => handleSelectItem(item)}
                                tabIndex={-1}
                              >
                                {item.thumbnailUrl ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt=""
                                    className="cmd-palette-item-thumb"
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className={`cmd-palette-item-kind`}>
                                    <GroupIcon groupId={group.id} />
                                  </span>
                                )}
                                <span className="cmd-palette-item-copy">
                                  <strong>
                                    <SearchHighlightText text={item.title} query={query} className="search-autocomplete-highlight" />
                                  </strong>
                                  {item.meta ? (
                                    <span>
                                      <SearchHighlightText text={item.meta} query={query} className="search-autocomplete-highlight" />
                                    </span>
                                  ) : null}
                                </span>
                              </Link>
                              {isRecent ? (
                                <button
                                  type="button"
                                  className="cmd-palette-item-remove"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleRemoveRecent(item.entityId)}
                                  aria-label={t('discover.removeRecentSearch')}
                                  tabIndex={-1}
                                >
                                  <X size={12} aria-hidden="true" />
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Pages / route navigation group */}
          {pageItems.length > 0 ? (
            <div className="cmd-palette-group">
              <div className="cmd-palette-group-label">
                <Compass size={15} aria-hidden="true" />
                <span>{t('cmdPalette.pagesLabel')}</span>
              </div>
              <div className="cmd-palette-group-items">
                {pageItems.map((item, i) => {
                  const globalIdx = pageOffset + i;
                  const isHighlighted = highlightedIndex === globalIdx;
                  return (
                    <div
                      key={item.id}
                      className={`cmd-palette-item ${isHighlighted ? 'is-highlighted' : ''}`}
                      role="option"
                      aria-selected={isHighlighted}
                      onMouseEnter={() => setHighlightedIndex(globalIdx)}
                    >
                      <Link
                        to={item.href}
                        className="cmd-palette-item-link"
                        onClick={() => onClose()}
                        tabIndex={-1}
                      >
                        <span className="cmd-palette-item-kind cmd-palette-item-kind-page">
                          <Compass size={15} aria-hidden="true" />
                        </span>
                        <span className="cmd-palette-item-copy">
                          <strong>{item.title}</strong>
                          <span className="cmd-palette-item-route">{item.meta}</span>
                        </span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Search-all footer */}
        {query.trim().length >= 2 ? (
          <div className="cmd-palette-footer">
            <button type="button" className="cmd-palette-search-all" onClick={handleSubmitSearch}>
              <Search size={15} aria-hidden="true" />
              {t('discover.autocompleteSearchFor', { query: query.trim() })}
            </button>
          </div>
        ) : null}

        {/* Keyboard hints */}
        <div className="cmd-palette-hint" aria-hidden="true">
          <span className="cmd-palette-hint-pair">
            <kbd className="cmd-palette-kbd">↑</kbd>
            <kbd className="cmd-palette-kbd">↓</kbd>
            <span>{t('cmdPalette.hintNavigate')}</span>
          </span>
          <span className="cmd-palette-hint-pair">
            <kbd className="cmd-palette-kbd">↵</kbd>
            <span>{t('cmdPalette.hintOpen')}</span>
          </span>
          <span className="cmd-palette-hint-pair">
            <kbd className="cmd-palette-kbd">Esc</kbd>
            <span>{t('cmdPalette.hintClose')}</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
