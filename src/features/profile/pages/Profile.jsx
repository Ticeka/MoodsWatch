import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Camera, Copy, Crown, Edit2, EyeOff, ExternalLink, Grid, GripVertical, Loader2, Medal, MessageSquare, Moon, RotateCcw, Save, Settings, Share2, Sliders, Sun, ToggleLeft, Trash2, Trophy, User, X } from 'lucide-react';
import { useAuth } from '@/features/auth/contexts/AuthContext';
import { useHiddenTitles } from '@/features/profile/hooks/useHiddenTitles';
import { useProfilePreferences } from '@/features/profile/hooks/useProfilePreferences';
import { Button } from '@/shared/components/ui/Button';
import { TitleCard } from '@/shared/components/ui/Card';
import { useLanguage } from '@/shared/contexts/LanguageContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { useWatchlist } from '@/features/watchlist/contexts/WatchlistContext';
import { getTitlesByIds } from '@/features/discover/lib/recommend';
import { supabase } from '@/shared/lib/supabase';
import {
  getTitleDisplayName,
  normalizeProfilePreferences,
  RECOMMENDATION_LENGTH_OPTIONS,
  RECOMMENDATION_PROGRESS_STATE_OPTIONS,
  RECOMMENDATION_TYPE_OPTIONS,
  TOP_TITLE_TYPE_OPTIONS,
} from '@/features/profile/lib/profileStore';
import { LIST_STATUS_OPTIONS, MOODS, getLocalizedLabel, getLocalizedMoodName } from '@/shared/data/moods';
import './Profile.css';

const PAGE_SIZE = 8;
const TYPE_LABELS = {
  anime: { en: 'Anime', th: '\u0e2d\u0e19\u0e34\u0e40\u0e21\u0e30' },
  manga: { en: 'Manga', th: '\u0e21\u0e31\u0e07\u0e07\u0e30' },
  manhwa: { en: 'Manhwa', th: '\u0e21\u0e31\u0e19\u0e2e\u0e27\u0e32' },
};
const LENGTH_LABELS = {
  any: { th: 'ทุกความยาว', en: 'Any length' },
  short: { th: 'สั้น', en: 'Short only' },
  long: { th: 'ยาว', en: 'Long only' },
};
const PROGRESS_LABELS = {
  untracked: { th: 'ยังไม่อยู่ในลิสต์', en: 'Untracked' },
  planned: { th: 'วางแผน', en: 'Planned' },
  watching: { th: 'กำลังดู', en: 'Watching' },
  reading: { th: 'กำลังอ่าน', en: 'Reading' },
  'on-hold': { th: 'พักไว้', en: 'On Hold' },
  completed: { th: 'จบแล้ว', en: 'Completed' },
  dropped: { th: 'ดรอป', en: 'Dropped' },
};

const TOP_SECTION_COPY = {
  overviewTitle: { th: 'Top 5 \u0e02\u0e2d\u0e07\u0e09\u0e31\u0e19', en: 'My Top 5' },
  overviewSubtitle: {
    th: '\u0e41\u0e22\u0e01\u0e15\u0e32\u0e21\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17 \u0e41\u0e25\u0e30\u0e14\u0e39\u0e44\u0e14\u0e49\u0e04\u0e23\u0e1a\u0e43\u0e19\u0e17\u0e35\u0e48\u0e40\u0e14\u0e35\u0e22\u0e27',
    en: 'Split by format and visible together in one place.',
  },
  loading: { th: '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e42\u0e2b\u0e25\u0e14 Top 5...', en: 'Loading Top 5...' },
  empty: { th: '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e40\u0e23\u0e37\u0e48\u0e2d\u0e07\u0e43\u0e19 Top 5', en: 'No titles pinned in your Top 5 yet.' },
  emptyHint: {
    th: 'แตะปุ่ม Top 5 (🏆) บนการ์ดเพื่อปัก/เอาออก',
    en: 'Tap the Top 5 trophy (🏆) button on a card to pin or remove it.',
  },
  sectionHint: {
    th: '\u0e25\u0e32\u0e01\u0e40\u0e1e\u0e37\u0e48\u0e2d\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\u0e2d\u0e31\u0e19\u0e14\u0e31\u0e1a',
    en: 'Drag to reorder.',
  },
  sectionEmptyTitle: {
    th: '\u0e0a\u0e31\u0e49\u0e19\u0e19\u0e35\u0e49\u0e22\u0e31\u0e07\u0e27\u0e48\u0e32\u0e07',
    en: 'This shelf is empty',
  },
  sectionEmptyHint: {
    th: 'กดปุ่ม 🏆 บนการ์ดเพื่อเพิ่มเรื่องเข้า Top 5 หมวดนี้',
    en: 'Press the 🏆 button on any card to add titles to this shelf.',
  },
};

const uniq = (...values) => [...new Set(values.flat().map(Number).filter(Boolean))];

const formatDate = (value, locale, withTime = false) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat(
      locale,
      withTime
        ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' }
    ).format(new Date(value));
  } catch {
    return '-';
  }
};

const formatCommentDate = (value, locale) => formatDate(value, locale, true);

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

