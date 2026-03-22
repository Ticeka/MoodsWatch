import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, History, ListOrdered, Loader2, MessageCircle, Search, Sparkles, Users, X } from 'lucide-react';
import { SearchHighlightText } from '@/features/discover/components/SearchHighlightText';
import './SearchAutocomplete.css';

const ICONS = {
  recent: History,
  titles: BookOpen,
  posts: MessageCircle,
  people: Users,
  tierlists: ListOrdered,
  recovery: Sparkles,
};

const GROUP_LABELS = {
  recent: 'discover.recentSearchesLabel',
  titles: 'discover.scopeTitles',
  posts: 'discover.scopePosts',
  people: 'discover.scopePeople',
  tierlists: 'discover.scopeTierlists',
  recovery: 'discover.recoverySuggestedMany',
};

function SuggestionIcon({ groupId }) {
  const Icon = ICONS[groupId] || Search;
  return <Icon size={15} aria-hidden="true" />;
}

export function SearchAutocomplete({
  groups = [],
  flatItems = [],
  isLoading = false,
  isOpen = false,
  highlightedIndex = -1,
  query = '',
  variant = 'default',
  listboxId,
  t,
  crossLaneNote = null,
  onSelect,
  onSearchAll,
  onRemoveRecent,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      id={listboxId}
      className={`search-autocomplete search-autocomplete-${variant}`}
      role="listbox"
      aria-label={t('discover.autocompleteLabel')}
    >
      {isLoading ? (
        <div className="search-autocomplete-status" role="status" aria-live="polite" aria-atomic="true">
          <Loader2 size={15} className="search-autocomplete-spinner" aria-hidden="true" />
          {t('discover.autocompleteSearching')}
        </div>
      ) : null}

      {!isLoading && flatItems.length === 0 ? (
        <div className="search-autocomplete-status" role="status" aria-live="polite" aria-atomic="true">
          {t('discover.autocompleteNoResults')}
        </div>
      ) : null}

      {crossLaneNote && Array.isArray(crossLaneNote) && crossLaneNote.length > 0 ? (
        <div className="search-autocomplete-crosslane" aria-live="polite">
          {t('discover.crossLaneTitlesMissed', {
            query: query.trim(),
            lanes: crossLaneNote.map((id) => t(GROUP_LABELS[id] || id)).join(', '),
          })}
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="search-autocomplete-groups">
          {groups.map((group) => (
            <div key={group.id} className="search-autocomplete-group">
              <div id={`sac-group-${group.id}`} className="search-autocomplete-group-label" aria-hidden="true">
                <SuggestionIcon groupId={group.id} />
                <span>{t(group.labelKey || GROUP_LABELS[group.id] || 'discover.autocompleteLabel')}</span>
              </div>
              {group.id === 'recovery' ? (
                <div className="search-autocomplete-recovery-chips" role="group" aria-labelledby={`sac-group-${group.id}`}>
                  {group.items.map((item) => {
                    const isHighlighted = highlightedIndex === item.flatIndex;
                    return (
                      <Link
                        key={item.id}
                        id={item.id}
                        to={item.href}
                        role="option"
                        aria-selected={isHighlighted}
                        className={`search-autocomplete-recovery-chip ${isHighlighted ? 'is-highlighted' : ''}`}
                        onClick={() => onSelect?.(item)}
                        tabIndex={-1}
                      >
                        <Search size={11} aria-hidden="true" />
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="search-autocomplete-group-items" role="group" aria-labelledby={`sac-group-${group.id}`}>
                  {group.items.map((item) => {
                    const isHighlighted = highlightedIndex === item.flatIndex;
                    const isRecent = item.kind === 'recent';
                    return (
                      <div
                        key={item.id}
                        id={item.id}
                        className={`search-autocomplete-item ${isHighlighted ? 'is-highlighted' : ''} ${isRecent ? 'search-autocomplete-item-recent' : ''}`}
                        role="option"
                        aria-selected={isHighlighted}
                      >
                        <Link
                          to={item.href}
                          state={item.navigateState}
                          className="search-autocomplete-item-link"
                          onClick={() => onSelect?.(item)}
                          tabIndex={-1}
                        >
                          {item.thumbnailUrl ? (
                            <span className="search-autocomplete-media">
                              <img src={item.thumbnailUrl} alt="" className="search-autocomplete-thumb" loading="lazy" />
                            </span>
                          ) : (
                            <span className={`search-autocomplete-kind search-autocomplete-kind-${group.id}`}>
                              <SuggestionIcon groupId={group.id} />
                            </span>
                          )}
                          <span className="search-autocomplete-copy">
                            <strong><SearchHighlightText text={item.title} query={query} className="search-autocomplete-highlight" /></strong>
                            {item.meta ? <span><SearchHighlightText text={item.meta} query={query} className="search-autocomplete-highlight" /></span> : null}
                            {item.description ? (
                              <span className="search-autocomplete-description">
                                <SearchHighlightText text={item.description} query={query} className="search-autocomplete-highlight" />
                              </span>
                            ) : null}
                          </span>
                        </Link>
                        {isRecent && onRemoveRecent ? (
                          <button
                            type="button"
                            className="search-autocomplete-remove"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onRemoveRecent(item.entityId)}
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
          ))}
        </div>
      ) : null}

      {query.trim() ? (
        <button type="button" className="search-autocomplete-submit" onMouseDown={(event) => event.preventDefault()} onClick={onSearchAll}>
          <Search size={15} aria-hidden="true" />
          <span>{t('discover.autocompleteSearchFor', { query: query.trim() })}</span>
        </button>
      ) : null}
    </div>
  );
}
