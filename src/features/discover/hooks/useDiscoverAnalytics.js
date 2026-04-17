import { useCallback, useEffect, useRef } from 'react';
import { trackDiscoverEvent } from '../api/discoverAnalyticsApi';

export function useDiscoverAnalytics({
  userId,
  query,
  scope,
  titleType,
  tag,
  counts,
  searchMode,
  isLoading,
  hasAnyQuery,
  hasActiveTag,
}) {
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (isLoading) return;

    if (!hasAnyQuery && !hasActiveTag) {
      lastKeyRef.current = '';
      return;
    }

    const trackingKey = JSON.stringify({
      query: query.trim().toLowerCase(),
      tag,
      scope,
      titleType,
      counts,
      mode: searchMode,
    });

    if (lastKeyRef.current === trackingKey) return;
    lastKeyRef.current = trackingKey;

    void trackDiscoverEvent({
      eventType: 'search_view',
      userId,
      query,
      scope,
      titleType,
      tag,
      metadata: { mode: searchMode, resultCounts: counts },
    });
  }, [counts, hasActiveTag, hasAnyQuery, isLoading, query, scope, searchMode, tag, titleType, userId]);

  const trackPresetApply = useCallback((preset, source) => {
    void trackDiscoverEvent({
      eventType: 'preset_apply',
      userId,
      query: preset.query || '',
      scope: preset.scope || 'all',
      titleType: preset.titleType || 'all',
      tag: preset.tag || '',
      presetSource: source,
      metadata: { presetId: preset.id || null },
    });
  }, [userId]);

  const trackResultClick = useCallback((resultType, item, rank) => {
    void trackDiscoverEvent({
      eventType: 'result_click',
      userId,
      query,
      scope,
      titleType,
      tag,
      resultType,
      resultId: item?.id || item?.slug || item?.username || null,
      resultRank: rank,
      metadata: {
        slug: item?.slug || null,
        username: item?.username || item?.ownerUsername || item?.author_username || null,
      },
    });
  }, [query, scope, tag, titleType, userId]);

  const trackAutocompleteSelect = useCallback((item) => {
    if (!item?.id) return;
    void trackDiscoverEvent({
      eventType: 'autocomplete_select',
      userId,
      query,
      scope,
      titleType,
      tag,
      resultType: item.groupId || item.kind || 'unknown',
      resultId: item.entityId || item.id,
      metadata: {
        surface: 'discover',
        href: item.href || null,
        isRecent: item.groupId === 'recent',
      },
    });
  }, [query, scope, tag, titleType, userId]);

  const trackSavedSearchCreate = useCallback(() => {
    void trackDiscoverEvent({
      eventType: 'saved_search_create',
      userId,
      query,
      scope,
      titleType,
      tag,
      metadata: { source: 'discover_shell' },
    });
  }, [query, scope, tag, titleType, userId]);

  const trackSavedSearchUpdate = useCallback((entry, action, extra) => {
    void trackDiscoverEvent({
      eventType: 'saved_search_update',
      userId,
      query: entry.query,
      scope: entry.scope,
      titleType: entry.titleType,
      tag: entry.tag,
      metadata: { action, ...extra },
    });
  }, [userId]);

  const trackSavedSearchDelete = useCallback((entry, action = 'delete') => {
    void trackDiscoverEvent({
      eventType: 'saved_search_delete',
      userId,
      query: entry?.query ?? query,
      scope: entry?.scope ?? scope,
      titleType: entry?.titleType ?? titleType,
      tag: entry?.tag ?? tag,
      metadata: { action },
    });
  }, [query, scope, tag, titleType, userId]);

  const trackRecoveryApply = useCallback((suggestedQuery) => {
    void trackDiscoverEvent({
      eventType: 'recovery_apply',
      userId,
      query,
      scope,
      titleType,
      tag,
      metadata: { suggestedQuery },
    });
  }, [query, scope, tag, titleType, userId]);

  return {
    trackPresetApply,
    trackResultClick,
    trackAutocompleteSelect,
    trackSavedSearchCreate,
    trackSavedSearchUpdate,
    trackSavedSearchDelete,
    trackRecoveryApply,
  };
}
