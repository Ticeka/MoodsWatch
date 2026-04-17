import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { listTitles, getCacheInfo, clearTitlesCache } from '../lib/recommend';
import { clearEntitySearchCache, searchPosts, searchProfiles, searchTierlists } from '../api/entitySearchApi';
import { getSearchIntent } from '../lib/searchMatch';
import {
  TITLE_PREVIEW_SIZE,
  TITLE_PAGE_SIZE,
  ENTITY_PREVIEW_LIMIT,
  ENTITY_FULL_LIMIT,
  ENTITY_FOCUSED_PREVIEW_LIMIT,
  ENTITY_FOCUSED_FULL_LIMIT,
} from '../constants/discoverConfig';

function resolveEntityLimit(scope, query) {
  const intent = getSearchIntent(query);
  const isEntityScope = ['people', 'posts', 'tierlists'].includes(scope);

  if (!isEntityScope) {
    return intent.isBroad || intent.isShort ? ENTITY_PREVIEW_LIMIT : ENTITY_FOCUSED_PREVIEW_LIMIT;
  }
  return intent.isBroad || intent.isShort ? ENTITY_FULL_LIMIT : ENTITY_FOCUSED_FULL_LIMIT;
}

const INITIAL_TITLE_STATE = { items: [], total: 0, totalPages: 1, page: 1 };
const INITIAL_FLAG_STATE = { titles: false, posts: false, people: false, tierlists: false };
const INITIAL_ERROR_STATE = { titles: '', posts: '', people: '', tierlists: '' };

export function useDiscoverResults({
  query,
  scope,
  titleType,
  tag,
  sortBy,
  page,
  showAdult,
  userId,
  t,
}) {
  const [titlesState, setTitlesState] = useState(INITIAL_TITLE_STATE);
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [tierlists, setTierlists] = useState([]);
  const [loading, setLoading] = useState(INITIAL_FLAG_STATE);
  const [error, setError] = useState(INITIAL_ERROR_STATE);
  const [catalogInfo, setCatalogInfo] = useState(getCacheInfo());
  const loadRequestRef = useRef(0);

  const load = useCallback(async (overrides = {}) => {
    const params = {
      page: scope === 'titles' ? page : 1,
      titleType,
      query,
      tag,
      sortBy,
      scope,
      ...overrides,
    };
    const requestId = ++loadRequestRef.current;
    const titlePageSize = params.scope === 'titles' ? TITLE_PAGE_SIZE : TITLE_PREVIEW_SIZE;
    const entityLimit = resolveEntityLimit(params.scope, params.query);

    setLoading({ titles: true, posts: true, people: true, tierlists: true });
    setError(INITIAL_ERROR_STATE);

    const [titlesResult, postsResult, profilesResult, tierlistsResult] = await Promise.allSettled([
      listTitles({
        type: params.titleType,
        query: params.query,
        tag: params.tag,
        sortBy: params.sortBy,
        page: params.page,
        pageSize: titlePageSize,
        showAdult,
      }),
      searchPosts({ query: params.query, limit: entityLimit, showAdult }),
      searchProfiles({ query: params.query, limit: entityLimit }),
      searchTierlists({ query: params.query, userId, limit: entityLimit }),
    ]);

    if (requestId !== loadRequestRef.current) return;

    startTransition(() => {
      setCatalogInfo(getCacheInfo());

      if (titlesResult.status === 'fulfilled') {
        setTitlesState(titlesResult.value);
      } else {
        console.error(titlesResult.reason);
        setTitlesState(INITIAL_TITLE_STATE);
        setError((prev) => ({ ...prev, titles: titlesResult.reason?.message || t('discover.discoverCatalogError') }));
      }

      if (postsResult.status === 'fulfilled') {
        setPosts(postsResult.value);
      } else {
        console.error(postsResult.reason);
        setPosts([]);
        setError((prev) => ({ ...prev, posts: postsResult.reason?.message || t('discover.postsLoadError') }));
      }

      if (profilesResult.status === 'fulfilled') {
        setProfiles(profilesResult.value);
      } else {
        console.error(profilesResult.reason);
        setProfiles([]);
        setError((prev) => ({ ...prev, people: profilesResult.reason?.message || t('discover.peopleLoadError') }));
      }

      if (tierlistsResult.status === 'fulfilled') {
        setTierlists(tierlistsResult.value);
      } else {
        console.error(tierlistsResult.reason);
        setTierlists([]);
        setError((prev) => ({ ...prev, tierlists: tierlistsResult.reason?.message || t('discover.tierlistsLoadError') }));
      }

      setLoading(INITIAL_FLAG_STATE);
    });
  }, [page, query, scope, showAdult, sortBy, t, tag, titleType, userId]);

  useEffect(() => {
    const delay = query.trim().length >= 2 ? 220 : tag ? 120 : 0;
    const timeoutId = window.setTimeout(() => { load(); }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [load, query, tag]);

  useEffect(() => {
    const handleRebuild = () => {
      clearTitlesCache();
      clearEntitySearchCache();
      setCatalogInfo(getCacheInfo());
      load();
    };
    window.addEventListener('moodtoon:recommendations-rebuild', handleRebuild);
    return () => window.removeEventListener('moodtoon:recommendations-rebuild', handleRebuild);
  }, [load]);

  return {
    titlesState,
    posts,
    profiles,
    tierlists,
    loading,
    error,
    catalogInfo,
    retry: load,
  };
}