function normalizeUsername(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function Profile() {
  const { user, isLoading: isAuthLoading, updateUserProfile } = useAuth();
  const { watchlist, isLoading: isWatchlistLoading, watchlistTitles } = useWatchlist();
  const { prefs: storedPrefs, savePreferences } = useProfilePreferences();
  const { hiddenTitleIds, getHiddenEntry, setHiddenScopes, unhideTitle, bulkUnhideTitles, error: hiddenTitlesError } = useHiddenTitles();
  const { theme, toggleTheme } = useTheme();
  const { language, t } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const profile = user?.profile || {};
  const userId = user?.id || null;
  const initialName = profile.name || user?.user_metadata?.username || user?.email?.split('@')[0] || '';
  const initialAvatarUrl = profile.avatar_url || '';

  const [activeTab, setActiveTab] = useState('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [hiddenPage, setHiddenPage] = useState(1);
  const [selectedHidden, setSelectedHidden] = useState([]);
  const [isBulkUnhiding, setIsBulkUnhiding] = useState(false);
  const [libraryTitles, setLibraryTitles] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [shareForm, setShareForm] = useState({
    username: normalizeUsername(profile.username || ''),
    isProfilePublic: Boolean(profile.is_profile_public),
    allowProfileComments: profile.allow_profile_comments !== false,
  });
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [isSharingProfile, setIsSharingProfile] = useState(false);
  const [profileComments, setProfileComments] = useState([]);
  const [isProfileCommentsLoading, setIsProfileCommentsLoading] = useState(false);
  const [profileCommentDraft, setProfileCommentDraft] = useState('');
  const [profileCommentError, setProfileCommentError] = useState('');
  const [profileCommentSuccess, setProfileCommentSuccess] = useState('');
  const [isSubmittingProfileComment, setIsSubmittingProfileComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState('');
  const [form, setForm] = useState({ name: initialName, avatarUrl: initialAvatarUrl });
  const [prefsDraft, setPrefsDraft] = useState(() => normalizeProfilePreferences(storedPrefs));
  const [dragState, setDragState] = useState({ typeId: '', fromIndex: -1, overIndex: -1 });

  useEffect(() => setForm({ name: initialName, avatarUrl: initialAvatarUrl }), [initialAvatarUrl, initialName]);
  useEffect(() => setPrefsDraft(normalizeProfilePreferences(storedPrefs)), [storedPrefs]);
  useEffect(() => {
    setShareForm({
      username: normalizeUsername(profile.username || ''),
      isProfilePublic: Boolean(profile.is_profile_public),
      allowProfileComments: profile.allow_profile_comments !== false,
    });
    setShareError('');
    setShareSuccess('');
  }, [profile.is_profile_public, profile.username]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileComments() {
      if (!userId || !supabase) {
        setProfileComments([]);
        return;
      }

      setIsProfileCommentsLoading(true);
      setProfileCommentError('');

      try {
        const { data, error } = await supabase
          .from('profile_comments')
          .select(`
            id,
            comment_body,
            created_at,
            author_user_id,
            author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
          `)
          .eq('profile_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(60);

        if (error) throw error;
        if (!cancelled) setProfileComments(data || []);
      } catch {
        if (!cancelled) setProfileCommentError(t('profile.profileCommentsLoadFailed'));
      } finally {
        if (!cancelled) setIsProfileCommentsLoading(false);
      }
    }

    loadProfileComments();
    return () => { cancelled = true; };
  }, [t, userId]);

  const watchlistMap = useMemo(() => new Map(watchlist.map((item) => [item.titleId, item])), [watchlist]);
  const watchStats = useMemo(() => watchlist.reduce((acc, item) => {
    acc.total += 1;
    acc[item.status] = (acc[item.status] || 0) + 1;
    if (item.status === 'completed' || item.status === 'dropped') acc.seen += 1;
    return acc;
  }, { total: 0, seen: 0, planned: 0, watching: 0, reading: 0, completed: 0, dropped: 0, 'on-hold': 0 }), [watchlist]);

  const profileCompletion = useMemo(() => {
    let score = 0;
    if (form.name.trim()) score += 1;
    if ((prefsDraft.bio || '').trim()) score += 1;
    if (prefsDraft.favoriteMoods.length) score += 1;
    if (watchStats.total > 0) score += 1;
    return Math.round((score / 4) * 100);
  }, [form.name, prefsDraft.bio, prefsDraft.favoriteMoods.length, watchStats.total]);

  const continueIds = useMemo(() => watchlist
    .filter((item) => item.status === 'watching' || item.status === 'reading')
    .sort((a, b) => new Date(b.lastConsumedAt || b.updatedAt || b.addedAt || 0) - new Date(a.lastConsumedAt || a.updatedAt || a.addedAt || 0))
    .slice(0, 4)
    .map((item) => item.titleId), [watchlist]);

  const topIds = useMemo(
    () => uniq(...TOP_TITLE_TYPE_OPTIONS.map((typeId) => prefsDraft.topTitles?.[typeId] || [])),
    [prefsDraft.topTitles]
  );

  const lookupIds = useMemo(
    () => uniq(continueIds, topIds, activeTab === 'settings' ? hiddenTitleIds : []),
    [activeTab, continueIds, topIds, hiddenTitleIds]
  );
  const lookupIdsKey = useMemo(() => lookupIds.join(','), [lookupIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadTitles() {
      const requestedIds = lookupIdsKey
        ? lookupIdsKey.split(',').map((value) => Number(value)).filter(Boolean)
        : [];

      if (!requestedIds.length) {
        setLibraryTitles([]);
        setLibraryError('');
        return;
      }

      setIsLibraryLoading(true);
      setLibraryError('');

      try {
        const titles = await getTitlesByIds(requestedIds);
        if (!cancelled) setLibraryTitles(titles);
      } catch (error) {
        if (!cancelled) setLibraryError(error.message || 'Failed to load titles');
      } finally {
        if (!cancelled) setIsLibraryLoading(false);
      }
    }

    loadTitles();
    return () => { cancelled = true; };
  }, [lookupIdsKey]);

  const titleMap = useMemo(() => {
    const next = new Map((watchlistTitles || []).map((title) => [title.id, title]));
    libraryTitles.forEach((title) => next.set(title.id, title));
    return next;
  }, [libraryTitles, watchlistTitles]);

  const continueTitles = useMemo(() => continueIds.map((id) => {
    const title = titleMap.get(id);
    const item = watchlistMap.get(id);
    return title ? {
      ...title,
      _listProgressEpisode: item?.progressEpisode ?? null,
      _listProgressChapter: item?.progressChapter ?? null,
    } : null;
  }).filter(Boolean), [continueIds, titleMap, watchlistMap]);

  const hiddenTitles = useMemo(() => hiddenTitleIds.map((id) => titleMap.get(id)).filter(Boolean), [hiddenTitleIds, titleMap]);
  const topSections = useMemo(() => TOP_TITLE_TYPE_OPTIONS.map((typeId) => ({
    typeId,
    titles: (prefsDraft.topTitles?.[typeId] || []).map((id, index) => {
      const title = titleMap.get(id);
      return title ? { ...title, _rank: index + 1, _typeLabel: TYPE_LABELS[typeId]?.[language] || typeId } : null;
    }).filter(Boolean),
  })), [language, prefsDraft.topTitles, titleMap]);

  const totalPinnedTopTitles = useMemo(
    () => topSections.reduce((count, section) => count + section.titles.length, 0),
    [topSections]
  );
  const getTypeLabel = (typeId) => TYPE_LABELS[typeId]?.[language] || typeId;

  const hiddenPages = Math.max(1, Math.ceil(hiddenTitles.length / PAGE_SIZE));
  useEffect(() => setHiddenPage((page) => Math.min(page, hiddenPages)), [hiddenPages]);
  useEffect(() => setSelectedHidden((current) => current.filter((id) => hiddenTitleIds.includes(id))), [hiddenTitleIds]);

  const pagedHiddenTitles = useMemo(
    () => hiddenTitles.slice((hiddenPage - 1) * PAGE_SIZE, hiddenPage * PAGE_SIZE),
    [hiddenTitles, hiddenPage]
  );

  const prefsDirty = JSON.stringify(normalizeProfilePreferences(prefsDraft)) !== JSON.stringify(normalizeProfilePreferences(storedPrefs));
  const userInitial = (form.name || user?.email || 'M').charAt(0).toUpperCase();
  const normalizedShareUsername = normalizeUsername(shareForm.username);
  const sharePath = normalizedShareUsername ? `/u/${normalizedShareUsername}` : '';
  const shareUrl = typeof window !== 'undefined' && sharePath ? `${window.location.origin}${sharePath}` : '';
  const shareDirty = normalizedShareUsername !== normalizeUsername(profile.username || '')
    || shareForm.isProfilePublic !== Boolean(profile.is_profile_public)
    || shareForm.allowProfileComments !== (profile.allow_profile_comments !== false);

  const setPrefs = (updater) => setPrefsDraft((current) => normalizeProfilePreferences(typeof updater === 'function' ? updater(current) : updater));
  const toggleArray = (field, value, allValues) => setPrefs((current) => {
    const nextValues = current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value];
    return { ...current, [field]: nextValues.length ? nextValues : [...allValues] };
  });

  const validateShareSettings = () => {
    if (!normalizedShareUsername) {
      return t('profile.shareUsernameRequired');
    }

    if (!USERNAME_REGEX.test(normalizedShareUsername)) {
      return t('profile.shareUsernameInvalid');
    }

    return '';
  };

  const saveShareSettings = async () => {
    setShareError('');
    setShareSuccess('');

    const validationError = validateShareSettings();
    if (validationError) {
      setShareError(validationError);
      return false;
    }

    setIsSavingShare(true);
    try {
      await updateUserProfile({
        username: normalizedShareUsername,
        is_profile_public: shareForm.isProfilePublic,
        allow_profile_comments: shareForm.allowProfileComments,
      });
      setShareSuccess(t('profile.shareSaved'));
      toast.success(t('profile.shareSaved'));
      return true;
    } catch (error) {
      if (error?.code === '23505') {
        setShareError(t('profile.shareUsernameTaken'));
        return false;
      }
      setShareError(t('profile.shareSaveFailed'));
      return false;
    } finally {
      setIsSavingShare(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    if (!navigator?.clipboard?.writeText) {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(shareUrl);
  };

  const shareProfile = async () => {
    setShareError('');
    setShareSuccess('');

    const validationError = validateShareSettings();
    if (validationError) {
      setShareError(validationError);
      return;
    }

    if (!shareForm.isProfilePublic) {
      setShareError(t('profile.shareNeedsPublic'));
      return;
    }

    setIsSharingProfile(true);

    try {
      if (shareDirty) {
        const saved = await saveShareSettings();
        if (!saved) return;
      }

      if (!shareUrl) {
        setShareError(t('profile.shareSaveFailed'));
        return;
      }

      const sharePayload = {
        title: t('profile.shareTitle'),
        text: t('profile.shareMessage', { name: form.name || initialName || normalizedShareUsername }),
        url: shareUrl,
      };

      if (navigator.share) {
        await navigator.share(sharePayload);
      } else {
        await copyShareUrl();
      }

      setShareSuccess(t('profile.shareCopied'));
      toast.success(t('profile.shareCopied'));
    } catch {
      setShareError(t('profile.shareFailed'));
    } finally {
      setIsSharingProfile(false);
    }
  };

  const submitProfileComment = async (event) => {
    event.preventDefault();
    if (!userId || !supabase) return;

    const commentBody = String(profileCommentDraft || '').trim();
    if (!commentBody) {
      setProfileCommentError(t('profile.profileCommentRequired'));
      setProfileCommentSuccess('');
      return;
    }
    if (commentBody.length > 500) {
      setProfileCommentError(t('profile.profileCommentTooLong'));
      setProfileCommentSuccess('');
      return;
    }

    setIsSubmittingProfileComment(true);
    setProfileCommentError('');
    setProfileCommentSuccess('');

    try {
      const { data, error } = await supabase
        .from('profile_comments')
        .insert({
          profile_user_id: userId,
          author_user_id: userId,
          comment_body: commentBody,
        })
        .select(`
          id,
          comment_body,
          created_at,
          author_user_id,
          author_profile:user_profiles!profile_comments_author_user_id_fkey(id, name, username, avatar_url)
        `)
        .single();

      if (error) throw error;
      setProfileComments((current) => [data, ...current]);
      setProfileCommentDraft('');
      setProfileCommentSuccess(t('profile.profileCommentPosted'));
    } catch {
      setProfileCommentError(t('profile.profileCommentPostFailed'));
    } finally {
      setIsSubmittingProfileComment(false);
    }
  };

  const deleteProfileComment = async (commentId) => {
    if (!commentId || !supabase) return;

    setDeletingCommentId(commentId);
    setProfileCommentError('');
    setProfileCommentSuccess('');
    try {
      const { error } = await supabase
        .from('profile_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      setProfileComments((current) => current.filter((entry) => entry.id !== commentId));
      setProfileCommentSuccess(t('profile.profileCommentDeleted'));
    } catch {
      setProfileCommentError(t('profile.profileCommentDeleteFailed'));
    } finally {
      setDeletingCommentId('');
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await updateUserProfile({ name: form.name.trim() || initialName, avatar_url: form.avatarUrl.trim() || null });
      await savePreferences(prefsDraft);
      toast.success(t('profile.profileUpdated'));
      setIsEditOpen(false);
    } catch {
      toast.error(t('profile.profileUpdateFailed'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !userId || !supabase) return;

    setIsUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('No avatar URL');
      const nextUrl = `${data.publicUrl}?t=${Date.now()}`;
      setForm((current) => ({ ...current, avatarUrl: nextUrl }));
      await updateUserProfile({ avatar_url: nextUrl });
      toast.success(t('profile.avatarUploaded'));
    } catch {
      toast.error(t('profile.avatarUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const savePrefs = async () => {
    setIsSavingPrefs(true);
    try {
      await savePreferences(prefsDraft);
      toast.success(t('profile.preferencesSaved'));
    } catch {
      toast.error(t('profile.preferencesSaveFailed'));
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const rebuildRecommendations = async () => {
    setIsRebuilding(true);
    try {
      await updateUserProfile({ last_rebuilt_at: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('moodtoon:recommendations-rebuild'));
      toast.success(t('profile.rebuildSuccess'));
    } catch {
      toast.error(t('profile.rebuildFailed'));
    } finally {
      setIsRebuilding(false);
    }
  };

  const toggleHiddenScope = async (titleId, key) => {
    const entry = getHiddenEntry(titleId);
    if (!entry) return;

    try {
      await setHiddenScopes(titleId, {
        hideFromRecommendations: key === 'recommendations' ? !entry.hideFromRecommendations : entry.hideFromRecommendations,
        hideFromDiscovery: key === 'discovery' ? !entry.hideFromDiscovery : entry.hideFromDiscovery,
      });
      toast.success(t('profile.hiddenScopeUpdated'));
    } catch {
      toast.error(t('profile.hiddenScopeUpdateFailed'));
    }
  };

  const bulkUnhide = async () => {
    if (!selectedHidden.length) return;
    setIsBulkUnhiding(true);
    try {
      await bulkUnhideTitles(selectedHidden);
      setSelectedHidden([]);
      toast.success(t('profile.updatedSelectedHiddenTitles'));
    } catch {
      toast.error(t('profile.bulkUnhideFailed'));
    } finally {
      setIsBulkUnhiding(false);
    }
  };

  const reorderTopTitles = async (typeId, fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    const currentIds = [...(prefsDraft.topTitles?.[typeId] || [])];
    if (!currentIds.length || fromIndex >= currentIds.length || toIndex >= currentIds.length) return;

    const [movedId] = currentIds.splice(fromIndex, 1);
    currentIds.splice(toIndex, 0, movedId);

    const previousPrefs = normalizeProfilePreferences(prefsDraft);
    const nextPrefs = normalizeProfilePreferences({
      ...prefsDraft,
      topTitles: {
        ...prefsDraft.topTitles,
        [typeId]: currentIds,
      },
    });

    setPrefsDraft(nextPrefs);

    try {
      await savePreferences(nextPrefs);
    } catch {
      setPrefsDraft(previousPrefs);
      toast.error(language === 'th' ? '\u0e08\u0e31\u0e14\u0e2d\u0e31\u0e19\u0e14\u0e31\u0e1a\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08' : 'Could not save the new order.');
    }
  };

  const onDragStartTopTitle = (typeId, index) => {
    setDragState({ typeId, fromIndex: index, overIndex: index });
  };

  const onDragOverTopTitle = (event, typeId, index) => {
    if (dragState.typeId !== typeId) return;
    event.preventDefault();
    if (dragState.overIndex !== index) {
      setDragState((current) => ({ ...current, overIndex: index }));
    }
  };

  const onDropTopTitle = async (event, typeId, index) => {
    event.preventDefault();
    const { typeId: dragTypeId, fromIndex } = dragState;
    setDragState({ typeId: '', fromIndex: -1, overIndex: -1 });
    if (dragTypeId !== typeId) return;
    await reorderTopTitles(typeId, fromIndex, index);
  };

  const onDragEndTopTitle = () => {
    setDragState({ typeId: '', fromIndex: -1, overIndex: -1 });
  };

  const renderRankAdornment = (rank) => {
    if (rank === 1) {
      return (
        <span className="profile-rank-badge top">
          <Crown size={14} />
          <span>#1</span>
        </span>
      );
    }

    return (
      <span className="profile-rank-badge">
        <Medal size={14} />
        <span>#{rank}</span>
      </span>
    );
  };

  if (isAuthLoading) {
    return <section className="section"><div className="container profile-loading"><Loader2 size={40} className="animate-spin" /></div></section>;
  }

  return (
    <div className="profile-page animate-fade-in">
      <section className="section">
        <div className="container">
          <div className="profile-hero glass-heavy">
            <div className="profile-hero-main">
              <div className="profile-avatar-stack">
                {form.avatarUrl ? <img src={form.avatarUrl} alt="" className="profile-avatar" /> : <div className="profile-avatar profile-avatar-fallback">{userInitial}</div>}
                <button type="button" className="profile-avatar-edit" onClick={() => setIsEditOpen(true)} aria-label={t('profile.editProfile')}>
                  <Camera size={16} />
                </button>
              </div>
              <div className="profile-hero-copy">
                <span className="profile-kicker">{t('profile.profileCenter')}</span>
                <h1>{form.name || initialName || user?.email}</h1>
                <p>{prefsDraft.bio || t('profile.profileFallbackBio')}</p>
                <div className="profile-meta-row">
                  <span>{t('profile.memberSince', { date: formatDate(profile.created_at || user?.created_at, locale) })}</span>
                  <span>{t('profile.titlesInLibrary', { count: watchStats.total })}</span>
                </div>
              </div>
            </div>
            <div className="profile-hero-side">
              <div className="profile-completion">
                <div className="profile-completion-bar"><span style={{ width: `${profileCompletion}%` }} /></div>
                <small>{t('profile.profileCompletion', { value: profileCompletion })}</small>
              </div>
              <div className="profile-hero-actions">
                <Button icon={<Edit2 size={18} />} onClick={() => setIsEditOpen(true)}>{t('profile.editProfile')}</Button>
                <Button variant="secondary" icon={<Settings size={18} />} onClick={() => setActiveTab('settings')}>{t('profile.preferences')}</Button>
              </div>
            </div>
          </div>

          <div className="profile-stats-grid">
            <article className="profile-stat-card"><span>{t('profile.seen')}</span><strong>{watchStats.seen}</strong><small>{t('profile.completedOrDropped')}</small></article>
            <article className="profile-stat-card"><span>{t('profile.watching')}</span><strong>{watchStats.watching}</strong><small>{t('profile.animeInProgress')}</small></article>
            <article className="profile-stat-card"><span>{t('profile.reading')}</span><strong>{watchStats.reading}</strong><small>{t('profile.readingProgress')}</small></article>
            <article className="profile-stat-card"><span>{t('profile.completed')}</span><strong>{watchStats.completed}</strong><small>{t('profile.finishedTitles')}</small></article>
          </div>

          <div className="profile-tabs">
            <button type="button" className={`profile-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><Grid size={18} />{t('profile.librarySummary')}</button>
            <button type="button" className={`profile-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><Settings size={18} />{t('profile.preferences')}</button>
          </div>

          {(libraryError || (activeTab === 'settings' ? hiddenTitlesError : '')) && (
            <div className="profile-inline-error">{libraryError || hiddenTitlesError}</div>
          )}

          {activeTab === 'overview' ? (
            <div className="profile-content-grid">
              <article className="profile-section-card profile-top-stage">
                <div className="profile-section-heading">
                  <div>
                    <h2>{TOP_SECTION_COPY.overviewTitle[language]}</h2>
                    <p>{TOP_SECTION_COPY.overviewSubtitle[language]}</p>
                  </div>
                </div>

                {isLibraryLoading ? (
                  <div className="profile-empty-state">
                    <Loader2 size={20} className="animate-spin" />
                    <span>{TOP_SECTION_COPY.loading[language]}</span>
                  </div>
                ) : (
                  <div className="profile-top-showcase-shell compact">
                    <div className="profile-top-overview-meta">
                      <strong>{language === 'th' ? `ปักแล้ว ${totalPinnedTopTitles} เรื่อง` : `${totalPinnedTopTitles} titles pinned`}</strong>
                      <span>{TOP_SECTION_COPY.emptyHint[language]}</span>
                    </div>
                    <div className="profile-top-sections structured compact">
                      {topSections.map((section) => (
                        <section key={section.typeId} className="profile-top-block">
                          <div className="profile-subheading profile-top-block-heading">
                            <div>
                              <span>{getTypeLabel(section.typeId)}</span>
                              <p>{TOP_SECTION_COPY.sectionHint[language]}</p>
                            </div>
                            <strong>{section.titles.length} / 5</strong>
                          </div>
                          {section.titles.length > 0 ? (
                            <div className="profile-top-list">
                              {section.titles.map((title) => (
                                <div
                                  key={title.id}
                                  className={`profile-top-item shelf ${dragState.typeId === section.typeId && dragState.fromIndex === title._rank - 1 ? 'is-dragging' : ''} ${dragState.typeId === section.typeId && dragState.overIndex === title._rank - 1 ? 'is-drop-target' : ''}`}
                                  draggable
                                  onDragStart={() => onDragStartTopTitle(section.typeId, title._rank - 1)}
                                  onDragOver={(event) => onDragOverTopTitle(event, section.typeId, title._rank - 1)}
                                  onDrop={(event) => onDropTopTitle(event, section.typeId, title._rank - 1)}
                                  onDragEnd={onDragEndTopTitle}
                                >
                                  <span className="profile-drag-handle" aria-hidden="true">
                                    <GripVertical size={16} />
                                  </span>
                                  <div className="profile-top-item-copy">
                                    <img src={title.cover} alt="" className="profile-top-item-thumb" />
                                    <div>
                                      {renderRankAdornment(title._rank)}
                                      <strong>{getTitleDisplayName(title)}</strong>
                                      <span>{title._typeLabel}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="profile-empty-state small profile-shelf-empty-card">
                              <Trophy size={18} />
                              <strong>{TOP_SECTION_COPY.sectionEmptyTitle[language]}</strong>
                              <span>{TOP_SECTION_COPY.sectionEmptyHint[language]}</span>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.profileCommentsTitle')}</h2>
                    <p>{t('profile.profileCommentsHint')}</p>
                  </div>
                  <span className="profile-comments-count">{profileComments.length}</span>
                </div>

                <form className="profile-comment-form" onSubmit={submitProfileComment}>
                  <label className="profile-field" htmlFor="profile-comment-input">
                    <span>{t('profile.profileCommentLabel')}</span>
                    <textarea
                      id="profile-comment-input"
                      value={profileCommentDraft}
                      onChange={(event) => {
                        setProfileCommentDraft(event.target.value);
                        setProfileCommentError('');
                        setProfileCommentSuccess('');
                      }}
                      placeholder={t('profile.profileCommentPlaceholder')}
                      maxLength={500}
                      rows={3}
                    />
                    <small className="profile-field-hint">{t('profile.profileCommentHint')}</small>
                  </label>
                  {profileCommentError ? <p className="profile-field-error">{profileCommentError}</p> : null}
                  {profileCommentSuccess ? <p className="profile-field-success">{profileCommentSuccess}</p> : null}
                  <Button type="submit" icon={isSubmittingProfileComment ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />} disabled={isSubmittingProfileComment}>
                    {isSubmittingProfileComment ? t('profile.profileCommentPosting') : t('profile.profileCommentPost')}
                  </Button>
                </form>

                {isProfileCommentsLoading ? (
                  <div className="profile-empty-state">
                    <Loader2 size={20} className="animate-spin" />
                    <span>{t('profile.profileCommentsLoading')}</span>
                  </div>
                ) : profileComments.length > 0 ? (
                  <div className="profile-comment-list">
                    {profileComments.map((entry) => {
                      const author = entry.author_profile || {};
                      const authorName = author.name || author.username || t('profile.publicCommentAnonymous');
                      const authorInitial = authorName.charAt(0).toUpperCase();
                      return (
                        <article key={entry.id} className="profile-comment-item">
                          <div className="profile-comment-avatar-wrap">
                            {author.avatar_url ? (
                              <img src={author.avatar_url} alt="" className="profile-comment-avatar" />
                            ) : (
                              <div className="profile-comment-avatar profile-comment-avatar-fallback">{authorInitial}</div>
                            )}
                          </div>
                          <div className="profile-comment-copy">
                            <div className="profile-comment-meta">
                              <strong>{authorName}</strong>
                              <span>{formatCommentDate(entry.created_at, locale)}</span>
                            </div>
                            <p>{entry.comment_body}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={deletingCommentId === entry.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            onClick={() => deleteProfileComment(entry.id)}
                            disabled={deletingCommentId === entry.id}
                          >
                            {t('profile.profileCommentDelete')}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="profile-empty-state">
                    <span>{t('profile.profileCommentsEmpty')}</span>
                  </div>
                )}
              </article>

            </div>
          ) : (
            <div className="profile-content-grid">
              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.shareProfileTitle')}</h2>
                    <p>{t('profile.shareProfileHint')}</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <label className="profile-field">
                    <span>{t('profile.shareUsernameLabel')}</span>
                    <input
                      type="text"
                      value={shareForm.username}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, username: normalizeUsername(event.target.value) }));
                      }}
                      placeholder="mood_reader"
                      maxLength={20}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <small className="profile-field-hint">{t('profile.shareUsernameHint')}</small>
                  </label>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={shareForm.isProfilePublic}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, isProfilePublic: event.target.checked }));
                      }}
                    />
                    <span>{t('profile.sharePublicToggle')}</span>
                  </label>

                  <label className="profile-switch">
                    <input
                      type="checkbox"
                      checked={shareForm.allowProfileComments}
                      onChange={(event) => {
                        setShareError('');
                        setShareSuccess('');
                        setShareForm((current) => ({ ...current, allowProfileComments: event.target.checked }));
                      }}
                    />
                    <span>{t('profile.shareCommentsToggle')}</span>
                  </label>

                  <div className="profile-share-link-preview">
                    <span>{t('profile.shareLinkLabel')}</span>
                    <code>{sharePath || t('profile.shareLinkPlaceholder')}</code>
                  </div>

                  {shareError && <p className="profile-field-error">{shareError}</p>}
                  {shareSuccess && <p className="profile-field-success">{shareSuccess}</p>}
                </div>

                <div className="profile-actions-row">
                  <Button
                    icon={isSavingShare ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    onClick={saveShareSettings}
                    disabled={isSavingShare || isSharingProfile}
                  >
                    {isSavingShare ? t('profile.saving') : t('profile.shareSaveButton')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={isSharingProfile ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                    onClick={shareProfile}
                    disabled={isSharingProfile || isSavingShare}
                  >
                    {isSharingProfile ? t('profile.saving') : t('profile.shareNow')}
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<Copy size={16} />}
                    onClick={async () => {
                      try {
                        await copyShareUrl();
                        setShareSuccess(t('profile.shareCopied'));
                        setShareError('');
                        toast.success(t('profile.shareCopied'));
                      } catch {
                        setShareError(t('profile.shareFailed'));
                      }
                    }}
                    disabled={!shareUrl || isSharingProfile}
                  >
                    {t('profile.copyLink')}
                  </Button>
                  {sharePath && (
                    <Link to={sharePath} className="profile-inline-link profile-share-open-link" target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      <span>{t('profile.openPublicProfile')}</span>
                    </Link>
                  )}
                </div>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.preferences')}</h2>
                    <p>{t('profile.profileFallbackBio')}</p>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <User size={14} />
                      <span>{language === 'th' ? 'เกี่ยวกับคุณ' : 'About You'}</span>
                    </div>
                    <label className="profile-field">
                      <span>{t('profile.bio')}</span>
                      <textarea
                        value={prefsDraft.bio}
                        onChange={(event) => setPrefs((current) => ({ ...current, bio: event.target.value }))}
                        placeholder={t('profile.bioPlaceholder')}
                        rows={4}
                      />
                    </label>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'มูดที่ชอบ' : 'Favorite moods'}</span>
                      <div className="profile-chip-group">
                        {MOODS.map((mood) => (
                          <button
                            key={mood.id}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.favoriteMoods.includes(mood.id) ? 'active' : ''}`}
                            onClick={() => toggleArray('favoriteMoods', mood.id, MOODS.map((item) => item.id))}
                          >
                            <span>{mood.icon}</span>
                            <span>{getLocalizedMoodName(mood, language)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <Sliders size={14} />
                      <span>{language === 'th' ? 'ตัวกรองการแนะนำ' : 'Recommendation Filters'}</span>
                    </div>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'ประเภท' : 'Recommendation type'}</span>
                      <div className="profile-chip-group">
                        {RECOMMENDATION_TYPE_OPTIONS.map((typeId) => (
                          <button
                            key={typeId}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.recommendationTypes.includes(typeId) ? 'active' : ''}`}
                            onClick={() => toggleArray('recommendationTypes', typeId, RECOMMENDATION_TYPE_OPTIONS)}
                          >
                            {getTypeLabel(typeId)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="profile-field">
                      <span>{language === 'th' ? 'สถานะความคืบหน้า' : 'Progress states'}</span>
                      <div className="profile-chip-group">
                        {RECOMMENDATION_PROGRESS_STATE_OPTIONS.map((stateId) => (
                          <button
                            key={stateId}
                            type="button"
                            className={`profile-chip-btn ${prefsDraft.recommendationProgressStates.includes(stateId) ? 'active' : ''}`}
                            onClick={() => toggleArray('recommendationProgressStates', stateId, RECOMMENDATION_PROGRESS_STATE_OPTIONS)}
                          >
                            {getLocalizedLabel(LIST_STATUS_OPTIONS.find((option) => option.id === stateId), language) || PROGRESS_LABELS[stateId]?.[language] || stateId}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="profile-field dual">
                      <label>
                        <span>{language === 'th' ? 'คะแนนขั้นต่ำ' : 'Minimum score'}</span>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={prefsDraft.minRecommendationScore}
                          onChange={(event) => setPrefs((current) => ({ ...current, minRecommendationScore: Number(event.target.value) }))}
                        />
                        <strong>{prefsDraft.minRecommendationScore}/10</strong>
                      </label>
                      <label>
                        <span>{language === 'th' ? 'ความยาว' : 'Length'}</span>
                        <select
                          value={prefsDraft.recommendationLength}
                          onChange={(event) => setPrefs((current) => ({ ...current, recommendationLength: event.target.value }))}
                        >
                          {RECOMMENDATION_LENGTH_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {LENGTH_LABELS[option]?.[language] || option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="profile-settings-group">
                    <div className="profile-settings-group-label">
                      <ToggleLeft size={14} />
                      <span>{language === 'th' ? 'การตั้งค่าด่วน' : 'Quick Settings'}</span>
                    </div>
                    <div className="profile-toggle-list">
                      {[
                        ['hideSeenByDefault', t('home.hideSeenTitles')],
                        ['prioritizeUnseen', language === 'th' ? 'จัดลำดับที่ยังไม่ดูก่อน' : 'Prioritize unseen titles'],
                        ['excludeCompletedFromRecs', language === 'th' ? 'ไม่แนะนำที่ดูจบแล้ว' : 'Exclude completed titles'],
                        ['excludeDroppedFromRecs', language === 'th' ? 'ไม่แนะนำที่ดรอปแล้ว' : 'Exclude dropped titles'],
                        ['hideAdultContent', language === 'th' ? 'ซ่อนเนื้อหาสำหรับผู้ใหญ่' : 'Hide adult content'],
                        ['forceUnseenOnly', language === 'th' ? 'แนะนำแต่ที่ยังไม่ดูเท่านั้น' : 'Force unseen only'],
                      ].map(([key, label]) => (
                        <label key={key} className="profile-switch">
                          <input
                            type="checkbox"
                            checked={prefsDraft[key]}
                            onChange={(event) => setPrefs((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="profile-actions-row">
                  <Button icon={isSavingPrefs ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} onClick={savePrefs} disabled={!prefsDirty || isSavingPrefs}>
                    {isSavingPrefs ? t('profile.saving') : t('profile.savePreferences')}
                  </Button>
                  <Button variant="secondary" icon={isRebuilding ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} onClick={rebuildRecommendations} disabled={isRebuilding}>
                    {t('profile.recommendationActions')}
                  </Button>
                </div>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.hiddenTitles')}</h2>
                    <p>{t('profile.hiddenTitlesCount', { count: hiddenTitles.length })}</p>
                  </div>
                  {selectedHidden.length > 0 && (
                    <Button variant="secondary" size="sm" onClick={bulkUnhide} disabled={isBulkUnhiding}>
                      {isBulkUnhiding ? t('profile.unhiding') : t('profile.bulkUnhide', { count: selectedHidden.length })}
                    </Button>
                  )}
                </div>
                {hiddenTitles.length > 0 ? (
                  <>
                    <div className="profile-hidden-grid">
                      {pagedHiddenTitles.map((title) => {
                        const entry = getHiddenEntry(title.id);
                        const isSelected = selectedHidden.includes(title.id);

                        return (
                          <div key={title.id} className="profile-hidden-card">
                            <label className="profile-check-row">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) => {
                                  setSelectedHidden((current) => (
                                    event.target.checked
                                      ? [...current, title.id]
                                      : current.filter((id) => id !== title.id)
                                  ));
                                }}
                              />
                              <span>{getTitleDisplayName(title)}</span>
                            </label>
                            <div className="profile-hidden-actions">
                              <button type="button" className={`profile-chip-btn ${entry?.hideFromRecommendations ? 'active' : ''}`} onClick={() => toggleHiddenScope(title.id, 'recommendations')}>
                                <EyeOff size={14} />
                                <span>Recs</span>
                              </button>
                              <button type="button" className={`profile-chip-btn ${entry?.hideFromDiscovery ? 'active' : ''}`} onClick={() => toggleHiddenScope(title.id, 'discovery')}>
                                <Grid size={14} />
                                <span>Discover</span>
                              </button>
                              <Button variant="ghost" size="sm" onClick={() => unhideTitle(title.id)}>
                                {t('profile.unhide')}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hiddenPages > 1 && (
                      <div className="profile-pagination">
                        <Button variant="ghost" size="sm" onClick={() => setHiddenPage((page) => Math.max(1, page - 1))} disabled={hiddenPage <= 1}>
                          {t('common.previous')}
                        </Button>
                        <span>{t('profile.pageIndicator', { page: hiddenPage, total: hiddenPages })}</span>
                        <Button variant="ghost" size="sm" onClick={() => setHiddenPage((page) => Math.min(hiddenPages, page + 1))} disabled={hiddenPage >= hiddenPages}>
                          {t('common.next')}
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="profile-empty-state">
                    <span>{t('profile.noHiddenTitles')}</span>
                  </div>
                )}
              </article>

              <article className="profile-section-card">
                <div className="profile-section-heading">
                  <div>
                    <h2>{t('profile.accountBasics')}</h2>
                    <p>{t('profile.theme')}</p>
                  </div>
                </div>

                <div className="profile-account-grid">
                  <div className="profile-account-item">
                    <span>{t('profile.theme')}</span>
                    <strong>{theme === 'dark' ? 'Dark' : 'Light'}</strong>
                  </div>
                  <div className="profile-account-item">
                    <span>{t('profile.role')}</span>
                    <strong>{profile.role || 'member'}</strong>
                  </div>
                  <div className="profile-account-item">
                    <span>{t('profile.joined')}</span>
                    <strong>{formatDate(profile.created_at || user?.created_at, locale)}</strong>
                  </div>
                </div>

                <div className="profile-actions-row">
                  <Button
                    variant="secondary"
                    icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    onClick={toggleTheme}
                  >
                    {t('profile.toggleTheme')}
                  </Button>
                  <Button variant="ghost" onClick={() => setIsEditOpen(true)} icon={<Edit2 size={16} />}>
                    {t('profile.editProfile')}
                  </Button>
                </div>
              </article>
            </div>
          )}
        </div>
      </section>

      {isEditOpen && (
        <div className="profile-modal-backdrop" onClick={() => setIsEditOpen(false)}>
          <div className="profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-modal-header">
              <div>
                <h2>{t('profile.editProfile')}</h2>
                <p>{t('profile.editProfileModalDesc')}</p>
              </div>
              <button type="button" className="profile-modal-close" onClick={() => setIsEditOpen(false)} aria-label={t('common.close')}>
                <X size={18} />
              </button>
            </div>

            <div className="profile-form-grid">
              <label className="profile-field">
                <span>{t('profile.displayName')}</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={t('profile.displayNamePlaceholder')}
                />
              </label>

              <label className="profile-field">
                <span>{t('profile.avatarUrl')}</span>
                <input
                  type="url"
                  value={form.avatarUrl}
                  onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </label>

              <label className="profile-field">
                <span>{t('profile.orUploadAvatar')}</span>
                <input type="file" accept="image/*" onChange={uploadAvatar} disabled={isUploadingAvatar} />
              </label>

              <label className="profile-field">
                <span>{t('profile.bio')}</span>
                <textarea
                  value={prefsDraft.bio}
                  onChange={(event) => setPrefs((current) => ({ ...current, bio: event.target.value }))}
                  placeholder={t('profile.bioPlaceholder')}
                  rows={4}
                />
              </label>
            </div>

            <div className="profile-actions-row">
              <Button variant="ghost" onClick={() => setIsEditOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                icon={isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                onClick={saveProfile}
                disabled={isSavingProfile || isUploadingAvatar}
              >
                {isSavingProfile ? t('profile.savingProfile') : t('profile.saveProfile')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
